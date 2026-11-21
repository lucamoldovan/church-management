# Mac mini receiver validation

This is the first-hardware checklist for the Late-2014 Mac mini target. It is deliberately a validation procedure, not a claim that the player has already been tested on that hardware.

## Target

- Apple Mac mini (Late 2014), Macmini7,1
- Intel Core i5-4278U, Intel Iris 5100, 8 GB RAM
- Debian 13 x86_64 with XFCE/X11
- Initial output target: 1920×1080 at 30 FPS
- Wired Ethernet strongly preferred

## 1. Verify the operating system and display

```bash
uname -a
cat /etc/os-release
lscpu
free -h
lspci -nnk | grep -A3 -E 'VGA|Display'
xrandr --query
```

Confirm that the Intel graphics driver is loaded and that the display exposes 1920×1080. Do not force a display mode until the monitor and cable are known to support it.

## 2. Install build and runtime dependencies

```bash
sudo apt update
sudo apt install --yes \
  build-essential cmake ninja-build pkg-config git \
  libsdl2-dev libsdl2-image-dev libcurl4-openssl-dev libssl-dev libspdlog-dev nlohmann-json3-dev \
  avahi-daemon curl ca-certificates
sudo systemctl enable --now avahi-daemon
```

Install the official NDI SDK for Linux separately, following its license and installation instructions. Do not commit SDK headers, libraries, or redistributable files to this repository unless the SDK license explicitly permits it.

Record the installed SDK version and installation directory. Keep the SDK directory path handy for CMake.

## 3. Get the Veyra source

```bash
git clone https://github.com/lucamoldovan/veyra.git
cd veyra
git rev-parse --short HEAD
```

Record the commit SHA used for the test so results can be tied to an exact build.

## 4. Run SDK-independent tests first

These tests do not need the NDI SDK or a display:

```bash
cmake -S . -B build-tests -G Ninja \
  -DVEYRA_BUILD_PLAYER=OFF \
  -DVEYRA_BUILD_TESTS=ON
cmake --build build-tests --parallel
ctest --test-dir build-tests --output-on-failure
```

Do not continue if these tests fail.

## 5. Build the complete receiver against the installed NDI SDK

```bash
cmake -S . -B build -G Ninja \
  -DVEYRA_BUILD_PLAYER=ON \
  -DVEYRA_BUILD_TESTS=ON \
  -DNDI_SDK_DIR=/absolute/path/to/ndi/sdk
cmake --build build --parallel
ctest --test-dir build --output-on-failure
```

If the build fails, save the complete CMake configure output and compiler output. Do not work around missing SDK symbols by guessing API names or changing SDK headers.

Check dynamic library resolution:

```bash
ldd ./build/veyra
```

There should be no `not found` entries.

## 6. Validate NDI discovery before fullscreen playback

Start a known NDI sender on the same wired LAN. Confirm both machines are on the same subnet and that multicast/discovery traffic is not blocked by the network.

```bash
./build/veyra --list-sources
```

Record the exact source name and address. Prefer the address in `config/veyra.example.json` and create a local configuration file. Do not commit site-specific source names or addresses.

## 7. Configure receiver pairing, synchronization, and fallback

The receiver includes a control-plane client for one-time pairing and periodic heartbeats. It is independent of NDI playback: if the local server is unavailable, playback continues and the client retries with bounded backoff.

1. Start the Veyra server with HTTPS enabled and make its certificate chain trusted by the Mac mini. The server intentionally refuses non-loopback HTTP.
2. In the dashboard, create a fresh receiver pairing code. It is 12 digits and expires after 10 minutes.
3. Install the example config at the default path and edit it:

```bash
sudo install -d -m 755 /etc/veyra
sudo install -m 600 config/veyra.example.json /etc/veyra/config.json
sudo chown "$(id -un):$(id -gn)" /etc/veyra/config.json
nano /etc/veyra/config.json
```

Then set the `controlPlane` section to the following values:

```json
{
  "controlPlane": {
    "serverUrl": "https://veyra-server.local:8787",
    "deviceName": "Lobby Display",
    "pairingCode": "YOUR_12_DIGIT_CODE",
    "caCertificatePath": "/etc/veyra/veyra-ca.pem",
    "credentialPath": "~/.local/state/veyra/device-token",
    "cachePath": "~/.local/state/veyra/cache",
    "syncIntervalSeconds": 10,
    "heartbeatIntervalSeconds": 15
  }
}
```

Use the actual server DNS name covered by its TLS certificate. If the CA is already installed in the system trust store, `caCertificatePath` may be left empty. Never disable certificate verification or use plaintext HTTP to a LAN server.

After successful pairing, the receiver stores its device token in the credential file with owner-only permissions. Subsequent starts use that credential; the one-time pairing code is not reused. The heartbeat reports playback mode, current source, uptime, and the latest discovered NDI source list. After pairing, the receiver polls versioned configuration and its assigned fallback playlist. It downloads PNG/JPEG/WebP assets into an owner-only cache, verifies each file against its SHA-256 and declared size, and atomically switches to the new manifest only after every item is present and verified. Each assigned playlist is limited to 512 MiB. During a playlist transition, the receiver retains the previous verified snapshot until the next successful synchronization, so temporary cache use can be higher.

If an operator revokes the receiver credential, stop Veyra, remove the local `device-token` file, create a new pairing code, and update the config before restarting. The control-plane client has not yet been verified against the actual NDI SDK build or physical Mac mini.

## 8. Test playback in a controlled sequence

Before testing outages, assign an NDI source and a fallback playlist to the receiver in the dashboard. Wait until the receiver logs a successful sync and confirm the cache exists under `~/.local/state/veyra/cache`. Start windowed or on a spare display first if the current configuration allows it. Then test:

1. Stable 1080p30 NDI video for at least 30 minutes.
2. Stop the assigned NDI sender; verify the receiver switches to the cached image playlist and respects each image duration.
3. Restart the sender; verify NDI video automatically resumes without restarting Veyra.
4. Stop the local Veyra server while NDI is playing; verify playback continues.
5. With the server still stopped, stop the NDI sender; verify the cached fallback still plays.
6. Restart the receiver while the server is unavailable; verify it loads its last verified cache and can display fallback.
7. Restart the server, change the assigned playlist, and verify the receiver activates the new playlist only after its assets have downloaded and passed hash verification.
8. Ethernet disconnect and reconnect; sender application restart.
9. Display sleep/wake and XFCE session restart.
10. Veyra process termination and systemd restart.
11. A sustained 24-hour run only after the shorter tests are clean.

For each test, record whether the image freezes, turns black, recovers automatically, or needs a process restart. Record CPU and memory usage:

```bash
top -H -p "$(pgrep -n veyra)"
ps -o pid,etime,%cpu,%mem,rss,cmd -C veyra
journalctl --user -u veyra.service --since "30 minutes ago"
```

Do not treat a visually smooth short test as proof of 24-hour stability.

## 9. Install the user service only after manual playback is stable

Follow the systemd user-service instructions in the root README. Confirm that the service runs inside the logged-in XFCE/X11 session and has the correct `DISPLAY` and `XAUTHORITY`.

```bash
systemctl --user status veyra.service
journalctl --user -u veyra.service -f
```

The initial deployment depends on an active graphical session. Unattended startup therefore requires a deliberate display-manager/autologin configuration.

## 10. Server and receiver pairing status

The server can issue one-time pairing codes, register devices, accept authenticated heartbeats, and provide per-device assignments and assigned media. The C++ receiver now implements pairing, TLS-verified heartbeats, source snapshots, versioned configuration polling on an independent worker, SHA-256-verified media synchronization, persistent cache loading, cancellable downloads, and timed image fallback. The complete native player still requires a real NDI SDK build and physical validation.

Do not expose the server on the LAN until its certificate is trusted by the receiver and the actual player build has been tested. The non-loopback TLS guard is intentional; do not disable it or send bearer credentials over plaintext HTTP.

## Test report template

Record the following in an issue or test note:

- Test date and Veyra commit SHA
- Debian release and kernel version
- NDI SDK version
- Display model, resolution, and refresh rate
- Sender software and video format
- Wired/wireless network details
- Build result and complete compiler output if it failed
- Playback duration and any interruptions
- CPU, memory, and dropped-frame observations
- Source-loss and recovery behavior
- Logs for every failure
- Final result: pass, fail, or needs investigation
