# Shure SLX-D integration

## Goal

Add a local, read-only Shure monitoring integration to Church Operations for six single-channel SLX-D receivers: five singer microphones and one headset. The integration must not interfere with Wireless Workbench or change RF settings, frequencies, transmitter settings, or audio gain.

## Confirmed equipment and operating assumptions

- Six single-channel SLX-D receivers (not SLX-D+).
- Five handheld/singer channels and one headset/bodypack channel.
- Transmitters use AA batteries.
- Receivers are connected by Ethernet to the same switch/LAN as the local Church Operations server.
- The RF band will be recorded when the user supplies it.
- Use DHCP/automatic IP addressing by default. DHCP reservations may be used for stable addresses, but static addressing is not required merely to assign an IP.

## Protocol facts verified against Shure documentation

- Third-party command strings use TCP port 2202.
- Third-party control is blocked by default on SLX-D; enable it at **Advanced Settings → Controller Access → Allow**.
- Shure says to use only one controller per system to avoid command conflicts. Church Operations must therefore coordinate with Wireless Workbench: do not run two competing third-party command-string controllers simultaneously.
- The SLX-D guide describes the receiver as the TCP client. The exact discovery/connection direction and how the receiver locates the controller must be validated with one physical receiver before enabling the production transport. Do not assume that a simple outbound TCP scan of receiver IPs is correct.
- Shure's Wireless Workbench network guidance uses DHCP and network discovery. Shure's enterprise network guidance identifies Shure Discovery multicast at 239.255.254.253:8427 and Bonjour/mDNS at 224.0.0.251:5353. Discovery must be tested on the church switch; multicast filtering/VLAN boundaries can prevent it.
- A receiver's DHCP address and its identity are separate concerns. Use its Shure Device ID/serial/model as stable identity, not its current IP address.

## Read-only telemetry to expose

Use the documented SLX-D ASCII command strings and parse only known response formats:

- Device: MODEL, DEVICE_ID, RF_BAND, firmware version.
- Channel: CHAN_NAME, FREQUENCY, GROUP_CHANNEL, AUDIO_GAIN (read only), AUDIO_OUT_LVL_SWITCH.
- Transmitter: TX_MODEL, TX_BATT_BARS, TX_BATT_MINS where supported, LINK_STATUS.
- RF: RSSI for antenna A and B.
- Audio: AUDIO_LEVEL_PEAK and AUDIO_LEVEL_RMS.
- Identify: FLASH ON, only when explicitly requested by an operator.

Battery presentation:
- SLX-D AA battery telemetry is based on the reported battery bars (0–5); 255 means unknown.
- Show the raw bar count and a clearly labelled approximate percentage derived from bars (20% per bar). Never present it as an exact battery percentage or infer exact remaining minutes from AA cells.
- If transmitter runtime is unavailable/unknown, show “Runtime unavailable” rather than fabricating a duration.
- Preserve stale/unknown states. Do not display an old reading as live.

Metering:
- Use a conservative initial sample interval (for example 1 second) only after a successful physical test.
- Stop metering when the controller disconnects or the integration is disabled.
- Avoid continuously issuing GET requests for metered values when SAMPLE/METER_RATE is available.

## Discovery and connection strategy

1. Implement an isolated Shure adapter; do not mix socket/protocol logic into route handlers.
2. Start with a diagnostic mode that reports discovery packets and device identities without changing receiver settings.
3. Verify the exact SLX-D discovery path and TCP control direction on one receiver. Shure's receiver-client note and command-string controller documentation must be reconciled by a real connection test.
4. Prefer automatic discovery on the local subnet. Keep a manual IP/host override as a fallback, but key saved device records by stable hardware identity.
5. Enforce one controller per receiver/system. Do not compete with Wireless Workbench; provide a clear warning if another controller appears to be active or the receiver rejects/does not answer commands.
6. Do not bind a network listener to all interfaces unless explicitly configured. Restrict the control service to the intended LAN interface and document firewall requirements.

## Manual microphone assignments

Assignments are operator-managed and persistent; no automatic assignment in the first release.

- Support up to five singer slots, each associated with exactly one receiver/transmitter channel and one person.
- Keep the sixth headset receiver as a separate role/slot. The role and display label should be editable.
- Allow an operator to change a receiver's person assignment at any time.
- Allow unassigned receivers.
- Prevent one receiver from being assigned to two active people at once, and prevent one person from occupying multiple singer slots unless the operator explicitly changes the assignment.
- **Never show the full church-wide people directory in the microphone assignment selector.**
- The operator selects a service plan and a song/rundown item first. The selectable people are only the singers assigned/scheduled to that specific song/item in the selected Planning Center plan (using that item's Planning Center item assignments and the relevant singer/team-position assignments).
- If the song has no eligible singer assignments, show an empty state such as “No singers assigned to this song”; do not fall back to all church singers or all Planning Center people.
- The operator manually maps each eligible singer to one available receiver/channel. The assignment is scoped to the selected service plan and song/item, not a global permanent person-to-microphone mapping.
- Support up to five singer slots for a song, plus the separate headset receiver/role. If fewer than five singers are assigned to that song, show only those eligible people.
- Keep the receiver-to-person/song mapping local and do not write it back to Planning Center.
- Preserve assignments when a receiver's DHCP IP changes by keying them to Shure hardware identity.
- Keep role labels configurable (e.g. Singer 1–5, Headset).

## Dashboard

Create a dedicated **Wireless** section showing:
- Discovered receiver inventory and connection freshness.
- Model, device ID, channel name, RF band, frequency, and IP address.
- Transmitter link state and model.
- AA battery bars plus clearly labelled estimated percentage.
- RF signal for both antennas, audio peak/RMS, and stale/unknown indicators.
- Manual person/role assignment controls.
- A clear diagnostic state when discovery or command access is unavailable.

## Security and safety

- Read-only by default. The only allowed SET command in the initial release is the documented identify/flash action, and it should require an explicit user action.
- Never expose raw TCP control to browser clients.
- Do not accept arbitrary commands from the UI or API.
- Validate source addresses, payload lengths, message framing, and timeouts.
- Log device connection/disconnection and telemetry errors without logging secrets (the protocol itself does not use an app credential).
- Keep the integration disabled until the one-receiver test passes.

## Acceptance tests

- Protocol parser tests for padded strings, braces, malformed frames, unknown values, and fragmented TCP data.
- Battery mapping tests for 0–5 bars and unknown 255.
- RF conversion tests using Shure's reported-value-to-dBm rule.
- Discovery tests with packet fixtures and duplicate device announcements.
- Reconnect and stale-state tests.
- Assignment tests: manual assignment, reassignment, unassigned state, five singer slots, separate headset slot, and duplicate prevention.
- Physical acceptance test with one SLX-D receiver before expanding to all six.

## Official references

- [SLX-D User Guide](https://www.shure.com/en-US/docs/guide/SLXD)
- [SLX-D Command Strings](https://www.shure.com/en-US/docs/commandstrings/SLXD)
- [Wireless Workbench Quick Start](https://www.shure.com/en-US/docs/quickstart/wireless-workbench)
- [Shure Wireless Workbench ports and protocols](https://service.shure.com/articles/en_US/Knowledge/wwb6-ports-and-protocol-information)
- [Shure enterprise network troubleshooting checklist](https://service.shure.com/articles/en_US/Knowledge/enterprise-network-troubleshooting-checklist)
