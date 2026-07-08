# Contributing

<div align="center">

Thanks for helping improve `jira-ticket-tools`.

Keep changes practical, portable, and easy for teammates to adopt.

</div>

## Table of contents

- [Contribution principles](#contribution-principles)
- [Prerequisites](#prerequisites)
- [Bootstrap by platform](#bootstrap-by-platform)
- [Install provider-specific integrations](#install-provider-specific-integrations)
- [Verify your setup](#verify-your-setup)
- [Local quality checks](#local-quality-checks)
- [Updating integration templates](#updating-integration-templates)

## Contribution principles

- Keep integrations provider-agnostic and org-neutral.
- Prefer clear CLI UX and deterministic script behavior.
- Preserve `/jira-review` as documentation-only behavior.
- Keep docs updated when commands, flags, or workflows change.

## Prerequisites

- `git`
- `bash`
- `python3`
- `curl`
- Jira API token
- At least one AI tool: OpenCode, Claude Code, or Cursor

## Bootstrap by platform

> [!TIP]
> Set and persist `JIRA_TICKET_TOOLS_DIR` so integrations work from any project directory.

### Linux/macOS (bash)

```bash
git clone <repo-url>
cd jira-ticket-tools

cp .env.example .env
# edit .env and set JIRA_BASE, JIRA_EMAIL, JIRA_API_TOKEN

./scripts/install-ai-integrations.sh

echo 'export JIRA_TICKET_TOOLS_DIR="$(pwd)"' >> ~/.bashrc
source ~/.bashrc
```

### macOS/Linux (zsh)

```bash
git clone <repo-url>
cd jira-ticket-tools

cp .env.example .env
# edit .env and set JIRA_BASE, JIRA_EMAIL, JIRA_API_TOKEN

./scripts/install-ai-integrations.sh

echo 'export JIRA_TICKET_TOOLS_DIR="$(pwd)"' >> ~/.zshrc
source ~/.zshrc
```

### Windows (PowerShell)

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

Restart terminal and your AI tool after setting env vars.

### Windows (WSL)

Use the Linux/macOS (bash) flow inside WSL.

## Install provider-specific integrations

Use unified installer flags when needed:

```bash
./scripts/install-ai-integrations.sh --cursor
./scripts/install-ai-integrations.sh --opencode --claude
./scripts/install-ai-integrations.sh --opencode --force
./scripts/install-ai-integrations.sh --all --quiet
```

Or run provider scripts directly:

- `./scripts/install-opencode-integration.sh`
- `./scripts/install-claude-code-integration.sh`
- `./scripts/install-cursor-integration.sh`

Supported installer flags:

- `--force` to reinstall even when already installed
- `--quiet` for minimal logs
- `--no-color --no-anim` for plain terminal output

## Verify your setup

From any repository where Jira planning is needed:

```text
/jira-plan PROJ-1234
```

For documentation-only reconciliation:

```text
/jira-review PROJ-1234
```

If anything looks off, run diagnostics:

```bash
./scripts/doctor.sh
./scripts/doctor.sh --provider cursor
```

## Local quality checks

Run the same checks used by CI:

```bash
bash ./scripts/ci-checks.sh
bash ./scripts/run-shellcheck.sh
```

## Updating integration templates

When you change any integration template:

- `opencode/commands/jira-plan.md`
- `opencode/commands/jira-review.md`
- `opencode/skills/jira-issue-implementation/SKILL.md`
- `claude-code/commands/jira-plan.md`
- `claude-code/commands/jira-review.md`
- `claude-code/skills/jira-issue-implementation/SKILL.md`
- `cursor/skills/jira-plan/SKILL.md`
- `cursor/skills/jira-review/SKILL.md`

Reinstall and restart your AI tool:

```bash
./scripts/install-ai-integrations.sh --force
```
