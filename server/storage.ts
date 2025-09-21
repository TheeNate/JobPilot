import { 
  users, jobs, requestLogs, connectedServices, serviceEnvironmentVariables,
  type User, type InsertUser, 
  type Job, type InsertJob,
  type RequestLog, type InsertRequestLog,
  type ConnectedService, type InsertConnectedService,
  type ServiceEnvironmentVariable, type InsertServiceEnvironmentVariable
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, count, avg, gte, and, lt } from "drizzle-orm";

// Storage interface definition
export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(insertUser: InsertUser): Promise<User>;
  
  // Job methods
  createJob(insertJob: InsertJob): Promise<Job>;
  getRecentJobs(limit?: number): Promise<Job[]>;
  
  // Request logging methods
  createRequestLog(insertLog: InsertRequestLog): Promise<RequestLog>;
  getRequestLogs(limit?: number): Promise<RequestLog[]>;
  
  // Connected services methods
  createConnectedService(service: InsertConnectedService): Promise<ConnectedService>;
  getConnectedServices(): Promise<ConnectedService[]>;
  updateConnectedService(id: string, updates: Partial<InsertConnectedService>): Promise<ConnectedService>;
  deleteConnectedService(id: string): Promise<void>;
  
  // Environment variable methods
  createServiceEnvironmentVariable(envVar: InsertServiceEnvironmentVariable): Promise<ServiceEnvironmentVariable>;
  getServiceEnvironmentVariables(serviceId?: string): Promise<ServiceEnvironmentVariable[]>;
  updateServiceEnvironmentVariable(id: string, updates: Partial<InsertServiceEnvironmentVariable>): Promise<ServiceEnvironmentVariable>;
  deleteServiceEnvironmentVariable(id: string): Promise<void>;
  syncEnvironmentVariablesForService(serviceId: string, serviceType: string): Promise<ServiceEnvironmentVariable[]>;
  
  // Health and stats methods
  checkConnection(): Promise<boolean>;
  getServiceStats(): Promise<{
    jobsToday: number;
    jobsGrowth: number;
    averageResponseTime: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  async checkConnection(): Promise<boolean> {
    try {
      await db.select().from(users).limit(1);
      return true;
    } catch (error) {
      console.error('Database connection failed:', error);
      return false;
    }
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async createJob(insertJob: InsertJob): Promise<Job> {
    const [job] = await db
      .insert(jobs)
      .values(insertJob)
      .returning();
    return job;
  }

  async getRecentJobs(limit = 20): Promise<Job[]> {
    return await db
      .select()
      .from(jobs)
      .orderBy(desc(jobs.createdAt))
      .limit(limit);
  }

  async createRequestLog(insertLog: InsertRequestLog): Promise<RequestLog> {
    const [log] = await db
      .insert(requestLogs)
      .values(insertLog)
      .returning();
    return log;
  }

  async getRequestLogs(limit = 50): Promise<RequestLog[]> {
    return await db
      .select()
      .from(requestLogs)
      .orderBy(desc(requestLogs.timestamp))
      .limit(limit);
  }

  async createConnectedService(service: InsertConnectedService): Promise<ConnectedService> {
    const [createdService] = await db
      .insert(connectedServices)
      .values(service)
      .returning();
    return createdService;
  }

  async getConnectedServices(): Promise<ConnectedService[]> {
    return await db
      .select()
      .from(connectedServices)
      .orderBy(desc(connectedServices.createdAt));
  }

  async updateConnectedService(id: string, updates: Partial<InsertConnectedService>): Promise<ConnectedService> {
    const [updatedService] = await db
      .update(connectedServices)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(connectedServices.id, id))
      .returning();
    
    if (!updatedService) {
      throw new Error("Service not found");
    }
    
    return updatedService;
  }

  async deleteConnectedService(id: string): Promise<void> {
    const result = await db
      .delete(connectedServices)
      .where(eq(connectedServices.id, id))
      .returning();
    
    if (result.length === 0) {
      throw new Error("Service not found");
    }
  }

  async getServiceStats(): Promise<{
    jobsToday: number;
    jobsGrowth: number;
    averageResponseTime: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Jobs today
    const [todayCount] = await db
      .select({ count: count() })
      .from(jobs)
      .where(gte(jobs.createdAt, today));

    // Jobs yesterday
    const [yesterdayCount] = await db
      .select({ count: count() })
      .from(jobs)
      .where(and(
        gte(jobs.createdAt, yesterday),
        lt(jobs.createdAt, today)
      ));

    // Average response time
    const [avgResponse] = await db
      .select({ avg: avg(requestLogs.responseTime) })
      .from(requestLogs)
      .where(gte(requestLogs.timestamp, today));

    const jobsToday = todayCount?.count || 0;
    const jobsYesterday = yesterdayCount?.count || 0;
    const jobsGrowth = jobsYesterday > 0 ? 
      Math.round(((jobsToday - jobsYesterday) / jobsYesterday) * 100) : 0;

    return {
      jobsToday,
      jobsGrowth,
      averageResponseTime: Math.round(Number(avgResponse?.avg) || 0),
    };
  }

  // Environment variable methods
  async createServiceEnvironmentVariable(envVar: InsertServiceEnvironmentVariable): Promise<ServiceEnvironmentVariable> {
    const [createdEnvVar] = await db
      .insert(serviceEnvironmentVariables)
      .values(envVar)
      .returning();
    return createdEnvVar;
  }

  async getServiceEnvironmentVariables(serviceId?: string): Promise<ServiceEnvironmentVariable[]> {
    if (serviceId) {
      return await db
        .select()
        .from(serviceEnvironmentVariables)
        .where(eq(serviceEnvironmentVariables.serviceId, serviceId))
        .orderBy(desc(serviceEnvironmentVariables.createdAt));
    }
    
    return await db
      .select()
      .from(serviceEnvironmentVariables)
      .orderBy(desc(serviceEnvironmentVariables.createdAt));
  }

  async updateServiceEnvironmentVariable(id: string, updates: Partial<InsertServiceEnvironmentVariable>): Promise<ServiceEnvironmentVariable> {
    const [updatedEnvVar] = await db
      .update(serviceEnvironmentVariables)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(serviceEnvironmentVariables.id, id))
      .returning();
    
    if (!updatedEnvVar) {
      throw new Error("Environment variable not found");
    }
    
    return updatedEnvVar;
  }

  async deleteServiceEnvironmentVariable(id: string): Promise<void> {
    const result = await db
      .delete(serviceEnvironmentVariables)
      .where(eq(serviceEnvironmentVariables.id, id))
      .returning();
    
    if (result.length === 0) {
      throw new Error("Environment variable not found");
    }
  }

  async syncEnvironmentVariablesForService(serviceId: string, serviceType: string): Promise<ServiceEnvironmentVariable[]> {
    // Define required environment variables for each service type
    const serviceTypeRequirements: Record<string, Array<{
      variableName: string;
      description: string;
      isRequired: boolean;
    }>> = {
      'technician-matching': [
        {
          variableName: 'TECHNICIAN_MATCHING_API_KEY',
          description: 'API key for technician matching service authentication',
          isRequired: true,
        },
        {
          variableName: 'TECHNICIAN_MATCHING_WEBHOOK_URL',
          description: 'Webhook URL for receiving technician matching updates',
          isRequired: false,
        },
        {
          variableName: 'TECHNICIAN_MATCHING_TIMEOUT',
          description: 'Request timeout for technician matching API calls (ms)',
          isRequired: false,
        },
      ],
      'notification': [
        {
          variableName: 'NOTIFICATION_API_KEY',
          description: 'API key for notification service authentication',
          isRequired: true,
        },
        {
          variableName: 'NOTIFICATION_SENDER_ID',
          description: 'Sender ID for notification service',
          isRequired: true,
        },
        {
          variableName: 'NOTIFICATION_WEBHOOK_SECRET',
          description: 'Secret for validating notification webhooks',
          isRequired: false,
        },
      ],
      'email': [
        {
          variableName: 'EMAIL_SERVICE_API_KEY',
          description: 'API key for email service authentication',
          isRequired: true,
        },
        {
          variableName: 'EMAIL_FROM_ADDRESS',
          description: 'From email address for outgoing emails',
          isRequired: true,
        },
        {
          variableName: 'EMAIL_TEMPLATE_ID',
          description: 'Default email template ID',
          isRequired: false,
        },
      ],
      'integration': [
        {
          variableName: 'INTEGRATION_API_KEY',
          description: 'API key for integration service authentication',
          isRequired: true,
        },
        {
          variableName: 'INTEGRATION_CLIENT_ID',
          description: 'Client ID for OAuth integration',
          isRequired: false,
        },
        {
          variableName: 'INTEGRATION_CLIENT_SECRET',
          description: 'Client secret for OAuth integration',
          isRequired: false,
        },
      ],
    };

    const requirements = serviceTypeRequirements[serviceType] || [];
    const syncedVariables: ServiceEnvironmentVariable[] = [];

    // Get existing environment variables for this service
    const existingVars = await this.getServiceEnvironmentVariables(serviceId);
    const existingVarNames = new Set(existingVars.map(v => v.variableName));

    // Create missing environment variables
    for (const requirement of requirements) {
      if (!existingVarNames.has(requirement.variableName)) {
        const envVar = await this.createServiceEnvironmentVariable({
          serviceId,
          variableName: requirement.variableName,
          variableValue: null,
          description: requirement.description,
          isRequired: requirement.isRequired,
          isConfigured: false,
          serviceType,
        });
        syncedVariables.push(envVar);
      }
    }

    return syncedVariables;
  }
}

export const storage = new DatabaseStorage();