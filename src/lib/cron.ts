import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const LAUNCH_AGENTS_DIR = path.join(
  process.env.HOME || "",
  "Library",
  "LaunchAgents"
);

export interface CronJob {
  label: string;
  description: string | null;
  script: string;
  workingDirectory: string | null;
  schedule: string; // human-readable
  interval: number | null; // seconds, for StartInterval
  calendarIntervals: { hour: number; minute: number }[];
  logPath: string | null;
  errorLogPath: string | null;
  isLoaded: boolean;
  lastLogLines: string[];
  plistPath: string;
  projectName: string | null; // matched to a project directory
}

/**
 * Extract a plain-English description from a shell script's comments.
 */
function extractScriptDescription(scriptCmd: string): string | null {
  // Find the actual script file path from the command
  const match = scriptCmd.match(/(?:\/[^\s]+\.sh)/);
  if (!match) return null;

  const scriptPath = match[0];
  try {
    if (!fs.existsSync(scriptPath)) return null;
    const lines = fs.readFileSync(scriptPath, "utf-8").split("\n");
    // Look for comment lines after shebang that describe purpose
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#!/")) continue; // skip shebang
      if (!trimmed.startsWith("#")) break; // stop at first non-comment
      const comment = trimmed.replace(/^#+\s*/, "").trim();
      if (comment.length > 10) return comment;
    }
  } catch {
    // ignore
  }
  return null;
}

function parsePlist(filePath: string): CronJob | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");

    const getTag = (key: string): string | null => {
      const regex = new RegExp(
        `<key>${key}</key>\\s*<(?:string|integer)>([^<]+)</`,
        "s"
      );
      const match = content.match(regex);
      return match ? match[1] : null;
    };

    const label = getTag("Label");
    if (!label) return null;

    // Skip Apple/Google system agents
    if (label.startsWith("com.apple.") || label.startsWith("com.google."))
      return null;

    // Get script from ProgramArguments
    const argsMatch = content.match(
      /<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/
    );
    let script = "";
    if (argsMatch) {
      const strings = argsMatch[1].match(/<string>([^<]+)<\/string>/g);
      if (strings) {
        script = strings
          .map((s) => s.replace(/<\/?string>/g, ""))
          .join(" ");
      }
    }

    const workingDirectory = getTag("WorkingDirectory");
    const logPath = getTag("StandardOutPath");
    const errorLogPath = getTag("StandardErrorPath");

    // Parse StartInterval
    const intervalStr = getTag("StartInterval");
    const interval = intervalStr ? parseInt(intervalStr) : null;

    // Parse StartCalendarInterval
    const calendarIntervals: { hour: number; minute: number }[] = [];
    const calendarMatch = content.match(
      /<key>StartCalendarInterval<\/key>\s*<array>([\s\S]*?)<\/array>/
    );
    if (calendarMatch) {
      const dicts = calendarMatch[1].match(/<dict>([\s\S]*?)<\/dict>/g);
      if (dicts) {
        for (const dict of dicts) {
          const hourMatch = dict.match(
            /<key>Hour<\/key>\s*<integer>(\d+)<\/integer>/
          );
          const minuteMatch = dict.match(
            /<key>Minute<\/key>\s*<integer>(\d+)<\/integer>/
          );
          if (hourMatch) {
            calendarIntervals.push({
              hour: parseInt(hourMatch[1]),
              minute: minuteMatch ? parseInt(minuteMatch[1]) : 0,
            });
          }
        }
      }
    }
    // Single dict (not in array)
    if (calendarIntervals.length === 0) {
      const singleCalendar = content.match(
        /<key>StartCalendarInterval<\/key>\s*<dict>([\s\S]*?)<\/dict>/
      );
      if (singleCalendar) {
        const hourMatch = singleCalendar[1].match(
          /<key>Hour<\/key>\s*<integer>(\d+)<\/integer>/
        );
        const minuteMatch = singleCalendar[1].match(
          /<key>Minute<\/key>\s*<integer>(\d+)<\/integer>/
        );
        if (hourMatch) {
          calendarIntervals.push({
            hour: parseInt(hourMatch[1]),
            minute: minuteMatch ? parseInt(minuteMatch[1]) : 0,
          });
        }
      }
    }

    // Build human-readable schedule
    let schedule = "";
    if (calendarIntervals.length > 0) {
      const times = calendarIntervals
        .map((c) => `${String(c.hour).padStart(2, "0")}:${String(c.minute).padStart(2, "0")}`)
        .join(", ");
      schedule = `Daily at ${times}`;
    } else if (interval) {
      if (interval < 60) {
        schedule = `Every ${interval}s`;
      } else if (interval < 3600) {
        schedule = `Every ${Math.round(interval / 60)}min`;
      } else {
        schedule = `Every ${Math.round(interval / 3600)}h`;
      }
    }

    // Check if loaded in launchd
    let isLoaded = false;
    try {
      const result = execSync(`launchctl list ${label} 2>/dev/null`, {
        timeout: 3000,
        stdio: ["pipe", "pipe", "pipe"],
      }).toString();
      isLoaded = result.includes(label);
    } catch {
      isLoaded = false;
    }

    // Read last few log lines
    let lastLogLines: string[] = [];
    const logFile = logPath || errorLogPath;
    if (logFile) {
      try {
        if (fs.existsSync(logFile)) {
          const logContent = fs.readFileSync(logFile, "utf-8");
          const lines = logContent.trim().split("\n");
          lastLogLines = lines.slice(-5);
        }
      } catch {
        // ignore
      }
    }

    // Try to match to a project
    let projectName: string | null = null;
    if (workingDirectory) {
      projectName = path.basename(workingDirectory);
    }

    return {
      label,
      description: extractScriptDescription(script),
      script,
      workingDirectory,
      schedule,
      interval,
      calendarIntervals,
      logPath,
      errorLogPath,
      isLoaded,
      lastLogLines,
      plistPath: filePath,
      projectName,
    };
  } catch {
    return null;
  }
}

export function discoverCronJobs(): CronJob[] {
  const jobs: CronJob[] = [];

  // 1. Scan LaunchAgents
  if (fs.existsSync(LAUNCH_AGENTS_DIR)) {
    try {
      const files = fs.readdirSync(LAUNCH_AGENTS_DIR);
      for (const file of files) {
        if (!file.endsWith(".plist")) continue;
        const fullPath = path.join(LAUNCH_AGENTS_DIR, file);
        const job = parsePlist(fullPath);
        if (job) jobs.push(job);
      }
    } catch {
      // ignore
    }
  }

  // 2. Check crontab
  try {
    const crontab = execSync("crontab -l 2>/dev/null", {
      timeout: 3000,
      stdio: ["pipe", "pipe", "pipe"],
    }).toString().trim();

    if (crontab && !crontab.includes("no crontab")) {
      for (const line of crontab.split("\n")) {
        if (line.startsWith("#") || !line.trim()) continue;
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 6) {
          const cronExpr = parts.slice(0, 5).join(" ");
          const cmd = parts.slice(5).join(" ");

          jobs.push({
            label: `crontab: ${cmd.slice(0, 40)}`,
            description: extractScriptDescription(cmd),
            script: cmd,
            workingDirectory: null,
            schedule: cronExpr,
            interval: null,
            calendarIntervals: [],
            logPath: null,
            errorLogPath: null,
            isLoaded: true,
            lastLogLines: [],
            plistPath: "crontab",
            projectName: null,
          });
        }
      }
    }
  } catch {
    // no crontab
  }

  return jobs;
}
