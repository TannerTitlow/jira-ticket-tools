#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"

tmp_home="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp_home"
}
trap cleanup EXIT

export HOME="$tmp_home"
unset JIRA_TICKET_TOOLS_DIR || true

bash "$repo_root/scripts/install-ai-integrations.sh" --help >/dev/null
bash "$repo_root/scripts/install-opencode-integration.sh" --help >/dev/null
bash "$repo_root/scripts/install-claude-code-integration.sh" --help >/dev/null
bash "$repo_root/scripts/install-cursor-integration.sh" --help >/dev/null

bash "$repo_root/scripts/install-ai-integrations.sh" --all --no-color --no-anim --quiet
bash "$repo_root/scripts/install-ai-integrations.sh" --all --no-color --no-anim --quiet
bash "$repo_root/scripts/install-ai-integrations.sh" --cursor --force --no-color --no-anim --quiet

[[ -f "$HOME/.config/opencode/commands/jira-plan.md" ]]
[[ -f "$HOME/.config/opencode/commands/jira-review.md" ]]
[[ -f "$HOME/.config/opencode/skills/jira-issue-implementation/SKILL.md" ]]

[[ -f "$HOME/.claude/commands/jira-plan.md" ]]
[[ -f "$HOME/.claude/commands/jira-review.md" ]]
[[ -f "$HOME/.claude/skills/jira-issue-implementation/SKILL.md" ]]

[[ -f "$HOME/.cursor/skills/jira-plan/SKILL.md" ]]
[[ -f "$HOME/.cursor/skills/jira-plan/scripts/ensure-export.sh" ]]
[[ -f "$HOME/.cursor/skills/jira-review/SKILL.md" ]]
[[ -f "$HOME/.cursor/skills/jira-review/scripts/require-export.sh" ]]

printf 'Installer smoke tests passed.\n'
