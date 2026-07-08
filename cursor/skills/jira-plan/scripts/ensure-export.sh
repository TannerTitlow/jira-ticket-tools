#!/usr/bin/env bash
set -euo pipefail

issue_key="${1:-}"
if [[ -z "$issue_key" ]]; then
  printf 'Usage: %s ISSUE_KEY\n' "$0" >&2
  exit 1
fi

issue_dir="docs/jira-exports/${issue_key}"
issue_md="${issue_dir}/${issue_key}.md"

if [[ -f "$issue_md" ]]; then
  printf 'Using existing issue export: %s\n' "$issue_md"
  exit 0
fi

tools_dir="${JIRA_TICKET_TOOLS_DIR:-$HOME/jira-ticket-tools}"
generator="${tools_dir}/scripts/get-issue-md.sh"

if [[ ! -x "$generator" ]]; then
  printf 'jira-ticket-tools script not found/executable: %s\n' "$generator" >&2
  exit 1
fi

mkdir -p "$issue_dir"
"$generator" "$issue_key" "$issue_md"

printf 'Created issue export: %s\n' "$issue_md"
