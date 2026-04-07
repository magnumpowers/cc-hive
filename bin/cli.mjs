#!/usr/bin/env node

import { execSync, spawn } from "child_process";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const args = process.argv.slice(2);
const rawPort = args.find((a) => a.startsWith("--port="))?.split("=")[1] || "3333";
const port = parseInt(rawPort, 10);
if (isNaN(port) || port < 1 || port > 65535) {
  console.error(`  Error: invalid port "${rawPort}". Must be a number between 1 and 65535.`);
  process.exit(1);
}

console.log(`\n  \x1b[33m⬡\x1b[0m Hive — Visual dashboard for Claude Code\n`);

// Build if needed
const nextDir = resolve(root, ".next");
if (!existsSync(nextDir)) {
  console.log("  Building for first run...\n");
  execSync("npm run build", { cwd: root, stdio: "inherit" });
  console.log("");
}

console.log(`  Starting on \x1b[36mhttp://localhost:${port}\x1b[0m`);
console.log(`  Press \x1b[90mCtrl+C\x1b[0m to stop\n`);

const child = spawn("npx", ["next", "start", "-p", port], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env },
});

child.on("close", (code) => {
  process.exit(code || 0);
});

process.on("SIGINT", () => {
  child.kill("SIGINT");
});

process.on("SIGTERM", () => {
  child.kill("SIGTERM");
});
