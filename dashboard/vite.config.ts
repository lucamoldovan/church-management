import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // The dashboard and API share the repository-root .env file.
  const env = loadEnv(mode, "..", "");
  const dashboardPort = Number(env.CHURCH_DASHBOARD_PORT ?? "5173");
  const apiPort = Number(env.CHURCH_PORT ?? "8787");
  if (!Number.isInteger(dashboardPort) || dashboardPort < 1 || dashboardPort > 65535) {
    throw new Error("CHURCH_DASHBOARD_PORT must be a valid TCP port");
  }
  if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) {
    throw new Error("CHURCH_PORT must be a valid TCP port");
  }

  return {
    envDir: "..",
    plugins: [react()],
    server: {
      // Keep the development UI local unless LAN access is explicitly requested.
      host: env.CHURCH_DASHBOARD_HOST ?? "127.0.0.1",
      port: dashboardPort,
      strictPort: true,
      proxy: {
        "/api": {
          target: env.CHURCH_API_TARGET ?? `http://127.0.0.1:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
  };
});
