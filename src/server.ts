/** biome-ignore-all lint/suspicious/noExplicitAny: mcp types files are not correct */
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import dotenv from "dotenv";
import express from "express";
import pg from "pg";
import z from "zod";

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
const pool = new pg.Pool({
  connectionString: DATABASE_URL,
});
const SCHEMA_PATH = "schema";

// Create an MCP server
const server = new McpServer({
  name: "demo-server",
  version: "1.0.0",
});

// @ts-expect-error types bad.
server.registerResource(
  "Table Schema",
  new ResourceTemplate("table://{tableName}/schema", {
    // @ts-expect-error: types bad
    list: async () => {
      const client = await pool.connect();
      try {
        const result = await client.query(
          "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
        );

        return {
          resources: result.rows.map((row: any) => {
            const tableName = row.table_name;
            return {
              uri: `table://${tableName}/schema`,
              mimeType: "application/json",
              name: `"${tableName}" database schema`,
            };
          }),
        };
      } catch (err) {
        console.error("err", err);
      } finally {
        client.release();
      }
    },
  }) as unknown as string,
  {
    title: "Table schemas",
    description: "Individual Table Schema",
  },
  async (uri, { tableName }: { tableName: string }) => {
    const pathComponents = uri.href.split("/");
    const schema = pathComponents.pop();
    console.log("table", tableName);

    if (schema !== SCHEMA_PATH) {
      throw new Error("Invalid resource URI");
    }

    const client = await pool.connect();
    try {
      const result = await client.query(
        "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1",
        [tableName]
      );

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(result.rows, null, 2),
          },
        ],
      };
    } finally {
      client.release();
    }
  }
);

// Add an addition tool
server.registerTool(
  "execute-read-queries",
  {
    title: "Query Runner",
    description: "Runs a read-only query in postgres",
    inputSchema: {
      sql: z.string().describe("Read-only query"),
    },
    outputSchema: { result: z.array(z.any()) },
  },
  async ({ sql }) => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN TRANSACTION READ ONLY");
      const result = await client.query(sql);
      console.log(result.rows, "result");
      const output = { result: result.rows };
      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        isError: false,
        structuredContent: output,
      };
    } finally {
      client
        .query("ROLLBACK")
        .catch((error) =>
          console.warn("Could not roll back transaction:", error)
        );

      client.release();
    }
  }
);

// Set up Express and HTTP transport
const app = express();
app.use(express.json());

app.get("/", (_req, res) => {
  res.end("hello");
});

app.post("/mcp", async (req, res) => {
  // Create a new transport for each request to prevent request ID collisions
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on("close", () => {
    transport.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const port = Number.parseInt(process.env.PORT || "8080", 10);
app
  .listen(port, () => {
    console.log(`Demo MCP Server running on http://localhost:${port}/mcp`);
  })
  .on("error", (error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
