import { google, docs_v1, drive_v3 } from 'googleapis';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { logger } from './logger';
import { OAuth2Client } from 'google-auth-library';

export interface JobDocumentData {
  clientEmail: string;
  subject: string;
  location?: string | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  jobType?: string | null;
  techsNeeded?: number | null;
  bodyPlain: string;
}

export interface DocumentResult {
  docId: string;
  docUrl: string;
}

class GoogleDocsService {
  private docs: docs_v1.Docs | null = null;
  private drive: drive_v3.Drive | null = null;
  private oauth2Client: OAuth2Client | null = null;
  private isConfigured = false;
  private authUrl: string | null = null;

  constructor() {
    this.initialize();
  }

  private initialize() {
    try {
      const credentialsPath = process.env.GOOGLE_OAUTH_CREDENTIALS_PATH;
      const tokenPath = process.env.GOOGLE_OAUTH_TOKEN_PATH || './google-docs-token.json';
      
      if (!credentialsPath) {
        logger.warn("Google Docs service not configured: GOOGLE_OAUTH_CREDENTIALS_PATH not set");
        return;
      }

      // Read OAuth2 credentials
      const credentials = JSON.parse(readFileSync(credentialsPath, 'utf8'));
      const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;

      // Create OAuth2 client
      this.oauth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0]
      );

      // Check if we have a stored token
      if (existsSync(tokenPath)) {
        const token = JSON.parse(readFileSync(tokenPath, 'utf8'));
        this.oauth2Client.setCredentials(token);
        
        // Set up automatic token refresh
        this.oauth2Client.on('tokens', (tokens) => {
          try {
            let currentTokens: any = {};
            
            // Try to read existing tokens, but don't fail if file doesn't exist
            if (existsSync(tokenPath)) {
              try {
                currentTokens = JSON.parse(readFileSync(tokenPath, 'utf8'));
              } catch (parseError) {
                logger.warn("Failed to parse existing token file, will overwrite", { error: parseError });
              }
            }
            
            // Update tokens
            if (tokens.refresh_token) {
              currentTokens.refresh_token = tokens.refresh_token;
            }
            currentTokens.access_token = tokens.access_token;
            if (tokens.expiry_date) {
              currentTokens.expiry_date = tokens.expiry_date;
            }
            
            // Write updated tokens
            writeFileSync(tokenPath, JSON.stringify(currentTokens, null, 2));
            logger.info("OAuth tokens refreshed successfully");
          } catch (error) {
            logger.error("Failed to update OAuth tokens", { error });
          }
        });

        this.docs = google.docs({ version: 'v1', auth: this.oauth2Client });
        this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });
        this.isConfigured = true;
        
        logger.info("Google Docs service initialized with OAuth2");
      } else {
        // Generate authorization URL for first-time setup
        this.authUrl = this.oauth2Client.generateAuthUrl({
          access_type: 'offline',
          scope: [
            'https://www.googleapis.com/auth/documents',
            'https://www.googleapis.com/auth/drive.file',
          ],
        });
        
        logger.warn("Google Docs OAuth not authorized. Please visit the authorization URL.", {
          authUrl: this.authUrl,
          tokenPath
        });
        logger.warn(`Authorization URL: ${this.authUrl}`);
      }
    } catch (error) {
      logger.error("Failed to initialize Google Docs service", { error });
      this.isConfigured = false;
    }
  }

  /**
   * Complete OAuth authorization with the code from the redirect
   */
  async authorize(code: string): Promise<void> {
    if (!this.oauth2Client) {
      throw new Error("OAuth client not initialized");
    }

    const tokenPath = process.env.GOOGLE_OAUTH_TOKEN_PATH || './google-docs-token.json';

    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      this.oauth2Client.setCredentials(tokens);
      
      // Save tokens to file
      writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
      
      this.docs = google.docs({ version: 'v1', auth: this.oauth2Client });
      this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });
      this.isConfigured = true;
      this.authUrl = null; // Clear the auth URL after successful authorization
      
      logger.info("Google Docs OAuth authorization successful");
    } catch (error) {
      logger.error("Failed to complete OAuth authorization", { error });
      throw error;
    }
  }

  /**
   * Get the OAuth authorization URL (if not yet authorized)
   */
  getAuthUrl(): string | null {
    return this.authUrl;
  }

  /**
   * Check if the service is configured and authorized
   */
  isAuthorized(): boolean {
    return this.isConfigured;
  }

  /**
   * Create a new Google Doc for a job with structured scope information
   */
  async createJobDocument(jobId: string, jobData: JobDocumentData): Promise<DocumentResult> {
    if (!this.isConfigured || !this.docs || !this.drive) {
      throw new Error("Google Docs service not configured or not authorized");
    }

    try {
      const timestamp = new Date().toISOString();
      const clientName = this.extractClientName(jobData.clientEmail);
      const dateStr = jobData.scheduledDate || new Date().toLocaleDateString();
      
      const title = `Job Scope - ${clientName} - ${dateStr}`;

      // Create the document
      const createResponse = await this.docs.documents.create({
        requestBody: {
          title,
        },
      });

      const docId = createResponse.data.documentId!;
      const docUrl = `https://docs.google.com/document/d/${docId}/edit`;

      // Move document to the specified folder (optional)
      const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
      if (folderId) {
        await this.drive.files.update({
          fileId: docId,
          addParents: folderId,
          fields: 'id, parents',
        });
      }

      // Set document permissions to "anyone with link can view"
      await this.drive.permissions.create({
        fileId: docId,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
      });

      // Build the document content
      const content = this.buildDocumentContent(jobId, jobData, timestamp);

      // Insert content into the document
      await this.docs.documents.batchUpdate({
        documentId: docId,
        requestBody: {
          requests: [
            {
              insertText: {
                location: { index: 1 },
                text: content,
              },
            },
          ],
        },
      });

      logger.info("Google Doc created", { jobId, docId, docUrl });

      return { docId, docUrl };
    } catch (error) {
      logger.error("Failed to create Google Doc", { jobId, error });
      throw error;
    }
  }

  /**
   * Update an existing Google Doc with new content
   */
  async updateJobDocument(docId: string, content: string): Promise<void> {
    if (!this.isConfigured || !this.docs) {
      throw new Error("Google Docs service not configured");
    }

    try {
      // Get current document to find the end index
      const doc = await this.docs.documents.get({ documentId: docId });
      const endIndex = doc.data.body?.content?.[0]?.endIndex || 1;

      // Append new content at the end
      await this.docs.documents.batchUpdate({
        documentId: docId,
        requestBody: {
          requests: [
            {
              insertText: {
                location: { index: endIndex - 1 },
                text: '\n\n' + content,
              },
            },
          ],
        },
      });

      logger.info("Google Doc updated", { docId });
    } catch (error) {
      logger.error("Failed to update Google Doc", { docId, error });
      throw error;
    }
  }

  /**
   * Get the content of a Google Doc
   */
  async getDocumentContent(docId: string): Promise<string> {
    if (!this.isConfigured || !this.docs) {
      throw new Error("Google Docs service not configured");
    }

    try {
      const doc = await this.docs.documents.get({ documentId: docId });
      
      let text = '';
      const content = doc.data.body?.content || [];
      
      for (const element of content) {
        if (element.paragraph) {
          for (const textElement of element.paragraph.elements || []) {
            if (textElement.textRun?.content) {
              text += textElement.textRun.content;
            }
          }
        }
      }

      return text;
    } catch (error) {
      logger.error("Failed to get document content", { docId, error });
      throw error;
    }
  }

  /**
   * Extract client name from email address
   */
  private extractClientName(email: string): string {
    const localPart = email.split('@')[0];
    return localPart
      .split(/[._-]/)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  /**
   * Build the structured document content
   */
  private buildDocumentContent(jobId: string, jobData: JobDocumentData, timestamp: string): string {
    const requirements = this.extractRequirements(jobData.bodyPlain);
    const questions = this.extractOpenQuestions(jobData.bodyPlain);

    return `===================================
JOB SCOPE DOCUMENT
===================================

Job ID: ${jobId}
Created: ${timestamp}
Last Updated: ${timestamp}
Status: pending

-----------------------------------
CLIENT INFORMATION
-----------------------------------

Company: ${this.extractCompany(jobData.clientEmail)}
Contact: TBD
Email: ${jobData.clientEmail}

-----------------------------------
CONFIRMED SCOPE
-----------------------------------

Location: ${jobData.location || 'TBD'}
Date: ${jobData.scheduledDate || 'TBD'}
Time: ${jobData.scheduledTime || 'TBD'}
Job Type: ${jobData.jobType || 'TBD'}
Technicians Required: ${jobData.techsNeeded || 'TBD'}
Duration: TBD

Specific Requirements:
${requirements.length > 0 ? requirements.map(r => `• ${r}`).join('\n') : '• TBD'}

-----------------------------------
OPEN QUESTIONS
-----------------------------------

${questions.length > 0 ? questions.map(q => `• ${q}`).join('\n') : '• None at this time'}

-----------------------------------
QUOTE / PRICING
-----------------------------------

Rate: Not yet provided
Estimated Total: TBD
Payment Terms: TBD

-----------------------------------
ASSIGNED TECHNICIANS
-----------------------------------

Lead Tech: TBD
Additional Techs: TBD

-----------------------------------
ACTION ITEMS
-----------------------------------

Our side:
• Review job requirements
• Match qualified technicians
• Provide quote

Client side:
• Provide any additional details needed
• Confirm scope and timing

-----------------------------------
NOTES
-----------------------------------

Initial job request received and processed.

-----------------------------------
CONVERSATION SUMMARY
-----------------------------------

Initial request received ${new Date(timestamp).toLocaleDateString()}. Job details extracted and scope document created.

-----------------------------------
ORIGINAL EMAIL
-----------------------------------

Subject: ${jobData.subject}

${jobData.bodyPlain}
`;
  }

  /**
   * Extract company name from email domain
   */
  private extractCompany(email: string): string {
    const domain = email.split('@')[1];
    if (!domain) return 'TBD';
    
    const company = domain.split('.')[0];
    return company.charAt(0).toUpperCase() + company.slice(1);
  }

  /**
   * Extract requirements from email body
   */
  private extractRequirements(body: string): string[] {
    const requirements: string[] = [];
    const lines = body.toLowerCase().split('\n');

    // Look for common requirement patterns
    for (const line of lines) {
      if (
        line.includes('certification') ||
        line.includes('certified') ||
        line.includes('clearance') ||
        line.includes('required') ||
        line.includes('must have') ||
        line.includes('need')
      ) {
        const cleaned = line.trim();
        if (cleaned.length > 10 && cleaned.length < 200) {
          requirements.push(cleaned.charAt(0).toUpperCase() + cleaned.slice(1));
        }
      }
    }

    return requirements.slice(0, 5); // Limit to 5 requirements
  }

  /**
   * Extract open questions from email body
   */
  private extractOpenQuestions(body: string): string[] {
    const questions: string[] = [];
    const lines = body.split('\n');

    for (const line of lines) {
      if (line.includes('?')) {
        const cleaned = line.trim();
        if (cleaned.length > 10 && cleaned.length < 200) {
          questions.push(cleaned);
        }
      }
    }

    return questions.slice(0, 3); // Limit to 3 questions
  }
}

// Export singleton instance
export const googleDocsService = new GoogleDocsService();
