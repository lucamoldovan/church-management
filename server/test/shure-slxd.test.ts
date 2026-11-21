import assert from "node:assert/strict";
import test from "node:test";
import {
  extractSlxdFrames,
  normalizeSlxdBatteryBars,
  normalizeSlxdBatteryRuntime,
  parseSlxdFrame,
  slxdReportedDbfs,
  slxdReportedDbm,
  ShureSlxdMonitor,
} from "../src/shure-slxd.js";

test("SLX-D TCP frame parser handles fragmented and concatenated messages", () => {
  const first = extractSlxdFrames("< REP MODEL {SLXD4");
  assert.deepEqual(first.frames, []);
  const second = extractSlxdFrames(first.remainder + "yyyyyyyy} >< REP DEVICE_ID {SLXD4A12} >");
  assert.deepEqual(second.frames, ["REP MODEL {SLXD4yyyyyyyy}", "REP DEVICE_ID {SLXD4A12}"]);
  assert.equal(second.remainder, "");
});

test("SLX-D device and channel reports are parsed without changing their values", () => {
  assert.equal(parseSlxdFrame("REP MODEL {SLXD4                  }").model, "SLXD4");
  assert.equal(parseSlxdFrame("REP DEVICE_ID {SLXD4A12}").deviceId, "SLXD4A12");
  assert.equal(parseSlxdFrame("REP RF_BAND {G55     }").rfBand, "G55");
  assert.equal(parseSlxdFrame("REP FW_VER {2.0.15.2             }").firmware, "2.0.15.2");
  assert.equal(parseSlxdFrame("REP 1 CHAN_NAME {Lead Vox                    }").channelName, "Lead Vox");
  assert.equal(parseSlxdFrame("REP 1 FREQUENCY 0602125").frequencyHz, 602125);
  assert.equal(parseSlxdFrame("REP 1 GROUP_CHANNEL {6,100     }").groupChannel, "6,100");
  assert.equal(parseSlxdFrame("REP 1 TX_MODEL SLXD2").transmitterConnected, true);
  assert.equal(parseSlxdFrame("REP 1 TX_MODEL UNKNOWN").transmitterConnected, false);
});

test("SLX-D AA battery bars map to a clearly approximate percentage", () => {
  for (let bars = 0; bars <= 5; bars += 1) {
    assert.deepEqual(normalizeSlxdBatteryBars(bars), { bars, percentEstimate: bars * 20 });
  }
  assert.deepEqual(normalizeSlxdBatteryBars(255), { bars: null, percentEstimate: null });
  assert.deepEqual(normalizeSlxdBatteryBars(6), { bars: null, percentEstimate: null });
  assert.deepEqual(parseSlxdFrame("REP 1 TX_BATT_BARS 004"), { channel: 1, batteryBars: 4, batteryPercentEstimate: 80 });
  assert.equal(parseSlxdFrame("REP 1 TX_BATT_BARS 255").batteryBars, null);
});

test("SLX-D transmitter runtime sentinel values remain explicit", () => {
  assert.deepEqual(normalizeSlxdBatteryRuntime(125), { batteryRuntimeMinutes: 125, batteryRuntimeState: "available" });
  assert.deepEqual(normalizeSlxdBatteryRuntime(65533), { batteryRuntimeMinutes: null, batteryRuntimeState: "communication_warning" });
  assert.deepEqual(normalizeSlxdBatteryRuntime(65534), { batteryRuntimeMinutes: null, batteryRuntimeState: "calculating" });
  assert.deepEqual(normalizeSlxdBatteryRuntime(65535), { batteryRuntimeMinutes: null, batteryRuntimeState: "unknown" });
});

test("SLX-D SAMPLE telemetry converts peak, RMS and both antenna RSSI readings", () => {
  const sample = parseSlxdFrame("SAMPLE 1 ALL 005 000 045 062 BB 31 099 31 085");
  assert.equal(sample.audioPeakDbfs, -75);
  assert.equal(sample.audioRmsDbfs, -58);
  assert.equal(sample.rfAntennaADbm, -21);
  assert.equal(sample.rfAntennaBDbm, -35);
  assert.equal(sample.channel, 1);
  assert.ok(sample.lastSampleAt);
});

test("SLX-D legacy metering and standalone RSSI reports are handled", () => {
  const sample = parseSlxdFrame("SAMPLE 1 ALL 102 102 086");
  assert.equal(sample.audioPeakDbfs, -18);
  assert.equal(sample.audioRmsDbfs, -18);
  assert.equal(sample.rfDbm, -34);
  assert.equal(parseSlxdFrame("REP 1 RSSI 2 064").rfAntennaBDbm, -56);
  assert.equal(slxdReportedDbm(121), null);
  assert.equal(slxdReportedDbfs(-1), null);
});

test("malformed and unrelated SLX-D frames do not create telemetry", () => {
  assert.deepEqual(parseSlxdFrame("not a command"), {});
  assert.deepEqual(parseSlxdFrame("REP 8 TX_BATT_BARS 004"), { channel: 8 });
  assert.deepEqual(parseSlxdFrame("SAMPLE x ALL 005 000 045 062"), {});
});

test("SLX-D monitor stays disabled unless explicitly configured", async () => {
  const monitor = new ShureSlxdMonitor({ enabled: false, receiverIps: [], port: 2202 });
  await monitor.start();
  assert.equal(monitor.status().enabled, false);
  assert.equal(monitor.status().running, false);
  assert.equal(monitor.status().devices.length, 0);
  await monitor.close();
});

test("SLX-D monitor refuses to start without explicit receiver IPs", async () => {
  const monitor = new ShureSlxdMonitor({ enabled: true, receiverIps: [], port: 2202 });
  await assert.rejects(() => monitor.start(), /SHURE_SLXD_RECEIVER_IPS/);
  await monitor.close();
});

test("SLX-D monitor validates explicit receiver addresses", async () => {
  const monitor = new ShureSlxdMonitor({ enabled: true, receiverIps: ["not-an-ip"], port: 2202 });
  await assert.rejects(() => monitor.start(), /valid receiver IP addresses/);
  await monitor.close();
});
