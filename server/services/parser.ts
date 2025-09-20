import { logger } from "./logger";

export interface ParsedJobData {
  location?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  jobType?: string;
  techsNeeded?: number;
}

export class EmailParser {
  /**
   * Parse job details from email body text
   * This is a basic implementation that can be enhanced with more sophisticated parsing logic
   */
  static parseJobDetails(emailBody: string, subject: string): ParsedJobData {
    const parsed: ParsedJobData = {};
    
    try {
      // Parse location - look for common location indicators
      const locationPatterns = [
        /(?:at|@)\s+([A-Za-z\s]+(?:Refinery|Plant|Site|Facility|Center))/i,
        /location[:\s]+([A-Za-z\s]+)/i,
        /site[:\s]+([A-Za-z\s]+)/i,
      ];
      
      for (const pattern of locationPatterns) {
        const match = emailBody.match(pattern);
        if (match) {
          parsed.location = match[1].trim();
          break;
        }
      }
      
      // Parse date - look for date patterns
      const datePatterns = [
        /(?:on|date)\s+([A-Za-z]+\s+\d{1,2})/i,
        /(\d{1,2}\/\d{1,2}\/\d{4})/,
        /(\d{1,2}-\d{1,2}-\d{4})/,
      ];
      
      for (const pattern of datePatterns) {
        const match = emailBody.match(pattern);
        if (match) {
          parsed.scheduledDate = match[1].trim();
          break;
        }
      }
      
      // Parse time - look for time patterns
      const timePatterns = [
        /(\d{1,2}:\d{2}\s*(?:am|pm))/i,
        /(\d{1,2}\s*(?:am|pm))/i,
      ];
      
      for (const pattern of timePatterns) {
        const match = emailBody.match(pattern);
        if (match) {
          parsed.scheduledTime = match[1].trim();
          break;
        }
      }
      
      // Parse number of technicians needed
      const techPatterns = [
        /(\d+)\s+techs?/i,
        /(\d+)\s+technicians?/i,
        /need\s+(\d+)/i,
      ];
      
      for (const pattern of techPatterns) {
        const match = emailBody.match(pattern);
        if (match) {
          parsed.techsNeeded = parseInt(match[1]);
          break;
        }
      }
      
      // Parse job type from subject or body
      const jobTypePatterns = [
        /(?:NDT|inspection|maintenance|repair|service)/i,
        /(?:rope access|UT|ultrasonic)/i,
      ];
      
      const fullText = `${subject} ${emailBody}`;
      for (const pattern of jobTypePatterns) {
        const match = fullText.match(pattern);
        if (match) {
          parsed.jobType = match[0].toLowerCase();
          break;
        }
      }
      
      logger.info("Email parsed successfully", { parsed });
      
    } catch (error) {
      logger.error("Error parsing email", { error });
    }
    
    return parsed;
  }
}
