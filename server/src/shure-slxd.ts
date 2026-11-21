import { createServer, isIP, type Server, type Socket } from "node:net";

export interface SlxdTelemetry {
  deviceId: string;
  model: string | null;
  firmware: string | null;
  rfBand: string | null;
  channelName: string | null;
  frequencyHz: number | null;
  groupChannel: string | null;
  transmitterModel: string | null;
  transmitterConnected: boolean | null;
  batteryBars: number | null;
  batteryPercentEstimate: number | null;
  batteryRuntimeMinutes: number | null;
  batteryRuntimeState: "available" | "calculating" | "communication_warning" | "unknown";
  rfAntennaADbm: number | null;
  rfAntennaBDbm: number | null;
  rfDbm: number | null;
  audioPeakDbfs: number | null;
  audioRmsDbfs: number | null;
  connected: boolean;
  lastSeenAt: string;
  lastSampleAt: string | null;
  remoteAddress: string;
  channel: number;
  diagnostic: string | null;
}

type DeviceState = SlxdTelemetry & { socket: Socket; frameBuffer: string };

export interface ShureSlxdOptions {
  enabled: boolean;
  host: string;
  port: number;
  allowedIps: string[];
  meterRateMs?: number;
}

export function normalizeSlxdBatteryBars(value: number): { bars: number | null; percentEstimate: number | null } {
  if (!Number.isInteger(value) || value < 0 || value > 5) return { bars: null, percentEstimate: null };
  return { bars: value, percentEstimate: value * 20 };
}

export function normalizeSlxdBatteryRuntime(value: number): Pick<SlxdTelemetry, "batteryRuntimeMinutes" | "batteryRuntimeState"> {
  if (!Number.isInteger(value) || value < 0 || value > 65535) return { batteryRuntimeMinutes: null, batteryRuntimeState: "unknown" };
  if (value <= 65532) return { batteryRuntimeMinutes: value, batteryRuntimeState: "available" };
  if (value === 65533) return { batteryRuntimeMinutes: null, batteryRuntimeState: "communication_warning" };
  if (value === 65534) return { batteryRuntimeMinutes: null, batteryRuntimeState: "calculating" };
  return { batteryRuntimeMinutes: null, batteryRuntimeState: "unknown" };
}

export function slxdReportedDbm(value: number): number | null {
  return Number.isInteger(value) && value >= 0 && value <= 120 ? value - 120 : null;
}

export function slxdReportedDbfs(value: number): number | null {
  return Number.isInteger(value) && value >= 0 && value <= 120 ? value - 120 : null;
}

export function extractSlxdFrames(input: string): { frames: string[]; remainder: string } {
  const frames: string[] = [];
  let buffer = input;
  while (true) {
    const start = buffer.indexOf("<");
    if (start < 0) return { frames, remainder: buffer.length > 8192 ? "" : buffer };
    if (start > 0) buffer = buffer.slice(start);
    const end = buffer.indexOf(">");
    if (end < 0) return { frames, remainder: buffer.length > 8192 ? "" : buffer };
    const frame = buffer.slice(1, end).trim();
    if (frame) frames.push(frame);
    buffer = buffer.slice(end + 1);
  }
}

export function parseSlxdFrame(frame: string): Partial<SlxdTelemetry> & { deviceId?: string } {
  const clean = frame.trim().replace(/^<\s*/, "").replace(/\s*>$/, "");
  const parts = clean.split(/\s+/);
  if (parts[0] === "SAMPLE") {
    const channel = Number(parts[1]);
    if (!Number.isInteger(channel) || channel < 1 || channel > 2) return {};
    // SLX-D v2 sample: SAMPLE ch ALL qual audBitmap audPeak audRms rfAntStats rfBitmapA rfRssiA rfBitmapB rfRssiB
    if (parts.length >= 12 && parts[2] === "ALL") {
      const peak = Number(parts[5]);
      const rms = Number(parts[6]);
      const rssiA = Number(parts[9]);
      const rssiB = Number(parts[11]);
      return {
        channel,
        audioPeakDbfs: slxdReportedDbfs(peak),
        audioRmsDbfs: slxdReportedDbfs(rms),
        rfAntennaADbm: slxdReportedDbm(rssiA),
        rfAntennaBDbm: slxdReportedDbm(rssiB),
        rfDbm: null,
        lastSampleAt: new Date().toISOString(),
      };
    }
    // Compact legacy sample: SAMPLE ch ALL audPeak audRms rfRssi
    if (parts.length >= 6 && parts[2] === "ALL") {
      const peak = Number(parts[3]);
      const rms = Number(parts[4]);
      const rssi = slxdReportedDbm(Number(parts[5]));
      return {
        channel,
        audioPeakDbfs: slxdReportedDbfs(peak),
        audioRmsDbfs: slxdReportedDbfs(rms),
        rfAntennaADbm: null,
        rfAntennaBDbm: null,
        rfDbm: rssi,
        lastSampleAt: new Date().toISOString(),
      };
    }
    return {};
  }

  if (parts[0] !== "REP" || parts.length < 3) return {};
  const channel = /^\d+$/.test(parts[1]) ? Number(parts[1]) : null;
  const key = channel === null ? parts[1] : parts[2];
  const valueStart = channel === null ? 2 : 3;
  const rawValue = parts.slice(valueStart).join(" ").replace(/^\{/, "").replace(/\}$/, "").trim();
  const value = rawValue;
  const result: Partial<SlxdTelemetry> & { deviceId?: string } = {};
  if (channel !== null) result.channel = channel;

  switch (key) {
    case "MODEL": result.model = value || null; break;
    case "DEVICE_ID": result.deviceId = value || undefined; break;
    case "RF_BAND": result.rfBand = value || null; break;
    case "FW_VER": result.firmware = value || null; break;
    case "CHAN_NAME": result.channelName = value || null; break;
    case "FREQUENCY": result.frequencyHz = /^\d{7}$/.test(value) ? Number(value) : null; break;
    case "GROUP_CHANNEL": result.groupChannel = value.replace(/\s+/g, "") || null; break;
    case "TX_MODEL":
      result.transmitterModel = value === "UNKNOWN" ? null : value || null;
      result.transmitterConnected = Boolean(value && value !== "UNKNOWN");
      break;
    case "TX_BATT_BARS": {
      const battery = normalizeSlxdBatteryBars(Number(value));
      result.batteryBars = battery.bars;
      result.batteryPercentEstimate = battery.percentEstimate;
      break;
    }
    case "TX_BATT_MINS": {
      const battery = normalizeSlxdBatteryRuntime(Number(value));
      result.batteryRuntimeMinutes = battery.batteryRuntimeMinutes;
      result.batteryRuntimeState = battery.batteryRuntimeState;
      break;
    }
    case "RSSI": {
      const antenna = Number(parts[valueStart]);
      const reported = Number(parts[valueStart + 1]);
      if (antenna === 1) result.rfAntennaADbm = slxdReportedDbm(reported);
      if (antenna === 2) result.rfAntennaBDbm = slxdReportedDbm(reported);
      break;
    }
    default: break;
  }
  return result;
}

function normalizeAddress(address: string): string {
  return address.startsWith("::ffff:") ? address.slice(7) : address;
}

function blankDevice(remoteAddress: string, socket: Socket): DeviceState {
  return {
    deviceId: `pending:${remoteAddress}:${Date.now()}`,
    model: null, firmware: null, rfBand: null, channelName: null, frequencyHz: null, groupChannel: null,
    transmitterModel: null, transmitterConnected: null, batteryBars: null, batteryPercentEstimate: null,
    batteryRuntimeMinutes: null, batteryRuntimeState: "unknown", rfAntennaADbm: null, rfAntennaBDbm: null,
    rfDbm: null, audioPeakDbfs: null, audioRmsDbfs: null, connected: true, lastSeenAt: new Date().toISOString(),
    lastSampleAt: null, remoteAddress, channel: 1, diagnostic: "Waiting for receiver identification",
    socket, frameBuffer: "",
  };
}

export class ShureSlxdMonitor {
  private server: Server | null = null;
  private readonly devices = new Map<string, DeviceState>();
  private readonly allowedIps: Set<string>;

  constructor(private readonly options: ShureSlxdOptions) {
    this.allowedIps = new Set(options.allowedIps.map(normalizeAddress));
  }

  async start(): Promise<void> {
    if (!this.options.enabled || this.server) return;
    if (!this.allowedIps.size) throw new Error("SHURE_SLXD_ALLOWED_IPS must contain the receiver IP addresses before enabling SLX-D monitoring");
    if (!Number.isInteger(this.options.port) || this.options.port < 1 || this.options.port > 65535) throw new Error("SHURE_SLXD_PORT must be between 1 and 65535");
    if (isIP(this.options.host) === 0) throw new Error("SHURE_SLXD_HOST must be an explicit IP address");
    const meterRate = this.options.meterRateMs ?? 1000;
    if (!Number.isInteger(meterRate) || meterRate < 1000 || meterRate > 60000) throw new Error("SHURE_SLXD_METER_RATE_MS must be between 1000 and 60000");

    this.server = createServer((socket) => this.accept(socket));
    await new Promise<void>((resolve, reject) => {
      const server = this.server!;
      const onError = (error: Error) => { server.off("listening", onListening); reject(error); };
      const onListening = () => { server.off("error", onError); resolve(); };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(this.options.port, this.options.host);
    });
  }

  private accept(socket: Socket): void {
    const remoteAddress = normalizeAddress(socket.remoteAddress ?? "unknown");
    if (!this.allowedIps.has(remoteAddress)) {
      socket.destroy();
      return;
    }
    const state = blankDevice(remoteAddress, socket);
    this.devices.set(state.deviceId, state);
    socket.setEncoding("ascii");
    socket.setTimeout(15000);
    socket.on("data", (chunk: string) => {
      state.frameBuffer += chunk;
      const extracted = extractSlxdFrames(state.frameBuffer);
      state.frameBuffer = extracted.remainder;
      for (const frame of extracted.frames) this.handleFrame(state, frame);
    });
    socket.on("timeout", () => socket.destroy(new Error("SLX-D receiver connection timed out")));
    socket.on("error", (error) => { state.diagnostic = error.message.slice(0, 180); });
    socket.on("close", () => {
      state.connected = false;
      state.diagnostic = state.diagnostic ?? "Receiver disconnected; last readings are stale";
      state.lastSeenAt = new Date().toISOString();
    });

    // Only read commands and the non-operational meter sampling interval are sent.
    const channel = 1;
    const commands = [
      "< GET MODEL >", "< GET DEVICE_ID >", "< GET RF_BAND >", "< GET FW_VER >",
      `< GET ${channel} ALL >`, `< GET ${channel} TX_MODEL >`,
      `< GET ${channel} TX_BATT_BARS >`, `< GET ${channel} TX_BATT_MINS >`,
      `< SET ${channel} METER_RATE ${String(this.options.meterRateMs ?? 1000).padStart(5, "0")} >`,
      `< SAMPLE ${channel} ALL qual audBitmap audPeak audRms rfAntStats rfBitmapA rfRssiA rfBitmapB rfRssiB >`,
    ];
    for (const command of commands) socket.write(command);
  }

  private handleFrame(state: DeviceState, frame: string): void {
    const parsed = parseSlxdFrame(frame);
    if (!Object.keys(parsed).length) return;
    if (parsed.deviceId) {
      const oldId = state.deviceId;
      const existing = this.devices.get(parsed.deviceId);
      if (existing && existing !== state && existing.connected) {
        state.diagnostic = "Duplicate Device ID connection rejected";
        state.socket.destroy();
        return;
      }
      this.devices.delete(oldId);
      state.deviceId = parsed.deviceId;
      this.devices.set(state.deviceId, state);
    }
    Object.assign(state, parsed);
    state.lastSeenAt = new Date().toISOString();
    if (state.model && state.deviceId && !state.deviceId.startsWith("pending:")) {
      state.diagnostic = null;
    }
  }

  status(): { enabled: boolean; listening: boolean; host: string | null; port: number | null; allowedReceiverCount: number; devices: SlxdTelemetry[]; message: string } {
    const devices = [...this.devices.values()].map(({ socket: _socket, frameBuffer: _frameBuffer, ...device }) => ({
      ...device,
      // A disconnected receiver is never represented as live, even if it has cached readings.
      connected: device.connected && !device.socket.destroyed,
    })).sort((a, b) => a.deviceId.localeCompare(b.deviceId));
    return {
      enabled: this.options.enabled,
      listening: Boolean(this.server?.listening),
      host: this.options.enabled ? this.options.host : null,
      port: this.options.enabled ? this.options.port : null,
      allowedReceiverCount: this.allowedIps.size,
      devices,
      message: !this.options.enabled ? "SLX-D monitoring is disabled. Enable it after configuring the receiver controller connection and allowed IP addresses."
        : !this.server?.listening ? "SLX-D listener is not running."
        : devices.length ? "Receiving SLX-D telemetry."
        : "Waiting for an allowed SLX-D receiver to connect to this controller.",
    };
  }

  async close(): Promise<void> {
    for (const device of this.devices.values()) device.socket.destroy();
    this.devices.clear();
    if (!this.server?.listening) { this.server = null; return; }
    const server = this.server;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    this.server = null;
  }
}
