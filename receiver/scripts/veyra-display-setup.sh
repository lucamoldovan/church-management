#!/usr/bin/env bash
set -u

log_dir="${HOME:-/tmp}/.local/state/veyra"
mkdir -p "$log_dir" 2>/dev/null || true
log_file="$log_dir/display-setup.log"
exec >>"$log_file" 2>&1

echo
echo "===== Veyra display setup: $(date -Is 2>/dev/null || date) ====="

if ! command -v xrandr >/dev/null 2>&1; then
  echo "xrandr is unavailable; leaving the desktop display mode unchanged."
  exit 0
fi

config_file="${VEYRA_DISPLAY_CONFIG:-/etc/veyra/display.conf}"
target_mode="1920x1080"
if [[ -r "$config_file" ]]; then
  configured_mode="$(awk -F= '
    /^[[:space:]]*#/ { next }
    $1 == "VEYRA_DISPLAY_MODE" {
      value = substr($0, index($0, "=") + 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      print value
      exit
    }
  ' "$config_file")"
  if [[ -n "$configured_mode" ]]; then
    target_mode="$configured_mode"
  fi
fi

if [[ ! "$target_mode" =~ ^[0-9]{3,5}x[0-9]{3,5}$ ]]; then
  echo "Invalid VEYRA_DISPLAY_MODE '$target_mode'; leaving display mode unchanged."
  exit 0
fi

mapfile -t connected_outputs < <(xrandr --query 2>/dev/null | awk '$2 == "connected" { print $1 }')
if [[ "${#connected_outputs[@]}" -ne 1 ]]; then
  echo "Expected exactly one connected display, found ${#connected_outputs[@]}; leaving display mode unchanged."
  exit 0
fi

output="${connected_outputs[0]}"
if ! xrandr --query 2>/dev/null | awk -v output="$output" -v mode="$target_mode" '
  $2 == "connected" || $2 == "disconnected" { in_output = ($1 == output && $2 == "connected"); next }
  in_output && $1 == mode { found = 1 }
  END { exit !found }
'; then
  echo "Display '$output' does not advertise $target_mode; keeping its current preferred mode."
  exit 0
fi

if xrandr --output "$output" --mode "$target_mode"; then
  echo "Set display '$output' to $target_mode."
else
  echo "Could not set display '$output' to $target_mode; keeping the current mode."
fi

exit 0
