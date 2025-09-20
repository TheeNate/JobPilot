import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertJobSchema, insertRequestLogSchema } from "@shared/schema";
import { logger } from "./services/logger";
import { EmailParser } from "./services/parser";
import { z } from "zod";

// Email payload schema for job intake
const emailPayloadSchema = z.object({
  subject: z.string(),
  from: z.string().email(),
  to: z.string().email(),
  "body-plain": z.string(),
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
      
      // Parse job details from email body
      const parsedJobDetails = EmailParser.parseJobDetails(
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
      
      // Log error request
      await storage.createRequestLog({
        method: "POST",
        endpoint: "/api/job-intake",
        statusCode: 400,
        responseTime,
        requestBody: JSON.stringify(req.body),
      });
      
      logger.error("Job intake request failed", {
        error: error instanceof Error ? error.message : "Unknown error",
        responseTime,
      });
      
      if (error instanceof z.ZodError) {
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

  const httpServer = createServer(app);
  return httpServer;
}
