#!/usr/bin/env bash
set -euo pipefail

# Enable the existing Casa Painii server as a boot-time systemd service.
# HTTP is explicitly permitted only for the trusted private church LAN.
# This script never deletes, moves, truncates, or changes ownership of app data.

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this installer as root (su -)." >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
app_root="/opt/church-operations"
env_file="$app_root/.env"
state_root="/var/lib/church-operations"
unit_source="$repo_root/deploy/church-operations.service"
unit_target="/etc/systemd/system/church-operations.service"

for command_name in awk curl /usr/bin/node systemctl systemd-analyze runuser install stat realpath grep sleep; do
  command -v "$command_name" >/dev/null 2>&1 || { echo "Missing command: $command_name" >&2; exit 1; }
done
for required in "$unit_source" "$env_file" "$app_root/server/dist/index.js" "$app_root/dashboard/dist/index.html"; do
  [[ -s "$required" ]] || { echo "Missing or empty required file: $required" >&2; exit 1; }
done
id churchops >/dev/null 2>&1 || { echo "Missing churchops service account." >&2; exit 1; }
[[ -r "$env_file" ]] || { echo "Root cannot read $env_file." >&2; exit 1; }

read_env_value() {
  awk -v wanted="$1" '
    /^[[:space:]]*#/ { next }
    {
      line=$0
      separator=index(line,"=")
      if (!separator) next
      name=substr(line,1,separator-1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", name)
      if (name != wanted) next
      value=substr(line,separator+1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      if (value ~ /^".*"$/ || value ~ /^\047.*\047$/) value=substr(value,2,length(value)-2)
      print value
      exit
    }
  ' "$env_file"
}

host="$(read_env_value CHURCH_HOST)"
port="$(read_env_value CHURCH_PORT)"
[[ -n "$host" ]] || host="0.0.0.0"
[[ -n "$port" ]] || port="8787"
[[ "$host" == "0.0.0.0" ]] || { echo "CHURCH_HOST must be 0.0.0.0; found '$host'." >&2; exit 1; }
[[ "$port" =~ ^[0-9]+$ ]] && (( port >= 1 && port <= 65535 )) || { echo "Invalid CHURCH_PORT: $port" >&2; exit 1; }
node_major="$(/usr/bin/node -p 'Number(process.versions.node.split(".")[0])')"
(( node_major >= 22 )) || { echo "Node.js 22+ required." >&2; exit 1; }

# Ensure every configured mutable state path remains inside StateDirectory.
database="$(read_env_value VEYRA_DATABASE_PATH)"
setup_key="$(read_env_value VEYRA_SETUP_KEY_PATH)"
pairing_secret="$(read_env_value VEYRA_PAIRING_SECRET_PATH)"
media="$(read_env_value VEYRA_MEDIA_DIRECTORY)"
for path in "$database" "$setup_key" "$pairing_secret" "$media"; do
  [[ -n "$path" ]] || { echo "A VEYRA_* state path is missing from .env." >&2; exit 1; }
  resolved="$(realpath -m "$path")"
  case "$resolved" in "$state_root"/*) ;; *) echo "State path must be under $state_root: $path" >&2; exit 1 ;; esac
done

systemd-analyze verify "$unit_source"
install -d -o churchops -g churchops -m 0700 "$state_root/runtime-home"

backup=""
was_active=0
was_enabled=0
systemctl is-active --quiet church-operations.service && was_active=1 || true
systemctl is-enabled --quiet church-operations.service && was_enabled=1 || true
if [[ -f "$unit_target" ]]; then
  backup="$unit_target.bak.$(date +%Y%m%d%H%M%S)"
  cp -a "$unit_target" "$backup"
fi

restore_previous() {
  if [[ -n "$backup" && -f "$backup" ]]; then cp -a "$backup" "$unit_target"; else rm -f "$unit_target"; fi
  systemctl daemon-reload || true
  if (( was_active )); then systemctl restart church-operations.service || true; else systemctl stop church-operations.service || true; fi
  if (( was_enabled )); then systemctl enable church-operations.service >/dev/null 2>&1 || true; else systemctl disable church-operations.service >/dev/null 2>&1 || true; fi
}

install -m 0644 "$unit_source" "$unit_target"
if ! systemd-analyze verify "$unit_target" || ! systemctl daemon-reload || ! systemctl restart church-operations.service; then
  echo "Server unit validation/restart failed; restoring previous unit." >&2
  restore_previous
  exit 1
fi

healthy=0
for ((attempt=1; attempt<=30; attempt++)); do
  if response="$(curl --silent --show-error --fail --connect-timeout 2 --max-time 4 "http://127.0.0.1:$port/api/v1/health" 2>/dev/null)" &&
     grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"' <<< "$response"; then
    healthy=1
    break
  fi
  sleep 1
done
if (( ! healthy )); then
  echo "HTTP health check failed; restoring previous service unit." >&2
  systemctl --no-pager --full status church-operations.service || true
  journalctl -u church-operations.service -n 60 --no-pager || true
  restore_previous
  exit 1
fi

if ! systemctl enable church-operations.service >/dev/null; then
  echo "Could not enable service; restoring previous unit." >&2
  restore_previous
  exit 1
fi

echo
systemctl --no-pager --full status church-operations.service
echo
echo "Casa Painii server is enabled at boot and passed its local HTTP health check."
echo "HTTP is unencrypted. Do not expose port $port through router port forwarding."
