import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";

export const dynamic = "force-dynamic";

const ALLOWED_COMMANDS: Record<string, string> = {
  claude: "claude",
  "claude-hierarchical": "claude --dangerously-skip-permissions",
  "code": "code .",
  "cursor": "cursor .",
};

function launchMacOS(projectPath: string, shell: string) {
  // Pass projectPath and shell as separate osascript arguments to avoid injection.
  // In AppleScript, `item N of argv` retrieves positional arguments passed via --.
  const script = `
    on run argv
      set projectDir to item 1 of argv
      set shellCmd to item 2 of argv
      tell application "Terminal"
        activate
        tell application "System Events" to keystroke "t" using command down
        delay 0.3
        do script "cd " & quoted form of projectDir & " && " & shellCmd in front window
      end tell
    end run
  `;
  spawn("osascript", ["-e", script, "--", projectPath, shell], {
    detached: true,
    stdio: "ignore",
  }).unref();
}

function launchLinux(projectPath: string, shell: string) {
  // Write a tiny shell script to avoid any interpolation issues
  const bashCmd = `cd "$1" && $2; exec bash`;
  const terminals = ["x-terminal-emulator", "gnome-terminal", "konsole", "xterm"];
  for (const term of terminals) {
    try {
      if (term === "gnome-terminal") {
        spawn(term, ["--", "bash", "-c", bashCmd, "--", projectPath, shell], {
          detached: true,
          stdio: "ignore",
        }).unref();
      } else {
        spawn(term, ["-e", "bash", "-c", bashCmd, "--", projectPath, shell], {
          detached: true,
          stdio: "ignore",
        }).unref();
      }
      return;
    } catch {
      continue;
    }
  }
  throw new Error("No supported terminal emulator found");
}

function launchWindows(projectPath: string, shell: string) {
  // Use PowerShell with separate arguments to avoid cmd injection
  spawn("powershell", [
    "-NoProfile", "-Command",
    `Start-Process cmd -ArgumentList '/k', ('cd /d ' + $args[0] + ' && ' + $args[1])`,
    projectPath, shell,
  ], {
    detached: true,
    stdio: "ignore",
  }).unref();
}

export async function POST(req: NextRequest) {
  const { path: projectPath, command } = await req.json();

  if (!projectPath || typeof projectPath !== "string") {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }

  if (!fs.existsSync(projectPath)) {
    return NextResponse.json({ error: "path not found" }, { status: 404 });
  }

  // Validate command against whitelist
  const cmdKey = command || "claude";
  const shell = ALLOWED_COMMANDS[cmdKey];
  if (!shell) {
    return NextResponse.json(
      { error: `Unknown command: ${cmdKey}. Allowed: ${Object.keys(ALLOWED_COMMANDS).join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const platform = process.platform;
    if (platform === "darwin") {
      launchMacOS(projectPath, shell);
    } else if (platform === "win32") {
      launchWindows(projectPath, shell);
    } else {
      launchLinux(projectPath, shell);
    }

    return NextResponse.json({ ok: true, platform });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    commands: Object.keys(ALLOWED_COMMANDS),
    platform: process.platform,
  });
}
