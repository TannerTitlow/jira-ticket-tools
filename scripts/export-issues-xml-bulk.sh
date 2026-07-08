#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  printf 'Usage: %s ISSUE_KEYS_FILE [OUTPUT_DIR]\n' "$0" >&2
  exit 1
fi

keys_file="$1"
output_dir="${2:-exports}"

if [[ ! -f "$keys_file" ]]; then
  printf 'Issue key file not found: %s\n' "$keys_file" >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fetch_script="${script_dir}/get-issue-xml.sh"

if [[ ! -x "$fetch_script" ]]; then
  printf 'Required script not executable: %s\n' "$fetch_script" >&2
  exit 1
fi

mkdir -p "$output_dir"

success_count=0
failed_count=0

while IFS= read -r raw_line || [[ -n "$raw_line" ]]; do
  issue_key="${raw_line%%#*}"
  issue_key="${issue_key//[[:space:]]/}"

  if [[ -z "$issue_key" ]]; then
    continue
  fi

  output_file="${output_dir}/${issue_key}.xml"

  if "$fetch_script" "$issue_key" "$output_file"; then
    success_count=$((success_count + 1))
  else
    printf 'Failed: %s\n' "$issue_key" >&2
    failed_count=$((failed_count + 1))
  fi
done < "$keys_file"

printf 'Done. success=%d failed=%d\n' "$success_count" "$failed_count"

if [[ "$failed_count" -gt 0 ]]; then
  exit 2
fi
