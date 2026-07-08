#!/usr/bin/env bash

ui_init() {
  UI_IS_TTY=false
  UI_USE_COLOR=false
  UI_USE_ANIM=false
  UI_QUIET=false

  if [[ -t 1 ]]; then
    UI_IS_TTY=true
  fi

  if [[ "${JTT_QUIET:-0}" == "1" ]]; then
    UI_QUIET=true
  fi

  if [[ "$UI_IS_TTY" == true && "${NO_COLOR:-}" == "" && "${JTT_NO_COLOR:-0}" != "1" && "${TERM:-}" != "dumb" ]]; then
    UI_USE_COLOR=true
  fi

  if [[ "$UI_IS_TTY" == true && "${CI:-}" != "true" && "${JTT_NO_ANIM:-0}" != "1" ]]; then
    UI_USE_ANIM=true
  fi

  if [[ "$UI_USE_COLOR" == true ]]; then
    UI_RESET='\033[0m'
    UI_BOLD='\033[1m'
    UI_DIM='\033[2m'
    UI_CYAN='\033[36m'
    UI_GREEN='\033[32m'
    UI_YELLOW='\033[33m'
    UI_RED='\033[31m'
  else
    UI_RESET=''
    UI_BOLD=''
    UI_DIM=''
    UI_CYAN=''
    UI_GREEN=''
    UI_YELLOW=''
    UI_RED=''
  fi
}

ui_header() {
  if [[ "$UI_QUIET" == true ]]; then
    return
  fi
  printf '%b%s%b\n' "$UI_BOLD$UI_CYAN" "$1" "$UI_RESET"
}

ui_info() {
  if [[ "$UI_QUIET" == true ]]; then
    return
  fi
  printf '%b[INFO]%b %s\n' "$UI_DIM" "$UI_RESET" "$1"
}

ui_ok() {
  if [[ "$UI_QUIET" == true ]]; then
    return
  fi
  printf '%b[OK]%b %s\n' "$UI_GREEN" "$UI_RESET" "$1"
}

ui_warn() {
  if [[ "$UI_QUIET" == true ]]; then
    return
  fi
  printf '%b[WARN]%b %s\n' "$UI_YELLOW" "$UI_RESET" "$1"
}

ui_error() {
  printf '%b[ERROR]%b %s\n' "$UI_RED" "$UI_RESET" "$1" >&2
}

ui_spinner_wait() {
  local pid="$1"
  local label="$2"
  local frames='|/-\'
  local i=0

  if [[ "$UI_QUIET" == true ]]; then
    if wait "$pid"; then
      return 0
    fi
    return $?
  fi

  if [[ "$UI_USE_ANIM" != true ]]; then
    printf '[..] %s\n' "$label"
    if wait "$pid"; then
      return 0
    fi
    return $?
  fi

  while kill -0 "$pid" 2>/dev/null; do
    printf '\r[%c] %s' "${frames:i++%${#frames}:1}" "$label"
    sleep 0.08
  done

  if wait "$pid"; then
    printf '\r[OK] %s\033[K\n' "$label"
    return 0
  fi

  local rc=$?
  printf '\r[ER] %s\033[K\n' "$label"
  return "$rc"
}
