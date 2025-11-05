import { google, docs_v1, drive_v3 } from 'googleapis';
import { readFileSync } from 'fs';
import { logger } from './logger';

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
  private isConfigured = false;

  constructor() {
    this.initialize();
  }

  private initialize() {
    try {
      const serviceAccountPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH;
      
      if (!serviceAccountPath) {
        logger.warn("Google Docs service not configured: GOOGLE_SERVICE_ACCOUNT_PATH not set");
        return;
      }

      const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
      
      const auth = new google.auth.GoogleAuth({
        credentials: serviceAccount,
        scopes: [
          'https://www.googleapis.com/auth/documents',
          'https://www.googleapis.com/auth/drive',
        ],
        clientOptions: {
          subject: process.env.GOOGLE_IMPERSONATION_EMAIL || 'nate@n8ai.io'
        }
      });

      this.docs = google.docs({ version: 'v1', auth });
      this.drive = google.drive({ version: 'v3', auth });
      this.isConfigured = true;
      
      logger.info("Google Docs service initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize Google Docs service", { error });
      this.isConfigured = false;
    }
  }

  /**
   * Create a new Google Doc for a job with structured scope information
   */
  async createJobDocument(jobId: string, jobData: JobDocumentData): Promise<DocumentResult> {
    if (!this.isConfigured || !this.docs || !this.drive) {
      throw new Error("Google Docs service not configured");
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

      // Move document to the specified folder
      const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
      if (folderId) {
        try {
          // Get current parents to remove them
          const file = await this.drive.files.get({
            fileId: docId,
            fields: 'parents',
            supportsAllDrives: true,
          });
          
          const previousParents = file.data.parents?.join(',') || '';
          
          // Move file to new folder by adding new parent and removing old ones
          await this.drive.files.update({
            fileId: docId,
            addParents: folderId,
            removeParents: previousParents,
            fields: 'id, parents',
            supportsAllDrives: true,
          });
          
          logger.info("Document moved to folder", { docId, folderId });
        } catch (folderError) {
          // Log the error but don't fail the whole operation
          logger.warn("Could not move document to folder, document created in root", { 
            docId, 
            folderId,
            error: folderError instanceof Error ? folderError.message : String(folderError)
          });
        }
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
