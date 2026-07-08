#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${script_dir}/lib/ui.sh"

usage() {
  printf 'Usage: %s [--force] [--quiet] [--no-color] [--no-anim]\n' "$0"
}

force=false
quiet=false
no_color=false
no_anim=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)
      force=true
      shift
      ;;
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
    *)
      printf 'Unknown option: %s\n' "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

repo_root="$(cd "${script_dir}/.." && pwd)"
show_env_hint="${JTT_SHOW_ENV_HINT:-1}"

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

source_dir="${repo_root}/claude-code"
target_root="${HOME}/.claude"
required_files=(
  "$target_root/commands/jira-plan.md"
  "$target_root/commands/jira-review.md"
  "$target_root/skills/jira-issue-implementation/SKILL.md"
)

if [[ ! -d "$source_dir" ]]; then
  ui_error "Source integration directory not found: $source_dir"
  exit 1
fi

all_present=true
for path in "${required_files[@]}"; do
  if [[ ! -f "$path" ]]; then
    all_present=false
    break
  fi
done

if [[ "$all_present" == true && "$force" != true ]]; then
  ui_ok "Claude Code integration already installed at $target_root"
  ui_info "Nothing to do."
  exit 0
fi

if [[ "$force" == true ]]; then
  ui_info "Force reinstall enabled for Claude Code integration."
fi

mkdir -p "$target_root/commands"
mkdir -p "$target_root/skills/jira-issue-implementation"

cp "$source_dir/commands/jira-plan.md" "$target_root/commands/jira-plan.md"
cp "$source_dir/commands/jira-review.md" "$target_root/commands/jira-review.md"
cp "$source_dir/skills/jira-issue-implementation/SKILL.md" "$target_root/skills/jira-issue-implementation/SKILL.md"

ui_ok "Installed Claude Code command/skill templates to $target_root"
if [[ "$show_env_hint" == "1" && -z "${JIRA_TICKET_TOOLS_DIR:-}" ]]; then
  ui_info "Set JIRA_TICKET_TOOLS_DIR for portability:"
  if [[ "${JTT_QUIET:-0}" != "1" ]]; then
    printf '  export JIRA_TICKET_TOOLS_DIR="%s"\n' "$repo_root"
    printf '  echo '\''export JIRA_TICKET_TOOLS_DIR="%s"'\'' >> ~/.bashrc\n' "$repo_root"
    printf '  # or use ~/.zshrc for zsh\n'
  fi
fi
ui_info "Restart Claude Code to load new command and skill definitions."
