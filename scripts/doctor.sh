#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"

quiet=false
selected_providers=()

usage() {
  printf 'Usage: %s [--quiet] [--provider opencode|claude|cursor]\n' "$0"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --quiet)
      quiet=true
      shift
      ;;
    --provider)
      if [[ $# -lt 2 ]]; then
        printf 'Missing value for --provider\n' >&2
        usage >&2
        exit 1
      fi
      case "$2" in
        opencode|claude|cursor)
          selected_providers+=("$2")
          ;;
        *)
          printf 'Invalid provider: %s\n' "$2" >&2
          usage >&2
          exit 1
          ;;
      esac
      shift 2
      ;;
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
done

if [[ ${#selected_providers[@]} -eq 0 ]]; then
  selected_providers=(opencode claude cursor)
fi

has_provider() {
  local target="$1"
  local p
  for p in "${selected_providers[@]}"; do
    if [[ "$p" == "$target" ]]; then
      return 0
    fi
  done
  return 1
}

ok_count=0
warn_count=0
fail_count=0

print_ok() {
  ok_count=$((ok_count + 1))
  if [[ "$quiet" != true ]]; then
    printf '[OK] %s\n' "$1"
  fi
}

print_warn() {
  warn_count=$((warn_count + 1))
  printf '[WARN] %s\n' "$1"
}

print_fail() {
  fail_count=$((fail_count + 1))
  printf '[FAIL] %s\n' "$1"
}

check_command() {
  local cmd="$1"
  if command -v "$cmd" >/dev/null 2>&1; then
    print_ok "Dependency found: $cmd"
  else
    print_fail "Missing dependency: $cmd"
  fi
}

check_file() {
  local path="$1"
  local label="$2"
  if [[ -f "$path" ]]; then
    print_ok "$label: $path"
  else
    print_warn "$label not found: $path"
  fi
}

load_env_file() {
  local env_file="${repo_root}/.env"
  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
    print_ok "Loaded .env from ${env_file}"
  else
    print_warn "No .env file at ${env_file}"
  fi
}

check_env_var() {
  local name="$1"
  if [[ -n "${!name:-}" ]]; then
    print_ok "Environment variable set: $name"
  else
    print_fail "Environment variable missing: $name"
  fi
}

if [[ "$quiet" != true ]]; then
  printf 'jira-ticket-tools doctor\n'
  printf 'Repo: %s\n\n' "$repo_root"
fi

check_command bash
check_command python3
check_command curl

load_env_file
check_env_var JIRA_BASE
check_env_var JIRA_EMAIL
check_env_var JIRA_API_TOKEN

if [[ -n "${JIRA_TICKET_TOOLS_DIR:-}" ]]; then
  print_ok "JIRA_TICKET_TOOLS_DIR set: ${JIRA_TICKET_TOOLS_DIR}"
else
  print_warn "JIRA_TICKET_TOOLS_DIR is not set (recommended for AI integrations)"
fi

if has_provider opencode; then
  check_file "${HOME}/.config/opencode/commands/jira-plan.md" "OpenCode command"
  check_file "${HOME}/.config/opencode/commands/jira-review.md" "OpenCode command"
  check_file "${HOME}/.config/opencode/skills/jira-issue-implementation/SKILL.md" "OpenCode skill"
fi

if has_provider claude; then
  check_file "${HOME}/.claude/commands/jira-plan.md" "Claude Code command"
  check_file "${HOME}/.claude/commands/jira-review.md" "Claude Code command"
  check_file "${HOME}/.claude/skills/jira-issue-implementation/SKILL.md" "Claude Code skill"
fi

if has_provider cursor; then
  check_file "${HOME}/.cursor/skills/jira-plan/SKILL.md" "Cursor skill"
  check_file "${HOME}/.cursor/skills/jira-plan/scripts/ensure-export.sh" "Cursor skill script"
  check_file "${HOME}/.cursor/skills/jira-review/SKILL.md" "Cursor skill"
  check_file "${HOME}/.cursor/skills/jira-review/scripts/require-export.sh" "Cursor skill script"
fi

printf '\nSummary: %d ok, %d warnings, %d failures\n' "$ok_count" "$warn_count" "$fail_count"

if [[ "$fail_count" -gt 0 ]]; then
  exit 1
fi
