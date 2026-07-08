#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  printf 'Usage: %s ISSUE_KEY [OUTPUT_MD]\n' "$0" >&2
  exit 1
fi

issue_key="$1"
output_md="${2:-exports/${issue_key}/${issue_key}.md}"
tmp_json="${output_md%.md}.json"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
json_script="${script_dir}/get-issue-json.sh"
convert_script="${script_dir}/issue-json-to-md.py"

if [[ ! -x "$json_script" ]]; then
  printf 'Required script not executable: %s\n' "$json_script" >&2
  exit 1
fi

if [[ ! -x "$convert_script" ]]; then
  printf 'Required script not executable: %s\n' "$convert_script" >&2
  exit 1
fi

"$json_script" "$issue_key" "$tmp_json"
"$convert_script" "$tmp_json" "$output_md"
