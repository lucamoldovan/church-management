import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), "../.env") });
import { isIP } from "node:net";
import { buildApp } from "./app.js";
import { ShureSlxdMonitor } from "./shure-slxd.js";

const host = process.env.CHURCH_HOST?.trim() || process.env.VEYRA_HOST?.trim() || "127.0.0.1";
const port = Number(process.env.CHURCH_PORT ?? process.env.VEYRA_PORT ?? "8787");

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("CHURCH_PORT must be an integer between 1 and 65535");
}

function isLoopbackHost(value: string): boolean {
  const normalized = value.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized === "::1") return true;
  if (isIP(normalized) === 4) return normalized.startsWith("127.");
  return normalized.startsWith("::ffff:127.");
}

const certificatePath = (process.env.CHURCH_TLS_CERT_PATH ?? process.env.VEYRA_TLS_CERT_PATH)?.trim();
const privateKeyPath = (process.env.CHURCH_TLS_KEY_PATH ?? process.env.VEYRA_TLS_KEY_PATH)?.trim();

if (Boolean(certificatePath) !== Boolean(privateKeyPath)) {
  throw new Error("Set both CHURCH_TLS_CERT_PATH and CHURCH_TLS_KEY_PATH, or neither");
}

const https = certificatePath && privateKeyPath
  ? {
      cert: readFileSync(certificatePath),
      key: readFileSync(privateKeyPath),
      minVersion: "TLSv1.2" as const,
    }
  : undefined;

if (!isLoopbackHost(host) && !https) {
  throw new Error(
    "Refusing to bind Casa Painii to a non-loopback interface without TLS. " +
    "Configure CHURCH_TLS_CERT_PATH and CHURCH_TLS_KEY_PATH.",
  );
}

const shureMonitor = new ShureSlxdMonitor({
  enabled: process.env.SHURE_SLXD_ENABLED === "true",
  receiverIps: (process.env.SHURE_SLXD_RECEIVER_IPS ?? "").split(",").map((ip) => ip.trim()).filter(Boolean),
  port: Number(process.env.SHURE_SLXD_PORT ?? "2202"),
  meterRateMs: Number(process.env.SHURE_SLXD_METER_RATE_MS ?? "1000"),
});

const app = buildApp({
  shureMonitor,
  dashboardDirectory: process.env.CHURCH_DASHBOARD_DIRECTORY ?? "../dashboard/dist",
  ...(https ? { https } : {}),
  secureCookies: Boolean(https) || process.env.VEYRA_COOKIE_SECURE === "true",
});

try {
  await shureMonitor.start();
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error, "Casa Painii server failed to start");
  await shureMonitor.close().catch(() => undefined);
  process.exitCode = 1;
}

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, "Shutting down Casa Painii server");
  try {
    await app.close();
    await shureMonitor.close();
  } catch (error) {
    app.log.error(error, "Error while closing Casa Painii server");
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
