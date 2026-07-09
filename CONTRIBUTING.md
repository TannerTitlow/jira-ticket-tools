# Contributing

Thanks for helping improve `jira-ticket-tools`.

## Principles

- Keep default workflows simple and reliable.
- Keep integrations provider-agnostic and org-neutral.
- Preserve `/jira-review` as documentation-only behavior.
- Update docs/templates whenever command behavior changes.

## Contributor Workflow

### 1) Bootstrap

```bash
git clone <repo-url>
cd jira-ticket-tools

pnpm install
npm install -g .
```

### 2) Configure locally

```bash
jtt setup
```

- Uses TUI by default in interactive terminals.
- Use `jtt setup --plain` if you need plain mode.

### 3) Validate your environment

```bash
jtt doctor
```

### 4) Run project checks before opening PR

```bash
pnpm run check
pnpm run lint:shell
pnpm run smoke
```

## Template Updates (Important)

If you change integration templates, update all relevant provider copies, then reinstall integrations:

```bash
jtt integrate all --force
```

Common template paths:

- `opencode/commands/jira-plan.md`
- `opencode/commands/jira-review.md`
- `opencode/skills/jira-issue-implementation/SKILL.md`
- `claude-code/commands/jira-plan.md`
- `claude-code/commands/jira-review.md`
- `claude-code/skills/jira-issue-implementation/SKILL.md`
- `cursor/skills/jira-plan/SKILL.md`
- `cursor/skills/jira-review/SKILL.md`

## Advanced Tasks

```bash
# provider-specific integration testing
jtt integrate cursor --force
jtt uninstall cursor --dry-run

# non-interactive setup
jtt setup --jira-base https://your-domain.atlassian.net --jira-email you@company.com --jira-api-token your-token

# config inspection
jtt config
jtt config get JIRA_BASE
```

Windows is supported via WSL (recommended), and the documented contributor workflow assumes bash.

For complete command details, run `jtt <command> --help`.
