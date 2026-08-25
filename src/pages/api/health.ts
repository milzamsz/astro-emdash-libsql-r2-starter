import type { APIRoute } from "astro";

export const prerender = false;

type HealthDb = {
  selectFrom(table: string): {
    select(column: string): {
      limit(count: number): { execute(): Promise<unknown> };
    };
  };
};

export const GET: APIRoute = async ({ locals }) => {
  const emdash = (locals as { emdash?: { db?: HealthDb } }).emdash;
  try {
    if (!emdash?.db) throw new Error("database unavailable");
    await emdash.db.selectFrom("options").select("name").limit(1).execute();
    return Response.json(
      { status: "ok", database: "reachable" },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "degraded", database: "unreachable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
};
