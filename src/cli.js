const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline/promises");
const { pathToFileURL } = require("node:url");
const { spawnSync } = require("node:child_process");
const { renderIssueMarkdownFromJson } = require("./render-issue-md");

const REPO_ROOT = path.resolve(__dirname, "..");
const CONFIG_DIR = path.join(os.homedir(), ".config", "jira-ticket-tools");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.env");
const CONFIG_KEYS = [
  "JIRA_BASE",
  "JIRA_EMAIL",
  "JIRA_API_TOKEN"
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
    ...process.env,
    ...cwdEnv.values,
    ...loadConfigFile()
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
  print("Flags:");
  print("  --plain      Disable TUI and use plain output (supported commands)");
  print("  --quiet      Minimize logs/output where supported");
  print("  --help, -h   Show help for a command");
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

async function promptHiddenValue(label) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    const wasRaw = Boolean(stdin.isRaw);
    let answer = "";

    const finish = (value) => {
      stdin.removeListener("data", onData);
      if (stdin.isTTY) {
        stdin.setRawMode(wasRaw);
      }
      stdout.write("\n");
      resolve(value.trim());
    };

    const fail = (error) => {
      stdin.removeListener("data", onData);
      if (stdin.isTTY) {
        stdin.setRawMode(wasRaw);
      }
      stdout.write("\n");
      reject(error);
    };

    const onData = (chunk) => {
      const char = String(chunk);
      if (char === "\r" || char === "\n") {
        finish(answer);
        return;
      }
      if (char === "\u0003") {
        fail(new Error("Setup cancelled."));
        return;
      }
      if (char === "\u0008" || char === "\u007f") {
        if (answer.length > 0) {
          answer = answer.slice(0, -1);
          stdout.write("\b \b");
        }
        return;
      }
      if (char >= " ") {
        answer += char;
        stdout.write("*");
      }
    };

    stdout.write(`${label} `);
    stdin.resume();
    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }
    stdin.on("data", onData);
  });
}

async function promptForSetupValuesWithTui(config) {
  const modulePath = pathToFileURL(path.join(__dirname, "setup-tui.mjs")).href;
  const { runSetupTui } = await import(modulePath);
  const result = await runSetupTui({
    jiraBase: config.JIRA_BASE || "",
    jiraEmail: config.JIRA_EMAIL || "",
    jiraApiToken: config.JIRA_API_TOKEN || ""
  });
  if (result.status !== "success") {
    return result;
  }
  config.JIRA_BASE = result.values.jiraBase;
  config.JIRA_EMAIL = result.values.jiraEmail;
  config.JIRA_API_TOKEN = result.values.jiraApiToken;
  return result;
}

async function showSetupSummaryTui(payload) {
  const modulePath = pathToFileURL(path.join(__dirname, "setup-tui.mjs")).href;
  const { runSetupSummaryTui } = await import(modulePath);
  await runSetupSummaryTui(payload);
}

async function showIntegrateSummaryTui(payload) {
  const modulePath = pathToFileURL(path.join(__dirname, "setup-tui.mjs")).href;
  const { runIntegrateSummaryTui } = await import(modulePath);
  await runIntegrateSummaryTui(payload);
}

async function showDoctorSummaryTui(payload) {
  const modulePath = pathToFileURL(path.join(__dirname, "setup-tui.mjs")).href;
  const { runDoctorSummaryTui } = await import(modulePath);
  await runDoctorSummaryTui(payload);
}

async function showUninstallSummaryTui(payload) {
  const modulePath = pathToFileURL(path.join(__dirname, "setup-tui.mjs")).href;
  const { runUninstallSummaryTui } = await import(modulePath);
  await runUninstallSummaryTui(payload);
}

async function showConfigEditorTui(payload) {
  const modulePath = pathToFileURL(path.join(__dirname, "setup-tui.mjs")).href;
  const { runConfigEditorTui } = await import(modulePath);
  return runConfigEditorTui(payload);
}

async function showExportInputTui(payload) {
  const modulePath = pathToFileURL(path.join(__dirname, "setup-tui.mjs")).href;
  const { runExportInputTui } = await import(modulePath);
  return runExportInputTui(payload);
}

async function showExportFlowTui(payload) {
  const modulePath = pathToFileURL(path.join(__dirname, "setup-tui.mjs")).href;
  const { runExportFlowTui } = await import(modulePath);
  return runExportFlowTui(payload);
}

async function commandSetup(args) {
  const { options } = parseOptions(args, {
    "--jira-base": "string",
    "--jira-email": "string",
    "--jira-api-token": "string",
    "--integrate": "string",
    "--non-interactive": "boolean",
    "--plain": "boolean",
    "--force": "boolean",
    "--no-integrate": "boolean",
    "--quiet": "boolean",
    "--help": "boolean",
    "-h": "boolean"
  });

  if (options["--help"] || options["-h"]) {
    print("jtt setup");
    print("");
    print("Usage:");
    print("  jtt setup [options]");
    print("");
    print("Args:");
    print("  (none)");
    print("");
    print("Options:");
    print("  --jira-base <url>                       Jira base URL");
    print("  --jira-email <email>                    Jira account email");
    print("  --jira-api-token <token>                Jira API token");
    print("  --integrate <all|opencode|claude|cursor> Install providers after setup (default: all)");
    print("  --non-interactive                       Do not prompt for missing values");
    print("  --plain                                 Disable TUI and use plain prompts/output");
    print("  --no-integrate                          Skip integration install step");
    print("  --force                                 Reinstall integration files");
    print("  --quiet                                 Minimize command output");
    print("  --help, -h                              Show help");
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
  const interactive = !options["--non-interactive"] && process.stdin.isTTY;
  const useTui = interactive && !options["--plain"];

  if (useTui) {
    const setupResult = await promptForSetupValuesWithTui(next);
    if (setupResult.status === "cancelled") {
      printErr("Setup cancelled.");
      process.exit(1);
    }
    if (setupResult.status === "auth_failed") {
      process.exit(1);
    }
  }

  let missing = ["JIRA_BASE", "JIRA_EMAIL", "JIRA_API_TOKEN"].filter((key) => !next[key]);
  if (missing.length > 0 && interactive && !useTui) {
    print("Missing Jira settings. Enter values to continue setup.");
    print("Create a token at: https://id.atlassian.com/manage-profile/security/api-tokens");
    await promptForSetupValues(next);
    if (!next.JIRA_API_TOKEN) {
      while (true) {
        const value = await promptHiddenValue("Jira API token:");
        if (value) {
          next.JIRA_API_TOKEN = value;
          break;
        }
      }
    }
    missing = ["JIRA_BASE", "JIRA_EMAIL", "JIRA_API_TOKEN"].filter((key) => !next[key]);
  }

  if (missing.length > 0) {
    printErr(`Missing Jira config: ${missing.join(", ")}`);
    printErr("Set them with setup flags, run interactive `jtt setup`, or export env vars before running setup.");
    process.exit(1);
  }

  writeConfigFile(next);

  if (!useTui) {
    print(`Saved config: ${CONFIG_PATH}`);
  }

  let integrateReport = null;

  if (!options["--no-integrate"]) {
    const provider = options["--integrate"] || "all";
    integrateReport = runIntegrate(provider, {
      force: Boolean(options["--force"]),
      quiet: Boolean(options["--quiet"] || useTui)
    });
  }

  if (useTui) {
    await showSetupSummaryTui({
      configPath: CONFIG_PATH,
      integrationReport: integrateReport,
      skippedIntegration: Boolean(options["--no-integrate"])
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

function collectIntegrateReport(provider, force) {
  const providers = provider === "all" ? ["opencode", "claude", "cursor"] : [provider];
  const installers = {
    opencode: installOpenCodeIntegration,
    claude: installClaudeIntegration,
    cursor: installCursorIntegration
  };

  let installed = 0;
  let skipped = 0;
  let failed = 0;
  const results = [];

  for (const item of providers) {
    if (!installers[item]) {
      const error = new Error(`Unknown provider: ${item}`);
      error.code = "UNKNOWN_PROVIDER";
      throw error;
    }

    const result = installers[item](force);
    results.push({ provider: item, ...result });
    if (result.status === "installed") {
      installed += 1;
    } else if (result.status === "skipped") {
      skipped += 1;
    } else {
      failed += 1;
    }
  }

  return {
    results,
    installed,
    skipped,
    failed
  };
}

function runIntegrate(provider, options = {}) {
  const quiet = Boolean(options.quiet);
  const force = Boolean(options.force);
  let report;

  try {
    report = collectIntegrateReport(provider, force);
  } catch (error) {
    if (error && error.code === "UNKNOWN_PROVIDER") {
      printErr(error.message);
      printErr("Valid values: all, opencode, claude, cursor");
      process.exit(1);
    }
    throw error;
  }

  for (const result of report.results) {
    if (result.status === "failed") {
      printErr(result.message);
      continue;
    }
    if (!quiet) {
      print(result.message);
    }
  }

  if (!quiet || report.failed > 0) {
    print(`Summary: installed=${report.installed}, skipped=${report.skipped}, failed=${report.failed}`);
  }

  if (report.failed > 0) {
    process.exit(1);
  }

  return report;
}

function removePath(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return false;
  }
  fs.rmSync(targetPath, { recursive: true, force: true });
  return true;
}

function getUninstallTargets(provider) {
  if (provider === "opencode") {
    const root = path.join(os.homedir(), ".config", "opencode");
    return [
      { path: path.join(root, "commands", "jira-plan.md"), display: "~/.config/opencode/commands/jira-plan.md" },
      { path: path.join(root, "commands", "jira-review.md"), display: "~/.config/opencode/commands/jira-review.md" },
      {
        path: path.join(root, "skills", "jira-issue-implementation"),
        display: "~/.config/opencode/skills/jira-issue-implementation/"
      }
    ];
  }

  if (provider === "claude") {
    const root = path.join(os.homedir(), ".claude");
    return [
      { path: path.join(root, "commands", "jira-plan.md"), display: "~/.claude/commands/jira-plan.md" },
      { path: path.join(root, "commands", "jira-review.md"), display: "~/.claude/commands/jira-review.md" },
      { path: path.join(root, "skills", "jira-issue-implementation"), display: "~/.claude/skills/jira-issue-implementation/" }
    ];
  }

  const root = path.join(os.homedir(), ".cursor", "skills");
  return [
    { path: path.join(root, "jira-plan"), display: "~/.cursor/skills/jira-plan/" },
    { path: path.join(root, "jira-review"), display: "~/.cursor/skills/jira-review/" }
  ];
}

function collectUninstallReport(target, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const removeConfig = Boolean(options.removeConfig);
  const providers = target === "all" ? ["opencode", "claude", "cursor"] : [target];
  const validProviders = ["opencode", "claude", "cursor"];

  const report = {
    target,
    dryRun,
    removeConfig,
    providers: [],
    config: null,
    affectedCount: 0,
    untouchedCount: 0
  };

  for (const provider of providers) {
    if (!validProviders.includes(provider)) {
      const error = new Error(`Unknown provider: ${provider}`);
      error.code = "UNKNOWN_PROVIDER";
      throw error;
    }

    const affectedPaths = [];
    for (const targetPath of getUninstallTargets(provider)) {
      if (!fs.existsSync(targetPath.path)) {
        continue;
      }
      if (!dryRun) {
        removePath(targetPath.path);
      }
      affectedPaths.push(targetPath.display);
    }

    const foundCount = affectedPaths.length;
    const status = foundCount > 0 ? (dryRun ? "would_remove" : "removed") : "not_found";
    if (foundCount > 0) {
      report.affectedCount += foundCount;
    } else {
      report.untouchedCount += 1;
    }

    report.providers.push({
      provider,
      status,
      affectedPaths,
      foundCount
    });
  }

  if (removeConfig) {
    const exists = fs.existsSync(CONFIG_PATH);
    if (exists && !dryRun) {
      removePath(CONFIG_PATH);
    }
    report.config = {
      path: CONFIG_PATH,
      status: exists ? (dryRun ? "would_remove" : "removed") : "not_found"
    };
    if (exists) {
      report.affectedCount += 1;
    }
  }

  return report;
}

function runUninstallPlain(report, quiet) {
  if (quiet) {
    return;
  }

  for (const providerResult of report.providers) {
    if (providerResult.foundCount === 0) {
      print(`No ${providerResult.provider} integration files found.`);
      continue;
    }

    print(`${report.dryRun ? "Would remove" : "Removed"} ${providerResult.provider} integration files:`);
    for (const item of providerResult.affectedPaths) {
      print(`- ${item}`);
    }
  }

  if (report.config) {
    if (report.config.status === "not_found") {
      print(`No config file found at: ${report.config.path}`);
      return;
    }
    print(`${report.dryRun ? "Would remove" : "Removed"} config file: ${report.config.path}`);
  }
}

async function commandUninstall(args) {
  const { options, positionals } = parseOptions(args, {
    "--remove-config": "boolean",
    "--dry-run": "boolean",
    "--plain": "boolean",
    "--quiet": "boolean",
    "--help": "boolean",
    "-h": "boolean"
  });

  if (options["--help"] || options["-h"]) {
    print("jtt uninstall");
    print("");
    print("Usage:");
    print("  jtt uninstall [provider] [options]");
    print("");
    print("Args:");
    print("  provider                                all|opencode|claude|cursor (default: all)");
    print("");
    print("Options:");
    print("  --remove-config                         Remove global config file too");
    print("  --dry-run                               Show what would be removed only");
    print("  --plain                                 Disable TUI and use plain output");
    print("  --quiet                                 Minimize command output");
    print("  --help, -h                              Show help");
    return;
  }

  const target = positionals[0] || "all";
  const quiet = Boolean(options["--quiet"]);
  const dryRun = Boolean(options["--dry-run"]);
  let report;
  try {
    report = collectUninstallReport(target, {
      dryRun,
      removeConfig: Boolean(options["--remove-config"])
    });
  } catch (error) {
    if (error && error.code === "UNKNOWN_PROVIDER") {
      printErr(error.message);
      printErr("Valid values: all, opencode, claude, cursor");
      process.exit(1);
    }
    throw error;
  }

  const useTui = process.stdin.isTTY && !options["--plain"] && !quiet;
  if (useTui) {
    await showUninstallSummaryTui({ uninstallReport: report });
    return;
  }

  runUninstallPlain(report, quiet);
}

async function commandIntegrate(args) {
  const { options, positionals } = parseOptions(args, {
    "--force": "boolean",
    "--plain": "boolean",
    "--quiet": "boolean",
    "--help": "boolean",
    "-h": "boolean"
  });

  if (options["--help"] || options["-h"]) {
    print("jtt integrate");
    print("");
    print("Usage:");
    print("  jtt integrate [provider] [options]");
    print("");
    print("Args:");
    print("  provider                                all|opencode|claude|cursor (default: all)");
    print("");
    print("Options:");
    print("  --force                                 Reinstall even if already installed");
    print("  --plain                                 Disable TUI and use plain output");
    print("  --quiet                                 Minimize command output");
    print("  --help, -h                              Show help");
    return;
  }

  const provider = positionals[0] || "all";

  const useTui = process.stdin.isTTY && !options["--plain"];

  if (useTui) {
    let report;
    try {
      report = collectIntegrateReport(provider, Boolean(options["--force"]));
    } catch (error) {
      if (error && error.code === "UNKNOWN_PROVIDER") {
        printErr(error.message);
        printErr("Valid values: all, opencode, claude, cursor");
        process.exit(1);
      }
      throw error;
    }

    await showIntegrateSummaryTui({ integrationReport: report });
    if (report.failed > 0) {
      process.exit(1);
    }
    return;
  }

  runIntegrate(provider, {
    force: Boolean(options["--force"]),
    quiet: Boolean(options["--quiet"])
  });
}

function countImageAttachments(data) {
  const attachments = data && data.fields && Array.isArray(data.fields.attachment)
    ? data.fields.attachment
    : [];
  return attachments.filter((item) => {
    const mimeType = String(item && item.mimeType ? item.mimeType : "").toLowerCase();
    const filename = String(item && item.filename ? item.filename : "").toLowerCase();
    return mimeType.startsWith("image/") || /\.(png|jpe?g|gif|bmp|webp|svg)$/.test(filename);
  }).length;
}

function getDefaultExportDirectory(issueKey) {
  return path.join("docs", "jira-exports", issueKey);
}

function resolveExportDestination(issueKey, format, outputDirectory) {
  const normalizedIssueKey = String(issueKey || "").trim();
  const normalizedFormat = String(format || "md").trim().toLowerCase();
  const normalizedOutputDirectory = String(outputDirectory || "").trim() || getDefaultExportDirectory(normalizedIssueKey);
  return {
    outputDirectory: normalizedOutputDirectory,
    outputPath: path.join(normalizedOutputDirectory, `${normalizedIssueKey}.${normalizedFormat}`)
  };
}

async function promptToCreateDirectory(outputDirectory) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    while (true) {
      const answer = (await rl.question(`Output directory does not exist: ${outputDirectory}. Create it? [y/N] `)).trim().toLowerCase();
      if (answer === "y" || answer === "yes") {
        return true;
      }
      if (!answer || answer === "n" || answer === "no") {
        return false;
      }
    }
  } finally {
    rl.close();
  }
}

function handleExportValidationError(error) {
  if (!error || !error.code) {
    throw error;
  }

  if (error.code === "INVALID_FORMAT") {
    printErr(error.message);
    printErr("Valid values: md, json, xml");
    process.exit(1);
  }

  if (error.code === "MISSING_CONFIG") {
    printErr(error.message);
    printErr("Run `jtt setup` to configure Jira access.");
    process.exit(1);
  }

  if (error.code === "MISSING_ISSUE_KEY") {
    printErr("Usage: jtt export <ISSUE_KEY> [OUTPUT_DIR] [--format md|json|xml] [--plain] [--quiet]");
    process.exit(1);
  }

  if (error.code === "OUTPUT_DIR_MISSING") {
    printErr(error.message);
    printErr("Re-run and confirm directory creation, or create it manually first.");
    process.exit(1);
  }

  throw error;
}

async function collectExportReport({ issueKey, outputDirectory, format, createOutputDirectory }, hooks = {}) {
  const normalizedIssueKey = String(issueKey || "").trim();
  if (!normalizedIssueKey) {
    const error = new Error("Issue key is required.");
    error.code = "MISSING_ISSUE_KEY";
    throw error;
  }

  const normalizedFormat = String(format || "md").toLowerCase();
  if (!["md", "json", "xml"].includes(normalizedFormat)) {
    const error = new Error(`Invalid format: ${normalizedFormat}`);
    error.code = "INVALID_FORMAT";
    throw error;
  }

  const env = getRuntimeConfig();
  const required = ["JIRA_BASE", "JIRA_EMAIL", "JIRA_API_TOKEN"];
  const missing = required.filter((key) => !env[key]);
  if (missing.length > 0) {
    const error = new Error(`Missing Jira config: ${missing.join(", ")}`);
    error.code = "MISSING_CONFIG";
    throw error;
  }

  const jiraBase = String(env.JIRA_BASE).replace(/\/$/, "");
  const destination = resolveExportDestination(normalizedIssueKey, normalizedFormat, outputDirectory);

  let createdOutputDirectory = false;
  if (!fs.existsSync(destination.outputDirectory)) {
    if (!createOutputDirectory) {
      const error = new Error(`Output directory not found: ${destination.outputDirectory}`);
      error.code = "OUTPUT_DIR_MISSING";
      throw error;
    }
    ensureDir(destination.outputDirectory);
    createdOutputDirectory = true;
    hooks.onProgress?.("Prepare output", `Created ${destination.outputDirectory}`);
  }

  const report = {
    issueKey: normalizedIssueKey,
    format: normalizedFormat,
    outputDirectory: destination.outputDirectory,
    outputPath: destination.outputPath,
    createdOutputDirectory,
    assetsDir: "",
    downloadedAny: false,
    imageAttachmentCount: 0,
    warningCount: 0,
    warnings: []
  };

  if (normalizedFormat === "json") {
    hooks.onProgress?.("Fetch issue", `GET ${normalizedIssueKey} as JSON`);
    const url = `${jiraBase}/rest/api/3/issue/${normalizedIssueKey}`;
    await fetchToFile(url, destination.outputPath, "application/json", env);
    hooks.onProgress?.("Write output", "Saving JSON export...");
    return report;
  }

  if (normalizedFormat === "xml") {
    hooks.onProgress?.("Fetch issue", `GET ${normalizedIssueKey} as XML`);
    const url = `${jiraBase}/si/jira.issueviews:issue-xml/${normalizedIssueKey}/${normalizedIssueKey}.xml`;
    await fetchToFile(url, destination.outputPath, "application/xml", env);
    hooks.onProgress?.("Write output", "Saving XML export...");
    return report;
  }

  hooks.onProgress?.("Fetch issue", `GET ${normalizedIssueKey} as JSON`);
  const jsonUrl = `${jiraBase}/rest/api/3/issue/${normalizedIssueKey}`;
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
  report.imageAttachmentCount = countImageAttachments(data);
  hooks.onProgress?.(
    "Render markdown",
    report.imageAttachmentCount > 0
      ? `Rendering description and downloading ${report.imageAttachmentCount} image attachment(s)...`
      : "Rendering description..."
  );

  const result = await renderIssueMarkdownFromJson(data, destination.outputPath, env, (message) => {
    report.warnings.push(message);
    hooks.onWarn?.(message);
  });

  hooks.onProgress?.("Write output", "Finalizing markdown export...");
  report.outputPath = result.outputPath;
  report.downloadedAny = Boolean(result.downloadedAny);
  report.assetsDir = result.assetsDir;
  report.warningCount = report.warnings.length;
  return report;
}

function runExportPlain(report, quiet) {
  if (report.format === "md") {
    for (const warning of report.warnings) {
      if (!quiet) {
        printErr(`Warning: ${warning}`);
      }
    }
    print(`Saved ${report.outputPath}`);
    if (report.downloadedAny && !quiet) {
      print(`Saved image assets in ${report.assetsDir}`);
    }
    return;
  }

  if (!quiet) {
    print(`Saved ${report.outputPath}`);
  }
}

async function commandExport(args) {
  const { options, positionals } = parseOptions(args, {
    "--format": "string",
    "--plain": "boolean",
    "--quiet": "boolean",
    "--help": "boolean",
    "-h": "boolean"
  });

  if (options["--help"] || options["-h"]) {
    print("jtt export");
    print("");
    print("Usage:");
    print("  jtt export <ISSUE_KEY> [OUTPUT_DIR] [options]");
    print("");
    print("Args:");
    print("  ISSUE_KEY                               Jira issue key (for example PROJ-1234)");
    print("  OUTPUT_DIR                              Optional output directory");
    print("");
    print("Options:");
    print("  --format <md|json|xml>                  Export format (default: md)");
    print("  --plain                                 Disable TUI and use plain output");
    print("  --quiet                                 Minimize command output");
    print("  --help, -h                              Show help");
    return;
  }

  const quiet = Boolean(options["--quiet"]);
  const useTui = process.stdin.isTTY && !options["--plain"] && !quiet;

  let issueKey = positionals[0] || "";
  let outputDirectory = positionals[1] || "";
  let format = String(options["--format"] || "md").toLowerCase();
  let createOutputDirectory = false;

  if (useTui) {
    const inputResult = await showExportInputTui({
      initialValues: {
        issueKey,
        format,
        outputDirectory
      }
    });
    if (!inputResult || inputResult.status !== "submit") {
      printErr("Export cancelled.");
      process.exit(1);
    }
    issueKey = inputResult.values.issueKey;
    format = inputResult.values.format;
    outputDirectory = inputResult.values.outputDirectory;
    createOutputDirectory = Boolean(inputResult.values.createOutputDirectory);
  } else if (process.stdin.isTTY) {
    const maybeDestination = resolveExportDestination(issueKey, format, outputDirectory);
    if (issueKey && ["md", "json", "xml"].includes(format) && !fs.existsSync(maybeDestination.outputDirectory)) {
      createOutputDirectory = await promptToCreateDirectory(maybeDestination.outputDirectory);
      if (!createOutputDirectory) {
        printErr("Export cancelled.");
        process.exit(1);
      }
    }
  }

  if (useTui) {
    const flowResult = await showExportFlowTui({
      exportValues: {
        issueKey,
        format,
        outputDirectory
      },
      executor: async (onProgress, onWarn) => {
        return collectExportReport(
          {
            issueKey,
            outputDirectory,
            format,
            createOutputDirectory
          },
          { onProgress, onWarn }
        );
      }
    });
    if (!flowResult || flowResult.status !== "success") {
      process.exit(1);
    }
    return;
  }

  let report;
  try {
    report = await collectExportReport({
      issueKey,
      outputDirectory,
      format,
      createOutputDirectory
    });
  } catch (error) {
    handleExportValidationError(error);
  }

  runExportPlain(report, quiet);
}

function collectDoctorReport(provider) {
  const selectedProviders = provider ? [provider] : ["opencode", "claude", "cursor"];
  for (const item of selectedProviders) {
    if (!["opencode", "claude", "cursor"].includes(item)) {
      const error = new Error(`Invalid provider: ${item}`);
      error.code = "INVALID_PROVIDER";
      throw error;
    }
  }

  const checks = [];
  let okCount = 0;
  let warnCount = 0;
  let failCount = 0;

  const pushCheck = (status, message) => {
    checks.push({ status, message });
    if (status === "ok") {
      okCount += 1;
    } else if (status === "warn") {
      warnCount += 1;
    } else {
      failCount += 1;
    }
  };

  const checkCommand = (name) => {
    if (commandExists(name)) {
      pushCheck("ok", `Dependency found: ${name}`);
    } else {
      pushCheck("fail", `Missing dependency: ${name}`);
    }
  };

  checkCommand("node");
  checkCommand("bash");

  const cwdEnv = loadCwdEnvFile();
  const globalConfig = loadConfigFile();

  if (fs.existsSync(CONFIG_PATH)) {
    pushCheck("ok", `Global config found: ${CONFIG_PATH}`);
  } else {
    pushCheck("warn", `Global config not found: ${CONFIG_PATH} (run jtt setup to create it)`);
  }

  const env = { ...process.env, ...cwdEnv.values, ...globalConfig };
  const getRuntimeSource = (key) => {
    if (globalConfig[key]) {
      return "global config";
    }
    if (cwdEnv.values[key]) {
      return "local .env";
    }
    if (process.env[key]) {
      return "process.env";
    }
    return null;
  };

  const requiredVars = ["JIRA_BASE", "JIRA_EMAIL", "JIRA_API_TOKEN"];
  for (const key of requiredVars) {
    const source = getRuntimeSource(key);
    if (env[key] && source) {
      pushCheck("ok", `Runtime value set: ${key} (source: ${source})`);
    } else {
      pushCheck("fail", `Environment variable missing: ${key}`);
    }
  }

  const checkFile = (filePath, label) => {
    if (fs.existsSync(filePath)) {
      pushCheck("ok", `${label}: ${filePath}`);
    } else {
      pushCheck("warn", `${label} not found: ${filePath}`);
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

  return {
    provider: provider || "all",
    checks,
    okCount,
    warnCount,
    failCount
  };
}

function runDoctorPlain(provider, quiet) {
  let report;
  try {
    report = collectDoctorReport(provider);
  } catch (error) {
    if (error && error.code === "INVALID_PROVIDER") {
      printErr(error.message);
      process.exit(1);
    }
    throw error;
  }

  for (const check of report.checks) {
    if (check.status === "ok") {
      if (!quiet) {
        print(`OK: ${check.message}`);
      }
      continue;
    }
    if (check.status === "warn") {
      print(`WARN: ${check.message}`);
      continue;
    }
    printErr(`FAIL: ${check.message}`);
  }

  print(`Summary: ${report.okCount} ok, ${report.warnCount} warnings, ${report.failCount} failures`);
  if (report.failCount > 0) {
    process.exit(1);
  }
}

async function commandDoctor(args) {
  const { options } = parseOptions(args, {
    "--provider": "string",
    "--plain": "boolean",
    "--quiet": "boolean",
    "--help": "boolean",
    "-h": "boolean"
  });

  if (options["--help"] || options["-h"]) {
    print("jtt doctor");
    print("");
    print("Usage:");
    print("  jtt doctor [options]");
    print("");
    print("Args:");
    print("  (none)");
    print("");
    print("Options:");
    print("  --provider <opencode|claude|cursor>     Restrict checks to one provider");
    print("  --plain                                 Disable TUI and use plain output");
    print("  --quiet                                 Minimize command output");
    print("  --help, -h                              Show help");
    return;
  }

  const provider = options["--provider"];
  const useTui = process.stdin.isTTY && !options["--plain"] && !options["--quiet"];

  if (useTui) {
    let report;
    try {
      report = collectDoctorReport(provider);
    } catch (error) {
      if (error && error.code === "INVALID_PROVIDER") {
        printErr(error.message);
        process.exit(1);
      }
      throw error;
    }

    await showDoctorSummaryTui({ report });
    print("");
    if (report.failCount > 0) {
      process.exit(1);
    }
    return;
  }

  runDoctorPlain(provider, Boolean(options["--quiet"]));
}

async function commandConfig(args) {
  const { options, positionals } = parseOptions(args, {
    "--plain": "boolean",
    "--help": "boolean",
    "-h": "boolean"
  });
  const sub = positionals[0];
  const rest = positionals.slice(1);
  const config = loadConfigFile();

  if (!sub && !options["--help"] && !options["-h"] && process.stdin.isTTY && !options["--plain"]) {
    const result = await showConfigEditorTui({
      configValues: {
        JIRA_BASE: config.JIRA_BASE || "",
        JIRA_EMAIL: config.JIRA_EMAIL || "",
        JIRA_API_TOKEN: config.JIRA_API_TOKEN || ""
      }
    });

    if (result && result.status === "done" && result.values) {
      const next = {
        ...config,
        JIRA_BASE: result.values.JIRA_BASE || "",
        JIRA_EMAIL: result.values.JIRA_EMAIL || "",
        JIRA_API_TOKEN: result.values.JIRA_API_TOKEN || ""
      };
      writeConfigFile(next);
    }
    return;
  }

  if (!sub || options["--help"] || options["-h"] || sub === "help") {
    print("jtt config");
    print("");
    print("Usage:");
    print("  jtt config [subcommand] [options]");
    print("");
    print("Args:");
    print("  subcommand                              path|get|set|validate (optional in TTY)");
    print("");
    print("Options:");
    print("  --plain                                 Disable TUI and use plain output");
    print("  --help, -h                              Show help");
    print("");
    print("Examples:");
    print("  jtt config");
    print("  jtt config --plain");
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
    await commandIntegrate(args);
    return;
  }

  if (command === "export") {
    await commandExport(args);
    return;
  }

  if (command === "doctor" || command === "troubleshoot") {
    await commandDoctor(args);
    return;
  }

  if (command === "uninstall") {
    await commandUninstall(args);
    return;
  }

  if (command === "config") {
    await commandConfig(args);
    return;
  }

  printErr(`Unknown command: ${command}`);
  printErr("Run `jtt help` for available commands.");
  process.exit(1);
}

module.exports = {
  run
};
