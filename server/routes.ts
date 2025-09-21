import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertJobSchema, insertRequestLogSchema, jobs, jobAssignments } from "@shared/schema";
import { logger } from "./services/logger";
import { EmailParser } from "./services/parser";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "./db";

// Email payload schema for job intake
const emailPayloadSchema = z.object({
  subject: z.string(),
  from: z.string().email(),
  to: z.string().email(),
  "body-plain": z.string(),
  aiExtracted: z.object({
    location: z.string().nullable().optional(),
    scheduledDate: z.string().nullable().optional(),
    scheduledTime: z.string().nullable().optional(),
    jobType: z.string().nullable().optional(),
    techsNeeded: z.number().nullable().optional()
  }).optional()
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check endpoint
  app.get("/api/health", async (req, res) => {
    try {
      // Check database connection
      const dbStatus = await storage.checkConnection();
      
      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        database: dbStatus ? "connected" : "disconnected",
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
      const parsedJobDetails = emailData.aiExtracted || EmailParser.parseJobDetails(
        emailData["body-plain"], 
        emailData.subject
      );
      
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
      
      const job = await storage.createJob(jobData);
      
      // Log the request to database
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

  // Get recent jobs
  app.get("/api/jobs", async (req, res) => {
    try {
      const jobs = await storage.getRecentJobs();
      res.json(jobs);
    } catch (error) {
      logger.error("Failed to fetch jobs", { error });
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

  // Delete job endpoint
  app.delete("/api/jobs/:jobId", async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { jobId } = req.params;
      
      if (!jobId) {
        return res.status(400).json({
          status: "error",
          message: "Job ID is required"
        });
      }
      
      // First delete any job assignments (cascade delete)
      await db.delete(jobAssignments).where(eq(jobAssignments.jobId, jobId));
      
      // Then delete the job
      const deletedJob = await db.delete(jobs).where(eq(jobs.id, jobId)).returning();
      
      if (deletedJob.length === 0) {
        return res.status(404).json({
          status: "error", 
          message: "Job not found"
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
        deletedJobId: jobId
      });
      
    } catch (error) {
      logger.error("Failed to delete job", { error, jobId: req.params.jobId });
      res.status(500).json({
        status: "error",
        message: "Failed to delete job"
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
