import { getDb } from "emdash/runtime";
import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const db = await getDb();
    await db.selectFrom("options").select("name").limit(1).execute();
    return Response.json(
      { status: "ok", database: "reachable" },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[health] database check failed:", error);
    return Response.json(
      { status: "degraded", database: "unreachable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
};
