import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import {
  authenticateApiKey,
  type AuthenticatedRequest,
} from "./middleware/auth";

function createErrorResponse(
  code: string,
  message: string,
  details?: string,
  requestId?: string,
) {
  return {
    error: {
      code,
      message,
      details,
    },
    timestamp: new Date().toISOString(),
    requestId: requestId || `req_${Date.now()}`,
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Apply authentication middleware to all API routes
  app.use("/api", authenticateApiKey);

  // Get database schema endpoint
  app.get("/api/schema", async (req: AuthenticatedRequest, res: Response) => {
    try {
      const token = process.env.AIRTABLE_TOKEN;
      const baseId = process.env.AIRTABLE_BASE_ID;

      if (!token || !baseId) {
        return res
          .status(500)
          .json(
            createErrorResponse(
              "CONFIG_ERROR",
              "Airtable configuration missing",
              "AIRTABLE_TOKEN or AIRTABLE_BASE_ID not configured",
              req.requestId,
            ),
          );
      }

      // Get complete schema from Airtable Metadata API
      const response = await fetch(
        `https://api.airtable.com/v0/meta/bases/${baseId}/tables`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch schema: ${response.statusText}`);
      }

      const schemaData = await response.json();
      res.json(schemaData);
    } catch (error: any) {
      console.error("Schema fetch error:", error);
      res
        .status(500)
        .json(
          createErrorResponse(
            "SCHEMA_FETCH_ERROR",
            "Failed to fetch database schema",
            error.message,
            req.requestId,
          ),
        );
    }
  });

  // Create field in existing table endpoint
  app.post(
    "/api/meta/:table/fields",
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { table } = req.params;
        const { name, type, options } = req.body;

        if (!name || !type) {
          return res
            .status(400)
            .json(
              createErrorResponse(
                "INVALID_REQUEST_BODY",
                "Field name and type are required",
                'Expected: {"name": "Field Name", "type": "text", "options": {...}}',
                req.requestId,
              ),
            );
        }

        const token = process.env.AIRTABLE_TOKEN;
        const baseId = process.env.AIRTABLE_BASE_ID;

        if (!token || !baseId) {
          return res
            .status(500)
            .json(
              createErrorResponse(
                "CONFIG_ERROR",
                "Airtable configuration missing",
                "AIRTABLE_TOKEN or AIRTABLE_BASE_ID not configured",
                req.requestId,
              ),
            );
        }

        // Get table metadata to find table ID
        const schemaResponse = await fetch(
          `https://api.airtable.com/v0/meta/bases/${baseId}/tables`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (!schemaResponse.ok) {
          throw new Error(
            `Failed to fetch schema: ${schemaResponse.statusText}`,
          );
        }

        const schemaData = await schemaResponse.json();
        const tableData = schemaData.tables.find((t: any) => t.name === table);

        if (!tableData) {
          return res
            .status(404)
            .json(
              createErrorResponse(
                "TABLE_NOT_FOUND",
                `Table '${table}' not found`,
                `Available tables: ${schemaData.tables.map((t: any) => t.name).join(", ")}`,
                req.requestId,
              ),
            );
        }

        // Create the new field
        const fieldResponse = await fetch(
          `https://api.airtable.com/v0/meta/bases/${baseId}/tables/${tableData.id}/fields`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name,
              type,
              options: options || {},
            }),
          },
        );

        if (!fieldResponse.ok) {
          const errorData = await fieldResponse.json();
          throw new Error(
            `Failed to create field: ${errorData.error?.message || fieldResponse.statusText}`,
          );
        }

        const result = await fieldResponse.json();
        res.status(201).json(result);
      } catch (error: any) {
        console.error(`Error creating field in ${req.params.table}:`, error);
        res
          .status(500)
          .json(
            createErrorResponse(
              "FIELD_CREATE_ERROR",
              "Failed to create field",
              error.message,
              req.requestId,
            ),
          );
      }
    },
  );

  // Create new table endpoint
  app.post(
    "/api/meta/tables",
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { name, description } = req.body;

        if (!name) {
          return res
            .status(400)
            .json(
              createErrorResponse(
                "INVALID_REQUEST_BODY",
                "Table name is required",
                'Expected: {"name": "Table Name", "description": "Optional description"}',
                req.requestId,
              ),
            );
        }

        const token = process.env.AIRTABLE_TOKEN;
        const baseId = process.env.AIRTABLE_BASE_ID;

        if (!token || !baseId) {
          return res
            .status(500)
            .json(
              createErrorResponse(
                "CONFIG_ERROR",
                "Airtable configuration missing",
                "AIRTABLE_TOKEN or AIRTABLE_BASE_ID not configured",
                req.requestId,
              ),
            );
        }

        // Create new table using Airtable Metadata API
        const tableResponse = await fetch(
          `https://api.airtable.com/v0/meta/bases/${baseId}/tables`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name,
              description: description || "",
              fields: [
                {
                  name: "Name",
                  type: "singleLineText",
                },
              ],
            }),
          },
        );

        if (!tableResponse.ok) {
          const errorData = await tableResponse.json();
          throw new Error(
            `Failed to create table: ${errorData.error?.message || tableResponse.statusText}`,
          );
        }

        const result = await tableResponse.json();
        res.status(201).json(result);
      } catch (error: any) {
        console.error(`Error creating table:`, error);
        res
          .status(500)
          .json(
            createErrorResponse(
              "TABLE_CREATE_ERROR",
              "Failed to create table",
              error.message,
              req.requestId,
            ),
          );
      }
    },
  );

  // Record operations - Create, Read, Update (no Delete per audit requirements)

  // GET /api/:table - Read all records from table
  app.get("/api/:table", async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { table } = req.params;
      const token = process.env.AIRTABLE_TOKEN;
      const baseId = process.env.AIRTABLE_BASE_ID;

      if (!token || !baseId) {
        return res
          .status(500)
          .json(
            createErrorResponse(
              "CONFIG_ERROR",
              "Airtable configuration missing",
              "AIRTABLE_TOKEN or AIRTABLE_BASE_ID not configured",
              req.requestId,
            ),
          );
      }

      // Get records from Airtable
      const response = await fetch(
        `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch records: ${response.statusText}`);
      }

      const data = await response.json();
      res.json({ records: data.records });
    } catch (error: any) {
      console.error(`Error fetching records from ${req.params.table}:`, error);
      res
        .status(500)
        .json(
          createErrorResponse(
            "RECORD_READ_ERROR",
            "Failed to read records",
            error.message,
            req.requestId,
          ),
        );
    }
  });

  // POST /api/:table - Create new record
  app.post("/api/:table", async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { table } = req.params;
      const { fields } = req.body;

      if (!fields) {
        return res
          .status(400)
          .json(
            createErrorResponse(
              "INVALID_REQUEST_BODY",
              "Fields are required",
              'Expected: {"fields": {"Field Name": "value"}}',
              req.requestId,
            ),
          );
      }

      const token = process.env.AIRTABLE_TOKEN;
      const baseId = process.env.AIRTABLE_BASE_ID;

      if (!token || !baseId) {
        return res
          .status(500)
          .json(
            createErrorResponse(
              "CONFIG_ERROR",
              "Airtable configuration missing",
              "AIRTABLE_TOKEN or AIRTABLE_BASE_ID not configured",
              req.requestId,
            ),
          );
      }

      // Create record in Airtable
      const response = await fetch(
        `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ fields }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          `Failed to create record: ${errorData.error?.message || response.statusText}`,
        );
      }

      const result = await response.json();
      res.status(201).json(result);
    } catch (error: any) {
      console.error(`Error creating record in ${req.params.table}:`, error);
      res
        .status(500)
        .json(
          createErrorResponse(
            "RECORD_CREATE_ERROR",
            "Failed to create record",
            error.message,
            req.requestId,
          ),
        );
    }
  });

  // PATCH /api/:table/:recordId - Update existing record
  app.patch(
    "/api/:table/:recordId",
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { table, recordId } = req.params;
        const { fields } = req.body;

        if (!fields) {
          return res
            .status(400)
            .json(
              createErrorResponse(
                "INVALID_REQUEST_BODY",
                "Fields are required",
                'Expected: {"fields": {"Field Name": "value"}}',
                req.requestId,
              ),
            );
        }

        const token = process.env.AIRTABLE_TOKEN;
        const baseId = process.env.AIRTABLE_BASE_ID;

        if (!token || !baseId) {
          return res
            .status(500)
            .json(
              createErrorResponse(
                "CONFIG_ERROR",
                "Airtable configuration missing",
                "AIRTABLE_TOKEN or AIRTABLE_BASE_ID not configured",
                req.requestId,
              ),
            );
        }

        // Update record in Airtable
        const response = await fetch(
          `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}/${recordId}`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ fields }),
          },
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            `Failed to update record: ${errorData.error?.message || response.statusText}`,
          );
        }

        const result = await response.json();
        res.json(result);
      } catch (error: any) {
        console.error(
          `Error updating record ${req.params.recordId} in ${req.params.table}:`,
          error,
        );
        res
          .status(500)
          .json(
            createErrorResponse(
              "RECORD_UPDATE_ERROR",
              "Failed to update record",
              error.message,
              req.requestId,
            ),
          );
      }
    },
  );

  const httpServer = createServer(app);
  return httpServer;
}
