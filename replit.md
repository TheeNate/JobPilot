# Overview

The Scheduler Core is a backend microservice designed to handle email-based job scheduling requests. It accepts job requests via email webhooks, parses the email content to extract job details (location, date, time, technician requirements), stores the data in a PostgreSQL database, and will eventually match jobs with qualified employees and send confirmation emails. The current implementation focuses on job intake and data persistence, with employee matching and email reply functionality planned for future development.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
The application uses a React-based dashboard built with TypeScript and modern tooling:
- **React 18** with functional components and hooks
- **Vite** as the build tool for fast development and optimized production builds
- **Tailwind CSS** for styling with shadcn/ui component library
- **TanStack Query** for server state management and API calls
- **Wouter** for lightweight client-side routing

The frontend serves as an administrative dashboard for monitoring the backend service, displaying job intake logs, system health, and API documentation.

## Backend Architecture
The backend is a Node.js Express application with the following key components:
- **Express.js** server with TypeScript for type safety
- **RESTful API** design with structured route handling
- **Modular architecture** separating concerns (routes, services, storage)
- **Request logging middleware** for monitoring and debugging
- **Health check endpoints** for service monitoring

### API Structure
- `POST /api/job-intake` - Accepts email webhook payloads and processes job requests
- `GET /api/health` - Service health and database connectivity check
- `GET /api/stats` - Service statistics and metrics
- `GET /api/logs` - Request logs and monitoring data

## Data Storage Solutions
The application uses PostgreSQL as its primary database with the following design decisions:
- **Drizzle ORM** for type-safe database queries and schema management
- **Neon Database** as the PostgreSQL provider for serverless scalability
- **Schema-driven development** with TypeScript integration
- **Connection pooling** for efficient database resource management

### Database Schema
- **jobs** table for storing parsed job requests
- **employees** table for technician information and skills
- **job_assignments** table for linking jobs to assigned employees
- **request_logs** table for API monitoring and audit trails
- **users** table for system authentication (future feature)

## Email Processing Pipeline
The service implements a structured approach to email processing:
1. **Webhook Reception** - Accepts JSON payloads from upstream email services
2. **Payload Validation** - Uses Zod schemas for input validation
3. **Email Parsing** - Extracts job details using pattern matching
4. **Data Persistence** - Stores parsed information in PostgreSQL
5. **Logging** - Records all requests for monitoring and debugging

## AI-Powered Technician Matching
The application features intelligent team-based technician matching using Claude AI:
- **Strategic Team Building** - Analyzes job requirements and builds appropriate team compositions
- **Role Assignment** - Assigns Lead, Specialist, and Support roles based on certifications and experience
- **Team Dynamics Analysis** - Provides coordination plans and team compatibility assessments
- **Alternative Teams** - Suggests multiple team configurations for multi-technician jobs
- **Fallback Logic** - Uses enhanced logic-based matching when AI is unavailable

### Team Matching Features
- **Single-Tech Jobs** - Recommends best individual technician with alternatives
- **Multi-Tech Jobs** - Builds complete team with roles, dynamics, and coordination plans
- **Alternative Teams** - Provides 2-3 alternative team compositions with reasoning
- **Certification Matching** - Matches NDT certifications (UT, RT, MT, PT, VT) to job requirements
- **Safety Coverage** - Ensures safety-critical skills (rope access, confined space) are covered

## Development and Deployment
- **TypeScript** throughout the stack for type safety
- **ESM modules** for modern JavaScript practices
- **Environment-based configuration** for different deployment targets
- **Monorepo structure** with shared types between frontend and backend
- **Database migrations** using Drizzle Kit for schema versioning

# External Dependencies

## Database Services
- **Neon Database** - PostgreSQL hosting with serverless architecture
- **Drizzle ORM** - Type-safe database toolkit and query builder
- **connect-pg-simple** - PostgreSQL session store for Express sessions

## Email Processing
- **Mailgun** (planned) - Email service for sending reply confirmations
- Currently accepts webhook payloads but email sending is not yet implemented

## AI and External Services
- **Anthropic Claude API** - AI-powered technician matching and job analysis
- **Airtable** - Technician database and availability tracking

## Frontend Libraries
- **Radix UI** - Accessible component primitives for the dashboard
- **shadcn/ui** - Pre-built component library built on Radix UI
- **Lucide React** - Icon library for consistent UI iconography
- **TanStack Query** - Server state management and caching

## Development Tools
- **Vite** - Build tool and development server
- **TypeScript** - Static type checking
- **Tailwind CSS** - Utility-first CSS framework
- **Replit Plugins** - Development environment enhancements