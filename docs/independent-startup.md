# Casa Painii — independent startup and recovery

This is the deployment runbook for the **currently installed** church LAN machines. It takes precedence over older generic receiver instructions in `docs/debian13-deployment.md`. It does not rebuild Veyra or replace existing device credentials.

## Installed machines

| Machine | LAN address | Existing Linux account | Veyra identity |
| --- | --- | --- | --- |
| Debian server | `192.168.0.67` | `server`; service account `churchops` | Casa Painii server |
| Main display Mac mini | `192.168.0.56` | `reciver1` | `Mac mini - Main Display` |
| Hallway display Mac mini | `192.168.0.64` | `reciver-2` | `Hallway Display` |

Keep these accounts and existing installations. In particular, do not create a new Linux account named `veyra`, do not replace the installed binary, and do not clear either receiver's device token.

## Intended behavior

- The server starts at boot through a system-level systemd unit. It does not need a user logged in or an SSH session.
- Each Mac mini automatically logs into its existing XFCE account through LightDM.
- XFCE configures the display and starts a per-user systemd service. The player runs fullscreen and restarts if it exits or crashes.
- Each receiver starts even if the server is temporarily offline. Veyra keeps its local player alive and retries the control-plane connection.
- Stopping one receiver does not stop the server or the other receiver.
- One-time setup commands are required. After setup and reboot verification, all services run in the background and SSH/terminal windows can be closed.

## 1. Server prerequisites

The application must already be built in `/opt/church-operations`:

- `server/dist/index.js`
- `dashboard/dist/index.html`
- `/opt/church-operations/.env`
- Node.js 22 or newer at `/usr/bin/node`
- Linux service account `churchops`

The service is sandboxed. The database, setup key, pairing secret, and media directory must all be under `/var/lib/church-operations/`. The service explicitly sets `HOME=/var/lib/church-operations/runtime-home`; this is intentionally separate from the database directory because the database layer rejects a database stored directly in the process HOME directory. Do not define a conflicting `HOME` variable in `.env`. The production `.env` must be readable by `churchops` but not by other users (normally `root:churchops`, mode `0640`).

## 2. HTTPS must be correct before startup

The control-plane API must use HTTPS on the LAN. Do not weaken the receiver's HTTPS validation or use plain HTTP to the server's LAN address.

For the current setup, the server certificate must include `192.168.0.67` in its Subject Alternative Name (IP SAN). The certificate must match its private key and validate against the local CA certificate. Keep the CA private key on the server/offline backup; only distribute the public CA certificate.

Set these installer values in `/opt/church-operations/.env`:

```dotenv
CHURCH_HOST=0.0.0.0
CHURCH_PORT=8787
CHURCH_TLS_CERT_PATH=/etc/church-operations/tls/server.crt
CHURCH_TLS_KEY_PATH=/etc/church-operations/tls/server.key
CHURCH_TLS_CA_CERT_PATH=/etc/church-operations/tls/ca.crt
CHURCH_TLS_EXPECTED_HOST=192.168.0.67
CHURCH_DASHBOARD_DIRECTORY=/opt/church-operations/dashboard/dist

VEYRA_DATABASE_PATH=/var/lib/church-operations/church.sqlite
VEYRA_SETUP_KEY_PATH=/var/lib/church-operations/setup-key
VEYRA_PAIRING_SECRET_PATH=/var/lib/church-operations/pairing-secret
VEYRA_MEDIA_DIRECTORY=/var/lib/church-operations/media
```

The `CHURCH_TLS_CA_CERT_PATH` and `CHURCH_TLS_EXPECTED_HOST` values are read by the deployment installer; the application itself ignores them. The installer validates the certificate/key pair, SAN, CA chain, service-account permissions, state paths, built files, and HTTPS health endpoint before reporting success.

If the local CA/certificate has not yet been created, follow section 3 of [the Debian deployment runbook](debian13-deployment.md), using the actual server IP `192.168.0.67` in the certificate SAN. Do not copy the CA private key to a receiver.

The TLS private key should be root-owned and readable by the `churchops` group only (normally `root:churchops`, mode `0640`). The `.env` file should also be restricted to root and `churchops`.

## 3. Enable the server

On the Debian server, use a checkout containing this branch. The installed application checkout may still be on `kasapini-dashboard-audit`; do not switch or overwrite that working tree just to obtain the installer. If the script is not already present, create a temporary Git worktree:

```bash
su -
git -C /opt/church-operations fetch origin fix/independent-autostart
git -C /opt/church-operations worktree add --detach /tmp/casa-painii-startup origin/fix/independent-autostart
cd /tmp/casa-painii-startup
bash deploy/enable-server-autostart.sh
git -C /opt/church-operations worktree remove /tmp/casa-painii-startup
exit
```

If the script is already present in the current checkout, run it there instead. The installer targets the existing `/opt/church-operations` deployment regardless of which checkout supplied the script. The fetch, temporary worktree, installer, and cleanup are all run as root because the production checkout under `/opt` is root-managed. The temporary worktree is removed before leaving the root shell.

The installer validates the current deployment and systemd unit, preserves a backup of an existing unit, enables and restarts the service, and waits for a verified HTTPS health response. It exits when the check is complete; systemd continues running the server in the background.

If it stops on a validation error, fix the reported issue first. Do not bypass TLS or filesystem checks.

Useful diagnostics:

```bash
su -
systemctl status church-operations --no-pager
journalctl -u church-operations -n 80 --no-pager
curl --cacert /etc/church-operations/tls/ca.crt https://192.168.0.67:8787/api/v1/health
exit
```

### Copy the public CA certificate to both receivers

The receiver must trust the server's local CA. On the server, create a public-only copy that the existing SSH account can read:

```bash
su -
install -o server -g "$(id -gn server)" -m 0644 \
  /etc/church-operations/tls/ca.crt /home/server/church-ca.crt
exit
```

On **each** Mac mini, copy that public certificate and install it at the path used in `/etc/veyra/config.json`:

```bash
scp server@192.168.0.67:/home/server/church-ca.crt /tmp/church-ca.crt
su -
install -o root -g root -m 0644 /tmp/church-ca.crt /etc/veyra/church-ca.crt
rm -f /tmp/church-ca.crt
exit
```

The CA certificate is public and safe to distribute. Never copy `ca.key` or `server.key` to a receiver.

Before running either receiver installer, merge these two values into the existing `/etc/veyra/config.json` on **both** Mac minis:

```json
{
  "controlPlane": {
    "serverUrl": "https://192.168.0.67:8787",
    "caCertificatePath": "/etc/veyra/church-ca.crt"
  }
}
```

This is only the relevant fragment; preserve all other existing settings, especially `deviceName`, `credentialPath`, `cachePath`, and the pairing/device-token data. The installer verifies this HTTPS endpoint using the copied CA before it changes startup configuration.

**Pairing check:** if the configured `credentialPath` already contains the receiver's device token, leave `pairingCode` empty. If the hallway receiver has never been paired (no token file), create a fresh code in the dashboard's **NDI screens** section and enter it as `controlPlane.pairingCode` before the first Veyra start. Once the receiver appears online and the token has been written, remove the one-time pairing code from the config and restart `veyra.service`. Do not delete an existing device-token file.

## 4. Configure the main receiver

On the main display Mac mini, use a checkout of this branch. If you do not already have the full repository, create a temporary checkout (this downloads setup scripts only; Veyra and its SDK are not rebuilt):

```bash
git clone --depth 1 --branch fix/independent-autostart https://github.com/lucamoldovan/church-management.git /tmp/casa-painii-startup
cd /tmp/casa-painii-startup
su -
cd /tmp/casa-painii-startup
bash receiver/install-autostart.sh reciver1
exit
rm -rf /tmp/casa-painii-startup
```

The receiver accounts are not guaranteed to have sudo access (the hallway account currently does not). Clone as the receiver user, enter a root shell with `su -`, then run the installer from the temporary checkout. The installer copies the required helpers and unit into system locations, so the temporary checkout is not needed for normal operation.

This configures LightDM autologin for the existing `reciver1` account, installs the display/session helpers, installs the user-level Veyra service and XFCE autostart entry, and adds the account to the required video groups. It does not replace `/usr/local/bin/veyra`, `/etc/veyra/config.json`, the device token, cache, or NDI SDK.

## 5. Configure the hallway receiver

On the hallway Mac mini, create its own temporary checkout if one is not already present (the main Mac mini's `/tmp` directory is separate):

```bash
git clone --depth 1 --branch fix/independent-autostart https://github.com/lucamoldovan/church-management.git /tmp/casa-painii-startup
cd /tmp/casa-painii-startup
su -
cd /tmp/casa-painii-startup
bash receiver/install-autostart.sh reciver-2
exit
rm -rf /tmp/casa-painii-startup
```

The temporary checkout can be deleted after installation. No GitHub connection is used by the receiver during normal startup or playback.

Use the existing `reciver-2` account. Do not create another receiver user. Apply the same HTTPS URL and public CA certificate settings described in the main receiver section.

## 6. Display mode

The installer creates `/etc/veyra/display.conf` with:

```ini
VEYRA_DISPLAY_MODE=1920x1080
```

At XFCE login, the helper checks the connected display's advertised modes. If exactly one display is connected and it advertises 1920×1080, the helper selects that mode before starting Veyra. It does not force an unsupported mode, guess between multiple connected displays, or invent a refresh rate. If the TV does not advertise the configured mode, it keeps the current mode and writes a diagnostic to:

```
~/.local/state/veyra/display-setup.log
```

If needed, edit `/etc/veyra/display.conf` as root and select a mode actually advertised by that TV. Veyra's `targetFps=30` is the target video frame rate; it is not a request to force the TV's refresh rate to 30 Hz.

## 7. HDMI signal / screen blanking troubleshooting

### Symptom

The TV reports **No HDMI Input** or loses the picture after the Mac mini has been left running, but the Mac mini still responds to ping/SSH and Veyra may still be running.

Do not immediately assume the whole Mac mini has suspended. Check the Linux host, graphical session, HDMI output and Veyra separately.

### Why it can happen

On the Main Display receiver, an SSH diagnostic found these X11 settings:

- X11 screen-saver timeout: `600` seconds (10 minutes).
- Screen blanking preference: enabled.
- DPMS: enabled.
- DPMS standby: `600` seconds (10 minutes).
- DPMS display-off: `900` seconds (15 minutes).

These settings can blank or power down the display output while Linux and Veyra remain running. This was observed on Main Display; check Hallway Display rather than assuming it has identical settings.

### Immediate, temporary recovery / prevention

Run as the existing receiver user (for example, `reciver1`) over SSH. Use the actual graphical X11 display and that user's Xauthority file:

```bash
export DISPLAY=:0
export XAUTHORITY=/home/reciver1/.Xauthority

xset s off
xset s noblank
xset -dpms

echo "===== VERIFY ====="
xset q
```

For Hallway Display, use:

```bash
export DISPLAY=:0
export XAUTHORITY=/home/reciver-2/.Xauthority

xset s off
xset s noblank
xset -dpms
xset q
```

Expected verification: screen-saver timeout is `0`, blanking is disabled, and `DPMS is Disabled`. This is a runtime change to the current X11 session only; it is not persistent across a reboot or graphical-session restart.

If the TV still reports no signal after disabling blanking/DPMS, inspect the HDMI connector and available modes:

```bash
export DISPLAY=:0
export XAUTHORITY=/home/reciver1/.Xauthority
xrandr --query
```

Use the matching home directory for the hallway receiver. Do not force a mode that is not listed by `xrandr`. Also inspect the TV's own Eco/Auto Power Off/HDMI-CEC settings and try reseating the HDMI cable or selecting the correct TV input if Linux reports the monitor disconnected.

### Check the graphical session from SSH

A plain SSH shell normally has no `DISPLAY` variable, so `xset q` or `xrandr --query` may report that they cannot open the display. This does not prove HDMI is disconnected. Find the XFCE environment and Xauthority path:

```bash
ps aux | grep -E 'xfce4-session|Xorg|lightdm' | grep -v grep
tr '\\0' '\\n' < /proc/$(pgrep -u "$USER" -x xfce4-session | head -n1)/environ | grep -E '^(DISPLAY|XAUTHORITY|XDG_SESSION_TYPE)='
```

For this installation, the expected display is usually `:0`, with Xauthority at `/home/RECEIVER_USER/.Xauthority`. Set `DISPLAY` and `XAUTHORITY` before running X11 diagnostics.

### Permanent behavior after the receiver autostart installer

The installed `/usr/local/bin/veyra-session-start` helper runs after XFCE creates the X11 session. It applies the display setup, imports the X11 environment into the user systemd manager, then runs:

```bash
xset s off
xset -dpms
xset s noblank
```

It then starts `veyra.service`. These X11 settings are therefore reapplied each time the XFCE session starts. The receiver installation must still be cold-boot tested on the physical TV.

The receiver installer also masks these systemd sleep targets system-wide: `sleep.target`, `suspend.target`, `hibernate.target`, `hybrid-sleep.target`, and `suspend-then-hibernate.target`. This prevents normal systemd suspend/hibernate transitions independently of X11 DPMS. Verify after installation with `systemctl is-enabled sleep.target suspend.target hibernate.target hybrid-sleep.target suspend-then-hibernate.target` (each should report `masked`). The installer makes this change at the system level because these machines are dedicated receivers. To deliberately restore normal sleep behavior in the future, run as root: `systemctl unmask sleep.target suspend.target hibernate.target hybrid-sleep.target suspend-then-hibernate.target` and review desktop power settings. Do not unmask them for unattended receiver operation.

### Veyra CPU usage is a separate diagnostic

During the Main Display investigation, Veyra was observed using approximately 125% CPU while still running. This is not proof that Veyra caused the HDMI loss. If unusually high CPU usage continues, record it and inspect Veyra logs/process state separately; do not kill or restart the receiver merely because the TV has lost signal.

## 8. Cold-boot acceptance test

Do not mark the setup complete until all checks pass:

1. Reboot the server with no SSH session open. Confirm it starts automatically and the HTTPS health endpoint returns `status: ok`.
2. Reboot the main Mac mini without keyboard interaction. Confirm LightDM logs into `reciver1`, Veyra opens fullscreen, and the device appears online.
3. Reboot the hallway Mac mini without keyboard interaction. Confirm LightDM logs into `reciver-2`, Veyra opens fullscreen, and the device appears online.
4. Close all SSH sessions and terminal windows. Confirm all three machines continue operating.
5. Temporarily stop the server service. Confirm both receiver processes remain running; restart the server and confirm they reconnect.
6. Stop Veyra on one receiver. Confirm its user service restarts it and the other receiver remains unaffected.
7. Confirm each TV stays awake and uses the intended resolution after a cold boot.
8. In the dashboard, assign the intended discovered ProPresenter NDI source to each receiver. Run the real feed to both displays and leave it running for at least 30 minutes. Confirm stable video, the correct source on each TV, no unexpected scaling, and no loss of source.

A passing GitHub build, an active systemd unit, or a successful API health check does not prove HDMI output or real NDI playback. Both physical receivers must pass the cold-boot and live-feed checks.

## 9. Receiver diagnostics

Run these only when troubleshooting; no terminal needs to remain open during normal operation.

```bash
systemctl --user status veyra.service --no-pager
journalctl --user -u veyra.service -n 80 --no-pager
cat ~/.local/state/veyra/display-setup.log
xrandr --query
```

Server diagnostics:

```bash
su -
systemctl status church-operations --no-pager
journalctl -u church-operations -n 80 --no-pager
exit
```
