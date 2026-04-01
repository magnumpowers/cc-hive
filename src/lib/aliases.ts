import fs from "fs";
import path from "path";

const ALIASES_PATH = path.join(process.env.HOME || "", ".claude", "hive-aliases.json");

export function getAliases(): Record<string, string> {
  try {
    if (!fs.existsSync(ALIASES_PATH)) return {};
    return JSON.parse(fs.readFileSync(ALIASES_PATH, "utf-8"));
  } catch {
    return {};
  }
}

export function setAlias(projectPath: string, displayName: string | null) {
  const aliases = getAliases();
  if (displayName && displayName.length <= 100) {
    aliases[projectPath] = displayName;
  } else {
    delete aliases[projectPath];
  }
  try {
    fs.writeFileSync(ALIASES_PATH, JSON.stringify(aliases, null, 2));
  } catch {
    throw new Error("Failed to write aliases file");
  }
}
