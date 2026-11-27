# Casa Painii — independent startup (private LAN HTTP)

This runbook configures the existing Debian server and two existing Debian XFCE/Veyra receivers to start independently after power-on. It does not reinstall Debian, rebuild Veyra, replace the NDI SDK, or delete pairing credentials.

## Network and security choice

This installation uses plain HTTP on the private church LAN:
- Server/dashboard: `http://192.168.0.67:8787`
- Health endpoint: `http://192.168.0.67:8787/api/v1/health`

HTTP is unencrypted. Use only on a trusted LAN, do not forward TCP port 8787 or SSH from the internet, and do not expose this service publicly. The server explicitly opts in through `CHURCH_ALLOW_INSECURE_HTTP=true` in its systemd unit. HTTPS remains supported if certificates are configured, but certificates are not required for this deployment.

## Existing machines

| Machine | LAN address | Existing Linux account |
| --- | --- | --- |
| Debian server | `192.168.0.67` | `server`; service account `churchops` |
| Main display Mac mini | `192.168.0.56` | `reciver1` |
| Hallway display Mac mini | `192.168.0.64` | `reciver-2` |

Keep these accounts and existing installations. Do not rebuild or replace `/usr/local/bin/veyra`, the NDI SDK, or receiver token/cache files.

## 1. Server startup

The server installer validates the existing built application and state paths, installs the systemd unit, restarts it, checks the local HTTP health endpoint, and enables boot startup. It does not delete or rewrite the SQLite database, pairing secret, setup key, or media.

Run on the Debian server as root, from a checkout of this branch:

```bash
cd /path/to/church-management
bash deploy/enable-server-autostart.sh
```

The installer expects the existing production deployment at `/opt/church-operations`, Node 22+ at `/usr/bin/node`, the `churchops` account, and the already-built dashboard/API. The mutable state paths configured by `VEYRA_DATABASE_PATH`, `VEYRA_SETUP_KEY_PATH`, `VEYRA_PAIRING_SECRET_PATH`, and `VEYRA_MEDIA_DIRECTORY` must resolve beneath `/var/lib/church-operations/`.

The unit sets a dedicated runtime HOME at `/var/lib/church-operations/runtime-home` and allows HTTP for this LAN deployment. Existing `.env` permissions are not changed; systemd reads the EnvironmentFile as root and the service account must be able to read it.

Check the result:

```bash
systemctl is-enabled church-operations
systemctl is-active church-operations
curl -fsS http://127.0.0.1:8787/api/v1/health
```

## 2. Receiver configuration

The receiver installer supports an existing config at either:
- `/etc/veyra/config.json`, or
- `/home/RECEIVER_USER/.config/veyra/config.json`

If the config exists only in the user's home, the installer copies it to `/etc/veyra/config.json` while preserving its JSON contents and referenced token/cache paths. It does not generate a new pairing token or overwrite the original home config.

Before running the installer, confirm the existing config's `controlPlane.serverUrl` is:

```json
{
  "controlPlane": {
    "serverUrl": "http://192.168.0.67:8787"
  }
}
```

This is the relevant fragment only. Preserve the rest of the existing JSON, including `deviceName`, `credentialPath`, `cachePath`, and any pairing settings. Remove any obsolete `caCertificatePath` entry if present; it is not needed for HTTP. Do not delete the device-token file.

The installer checks the HTTP health endpoint before making startup changes. HTTPS URLs remain accepted when a readable CA certificate is configured.

## 3. Install receiver startup

On each Mac mini, obtain this branch's scripts (a temporary clone is sufficient):

```bash
git clone --depth 1 --branch fix/independent-autostart-http https://github.com/lucamoldovan/church-management.git /tmp/casa-painii-startup
```

On Main Display, run as root:

```bash
bash /tmp/casa-painii-startup/receiver/install-autostart.sh reciver1
```

On Hallway Display, run as root:

```bash
bash /tmp/casa-painii-startup/receiver/install-autostart.sh reciver-2
```

The receiver users may not have sudo access. Clone as the receiver user, then enter root using `su -` and run the installer. Remove the temporary checkout after installation if desired.

The installer:
- configures LightDM autologin for the existing XFCE account;
- installs a supervised per-user systemd service that restarts Veyra if it exits;
- installs an XFCE session helper that disables X11 screen blanking and DPMS;
- selects 1920×1080 only if the connected TV advertises that mode;
- prevents system suspend/hibernate on these dedicated receiver machines;
- preserves the installed Veyra binary, existing config, token/cache paths and NDI SDK.

It does not start Veyra until the next XFCE login/reboot. Reboot one receiver at a time and verify it before proceeding to the other.

## 4. Display and HDMI troubleshooting

The display helper defaults to `VEYRA_DISPLAY_MODE=1920x1080` in `/etc/veyra/display.conf`. It only selects that mode when exactly one display is connected and the TV advertises it. Otherwise it leaves the current mode unchanged and logs to `~/.local/state/veyra/display-setup.log`.

For temporary X11 diagnostics over SSH, use the correct receiver account:

```bash
export DISPLAY=:0
export XAUTHORITY=/home/reciver1/.Xauthority
xset q
xrandr --query
```

For Hallway Display, use `/home/reciver-2/.Xauthority`. A plain SSH shell usually has no DISPLAY, so set both variables before running X11 commands.

The XFCE session helper reapplies:
```bash
xset s off
xset -dpms
xset s noblank
```

## 5. Acceptance test

Do not consider the work complete until these physical checks pass:

1. Reboot the server with no SSH session open; confirm the service is active and the HTTP health endpoint returns `status: ok`.
2. Reboot Main Display; confirm XFCE autologin, fullscreen Veyra, and online receiver status.
3. Reboot Hallway Display; confirm the same behavior.
4. Close all SSH sessions and terminals; confirm all machines continue operating.
5. Temporarily stop and restart the server; verify receivers remain running and reconnect afterward.
6. Stop Veyra on one receiver; verify its user service restarts it and the other receiver is unaffected.
7. Run the real ProPresenter NDI feed to each TV for at least 30 minutes and confirm stable picture, correct source, and intended scaling.

A passing CI run or HTTP health check cannot prove physical HDMI output or real NDI playback. Both receivers must pass the cold-boot and live-feed checks.
