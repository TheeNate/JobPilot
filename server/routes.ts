import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertJobSchema, insertRequestLogSchema, insertConnectedServiceSchema, insertServiceEnvironmentVariableSchema, insertEmployeeSchema, jobs, jobAssignments } from "@shared/schema";
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

  // Connected Services endpoints
  
  // Get all connected services
  app.get("/api/services", async (req, res) => {
    try {
      const services = await storage.getConnectedServices();
      res.json(services);
    } catch (error) {
      logger.error("Failed to fetch connected services", { error });
      res.status(500).json({
        status: "error",
        message: "Failed to fetch connected services",
      });
    }
  });

  // Create new connected service
  app.post("/api/services", async (req, res) => {
    const startTime = Date.now();
    
    try {
      const serviceData = insertConnectedServiceSchema.parse(req.body);
      const service = await storage.createConnectedService(serviceData);
      
      // Log the request (without sensitive data)
      const responseTime = Date.now() - startTime;
      await storage.createRequestLog({
        method: "POST",
        endpoint: "/api/services",
        statusCode: 201,
        responseTime,
        requestBody: JSON.stringify({ serviceName: serviceData.serviceName, serviceType: serviceData.serviceType }),
      });
      
      logger.info("Connected service created", { serviceId: service.id });
      
      res.status(201).json({
        status: "success",
        service,
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const isValidationError = error instanceof z.ZodError;
      const statusCode = isValidationError ? 400 : 500;
      
      await storage.createRequestLog({
        method: "POST",
        endpoint: "/api/services",
        statusCode,
        responseTime,
        requestBody: JSON.stringify({ serviceName: req.body?.serviceName, serviceType: req.body?.serviceType }),
      });
      
      logger.error("Failed to create connected service", { error });
      
      if (isValidationError) {
        res.status(400).json({
          status: "error",
          message: "Invalid service data",
          errors: error.errors,
        });
      } else {
        res.status(500).json({
          status: "error",
          message: "Failed to create connected service",
        });
      }
    }
  });

  // Update connected service
  app.put("/api/services/:id", async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { id } = req.params;
      const updates = insertConnectedServiceSchema.partial().parse(req.body);
      
      const service = await storage.updateConnectedService(id, updates);
      
      // Log the request (without sensitive data)
      const responseTime = Date.now() - startTime;
      await storage.createRequestLog({
        method: "PUT",
        endpoint: `/api/services/${id}`,
        statusCode: 200,
        responseTime,
        requestBody: JSON.stringify({ serviceName: updates.serviceName, serviceType: updates.serviceType }),
      });
      
      logger.info("Connected service updated", { serviceId: id });
      
      res.json({
        status: "success",
        service,
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const isValidationError = error instanceof z.ZodError;
      const isNotFound = error instanceof Error && error.message === "Service not found";
      const statusCode = isValidationError ? 400 : isNotFound ? 404 : 500;
      
      await storage.createRequestLog({
        method: "PUT",
        endpoint: `/api/services/${req.params.id}`,
        statusCode,
        responseTime,
        requestBody: JSON.stringify({ serviceName: req.body?.serviceName, serviceType: req.body?.serviceType }),
      });
      
      logger.error("Failed to update connected service", { error });
      
      if (isValidationError) {
        res.status(400).json({
          status: "error",
          message: "Invalid service data",
          errors: error.errors,
        });
      } else if (isNotFound) {
        res.status(404).json({
          status: "error",
          message: "Service not found",
        });
      } else {
        res.status(500).json({
          status: "error",
          message: "Failed to update connected service",
        });
      }
    }
  });

  // Delete connected service
  app.delete("/api/services/:id", async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({
          status: "error",
          message: "Service ID is required"
        });
      }
      
      await storage.deleteConnectedService(id);
      
      // Log the request
      const responseTime = Date.now() - startTime;
      await storage.createRequestLog({
        method: "DELETE",
        endpoint: `/api/services/${id}`,
        statusCode: 200,
        responseTime,
        requestBody: null,
      });
      
      logger.info("Connected service deleted", { serviceId: id });
      
      res.json({
        status: "success",
        message: "Connected service deleted successfully",
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const isNotFound = error instanceof Error && error.message === "Service not found";
      const statusCode = isNotFound ? 404 : 500;
      
      await storage.createRequestLog({
        method: "DELETE",
        endpoint: `/api/services/${req.params.id}`,
        statusCode,
        responseTime,
        requestBody: null,
      });
      
      logger.error("Failed to delete connected service", { error });
      
      if (isNotFound) {
        res.status(404).json({
          status: "error",
          message: "Service not found",
        });
      } else {
        res.status(500).json({
          status: "error",
          message: "Failed to delete connected service",
        });
      }
    }
  });

  // Test service connection
  app.post("/api/services/:id/test", async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { id } = req.params;
      const services = await storage.getConnectedServices();
      const service = services.find(s => s.id === id);
      
      if (!service) {
        const responseTime = Date.now() - startTime;
        await storage.createRequestLog({
          method: "POST",
          endpoint: `/api/services/${id}/test`,
          statusCode: 404,
          responseTime,
          requestBody: null,
        });
        
        return res.status(404).json({
          status: "error",
          message: "Service not found"
        });
      }
      
      // Additional validation: Re-validate the service URL for security
      try {
        const validationResult = insertConnectedServiceSchema.partial().parse({ serviceUrl: service.serviceUrl });
      } catch (validationError) {
        const responseTime = Date.now() - startTime;
        await storage.createRequestLog({
          method: "POST",
          endpoint: `/api/services/${id}/test`,
          statusCode: 400,
          responseTime,
          requestBody: null,
        });
        
        logger.warn("Service URL failed security validation", { serviceId: id });
        
        return res.status(400).json({
          status: "error",
          message: "Service URL is not secure for testing"
        });
      }
      
      // Test connection to service health endpoint
      const healthUrl = new URL("/api/health", service.serviceUrl).href;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout (reduced from 10s)
      
      try {
        const response = await fetch(healthUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          redirect: "manual", // Critical: Prevent redirect following for SSRF protection
        });
        
        clearTimeout(timeoutId);
        
        const isHealthy = response.ok;
        
        // Update service status based on test result
        await storage.updateConnectedService(id, {
          status: isHealthy ? "active" : "inactive"
        });
        
        // Log the request (success branch)
        const responseTime = Date.now() - startTime;
        await storage.createRequestLog({
          method: "POST",
          endpoint: `/api/services/${id}/test`,
          statusCode: 200,
          responseTime,
          requestBody: null,
        });
        
        logger.info("Service connection tested", { 
          serviceId: id, 
          isHealthy
        });
        
        res.json({
          status: "success",
          isHealthy,
          message: isHealthy ? "Service is healthy" : "Service is not responding correctly",
          testedUrl: healthUrl,
        });
        
      } catch (fetchError) {
        clearTimeout(timeoutId);
        
        // Update service status to inactive on connection failure
        await storage.updateConnectedService(id, {
          status: "inactive"
        });
        
        // Log the request (network failure branch - this was missing before)
        const responseTime = Date.now() - startTime;
        await storage.createRequestLog({
          method: "POST",
          endpoint: `/api/services/${id}/test`,
          statusCode: 200,
          responseTime,
          requestBody: null,
        });
        
        logger.warn("Service connection test failed", { 
          serviceId: id, 
          error: fetchError instanceof Error ? fetchError.message : "Network error"
        });
        
        res.json({
          status: "success",
          isHealthy: false,
          message: "Service is not reachable or not responding",
          testedUrl: healthUrl,
          error: fetchError instanceof Error ? fetchError.message : "Network error",
        });
      }
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      await storage.createRequestLog({
        method: "POST",
        endpoint: `/api/services/${req.params.id}/test`,
        statusCode: 500,
        responseTime,
        requestBody: null,
      });
      
      logger.error("Failed to test service connection", { error });
      res.status(500).json({
        status: "error",
        message: "Failed to test service connection",
      });
    }
  });

  // Environment Variables Management Endpoints
  
  // Get all environment variables or by service
  app.get("/api/environment-variables", async (req, res) => {
    try {
      const { serviceId } = req.query;
      const envVars = await storage.getServiceEnvironmentVariables(serviceId as string);
      res.json(envVars);
    } catch (error) {
      logger.error("Failed to fetch environment variables", { error });
      res.status(500).json({
        status: "error",
        message: "Failed to fetch environment variables",
      });
    }
  });

  // Create new environment variable
  app.post("/api/environment-variables", async (req, res) => {
    const startTime = Date.now();
    
    try {
      const envVarData = insertServiceEnvironmentVariableSchema.parse(req.body);
      const envVar = await storage.createServiceEnvironmentVariable(envVarData);
      
      // Log the request
      const responseTime = Date.now() - startTime;
      await storage.createRequestLog({
        method: "POST",
        endpoint: "/api/environment-variables",
        statusCode: 201,
        responseTime,
        requestBody: JSON.stringify({ 
          variableName: envVarData.variableName, 
          serviceType: envVarData.serviceType 
        }),
      });
      
      logger.info("Environment variable created", { envVarId: envVar.id });
      
      res.status(201).json({
        status: "success",
        environmentVariable: envVar,
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const isValidationError = error instanceof z.ZodError;
      const statusCode = isValidationError ? 400 : 500;
      
      await storage.createRequestLog({
        method: "POST",
        endpoint: "/api/environment-variables",
        statusCode,
        responseTime,
        requestBody: JSON.stringify({ 
          variableName: req.body?.variableName, 
          serviceType: req.body?.serviceType 
        }),
      });
      
      logger.error("Failed to create environment variable", { error });
      
      if (isValidationError) {
        res.status(400).json({
          status: "error",
          message: "Invalid environment variable data",
          errors: error.errors,
        });
      } else {
        res.status(500).json({
          status: "error",
          message: "Failed to create environment variable",
        });
      }
    }
  });

  // Update environment variable
  app.put("/api/environment-variables/:id", async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { id } = req.params;
      const updates = insertServiceEnvironmentVariableSchema.partial().parse(req.body);
      
      const envVar = await storage.updateServiceEnvironmentVariable(id, updates);
      
      // Log the request
      const responseTime = Date.now() - startTime;
      await storage.createRequestLog({
        method: "PUT",
        endpoint: `/api/environment-variables/${id}`,
        statusCode: 200,
        responseTime,
        requestBody: JSON.stringify({ 
          variableName: updates.variableName, 
          isConfigured: updates.isConfigured 
        }),
      });
      
      logger.info("Environment variable updated", { envVarId: id });
      
      res.json({
        status: "success",
        environmentVariable: envVar,
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const isValidationError = error instanceof z.ZodError;
      const statusCode = error.message?.includes("not found") ? 404 : (isValidationError ? 400 : 500);
      
      await storage.createRequestLog({
        method: "PUT",
        endpoint: `/api/environment-variables/${req.params.id}`,
        statusCode,
        responseTime,
        requestBody: JSON.stringify({ 
          variableName: req.body?.variableName, 
          isConfigured: req.body?.isConfigured 
        }),
      });
      
      logger.error("Failed to update environment variable", { error });
      
      if (error.message?.includes("not found")) {
        res.status(404).json({
          status: "error",
          message: "Environment variable not found",
        });
      } else if (isValidationError) {
        res.status(400).json({
          status: "error",
          message: "Invalid environment variable data",
          errors: error.errors,
        });
      } else {
        res.status(500).json({
          status: "error",
          message: "Failed to update environment variable",
        });
      }
    }
  });

  // Delete environment variable
  app.delete("/api/environment-variables/:id", async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { id } = req.params;
      await storage.deleteServiceEnvironmentVariable(id);
      
      // Log the request
      const responseTime = Date.now() - startTime;
      await storage.createRequestLog({
        method: "DELETE",
        endpoint: `/api/environment-variables/${id}`,
        statusCode: 200,
        responseTime,
        requestBody: null,
      });
      
      logger.info("Environment variable deleted", { envVarId: id });
      
      res.json({
        status: "success",
        message: "Environment variable deleted successfully",
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const statusCode = error.message?.includes("not found") ? 404 : 500;
      
      await storage.createRequestLog({
        method: "DELETE",
        endpoint: `/api/environment-variables/${req.params.id}`,
        statusCode,
        responseTime,
        requestBody: null,
      });
      
      logger.error("Failed to delete environment variable", { error });
      
      if (error.message?.includes("not found")) {
        res.status(404).json({
          status: "error",
          message: "Environment variable not found",
        });
      } else {
        res.status(500).json({
          status: "error",
          message: "Failed to delete environment variable",
        });
      }
    }
  });

  // Sync environment variables for a service
  app.post("/api/services/:id/sync-env", async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { id } = req.params;
      
      // Get the service to determine its type
      const services = await storage.getConnectedServices();
      const service = services.find(s => s.id === id);
      
      if (!service) {
        return res.status(404).json({
          status: "error",
          message: "Service not found",
        });
      }
      
      // Sync environment variables for this service
      const syncedVars = await storage.syncEnvironmentVariablesForService(id, service.serviceType);
      
      // Log the request
      const responseTime = Date.now() - startTime;
      await storage.createRequestLog({
        method: "POST",
        endpoint: `/api/services/${id}/sync-env`,
        statusCode: 200,
        responseTime,
        requestBody: null,
      });
      
      logger.info("Environment variables synced for service", { 
        serviceId: id, 
        serviceType: service.serviceType,
        syncedCount: syncedVars.length 
      });
      
      res.json({
        status: "success",
        message: `Synced ${syncedVars.length} environment variables for ${service.serviceType} service`,
        syncedVariables: syncedVars,
        serviceType: service.serviceType,
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      await storage.createRequestLog({
        method: "POST",
        endpoint: `/api/services/${req.params.id}/sync-env`,
        statusCode: 500,
        responseTime,
        requestBody: null,
      });
      
      logger.error("Failed to sync environment variables", { error });
      res.status(500).json({
        status: "error",
        message: "Failed to sync environment variables",
      });
    }
  });

  // Employee Management Endpoints
  
  // Get all employees
  app.get("/api/employees", async (req, res) => {
    try {
      const employees = await storage.getEmployees();
      res.json(employees);
    } catch (error) {
      logger.error("Failed to fetch employees", { error });
      res.status(500).json({
        status: "error",
        message: "Failed to fetch employees",
      });
    }
  });

  // Create new employee
  app.post("/api/employees", async (req, res) => {
    const startTime = Date.now();
    
    try {
      const employeeData = insertEmployeeSchema.parse(req.body);
      const employee = await storage.createEmployee(employeeData);
      
      // Log the request
      const responseTime = Date.now() - startTime;
      await storage.createRequestLog({
        method: "POST",
        endpoint: "/api/employees",
        statusCode: 201,
        responseTime,
        requestBody: JSON.stringify({ 
          name: employeeData.name, 
          email: employeeData.email 
        }),
      });
      
      logger.info("Employee created", { employeeId: employee.id });
      
      res.status(201).json({
        status: "success",
        employee,
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const isValidationError = error instanceof z.ZodError;
      const statusCode = isValidationError ? 400 : 500;
      
      await storage.createRequestLog({
        method: "POST",
        endpoint: "/api/employees",
        statusCode,
        responseTime,
        requestBody: JSON.stringify({ 
          name: req.body?.name, 
          email: req.body?.email 
        }),
      });
      
      logger.error("Failed to create employee", { error });
      
      if (isValidationError) {
        res.status(400).json({
          status: "error",
          message: "Invalid employee data",
          errors: error.errors,
        });
      } else {
        res.status(500).json({
          status: "error",
          message: "Failed to create employee",
        });
      }
    }
  });

  // Get available employees
  app.get("/api/employees/available", async (req, res) => {
    try {
      const employees = await storage.getAvailableEmployees();
      res.json(employees);
    } catch (error) {
      logger.error("Failed to fetch available employees", { error });
      res.status(500).json({
        status: "error",
        message: "Failed to fetch available employees",
      });
    }
  });

  // Find matching technicians for a job
  app.post("/api/jobs/:id/find-technicians", async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { id: jobId } = req.params;
      
      // Get the job details first
      const jobs = await storage.getRecentJobs(100);
      const job = jobs.find(j => j.id === jobId);
      
      if (!job) {
        return res.status(404).json({
          status: "error",
          message: "Job not found",
        });
      }
      
      // Extract job requirements for matching
      const jobRequirements = {
        jobType: job.jobType || undefined,
        skills: job.jobType ? [job.jobType] : [],
        techsNeeded: job.techsNeeded || 5,
      };
      
      // Find matching technicians
      const matchingTechnicians = await storage.findMatchingTechnicians(jobRequirements);
      
      // Log the request
      const responseTime = Date.now() - startTime;
      await storage.createRequestLog({
        method: "POST",
        endpoint: `/api/jobs/${jobId}/find-technicians`,
        statusCode: 200,
        responseTime,
        requestBody: JSON.stringify({ jobRequirements }),
      });
      
      logger.info("Technician matching completed", { 
        jobId, 
        jobType: job.jobType,
        matchedCount: matchingTechnicians.length 
      });
      
      res.json({
        status: "success",
        job: {
          id: job.id,
          clientEmail: job.clientEmail,
          location: job.location,
          jobType: job.jobType,
          techsNeeded: job.techsNeeded,
        },
        matchingTechnicians,
        totalMatches: matchingTechnicians.length,
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      await storage.createRequestLog({
        method: "POST",
        endpoint: `/api/jobs/${req.params.id}/find-technicians`,
        statusCode: 500,
        responseTime,
        requestBody: null,
      });
      
      logger.error("Failed to find matching technicians", { error });
      res.status(500).json({
        status: "error",
        message: "Failed to find matching technicians",
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
