#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"

mapfile -t shell_scripts < <(git -C "$repo_root" ls-files '*.sh')

for rel_path in "${shell_scripts[@]}"; do
  bash -n "$repo_root/$rel_path"
done

python3 -m py_compile "$repo_root/scripts/issue-json-to-md.py"

bash "$repo_root/scripts/ci-smoke-installers.sh"

printf 'CI checks passed.\n'
