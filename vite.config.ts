import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, runnerImport, type Connect, type Plugin } from "vite";

type TalkModule = typeof import("./server/talk");

const TALK_MODULE = fileURLToPath(new URL("./server/talk.ts", import.meta.url));

/**
 * Serves POST /api/talk from the dev and preview servers (Vercel uses api/talk.ts).
 * The server code is loaded through Vite rather than imported by this config, so edits
 * to server/ and shared/ apply without restarting the dev server.
 */
function talkApi(env: Record<string, string>): Plugin {
  const middleware =
    (load: () => Promise<TalkModule>): Connect.NextHandleFunction =>
    async (req: IncomingMessage, res: ServerResponse, next) => {
      if (req.url?.split("?")[0] !== "/api/talk") return next();
      const send = (status: number, body: unknown) => {
        res.statusCode = status;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(body));
      };
      if (req.method !== "POST") return send(405, { error: "POST only" });
      let api: TalkModule;
      try {
        api = await load();
      } catch (err) {
        console.error(err);
        return send(500, { error: "Internal error" });
      }
      if (!api.allowRequest(req.socket.remoteAddress ?? "local")) return send(429, { error: "Too many requests" });

      let raw = "";
      req.on("data", (chunk: Buffer) => {
        raw += chunk;
        if (raw.length > 32_000) req.destroy();
      });
      req.on("end", async () => {
        try {
          const result = await api.handleTalk(JSON.parse(raw || "{}"), {
            apiKey: env.TYPESAFE_API_KEY || process.env.TYPESAFE_API_KEY,
            model: env.TYPESAFE_MODEL || process.env.TYPESAFE_MODEL,
          });
          send(200, result);
        } catch (err) {
          if (err instanceof api.BadRequest || err instanceof SyntaxError) return send(400, { error: err.message });
          console.error(err);
          send(500, { error: "Internal error" });
        }
      });
    };
  return {
    name: "kazemura-talk-api",
    configureServer(server) {
      server.middlewares.use(middleware(() => server.ssrLoadModule(TALK_MODULE) as Promise<TalkModule>));
    },
    configurePreviewServer(server) {
      let loaded: Promise<TalkModule> | undefined;
      const load = () =>
        (loaded ??= runnerImport<TalkModule>(TALK_MODULE).then(
          (r) => r.module,
          (err) => {
            loaded = undefined; // retry on the next request
            throw err;
          },
        ));
      server.middlewares.use(middleware(load));
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
