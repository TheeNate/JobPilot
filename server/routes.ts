import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  insertJobSchema,
  insertRequestLogSchema,
  jobs,
  jobAssignments,
} from "@shared/schema";
import { logger } from "./services/logger";
import { EmailParser } from "./services/parser";
import { airtableService } from "./services/airtable";
import { claudeMatchingService } from "./services/claude-matching";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "./db";

// Email payload schema for job intake
const emailPayloadSchema = z.object({
  subject: z.string(),
  from: z.string().email(),
  to: z.string().email(),
  "body-plain": z.string(),
  aiExtracted: z
    .object({
      location: z.string().nullable().optional(),
      scheduledDate: z.string().nullable().optional(),
      scheduledTime: z.string().nullable().optional(),
      jobType: z.string().nullable().optional(),
      techsNeeded: z.number().nullable().optional(),
    })
    .optional(),
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check endpoint
  app.get("/api/health", async (req, res) => {
    try {
      // Check database connection
      const dbStatus = await storage.checkConnection();

      // Check Airtable connection
      const airtableStatus = await airtableService.checkHealth();

      const overallStatus =
        dbStatus && airtableStatus.status === "healthy"
          ? "healthy"
          : "unhealthy";
      const statusCode = overallStatus === "healthy" ? 200 : 503;

      res.status(statusCode).json({
        status: overallStatus,
        timestamp: new Date().toISOString(),
        database: dbStatus ? "connected" : "disconnected",
        airtable: {
          status: airtableStatus.status,
          message: airtableStatus.message,
          quotaUsed: airtableStatus.quotaUsed,
          lastConnection: airtableStatus.lastConnection,
        },
        uptime: process.uptime(),
      });
    } catch (error) {
      res.status(503).json({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Job intake endpoint
  app.post("/api/job-intake", async (req, res) => {
    const startTime = Date.now();

    try {
      // Validate email payload
      const emailData = emailPayloadSchema.parse(req.body);

      // Log the incoming request
      logger.info("Job intake request received", {
        from: emailData.from,
        subject: emailData.subject,
      });

      // Use AI-extracted data if available, otherwise parse
      const parsedJobDetails =
        emailData.aiExtracted ||
        EmailParser.parseJobDetails(emailData["body-plain"], emailData.subject);

      // Create job record with parsed data
      const jobData = {
        clientEmail: emailData.from,
        subject: emailData.subject,
        bodyPlain: emailData["body-plain"],
        location: parsedJobDetails.location || null,
        scheduledDate: parsedJobDetails.scheduledDate || null,
        scheduledTime: parsedJobDetails.scheduledTime || null,
        jobType: parsedJobDetails.jobType || null,
        techsNeeded: parsedJobDetails.techsNeeded || null,
        status: "pending" as const,
      };

      // NEW - writes to Airtable via middleware
      const response = await fetch(
        `${process.env.MIDDLEWARE_URL}/api/Job%20Intake`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.MIDDLEWARE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fields: {
              Name: jobData.subject,
              "Job Type": jobData.jobType,
              "Client Email": jobData.clientEmail,
              "Start Date": jobData.scheduledDate,
              Location: jobData.location,
              Time: jobData.scheduledTime,
              "Techs Needed": jobData.techsNeeded,
              "Email Body": jobData.bodyPlain,
              "AI Analysis": JSON.stringify(
                emailData.aiAnalysis || parsedJobDetails,
                null,
                2,
              ),
            },
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`Middleware request failed: ${response.status}`);
      }

      const job = await response.json();

      // Log the request to database (keeping PostgreSQL logging for now)
      const responseTime = Date.now() - startTime;
      await storage.createRequestLog({
        method: "POST",
        endpoint: "/api/job-intake",
        statusCode: 200,
        responseTime,
        requestBody: JSON.stringify(req.body),
      });

      logger.info("Job intake processed successfully", {
        jobId: job.id,
        responseTime,
      });

      res.json({
        status: "success",
        message: "Job intake request logged successfully",
        requestId: job.id,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const isValidationError = error instanceof z.ZodError;
      const statusCode = isValidationError ? 400 : 500;

      // Log error request with correct status code
      await storage.createRequestLog({
        method: "POST",
        endpoint: "/api/job-intake",
        statusCode,
        responseTime,
        requestBody: JSON.stringify(req.body),
      });

      logger.error("Job intake request failed", {
        error: error instanceof Error ? error.message : "Unknown error",
        responseTime,
      });

      if (isValidationError) {
        res.status(400).json({
          status: "error",
          message: "Invalid request payload",
          errors: error.errors,
        });
      } else {
        res.status(500).json({
          status: "error",
          message: "Internal server error",
        });
      }
    }
  });

  // Get recent jobs from Airtable via middleware
  app.get("/api/jobs", async (req, res) => {
    try {
      const response = await fetch(
        `${process.env.MIDDLEWARE_URL}/api/Job%20Intake`,
        {
          headers: {
            Authorization: `Bearer ${process.env.MIDDLEWARE_KEY}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Middleware request failed: ${response.status}`);
      }

      const airtableData = await response.json();

      // Transform Airtable format to match what dashboard expects
      const jobs = airtableData.records.map((record: any) => ({
        id: record.id,
        clientEmail: record.fields.Client || "",
        subject: record.fields.Name || "",
        status: record.fields.Select || "pending",
        scheduledDate: record.fields["Start Date"] || null,
        createdAt: record.createdTime,
        // Add other fields your dashboard needs
        location: record.fields.Location || null,
        scheduledTime: record.fields.Time || null,
        jobType: record.fields["Job Type"] || null,
        techsNeeded: record.fields["Techs Needed"] || null,
        bodyPlain: record.fields["Email Body"] || "",
      }));

      res.json(jobs);
    } catch (error) {
      logger.error("Failed to fetch jobs from Airtable", { error });
      res.status(500).json({
        status: "error",
        message: "Failed to fetch jobs",
      });
    }
  });

  // Get request logs
  app.get("/api/logs", async (req, res) => {
    try {
      const logs = await storage.getRequestLogs();
      res.json(logs);
    } catch (error) {
      logger.error("Failed to fetch logs", { error });
      res.status(500).json({
        status: "error",
        message: "Failed to fetch logs",
      });
    }
  });

  // Get service stats
  app.get("/api/stats", async (req, res) => {
    try {
      const stats = await storage.getServiceStats();
      res.json(stats);
    } catch (error) {
      logger.error("Failed to fetch stats", { error });
      res.status(500).json({
        status: "error",
        message: "Failed to fetch stats",
      });
    }
  });

  // Get available technicians for a specific date and job type
  app.get("/api/technicians/available", async (req, res) => {
    const startTime = Date.now();

    try {
      const { date, jobType, limit } = req.query;

      if (!date || typeof date !== "string") {
        return res.status(400).json({
          status: "error",
          message: "Date parameter is required (format: YYYY-MM-DD)",
        });
      }

      const maxLimit = limit ? Math.min(parseInt(limit as string), 50) : 10;

      const availableTechnicians =
        await airtableService.findAvailableTechnicians(date, jobType as string);

      const limitedResults = availableTechnicians.slice(0, maxLimit);

      // Log the request
      const responseTime = Date.now() - startTime;
      await storage.createRequestLog({
        method: "GET",
        endpoint: "/api/technicians/available",
        statusCode: 200,
        responseTime,
        requestBody: null,
      });

      logger.info("Retrieved available technicians", {
        date,
        jobType,
        count: limitedResults.length,
        responseTime,
      });

      res.json({
        status: "success",
        data: limitedResults.map((result) => ({
          technician: {
            id: result.technician.id,
            name: result.technician.fields.Name,
            certifications: [],
            status: result.technician.fields.Status,
          },
          matchScore: result.matchScore,
          availability: result.availability.map((avail) => ({
            periodType: avail.fields["Period Type"],
            startDate: avail.fields["Start Date"],
            endDate: avail.fields["End Date"],
            reason: avail.fields.Reason,
          })),
        })),
        metadata: {
          requestDate: date,
          jobType,
          totalCount: availableTechnicians.length,
          limitApplied: maxLimit,
        },
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;
      await storage.createRequestLog({
        method: "GET",
        endpoint: "/api/technicians/available",
        statusCode: 500,
        responseTime,
        requestBody: null,
      });

      logger.error("Failed to get available technicians", { error });
      res.status(500).json({
        status: "error",
        message: "Failed to retrieve available technicians",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Match technicians for a specific job
  app.post("/api/jobs/:jobId/match-technicians", async (req, res) => {
    const startTime = Date.now();

    try {
      const { jobId } = req.params;
      const { requirementOverrides, forceRefresh } = req.body || {};

      if (!jobId) {
        return res.status(400).json({
          status: "error",
          message: "Job ID is required",
        });
      }

      // Get job details from Airtable via middleware
      const jobResponse = await fetch(
        `${process.env.MIDDLEWARE_URL}/api/Job%20Intake/${jobId}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.MIDDLEWARE_KEY}`,
          },
        },
      );

      if (!jobResponse.ok) {
        const errorText = await jobResponse.text();
        logger.error("Failed to fetch job from middleware", {
          jobId,
          status: jobResponse.status,
          response: errorText.substring(0, 200),
        });
        return res.status(404).json({
          status: "error",
          message: "Job not found",
        });
      }

      // Check if response is JSON
      const contentType = jobResponse.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const errorText = await jobResponse.text();
        logger.error("Middleware returned non-JSON response", {
          jobId,
          contentType,
          response: errorText.substring(0, 200),
        });
        return res.status(502).json({
          status: "error",
          message: "Invalid response from middleware service",
        });
      }

      const airtableJob = await jobResponse.json();

      // Transform Airtable format to match expected job structure
      const job = {
        id: airtableJob.id,
        clientEmail: "", // Job Intake doesn't have this field
        subject: airtableJob.fields.Name || "",
        location: airtableJob.fields.Location || null,
        scheduledDate: null, // Job Intake doesn't have Start Date
        scheduledTime: airtableJob.fields.Time || null,
        jobType: airtableJob.fields["Job Type"] || null,
        techsNeeded: airtableJob.fields["Techs Needed"] || null,
        status: "pending",
        bodyPlain: airtableJob.fields["Email Body"] || "",
      };

      // Use job's scheduled date or current date as fallback
      const jobDate =
        job.scheduledDate || new Date().toISOString().split("T")[0];

      // Use requirement overrides if provided, otherwise use job details
      const jobType = requirementOverrides?.jobType || job.jobType;

      // Get available technicians first
      const availableTechnicians =
        await airtableService.findAvailableTechnicians(jobDate, jobType);

      // Try Claude AI analysis for intelligent matching
      let aiAnalysis = null;
      try {
        if (availableTechnicians.length > 0) {
          const jobDetails = {
            location: job.location || "",
            scheduledDate: job.scheduledDate || "",
            scheduledTime: job.scheduledTime || "",
            jobType: jobType || "",
            subject: job.subject || "",
            bodyPlain: job.bodyPlain || "",
            techsNeeded: job.techsNeeded?.toString() || null,
          };

          aiAnalysis = await claudeMatchingService.generateMatchAnalysis(
            jobDetails,
            availableTechnicians,
          );

          logger.info("AI analysis completed", {
            jobId,
            topRecommendation: aiAnalysis.topRecommendation.technician.name,
            confidenceScore: aiAnalysis.topRecommendation.confidenceScore,
            fallbackUsed: aiAnalysis.fallbackUsed,
          });
        }
      } catch (error) {
        logger.error("AI analysis failed, using standard matching", { error });
        aiAnalysis = null;
      }

      // Log the request
      const responseTime = Date.now() - startTime;
      await storage.createRequestLog({
        method: "POST",
        endpoint: `/api/jobs/${jobId}/match-technicians`,
        statusCode: 200,
        responseTime,
        requestBody: JSON.stringify(req.body),
      });

      logger.info("Matched technicians for job", {
        jobId,
        jobDate,
        jobType,
        matchCount: availableTechnicians.length,
        responseTime,
      });

      // Update the job with proposed staffing if we found technicians
      if (availableTechnicians.length > 0) {
        const bestMatch = availableTechnicians[0]; // Get the highest scoring technician
        const proposedStaffingText = `${bestMatch.technician.fields.Name} (${bestMatch.matchScore}% match)`;

        // Update job in Airtable via middleware
        try {
          const updateResponse = await fetch(
            `${process.env.MIDDLEWARE_URL}/api/Job%20Intake/${jobId}`,
            {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${process.env.MIDDLEWARE_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                fields: {
                  "Proposed Staffing": proposedStaffingText,
                  "Match Score": bestMatch.matchScore,
                },
              }),
            },
          );

          if (!updateResponse.ok) {
            logger.warn("Failed to update job staffing in Airtable", {
              jobId,
              status: updateResponse.status,
            });
          }
        } catch (error) {
          logger.error("Error updating job staffing in Airtable", {
            error,
            jobId,
          });
        }
      }

      res.json({
        status: "success",
        data: {
          jobId,
          jobDetails: {
            location: job.location,
            scheduledDate: job.scheduledDate,
            scheduledTime: job.scheduledTime,
            jobType: job.jobType,
            techsNeeded: job.techsNeeded,
          },
          proposedStaffing: availableTechnicians,
          aiAnalysis: aiAnalysis
            ? {
                teamComposition: aiAnalysis.teamComposition,
                topRecommendation: aiAnalysis.topRecommendation,
                alternatives: aiAnalysis.alternatives,
                jobAnalysis: aiAnalysis.jobAnalysis,
                analysisTimestamp: aiAnalysis.analysisTimestamp,
                fallbackUsed: aiAnalysis.fallbackUsed,
              }
            : null,
          metadata: {
            requestDate: jobDate,
            totalMatches: availableTechnicians.length,
            timestamp: new Date().toISOString(),
          },
        },
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;
      await storage.createRequestLog({
        method: "POST",
        endpoint: `/api/jobs/${req.params.jobId}/match-technicians`,
        statusCode: 500,
        responseTime,
        requestBody: JSON.stringify(req.body),
      });

      logger.error("Failed to match technicians for job", {
        error,
        jobId: req.params.jobId,
      });
      res.status(500).json({
        status: "error",
        message: "Failed to match technicians",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Airtable health check endpoint
  app.get("/api/airtable/health", async (req, res) => {
    try {
      const airtableStatus = await airtableService.checkHealth();

      res.json({
        status: "success",
        data: airtableStatus,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Airtable health check failed", { error });
      res.status(500).json({
        status: "error",
        message: "Airtable health check failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Manual Airtable sync endpoint
  app.post("/api/airtable/sync", async (req, res) => {
    const startTime = Date.now();

    try {
      // Get active technicians to test sync
      const technicians = await airtableService.getActiveTechnicians();

      const responseTime = Date.now() - startTime;

      logger.info("Manual Airtable sync completed", {
        technicianCount: technicians.length,
        responseTime,
      });

      res.json({
        status: "success",
        data: {
          recordsProcessed: technicians.length,
          responseTime,
          timestamp: new Date().toISOString(),
        },
        message: "Airtable sync completed successfully",
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;
      logger.error("Manual Airtable sync failed", { error, responseTime });

      res.status(500).json({
        status: "error",
        message: "Airtable sync failed",
        error: error instanceof Error ? error.message : "Unknown error",
        responseTime,
      });
    }
  });

  // Helper function for match reasoning (define inline to avoid 'this' context issues)
  const generateMatchReasoning = (
    technician: any,
    jobType?: string,
    matchScore?: number,
  ): string => {
    if (!jobType) return "General availability match";

    const certifications = technician.Certifications || [];
    const reasons = [];

    if (matchScore && matchScore > 75) {
      reasons.push("Excellent certification match");
    } else if (matchScore && matchScore > 50) {
      reasons.push("Good skill alignment");
    } else {
      reasons.push("Basic availability match");
    }

    if (
      certifications.some((cert: string) =>
        cert.toLowerCase().includes(jobType.toLowerCase()),
      )
    ) {
      reasons.push(`Direct ${jobType} certification`);
    }

    return reasons.join(", ");
  };

  // Delete job endpoint
  app.delete("/api/jobs/:jobId", async (req, res) => {
    const startTime = Date.now();

    try {
      const { jobId } = req.params;

      if (!jobId) {
        return res.status(400).json({
          status: "error",
          message: "Job ID is required",
        });
      }

      // First delete any job assignments (cascade delete)
      await db.delete(jobAssignments).where(eq(jobAssignments.jobId, jobId));

      // Then delete the job
      const deletedJob = await db
        .delete(jobs)
        .where(eq(jobs.id, jobId))
        .returning();

      if (deletedJob.length === 0) {
        return res.status(404).json({
          status: "error",
          message: "Job not found",
        });
      }

      // Log the request
      const responseTime = Date.now() - startTime;
      await storage.createRequestLog({
        method: "DELETE",
        endpoint: `/api/jobs/${jobId}`,
        statusCode: 200,
        responseTime,
        requestBody: null,
      });

      logger.info("Job deleted successfully", { jobId, responseTime });

      res.json({
        status: "success",
        message: "Job deleted successfully",
        deletedJobId: jobId,
      });
    } catch (error) {
      logger.error("Failed to delete job", { error, jobId: req.params.jobId });
      res.status(500).json({
        status: "error",
        message: "Failed to delete job",
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
