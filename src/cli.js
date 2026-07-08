const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline/promises");
const { spawnSync } = require("node:child_process");
const { renderIssueMarkdownFromJson } = require("./render-issue-md");

const REPO_ROOT = path.resolve(__dirname, "..");
const CONFIG_DIR = path.join(os.homedir(), ".config", "jira-ticket-tools");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.env");
const CONFIG_KEYS = [
  "JIRA_BASE",
  "JIRA_EMAIL",
  "JIRA_API_TOKEN",
  "JIRA_TICKET_TOOLS_DIR"
];

function print(text) {
  process.stdout.write(`${text}\n`);
}

function printErr(text) {
  process.stderr.write(`${text}\n`);
}

function commandExists(name) {
  const result = spawnSync("bash", ["-lc", `command -v ${name}`], {
    stdio: "ignore"
  });
  return result.status === 0;
}

function parseEnvText(text) {
  const out = {};
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }
    const key = match[1];
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadConfigFile() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return {};
  }
  const content = fs.readFileSync(CONFIG_PATH, "utf8");
  return parseEnvText(content);
}

function writeConfigFile(config) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const lines = ["# jira-ticket-tools managed config"];
  for (const key of CONFIG_KEYS) {
    const value = config[key];
    if (!value) {
      continue;
    }
    const safe = String(value).replace(/"/g, '\\"');
    lines.push(`${key}="${safe}"`);
  }
  fs.writeFileSync(CONFIG_PATH, `${lines.join("\n")}\n`, "utf8");
}

function loadCwdEnvFile() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    return { values: {}, found: false, path: envPath };
  }
  const content = fs.readFileSync(envPath, "utf8");
  return {
    values: parseEnvText(content),
    found: true,
    path: envPath
  };
}

function getRuntimeConfig() {
  const cwdEnv = loadCwdEnvFile();
  return {
    ...loadConfigFile(),
    ...cwdEnv.values,
    ...process.env
  };
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

async function fetchToFile(url, outputPath, acceptHeader, env) {
  const auth = Buffer.from(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`).toString("base64");
  const response = await fetch(url, {
    headers: {
      Accept: acceptHeader,
      Authorization: `Basic ${auth}`
    }
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Jira request failed (${response.status} ${response.statusText})${details ? `: ${details.slice(0, 240)}` : ""}`);
  }

  const body = await response.arrayBuffer();
  ensureDir(path.dirname(outputPath));
  fs.writeFileSync(outputPath, Buffer.from(body));
}

function copyFileToTarget(sourcePath, targetPath) {
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
}

function copyDirToTarget(sourceDir, targetDir) {
  ensureDir(path.dirname(targetDir));
  fs.cpSync(sourceDir, targetDir, { recursive: true });
}

function parseOptions(args, optionSpec) {
  const options = {};
  const positionals = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const spec = optionSpec[arg];
    if (!spec) {
      positionals.push(arg);
      continue;
    }
    if (spec === "boolean") {
      options[arg] = true;
      continue;
    }
    const next = args[i + 1];
    if (!next || next.startsWith("-")) {
      printErr(`Missing value for ${arg}`);
      process.exit(1);
    }
    options[arg] = next;
    i += 1;
  }
  return { options, positionals };
}

function printMainHelp() {
  print("jira-ticket-tools (jtt)");
  print("");
  print("Usage:");
  print("  jtt <command> [options]");
  print("");
  print("Commands:");
  print("  setup        Save Jira config and install AI integrations");
  print("  integrate    Install/update OpenCode, Claude Code, and Cursor templates");
  print("  config       Manage stored Jira settings");
  print("  export       Manually export Jira issues to markdown/json/xml");
  print("  doctor       Run troubleshooting checks");
  print("  troubleshoot Alias for doctor");
  print("  uninstall    Remove installed AI integration templates");
  print("  help         Show this help");
  print("");
  print("Run `jtt <command> --help` for command-specific options.");
}

async function promptForSetupValues(config) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const questions = [
    {
      key: "JIRA_BASE",
      label: "Jira base URL (for example https://your-domain.atlassian.net):"
    },
    {
      key: "JIRA_EMAIL",
      label: "Jira email:"
    },
    {
      key: "JIRA_API_TOKEN",
      label: "Jira API token:"
    }
  ];

  try {
    for (const question of questions) {
      if (config[question.key]) {
        continue;
      }
      while (true) {
        const answer = (await rl.question(`${question.label} `)).trim();
        if (answer) {
          config[question.key] = answer;
          break;
        }
      }
    }
  } finally {
    rl.close();
  }
}

async function commandSetup(args) {
  const { options } = parseOptions(args, {
    "--jira-base": "string",
    "--jira-email": "string",
    "--jira-api-token": "string",
    "--integrate": "string",
    "--non-interactive": "boolean",
    "--force": "boolean",
    "--no-integrate": "boolean",
    "--quiet": "boolean",
    "--help": "boolean",
    "-h": "boolean"
  });

  if (options["--help"] || options["-h"]) {
    print("Usage: jtt setup [options]");
    print("");
    print("Options:");
    print("  --jira-base <url>");
    print("  --jira-email <email>");
    print("  --jira-api-token <token>");
    print("  --integrate <all|opencode|claude|cursor>   (default: all)");
    print("  --non-interactive");
    print("  --no-integrate");
    print("  --force");
    print("  --quiet");
    return;
  }

  const current = loadConfigFile();
  const next = { ...current, ...process.env };
  if (options["--jira-base"]) {
    next.JIRA_BASE = options["--jira-base"];
  }
  if (options["--jira-email"]) {
    next.JIRA_EMAIL = options["--jira-email"];
  }
  if (options["--jira-api-token"]) {
    next.JIRA_API_TOKEN = options["--jira-api-token"];
  }
  next.JIRA_TICKET_TOOLS_DIR = REPO_ROOT;

  let missing = ["JIRA_BASE", "JIRA_EMAIL", "JIRA_API_TOKEN"].filter((key) => !next[key]);
  if (missing.length > 0 && !options["--non-interactive"] && process.stdin.isTTY) {
    print("Missing Jira settings. Enter values to continue setup.");
    print("Create a token at: https://id.atlassian.com/manage-profile/security/api-tokens");
    await promptForSetupValues(next);
    missing = ["JIRA_BASE", "JIRA_EMAIL", "JIRA_API_TOKEN"].filter((key) => !next[key]);
  }

  if (missing.length > 0) {
    printErr(`Missing Jira config: ${missing.join(", ")}`);
    printErr("Set them with setup flags, run interactive `jtt setup`, or export env vars before running setup.");
    process.exit(1);
  }

  writeConfigFile(next);
  print(`Saved config: ${CONFIG_PATH}`);

  if (!options["--no-integrate"]) {
    const provider = options["--integrate"] || "all";
    runIntegrate(provider, {
      force: Boolean(options["--force"]),
      quiet: Boolean(options["--quiet"])
    });
  }
}

function installOpenCodeIntegration(force) {
  const sourceDir = path.join(REPO_ROOT, "opencode");
  const targetRoot = path.join(os.homedir(), ".config", "opencode");
  const requiredFiles = [
    path.join(targetRoot, "commands", "jira-plan.md"),
    path.join(targetRoot, "commands", "jira-review.md"),
    path.join(targetRoot, "skills", "jira-issue-implementation", "SKILL.md")
  ];
  const allPresent = requiredFiles.every((item) => fs.existsSync(item));
  if (allPresent && !force) {
    return { status: "skipped", message: `OpenCode already installed at ${targetRoot}` };
  }

  if (!fs.existsSync(sourceDir)) {
    return { status: "failed", message: `Missing source integration directory: ${sourceDir}` };
  }

  copyFileToTarget(path.join(sourceDir, "commands", "jira-plan.md"), path.join(targetRoot, "commands", "jira-plan.md"));
  copyFileToTarget(path.join(sourceDir, "commands", "jira-review.md"), path.join(targetRoot, "commands", "jira-review.md"));
  copyFileToTarget(
    path.join(sourceDir, "skills", "jira-issue-implementation", "SKILL.md"),
    path.join(targetRoot, "skills", "jira-issue-implementation", "SKILL.md")
  );

  return { status: "installed", message: `Installed OpenCode templates to ${targetRoot}` };
}

function installClaudeIntegration(force) {
  const sourceDir = path.join(REPO_ROOT, "claude-code");
  const targetRoot = path.join(os.homedir(), ".claude");
  const requiredFiles = [
    path.join(targetRoot, "commands", "jira-plan.md"),
    path.join(targetRoot, "commands", "jira-review.md"),
    path.join(targetRoot, "skills", "jira-issue-implementation", "SKILL.md")
  ];
  const allPresent = requiredFiles.every((item) => fs.existsSync(item));
  if (allPresent && !force) {
    return { status: "skipped", message: `Claude Code already installed at ${targetRoot}` };
  }

  if (!fs.existsSync(sourceDir)) {
    return { status: "failed", message: `Missing source integration directory: ${sourceDir}` };
  }

  copyFileToTarget(path.join(sourceDir, "commands", "jira-plan.md"), path.join(targetRoot, "commands", "jira-plan.md"));
  copyFileToTarget(path.join(sourceDir, "commands", "jira-review.md"), path.join(targetRoot, "commands", "jira-review.md"));
  copyFileToTarget(
    path.join(sourceDir, "skills", "jira-issue-implementation", "SKILL.md"),
    path.join(targetRoot, "skills", "jira-issue-implementation", "SKILL.md")
  );

  return { status: "installed", message: `Installed Claude Code templates to ${targetRoot}` };
}

function installCursorIntegration(force) {
  const sourceDir = path.join(REPO_ROOT, "cursor", "skills");
  const targetRoot = path.join(os.homedir(), ".cursor", "skills");
  const requiredFiles = [
    path.join(targetRoot, "jira-plan", "SKILL.md"),
    path.join(targetRoot, "jira-plan", "scripts", "ensure-export.sh"),
    path.join(targetRoot, "jira-review", "SKILL.md"),
    path.join(targetRoot, "jira-review", "scripts", "require-export.sh")
  ];
  const allPresent = requiredFiles.every((item) => fs.existsSync(item));
  if (allPresent && !force) {
    return { status: "skipped", message: `Cursor already installed at ${targetRoot}` };
  }

  if (!fs.existsSync(sourceDir)) {
    return { status: "failed", message: `Missing source integration directory: ${sourceDir}` };
  }

  ensureDir(targetRoot);
  removePath(path.join(targetRoot, "jira-plan"));
  removePath(path.join(targetRoot, "jira-review"));
  copyDirToTarget(path.join(sourceDir, "jira-plan"), path.join(targetRoot, "jira-plan"));
  copyDirToTarget(path.join(sourceDir, "jira-review"), path.join(targetRoot, "jira-review"));
  fs.chmodSync(path.join(targetRoot, "jira-plan", "scripts", "ensure-export.sh"), 0o755);
  fs.chmodSync(path.join(targetRoot, "jira-review", "scripts", "require-export.sh"), 0o755);

  return { status: "installed", message: `Installed Cursor templates to ${targetRoot}` };
}

function runIntegrate(provider, options = {}) {
  const quiet = Boolean(options.quiet);
  const force = Boolean(options.force);
  const providers = provider === "all" ? ["opencode", "claude", "cursor"] : [provider];
  const installers = {
    opencode: installOpenCodeIntegration,
    claude: installClaudeIntegration,
    cursor: installCursorIntegration
  };

  let installed = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of providers) {
    if (!installers[item]) {
      printErr(`Unknown provider: ${item}`);
      printErr("Valid values: all, opencode, claude, cursor");
      process.exit(1);
    }

    const result = installers[item](force);
    if (result.status === "installed") {
      installed += 1;
      if (!quiet) {
        print(result.message);
      }
    } else if (result.status === "skipped") {
      skipped += 1;
      if (!quiet) {
        print(result.message);
      }
    } else {
      failed += 1;
      printErr(result.message);
    }
  }

  if (!quiet || failed > 0) {
    print(`Summary: installed=${installed}, skipped=${skipped}, failed=${failed}`);
  }

  if (failed > 0) {
    process.exit(1);
  }
}

function removePath(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return false;
  }
  fs.rmSync(targetPath, { recursive: true, force: true });
  return true;
}

function uninstallProvider(provider, quiet = false, dryRun = false) {
  const removed = [];

  const maybeRemove = (targetPath) => {
    if (dryRun) {
      return fs.existsSync(targetPath);
    }
    return removePath(targetPath);
  };

  if (provider === "opencode") {
    const root = path.join(os.homedir(), ".config", "opencode");
    if (maybeRemove(path.join(root, "commands", "jira-plan.md"))) {
      removed.push("~/.config/opencode/commands/jira-plan.md");
    }
    if (maybeRemove(path.join(root, "commands", "jira-review.md"))) {
      removed.push("~/.config/opencode/commands/jira-review.md");
    }
    if (maybeRemove(path.join(root, "skills", "jira-issue-implementation"))) {
      removed.push("~/.config/opencode/skills/jira-issue-implementation/");
    }
  }

  if (provider === "claude") {
    const root = path.join(os.homedir(), ".claude");
    if (maybeRemove(path.join(root, "commands", "jira-plan.md"))) {
      removed.push("~/.claude/commands/jira-plan.md");
    }
    if (maybeRemove(path.join(root, "commands", "jira-review.md"))) {
      removed.push("~/.claude/commands/jira-review.md");
    }
    if (maybeRemove(path.join(root, "skills", "jira-issue-implementation"))) {
      removed.push("~/.claude/skills/jira-issue-implementation/");
    }
  }

  if (provider === "cursor") {
    const root = path.join(os.homedir(), ".cursor", "skills");
    if (maybeRemove(path.join(root, "jira-plan"))) {
      removed.push("~/.cursor/skills/jira-plan/");
    }
    if (maybeRemove(path.join(root, "jira-review"))) {
      removed.push("~/.cursor/skills/jira-review/");
    }
  }

  if (!quiet) {
    if (removed.length === 0) {
      print(`No ${provider} integration files found.`);
    } else {
      print(`${dryRun ? "Would remove" : "Removed"} ${provider} integration files:`);
      for (const item of removed) {
        print(`- ${item}`);
      }
    }
  }
}

function commandUninstall(args) {
  const { options, positionals } = parseOptions(args, {
    "--remove-config": "boolean",
    "--dry-run": "boolean",
    "--quiet": "boolean",
    "--help": "boolean",
    "-h": "boolean"
  });

  if (options["--help"] || options["-h"]) {
    print("Usage: jtt uninstall [all|opencode|claude|cursor] [--remove-config] [--dry-run] [--quiet]");
    return;
  }

  const target = positionals[0] || "all";
  const quiet = Boolean(options["--quiet"]);
  const dryRun = Boolean(options["--dry-run"]);
  const providers = target === "all" ? ["opencode", "claude", "cursor"] : [target];
  for (const provider of providers) {
    if (!["opencode", "claude", "cursor"].includes(provider)) {
      printErr(`Unknown provider: ${provider}`);
      printErr("Valid values: all, opencode, claude, cursor");
      process.exit(1);
    }
    uninstallProvider(provider, quiet, dryRun);
  }

  if (options["--remove-config"]) {
    const removed = dryRun ? fs.existsSync(CONFIG_PATH) : removePath(CONFIG_PATH);
    if (!quiet) {
      if (removed) {
        print(`${dryRun ? "Would remove" : "Removed"} config file: ${CONFIG_PATH}`);
      } else {
        print(`No config file found at: ${CONFIG_PATH}`);
      }
    }
  }
}

function commandIntegrate(args) {
  const { options, positionals } = parseOptions(args, {
    "--force": "boolean",
    "--quiet": "boolean",
    "--help": "boolean",
    "-h": "boolean"
  });

  if (options["--help"] || options["-h"]) {
    print("Usage: jtt integrate [all|opencode|claude|cursor] [--force] [--quiet]");
    return;
  }

  const provider = positionals[0] || "all";
  runIntegrate(provider, {
    force: Boolean(options["--force"]),
    quiet: Boolean(options["--quiet"])
  });
}

async function commandExport(args) {
  const { options, positionals } = parseOptions(args, {
    "--format": "string",
    "--quiet": "boolean",
    "--help": "boolean",
    "-h": "boolean"
  });

  if (options["--help"] || options["-h"]) {
    print("Usage: jtt export <ISSUE_KEY> [OUTPUT_FILE] [--format md|json|xml] [--quiet]");
    return;
  }

  const issueKey = positionals[0];
  if (!issueKey) {
    printErr("Usage: jtt export <ISSUE_KEY> [OUTPUT_FILE] [--format md|json|xml]");
    process.exit(1);
  }

  const output = positionals[1];
  const format = (options["--format"] || "md").toLowerCase();
  if (!["md", "json", "xml"].includes(format)) {
    printErr(`Invalid format: ${format}`);
    printErr("Valid values: md, json, xml");
    process.exit(1);
  }

  const env = getRuntimeConfig();
  const required = ["JIRA_BASE", "JIRA_EMAIL", "JIRA_API_TOKEN"];
  const missing = required.filter((key) => !env[key]);
  if (missing.length > 0) {
    printErr(`Missing Jira config: ${missing.join(", ")}`);
    printErr("Run `jtt setup` to configure Jira access.");
    process.exit(1);
  }

  const jiraBase = String(env.JIRA_BASE).replace(/\/$/, "");

  if (format === "json") {
    const outputPath = output || path.join("docs", "jira-exports", issueKey, `${issueKey}.json`);
    const url = `${jiraBase}/rest/api/3/issue/${issueKey}`;
    await fetchToFile(url, outputPath, "application/json", env);
    if (!options["--quiet"]) {
      print(`Saved ${outputPath}`);
    }
    return;
  }

  if (format === "xml") {
    const outputPath = output || path.join("docs", "jira-exports", issueKey, `${issueKey}.xml`);
    const url = `${jiraBase}/si/jira.issueviews:issue-xml/${issueKey}/${issueKey}.xml`;
    await fetchToFile(url, outputPath, "application/xml", env);
    if (!options["--quiet"]) {
      print(`Saved ${outputPath}`);
    }
    return;
  }

  const outputPath = output || path.join("docs", "jira-exports", issueKey, `${issueKey}.md`);
  const jsonUrl = `${jiraBase}/rest/api/3/issue/${issueKey}`;
  const auth = Buffer.from(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`).toString("base64");
  const response = await fetch(jsonUrl, {
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${auth}`
    }
  });
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Jira request failed (${response.status} ${response.statusText})${details ? `: ${details.slice(0, 240)}` : ""}`);
  }
  const data = await response.json();
  const result = await renderIssueMarkdownFromJson(data, outputPath, env, (message) => {
    if (!options["--quiet"]) {
      printErr(`Warning: ${message}`);
    }
  });

  print(`Saved ${result.outputPath}`);
  if (result.downloadedAny && !options["--quiet"]) {
    print(`Saved image assets in ${result.assetsDir}`);
  }
}

function commandDoctor(args) {
  const { options } = parseOptions(args, {
    "--provider": "string",
    "--quiet": "boolean",
    "--help": "boolean",
    "-h": "boolean"
  });

  if (options["--help"] || options["-h"]) {
    print("Usage: jtt doctor [--provider opencode|claude|cursor] [--quiet]");
    return;
  }

  const quiet = Boolean(options["--quiet"]);
  const provider = options["--provider"];
  const selectedProviders = provider ? [provider] : ["opencode", "claude", "cursor"];
  for (const item of selectedProviders) {
    if (!["opencode", "claude", "cursor"].includes(item)) {
      printErr(`Invalid provider: ${item}`);
      process.exit(1);
    }
  }

  let okCount = 0;
  let warnCount = 0;
  let failCount = 0;

  const ok = (msg) => {
    okCount += 1;
    if (!quiet) {
      print(`OK: ${msg}`);
    }
  };
  const warn = (msg) => {
    warnCount += 1;
    print(`WARN: ${msg}`);
  };
  const fail = (msg) => {
    failCount += 1;
    printErr(`FAIL: ${msg}`);
  };

  const checkCommand = (name) => {
    if (commandExists(name)) {
      ok(`Dependency found: ${name}`);
    } else {
      fail(`Missing dependency: ${name}`);
    }
  };

  checkCommand("node");
  checkCommand("bash");

  const cwdEnv = loadCwdEnvFile();
  if (cwdEnv.found) {
    ok(`Loaded .env from ${cwdEnv.path}`);
  } else {
    warn(`No .env file at ${cwdEnv.path}`);
  }

  const env = { ...loadConfigFile(), ...cwdEnv.values, ...process.env };
  const requiredVars = ["JIRA_BASE", "JIRA_EMAIL", "JIRA_API_TOKEN"];
  for (const key of requiredVars) {
    if (env[key]) {
      ok(`Environment variable set: ${key}`);
    } else {
      fail(`Environment variable missing: ${key}`);
    }
  }

  if (env.JIRA_TICKET_TOOLS_DIR) {
    ok(`JIRA_TICKET_TOOLS_DIR set: ${env.JIRA_TICKET_TOOLS_DIR}`);
  } else {
    warn("JIRA_TICKET_TOOLS_DIR is not set (optional with package install)");
  }

  const checkFile = (filePath, label) => {
    if (fs.existsSync(filePath)) {
      ok(`${label}: ${filePath}`);
    } else {
      warn(`${label} not found: ${filePath}`);
    }
  };

  if (selectedProviders.includes("opencode")) {
    checkFile(path.join(os.homedir(), ".config", "opencode", "commands", "jira-plan.md"), "OpenCode command");
    checkFile(path.join(os.homedir(), ".config", "opencode", "commands", "jira-review.md"), "OpenCode command");
    checkFile(path.join(os.homedir(), ".config", "opencode", "skills", "jira-issue-implementation", "SKILL.md"), "OpenCode skill");
  }

  if (selectedProviders.includes("claude")) {
    checkFile(path.join(os.homedir(), ".claude", "commands", "jira-plan.md"), "Claude Code command");
    checkFile(path.join(os.homedir(), ".claude", "commands", "jira-review.md"), "Claude Code command");
    checkFile(path.join(os.homedir(), ".claude", "skills", "jira-issue-implementation", "SKILL.md"), "Claude Code skill");
  }

  if (selectedProviders.includes("cursor")) {
    checkFile(path.join(os.homedir(), ".cursor", "skills", "jira-plan", "SKILL.md"), "Cursor skill");
    checkFile(path.join(os.homedir(), ".cursor", "skills", "jira-plan", "scripts", "ensure-export.sh"), "Cursor skill script");
    checkFile(path.join(os.homedir(), ".cursor", "skills", "jira-review", "SKILL.md"), "Cursor skill");
    checkFile(path.join(os.homedir(), ".cursor", "skills", "jira-review", "scripts", "require-export.sh"), "Cursor skill script");
  }

  print(`Summary: ${okCount} ok, ${warnCount} warnings, ${failCount} failures`);
  if (failCount > 0) {
    process.exit(1);
  }
}

function commandConfig(args) {
  const sub = args[0];
  const rest = args.slice(1);
  const config = loadConfigFile();

  if (!sub || sub === "help" || sub === "--help" || sub === "-h") {
    print("Usage: jtt config <path|get|set|validate>");
    print("");
    print("Examples:");
    print("  jtt config path");
    print("  jtt config get JIRA_BASE");
    print("  jtt config set JIRA_BASE https://your-domain.atlassian.net");
    print("  jtt config validate");
    return;
  }

  if (sub === "path") {
    print(CONFIG_PATH);
    return;
  }

  if (sub === "get") {
    const key = rest[0];
    if (!key) {
      printErr("Usage: jtt config get <KEY>");
      process.exit(1);
    }
    if (config[key]) {
      print(config[key]);
      return;
    }
    process.exit(1);
  }

  if (sub === "set") {
    const key = rest[0];
    const value = rest[1];
    if (!key || typeof value === "undefined") {
      printErr("Usage: jtt config set <KEY> <VALUE>");
      process.exit(1);
    }
    if (!CONFIG_KEYS.includes(key)) {
      printErr(`Unsupported key: ${key}`);
      printErr(`Allowed keys: ${CONFIG_KEYS.join(", ")}`);
      process.exit(1);
    }
    const next = { ...config, [key]: value };
    writeConfigFile(next);
    print(`Updated ${key} in ${CONFIG_PATH}`);
    return;
  }

  if (sub === "validate") {
    const env = getRuntimeConfig();
    const required = ["JIRA_BASE", "JIRA_EMAIL", "JIRA_API_TOKEN"];
    const missing = required.filter((key) => !env[key]);
    if (missing.length > 0) {
      printErr(`Missing required config: ${missing.join(", ")}`);
      process.exit(1);
    }
    print("Config looks good.");
    return;
  }

  printErr(`Unknown config command: ${sub}`);
  process.exit(1);
}

async function run(argv) {
  const command = argv[0];
  const args = argv.slice(1);

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printMainHelp();
    return;
  }

  if (command === "setup") {
    await commandSetup(args);
    return;
  }

  if (command === "integrate") {
    commandIntegrate(args);
    return;
  }

  if (command === "export") {
    await commandExport(args);
    return;
  }

  if (command === "doctor" || command === "troubleshoot") {
    commandDoctor(args);
    return;
  }

  if (command === "uninstall") {
    commandUninstall(args);
    return;
  }

  if (command === "config") {
    commandConfig(args);
    return;
  }

  printErr(`Unknown command: ${command}`);
  printErr("Run `jtt help` for available commands.");
  process.exit(1);
}

module.exports = {
  run
};
