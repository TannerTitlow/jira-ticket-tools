#!/usr/bin/env bash
set -euo pipefail

issue_key="${1:-}"
if [[ -z "$issue_key" ]]; then
  printf 'Usage: %s ISSUE_KEY\n' "$0" >&2
  exit 1
fi

issue_md="docs/jira-exports/${issue_key}/${issue_key}.md"

if [[ -f "$issue_md" ]]; then
  printf 'Found issue export: %s\n' "$issue_md"
  exit 0
fi

printf 'Jira export not found at %s. Run /jira-plan %s first.\n' "$issue_md" "$issue_key" >&2
exit 2
