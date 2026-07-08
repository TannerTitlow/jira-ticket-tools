#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf 'Usage: %s\n' "$0"
}

if [[ $# -gt 0 ]]; then
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown option: %s\n' "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"

source_dir="${repo_root}/claude-code"
target_root="${HOME}/.claude"

if [[ ! -d "$source_dir" ]]; then
  printf 'Source integration directory not found: %s\n' "$source_dir" >&2
  exit 1
fi

mkdir -p "$target_root/commands"
mkdir -p "$target_root/skills/jira-issue-implementation"

cp "$source_dir/commands/jira-plan.md" "$target_root/commands/jira-plan.md"
cp "$source_dir/commands/jira-review.md" "$target_root/commands/jira-review.md"
cp "$source_dir/skills/jira-issue-implementation/SKILL.md" "$target_root/skills/jira-issue-implementation/SKILL.md"

printf 'Installed command/skill templates to %s\n' "$target_root"
printf 'Set JIRA_TICKET_TOOLS_DIR to this repo for portability:\n'
printf '  export JIRA_TICKET_TOOLS_DIR="%s"\n' "$repo_root"
printf 'Persist it for future shells:\n'
printf '  echo '\''export JIRA_TICKET_TOOLS_DIR="%s"'\'' >> ~/.bashrc\n' "$repo_root"
printf '  # or use ~/.zshrc for zsh\n'
printf 'Restart Claude Code to load new command and skill definitions.\n'
