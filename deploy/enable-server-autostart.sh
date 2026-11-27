#!/usr/bin/env bash
set -euo pipefail

# Validate and enable the already-built Casa Painii deployment.
# Run from the repository root on the Debian server:
#   sudo bash deploy/enable-server-autostart.sh

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this installer with sudo." >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
unit_source="$repo_root/deploy/church-operations.service"
app_root="/opt/church-operations"
env_file="$app_root/.env"
state_root="/var/lib/church-operations"
unit_target="/etc/systemd/system/church-operations.service"

for command_name in awk openssl curl /usr/bin/node systemctl systemd-analyze runuser install stat realpath sha256sum grep sleep; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command '$command_name' is not installed." >&2
    exit 1
  fi
done
for required in "$unit_source" "$env_file" "$app_root/server/dist/index.js"; do
  if [[ ! -s "$required" ]]; then
    echo "Required deployment file is missing or empty: $required" >&2
    exit 1
  fi
done
if ! id churchops >/dev/null 2>&1; then
  echo "The dedicated 'churchops' service account does not exist." >&2
  exit 1
fi
if ! runuser -u churchops -- test -r "$env_file"; then
  echo "The 'churchops' account cannot read $env_file. Use root:churchops ownership and mode 0640." >&2
  exit 1
fi

node_major="$(/usr/bin/node -p 'Number(process.versions.node.split(".")[0])')"
if [[ ! "$node_major" =~ ^[0-9]+$ ]] || (( node_major < 22 )); then
  echo "Node.js 22 or newer is required; found $(/usr/bin/node --version)." >&2
  exit 1
fi

read_env_value() {
  local wanted="$1"
  awk -v wanted="$wanted" '
    /^[[:space:]]*#/ { next }
    {
      line = $0
      sub(/^[[:space:]]*export[[:space:]]+/, "", line)
      separator = index(line, "=")
      if (separator == 0) next
      name = substr(line, 1, separator - 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", name)
      if (name != wanted) next
      value = substr(line, separator + 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      double_quote = sprintf("%c", 34)
      single_quote = sprintf("%c", 39)
      if (substr(value, 1, 1) == double_quote && substr(value, length(value), 1) == double_quote) value = substr(value, 2, length(value) - 2)
      if (substr(value, 1, 1) == single_quote && substr(value, length(value), 1) == single_quote) value = substr(value, 2, length(value) - 2)
      print value
      exit
    }
  ' "$env_file"
}

host="$(read_env_value CHURCH_HOST)"
port="$(read_env_value CHURCH_PORT)"
cert="$(read_env_value CHURCH_TLS_CERT_PATH)"
key="$(read_env_value CHURCH_TLS_KEY_PATH)"
ca="$(read_env_value CHURCH_TLS_CA_CERT_PATH)"
expected_host="$(read_env_value CHURCH_TLS_EXPECTED_HOST)"
dashboard_dir="$(read_env_value CHURCH_DASHBOARD_DIRECTORY)"
database_path="$(read_env_value VEYRA_DATABASE_PATH)"
setup_key_path="$(read_env_value VEYRA_SETUP_KEY_PATH)"
pairing_secret_path="$(read_env_value VEYRA_PAIRING_SECRET_PATH)"
media_dir="$(read_env_value VEYRA_MEDIA_DIRECTORY)"

[[ -n "$port" ]] || port=8787
[[ -n "$expected_host" ]] || expected_host=192.168.0.67
[[ -n "$dashboard_dir" ]] || dashboard_dir="$app_root/dashboard/dist"
[[ -n "$ca" ]] || ca="$(dirname "$cert")/ca.crt"

if [[ "$host" != "0.0.0.0" ]]; then
  echo "CHURCH_HOST must be 0.0.0.0 for the current church LAN; found '${host:-unset}'." >&2
  exit 1
fi
if [[ ! "$port" =~ ^[0-9]+$ ]] || (( port < 1 || port > 65535 )); then
  echo "CHURCH_PORT must be a valid TCP port; found '$port'." >&2
  exit 1
fi
if [[ -z "$cert" || -z "$key" || ! -s "$cert" || ! -s "$key" || ! -s "$ca" ]]; then
  echo "The TLS certificate, private key, and CA certificate must all exist and be non-empty." >&2
  echo "Set CHURCH_TLS_CERT_PATH, CHURCH_TLS_KEY_PATH, and CHURCH_TLS_CA_CERT_PATH in $env_file." >&2
  exit 1
fi
if [[ "$dashboard_dir" != /* ]]; then
  echo "CHURCH_DASHBOARD_DIRECTORY must be an absolute path in production." >&2
  exit 1
fi
if [[ ! -s "$dashboard_dir/index.html" ]]; then
  echo "Built dashboard not found at $dashboard_dir/index.html." >&2
  exit 1
fi

# The service is sandboxed with ProtectSystem=strict. All mutable application
# data must therefore live under its explicitly writable StateDirectory.
for state_path in "$database_path" "$setup_key_path" "$pairing_secret_path" "$media_dir"; do
  if [[ -z "$state_path" ]]; then
    echo "A required VEYRA_* data path is missing from $env_file." >&2
    exit 1
  fi
  resolved_state_path="$(realpath -m "$state_path")"
  case "$resolved_state_path" in
    "$state_root"/*) ;;
    *)
      echo "All VEYRA_* data paths must resolve below $state_root; found '$state_path'." >&2
      exit 1
      ;;
  esac
done

runtime_home="$state_root/runtime-home"
env_home="$(read_env_value HOME)"
if grep -Eq '^[[:space:]]*(export[[:space:]]+)?HOME[[:space:]]*=' "$env_file" && [[ "$env_home" != "$runtime_home" ]]; then
  echo "Remove HOME from $env_file or set it to $runtime_home; it must not override the systemd runtime HOME." >&2
  exit 1
fi
database_directory="$(realpath -m "$(dirname "$database_path")")"
if [[ "$database_directory" == "$runtime_home" ]]; then
  echo "The database directory must not equal the service HOME directory ($runtime_home)." >&2
  exit 1
fi

openssl x509 -in "$cert" -noout >/dev/null
openssl x509 -in "$ca" -noout >/dev/null
if ! openssl x509 -in "$ca" -noout -ext basicConstraints 2>/dev/null | grep -q 'CA:TRUE'; then
  echo "The TLS CA certificate must have CA:TRUE basic constraints." >&2
  exit 1
fi
openssl pkey -in "$key" -passin pass: -noout >/dev/null

cert_public_key="$(openssl x509 -in "$cert" -pubkey -noout | openssl pkey -pubin -outform DER 2>/dev/null | sha256sum | awk '{print $1}')"
key_public_key="$(openssl pkey -in "$key" -passin pass: -pubout -outform DER 2>/dev/null | sha256sum | awk '{print $1}')"
if [[ -z "$cert_public_key" || "$cert_public_key" != "$key_public_key" ]]; then
  echo "The TLS certificate and private key do not match." >&2
  exit 1
fi

if [[ "$expected_host" =~ ^[0-9a-fA-F:.]+$ ]]; then
  openssl x509 -in "$cert" -noout -checkip "$expected_host" >/dev/null
  openssl verify -CAfile "$ca" -purpose sslserver -verify_ip "$expected_host" "$cert" >/dev/null
else
  openssl x509 -in "$cert" -noout -checkhost "$expected_host" >/dev/null
  openssl verify -CAfile "$ca" -purpose sslserver -verify_hostname "$expected_host" "$cert" >/dev/null
fi

if ! runuser -u churchops -- test -r "$cert" ||
   ! runuser -u churchops -- test -r "$key" ||
   ! runuser -u churchops -- test -r "$ca"; then
  echo "The churchops account must be able to read the TLS certificate, key, and CA file." >&2
  exit 1
fi

# Restrict secrets to root and the service account.
env_owner_group="$(stat -c '%U:%G' "$env_file")"
env_mode="$(stat -c '%a' "$env_file")"
if [[ "$env_owner_group" != "root:churchops" || "$env_mode" != "640" ]]; then
  echo "The production .env must be root:churchops with mode 0640; found $env_owner_group mode $env_mode." >&2
  exit 1
fi

key_owner_group="$(stat -c '%U:%G' "$key")"
key_mode="$(stat -c '%a' "$key")"
if [[ "$key_owner_group" != "root:churchops" || "$key_mode" != "640" ]]; then
  echo "The TLS private key must be root:churchops with mode 0640; found $key_owner_group mode $key_mode." >&2
  exit 1
fi

if [[ -L "$state_root" ]]; then
  echo "$state_root must not be a symbolic link." >&2
  exit 1
fi
install -d -o churchops -g churchops -m 0700 "$state_root"
install -d -o churchops -g churchops -m 0700 "$state_root/runtime-home"
for state_path in "$database_path" "$setup_key_path" "$pairing_secret_path"; do
  install -d -o churchops -g churchops -m 0700 "$(dirname "$state_path")"
done
if [[ -L "$media_dir" ]]; then
  echo "Media directory must not be a symbolic link: $media_dir" >&2
  exit 1
fi
install -d -o churchops -g churchops -m 0700 "$media_dir"

for state_file in "$database_path" "$setup_key_path" "$pairing_secret_path"; do
  if [[ -e "$state_file" ]]; then
    if [[ -L "$state_file" || ! -f "$state_file" ]]; then
      echo "Application state file must be a regular file, not a symlink: $state_file" >&2
      exit 1
    fi
    if [[ "$(stat -c '%U:%G' "$state_file")" != "churchops:churchops" ]]; then
      echo "Application state file must be owned by churchops:churchops: $state_file" >&2
      exit 1
    fi
    if ! runuser -u churchops -- test -r "$state_file" || ! runuser -u churchops -- test -w "$state_file"; then
      echo "The churchops account must be able to read and write $state_file." >&2
      exit 1
    fi
    chmod 0600 "$state_file"
  fi
done

# Validate the candidate before replacing the installed unit.
systemd-analyze verify "$unit_source"

# Preserve the previous unit for a straightforward manual rollback.
if [[ -f "$unit_target" ]]; then
  cp -a "$unit_target" "$unit_target.bak.$(date +%Y%m%d%H%M%S)"
fi
install -m 0644 "$unit_source" "$unit_target"
systemd-analyze verify "$unit_target"
systemctl daemon-reload
systemctl restart church-operations.service

echo "Waiting for the HTTPS health endpoint..."
healthy=0
for ((attempt = 1; attempt <= 30; attempt++)); do
  if response="$(curl --silent --show-error --fail --cacert "$ca" \
      --connect-to "$expected_host:$port:127.0.0.1:$port" \
      "https://$expected_host:$port/api/v1/health" 2>/dev/null)" &&
     grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"' <<< "$response"; then
    healthy=1
    break
  fi
  sleep 1
done

if [[ "$healthy" -ne 1 ]]; then
  echo "Casa Painii did not pass its HTTPS health check." >&2
  systemctl --no-pager --full status church-operations.service || true
  journalctl -u church-operations.service -n 60 --no-pager || true
  exit 1
fi

# Enable boot startup only after the new service has passed its health check.
systemctl enable church-operations.service >/dev/null

echo
systemctl --no-pager --full status church-operations.service
echo
echo "Casa Painii is enabled at boot and passed its local HTTPS health check."
echo "The installer exits; systemd keeps the service running in the background."
