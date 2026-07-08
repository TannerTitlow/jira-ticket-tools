#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
# shellcheck disable=SC1091
source "${script_dir}/lib/ui.sh"

usage() {
  printf 'Usage: %s ISSUE_KEY [OUTPUT_FILE] [--quiet] [--no-color] [--no-anim]\n' "$0"
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

if [[ -f "${repo_root}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${repo_root}/.env"
  set +a
fi

if [[ ${#positionals[@]} -lt 1 || ${#positionals[@]} -gt 2 ]]; then
  usage >&2
  exit 1
fi

issue_key="${positionals[0]}"
output_file="${positionals[1]:-exports/${issue_key}.json}"

: "${JIRA_BASE:?JIRA_BASE is required (for example https://your-domain.atlassian.net)}"
: "${JIRA_EMAIL:?JIRA_EMAIL is required}"
: "${JIRA_API_TOKEN:?JIRA_API_TOKEN is required}"

mkdir -p "$(dirname "$output_file")"

url="${JIRA_BASE}/rest/api/3/issue/${issue_key}"

curl -fsS \
  -u "${JIRA_EMAIL}:${JIRA_API_TOKEN}" \
  -H 'Accept: application/json' \
  "$url" \
  -o "$output_file"

ui_ok "Saved $output_file"
