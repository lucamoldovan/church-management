import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import { buildApp } from "./app.js";

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
    "Refusing to bind Veyra to a non-loopback interface without TLS. " +
    "Configure CHURCH_TLS_CERT_PATH and CHURCH_TLS_KEY_PATH.",
  );
}

const app = buildApp({
  dashboardDirectory: process.env.CHURCH_DASHBOARD_DIRECTORY ?? "../dashboard/dist",
  ...(https ? { https } : {}),
  secureCookies: Boolean(https) || process.env.VEYRA_COOKIE_SECURE === "true",
});

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error, "Veyra server failed to start");
  process.exitCode = 1;
}

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, "Shutting down Veyra server");
  try {
    await app.close();
  } catch (error) {
    app.log.error(error, "Error while closing Veyra server");
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
