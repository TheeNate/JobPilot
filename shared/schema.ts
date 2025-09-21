import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, uuid, date, time, boolean } from "drizzle-orm/pg-core";
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
  status: varchar("status", { length: 50 }).notNull().default("pending"),
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

export const connectedServices = pgTable("connected_services", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceName: varchar("service_name", { length: 255 }).notNull(),
  serviceUrl: varchar("service_url", { length: 500 }).notNull(),
  serviceType: varchar("service_type", { length: 100 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("inactive"),
  lastTested: timestamp("last_tested"),
  connectionStatus: varchar("connection_status", { length: 50 }).notNull().default("unknown"),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
});

export const serviceEnvironmentVariables = pgTable("service_environment_variables", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceId: uuid("service_id").references(() => connectedServices.id, { onDelete: "cascade" }),
  variableName: varchar("variable_name", { length: 255 }).notNull(),
  variableValue: text("variable_value"),
  description: text("description"),
  isRequired: boolean("is_required").notNull().default(true),
  isConfigured: boolean("is_configured").notNull().default(false),
  serviceType: varchar("service_type", { length: 100 }).notNull(),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
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

export const connectedServicesRelations = relations(connectedServices, ({ many }) => ({
  environmentVariables: many(serviceEnvironmentVariables),
}));

export const serviceEnvironmentVariablesRelations = relations(serviceEnvironmentVariables, ({ one }) => ({
  service: one(connectedServices, {
    fields: [serviceEnvironmentVariables.serviceId],
    references: [connectedServices.id],
  }),
}));

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

export const insertConnectedServiceSchema = createInsertSchema(connectedServices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  serviceUrl: z.string().url().refine((url) => {
    try {
      const parsed = new URL(url);
      
      // Only allow HTTP and HTTPS protocols
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return false;
      }
      
      // Only allow standard ports for security
      const port = parsed.port ? parseInt(parsed.port) : (parsed.protocol === 'https:' ? 443 : 80);
      if (![80, 443].includes(port)) {
        return false;
      }
      
      // Block private IP ranges and localhost
      const hostname = parsed.hostname.toLowerCase();
      
      // Block localhost and loopback variations (IPv4)
      if (['localhost', '0.0.0.0'].includes(hostname)) {
        return false;
      }
      
      // Block all IPv4 private, loopback, link-local, and special-use ranges
      const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
      const ipv4Match = hostname.match(ipv4Regex);
      if (ipv4Match) {
        const [, a, b, c, d] = ipv4Match.map(Number);
        
        // Validate IP format (0-255 for each octet)
        if (a > 255 || b > 255 || c > 255 || d > 255) {
          return false;
        }
        
        // Block dangerous IP ranges
        if (
          (a === 0) ||                           // 0.0.0.0/8 - "This network"
          (a === 127) ||                         // 127.0.0.0/8 - Loopback
          (a === 10) ||                          // 10.0.0.0/8 - Private
          (a === 172 && b >= 16 && b <= 31) ||   // 172.16.0.0/12 - Private
          (a === 192 && b === 168) ||            // 192.168.0.0/16 - Private
          (a === 169 && b === 254) ||            // 169.254.0.0/16 - Link-local
          (a === 100 && b >= 64 && b <= 127) ||  // 100.64.0.0/10 - CGNAT
          (a === 192 && b === 0 && c === 0) ||   // 192.0.0.0/24 - Special-use
          (a === 198 && b >= 18 && b <= 19) ||   // 198.18.0.0/15 - Benchmark
          (a >= 224)                             // 224.0.0.0/4 - Multicast/Reserved
        ) {
          return false;
        }
      }
      
      // Block IPv6 private and special ranges (basic patterns)
      if (hostname.includes(':')) {
        const lower = hostname.toLowerCase();
        if (
          lower === '::1' ||                     // Loopback
          lower.startsWith('fc') ||              // fc00::/7 - Unique local
          lower.startsWith('fd') ||              // fd00::/8 - Unique local  
          lower.startsWith('fe8') ||             // fe80::/10 - Link-local
          lower.startsWith('fe9') ||
          lower.startsWith('fea') ||
          lower.startsWith('feb') ||
          lower.startsWith('::ffff:')            // IPv4-mapped IPv6
        ) {
          return false;
        }
      }
      
      return true;
    } catch {
      return false;
    }
  }, {
    message: "URL must be http/https on port 80/443 and not target private/internal networks"
  }),
  status: z.enum(['active', 'inactive']).default('inactive')
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

export const insertServiceEnvironmentVariableSchema = createInsertSchema(serviceEnvironmentVariables).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertConnectedService = z.infer<typeof insertConnectedServiceSchema>;
export type ConnectedService = typeof connectedServices.$inferSelect;

export type InsertServiceEnvironmentVariable = z.infer<typeof insertServiceEnvironmentVariableSchema>;
export type ServiceEnvironmentVariable = typeof serviceEnvironmentVariables.$inferSelect;

export type JobAssignment = typeof jobAssignments.$inferSelect;
