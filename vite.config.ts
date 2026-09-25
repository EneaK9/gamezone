import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, loadEnv, type Connect, type Plugin } from "vite";
import { allowRequest, BadRequest, handleTalk } from "./server/talk";

/** Serves POST /api/talk from the dev and preview servers (Vercel uses api/talk.ts). */
function talkApi(env: Record<string, string>): Plugin {
  const handler: Connect.NextHandleFunction = (req: IncomingMessage, res: ServerResponse, next) => {
    if (req.url?.split("?")[0] !== "/api/talk") return next();
    const send = (status: number, body: unknown) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(body));
    };
    if (req.method !== "POST") return send(405, { error: "POST only" });
    if (!allowRequest(req.socket.remoteAddress ?? "local")) return send(429, { error: "Too many requests" });

    let raw = "";
    req.on("data", (chunk: Buffer) => {
      raw += chunk;
      if (raw.length > 32_000) req.destroy();
    });
    req.on("end", async () => {
      try {
        const result = await handleTalk(JSON.parse(raw || "{}"), {
          apiKey: env.TYPESAFE_API_KEY || process.env.TYPESAFE_API_KEY,
          model: env.TYPESAFE_MODEL || process.env.TYPESAFE_MODEL,
        });
        send(200, result);
      } catch (err) {
        if (err instanceof BadRequest || err instanceof SyntaxError) return send(400, { error: err.message });
        console.error(err);
        send(500, { error: "Internal error" });
      }
    });
  };
  return {
    name: "kazemura-talk-api",
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load every variable (not just VITE_*) for the server side only. Nothing here is
  // exposed to the browser bundle.
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [talkApi(env)],
    server: { port: 5173, open: false },
    build: {
      target: "es2022",
      chunkSizeWarningLimit: 2000,
    },
  };
});
