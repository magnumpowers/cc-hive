import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import os from "os";

export const dynamic = "force-dynamic";

const ALLOWED_COMMANDS: Record<string, string> = {
  claude: "claude",
  "claude-hierarchical": "claude --dangerously-skip-permissions",
  "code": "code .",
  "cursor": "cursor .",
};

function focusMacOS(pid: number) {
  // Find the TTY for the given PID, then tell Terminal.app to focus that tab
  const { execSync } = require("child_process");
  let tty: string;
  try {
    tty = execSync(`ps -o tty= -p ${pid}`, { encoding: "utf-8" }).trim();
  } catch {
    // PID not found — fall back to just activating Terminal
    spawn("osascript", ["-e", 'tell application "Terminal" to activate'], {
      detached: true,
      stdio: "ignore",
    }).unref();
    return;
  }
  if (!tty || tty === "??") {
    spawn("osascript", ["-e", 'tell application "Terminal" to activate'], {
      detached: true,
      stdio: "ignore",
    }).unref();
    return;
  }
  const devTTY = `/dev/${tty}`;
  const script = `
    on run argv
      set targetTTY to item 1 of argv
      tell application "Terminal"
        repeat with w in windows
          set tabIdx to 0
          repeat with t in tabs of w
            set tabIdx to tabIdx + 1
            if tty of t is targetTTY then
              set selected tab of w to t
              set index of w to 1
              activate
              return
            end if
          end repeat
        end repeat
        -- TTY not found in any tab, just activate
        activate
      end tell
    end run
  `;
  spawn("osascript", ["-e", script, "--", devTTY], {
    detached: true,
    stdio: "ignore",
  }).unref();
}

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
  const { path: rawPath, command, pid } = await req.json();

  // Focus mode: jump to an existing terminal session by PID
  if (command === "focus" && pid) {
    try {
      const platform = process.platform;
      if (platform === "darwin") {
        focusMacOS(Number(pid));
      } else {
        // On other platforms, just open a new terminal (no reliable focus mechanism)
        return NextResponse.json({ error: "focus not supported on this platform" }, { status: 400 });
      }
      return NextResponse.json({ ok: true, platform });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "unknown error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (!rawPath || typeof rawPath !== "string") {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }

  const projectPath =
    rawPath === "~" || rawPath.startsWith("~/")
      ? os.homedir() + rawPath.slice(1)
      : rawPath;

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
