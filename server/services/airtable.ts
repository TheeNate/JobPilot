import { logger } from "./logger";
import { claudeMatchingService } from "./claude-matching";

// Airtable API response interfaces
export interface AirtableRecord<T = any> {
  id: string;
  fields: T;
  createdTime: string;
}

export interface AirtableResponse<T = any> {
  records: AirtableRecord<T>[];
  offset?: string;
}

export interface AirtableError {
  type: string;
  message: string;
}

// Technician data interfaces
export interface TechnicianFields {
  Name: string;
  Status: "Active" | "Inactive";
  Certifications: string[];
  "Availability Periods"?: string[]; // Linked records to Availability Periods table
}

export interface AvailabilityFields {
  Technician: string[]; // Array of linked record IDs
  "Period Type": "Available" | "Unavailable" | "Booked";
  "Start Date": string;
  "End Date"?: string;
  Reason?: string;
}

// Rate limiting configuration
interface RateLimiter {
  requests: number;
  resetTime: number;
  maxRequests: number;
  windowMs: number;
}

export class AirtableService {
  private apiKey: string;
  private baseId: string;
  private rateLimiter: RateLimiter;
  private readonly baseUrl = "https://api.airtable.com/v0";

  constructor() {
    this.apiKey = process.env.AIRTABLE_API_KEY || "";
    this.baseId = process.env.AIRTABLE_BASE_ID || "";

    // Initialize rate limiter (5 requests per second)
    const maxRequests = parseInt(process.env.AIRTABLE_RATE_LIMIT_RPM || "300"); // 5 req/sec = 300/min
    this.rateLimiter = {
      requests: 0,
      resetTime: Date.now() + 60000, // 1 minute window
      maxRequests,
      windowMs: 60000,
    };

    if (!this.apiKey || !this.baseId) {
      logger.error("Airtable configuration missing", {
        hasApiKey: !!this.apiKey,
        hasBaseId: !!this.baseId,
      });
    }
  }

  /**
   * Check if Airtable service is properly configured and accessible
   */
  async checkHealth(): Promise<{
    status: "healthy" | "unhealthy";
    message?: string;
    quotaUsed?: number;
    lastConnection?: string;
  }> {
    try {
      if (!this.apiKey || !this.baseId) {
        return {
          status: "unhealthy",
          message: "Missing API key or Base ID configuration",
        };
      }

      // Basic connectivity test - just check if we can authenticate with the base
      return await this.fallbackHealthCheck();
    } catch (error) {
      logger.error("Airtable health check failed", { error });
      return {
        status: "unhealthy",
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Fallback health check that doesn't assume specific table structure
   */
  private async fallbackHealthCheck(): Promise<{
    status: "healthy" | "unhealthy";
    message?: string;
    quotaUsed?: number;
    lastConnection?: string;
  }> {
    try {
      // Try to make a simple authenticated request to the base without specifying table
      const response = await fetch(
        `${this.baseUrl}/${this.baseId}/Technicians`,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (response.ok) {
        return {
          status: "healthy",
          message: "Connection established (limited table access)",
          quotaUsed: this.rateLimiter.requests,
          lastConnection: new Date().toISOString(),
        };
      } else {
        const errorText = await response.text();
        return {
          status: "unhealthy",
          message: `HTTP ${response.status}: ${errorText}`,
        };
      }
    } catch (error) {
      return {
        status: "unhealthy",
        message: `Fallback health check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Get all active technicians from Airtable with graceful error handling
   */
  async getActiveTechnicians(): Promise<AirtableRecord<TechnicianFields>[]> {
    try {
      // Try multiple common table names for technicians - prioritize Scheduler
      const possibleTableNames = [
        "Scheduler", // Primary table name
        "Technicians",
        "Staff",
        "Team Members",
      ];
      const tableNameEnv = process.env.AIRTABLE_TECHNICIANS_TABLE;

      if (tableNameEnv) {
        possibleTableNames.unshift(tableNameEnv);
      }

      for (const tableName of possibleTableNames) {
        try {
          const filterFormula = `{Status} = 'Active'`;
          const fields = [
            "Name",
            "Status",
            "Certifications", // Updated to match schema
          ];

          const response = await this.makeRequest<TechnicianFields>(
            `/${this.baseId}/${encodeURIComponent(tableName)}`,
            {
              filterByFormula: filterFormula,
              fields: fields,
            },
          );

          logger.info(
            `Retrieved active technicians from Airtable table: ${tableName}`,
            {
              count: response.records.length,
            },
          );

          return response.records;
        } catch (tableError) {
          logger.debug(
            `Table '${tableName}' not found or accessible, trying next...`,
            {
              error:
                tableError instanceof Error
                  ? tableError.message
                  : "Unknown error",
            },
          );
          continue;
        }
      }

      // If no tables work, log a warning and return empty array instead of throwing
      logger.warn(
        `No accessible technician table found. Tried: ${possibleTableNames.join(", ")}. Please ensure you have a table with technician data and proper field names.`,
      );
      return [];
    } catch (error) {
      logger.error("Failed to get active technicians", { error });
      // Return empty array instead of throwing to maintain system resilience
      logger.warn("Returning empty technicians list due to error");
      return [];
    }
  }

  /**
   * Get technician availability for a specific date range with graceful error handling
   */
  async getTechnicianAvailability(
    startDate: string,
    endDate?: string,
  ): Promise<AirtableRecord<AvailabilityFields>[]> {
    try {
      const possibleTableNames = [
        "Availability Periods",
        "Availability",
        "Schedule",
        "Calendar",
      ];
      const tableNameEnv = process.env.AIRTABLE_AVAILABILITY_TABLE;

      if (tableNameEnv) {
        possibleTableNames.unshift(tableNameEnv);
      }

      // Build filter formula for date range
      const endDateFilter = endDate
        ? `{Start Date} <= '${endDate}'`
        : `{Start Date} <= '${startDate}'`;
      const filterFormula = `AND(
        ${endDateFilter},
        OR(
          {End Date} >= '${startDate}',
          {End Date} = BLANK()
        )
      )`;

      const fields = [
        "Technician",
        "Period Type",
        "Start Date",
        "End Date",
        "Reason",
      ];

      for (const tableName of possibleTableNames) {
        try {
          const response = await this.makeRequest<AvailabilityFields>(
            `/${this.baseId}/${encodeURIComponent(tableName)}`,
            {
              filterByFormula: filterFormula,
              fields: fields,
            },
          );

          logger.info(
            `Retrieved technician availability from table: ${tableName}`,
            {
              dateRange: { startDate, endDate },
              recordCount: response.records.length,
            },
          );

          return response.records;
        } catch (tableError) {
          logger.debug(
            `Availability table '${tableName}' not found or accessible, trying next...`,
            {
              error:
                tableError instanceof Error
                  ? tableError.message
                  : "Unknown error",
            },
          );
          continue;
        }
      }

      // If no tables work, log a warning and return empty array
      logger.warn(
        `No accessible availability table found. Tried: ${possibleTableNames.join(", ")}.`,
      );
      return [];
    } catch (error) {
      logger.error("Failed to get technician availability", { error });
      // Return empty array instead of throwing to maintain system resilience
      logger.warn("Returning empty availability list due to error");
      return [];
    }
  }

  /**
   * Find available technicians for a specific job date and requirements
   */
  async findAvailableTechnicians(
    jobDate: string,
    jobType?: string,
  ): Promise<
    {
      technician: AirtableRecord<TechnicianFields>;
      availability: AirtableRecord<AvailabilityFields>[];
      matchScore: number;
    }[]
  > {
    try {
      // Get all active technicians and availability data
      const [technicians, availabilityRecords] = await Promise.all([
        this.getActiveTechnicians(),
        this.getTechnicianAvailability(jobDate),
      ]);

      const results: {
        technician: AirtableRecord<TechnicianFields>;
        availability: AirtableRecord<AvailabilityFields>[];
        matchScore: number;
      }[] = [];

      // Process each technician
      for (const technician of technicians) {
        // Find availability records for this technician
        const techAvailability = availabilityRecords.filter((record) =>
          record.fields.Technician?.includes(technician.id),
        );

        // Check if technician is available on the job date
        const isAvailable = this.checkTechnicianAvailability(
          techAvailability,
          jobDate,
        );

        if (isAvailable) {
          // Calculate match score based on certifications
          const matchScore = this.calculateMatchScore(
            technician.fields,
            jobType,
          );

          results.push({
            technician,
            availability: techAvailability,
            matchScore,
          });
        }
      }

      // Sort by match score (highest first)
      results.sort((a, b) => b.matchScore - a.matchScore);

      logger.info("Found available technicians", {
        jobDate,
        jobType,
        totalTechnicians: technicians.length,
        availableTechnicians: results.length,
      });

      return results;
    } catch (error) {
      logger.error("Failed to find available technicians", { error });
      // Return empty results instead of throwing to maintain system resilience
      logger.warn("Returning empty technician matches due to error");
      return [];
    }
  }

  /**
   * Check if a technician is available on a specific date
   */
  private checkTechnicianAvailability(
    availability: AirtableRecord<AvailabilityFields>[],
    jobDate: string,
  ): boolean {
    const jobDateTime = new Date(jobDate);

    for (const record of availability) {
      const startDate = new Date(record.fields["Start Date"]);
      const endDate = record.fields["End Date"]
        ? new Date(record.fields["End Date"])
        : null;

      // Check if job date falls within this availability period
      const isInPeriod =
        jobDateTime >= startDate && (!endDate || jobDateTime <= endDate);

      if (isInPeriod) {
        // If period type is "Available", technician is available
        if (record.fields["Period Type"] === "Available") {
          return true;
        }
        // If period type is "Unavailable" or "Booked", technician is not available
        if (
          record.fields["Period Type"] === "Unavailable" ||
          record.fields["Period Type"] === "Booked"
        ) {
          return false;
        }
      }
    }

    // If no availability records found, assume available (default state)
    return availability.length === 0;
  }

  /**
   * Calculate match score based on technician and job requirements
   */
  private calculateMatchScore(
    technician: TechnicianFields,
    jobType?: string,
  ): number {
    if (!jobType) {
      return 50; // Base score when no job type specified
    }

    // Enhanced logic-based scoring with certification matching
    let score = 35; // Lower base score to differentiate from AI results

    // Certification matching
    const certifications = technician.Certifications || []; // Updated to use "Certifications"
    const jobTypeLower = jobType.toLowerCase();

    // Exact certification matches with level considerations
    if (jobTypeLower.includes("ut") || jobTypeLower.includes("ultrasonic")) {
      if (certifications.some(c => c.toLowerCase().includes("ut level ii") || c.toLowerCase().includes("ut-2"))) {
        score += 35; // Excellent match for UT Level II
      } else if (certifications.some(c => c.toLowerCase().includes("ut level i") || c.toLowerCase().includes("ut-1") || c.toLowerCase().includes("ut"))) {
        score += 25; // Good match for UT Level I or general UT
      }
    }

    if (jobTypeLower.includes("rt") || jobTypeLower.includes("radiograph")) {
      if (certifications.some(c => c.toLowerCase().includes("rt level ii") || c.toLowerCase().includes("rt-2"))) {
        score += 35; // Excellent match for RT Level II
      } else if (certifications.some(c => c.toLowerCase().includes("rt level i") || c.toLowerCase().includes("rt-1") || c.toLowerCase().includes("rt"))) {
        score += 25; // Good match for RT Level I or general RT
      }
    }

    if (jobTypeLower.includes("mt") || jobTypeLower.includes("magnetic")) {
      if (certifications.some(c => c.toLowerCase().includes("mt"))) {
        score += 30; // Strong match for MT jobs
      }
    }

    if (jobTypeLower.includes("pt") || jobTypeLower.includes("penetrant")) {
      if (certifications.some(c => c.toLowerCase().includes("pt"))) {
        score += 30; // Strong match for PT jobs
      }
    }

    if (jobTypeLower.includes("vt") || jobTypeLower.includes("visual")) {
      if (certifications.some(c => c.toLowerCase().includes("vt"))) {
        score += 25; // Good match for VT jobs
      }
    }

    // General NDT experience indicators
    const ndt_keywords = ["ndt", "non-destructive", "testing", "inspection", "asnt"];
    if (ndt_keywords.some(keyword =>
      certifications.some(c => c.toLowerCase().includes(keyword))
    )) {
      score += 10; // General NDT experience bonus
    }

    // Multiple certifications bonus (shows breadth of experience)
    if (certifications.length >= 4) {
      score += 15; // Very experienced
    } else if (certifications.length >= 3) {
      score += 10; // Well-rounded
    } else if (certifications.length >= 2) {
      score += 5; // Some variety
    }

    // Safety certifications (critical for industrial work)
    const safety_keywords = ["rope", "access", "confined", "space", "safety", "osha", "cswip", "nace"];
    if (safety_keywords.some(keyword =>
      certifications.some(c => c.toLowerCase().includes(keyword))
    )) {
      score += 12; // Safety certification bonus
    }

    // Industry-specific certifications
    const industry_keywords = ["aws", "asme", "api", "pipeline", "offshore", "subsea"];
    if (industry_keywords.some(keyword =>
      certifications.some(c => c.toLowerCase().includes(keyword))
    )) {
      score += 8; // Industry specialization bonus
    }

    return Math.min(score, 100); // Cap at 100%
  }

  /**
   * Make a rate-limited request to Airtable API
   */
  private async makeRequest<T = any>(
    endpoint: string,
    params: Record<string, any> = {},
  ): Promise<AirtableResponse<T>> {
    const requestStartTime = Date.now();

    // 1. LOG RATE LIMITER STATE HERE
    logger.debug("🕒 Rate limiter state before request", {
      currentRequests: this.rateLimiter.requests,
      maxRequests: this.rateLimiter.maxRequests,
      windowMs: this.rateLimiter.windowMs,
      resetTime: this.rateLimiter.resetTime,
    });

    await this.enforceRateLimit();

    // 2. LOG URL CONSTRUCTION HERE
    logger.debug("🔨 URL construction starting", {
      baseUrl: this.baseUrl,
      endpoint: endpoint,
      rawParams: params,
    });

    const url = new URL(this.baseUrl + endpoint);

    // Add query parameters
    Object.entries(params).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((v) => url.searchParams.append(key, v));
      } else if (value !== undefined) {
        url.searchParams.append(key, String(value));
      }
    });

    // 3. LOG COMPLETE REQUEST DETAILS HERE
    logger.info("📤 Airtable API request details", {
      constructedUrl: url.toString(),
      endpoint: endpoint,
      baseUrl: this.baseUrl,
      queryParams: Object.fromEntries(url.searchParams),
      originalParams: params,
      filterFormula: {
        original: params.filterByFormula,
        encoded: params.filterByFormula ? encodeURIComponent(params.filterByFormula) : undefined,
        urlEncoded: url.searchParams.get('filterByFormula'),
      },
      headers: {
        Authorization: `Bearer ${this.apiKey?.substring(0, 10)}...`,
        "Content-Type": "application/json",
      },
      method: "GET",
    });

    // Compare with working curl format
    if (params.filterByFormula) {
      const curlEquivalent = `curl "${url.toString()}"`;
      logger.debug("📋 Curl equivalent", {
        curlCommand: curlEquivalent,
        filterFormula: {
          app: params.filterByFormula,
          curl: `{Status} = 'Active'`,
          encoded: encodeURIComponent(params.filterByFormula),
        }
      });
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    const responseTime = Date.now() - requestStartTime;

    // 4. LOG RESPONSE DETAILS HERE
    logger.info("📥 Airtable API response received", {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      responseTime: `${responseTime}ms`,
      url: url.toString(),
    });

    this.rateLimiter.requests++;

    if (response.status === 429) {
      // 5. LOG RATE LIMIT DETAILS HERE
      logger.warn("⚠️ Airtable rate limit exceeded", {
        status: response.status,
        retryAfter: response.headers.get('Retry-After'),
        currentRequests: this.rateLimiter.requests,
        waitTime: "30 seconds",
        url: url.toString(),
      });
      await new Promise((resolve) => setTimeout(resolve, 30000));
      return this.makeRequest<T>(endpoint, params);
    }

    if (!response.ok) {
      // 6. LOG DETAILED ERROR INFO HERE (especially for 422)
      let errorDetails;
      let errorText = "Could not parse error response";

      try {
        errorDetails = await response.json();
        errorText = errorDetails.error?.message || errorDetails.message || JSON.stringify(errorDetails);
      } catch (parseError) {
        try {
          errorText = await response.text();
        } catch (textError) {
          errorText = "Could not read error response";
        }
      }

      logger.error("❌ Airtable API error response", {
        status: response.status,
        statusText: response.statusText,
        url: url.toString(),
        endpoint: endpoint,
        errorDetails: errorDetails,
        errorText: errorText,
        requestParams: params,
        responseHeaders: Object.fromEntries(response.headers.entries()),
        responseTime: `${responseTime}ms`,
      });

      // Special debugging for 422 errors
      if (response.status === 422) {
        logger.error("🔍 422 Error Analysis", {
          likelyIssue: "Unprocessable Entity - Parameter or filter syntax error",
          filterFormula: {
            sent: params.filterByFormula,
            encoded: url.searchParams.get('filterByFormula'),
            expected: `{Status} = 'Active'`,
          },
          urlComparison: {
            app: url.toString(),
            working: `https://api.airtable.com/v0/${this.baseId}/Technicians?filterByFormula=%7BStatus%7D%20%3D%20%27Active%27`,
          },
          commonCauses: [
            "Filter formula syntax error",
            "Invalid field names in filter",
            "URL encoding issues",
            "Table name doesn't exist",
            "Missing permissions for table/fields",
          ],
        });
      }

      throw new Error(
        `Airtable API error ${response.status}: ${errorText}`,
      );
    }

    const data = await response.json();

    // 7. LOG SUCCESS DETAILS HERE
    logger.info("✅ Airtable API request successful", {
      endpoint,
      status: response.status,
      recordCount: data.records?.length || 0,
      responseTime: `${responseTime}ms`,
      firstRecord: data.records?.[0] ? {
        id: data.records[0].id,
        fields: Object.keys(data.records[0].fields || {}),
      } : null,
      rateLimiterState: {
        requests: this.rateLimiter.requests,
        maxRequests: this.rateLimiter.maxRequests,
      },
    });

    return data;
  }

  /**
   * Enforce rate limiting (5 requests per second)
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();

    // Reset counter if window has passed
    if (now > this.rateLimiter.resetTime) {
      this.rateLimiter.requests = 0;
      this.rateLimiter.resetTime = now + this.rateLimiter.windowMs;
    }

    // Wait if we've hit the rate limit
    if (this.rateLimiter.requests >= this.rateLimiter.maxRequests) {
      const waitTime = this.rateLimiter.resetTime - now;
      logger.info("Rate limit reached, waiting", { waitTime });
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      this.rateLimiter.requests = 0;
      this.rateLimiter.resetTime = Date.now() + this.rateLimiter.windowMs;
    }
  }
}

// Export singleton instance
export const airtableService = new AirtableService();