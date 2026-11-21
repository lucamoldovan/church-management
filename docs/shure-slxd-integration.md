# Shure SLX-D integration

## Scope and hardware

Kasapini Dashboard has an optional, read-only telemetry adapter for up to six single-channel Shure SLX-D receivers: five handheld singer microphones and one headset/bodypack channel. The transmitters currently use AA batteries.

The adapter is disabled by default. It has not been validated against the physical receivers yet. Do not enable it on the church network until the TCP connection direction has been confirmed with one receiver.

## Protocol details checked against Shure's SLX-D command strings

The adapter uses the documented ASCII command-string format on TCP port 2202. Supported read-only values are:

- Receiver: model, device ID, RF band and firmware version.
- Channel: channel name, frequency, group/channel.
- Transmitter: model/link indication, battery bars and reported battery runtime.
- Audio: peak and RMS levels in dBFS.
- RF: combined RSSI from the periodic sample and individual antenna A/B RSSI reports.

Important protocol details:

- Meter requests use `< SAMPLE 1 ALL audPeak audRms rfRssi >`; the documented response contains three values after the channel identifier.
- The meter interval is set with `< SET 1 METER_RATE 01000 >` (one sample per second). The adapter sends `METER_RATE 00000` when it shuts down cleanly.
- Individual antenna readings are requested with `< GET 1 RSSI 0 >`, which returns separate `REP 1 RSSI 1 ...` and `REP 1 RSSI 2 ...` reports.
- Shure's reported RF and audio values use a -120 offset to convert them to dBm and dBFS respectively.
- The seven-character frequency value is converted to Hz before it is sent to the dashboard.
- Battery bars range from 0–5; 255 means unknown. The displayed percentage is only an estimate (20% per bar), not a precise battery measurement.
- Battery runtime values 65533, 65534 and 65535 remain explicit warning/calculating/unknown states.

The adapter does not issue commands that change RF frequency, group/channel, transmitter settings, audio gain, mic/line level or other operating settings. Its only SET command configures the telemetry meter interval.

## TCP connection direction: unresolved

The official [SLX-D User Guide](https://www.shure.com/en-US/docs/guide/SLXD) describes the SLX-D receiver as the TCP client on port 2202. The official [SLX-D Command Strings document](https://www.shure.com/en-US/docs/commandstrings/SLXD) says to select Client in the AMX/Crestron control program. A third-party SLX-D driver describes the controller connecting to the receiver, and Shure's general connection-support article does not explicitly list SLX-D among the models it covers.

These descriptions are not sufficiently consistent to claim the connection direction is verified. The current experimental adapter assumes that Kasapini Dashboard opens outbound TCP connections to each configured receiver IP. It is disabled by default. Confirm the actual connection behavior with one physical receiver or Shure support before enabling it. Do not configure a listener, routes or receiver destinations based on guesswork.

Shure also says to allow third-party control under **Advanced Settings → Controller Access → Allow** and to use only one controller per system to avoid command conflicts. Perform that change only as part of the controlled hardware test, and do not run a competing controller such as Wireless Workbench at the same time.

## Current implementation

- Up to six explicitly configured receiver IP addresses; no subnet scan or automatic discovery is implemented.
- Default TCP port 2202 and one-second meter interval.
- Automatic reconnect attempts, framed ASCII parsing, duplicate Shure Device ID detection and stale/disconnected status.
- Dashboard telemetry refresh every two seconds through an authenticated API route.
- Device identity is based on the Shure Device ID, not the current DHCP address.
- The adapter is read-only apart from the meter interval setting described above.
- The monitor is disabled by default with `SHURE_SLXD_ENABLED=false`.

Example environment configuration (replace addresses with the actual DHCP-reserved receiver addresses only after the connection direction is confirmed):

```env
SHURE_SLXD_ENABLED=false
SHURE_SLXD_RECEIVER_IPS=
SHURE_SLXD_PORT=2202
SHURE_SLXD_METER_RATE_MS=1000
```

## Microphone assignments

The Microphones tab is separate from the Services rundown and is not tied to individual songs.

- Five handheld slots (Microphone 1–5) are assigned from people scheduled in the Planning Center team named `Voci`, including every position in that team.
- The separate Headset slot can be assigned to anyone scheduled on the selected service plan; it does not require the pastor to be part of Voci.
- The Sunday plan is selected automatically using the browser's local calendar date, with a manual service selector available.
- The five handheld assignments and headset assignment are saved locally against the selected service plan. They do not write back to Planning Center.
- A person cannot occupy more than one microphone slot for the same service.
- The Shure receiver inventory and telemetry are not yet linked to individual assignment slots. Stable receiver IDs are shown separately; receiver-to-person automation remains a later step.

## People directory synchronization

Planning Center remains the source of truth. The local People page is a read-only cache.

- The sync follows People API pagination and persists Planning Center person ID and name fields only.
- Email addresses, phone numbers, household data, birthdates, medical notes and unrelated profile fields are not persisted in the People records.
- Team membership and team-leader relationships are resolved through the Services API. The visible People directory shows names and team names.
- Service plans, scheduled teams and scheduled people continue to come from the selected Planning Center plan; the directory never replaces a service's actual roster.
- Manual person creation and local scheduling are not part of this phase.

## Verification and remaining physical tests

Automated tests cover ASCII frame fragmentation, response parsing, battery and meter conversions, invalid configuration, an outbound mock TCP receiver, API authentication, microphone roster validation and duplicate assignments. CI also builds the dashboard, server and native receiver.

Still required before calling the hardware integration ready:

1. Confirm the TCP connection direction with one physical SLX-D receiver.
2. Confirm third-party Controller Access and command responses on the actual firmware.
3. Verify channel name, frequency, RF band, transmitter model, AA battery bars/runtime, both antenna RSSI values and audio meters against the receiver display.
4. Repeat with all six receivers and check reconnect behavior.
5. Confirm the monitor does not conflict with Wireless Workbench or another controller.

Until those checks pass, keep the integration disabled.

## Official references

- [SLX-D User Guide](https://www.shure.com/en-US/docs/guide/SLXD)
- [SLX-D Command Strings](https://www.shure.com/en-US/docs/commandstrings/SLXD)
- [Shure Wireless Workbench ports and protocols](https://service.shure.com/articles/en_US/Knowledge/wwb6-ports-and-protocol-information)
- [Shure enterprise network troubleshooting checklist](https://service.shure.com/articles/en_US/Knowledge/enterprise-network-troubleshooting-checklist)
