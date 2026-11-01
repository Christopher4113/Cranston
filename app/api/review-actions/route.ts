import { db } from "@/lib/db";
import { reviewActions } from "@/db/schema";

export async function POST(req: Request) {
  const { findingId, action } = await req.json();
  if (typeof findingId !== "string" || !["approve", "reject", "undo"].includes(action)) return Response.json({ error: "bad request" }, { status: 400 });
  if (!db) return Response.json({ persisted: false }); // replay mode: no database
  await db.insert(reviewActions).values({ findingId, action });
  return Response.json({ persisted: true });
}
