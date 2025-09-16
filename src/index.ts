import { Hono } from "hono";
import { logger } from "hono/logger";
// Hono with auth does not play nicely with @modelcontextprotocol/sdk yet, so we use the mcp-lite package
import { McpServer, StreamableHttpTransport } from "mcp-lite";
import { createClerkClient } from "@clerk/backend";
import {
  mcpAuthClerk,
  oauthCorsMiddleware,
  protectedResourceHandlerClerk,
  authServerMetadataHandlerClerk,
} from "@bretterplane/mcp-tools/hono";

type AppType = {
  Bindings: {
    CLERK_SECRET_KEY: string;
    CLERK_PUBLISHABLE_KEY: string;
  }
};

const app = new Hono<AppType>();

const server = new McpServer({
  name: "clerk-mcp-server",
  version: "1.0.0",
});

server.tool(
  "get_clerk_user_data",
  {
    description: "Gets data about the Clerk user that authorized this request",
    handler: async (_, { authInfo }) => {
      const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

      if (!authInfo?.extra?.userId) {
        return {
          content: [{ type: "text", text: "Error: user not authenticated" }],
        };
      }

      const user = await clerk.users.getUser(authInfo?.extra?.userId as string);
      return {
        content: [{ type: "text", text: JSON.stringify(user) }],
      };
    }
  }
);

app.use(logger());

app.on(
  ["GET", "OPTIONS"],
  "/.well-known/oauth-protected-resource",
  oauthCorsMiddleware, // <-- cors middleware is helpful for testing in the inspector
  protectedResourceHandlerClerk()
);
app.on(
  ["GET", "OPTIONS"],
  "/.well-known/oauth-protected-resource/mcp",
  oauthCorsMiddleware,
  protectedResourceHandlerClerk({
    scopes_supported: ["profile", "email"],
  })
);
app.on(
  ["GET", "OPTIONS"],
  "/.well-known/oauth-authorization-server",
  oauthCorsMiddleware,
  authServerMetadataHandlerClerk
);

app.post("/mcp", mcpAuthClerk, async (c) => {
  const authInfo = c.get("auth");
  const transport = new StreamableHttpTransport();
  const mcpHttpHandler = transport.bind(server);
  const response = await mcpHttpHandler(c.req.raw, { authInfo });
  return response;
});

export default app;
