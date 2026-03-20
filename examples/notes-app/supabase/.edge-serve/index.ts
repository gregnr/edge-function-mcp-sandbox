import { STATUS_CODE, STATUS_TEXT } from "https://deno.land/std/http/status.ts";

const EXCLUDED_ENVS = ["HOME", "HOSTNAME", "PATH", "PWD"];

const HOST_PORT = Deno.env.get("SUPABASE_INTERNAL_HOST_PORT")!;
const FUNCTIONS_DIR = Deno.env.get("SUPABASE_INTERNAL_FUNCTIONS_DIR")!;

const DENO_SB_ERROR_MAP = new Map([
  [Deno.errors.InvalidWorkerCreation, STATUS_CODE.ServiceUnavailable],
  [Deno.errors.InvalidWorkerResponse, STATUS_CODE.InternalServerError],
  [Deno.errors.WorkerRequestCancelled, 546],
]);

// Discover functions by scanning the functions directory.
// Deno handles deno.json/package.json discovery itself from the entrypoint.
const functionPaths: Record<string, string> = {};
for await (const entry of Deno.readDir(FUNCTIONS_DIR)) {
  if (!entry.isDirectory || entry.name.startsWith("_")) continue;
  const entrypoint = `${FUNCTIONS_DIR}/${entry.name}/index.ts`;
  try {
    await Deno.lstat(entrypoint);
    functionPaths[entry.name] = entrypoint;
  } catch {
    // no index.ts, skip
  }
}

console.log(`serving ${Object.keys(functionPaths).length} functions on http://127.0.0.1:${HOST_PORT}`);
for (const name of Object.keys(functionPaths).sort()) {
  console.log(`  - http://127.0.0.1:${HOST_PORT}/${name}`);
}

Deno.serve({
  port: parseInt(HOST_PORT),
  handler: async (req: Request) => {
    const { pathname } = new URL(req.url);

    if (pathname === "/_internal/health") {
      return Response.json({ message: "ok" });
    }

    if (pathname === "/_internal/metric") {
      return Response.json(await EdgeRuntime.getRuntimeMetrics());
    }

    const functionName = pathname.split("/")[1];
    const entrypoint = functionPaths[functionName];

    if (!entrypoint) {
      return new Response("Function not found", { status: 404 });
    }

    const envVars = Object.entries(Deno.env.toObject()).filter(
      ([name]) => !EXCLUDED_ENVS.includes(name) && !name.startsWith("SUPABASE_INTERNAL_")
    );

    try {
      const worker = await EdgeRuntime.userWorkers.create({
        servicePath: entrypoint.replace(/\/index\.ts$/, ""),
        maybeEntrypoint: new URL(`file://${entrypoint}`).href,
        envVars,
        memoryLimitMb: 256,
        workerTimeoutMs: 400_000,
        noModuleCache: false,
        forceCreate: false,
        customModuleRoot: "",
        cpuTimeSoftLimitMs: 0,
        cpuTimeHardLimitMs: 0,
        decoratorType: "tc39",
        context: { useReadSyncFileAPI: true },
      });
      return await worker.fetch(req);
    } catch (e) {
      console.error(e);
      for (const [denoError, code] of DENO_SB_ERROR_MAP.entries()) {
        if (denoError !== void 0 && e instanceof denoError) {
          return Response.json({ error: STATUS_TEXT[code] }, { status: code });
        }
      }
      return Response.json({ error: "Internal Server Error" }, { status: STATUS_CODE.InternalServerError });
    }
  },

  onError: (e) => {
    console.error(e);
    return Response.json({ error: "Internal Server Error" }, { status: STATUS_CODE.InternalServerError });
  },
});
