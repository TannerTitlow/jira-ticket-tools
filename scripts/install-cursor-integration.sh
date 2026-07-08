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

source_dir="${repo_root}/cursor/skills"
target_dir="${HOME}/.cursor/skills"

if [[ ! -d "$source_dir" ]]; then
  printf 'Source skills directory not found: %s\n' "$source_dir" >&2
  exit 1
fi

mkdir -p "$target_dir"

rm -rf "$target_dir/jira-plan"
rm -rf "$target_dir/jira-review"

cp -R "$source_dir/jira-plan" "$target_dir/jira-plan"
cp -R "$source_dir/jira-review" "$target_dir/jira-review"

chmod +x "$target_dir/jira-plan/scripts/ensure-export.sh"
chmod +x "$target_dir/jira-review/scripts/require-export.sh"

printf 'Installed Cursor skills into %s\n' "$target_dir"
printf 'Set JIRA_TICKET_TOOLS_DIR to this repo for portability:\n'
printf '  export JIRA_TICKET_TOOLS_DIR="%s"\n' "$repo_root"
printf 'Persist it for future shells:\n'
printf '  echo '\''export JIRA_TICKET_TOOLS_DIR="%s"'\'' >> ~/.bashrc\n' "$repo_root"
printf '  # or use ~/.zshrc for zsh\n'
printf 'Restart Cursor to reload skills.\n'
