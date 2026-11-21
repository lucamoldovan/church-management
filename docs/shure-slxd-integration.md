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

## Microphone page and Sunday assignments

The microphone controls live in their own top-level **Microphones** tab in Church Operations. They are not embedded in the Services rundown and are not tied to individual songs.

- Show six persistent receiver slots together: Microphone 1–5 and Headset.
- Each slot has its own dropdown for the person using that receiver during the selected Sunday service.
- The operator first selects a Planning Center service plan/date. The dropdown options come from the people actually scheduled to that plan through Planning Center Services' plan team schedule (PlanPerson / scheduled team members).
- Do not use the church-wide People directory, team membership directory, song/item leader assignments, or item-specific assignments as the dropdown source.
- The plan's scheduled people are the Sunday roster. Filter that roster to people belonging to the Planning Center team named `Voci`; include every position in that team (including `Voci` and `Lider De Închinare`) in all six dropdowns. Do not use the church-wide People directory as a fallback.
- If the selected plan has no eligible scheduled singers, show an explicit empty state and leave the singer dropdowns unavailable.
- Changing the selected Sunday loads that plan's roster and its saved microphone mapping. Assignments are local to that service plan/date and do not write to Planning Center.
- Prevent assigning the same person to multiple microphone slots for the same service. Clearing a dropdown unassigns that slot.
- A missing or stale assignment (person no longer scheduled on the selected plan) must be visibly flagged and require a new selection.
- Receiver telemetry and microphone-to-receiver identity are separate from the Sunday person assignment. Stable Shure Device ID/serial identity must be used once discovery is implemented; DHCP IP changes must not break a receiver's identity.

The first implementation adds the dedicated tab, six assignment slots, a service-plan selector, server-side validation against that plan's scheduled `Voci` team roster, and local persistence. Hardware discovery and live SLX-D telemetry remain a separate next phase and must not be presented as connected until verified with a physical receiver.

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
