# Church Operations — Debian 13 deployment runbook

This is the deployment path for the `local-operations-platform` branch. It keeps the central server headless and runs the NDI receiver as a separate native process on each display computer.

## 0. Important boundaries

- Deploy this branch, not `main` and not a Cloudflare migration branch.
- The central server does not decode or render NDI video.
- The receiver runs on the display computer and keeps playing through a temporary server outage.
- The server must use HTTPS on the LAN because receiver credentials are bearer credentials.
- Do not format a disk until its model, size, contents and mount points have been checked.
- Do not expose port 8787, SMB or ProPresenter's API to the public internet.

## 1. Server OS and packages

Install Debian 13 amd64 with no desktop environment. Set the hostname to `church-server`. Give it a DHCP reservation in the church router; use the actual reserved address throughout this guide.

Install:

```bash
sudo apt update
sudo apt full-upgrade -y
sudo apt install -y git curl ca-certificates openssl   build-essential python3 make g++   avahi-daemon avahi-utils   samba smbclient   ufw fail2ban smartmontools   openssh-server
sudo systemctl enable --now ssh avahi-daemon
```

The application requires Node.js 22 or newer. Install a supported Node.js LTS release (Node 22 or newer), then verify:

```bash
node --version
npm --version
```

Do not use Debian's Node package if it reports a version below 22.

## 2. Create the service account and checkout

```bash
sudo useradd --system --create-home --home-dir /var/lib/church-operations \
  --shell /usr/sbin/nologin churchops
sudo mkdir -p /opt/church-operations /var/lib/church-operations
sudo chown root:root /opt/church-operations
sudo chmod 755 /opt/church-operations

sudo git clone --branch local-operations-platform --single-branch \
  https://github.com/lucamoldovan/church-management.git \
  /opt/church-operations
cd /opt/church-operations
sudo npm ci
sudo npm run build
sudo npm test
```

The current GitHub Actions workflow for this branch has passed the dashboard/API build and API tests. That does not replace the physical NDI receiver test described below.

Create private writable state:

```bash
sudo install -d -o churchops -g churchops -m 0700 /var/lib/church-operations
sudo install -d -o churchops -g churchops -m 0700 /var/lib/church-operations/media
sudo install -d -o churchops -g churchops -m 0700 /var/lib/church-operations/backups
```

## 3. Create a local TLS certificate

Choose the server's reserved IP. This example uses `192.168.1.10`; replace it with the real address. Avahi should make `church-server.local` resolve on the same LAN.

```bash
sudo install -d -m 0700 /root/church-local-ca
sudo install -d -m 0750 -o root -g churchops /etc/church-operations/tls

sudo openssl genrsa -out /root/church-local-ca/ca.key 4096
sudo openssl req -x509 -new -nodes \
  -key /root/church-local-ca/ca.key \
  -sha256 -days 3650 \
  -out /etc/church-operations/tls/ca.crt \
  -subj "/CN=Church Operations Local CA"

sudo openssl req -new -newkey rsa:3072 -nodes \
  -keyout /etc/church-operations/tls/server.key \
  -out /root/church-local-ca/server.csr \
  -subj "/CN=church-server.local"

sudo tee /root/church-local-ca/server.ext >/dev/null <<'EOF'
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=@alt_names
[alt_names]
DNS.1=church-server.local
IP.1=192.168.1.10
EOF

sudo openssl x509 -req -in /root/church-local-ca/server.csr \
  -CA /etc/church-operations/tls/ca.crt \
  -CAkey /root/church-local-ca/ca.key \
  -CAcreateserial -out /etc/church-operations/tls/server.crt \
  -days 825 -sha256 -extfile /root/church-local-ca/server.ext

sudo chown root:churchops /etc/church-operations/tls/server.key
sudo chmod 0640 /etc/church-operations/tls/server.key
sudo chmod 0644 /etc/church-operations/tls/server.crt /etc/church-operations/tls/ca.crt
```

If you use a different address, update `IP.1` before signing. The CA private key stays root-only; back it up securely offline. Copy only `ca.crt` to trusted client devices. Import that CA certificate into staff computers/phones and the NDI receiver. Never copy `ca.key` to a client.

## 4. Configure the application

Create `/opt/church-operations/.env` from the example:

```bash
cd /opt/church-operations
sudo cp .env.example .env
sudo chown root:churchops .env
sudo chmod 0640 .env
sudo nano .env
```

Set at least:

```dotenv
CHURCH_HOST=0.0.0.0
CHURCH_PORT=8787
CHURCH_TLS_CERT_PATH=/etc/church-operations/tls/server.crt
CHURCH_TLS_KEY_PATH=/etc/church-operations/tls/server.key
CHURCH_DASHBOARD_DIRECTORY=/opt/church-operations/dashboard/dist
VEYRA_COOKIE_SECURE=true
VEYRA_DATABASE_PATH=/var/lib/church-operations/church.sqlite
VEYRA_SETUP_KEY_PATH=/var/lib/church-operations/setup-key
VEYRA_PAIRING_SECRET_PATH=/var/lib/church-operations/pairing-secret
VEYRA_MEDIA_DIRECTORY=/var/lib/church-operations/media

# Fill these in only after completing the relevant integration setup.
PLANNING_CENTER_APP_ID=
PLANNING_CENTER_SECRET=
PROPRESENTER_URL=
```

Keep the Planning Center credentials server-side. Never put them in dashboard code, receiver config, Git, screenshots or chat messages. Set `PROPRESENTER_URL` to the ProPresenter computer's actual address and port, e.g. `http://192.168.1.50:1025`; do not assume the example port is yours.

## 5. Install the server systemd unit

Copy `deploy/church-operations.service` to `/etc/systemd/system/`, then:

```bash
sudo cp deploy/church-operations.service /etc/systemd/system/church-operations.service
sudo systemctl daemon-reload
sudo systemctl enable --now church-operations
sudo systemctl status church-operations --no-pager
sudo journalctl -u church-operations -n 100 --no-pager
```

Check the local API from the server:

```bash
curl --cacert /etc/church-operations/tls/ca.crt \
  https://church-server.local:8787/api/v1/health
```

The response should report `status: ok`. Open `https://church-server.local:8787` from a staff computer after importing the CA certificate. The first-run setup key is printed in the service log and also stored in `/var/lib/church-operations/setup-key` until initial setup succeeds. Use it once to create the first administrator.

## 6. Firewall

Replace the subnet with the actual church LAN. Example:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from 192.168.1.0/24 to any port 22 proto tcp
sudo ufw allow from 192.168.1.0/24 to any port 8787 proto tcp
sudo ufw allow from 192.168.1.0/24 to any port 445 proto tcp
sudo ufw allow from 192.168.1.0/24 to any port 5353 proto udp
sudo ufw enable
sudo ufw status verbose
```

Only enable Samba shares after configuring their users and permissions. Keep the server, ProPresenter computer and NDI receivers on the same trusted wired LAN initially. Allow mDNS between NDI senders and receivers; do not put them on guest Wi-Fi or an isolated VLAN.

## 7. Planning Center setup

For a single church, create a Personal Access Token from the Planning Center developer account using a user who can view Services plans. Copy its client ID and secret into the two `PLANNING_CENTER_*` environment variables, restart the service, then open **Services** in the dashboard. The status indicator should show connected; use **Sync services** as an administrator.

The current integration imports future Services plans and their ordered items into the local SQLite database. It is not a People, Groups, Check-Ins, Giving or volunteer scheduling sync. Read `docs/propresenter-setup.md` for the separate ProPresenter connection.

After changing `.env`:

```bash
sudo systemctl restart church-operations
sudo journalctl -u church-operations -n 50 --no-pager
```

## 8. Shared storage

Use a separate data disk for SMB shares. First inspect it:

```bash
lsblk -o NAME,SIZE,MODEL,SERIAL,FSTYPE,MOUNTPOINTS
sudo blkid
```

Only after positively identifying an empty/approved disk should it be partitioned and formatted. Mount it by UUID under `/srv/storage` using `/etc/fstab`. Do not put the application's private SQLite database or pairing secret inside a broadly writable SMB share. Keep application state under `/var/lib/church-operations`; share general church documents and media separately with Samba groups.

Configure Samba only after the disk is mounted and the directories are created. Example for two staff shares:

```bash
sudo groupadd church-staff
sudo groupadd church-media
sudo install -d -o root -g church-staff -m 2770 /srv/storage/General
sudo install -d -o root -g church-media -m 2770 /srv/storage/Media
sudo usermod -aG church-staff <linux-user>
sudo usermod -aG church-media <media-user>
sudo smbpasswd -a <linux-user>
sudo smbpasswd -a <media-user>
sudo nano /etc/samba/smb.conf
```

Add these share definitions (keep the existing `[global]` section and set `security = user`, `server min protocol = SMB2`, and `map to guest = never` there):

```ini
[General]
   path = /srv/storage/General
   browseable = yes
   read only = no
   valid users = @church-staff
   force group = church-staff
   create mask = 0660
   directory mask = 2770

[Media]
   path = /srv/storage/Media
   browseable = yes
   read only = no
   valid users = @church-media
   force group = church-media
   create mask = 0660
   directory mask = 2770
```

Then validate and start Samba:

```bash
sudo testparm
sudo systemctl enable --now smbd
sudo systemctl restart smbd
```

Create a matching Linux account before adding its Samba password. After changing group membership, users must sign out and back in. The private SQLite database, pairing secret and Veyra media directory must not be placed in these general-purpose shares.

RAID is not a backup. Back up the database, media directory, pairing secret, TLS CA and private key, and the application environment to a second physical device. Test restoring a backup before relying on it.

## 9. NDI receiver — separate display computer

The receiver target documented in this project is a Late-2014 Intel Mac mini running Debian 13 x86_64 with XFCE/X11. The server itself does not need the NDI SDK if it is not displaying NDI video.

On the receiver computer:

```bash
sudo apt update
sudo apt install -y build-essential cmake ninja-build pkg-config git \
  libsdl2-dev libsdl2-image-dev libcurl4-openssl-dev libssl-dev \
  libspdlog-dev nlohmann-json3-dev avahi-daemon avahi-utils \
  x11-xserver-utils
sudo systemctl enable --now avahi-daemon
```

Download the official NDI SDK for Linux from https://ndi.video/for-developers/ndi-sdk/download/ and install it according to its license and instructions. Do not commit SDK files to Git. The repository CMake project expects the SDK directory via `NDI_SDK_DIR`. Pin the already-tested NDI 6 SDK version for the first deployment rather than introducing a just-released SDK update immediately before the service.

Copy the church CA certificate to the receiver, for example `/etc/veyra/church-ca.crt`, and ensure the receiver user can read it.

Build the receiver from this repository branch:

```bash
git clone --branch local-operations-platform --single-branch \
  https://github.com/lucamoldovan/church-management.git
cd church-management
cmake -S receiver -B receiver/build -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DVEYRA_BUILD_PLAYER=ON \
  -DVEYRA_BUILD_TESTS=ON \
  -DNDI_SDK_DIR=/absolute/path/to/installed/ndi-sdk
cmake --build receiver/build --parallel
ctest --test-dir receiver/build --output-on-failure
sudo cmake --install receiver/build --prefix /usr/local
ldd /usr/local/bin/veyra
```

There must be no `not found` entries from `ldd`. If CMake or linking fails, keep the complete output; do not patch SDK headers or guess symbol names.

Create the config:

```bash
sudo install -d -m 0755 /etc/veyra
sudo install -m 0640 receiver/config/receiver.example.json /etc/veyra/config.json
sudo chown root:veyra /etc/veyra/config.json
sudo nano /etc/veyra/config.json
```

Set `controlPlane.serverUrl` to `https://church-server.local:8787`, `deviceName` to a clear display name, `caCertificatePath` to `/etc/veyra/church-ca.crt`, and keep fullscreen enabled. Leave the source unassigned until the receiver reports discovered sources in the dashboard. Keep the pairing code empty until you create a fresh one in **NDI screens**.

Create a dedicated desktop user (the graphical autologin account) and group before applying the ownership above:

```bash
sudo adduser veyra
sudo usermod -aG video,render veyra
sudo apt install -y xfce4 lightdm
sudo install -d -m 0755 /etc/lightdm/lightdm.conf.d
sudo tee /etc/lightdm/lightdm.conf.d/50-veyra-autologin.conf >/dev/null <<'EOF'
[Seat:*]
autologin-user=veyra
autologin-user-timeout=0
user-session=xfce
EOF
sudo systemctl enable lightdm
sudo install -d -o root -g veyra -m 0755 /etc/veyra
sudo install -o root -g veyra -m 0644 /path/to/church-ca.crt /etc/veyra/church-ca.crt
```

Pair only one receiver at a time. Enter the 12-digit code in its config, start Veyra, wait for successful pairing, then remove the pairing code from the config and restart the receiver. Its device token is stored separately under the receiver user's state directory.

## 10. XFCE automatic startup and fullscreen

Install the user service and autostart entry from this repository:

```bash
mkdir -p ~/.config/systemd/user ~/.config/autostart
cp receiver/systemd/church-receiver.service ~/.config/systemd/user/veyra.service
cp receiver/autostart/veyra.desktop ~/.config/autostart/veyra.desktop
systemctl --user daemon-reload
```

Enable XFCE autologin for the dedicated receiver user on the display computer. The desktop autostart entry imports the actual X11 session's `DISPLAY` and `XAUTHORITY`, disables screen blanking/DPMS, and starts the receiver only after the graphical session exists. Do not enable the user service against `default.target` separately; the XDG autostart entry is the session-aware trigger.

After login:

```bash
systemctl --user status veyra.service
journalctl --user -u veyra.service -f
```

The receiver creates an SDL desktop-fullscreen window, preserves video/image aspect ratio, and letterboxes rather than stretching. Its display mode is the desktop mode selected by XFCE/ the monitor; set the desired resolution and refresh rate in XFCE Display settings. Use a single display on the receiver for the first deployment.

## 11. Tomorrow's acceptance test

Do these in order, on the actual church LAN:

1. Reboot the receiver computer and confirm it logs into XFCE and opens Veyra fullscreen without a keyboard/mouse.
2. Start an NDI sender on the same wired LAN and run `/usr/local/bin/veyra --list-sources`; wait several seconds for discovery to populate.
3. Pair the receiver and confirm it appears online in **NDI screens**.
4. Confirm the source appears in **NDI sources**; assign the exact source to the receiver and save.
5. Confirm 1080p30 video appears, fills the display without stretching, and remains stable for at least 30 minutes.
6. Upload two test images, create a playlist, assign it to the receiver, and confirm the receiver downloads and verifies the fallback manifest.
7. Stop the NDI sender; confirm timed fallback images appear. Restart the sender; confirm NDI resumes.
8. Stop the central server while NDI is playing; confirm video continues. While the server remains stopped, stop the NDI sender and confirm the cached fallback still works.
9. Restart the server, change the playlist, and confirm the receiver applies the new cache only after successful sync.
10. Reboot the receiver once more and confirm the complete automatic startup sequence.

Do not call the system production-ready if any of steps 1–9 fail. A successful GitHub build is not proof of real NDI reception or 24-hour stability.
