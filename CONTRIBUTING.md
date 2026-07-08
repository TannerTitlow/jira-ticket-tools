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
- Prefer clear CLI UX and deterministic command behavior.
- Preserve `/jira-review` as documentation-only behavior.
- Keep docs updated when commands, flags, or workflows change.

## Prerequisites

- `git`
- `node` (18+)
- `pnpm`
- `bash`
- Jira API token
- At least one AI tool: OpenCode, Claude Code, or Cursor

## Bootstrap by platform

> [!TIP]
> Use the `jtt` CLI for setup, integrations, exports, and troubleshooting.

### Linux/macOS (bash)

```bash
git clone <repo-url>
cd jira-ticket-tools

pnpm install
pnpm link --global

jtt setup \
  --jira-base https://your-domain.atlassian.net \
  --jira-email you@company.com \
  --jira-api-token your-token
```

### macOS/Linux (zsh)

```bash
git clone <repo-url>
cd jira-ticket-tools

pnpm install
pnpm link --global

jtt setup \
  --jira-base https://your-domain.atlassian.net \
  --jira-email you@company.com \
  --jira-api-token your-token
```

### Windows (PowerShell)

```powershell
git clone <repo-url>
cd jira-ticket-tools

pnpm install
pnpm link --global

jtt setup --jira-base https://your-domain.atlassian.net --jira-email you@company.com --jira-api-token your-token
```

Restart terminal and your AI tool after setup.

### Windows (WSL)

Use the Linux/macOS (bash) flow inside WSL.

## Install provider-specific integrations

Use unified installer flags when needed:

```bash
jtt integrate cursor
jtt integrate opencode --force
jtt integrate claude --quiet
jtt integrate all
```

Supported installer flags:

- `--force` to reinstall even when already installed
- `--quiet` for minimal logs

To remove templates during cleanup/testing:

```bash
jtt uninstall all --dry-run
jtt uninstall all --remove-config
```

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
jtt doctor
jtt doctor --provider cursor
```

## Local quality checks

Run the same checks used by CI:

```bash
pnpm run check
pnpm run lint:shell
pnpm run smoke
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
jtt integrate all --force
```
