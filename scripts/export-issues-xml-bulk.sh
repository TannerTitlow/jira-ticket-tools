#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${script_dir}/lib/ui.sh"

usage() {
  printf 'Usage: %s ISSUE_KEYS_FILE [OUTPUT_DIR] [--quiet] [--no-color] [--no-anim]\n' "$0"
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

keys_file="${positionals[0]}"
output_dir="${positionals[1]:-exports}"

if [[ ! -f "$keys_file" ]]; then
  ui_error "Issue key file not found: $keys_file"
  exit 1
fi

fetch_script="${script_dir}/get-issue-xml.sh"

if [[ ! -x "$fetch_script" ]]; then
  ui_error "Required script not executable: $fetch_script"
  exit 1
fi

mkdir -p "$output_dir"
ui_header "Bulk Jira XML export"
ui_info "Issue key source: $keys_file"
ui_info "Output directory: $output_dir"

success_count=0
failed_count=0

while IFS= read -r raw_line || [[ -n "$raw_line" ]]; do
  issue_key="${raw_line%%#*}"
  issue_key="${issue_key//[[:space:]]/}"

  if [[ -z "$issue_key" ]]; then
    continue
  fi

  output_file="${output_dir}/${issue_key}.xml"

  if "$fetch_script" "$issue_key" "$output_file" --quiet; then
    success_count=$((success_count + 1))
    ui_ok "${issue_key}: exported"
  else
    ui_error "${issue_key}: export failed"
    failed_count=$((failed_count + 1))
  fi
done < "$keys_file"

ui_info "Summary: success=${success_count} failed=${failed_count}"

if [[ "$failed_count" -gt 0 ]]; then
  exit 2
fi
