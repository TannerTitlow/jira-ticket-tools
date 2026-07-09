# jira-ticket-tools

<div align="center">

<a href="https://github.com/TannerTitlow/jira-ticket-tools" aria-label="Jira Ticket Tools repository">
  <img src="https://raw.githubusercontent.com/TannerTitlow/jira-ticket-tools/main/.github/assets/jtt-logo.png" alt="Jira Ticket Tools logo" width="360" />
</a>

[![CI][badge_ci]][url_ci]
[![License: MIT][badge_license]][url_license]
[![Platform][badge_platform]][url_repo]
[![Language][badge_language]][url_repo]

Jira export automation for engineering workflows.

Install one CLI, configure once, and enable `/jira-plan` + `/jira-review` across OpenCode, Claude Code, and Cursor.

</div>

<div align="center">
  <sub>
    <a href="#quick-start">Quick Start</a> •
    <a href="#common-commands">Common Commands</a> •
    <a href="#flags">Flags</a> •
    <a href="#export-output">Export Output</a> •
    <a href="#advanced-workflows">Advanced Workflows</a> •
    <a href="#troubleshooting">Troubleshooting</a> •
    <a href="#local-quality-checks">Local Quality Checks</a> •
    <a href="#contributing">Contributing</a> •
    <a href="#license">License</a>
  </sub>
</div>

## Quick Start

### 1) Install

```bash
npm i -g jira-ticket-tools
```

### 2) Run setup

```bash
jtt setup
```

- Uses TUI by default in interactive terminals.
- Use `jtt setup --plain` for plain mode.
- Need a token? Create one in [Atlassian account security](https://id.atlassian.com/manage-profile/security/api-tokens).

### 3) Use in your AI tool

```text
/jira-plan PROJ-1234
/jira-review PROJ-1234
```

`/jira-plan` will create `docs/jira-exports/<ISSUE_KEY>/<ISSUE_KEY>.md` automatically if needed.

## Common Commands

For most users, these are the only commands needed day to day:

```bash
# initial setup
jtt setup

# planning/review support
jtt export PROJ-1234
jtt doctor

# reinstall integrations after updates
jtt integrate all
```

## Flags

Common flags supported by multiple commands:

- `--plain` disable TUI and use plain output
- `--quiet` minimize logs/output where supported
- `--help` / `-h` show command help

Use `jtt <command> --help` for command-specific args and options.

## Export Output

- Default export directory: `docs/jira-exports/<ISSUE_KEY>/`
- Exported filename is always enforced as `<ISSUE_KEY>.<FORMAT>`
- Markdown exports may include `assets/` for downloaded images

Example:

```text
docs/
  jira-exports/
    PROJ-1234/
      PROJ-1234.md
      assets/
```

## Advanced Workflows

Use these when you need non-default behavior:

```bash
# non-interactive setup
jtt setup --jira-base https://your-domain.atlassian.net --jira-email you@company.com --jira-api-token your-token

# config management
jtt config
jtt config get JIRA_BASE
jtt config set JIRA_EMAIL you@company.com

# alternate export format/output directory
jtt export PROJ-1234 ./docs/jira-exports/custom-dir --format json

# provider-specific checks/cleanup
jtt doctor --provider cursor
jtt uninstall cursor --dry-run
```

Runtime config precedence:
`~/.config/jira-ticket-tools/config.env` (highest) -> local `.env` -> shell `process.env`.

For complete command details, run `jtt <command> --help`.

## Troubleshooting

Start with:

```bash
jtt doctor
```

If your Jira XML endpoint is restricted in your tenant, use markdown export (`jtt export <ISSUE_KEY>`).

## Local Quality Checks

```bash
npm run check
npm run lint:shell
npm run smoke
```

## Contributing

See `CONTRIBUTING.md` for contributor setup and template update workflow.

## License

MIT - see `LICENSE`.

[url_repo]: https://github.com/TannerTitlow/jira-ticket-tools
[url_ci]: https://github.com/TannerTitlow/jira-ticket-tools/actions/workflows/ci.yml
[url_license]: ./LICENSE
[badge_ci]: https://github.com/TannerTitlow/jira-ticket-tools/actions/workflows/ci.yml/badge.svg?branch=main
[badge_license]: https://img.shields.io/badge/license-MIT-0b57d0
[badge_platform]: https://img.shields.io/badge/platform-linux%20%7C%20macOS%20%7C%20WSL-111827
[badge_language]: https://img.shields.io/badge/language-node%20%2B%20bash-0f766e
