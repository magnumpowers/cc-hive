import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { glob } from "fs/promises";

export const dynamic = "force-dynamic";

interface UsageData {
  today: { input: number; output: number; cacheRead: number; cacheWrite: number };
  month: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

export async function GET() {
  const projectsDir = path.join(process.env.HOME || "", ".claude", "projects");
  const now = new Date();
  const todayPrefix = now.toISOString().slice(0, 10); // "2026-04-01"
  const monthPrefix = now.toISOString().slice(0, 7); // "2026-04"

  const result: UsageData = {
    today: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    month: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };

  try {
    // Find all .jsonl files (skip subagents for speed)
    const dirs = fs.readdirSync(projectsDir);
    for (const dir of dirs) {
      const dirPath = path.join(projectsDir, dir);
      try {
        const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".jsonl"));
        for (const file of files) {
          const filePath = path.join(dirPath, file);
          try {
            // Quick check: skip files not modified this month
            const stat = fs.statSync(filePath);
            const fileMonth = stat.mtime.toISOString().slice(0, 7);
            if (fileMonth < monthPrefix) continue;

            const content = fs.readFileSync(filePath, "utf-8");
            // Fast regex extraction instead of parsing every line
            const usageRegex = /"timestamp":"(\d{4}-\d{2}-\d{2})[^"]*".*?"input_tokens":(\d+).*?"cache_read_input_tokens":(\d+).*?"output_tokens":(\d+)/g;
            const cacheWriteRegex = /"cache_creation_input_tokens":(\d+)/g;

            // Simpler: parse lines that contain "usage"
            for (const line of content.split("\n")) {
              if (!line.includes('"usage"') || !line.includes('"input_tokens"')) continue;
              try {
                const entry = JSON.parse(line);
                const ts = entry.timestamp || "";
                const usage = entry.message?.usage;
                if (!usage || !ts.startsWith(monthPrefix.slice(0, 4))) continue;

                const isToday = ts.startsWith(todayPrefix);
                const isThisMonth = ts.startsWith(monthPrefix);

                if (isThisMonth) {
                  result.month.input += usage.input_tokens || 0;
                  result.month.output += usage.output_tokens || 0;
                  result.month.cacheRead += usage.cache_read_input_tokens || 0;
                  result.month.cacheWrite += usage.cache_creation_input_tokens || 0;
                }
                if (isToday) {
                  result.today.input += usage.input_tokens || 0;
                  result.today.output += usage.output_tokens || 0;
                  result.today.cacheRead += usage.cache_read_input_tokens || 0;
                  result.today.cacheWrite += usage.cache_creation_input_tokens || 0;
                }
              } catch {
                // skip malformed line
              }
            }
          } catch {
            // skip unreadable file
          }
        }
      } catch {
        // skip unreadable dir
      }
    }
  } catch {
    // projects dir not accessible
  }

  return NextResponse.json(result);
}
