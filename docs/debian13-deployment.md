# Casa Painii — Debian 13 deployment runbook

> **Scope:** This is a clean-install/bootstrap reference for a new Debian deployment. For the already-installed Casa Painii server and the two existing Mac mini receivers, use [docs/independent-startup.md](independent-startup.md). Do not create a new `veyra` Linux account or apply the legacy receiver setup to the existing machines.

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

The application and CI target Node.js 22 or newer. Install Node.js 22 from NodeSource (the Debian 13 archive may provide an older major version):

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version
npm --version
```

The Node version must report 22.x or newer.

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
# This branch currently has no committed package-lock.json. npm install
# resolves the workspace dependencies and creates one on this server.
npm install --no-audit --no-fund
sudo npm run build
sudo npm test
```

The first install uses npm install because this branch does not yet commit a package-lock.json; this creates /opt/church-operations/package-lock.json on the server. For later deployments on this same checkout, use npm ci after preserving that generated lockfile. The GitHub Actions workflow also uses npm install until a lockfile is committed. A successful CI build does not replace the physical NDI receiver test described below.

Create private writable state:

```bash
sudo install -d -o churchops -g churchops -m 0700 /var/lib/church-operations
sudo install -d -o churchops -g churchops -m 0700 /var/lib/church-operations/media
sudo install -d -o churchops -g churchops -m 0700 /var/lib/church-operations/backups
```

## 3. Create a local TLS certificate

Choose the server's reserved IP. This example uses `192.168.0.67`; replace it with the real address. Avahi should make `church-server.local` resolve on the same LAN.

```bash
sudo install -d -m 0700 /root/church-local-ca
sudo install -d -m 0750 -o root -g churchops /etc/church-operations/tls

sudo openssl genrsa -out /root/church-local-ca/ca.key 4096
sudo openssl req -x509 -new -nodes \
  -key /root/church-local-ca/ca.key \
  -sha256 -days 3650 \
  -out /etc/church-operations/tls/ca.crt \
  -subj "/CN=Casa Painii Local CA" \
  -addext "basicConstraints=critical,CA:TRUE" \
  -addext "keyUsage=critical,keyCertSign,cRLSign" \
  -addext "subjectKeyIdentifier=hash"

sudo openssl req -new -newkey rsa:3072 -nodes \
  -keyout /etc/church-operations/tls/server.key \
  -out /root/church-local-ca/server.csr \
  -subj "/CN=church-server.local"

sudo tee /root/church-local-ca/server.ext >/dev/null <<'EOF'
[v3_server]
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=@alt_names
[alt_names]
DNS.1=church-server.local
IP.1=192.168.0.67
EOF

sudo openssl x509 -req -in /root/church-local-ca/server.csr \
  -CA /etc/church-operations/tls/ca.crt \
  -CAkey /root/church-local-ca/ca.key \
  -CAcreateserial -out /etc/church-operations/tls/server.crt \
  -days 825 -sha256 -extfile /root/church-local-ca/server.ext -extensions v3_server

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
CHURCH_TLS_CA_CERT_PATH=/etc/church-operations/tls/ca.crt
CHURCH_TLS_EXPECTED_HOST=192.168.0.67
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

Keep the Planning Center credentials server-side. Never put them in dashboard code, receiver config, Git, screenshots or chat messages. Set `PROPRESENTER_URL` to the ProPresenter computer's actual address and port, e.g. `http://192.168.0.50:1025`; do not assume the example port is yours.

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
sudo ufw allow from 192.168.0.0/22 to any port 22 proto tcp
sudo ufw allow from 192.168.0.0/22 to any port 8787 proto tcp
sudo ufw allow from 192.168.0.0/22 to any port 445 proto tcp
sudo ufw allow from 192.168.0.0/22 to any port 5353 proto udp
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

Run the application's backup script after initial setup. The destination must be on a second physical disk mounted at `/srv/backups` (create and mount it first):

```bash
sudo install -d -o churchops -g churchops -m 0700 /srv/backups/church-operations
sudo -u churchops bash -lc 'set -a; . /opt/church-operations/.env; set +a; cd /opt/church-operations; npm run backup --workspace @church-ops/server -- /srv/backups/church-operations'
```

The script backs up the SQLite database, Veyra pairing secret and media directory together. Separately keep an encrypted/offline copy of `/opt/church-operations/.env`, `/etc/church-operations/tls/`, and `/root/church-local-ca/ca.key`; the script intentionally does not copy those secrets into the media backup. Test restoring a backup before relying on it.

RAID is not a backup. Back up the database, media directory, pairing secret, TLS CA and private key, and the application environment to a second physical device. Test restoring a backup before relying on it.

## 9. Existing Casa Painii receiver installations

For the currently installed machines and existing Linux accounts (`reciver1` and `reciver-2`), do not follow the older dedicated-`veyra`-user setup below. Use the maintained, machine-specific runbook instead:

- [Independent startup and recovery](independent-startup.md)

That guide preserves the installed Veyra binaries, receiver configs, device tokens, caches, NDI SDK, and existing users. It also documents the current server IP and the verified startup sequence.

The remaining clean-room build and hardware acceptance instructions in this older guide are intentionally not duplicated here. A full NDI SDK build and real TV test are still required for a brand-new receiver installation; the automatic-startup installer does not perform or claim those tests.
