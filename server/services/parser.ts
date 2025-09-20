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
   * Enhanced with comprehensive patterns for extracting client, date, time, techs, and job type
   */
  static parseJobDetails(emailBody: string, subject: string): ParsedJobData {
    const parsed: ParsedJobData = {};
    
    try {
      // Parse client/location - enhanced patterns for company names and facilities
      const locationPatterns = [
        /(?:at|@)\s+([A-Za-z]+(?:\s+[A-Za-z]+)*(?:\s+(?:Refinery|Plant|Site|Facility|Center|Building|Complex|Terminal|Station|Factory|Depot|Yard)(?:\s+\w+)?)?)/i,
        /(?:location|site|facility|plant|client)[:\s]+([A-Za-z]+(?:\s+[A-Za-z]+)*)/i,
        /(?:we|you)\s+need.+?(?:at|@)\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)/i,
        /(?:Chevron|Shell|BP|Exxon|Total|Mobil|Phillips|Marathon|Valero|Conoco|Citgo|Sunoco)(?:\s+[A-Za-z]+)*/i
      ];
      
      for (const pattern of locationPatterns) {
        const match = emailBody.match(pattern);
        if (match) {
          parsed.location = match[1] ? match[1].trim() : match[0].trim();
          // Clean up common suffixes that might be over-captured
          parsed.location = parsed.location.replace(/\s+(on|for|,|\.|;).*$/i, '');
          break;
        }
      }
      
      // Parse date - enhanced patterns for various date formats
      const datePatterns = [
        /(?:on|date|scheduled for|scheduled on)\s+([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?)/i,
        /(?:on|date)\s+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/,
        /(?:on|date)\s+(\d{1,2}-\d{1,2}(?:-\d{2,4})?)/,
        /(?:on|date)\s+(\d{1,2}\.\d{1,2}(?:\.\d{2,4})?)/,
        /([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?)/i, // Sept 23, March 15th, etc.
      ];
      
      for (const pattern of datePatterns) {
        const match = emailBody.match(pattern);
        if (match) {
          parsed.scheduledDate = match[1].trim();
          // Remove ordinal suffixes for cleaner storage
          parsed.scheduledDate = parsed.scheduledDate.replace(/(\d+)(?:st|nd|rd|th)/i, '$1');
          break;
        }
      }
      
      // Parse time - enhanced patterns for various time formats
      const timePatterns = [
        /(\d{1,2}:\d{2}\s*(?:am|pm))/i,
        /(\d{1,2}:\d{2})/,
        /(\d{1,2}\s*(?:am|pm))/i,
        /(?:at|time)\s+(\d{1,2}:\d{2}\s*(?:am|pm)?)/i,
        /(?:at|time)\s+(\d{1,2}\s*(?:am|pm))/i,
      ];
      
      for (const pattern of timePatterns) {
        const match = emailBody.match(pattern);
        if (match) {
          parsed.scheduledTime = match[1].trim().toLowerCase();
          break;
        }
      }
      
      // Parse number of technicians - enhanced patterns
      const techPatterns = [
        /(?:we need|need|require|request)\s+(\d+)\s+(?:techs?|technicians?|workers?|people?|personnel)/i,
        /(\d+)\s+(?:techs?|technicians?|workers?|certified|qualified)/i,
        /(?:send|assign|dispatch)\s+(\d+)/i,
        /(\d+)\s+(?:techs?|technicians?)/i,
      ];
      
      for (const pattern of techPatterns) {
        const match = emailBody.match(pattern);
        if (match) {
          const num = parseInt(match[1]);
          if (num > 0 && num <= 50) { // Reasonable validation range
            parsed.techsNeeded = num;
            break;
          }
        }
      }
      
      // Parse job type - enhanced patterns for various job types
      const jobTypePatterns = [
        /(?:for\s+(?:a\s+)?)((?:rope access\s+)?(?:UT|ultrasonic|NDT|non-destructive|radiographic|magnetic particle|liquid penetrant|visual)\s+(?:testing|inspection|examination))/i,
        /(?:for\s+(?:a\s+)?)((?:welding|piping|structural|mechanical|electrical|maintenance|repair|installation|commissioning)\s+(?:work|inspection|service|repair))/i,
        /(?:for\s+(?:a\s+)?)(rope access\s+[A-Za-z\s]+)/i,
        /(NDT|UT|ultrasonic|radiographic|RT|MT|magnetic particle|PT|liquid penetrant|VT|visual testing)/i,
        /(welding|pipe welding|structural welding|maintenance|repair|installation|commissioning|inspection)/i,
      ];
      
      const fullText = `${subject} ${emailBody}`;
      for (const pattern of jobTypePatterns) {
        const match = fullText.match(pattern);
        if (match) {
          parsed.jobType = match[1] ? match[1].trim().toLowerCase() : match[0].trim().toLowerCase();
          // Clean up extra spaces
          parsed.jobType = parsed.jobType.replace(/\s+/g, ' ');
          break;
        }
      }
      
      // Log parsing results
      const fieldsFound = Object.keys(parsed).filter(key => parsed[key as keyof ParsedJobData] !== undefined);
      logger.info("Email parsed successfully", { 
        parsed,
        fieldsExtracted: fieldsFound.length,
        fields: fieldsFound
      });
      
      // Log warnings for missing critical fields
      if (!parsed.location) {
        logger.warn("Could not extract client/location from email", { emailBody: emailBody.substring(0, 200) });
      }
      if (!parsed.scheduledDate) {
        logger.warn("Could not extract job date from email", { emailBody: emailBody.substring(0, 200) });
      }
      if (!parsed.techsNeeded) {
        logger.warn("Could not extract number of techs needed from email", { emailBody: emailBody.substring(0, 200) });
      }
      
    } catch (error) {
      logger.error("Error parsing email", { error, emailBody: emailBody.substring(0, 200) });
    }
    
    return parsed;
  }
}
