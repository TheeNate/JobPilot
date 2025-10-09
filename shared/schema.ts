import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, uuid, date, time } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  clientEmail: varchar("client_email", { length: 255 }).notNull(),
  subject: text("subject").notNull(),
  bodyPlain: text("body_plain").notNull(),
  location: varchar("location", { length: 255 }),
  scheduledDate: varchar("scheduled_date", { length: 100 }),
  scheduledTime: varchar("scheduled_time", { length: 50 }),
  jobType: varchar("job_type", { length: 100 }),
  techsNeeded: integer("techs_needed"),
  proposedStaffing: text("proposed_staffing"),
  matchScore: integer("match_score"),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  googleDocId: varchar("google_doc_id", { length: 255 }),
  googleDocUrl: text("google_doc_url"),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
});

export const employees = pgTable("employees", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  skills: text("skills").array(),
  isAvailable: text("is_available").notNull().default("true"),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
});

export const jobAssignments = pgTable("job_assignments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: uuid("job_id").notNull().references(() => jobs.id),
  employeeId: uuid("employee_id").notNull().references(() => employees.id),
  assignedAt: timestamp("assigned_at").default(sql`now()`).notNull(),
});

export const requestLogs = pgTable("request_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  method: varchar("method", { length: 10 }).notNull(),
  endpoint: varchar("endpoint", { length: 255 }).notNull(),
  statusCode: integer("status_code").notNull(),
  responseTime: integer("response_time"),
  requestBody: text("request_body"),
  timestamp: timestamp("timestamp").default(sql`now()`).notNull(),
});

// Relations
export const jobsRelations = relations(jobs, ({ many }) => ({
  assignments: many(jobAssignments),
}));

export const employeesRelations = relations(employees, ({ many }) => ({
  assignments: many(jobAssignments),
}));

export const jobAssignmentsRelations = relations(jobAssignments, ({ one }) => ({
  job: one(jobs, {
    fields: [jobAssignments.jobId],
    references: [jobs.id],
  }),
  employee: one(employees, {
    fields: [jobAssignments.employeeId],
    references: [employees.id],
  }),
}));

// Technician matches table for AI-powered matching
export const technicianMatches = pgTable("technician_matches", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  technicianId: varchar("technician_id", { length: 255 }).notNull(),
  technicianName: varchar("technician_name", { length: 255 }).notNull(),
  matchScore: integer("match_score").notNull(),
  availability: varchar("availability", { length: 50 }).notNull(),
  skills: text("skills").array(),
  distance: integer("distance"),
  certifications: text("certifications").array(),
  notes: text("notes"),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertJobSchema = createInsertSchema(jobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEmployeeSchema = createInsertSchema(employees).omit({
  id: true,
  createdAt: true,
});

export const insertRequestLogSchema = createInsertSchema(requestLogs).omit({
  id: true,
  timestamp: true,
});

export const insertTechnicianMatchSchema = createInsertSchema(technicianMatches).omit({
  id: true,
  createdAt: true,
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobs.$inferSelect;

export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employees.$inferSelect;

export type InsertRequestLog = z.infer<typeof insertRequestLogSchema>;
export type RequestLog = typeof requestLogs.$inferSelect;

export type JobAssignment = typeof jobAssignments.$inferSelect;

export type InsertTechnicianMatch = z.infer<typeof insertTechnicianMatchSchema>;
export type TechnicianMatch = typeof technicianMatches.$inferSelect;
