import { createConnection, isIP, type Socket } from "node:net";

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
  receiverIps: string[];
  port: number;
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
    if (parts.length >= 12 && parts[2] === "ALL") {
      return {
        channel,
        audioPeakDbfs: slxdReportedDbfs(Number(parts[5])),
        audioRmsDbfs: slxdReportedDbfs(Number(parts[6])),
        rfAntennaADbm: slxdReportedDbm(Number(parts[9])),
        rfAntennaBDbm: slxdReportedDbm(Number(parts[11])),
        rfDbm: null,
        lastSampleAt: new Date().toISOString(),
      };
    }
    if (parts.length >= 6 && parts[2] === "ALL") {
      return {
        channel,
        audioPeakDbfs: slxdReportedDbfs(Number(parts[3])),
        audioRmsDbfs: slxdReportedDbfs(Number(parts[4])),
        rfAntennaADbm: null,
        rfAntennaBDbm: null,
        rfDbm: slxdReportedDbm(Number(parts[5])),
        lastSampleAt: new Date().toISOString(),
      };
    }
    return {};
  }

  if (parts[0] !== "REP" || parts.length < 3) return {};
  const channelToken = parts[1] ?? "";
  const channel = /^\d+$/.test(channelToken) ? Number(channelToken) : null;
  if (channel !== null && channel !== 1 && channel !== 2) return {};
  const key = channel === null ? (parts[1] ?? "") : (parts[2] ?? "");
  const valueStart = channel === null ? 2 : 3;
  const value = parts.slice(valueStart).join(" ").replace(/^\{/, "").replace(/\}$/, "").trim();
  const result: Partial<SlxdTelemetry> & { deviceId?: string } = {};
  if (channel !== null) result.channel = channel;

  switch (key) {
    case "MODEL": result.model = value || null; break;
    case "DEVICE_ID": if (value) result.deviceId = value; break;
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

function blankDevice(remoteAddress: string, socket: Socket): DeviceState {
  return {
    deviceId: `pending:${remoteAddress}`,
    model: null, firmware: null, rfBand: null, channelName: null, frequencyHz: null, groupChannel: null,
    transmitterModel: null, transmitterConnected: null, batteryBars: null, batteryPercentEstimate: null,
    batteryRuntimeMinutes: null, batteryRuntimeState: "unknown", rfAntennaADbm: null, rfAntennaBDbm: null,
    rfDbm: null, audioPeakDbfs: null, audioRmsDbfs: null, connected: false, lastSeenAt: new Date().toISOString(),
    lastSampleAt: null, remoteAddress, channel: 1, diagnostic: "Connecting to receiver…",
    socket, frameBuffer: "",
  };
}

export class ShureSlxdMonitor {
  private readonly devices = new Map<string, DeviceState>();
  private reconnectTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private stopping = false;
  private readonly receiverIps: string[];

  constructor(private readonly options: ShureSlxdOptions) {
    this.receiverIps = [...new Set(options.receiverIps.map((ip) => ip.trim()).filter(Boolean))];
  }

  async start(): Promise<void> {
    if (!this.options.enabled || this.started) return;
    if (!this.receiverIps.length || this.receiverIps.length > 6 || this.receiverIps.some((ip) => isIP(ip) === 0)) {
      throw new Error("SHURE_SLXD_RECEIVER_IPS must contain between one and six valid receiver IP addresses");
    }
    if (!Number.isInteger(this.options.port) || this.options.port < 1 || this.options.port > 65535) throw new Error("SHURE_SLXD_PORT must be between 1 and 65535");
    const meterRate = this.options.meterRateMs ?? 1000;
    if (!Number.isInteger(meterRate) || meterRate < 1000 || meterRate > 60000) throw new Error("SHURE_SLXD_METER_RATE_MS must be between 1000 and 60000");

    this.stopping = false;
    this.started = true;
    for (const ip of this.receiverIps) this.connectReceiver(ip);
    this.reconnectTimer = setInterval(() => {
      for (const ip of this.receiverIps) {
        const device = this.devices.get(ip);
        if (!device || (!device.connected && !device.socket.connecting && device.socket.destroyed)) this.connectReceiver(ip);
      }
    }, 5000);
  }

  private connectReceiver(ip: string): void {
    if (this.stopping) return;
    const current = this.devices.get(ip);
    if (current && (current.connected || current.socket.connecting || !current.socket.destroyed)) return;

    const socket = createConnection({ host: ip, port: this.options.port });
    const state = blankDevice(ip, socket);
    this.devices.set(ip, state);
    socket.setEncoding("ascii");
    socket.setTimeout(15000);
    socket.on("connect", () => {
      state.connected = true;
      state.diagnostic = "Connected; waiting for receiver telemetry";
      const channel = 1;
      const commands = [
        "< GET MODEL >", "< GET DEVICE_ID >", "< GET RF_BAND >", "< GET FW_VER >",
        `< GET ${channel} ALL >`, `< GET ${channel} TX_MODEL >`,
        `< GET ${channel} TX_BATT_BARS >`, `< GET ${channel} TX_BATT_MINS >`,
        `< SET ${channel} METER_RATE ${String(this.options.meterRateMs ?? 1000).padStart(5, "0")} >`,
        `< SAMPLE ${channel} ALL qual audBitmap audPeak audRms rfAntStats rfBitmapA rfRssiA rfBitmapB rfRssiB >`,
      ];
      socket.write(commands.join(""));
    });
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
      state.diagnostic = state.diagnostic ?? "Receiver disconnected; automatic reconnect is enabled";
    });
  }

  private handleFrame(state: DeviceState, frame: string): void {
    const parsed = parseSlxdFrame(frame);
    if (!Object.keys(parsed).length) return;
    if (parsed.deviceId) {
      const duplicate = [...this.devices.values()].find((device) => device !== state && device.deviceId === parsed.deviceId && device.connected);
      if (duplicate) {
        state.diagnostic = "Duplicate Shure Device ID detected on another configured IP";
        state.socket.destroy();
        return;
      }
      state.deviceId = parsed.deviceId;
    }
    Object.assign(state, parsed);
    state.lastSeenAt = new Date().toISOString();
    if (state.model && state.deviceId && !state.deviceId.startsWith("pending:")) state.diagnostic = null;
  }

  status(): { enabled: boolean; running: boolean; host: null; port: number | null; configuredReceiverCount: number; devices: SlxdTelemetry[]; message: string } {
    const devices = [...this.devices.values()].map(({ socket: _socket, frameBuffer: _frameBuffer, ...device }) => ({
      ...device,
      connected: device.connected && !_socket.destroyed,
    })).sort((a, b) => a.deviceId.localeCompare(b.deviceId));
    const connected = devices.filter((device) => device.connected).length;
    return {
      enabled: this.options.enabled,
      running: this.started,
      host: null,
      port: this.options.enabled ? this.options.port : null,
      configuredReceiverCount: this.receiverIps.length,
      devices,
      message: !this.options.enabled ? "SLX-D monitoring is disabled. Configure receiver IP addresses before enabling it."
        : !this.started ? "SLX-D monitor is not running."
        : connected ? `Connected to ${connected} of ${this.receiverIps.length} configured SLX-D receivers.`
        : `Trying to connect to ${this.receiverIps.length} configured SLX-D receivers on TCP ${this.options.port}.`,
    };
  }

  async close(): Promise<void> {
    this.stopping = true;
    this.started = false;
    if (this.reconnectTimer) clearInterval(this.reconnectTimer);
    this.reconnectTimer = null;
    for (const device of this.devices.values()) {
      if (device.connected && !device.socket.destroyed) device.socket.end("< SET 1 METER_RATE 00000 >");
      else device.socket.destroy();
    }
    this.devices.clear();
  }
}
