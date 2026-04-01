import { NextRequest, NextResponse } from "next/server";
import { execSync, spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { discoverProjects } from "@/lib/claude";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { path: projectPath, mode } = await req.json();

  if (!projectPath || typeof projectPath !== "string") {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }

  if (mode !== "trash" && mode !== "delete") {
    return NextResponse.json(
      { error: 'mode must be "trash" or "delete"' },
      { status: 400 }
    );
  }

  // Only allow deleting paths that discoverProjects() returns
  const knownProjects = discoverProjects();
  const isKnown = knownProjects.some((p) => p.path === projectPath);
  if (!isKnown) {
    return NextResponse.json(
      { error: "Path is not a known project" },
      { status: 403 }
    );
  }

  const resolved = path.resolve(projectPath);
  if (!fs.existsSync(resolved)) {
    return NextResponse.json({ error: "path not found" }, { status: 404 });
  }

  try {
    if (mode === "trash") {
      const platform = process.platform;
      if (platform === "darwin") {
        // Pass path as argv and coerce to alias for Finder
        const script = `on run argv
          set posixPath to item 1 of argv
          tell application "Finder" to delete (POSIX file posixPath as alias)
        end run`;
        const result = spawnSync("osascript", ["-e", script, "--", resolved], { timeout: 10000 });
        if (result.status !== 0) {
          throw new Error(result.stderr?.toString() || "Failed to move to trash");
        }
      } else if (platform === "linux") {
        // Use spawnSync with argument arrays to avoid shell injection
        const gio = spawnSync("gio", ["trash", resolved], { timeout: 10000 });
        if (gio.status !== 0) {
          const tp = spawnSync("trash-put", [resolved], { timeout: 10000 });
          if (tp.status !== 0) throw new Error("No trash utility available (tried gio, trash-put)");
        }
      } else if (platform === "win32") {
        // Pass path as a separate PowerShell parameter
        spawnSync("powershell", [
          "-NoProfile", "-Command",
          `Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($args[0],'OnlyErrorDialogs','SendToRecycleBin')`,
          resolved,
        ], { timeout: 10000 });
      }
      return NextResponse.json({ ok: true, mode: "trash" });
    } else {
      fs.rmSync(resolved, { recursive: true, force: true });
      return NextResponse.json({ ok: true, mode: "delete" });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
