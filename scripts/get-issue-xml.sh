#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"

if [[ -f "${repo_root}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${repo_root}/.env"
  set +a
fi

if [[ $# -lt 1 || $# -gt 2 ]]; then
  printf 'Usage: %s ISSUE_KEY [OUTPUT_FILE]\n' "$0" >&2
  exit 1
fi

issue_key="$1"
output_file="${2:-exports/${issue_key}.xml}"

: "${JIRA_BASE:?JIRA_BASE is required (for example https://your-domain.atlassian.net)}"
: "${JIRA_EMAIL:?JIRA_EMAIL is required}"
: "${JIRA_API_TOKEN:?JIRA_API_TOKEN is required}"

mkdir -p "$(dirname "$output_file")"

url="${JIRA_BASE}/si/jira.issueviews:issue-xml/${issue_key}/${issue_key}.xml"

curl -fsS \
  -u "${JIRA_EMAIL}:${JIRA_API_TOKEN}" \
  -H 'Accept: application/xml' \
  "$url" \
  -o "$output_file"

printf 'Saved %s\n' "$output_file"
