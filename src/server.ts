/** biome-ignore-all lint/suspicious/noExplicitAny: mcp types files are not correct */
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import dotenv from "dotenv";
import express from "express";
import pg from "pg";
import { z } from "zod";

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
const pool = new pg.Pool({
  connectionString: DATABASE_URL,
});
console.log(DATABASE_URL, "env");
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
      const client = await pool.connect().catch((err) => {
        console.log(err);
        return err;
      });
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
  "add",
  {
    title: "Addition Tool",
    description: "Add two numbers",
    inputSchema: {
      a: z.number().describe("First number"),
      b: z.number().describe("Second number"),
    },
    outputSchema: { result: z.number().describe("Result") },
  },
  // biome-ignore lint/suspicious/useAwait: test code
  async ({ a, b }) => {
    const output = { result: a + b };
    return {
      content: [{ type: "text", text: JSON.stringify(output) }],
      structuredContent: output,
    };
  }
);

// Add a dynamic greeting resource
server.registerResource(
  "greeting",
  new ResourceTemplate("greeting://{name}", { list: undefined }),
  {
    title: "Greeting Resource", // Display name for UI
    description: "Dynamic greeting generator",
  },
  async (uri, { name }) => ({
    contents: [
      {
        uri: uri.href,
        text: `Hello, ${name}!`,
      },
    ],
  })
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

const port = Number.parseInt(process.env.PORT || "3000", 10);
app
  .listen(port, () => {
    console.log(`Demo MCP Server running on http://localhost:${port}/mcp`);
  })
  .on("error", (error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
