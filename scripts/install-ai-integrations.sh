#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
# shellcheck disable=SC1091
source "${script_dir}/lib/ui.sh"

install_opencode=false
install_claude=false
install_cursor=false
force=false
no_color=false
no_anim=false
quiet=false

usage() {
  printf 'Usage: %s [--all] [--opencode] [--claude] [--cursor] [--force] [--no-color] [--no-anim] [--quiet]\n' "$0"
}

if [[ $# -eq 0 ]]; then
  install_opencode=true
  install_claude=true
  install_cursor=true
fi

for arg in "$@"; do
  case "$arg" in
    --all)
      install_opencode=true
      install_claude=true
      install_cursor=true
      ;;
    --opencode)
      install_opencode=true
      ;;
    --claude)
      install_claude=true
      ;;
    --cursor)
      install_cursor=true
      ;;
    --force)
      force=true
      ;;
    --no-color)
      no_color=true
      ;;
    --no-anim)
      no_anim=true
      ;;
    --quiet)
      quiet=true
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown option: %s\n' "$arg" >&2
      usage >&2
      exit 1
      ;;
  esac
done

installer_args=()
if [[ "$force" == true ]]; then
  installer_args+=(--force)
fi

if [[ "$no_color" == true ]]; then
  export JTT_NO_COLOR=1
fi
if [[ "$no_anim" == true ]]; then
  export JTT_NO_ANIM=1
fi
if [[ "$quiet" == true ]]; then
  export JTT_QUIET=1
fi

ui_init
ui_header "jira-ticket-tools installer"

installed_count=0
skipped_count=0
failed_count=0

run_provider() {
  local label="$1"
  local script_name="$2"
  local tmp_file
  tmp_file="$(mktemp)"

  JTT_SHOW_ENV_HINT=0 bash "$script_dir/$script_name" "${installer_args[@]}" >"$tmp_file" 2>&1 &
  local cmd_pid=$!

  if ui_spinner_wait "$cmd_pid" "Installing ${label}"; then
    local output
    output="$(<"$tmp_file")"
    if [[ "$output" == *"already installed"* ]]; then
      skipped_count=$((skipped_count + 1))
      ui_warn "${label}: already installed"
    else
      installed_count=$((installed_count + 1))
      ui_ok "${label}: installed"
    fi
  else
    local rc=$?
    failed_count=$((failed_count + 1))
    ui_error "${label}: install failed (exit ${rc})"
    readarray -t output_lines <"$tmp_file"
    for line in "${output_lines[@]}"; do
      ui_error "$line"
    done
  fi

  rm -f "$tmp_file"
}

if [[ "$install_opencode" == true ]]; then
  run_provider "OpenCode" "install-opencode-integration.sh"
fi

if [[ "$install_claude" == true ]]; then
  run_provider "Claude Code" "install-claude-code-integration.sh"
fi

if [[ "$install_cursor" == true ]]; then
  run_provider "Cursor" "install-cursor-integration.sh"
fi

if [[ -z "${JIRA_TICKET_TOOLS_DIR:-}" ]]; then
  ui_info "JIRA_TICKET_TOOLS_DIR is not set. Set it once for portability:"
  if [[ "$quiet" != true ]]; then
    printf '  export JIRA_TICKET_TOOLS_DIR="%s"\n' "$repo_root"
    printf '  echo '\''export JIRA_TICKET_TOOLS_DIR="%s"'\'' >> ~/.bashrc\n' "$repo_root"
    printf '  # or use ~/.zshrc for zsh\n'
  fi
fi

if [[ "$quiet" != true ]]; then
  printf '\n'
fi
ui_info "Summary: installed=${installed_count}, skipped=${skipped_count}, failed=${failed_count}"

if [[ "$failed_count" -gt 0 ]]; then
  ui_error "Done with failures."
  exit 1
fi

ui_ok "Done installing selected AI integrations."
