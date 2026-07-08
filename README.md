# jira-ticket-tools

Jira export automation for engineering workflows.

This project turns Jira issues into clean markdown artifacts (with downloaded images), then plugs that artifact into AI-driven planning/review flows like `/jira-plan` and `/jira-review`.

For OS-specific onboarding, see [CONTRIBUTING.md](CONTRIBUTING.md).

## What you get

- One-command Jira export to `docs/jira-exports/<ISSUE_KEY>/<ISSUE_KEY>.md`
- Description rendering that preserves Jira structure as markdown (headings, lists, tables, code blocks, panels, links)
- Image attachment download into `assets/` with local links in markdown
- Integration packages for OpenCode, Claude Code, and Cursor Skills

## Quick start

1) Configure Jira auth:

```bash
cp .env.example .env
```

Fill `.env` with:

```bash
JIRA_BASE="https://your-domain.atlassian.net"
JIRA_EMAIL="you@company.com"
JIRA_API_TOKEN="your-token"
```

2) Export one issue to markdown:

```bash
./scripts/get-issue-md.sh PROJ-1234 ./docs/jira-exports/PROJ-1234/PROJ-1234.md
```

3) Install AI integrations (all providers by default):

```bash
./scripts/install-ai-integrations.sh
```

4) Set tools path (persist it in your shell profile):

```bash
echo 'export JIRA_TICKET_TOOLS_DIR="/absolute/path/to/jira-ticket-tools"' >> ~/.bashrc
source ~/.bashrc
```

For zsh, use `~/.zshrc` instead of `~/.bashrc`.

5) Restart your AI tool and run:

```text
/jira-plan PROJ-1234
/jira-review PROJ-1234
```

## AI integration options

- `./scripts/install-ai-integrations.sh` installs OpenCode + Claude Code + Cursor
- `./scripts/install-ai-integrations.sh --cursor` installs only Cursor
- `./scripts/install-ai-integrations.sh --opencode --cursor` installs a subset
- `./scripts/install-ai-integrations.sh --force` reinstalls selected integrations even if already installed
- `./scripts/install-ai-integrations.sh --quiet` minimal output
- `./scripts/install-ai-integrations.sh --no-color --no-anim` disable styling/animation

Direct installers are also available:

- `./scripts/install-opencode-integration.sh`
- `./scripts/install-claude-code-integration.sh`
- `./scripts/install-cursor-integration.sh`

All installers also support `--force`, `--quiet`, `--no-color`, and `--no-anim`.

## Workflow behavior

### `/jira-plan <ISSUE_KEY>`

- Ensures `docs/jira-exports/<ISSUE_KEY>/<ISSUE_KEY>.md` exists (creates if missing)
- Extracts scope + acceptance criteria from issue markdown
- Investigates the current codebase
- Produces a codebase-specific implementation plan
- If implementation occurs, ends with coverage reconciliation (`Implemented` / `Discussed` / `Open`)

### `/jira-review <ISSUE_KEY>`

- Documentation-only workflow
- Requires existing issue markdown export
- Appends `## Review Report (YYYY-MM-DD HH:MM)` to issue markdown
- Adds checklist items for distinct actionable requirements with evidence/follow-ups
- Does not modify source code

## Core scripts

- `scripts/get-issue-md.sh`: fetch JSON -> convert markdown -> delete intermediate JSON
- `scripts/issue-json-to-md.py`: rich Jira ADF to markdown rendering + image download
- `scripts/get-issue-json.sh`: fetch raw Jira issue JSON
- `scripts/get-issue-xml.sh`: fetch Jira XML export endpoint
- `scripts/export-issues-xml-bulk.sh`: bulk XML export from issue key file
- `scripts/doctor.sh`: checks local dependencies, Jira env vars, and installed AI integrations

Most shell scripts support output-control flags for cleaner terminal UX: `--quiet`, `--no-color`, and `--no-anim`.

## Repository integration packages

- OpenCode: `opencode/`
- Claude Code: `claude-code/`
- Cursor Skills: `cursor/skills/`

## Notes

- Keep each issue markdown and its `assets/` directory together.
- `.env` and generated exports are git-ignored.
- If XML endpoint auth fails for your tenant, use the JSON/markdown flow.

## Troubleshooting

Run health checks:

```bash
./scripts/doctor.sh
```

Useful options:

```bash
./scripts/doctor.sh --provider cursor
./scripts/doctor.sh --provider opencode --quiet
./scripts/doctor.sh --provider cursor --no-color --no-anim
```

The doctor script reports:

- missing dependencies (`bash`, `python3`, `curl`)
- missing Jira auth vars (`JIRA_BASE`, `JIRA_EMAIL`, `JIRA_API_TOKEN`)
- whether OpenCode, Claude Code, and Cursor integration files are installed
