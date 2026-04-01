import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { getAliases } from "./aliases";

const CLAUDE_DIR = path.join(process.env.HOME || "", ".claude");
const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");
const SESSIONS_DIR = path.join(CLAUDE_DIR, "sessions");

export interface Deliverable {
  url: string | null;       // deployed URL (Vercel, etc.)
  devScript: string | null; // e.g. "npm run dev" if available
  devPort: number | null;   // detected port from scripts
  framework: string | null; // e.g. "Next.js", "Vite", "Python"
}

export interface Project {
  name: string;
  displayName: string;
  description: string | null;
  path: string;
  encodedPath: string;
  lastActivity: string;
  sessionCount: number;
  recentSessions: SessionSummary[];
  hasClaudeMd: boolean;
  gitBranch: string | null;
  gitDirty: boolean;
  isActive: boolean;
  activePid: number | null;
  linesOfCode: number;
  fileCount: number;
  deliverable: Deliverable;
}

export interface SessionSummary {
  sessionId: string;
  firstPrompt: string;
  summary: string;
  messageCount: number;
  created: string;
  modified: string;
  gitBranch: string;
}

export interface ActiveSession {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt: number;
}

// --- Memoized decodePath ---
const decodeCache = new Map<string, string>();

function decodePath(encoded: string): string {
  const cached = decodeCache.get(encoded);
  if (cached) return cached;

  const parts = encoded.replace(/^-/, "").split("-");

  function resolve(idx: number, current: string): string | null {
    if (idx >= parts.length) return current;
    for (let end = parts.length; end > idx; end--) {
      const segment = parts.slice(idx, end).join("-");
      const candidate = current + "/" + segment;
      if (end === parts.length) {
        if (fs.existsSync(candidate)) return candidate;
      } else {
        try {
          if (fs.statSync(candidate).isDirectory()) {
            const result = resolve(end, candidate);
            if (result) return result;
          }
        } catch {
          // doesn't exist
        }
      }
    }
    return null;
  }

  const result = resolve(0, "") || "/" + parts.join("/");
  decodeCache.set(encoded, result);
  return result;
}

// --- Cached code counting ---
const codeCache = new Map<string, { lines: number; files: number; mtime: number }>();

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".rb",
  ".php", ".vue", ".svelte", ".css", ".scss", ".html", ".json", ".yaml",
  ".yml", ".toml", ".sql", ".sh", ".bash", ".zsh", ".swift", ".kt",
  ".c", ".cpp", ".h", ".hpp", ".cs", ".ex", ".exs", ".md", ".mdx",
]);

const SKIP_DIRS = new Set([
  "node_modules", ".next", ".git", "dist", "build", ".cache",
  "__pycache__", ".venv", "venv", "target", ".turbo", "coverage",
  ".output", ".nuxt", ".svelte-kit", "vendor",
]);

function countCode(projectPath: string): { lines: number; files: number } {
  // Check cache: use project directory's mtime as cache key
  try {
    const dirMtime = fs.statSync(projectPath).mtimeMs;
    const cached = codeCache.get(projectPath);
    if (cached && Math.abs(cached.mtime - dirMtime) < 1000) {
      return { lines: cached.lines, files: cached.files };
    }
  } catch {
    // continue to count
  }

  let lines = 0;
  let files = 0;

  function walk(dir: string, depth: number) {
    if (depth > 6) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".") && entry.isDirectory()) continue;
        if (SKIP_DIRS.has(entry.name)) continue;

        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full, depth + 1);
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          if (CODE_EXTENSIONS.has(ext)) {
            try {
              const stat = fs.statSync(full);
              if (stat.size > 500_000) continue;
              const content = fs.readFileSync(full, "utf-8");
              lines += content.split("\n").length;
              files++;
            } catch {
              // skip unreadable
            }
          }
        }
      }
    } catch {
      // skip unreadable dirs
    }
  }

  walk(projectPath, 0);

  try {
    const mtime = fs.statSync(projectPath).mtimeMs;
    codeCache.set(projectPath, { lines, files, mtime });
  } catch {
    // ignore
  }

  return { lines, files };
}

// --- Helper functions ---

function getActiveSessions(): ActiveSession[] {
  try {
    if (!fs.existsSync(SESSIONS_DIR)) return [];
    const files = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith(".json"));
    const sessions: ActiveSession[] = [];

    for (const file of files) {
      try {
        const data = JSON.parse(
          fs.readFileSync(path.join(SESSIONS_DIR, file), "utf-8")
        );
        try {
          process.kill(data.pid, 0);
          sessions.push(data);
        } catch {
          // PID not running
        }
      } catch {
        // Invalid JSON
      }
    }
    return sessions;
  } catch {
    return [];
  }
}

function getGitInfo(projectPath: string): { branch: string | null; dirty: boolean } {
  try {
    if (!fs.existsSync(path.join(projectPath, ".git"))) {
      return { branch: null, dirty: false };
    }
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: projectPath,
      timeout: 3000,
      stdio: ["pipe", "pipe", "pipe"],
    })
      .toString()
      .trim();
    const status = execSync("git status --porcelain", {
      cwd: projectPath,
      timeout: 3000,
      stdio: ["pipe", "pipe", "pipe"],
    })
      .toString()
      .trim();
    return { branch, dirty: status.length > 0 };
  } catch {
    return { branch: null, dirty: false };
  }
}

function getSessionIndex(encodedPath: string): SessionSummary[] {
  const indexPath = path.join(PROJECTS_DIR, encodedPath, "sessions-index.json");
  try {
    if (!fs.existsSync(indexPath)) return [];
    const data = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
    if (!Array.isArray(data)) return [];
    return data
      .sort(
        (a: SessionSummary, b: SessionSummary) =>
          new Date(b.modified).getTime() - new Date(a.modified).getTime()
      )
      .slice(0, 5);
  } catch {
    return [];
  }
}

function countSessions(encodedPath: string): number {
  const dir = path.join(PROJECTS_DIR, encodedPath);
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl")).length;
  } catch {
    return 0;
  }
}

function getLastActivity(encodedPath: string, sessions: SessionSummary[]): string {
  if (sessions.length > 0) {
    return sessions[0].modified;
  }
  try {
    const stat = fs.statSync(path.join(PROJECTS_DIR, encodedPath));
    return stat.mtime.toISOString();
  } catch {
    return new Date(0).toISOString();
  }
}

function discoverCwdsFromSessions(encodedDir: string): Map<string, { count: number; lastModified: string }> {
  const cwdMap = new Map<string, { count: number; lastModified: string }>();
  const dir = path.join(PROJECTS_DIR, encodedDir);

  try {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
    for (const file of files) {
      const filePath = path.join(dir, file);
      try {
        const stat = fs.statSync(filePath);
        const modified = stat.mtime.toISOString();

        const content = fs.readFileSync(filePath, "utf-8");
        const cwdsInSession = new Set<string>();
        const cwdRegex = /"cwd"\s*:\s*"([^"]+)"/g;
        let match;
        while ((match = cwdRegex.exec(content)) !== null) {
          cwdsInSession.add(match[1]);
        }

        for (const cwd of cwdsInSession) {
          const existing = cwdMap.get(cwd);
          if (existing) {
            existing.count++;
            if (modified > existing.lastModified) existing.lastModified = modified;
          } else {
            cwdMap.set(cwd, { count: 1, lastModified: modified });
          }
        }
      } catch {
        // skip unreadable
      }
    }
  } catch {
    // directory not readable
  }

  return cwdMap;
}

// --- Vercel domain cache ---
// Maps vercel projectName -> custom domain
let vercelDomainCache: Map<string, string> | null = null;

function getVercelDomains(): Map<string, string> {
  if (vercelDomainCache) return vercelDomainCache;
  vercelDomainCache = new Map();

  try {
    const output = execSync("vercel domains ls 2>/dev/null", {
      timeout: 10000,
      stdio: ["pipe", "pipe", "pipe"],
    }).toString();

    // Parse domain names and try to match them to projects
    // by inspecting each domain to get its project assignments
    const domainNames: string[] = [];
    for (const line of output.split("\n")) {
      const match = line.match(/^\s+([a-z0-9.-]+\.[a-z]{2,})\s/);
      if (match) domainNames.push(match[1]);
    }

    for (const domain of domainNames) {
      try {
        const inspect = execSync(`vercel domains inspect ${domain} 2>/dev/null`, {
          timeout: 10000,
          stdio: ["pipe", "pipe", "pipe"],
        }).toString();

        // Find the Projects section and parse project->domain mappings
        const projectSection = inspect.split("Projects")[1];
        if (projectSection) {
          // Lines look like: "    veckans-ai-redeploy        www.veckans.ai, veckans.ai"
          for (const line of projectSection.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("Project") || trimmed.startsWith("Domain")) continue;
            const parts = trimmed.split(/\s{2,}/);
            if (parts.length >= 2) {
              const projName = parts[0];
              const assignedDomains = parts[1];
              // Only use root domain (not subdomains like tidsresan.veckans.ai)
              if (assignedDomains.includes(domain) && !assignedDomains.match(new RegExp(`\\w+\\.${domain.replace(/\./g, "\\.")}`))) {
                vercelDomainCache!.set(projName, domain);
              } else if (assignedDomains.split(",").some((d: string) => d.trim() === domain)) {
                vercelDomainCache!.set(projName, domain);
              }
            }
          }
        }
      } catch {
        // skip
      }
    }
  } catch {
    // vercel CLI not available
  }

  return vercelDomainCache;
}

// --- Project description ---

function detectDescription(projectPath: string): string | null {
  // Skip lines that are clearly not descriptions
  const SKIP_PATTERNS = [
    /^this file contains/i,
    /^this template/i,
    /^this is a/i,
    /^this project uses/i,
    /^welcome to/i,
    /^getting started/i,
    /^installation/i,
    /^see the/i,
    /^for more/i,
    /^table of contents/i,
    /^\*\*/,
  ];
  function isGoodDescription(text: string): boolean {
    return !SKIP_PATTERNS.some((p) => p.test(text));
  }

  // 1. CLAUDE.md — first non-heading, non-empty line
  try {
    const claudeMd = path.join(projectPath, "CLAUDE.md");
    if (fs.existsSync(claudeMd)) {
      const lines = fs.readFileSync(claudeMd, "utf-8").split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("```") || trimmed.startsWith("-")) continue;
        if (trimmed.length > 15 && isGoodDescription(trimmed)) return trimmed.slice(0, 200);
      }
    }
  } catch { /* ignore */ }

  // 2. package.json description
  try {
    const pkg = path.join(projectPath, "package.json");
    if (fs.existsSync(pkg)) {
      const data = JSON.parse(fs.readFileSync(pkg, "utf-8"));
      if (data.description && data.description.length > 5) return data.description.slice(0, 200);
    }
  } catch { /* ignore */ }

  // 3. pyproject.toml description
  try {
    const pyproject = path.join(projectPath, "pyproject.toml");
    if (fs.existsSync(pyproject)) {
      const content = fs.readFileSync(pyproject, "utf-8");
      const descMatch = content.match(/description\s*=\s*"([^"]+)"/);
      if (descMatch && descMatch[1].length > 5) return descMatch[1].slice(0, 200);
    }
  } catch { /* ignore */ }

  // 4. README.md — first paragraph line
  try {
    const readme = path.join(projectPath, "README.md");
    if (fs.existsSync(readme)) {
      const lines = fs.readFileSync(readme, "utf-8").split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("```") || trimmed.startsWith("[") || trimmed.startsWith("-") || trimmed.startsWith("!")) continue;
        if (trimmed.length > 15 && isGoodDescription(trimmed)) return trimmed.slice(0, 200);
      }
    }
  } catch { /* ignore */ }

  // 5. Fallback — summarize from framework + key files
  try {
    const parts: string[] = [];
    if (fs.existsSync(path.join(projectPath, "pyproject.toml")) || fs.existsSync(path.join(projectPath, "requirements.txt"))) {
      parts.push("Python");
    }
    const pkgPath = path.join(projectPath, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.next) parts.push("Next.js");
      else if (deps.vite) parts.push("Vite");
      else if (deps.react) parts.push("React");
      if (deps.remotion) parts.push("Remotion");
      if (deps.supabase || deps["@supabase/supabase-js"]) parts.push("Supabase");
    }
    if (fs.existsSync(path.join(projectPath, "main.py"))) parts.push("app");
    if (fs.existsSync(path.join(projectPath, "cron_pipeline.sh"))) parts.push("with automated pipeline");
    if (parts.length > 0) return parts.join(" ") + " project";
  } catch { /* ignore */ }

  return null;
}

// --- Deliverable detection ---

function detectDeliverable(projectPath: string): Deliverable {
  const result: Deliverable = { url: null, devScript: null, devPort: null, framework: null };

  // 1. Check for Vercel deployment URL (prefer custom domain)
  try {
    const vercelProjectPath = path.join(projectPath, ".vercel", "project.json");
    if (fs.existsSync(vercelProjectPath)) {
      const vercelProject = JSON.parse(fs.readFileSync(vercelProjectPath, "utf-8"));
      if (vercelProject.projectId) {
        const projectName = vercelProject.projectName;

        // Check for custom domain via Vercel CLI cache
        if (projectName) {
          const domains = getVercelDomains();
          const customDomain = domains.get(projectName);
          if (customDomain) {
            result.url = `https://${customDomain}`;
          }
        }

        // Try alias in vercel.json
        if (!result.url) {
          const vercelJsonPath = path.join(projectPath, "vercel.json");
          if (fs.existsSync(vercelJsonPath)) {
            const vercelJson = JSON.parse(fs.readFileSync(vercelJsonPath, "utf-8"));
            if (vercelJson.alias?.[0]) {
              result.url = `https://${vercelJson.alias[0]}`;
            }
          }
        }

        // Fall back to projectName.vercel.app
        if (!result.url && projectName) {
          result.url = `https://${projectName}.vercel.app`;
        }
      }
    }
  } catch {
    // ignore
  }

  // 2. Check CLAUDE.md for URLs — look for patterns like "URL:", "Production:", "Deploy:", "Site:" etc.
  if (!result.url) {
    try {
      const claudeMdPath = path.join(projectPath, "CLAUDE.md");
      if (fs.existsSync(claudeMdPath)) {
        const content = fs.readFileSync(claudeMdPath, "utf-8").slice(0, 5000);
        // Look for labelled URLs first (most reliable)
        const labelledMatch = content.match(/(?:url|site|production|deploy|live|host|domain|website)\s*[:=]\s*(https?:\/\/[^\s)]+)/i);
        if (labelledMatch) {
          result.url = labelledMatch[1].replace(/[.,;]+$/, "");
        } else {
          // Fallback: look for canonical URLs or homepage-style links
          const canonicalMatch = content.match(/canonical.*?(https?:\/\/[a-z0-9-]+\.(?:ai|com|se|dev|io|app)[^\s)"]*)/i);
          if (canonicalMatch) {
            result.url = canonicalMatch[1].replace(/[.,;]+$/, "");
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // 2b. Check README.md for URLs
  if (!result.url) {
    try {
      const readmePath = path.join(projectPath, "README.md");
      if (fs.existsSync(readmePath)) {
        const content = fs.readFileSync(readmePath, "utf-8").slice(0, 3000);
        const labelledMatch = content.match(/(?:url|site|production|deploy|live|host|domain|website|homepage)\s*[:=]\s*(https?:\/\/[^\s)]+)/i);
        if (labelledMatch) {
          result.url = labelledMatch[1].replace(/[.,;]+$/, "");
        }
      }
    } catch {
      // ignore
    }
  }

  // 2c. Check package.json homepage field
  if (!result.url) {
    try {
      const pkgPath = path.join(projectPath, "package.json");
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        if (pkg.homepage && pkg.homepage.startsWith("http")) {
          result.url = pkg.homepage;
        }
      }
    } catch {
      // ignore
    }
  }

  // 3. Check package.json for dev script and framework
  try {
    const pkgPath = path.join(projectPath, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

      if (pkg.scripts?.dev) {
        result.devScript = "npm run dev";

        // Detect port from script
        const devScript = pkg.scripts.dev as string;
        const portMatch = devScript.match(/(?:-p|--port)\s+(\d+)/);
        if (portMatch) {
          result.devPort = parseInt(portMatch[1]);
        }
      }

      // Detect framework
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.next) {
        result.framework = "Next.js";
        if (!result.devPort) result.devPort = 3000;
      } else if (deps.vite) {
        result.framework = "Vite";
        if (!result.devPort) result.devPort = 5173;
      } else if (deps.nuxt) {
        result.framework = "Nuxt";
        if (!result.devPort) result.devPort = 3000;
      } else if (deps.react) {
        result.framework = "React";
        if (!result.devPort) result.devPort = 3000;
      }
    }
  } catch {
    // ignore
  }

  // 4. Check for Python projects
  if (!result.devScript) {
    try {
      const pyprojectPath = path.join(projectPath, "pyproject.toml");
      const requirementsPath = path.join(projectPath, "requirements.txt");
      const mainPyPath = path.join(projectPath, "main.py");

      if (fs.existsSync(pyprojectPath) || fs.existsSync(requirementsPath)) {
        result.framework = "Python";
        if (fs.existsSync(mainPyPath)) {
          result.devScript = "python3 main.py";
        }
      }
    } catch {
      // ignore
    }
  }

  return result;
}

// --- Main discovery ---

const HOME_DIR = process.env.HOME || process.env.USERPROFILE || "";
const SKIP_PATHS = new Set(HOME_DIR ? ["/", HOME_DIR] : ["/"]);


export function discoverProjects(): Project[] {
  if (!fs.existsSync(PROJECTS_DIR)) return [];

  const activeSessions = getActiveSessions();
  const dirs = fs.readdirSync(PROJECTS_DIR).filter((d) => {
    const full = path.join(PROJECTS_DIR, d);
    return fs.statSync(full).isDirectory();
  });

  const projectsByPath = new Map<string, Project>();

  for (const encoded of dirs) {
    const projectPath = decodePath(encoded);

    if (!fs.existsSync(projectPath)) continue;
    if (SKIP_PATHS.has(projectPath)) continue;

    const recentSessions = getSessionIndex(encoded);
    const sessionCount = countSessions(encoded);
    const git = getGitInfo(projectPath);
    const active = activeSessions.find((s) => s.cwd === projectPath);
    const lastActivity = getLastActivity(encoded, recentSessions);
    const code = countCode(projectPath);
    const name = path.basename(projectPath) || projectPath;
    const deliverable = detectDeliverable(projectPath);
    const description = detectDescription(projectPath);

    projectsByPath.set(projectPath, {
      name,
      displayName: name,
      description,
      path: projectPath,
      encodedPath: encoded,
      lastActivity,
      sessionCount,
      recentSessions,
      hasClaudeMd: fs.existsSync(path.join(projectPath, "CLAUDE.md")),
      gitBranch: git.branch,
      gitDirty: git.dirty,
      isActive: !!active,
      activePid: active?.pid ?? null,
      linesOfCode: code.lines,
      fileCount: code.files,
      deliverable,
    });
  }

  // Scan sessions in home-dir and root for hidden projects
  for (const encoded of dirs) {
    const projectPath = decodePath(encoded);
    if (!SKIP_PATHS.has(projectPath)) continue;

    const cwds = discoverCwdsFromSessions(encoded);
    for (const [cwd, info] of cwds) {
      if (SKIP_PATHS.has(cwd)) continue;
      if (projectsByPath.has(cwd)) {
        const existing = projectsByPath.get(cwd)!;
        existing.sessionCount += info.count;
        if (info.lastModified > existing.lastActivity) {
          existing.lastActivity = info.lastModified;
        }
        continue;
      }
      if (!fs.existsSync(cwd)) continue;
      const relToHome = path.relative(HOME_DIR, cwd);
      if (relToHome.startsWith("..") || relToHome.split(path.sep).length > 2) continue;

      const git = getGitInfo(cwd);
      const active = activeSessions.find((s) => s.cwd === cwd);
      const name = path.basename(cwd);
      const code = countCode(cwd);
      const deliverable = detectDeliverable(cwd);
      const description = detectDescription(cwd);

      projectsByPath.set(cwd, {
        name,
        displayName: name,
        description,
        path: cwd,
        encodedPath: encoded,
        lastActivity: info.lastModified,
        sessionCount: info.count,
        recentSessions: [],
        hasClaudeMd: fs.existsSync(path.join(cwd, "CLAUDE.md")),
        gitBranch: git.branch,
        gitDirty: git.dirty,
        isActive: !!active,
        activePid: active?.pid ?? null,
        linesOfCode: code.lines,
        fileCount: code.files,
        deliverable,
      });
    }
  }

  // 3. Scan home directory for projects with CLAUDE.md that weren't found via sessions
  if (HOME_DIR) {
    try {
      const homeDirs = fs.readdirSync(HOME_DIR, { withFileTypes: true });
      for (const entry of homeDirs) {
        if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
        const dirPath = path.join(HOME_DIR, entry.name);
        if (projectsByPath.has(dirPath)) continue;
        if (SKIP_PATHS.has(dirPath)) continue;

        // Only add if it has CLAUDE.md or .claude/ (clearly a Claude Code project)
        const hasClaudeMd = fs.existsSync(path.join(dirPath, "CLAUDE.md"));
        const hasClaudeDir = fs.existsSync(path.join(dirPath, ".claude"));
        if (!hasClaudeMd && !hasClaudeDir) continue;

        const git = getGitInfo(dirPath);
        const active = activeSessions.find((s) => s.cwd === dirPath);
        const name = path.basename(dirPath);
        const code = countCode(dirPath);
        const deliverable = detectDeliverable(dirPath);
        const description = detectDescription(dirPath);

        projectsByPath.set(dirPath, {
          name,
          displayName: name,
          description,
          path: dirPath,
          encodedPath: "",
          lastActivity: new Date(0).toISOString(),
          sessionCount: 0,
          recentSessions: [],
          hasClaudeMd,
          gitBranch: git.branch,
          gitDirty: git.dirty,
          isActive: !!active,
          activePid: active?.pid ?? null,
          linesOfCode: code.lines,
          fileCount: code.files,
          deliverable,
        });
      }
    } catch {
      // ignore
    }
  }

  // Apply display name aliases
  const aliases = getAliases();
  for (const project of projectsByPath.values()) {
    project.displayName = aliases[project.path] || project.name;
  }

  // Filter out empty/dead projects (no code files at all)
  const projects = Array.from(projectsByPath.values()).filter(
    (p) => p.linesOfCode > 0 || p.fileCount > 0 || p.isActive
  );
  projects.sort(
    (a, b) =>
      new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
  );

  return projects;
}
