#!/usr/bin/env bash
set -euo pipefail

# Configure unattended startup for an existing Veyra receiver installation.
# Usage from the repository root:
#   sudo bash receiver/install-autostart.sh reciver1
#   sudo bash receiver/install-autostart.sh reciver-2

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this installer with sudo." >&2
  exit 1
fi
if [[ $# -ne 1 ]]; then
  echo "Usage: sudo bash receiver/install-autostart.sh <existing-linux-user>" >&2
  exit 2
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
receiver_user="$1"
user_record="$(getent passwd "$receiver_user" || true)"
if [[ -z "$user_record" ]]; then
  echo "User '$receiver_user' does not exist." >&2
  exit 1
fi

IFS=: read -r _ _ uid gid _ home _ <<< "$user_record"
if [[ "$uid" -eq 0 || ! -d "$home" ]]; then
  echo "Refusing to configure root or a user without a home directory." >&2
  exit 1
fi

binary="/usr/local/bin/veyra"
config="/etc/veyra/config.json"
display_helper="$repo_root/receiver/scripts/veyra-display-setup.sh"
session_helper="$repo_root/receiver/scripts/veyra-session-start.sh"
unit_source="$repo_root/receiver/systemd/church-receiver.service"
desktop_source="$repo_root/receiver/autostart/veyra.desktop"

for required in "$binary" "$config" "$display_helper" "$session_helper" "$unit_source" "$desktop_source"; do
  if [[ ! -s "$required" ]]; then
    echo "Required file is missing or empty: $required" >&2
    exit 1
  fi
done
if [[ -L "$config" || ! -f "$config" ]]; then
  echo "The Veyra config must be a regular file, not a symlink: $config" >&2
  exit 1
fi
if [[ ! -x "$binary" ]]; then
  echo "Veyra binary is not executable: $binary" >&2
  exit 1
fi
for command_name in python3 openssl curl grep lightdm systemctl xrandr xset runuser install; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command '$command_name' is not installed." >&2
    exit 1
  fi
done
if [[ ! -f /usr/share/xsessions/xfce.desktop ]] || ! command -v xfce4-session >/dev/null 2>&1; then
  echo "XFCE session files are missing. Install the Debian XFCE desktop before continuing." >&2
  exit 1
fi
if ! getent group video >/dev/null 2>&1; then
  echo "The Linux 'video' group is missing; refusing to change receiver permissions." >&2
  exit 1
fi

# Validate JSON and require an absolute CA path. The receiver uses this CA to
# verify the HTTPS server; no insecure HTTP fallback is permitted.
mapfile -t control_plane_config < <(python3 - "$config" <<'PY'
import json
import sys
from urllib.parse import urlsplit

with open(sys.argv[1], encoding="utf-8") as handle:
    data = json.load(handle)
if not isinstance(data, dict):
    raise SystemExit("Receiver config must be a JSON object")
control = data.get("controlPlane", {})
if not isinstance(control, dict):
    raise SystemExit("controlPlane must be a JSON object")
server_url = control.get("serverUrl", "")
ca_path = control.get("caCertificatePath", "")
if not isinstance(server_url, str) or not isinstance(ca_path, str):
    raise SystemExit("serverUrl and caCertificatePath must be strings")
parsed = urlsplit(server_url)
if (parsed.scheme.lower() != "https" or not parsed.hostname or
        parsed.username or parsed.password or parsed.query or parsed.fragment or
        parsed.path not in ("", "/")):
    raise SystemExit("serverUrl must be an HTTPS origin without credentials, path, query, or fragment")
try:
    parsed.port
except ValueError as error:
    raise SystemExit(f"serverUrl has an invalid port: {error}")
print(server_url)
print(ca_path)
PY
)
server_url="${control_plane_config[0]:-}"
ca_certificate="${control_plane_config[1]:-}"
server_url="${server_url%/}"
if [[ "$server_url" != https://* || "$server_url" == *[[:space:]]* ]]; then
  echo "controlPlane.serverUrl must be a valid HTTPS URL to the church server." >&2
  exit 1
fi
if [[ "$ca_certificate" != /* || ! -s "$ca_certificate" ]]; then
  echo "controlPlane.caCertificatePath must point to an existing absolute CA certificate path." >&2
  exit 1
fi
if ! runuser -u "$receiver_user" -- test -r "$ca_certificate"; then
  echo "The CA certificate is not readable by '$receiver_user': $ca_certificate" >&2
  exit 1
fi
openssl x509 -in "$ca_certificate" -noout >/dev/null
if ! openssl x509 -in "$ca_certificate" -noout -ext basicConstraints 2>/dev/null | grep -q 'CA:TRUE'; then
  echo "The configured CA certificate must have CA:TRUE basic constraints." >&2
  exit 1
fi

# The server is installed first. Verify TLS trust, hostname, and API health
# now; after setup the receiver remains independent during server outages.
if ! health_response="$(curl --silent --show-error --fail --cacert "$ca_certificate" \
    --connect-timeout 3 --max-time 5 "$server_url/api/v1/health" 2>&1)" ||
   ! grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"' <<< "$health_response"; then
  echo "Could not verify the church server over HTTPS at $server_url." >&2
  echo "$health_response" >&2
  echo "Start the server first and confirm this receiver trusts its CA certificate." >&2
  exit 1
fi

# Do not replace the existing Veyra config or its pairing/device-token files.
# Only tighten the config's permissions so the receiver account can read it.
install -d -m 0755 /etc/veyra
chown "root:$gid" "$config"
chmod 0640 "$config"

# Keep a local backup of any prior LightDM override before replacing ours.
install -d -m 0755 /etc/lightdm/lightdm.conf.d
lightdm_config="/etc/lightdm/lightdm.conf.d/50-veyra-autologin.conf"
if [[ -L "$lightdm_config" ]]; then
  echo "Refusing to overwrite a symbolic link: $lightdm_config" >&2
  exit 1
fi
if [[ -f "$lightdm_config" ]]; then
  cp -a "$lightdm_config" "$lightdm_config.bak.$(date +%Y%m%d%H%M%S)"
fi
cat > "$lightdm_config" <<EOF
[Seat:*]
autologin-user=$receiver_user
autologin-user-timeout=0
autologin-session=xfce
user-session=xfce
EOF
chmod 0644 "$lightdm_config"

# Install root-owned helpers and a root-owned display preference. The display
# helper only applies 1920x1080 if the connected TV advertises that mode.
install -o root -g root -m 0755 "$display_helper" /usr/local/bin/veyra-display-setup
install -o root -g root -m 0755 "$session_helper" /usr/local/bin/veyra-session-start
if [[ -L /etc/veyra/display.conf ]]; then
  echo "Refusing to use a symbolic link for /etc/veyra/display.conf." >&2
  exit 1
fi
if [[ ! -e /etc/veyra/display.conf ]]; then
  printf '%s\n' '# Set to a mode advertised by the connected TV.' 'VEYRA_DISPLAY_MODE=1920x1080' > /etc/veyra/display.conf
fi
chown root:root /etc/veyra/display.conf
chmod 0644 /etc/veyra/display.conf

user_config="$home/.config"
unit_dir="$user_config/systemd/user"
autostart_dir="$user_config/autostart"
install -d -o "$receiver_user" -g "$gid" -m 0755 "$unit_dir" "$autostart_dir"

if [[ -L "$unit_dir/veyra.service" || -L "$autostart_dir/veyra.desktop" ]]; then
  echo "Refusing to overwrite a symbolic link in the receiver user's autostart configuration." >&2
  exit 1
fi
if [[ -f "$unit_dir/veyra.service" ]]; then
  cp -a "$unit_dir/veyra.service" "$unit_dir/veyra.service.bak.$(date +%Y%m%d%H%M%S)"
fi
if [[ -f "$autostart_dir/veyra.desktop" ]]; then
  cp -a "$autostart_dir/veyra.desktop" "$autostart_dir/veyra.desktop.bak.$(date +%Y%m%d%H%M%S)"
fi
install -o "$receiver_user" -g "$gid" -m 0644 "$unit_source" "$unit_dir/veyra.service"
install -o "$receiver_user" -g "$gid" -m 0644 "$desktop_source" "$autostart_dir/veyra.desktop"

usermod -aG video "$receiver_user"
if getent group render >/dev/null 2>&1; then
  usermod -aG render "$receiver_user"
fi

systemctl set-default graphical.target >/dev/null
systemctl enable lightdm.service >/dev/null

# A receiver is an unattended appliance: prevent system-wide suspend,
# hibernation, hybrid sleep, and suspend-then-hibernate. This is separate
# from X11 DPMS/screen blanking, which the XFCE session helper disables.
systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target suspend-then-hibernate.target >/dev/null
systemctl daemon-reload

echo
echo "Veyra unattended startup installed for '$receiver_user'."
echo "Display target: $(awk -F= '$1 == "VEYRA_DISPLAY_MODE" {print $2; exit}' /etc/veyra/display.conf)"
echo "System suspend, hibernation, hybrid sleep, and suspend-then-hibernate are masked."
echo "X11 screen blanking and DPMS are disabled at every XFCE login."
echo "Existing Veyra config, device token, cache, and NDI SDK were preserved."
echo "Reboot this receiver once to verify XFCE autologin and fullscreen startup."
