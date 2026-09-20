#!/usr/bin/env node
/**
 * Portable MCP configuration generator.
 *
 * Prints ready-to-paste MCP client config for THIS machine, so the StrideLab
 * MCP server can be added to any MCP-capable client without guessing absolute
 * paths, shell setup, or vendor-specific formats.
 *
 * Usage:
 *   pnpm mcp:config                 # all clients + detected environment
 *   pnpm mcp:config --client claude # one client only
 *   pnpm mcp:config --json          # just the generic stdio JSON
 *   pnpm mcp:config --name myserver # override the server name
 *
 * The generated launcher uses the repo-local tsx binary and an absolute
 * tsconfig, so it needs neither pnpm nor a specific working directory.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverEntry = path.join(repoRoot, "apps/lab", "src", "mcp", "server.ts");
const tsconfigPath = path.join(repoRoot, "apps", "lab", "tsconfig.json");

/**
 * Minimal .env reader that never overrides already-exported variables, so
 * `pnpm mcp:config` can report the same remote-MCP settings the Lab uses.
 */
function loadDotEnv(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (Object.prototype.hasOwnProperty.call(process.env, key)) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotEnv(path.join(repoRoot, ".env"));

function firstExisting(candidates) {
  return candidates.find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch {
      return false;
    }
  });
}

function findOnPath(bin) {
  const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const exts = process.platform === "win32" ? [".cmd", ".exe", ""] : [""];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, bin + ext);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      } catch {
        /* keep looking */
      }
    }
  }
  return undefined;
}

const tsxCli = firstExisting([
  path.join(repoRoot, "apps", "lab", "node_modules", "tsx", "dist", "cli.mjs"),
  path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs"),
]);
const nodePath = findOnPath("node") ?? process.execPath;
const pnpmPath =
  findOnPath("pnpm") ??
  (process.env.npm_execpath && fs.existsSync(process.env.npm_execpath)
    ? process.env.npm_execpath
    : undefined) ??
  "pnpm";

const argv = process.argv.slice(2);
function flag(name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}
const jsonOnly = argv.includes("--json");
const onlyClient = flag("--client");
const serverName = flag("--name") ?? process.env.STRIDELAB_MCP_NAME ?? "stridelab";

/**
 * Preferred launcher: absolute node + repo-local tsx + server entry.
 * Falls back to pnpm only if tsx is not installed yet.
 */
const stdio = tsxCli
  ? {
      command: nodePath,
      args: [tsxCli, "--tsconfig", tsconfigPath, serverEntry],
    }
  : {
      command: pnpmPath,
      args: ["--dir", repoRoot, "--silent", "--filter", "lab", "mcp"],
    };

const labPublicUrl = (
  process.env.LAB_PUBLIC_URL?.trim() || "http://localhost:4030"
).replace(/\/$/, "");
const remoteEnabled =
  process.env.MCP_HTTP_ENABLED?.trim().toLowerCase() === "true";
const remoteToken = process.env.MCP_HTTP_AUTH_TOKEN?.trim();

function claudeDesktopPath() {
  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json",
    );
  }
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA ?? "%APPDATA%", "Claude", "claude_desktop_config.json");
  }
  return path.join(os.homedir(), ".config", "Claude", "claude_desktop_config.json");
}

const configs = {
  generic: {
    mcpServers: { [serverName]: stdio },
  },
  claude: {
    mcpServers: { [serverName]: stdio },
  },
  cursor: {
    mcpServers: { [serverName]: stdio },
  },
  windsurf: {
    mcpServers: { [serverName]: stdio },
  },
  codex: {
    mcpServers: { [serverName]: stdio },
  },
  vscode: {
    servers: { [serverName]: { type: "stdio", ...stdio } },
  },
  zed: {
    context_servers: {
      [serverName]: { command: { path: stdio.command, args: stdio.args }, settings: {} },
    },
  },
  remote: {
    mcpServers: {
      [serverName]: {
        type: "http",
        url: `${labPublicUrl}/api/mcp`,
        headers: { Authorization: "Bearer ${MCP_HTTP_AUTH_TOKEN}" },
      },
    },
  },
};

function stringify(value) {
  return JSON.stringify(value, null, 2);
}

if (jsonOnly) {
  process.stdout.write(`${stringify(configs.generic)}\n`);
  process.exit(0);
}

const line = "─".repeat(72);
function section(title) {
  process.stdout.write(`\n${line}\n${title}\n${line}\n`);
}

process.stdout.write(
  [
    "StrideLab MCP — portable configuration",
    "",
    `Repository:   ${repoRoot}`,
    `Node:         ${nodePath}`,
    `tsx:          ${tsxCli ?? "(not installed — falling back to pnpm)"}`,
    `pnpm:         ${pnpmPath}`,
    `Launcher:     ${tsxCli ? "node + repo-local tsx (no pnpm, no shell needed)" : "pnpm workspace"}`,
  ].join("\n") + "\n",
);

if (!onlyClient || onlyClient === "claude") {
  section(`Claude Desktop  →  ${claudeDesktopPath()}`);
  process.stdout.write(
    `${stringify(configs.claude)}\n\nFully quit and reopen Claude Desktop after saving.\n`,
  );
}

if (!onlyClient || onlyClient === "cursor") {
  section("Cursor  →  .cursor/mcp.json (this repo) or ~/.cursor/mcp.json");
  process.stdout.write(`${stringify(configs.cursor)}\n`);
}

if (!onlyClient || onlyClient === "vscode") {
  section("VS Code / GitHub Copilot  →  .vscode/mcp.json");
  process.stdout.write(`${stringify(configs.vscode)}\n`);
}

if (!onlyClient || onlyClient === "windsurf") {
  section("Windsurf / Cline  →  their MCP settings file");
  process.stdout.write(`${stringify(configs.windsurf)}\n`);
}

if (!onlyClient || onlyClient === "zed") {
  section("Zed  →  settings.json");
  process.stdout.write(`${stringify(configs.zed)}\n`);
}

if (!onlyClient || onlyClient === "codex") {
  section("Claude Code / Codex CLI");
  const argsText = stdio.args.map((a) => (a.includes(" ") ? JSON.stringify(a) : a)).join(" ");
  process.stdout.write(`claude mcp add ${serverName} -- ${stdio.command} ${argsText}\n`);
}

if (!onlyClient || onlyClient === "remote") {
  section("Remote HTTP (any MCP client with Streamable HTTP support)");
  if (remoteEnabled && remoteToken) {
    process.stdout.write(
      `${stringify(configs.remote)}\n\nReplace \${MCP_HTTP_AUTH_TOKEN} with the value of MCP_HTTP_AUTH_TOKEN.\n`,
    );
  } else {
    process.stdout.write(
      [
        "Remote MCP is not enabled on this machine.",
        "Enable it in .env, then restart the Lab:",
        "",
        "  MCP_HTTP_ENABLED=true",
        "  MCP_HTTP_AUTH_TOKEN=<a long random token>",
        `  LAB_PUBLIC_URL=${labPublicUrl}`,
        "",
        `Endpoint: ${labPublicUrl}/api/mcp`,
        "Auth:     Authorization: Bearer <MCP_HTTP_AUTH_TOKEN>",
        "",
      ].join("\n"),
    );
  }
}

if (!onlyClient || onlyClient === "generic") {
  section("Generic stdio JSON (any MCP client)");
  process.stdout.write(`${stringify(configs.generic)}\n`);
}

process.stdout.write(
  [
    "",
    "Notes:",
    "  • No secrets are included. Credentials and tokens stay in .env.",
    "  • The launcher uses absolute paths, so the client's working directory",
    "    and PATH do not matter.",
    "  • Verify the server first with: pnpm mcp:check",
    "",
  ].join("\n"),
);
