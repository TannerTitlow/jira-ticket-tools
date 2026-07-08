# Contributing

Thanks for contributing to `jira-ticket-tools`.

## Prerequisites

- `git`
- `bash`
- `python3`
- `curl`
- Jira API token
- At least one AI tool: OpenCode, Claude Code, or Cursor

## New teammate bootstrap

## Linux/macOS (bash)

```bash
git clone <repo-url>
cd jira-ticket-tools

cp .env.example .env
# edit .env and set JIRA_BASE, JIRA_EMAIL, JIRA_API_TOKEN

./scripts/install-ai-integrations.sh

echo 'export JIRA_TICKET_TOOLS_DIR="$(pwd)"' >> ~/.bashrc
source ~/.bashrc
```

## macOS/Linux (zsh)

```bash
git clone <repo-url>
cd jira-ticket-tools

cp .env.example .env
# edit .env and set JIRA_BASE, JIRA_EMAIL, JIRA_API_TOKEN

./scripts/install-ai-integrations.sh

echo 'export JIRA_TICKET_TOOLS_DIR="$(pwd)"' >> ~/.zshrc
source ~/.zshrc
```

## Windows (PowerShell)

```powershell
git clone <repo-url>
cd jira-ticket-tools

Copy-Item .env.example .env
# edit .env and set JIRA_BASE, JIRA_EMAIL, JIRA_API_TOKEN

bash ./scripts/install-ai-integrations.sh

[Environment]::SetEnvironmentVariable(
  "JIRA_TICKET_TOOLS_DIR",
  (Get-Location).Path,
  "User"
)
```

Then restart terminal and your AI tool.

## Windows (WSL)

Use the Linux/macOS (bash) steps inside WSL.

## Installing specific AI providers

Use selector flags when needed:

```bash
./scripts/install-ai-integrations.sh --cursor
./scripts/install-ai-integrations.sh --opencode --claude
./scripts/install-ai-integrations.sh --opencode --force
./scripts/install-ai-integrations.sh --all --quiet
```

Or run provider-specific installers directly:

- `./scripts/install-opencode-integration.sh`
- `./scripts/install-claude-code-integration.sh`
- `./scripts/install-cursor-integration.sh`

Use `--force` with any installer to reinstall templates even when already installed.
Use `--quiet` for minimal logs, and `--no-color --no-anim` for plain output.

## Verify setup

From any repo where you want Jira planning:

```text
/jira-plan PROJ-1234
```

For documentation-only reconciliation:

```text
/jira-review PROJ-1234
```

Run diagnostics if something is off:

```bash
./scripts/doctor.sh
./scripts/doctor.sh --provider cursor
```

## Local quality checks

Run the same checks used in CI:

```bash
bash ./scripts/ci-checks.sh
bash ./scripts/run-shellcheck.sh
```

## Updating integration templates

When you update these template assets:

- `opencode/commands/jira-plan.md`
- `opencode/commands/jira-review.md`
- `opencode/skills/jira-issue-implementation/SKILL.md`
- `claude-code/commands/jira-plan.md`
- `claude-code/commands/jira-review.md`
- `claude-code/skills/jira-issue-implementation/SKILL.md`
- `cursor/skills/jira-plan/SKILL.md`
- `cursor/skills/jira-review/SKILL.md`

rerun the installer(s), then restart your AI tool:

```bash
./scripts/install-ai-integrations.sh
```
