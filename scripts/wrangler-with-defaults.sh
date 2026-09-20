#!/usr/bin/env bash
# Wrapper around wrangler. All args are passed through unchanged.
# When invoked as `wrangler.sh dev ...`, values are read from .dev.vars:
#   CF_TUNNEL_NAME=<name>          -> appends --tunnel-name=<name>
#                                     (skipped if you already passed --tunnel-name)
#   CF_TUNNEL_AUTO_START=true      -> appends --tunnel (case-insensitive;
#                                     skipped if you already passed --tunnel)

# Enable strict mode
# http://redsymbol.net/articles/unofficial-bash-strict-mode/
set -euo pipefail
IFS=$'\n\t'

VARS_FILE="${DEV_VARS_FILE:-.dev.vars}"

# Print the value of KEY from a dotenv-style file (last definition wins).
# Returns non-zero if the file/key is missing or the value is empty.
read_var() {
  local key=$1 file=$2 line value
  [[ -f $file ]] || return 1
  line=$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}[[:space:]]*=" "$file" | tail -n 1) || return 1
  value=${line#*=}
  value=${value%$'\r'}                              # CRLF files
  value="${value#"${value%%[![:space:]]*}"}"        # trim leading whitespace
  value="${value%"${value##*[![:space:]]}"}"        # trim trailing whitespace
  if [[ $value =~ ^\"(.*)\"$ || $value =~ ^\'(.*)\'$ ]]; then
    value=${BASH_REMATCH[1]}                        # strip matching quotes
  fi
  [[ -n $value ]] || return 1
  printf '%s' "$value"
}

args=("$@")

if [[ ${1:-} == dev ]]; then
  has_tunnel_name=false
  has_tunnel=false
  for a in "$@"; do
    if [[ $a == --tunnel-name || $a == --tunnel-name=* ]]; then
      has_tunnel_name=true
    elif [[ $a == --tunnel || $a == --tunnel=* ]]; then
      has_tunnel=true
    fi
  done

  if [[ $has_tunnel_name == false ]] && tunnel_name=$(read_var CF_TUNNEL_NAME "$VARS_FILE"); then
    args+=("--tunnel-name=${tunnel_name}")
  fi

  # tr instead of ${var,,} so this works with macOS's bash 3.2
  if [[ $has_tunnel == false ]] && auto_start=$(read_var CF_TUNNEL_AUTO_START "$VARS_FILE"); then
    if [[ $(printf '%s' "$auto_start" | tr '[:upper:]' '[:lower:]') == true ]]; then
      args+=("--tunnel")
    fi
  fi
fi

exec npx wrangler "${args[@]}"