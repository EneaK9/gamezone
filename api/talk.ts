// Vercel serverless function: POST /api/talk. Set TYPESAFE_API_KEY in the project's
// environment variables. See server/talk.ts for what it does.

import { allowRequest, BadRequest, handleTalk } from "../server/talk";

export async function POST(request: Request): Promise<Response> {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!allowRequest(ip)) return Response.json({ error: "Too many requests" }, { status: 429 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }
  try {
    const result = await handleTalk(body, { apiKey: process.env.TYPESAFE_API_KEY, model: process.env.TYPESAFE_MODEL });
    return Response.json(result);
  } catch (err) {
    if (err instanceof BadRequest) return Response.json({ error: err.message }, { status: 400 });
    console.error(err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
