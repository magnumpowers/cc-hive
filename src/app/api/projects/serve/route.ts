import { NextRequest, NextResponse } from "next/server";
import { spawn, execSync } from "child_process";
import fs from "fs";
import path from "path";
import net from "net";

export const dynamic = "force-dynamic";

// Track running dev servers: projectPath -> { pid, port }
const runningServers = new Map<string, { pid: number; port: number }>();

function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(500);
    sock.once("connect", () => {
      sock.destroy();
      resolve(true);
    });
    sock.once("timeout", () => {
      sock.destroy();
      resolve(false);
    });
    sock.once("error", () => {
      resolve(false);
    });
    sock.connect(port, "127.0.0.1");
  });
}

async function findFreePort(startPort: number): Promise<number> {
  for (let port = startPort; port < startPort + 100; port++) {
    const open = await isPortOpen(port);
    if (!open) return port;
  }
  return startPort + 100;
}

function detectDevCommand(projectPath: string): { cmd: string; args: string[]; port: number } | null {
  // Check package.json
  const pkgPath = path.join(projectPath, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      if (pkg.scripts?.dev) {
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        let defaultPort = 3000;
        if (deps.vite) defaultPort = 5173;

        // Check if script specifies a port
        const portMatch = (pkg.scripts.dev as string).match(/(?:-p|--port)\s+(\d+)/);
        if (portMatch) defaultPort = parseInt(portMatch[1]);

        return { cmd: "npm", args: ["run", "dev"], port: defaultPort };
      }
    } catch {
      // ignore
    }
  }

  // Check for Python
  const mainPy = path.join(projectPath, "main.py");
  if (fs.existsSync(mainPy)) {
    return { cmd: "python3", args: [mainPy], port: 8000 };
  }

  return null;
}

export async function POST(req: NextRequest) {
  const { path: projectPath, action } = await req.json();

  if (!projectPath || typeof projectPath !== "string") {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }

  if (!fs.existsSync(projectPath)) {
    return NextResponse.json({ error: "path not found" }, { status: 404 });
  }

  // Stop existing server
  if (action === "stop") {
    const running = runningServers.get(projectPath);
    if (running) {
      try {
        process.kill(-running.pid, "SIGTERM");
      } catch {
        try {
          process.kill(running.pid, "SIGTERM");
        } catch {
          // already dead
        }
      }
      runningServers.delete(projectPath);
      return NextResponse.json({ ok: true, stopped: true });
    }
    return NextResponse.json({ ok: true, stopped: false });
  }

  // Check if already running
  const existing = runningServers.get(projectPath);
  if (existing) {
    try {
      process.kill(existing.pid, 0);
      const open = await isPortOpen(existing.port);
      if (open) {
        return NextResponse.json({
          ok: true,
          port: existing.port,
          url: `http://localhost:${existing.port}`,
          alreadyRunning: true,
        });
      }
    } catch {
      runningServers.delete(projectPath);
    }
  }

  const devInfo = detectDevCommand(projectPath);
  if (!devInfo) {
    return NextResponse.json(
      { error: "No dev script found (no package.json scripts.dev or main.py)" },
      { status: 400 }
    );
  }

  // Find a free port
  const port = await findFreePort(devInfo.port);

  // Add port override to args if different from default
  let args = [...devInfo.args];
  if (port !== devInfo.port && devInfo.cmd === "npm") {
    // For Next.js / Vite, pass port via env or args
    args = ["run", "dev", "--", "-p", String(port)];
  }

  try {
    const env = { ...process.env, PORT: String(port) };

    const child = spawn(devInfo.cmd, args, {
      cwd: projectPath,
      env,
      detached: true,
      stdio: "ignore",
    });

    child.unref();

    if (child.pid) {
      runningServers.set(projectPath, { pid: child.pid, port });
    }

    // Wait a bit for the server to start, then check the port
    await new Promise((r) => setTimeout(r, 3000));
    const ready = await isPortOpen(port);

    // Open in browser
    if (ready) {
      try {
        execSync(`open http://localhost:${port}`, { stdio: "ignore" });
      } catch {
        // non-macOS or no browser
      }
    }

    return NextResponse.json({
      ok: true,
      port,
      url: `http://localhost:${port}`,
      pid: child.pid,
      ready,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET: check status of running servers
export async function GET(req: NextRequest) {
  const projectPath = req.nextUrl.searchParams.get("path");

  if (projectPath) {
    const running = runningServers.get(projectPath);
    if (running) {
      try {
        process.kill(running.pid, 0);
        const open = await isPortOpen(running.port);
        return NextResponse.json({ running: open, port: running.port, pid: running.pid });
      } catch {
        runningServers.delete(projectPath);
      }
    }
    return NextResponse.json({ running: false });
  }

  // Return all running servers
  const servers: Record<string, { port: number; pid: number }> = {};
  for (const [p, info] of runningServers) {
    servers[p] = info;
  }
  return NextResponse.json({ servers });
}
