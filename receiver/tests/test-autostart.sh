#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
helper="$repo_root/receiver/scripts/veyra-display-setup.sh"
temporary="$(mktemp -d)"
trap 'rm -rf "$temporary"' EXIT

mkdir -p "$temporary/bin" "$temporary/home"
cat > "$temporary/bin/xrandr" <<'MOCK'
#!/usr/bin/env bash
if [[ "$1" == "--query" ]]; then
  printf '%s\n' "$MOCK_XRANDR_OUTPUT"
  exit 0
fi
printf '%s\n' "$*" >> "$MOCK_XRANDR_CAPTURE"
exit 0
MOCK
chmod +x "$temporary/bin/xrandr"

export HOME="$temporary/home"
export PATH="$temporary/bin:$PATH"
export VEYRA_DISPLAY_CONFIG="$temporary/display.conf"
export MOCK_XRANDR_CAPTURE="$temporary/xrandr-calls"

cat > "$VEYRA_DISPLAY_CONFIG" <<'EOF'
VEYRA_DISPLAY_MODE=1920x1080
EOF

export MOCK_XRANDR_OUTPUT=$'Screen 0: minimum 320 x 200, current 4096 x 2160\nHDMI-1 connected primary 4096x2160+0+0\n   4096x2160 24.00*\n   1920x1080 60.00'
"$helper"
grep -Fx -- '--output HDMI-1 --mode 1920x1080' "$MOCK_XRANDR_CAPTURE" >/dev/null

: > "$MOCK_XRANDR_CAPTURE"
export MOCK_XRANDR_OUTPUT=$'Screen 0: minimum 320 x 200\nHDMI-1 connected primary 4096x2160+0+0\n   4096x2160 24.00*'
"$helper"
if [[ -s "$MOCK_XRANDR_CAPTURE" ]]; then
  echo "The helper attempted to set a mode that the display does not advertise." >&2
  exit 1
fi

export MOCK_XRANDR_OUTPUT=$'Screen 0: minimum 320 x 200\nHDMI-1 connected primary 1920x1080+0+0\n   1920x1080 60.00\nDP-1 connected 1920x1080+1920+0\n   1920x1080 60.00'
"$helper"
if [[ -s "$MOCK_XRANDR_CAPTURE" ]]; then
  echo "The helper guessed a display despite multiple connected outputs." >&2
  exit 1
fi

export MOCK_XRANDR_OUTPUT=$'Screen 0: minimum 320 x 200\nHDMI-1 connected primary 4096x2160+0+0\n   4096x2160 24.00*\nDP-1 disconnected\n   1920x1080 60.00'
"$helper"
if [[ -s "$MOCK_XRANDR_CAPTURE" ]]; then
  echo "The helper accepted a mode advertised only by a disconnected output." >&2
  exit 1
fi

: > "$MOCK_XRANDR_CAPTURE"
echo "Veyra display setup tests passed."
