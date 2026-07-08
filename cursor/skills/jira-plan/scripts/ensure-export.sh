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

if ! command -v jtt >/dev/null 2>&1; then
  printf 'jira-ticket-tools CLI not found on PATH. Install the package so jtt is available.\n' >&2
  exit 1
fi

mkdir -p "$issue_dir"
jtt export "$issue_key" "$issue_md"

printf 'Created issue export: %s\n' "$issue_md"
