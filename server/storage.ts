import { 
  users, jobs, requestLogs, technicianMatches,
  type User, type InsertUser, 
  type Job, type InsertJob,
  type RequestLog, type InsertRequestLog,
  type TechnicianMatch, type InsertTechnicianMatch
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
  getJobById(id: string): Promise<Job | undefined>;
  getRecentJobs(limit?: number): Promise<Job[]>;
  updateJob(id: string, data: Partial<Job>): Promise<Job | undefined>;
  
  // Request logging methods
  createRequestLog(insertLog: InsertRequestLog): Promise<RequestLog>;
  getRequestLogs(limit?: number): Promise<RequestLog[]>;
  
  // Technician matching methods
  createTechnicianMatch(insertMatch: InsertTechnicianMatch): Promise<TechnicianMatch>;
  getTechnicianMatches(jobId: string): Promise<TechnicianMatch[]>;
  updateJobStaffing(jobId: string, proposedStaffing: string, matchScore?: number): Promise<Job | undefined>;
  deleteJob(id: string): Promise<boolean>;
  
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

  async getJobById(id: string): Promise<Job | undefined> {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    return job || undefined;
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

  async createTechnicianMatch(insertMatch: InsertTechnicianMatch): Promise<TechnicianMatch> {
    const [match] = await db
      .insert(technicianMatches)
      .values(insertMatch)
      .returning();
    return match;
  }

  async getTechnicianMatches(jobId: string): Promise<TechnicianMatch[]> {
    return await db
      .select()
      .from(technicianMatches)
      .where(eq(technicianMatches.jobId, jobId))
      .orderBy(desc(technicianMatches.matchScore));
  }

  async updateJobStaffing(jobId: string, proposedStaffing: string, matchScore?: number): Promise<Job | undefined> {
    const updateData: any = { proposedStaffing };
    if (matchScore !== undefined) {
      updateData.matchScore = matchScore;
    }

    const [job] = await db
      .update(jobs)
      .set(updateData)
      .where(eq(jobs.id, jobId))
      .returning();
    return job || undefined;
  }

  async deleteJob(id: string): Promise<boolean> {
    try {
      const result = await db.delete(jobs).where(eq(jobs.id, id));
      return result.rowCount! > 0;
    } catch (error) {
      console.error('Failed to delete job:', error);
      return false;
    }
  }

  async updateJob(id: string, data: Partial<Job>): Promise<Job | undefined> {
    const [job] = await db
      .update(jobs)
      .set(data)
      .where(eq(jobs.id, id))
      .returning();
    return job || undefined;
  }
}

export const storage = new DatabaseStorage();