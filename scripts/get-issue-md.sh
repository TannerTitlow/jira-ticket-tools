#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${script_dir}/lib/ui.sh"

usage() {
  printf 'Usage: %s ISSUE_KEY [OUTPUT_MD] [--quiet] [--no-color] [--no-anim]\n' "$0"
}

quiet=false
no_color=false
no_anim=false
positionals=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --quiet)
      quiet=true
      shift
      ;;
    --no-color)
      no_color=true
      shift
      ;;
    --no-anim)
      no_anim=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      printf 'Unknown option: %s\n' "$1" >&2
      usage >&2
      exit 1
      ;;
    *)
      positionals+=("$1")
      shift
      ;;
  esac
done

if [[ "$quiet" == true ]]; then
  export JTT_QUIET=1
fi
if [[ "$no_color" == true ]]; then
  export JTT_NO_COLOR=1
fi
if [[ "$no_anim" == true ]]; then
  export JTT_NO_ANIM=1
fi
ui_init

if [[ ${#positionals[@]} -lt 1 || ${#positionals[@]} -gt 2 ]]; then
  usage >&2
  exit 1
fi

issue_key="${positionals[0]}"
output_md="${positionals[1]:-exports/${issue_key}/${issue_key}.md}"
tmp_json="${output_md%.md}.json"

json_script="${script_dir}/get-issue-json.sh"
convert_script="${script_dir}/issue-json-to-md.py"

if [[ ! -x "$json_script" ]]; then
  ui_error "Required script not executable: $json_script"
  exit 1
fi

if [[ ! -x "$convert_script" ]]; then
  ui_error "Required script not executable: $convert_script"
  exit 1
fi

ui_info "Fetching Jira issue JSON for $issue_key"
"$json_script" "$issue_key" "$tmp_json" --quiet

ui_info "Rendering markdown for $issue_key"
"$convert_script" "$tmp_json" "$output_md"

ui_ok "Saved $output_md"
