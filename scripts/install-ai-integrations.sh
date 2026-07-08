#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

install_opencode=false
install_claude=false
install_cursor=false

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
    -h|--help)
      printf 'Usage: %s [--all] [--opencode] [--claude] [--cursor]\n' "$0"
      exit 0
      ;;
    *)
      printf 'Unknown option: %s\n' "$arg" >&2
      printf 'Usage: %s [--all] [--opencode] [--claude] [--cursor]\n' "$0" >&2
      exit 1
      ;;
  esac
done

if [[ "$install_opencode" == true ]]; then
  bash "$script_dir/install-opencode-integration.sh"
fi

if [[ "$install_claude" == true ]]; then
  bash "$script_dir/install-claude-code-integration.sh"
fi

if [[ "$install_cursor" == true ]]; then
  bash "$script_dir/install-cursor-integration.sh"
fi

printf 'Done installing selected AI integrations.\n'
