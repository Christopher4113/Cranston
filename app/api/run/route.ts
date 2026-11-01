import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { saveRun } from "@/lib/db";
import { parseQbo } from "@/lib/import/qbo";
import { runPipeline } from "@/lib/pipeline";

const MAX_BYTES = 5_000_000;

/** Live mode: run the real pipeline on the sample client or uploaded QBO CSVs. Gated by DEMO_PASSWORD. */
export async function POST(req: Request) {
  const pw = process.env.DEMO_PASSWORD;
  if (!pw) return Response.json({ error: "Live mode is off: DEMO_PASSWORD is not set." }, { status: 403 });
  if (req.headers.get("x-demo-password") !== pw) return Response.json({ error: "Wrong password." }, { status: 401 });
  const form = await req.formData();
  const uploads = form.getAll("files").filter((f): f is File => f instanceof File);
  let files: Record<string, string>;
  if (uploads.length) {
    if (uploads.reduce((s, f) => s + f.size, 0) > MAX_BYTES) return Response.json({ error: "Upload too large (5 MB max)." }, { status: 413 });
    files = Object.fromEntries(await Promise.all(uploads.map(async (f) => [f.name, await f.text()] as const)));
  } else {
    const dir = join(process.cwd(), "data/qbo");
    files = Object.fromEntries(readdirSync(dir).map((f) => [f, readFileSync(join(dir, f), "utf8")]));
  }
  try {
    const run = await runPipeline(parseQbo(files), uploads.length ? "Uploaded client" : undefined);
    await saveRun(run);
    return Response.json(run);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Run failed" }, { status: 400 });
  }
}
