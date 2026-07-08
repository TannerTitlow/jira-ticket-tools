#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"

if ! command -v shellcheck >/dev/null 2>&1; then
  printf 'shellcheck is required but not installed.\n' >&2
  exit 1
fi

mapfile -t shell_scripts < <(git -C "$repo_root" ls-files '*.sh')

shellcheck \
  -e SC1090,SC1091 \
  "${shell_scripts[@]/#/$repo_root/}"

printf 'Shellcheck passed.\n'
