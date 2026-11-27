#!/usr/bin/env bash
set -u

# This runs from XFCE after the X11 session exists. Keep all work synchronous
# so the display mode is applied before the fullscreen player is started.

/usr/local/bin/veyra-display-setup || true

if [[ -z "${DISPLAY:-}" ]]; then
  echo "Veyra session startup: DISPLAY is not set; refusing to start a fullscreen player outside X11." >&2
  exit 1
fi

if ! systemctl --user show-environment >/dev/null 2>&1; then
  echo "Veyra session startup: user systemd manager is not available." >&2
  exit 1
fi

systemctl --user daemon-reload
systemctl --user import-environment DISPLAY
if [[ -n "${XAUTHORITY:-}" ]]; then
  systemctl --user set-environment "XAUTHORITY=$XAUTHORITY"
else
  systemctl --user unset-environment XAUTHORITY >/dev/null 2>&1 || true
fi

xset s off >/dev/null 2>&1 || true
xset -dpms >/dev/null 2>&1 || true
xset s noblank >/dev/null 2>&1 || true

exec systemctl --user start veyra.service
