import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import fastifyStatic from "@fastify/static";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { openDatabase, type VeyraDatabase } from "./database.js";
import { createSession, hashPassword, SESSION_COOKIE, SESSION_TTL, hashSessionToken, verifyPassword } from "./security.js";

interface BuildAppOptions {
  databasePath?: string;
  setupKeyPath?: string;
  setupKey?: string;
  pairingSecretPath?: string;
  pairingSecret?: string;
  mediaDirectory?: string;
  dashboardDirectory?: string;
  https?: { key: Buffer; cert: Buffer; minVersion: "TLSv1.2" };
  secureCookies?: boolean;
}

interface SetupBody {
  setupKey?: unknown;
  username?: unknown;
  password?: unknown;
}

interface LoginBody {
  username?: unknown;
  password?: unknown;
}

function readSetupKey(database: VeyraDatabase, options: BuildAppOptions): { key: string | null; path: string | null; generated: boolean } {
  const operatorCount = database.prepare("SELECT COUNT(*) AS count FROM operators").get() as { count: number };
  const setupKeyPath = resolve(options.setupKeyPath ?? process.env.VEYRA_SETUP_KEY_PATH ?? "data/setup-key");

  if (operatorCount.count > 0) {
    if (!options.setupKey) rmSync(setupKeyPath, { force: true });
    return { key: null, path: null, generated: false };
  }

  if (options.setupKey) return { key: options.setupKey, path: null, generated: false };

  mkdirSync(dirname(setupKeyPath), { recursive: true });

  if (existsSync(setupKeyPath)) {
    const fileInfo = lstatSync(setupKeyPath);
    if (!fileInfo.isFile()) {
      throw new Error("Veyra setup key path must be a regular file, not a symlink or special file");
    }
    chmodSync(setupKeyPath, 0o600);
    const existingKey = readFileSync(setupKeyPath, "utf8").trim();
    if (existingKey.length < 32) {
      throw new Error("Veyra setup key file is empty or invalid; remove it to generate a new key");
    }
    return { key: existingKey, path: setupKeyPath, generated: false };
  }

  const key = randomBytes(24).toString("base64url");
  writeFileSync(setupKeyPath, key + "\n", { mode: 0o600, flag: "wx" });
  return { key, path: setupKeyPath, generated: true };
}

function readPairingSecret(options: BuildAppOptions): Buffer {
  if (options.pairingSecret) {
    const secret = Buffer.from(options.pairingSecret, "utf8");
    if (secret.length < 32) throw new Error("Veyra pairing secret must be at least 32 bytes");
    return secret;
  }

  const secretPath = resolve(options.pairingSecretPath ?? process.env.VEYRA_PAIRING_SECRET_PATH ?? "data/pairing-secret");
  mkdirSync(dirname(secretPath), { recursive: true });

  if (existsSync(secretPath)) {
    const fileInfo = lstatSync(secretPath);
    if (!fileInfo.isFile()) throw new Error("Veyra pairing secret path must be a regular file");
    chmodSync(secretPath, 0o600);
    const value = readFileSync(secretPath, "utf8").trim();
    if (!/^[a-f0-9]{64}$/i.test(value)) {
      throw new Error("Veyra pairing secret file is invalid; restore it from backup or remove it to rotate pairing verification");
    }
    return Buffer.from(value, "hex");
  }

  const secret = randomBytes(32);
  writeFileSync(secretPath, secret.toString("hex") + "\n", { mode: 0o600, flag: "wx" });
  return secret;
}

const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
const MAX_PLAYLIST_BYTES = 512 * 1024 * 1024;

function detectImageMime(buffer: Buffer): "image/png" | "image/jpeg" | "image/webp" | null {
  if (buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer.length >= 12 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

function stripControlCharacters(value: string): string {
  return [...value].filter((character) => {
    const code = character.charCodeAt(0);
    return code >= 0x20 && code !== 0x7f;
  }).join("");
}

function safeDisplayName(rawName: string | undefined): string {
  let decoded = "";
  if (rawName) {
    try { decoded = decodeURIComponent(rawName); } catch { decoded = rawName; }
  }
  return decoded
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replaceAll("/", "_")
    .replaceAll("\\", "_")
    .trim()
    .slice(0, 120) || "Untitled image";
}

function ensurePrivateDirectory(path: string): void {
  const absolutePath = resolve(path);
  const homeDirectory = process.env.HOME ? resolve(process.env.HOME) : "";
  if (absolutePath === process.cwd() || (homeDirectory && absolutePath === homeDirectory)) {
    throw new Error("Veyra media storage must use a dedicated subdirectory");
  }
  const unsafeTargets = new Set([
    "/", "/tmp", "/var", "/var/cache", "/var/lib", "/home", "/root",
    "/etc", "/usr", "/opt", "/run", "/mnt", "/media", "/dev", "/proc",
    "/sys", "/boot",
  ]);
  if (unsafeTargets.has(absolutePath)) {
    throw new Error("Veyra media storage must use a dedicated private directory");
  }
  mkdirSync(absolutePath, { recursive: true, mode: 0o700 });
  const info = lstatSync(absolutePath);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error("Veyra media storage path must be a real directory, not a symlink");
  }
  chmodSync(absolutePath, 0o700);
}

function hashPairingCode(code: string, secret: Buffer): string {
  return createHmac("sha256", secret).update(code).digest("hex");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function getSessionOperator(database: VeyraDatabase, token: string | undefined): { id: string; username: string; role: string } | null {
  if (!token) return null;

  const row = database.prepare(`
    SELECT operators.id, operators.username, operators.role, operators.active, sessions.expires_at
    FROM sessions
    INNER JOIN operators ON operators.id = sessions.operator_id
    WHERE sessions.token_hash = ?
  `).get(hashSessionToken(token)) as { id: string; username: string; role: string; active: number; expires_at: string } | undefined;

  if (!row || row.active !== 1) return null;
  if (Date.parse(row.expires_at) <= Date.now()) {
    database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashSessionToken(token));
    return null;
  }

  return { id: row.id, username: row.username, role: row.role };
}

function getAuthenticatedOperator(database: VeyraDatabase, request: FastifyRequest, reply: FastifyReply): { id: string; username: string } | null {
  const operator = getSessionOperator(database, request.cookies[SESSION_COOKIE]);
  if (!operator) {
    reply.code(401).send({ error: "Authentication required" });
    return null;
  }
  return operator;
}

function setSessionCookie(reply: FastifyReply, token: string, secureCookies: boolean): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const database = openDatabase(options.databasePath);
  let setup: ReturnType<typeof readSetupKey>;
  let pairingSecret: Buffer;
  try {
    setup = readSetupKey(database, options);
    pairingSecret = readPairingSecret(options);
  } catch (error) {
    database.close();
    throw error;
  }
  const secureCookies = Boolean(options.https) || options.secureCookies === true ||
    process.env.VEYRA_COOKIE_SECURE === "true";
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
    ...(options.https ? { https: options.https } : {}),
  });
  const mediaDirectory = resolve(options.mediaDirectory ?? process.env.VEYRA_MEDIA_DIRECTORY ?? "data/media");
  app.addContentTypeParser(
    ["image/png", "image/jpeg", "image/webp"],
    { parseAs: "buffer", bodyLimit: MAX_MEDIA_BYTES },
    (_request, body, done) => done(null, body),
  );

  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Cache-Control", "no-store");
    if (options.https) reply.header("Strict-Transport-Security", "max-age=31536000");
    return payload;
  });

  if (setup.generated && setup.key) {
    app.log.warn({ setupKey: setup.key }, "Veyra first-run setup key — enter this in the dashboard");
  }

  app.register(cookie);
  app.register(rateLimit, { max: 120, timeWindow: "1 minute" });

  const dashboardDirectory = resolve(options.dashboardDirectory ?? process.env.CHURCH_DASHBOARD_DIRECTORY ?? "../dashboard/dist");
  if (existsSync(join(dashboardDirectory, "index.html"))) {
    app.register(fastifyStatic, { root: dashboardDirectory, prefix: "/", wildcard: true });
    app.get("/", async (_request, reply) => reply.sendFile("index.html"));
    app.setNotFoundHandler(async (request, reply) => {
      if (request.method === "GET" && !request.url.startsWith("/api/")) return reply.sendFile("index.html");
      return reply.code(404).send({ error: "Not found" });
    });
  }

  app.addHook("onClose", async () => {
    database.close();
  });

  app.get("/api/v1/health", async () => ({
    status: "ok",
    service: "veyra-server",
    version: "0.1.0",
  }));

  app.get("/api/v1/setup/status", async () => {
    const result = database.prepare("SELECT COUNT(*) AS count FROM operators").get() as { count: number };
    return { setupRequired: result.count === 0 };
  });

  app.post<{ Body: SetupBody }>("/api/v1/setup", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    const body = request.body ?? {};
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const suppliedKey = typeof body.setupKey === "string" ? body.setupKey : "";

    if (!setup.key || !safeEqual(suppliedKey, setup.key)) {
      return reply.code(403).send({ error: "Invalid or expired setup key" });
    }
    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(username)) {
      return reply.code(400).send({ error: "Username must be 3–32 characters and use letters, numbers, _ or -" });
    }
    if (password.length < 12 || password.length > 256) {
      return reply.code(400).send({ error: "Password must be between 12 and 256 characters" });
    }

    const existing = database.prepare("SELECT COUNT(*) AS count FROM operators").get() as { count: number };
    if (existing.count > 0) {
      return reply.code(409).send({ error: "Initial setup has already been completed" });
    }

    const operatorId = randomUUID();
    const createdAt = new Date().toISOString();
    const passwordHash = await hashPassword(password);

    try {
      const createOperator = database.transaction(() => {
        const currentCount = database.prepare("SELECT COUNT(*) AS count FROM operators").get() as { count: number };
        if (currentCount.count > 0) throw new Error("SETUP_ALREADY_COMPLETED");
        database.prepare("INSERT INTO operators (id, username, password_hash, display_name, role, created_at) VALUES (?, ?, ?, ?, 'admin', ?)")
          .run(operatorId, username, passwordHash, username, createdAt);
      });
      createOperator();
    } catch (error) {
      if (error instanceof Error && error.message === "SETUP_ALREADY_COMPLETED") {
        return reply.code(409).send({ error: "Initial setup has already been completed" });
      }
      request.log.error(error, "Could not create initial Veyra operator");
      return reply.code(409).send({ error: "Initial setup could not be completed" });
    }

    if (setup.path) {
      try { rmSync(setup.path, { force: true }); } catch (error) {
        request.log.error(error, "Could not remove used setup key file");
      }
    }

    const session = createSession(database, operatorId);
    setSessionCookie(reply, session.token, secureCookies);
    return reply.code(201).send({ authenticated: true, operator: { id: operatorId, username, role: "admin" } });
  });

  app.get("/api/v1/auth/session", async (request) => {
    const operator = getSessionOperator(database, request.cookies[SESSION_COOKIE]);
    return operator
      ? { authenticated: true, operator }
      : { authenticated: false, operator: null };
  });

  app.post<{ Body: LoginBody }>("/api/v1/auth/session", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    const body = request.body ?? {};
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (password.length === 0 || password.length > 256) {
      return reply.code(400).send({ error: "Password must be between 1 and 256 characters" });
    }

    const operator = database.prepare("SELECT id, username, password_hash, role, active FROM operators WHERE username = ?")
      .get(username) as { id: string; username: string; password_hash: string; role: string; active: number } | undefined;

    if (!operator || operator.active !== 1 || !(await verifyPassword(password, operator.password_hash))) {
      return reply.code(401).send({ error: "Invalid username or password" });
    }

    const session = createSession(database, operator.id);
    setSessionCookie(reply, session.token, secureCookies);
    return { authenticated: true, operator: { id: operator.id, username: operator.username, role: operator.role } };
  });

  app.delete("/api/v1/auth/session", async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashSessionToken(token));
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { authenticated: false };
  });

  app.get("/api/v1/sources", async (request, reply) => {
    const operator = getAuthenticatedOperator(database, request, reply);
    if (!operator) return;

    const deviceRows = database.prepare(`
      SELECT id, name, last_seen_at, discovered_sources_json
      FROM devices
      WHERE credential_revoked_at IS NULL
    `).all() as Array<{
      id: string;
      name: string;
      last_seen_at: string | null;
      discovered_sources_json: string;
    }>;

    const sourceMap = new Map<string, {
      name: string;
      address: string | null;
      devices: Map<string, string>;
      lastSeenAt: string | null;
    }>();
    const nowMs = Date.now();

    for (const device of deviceRows) {
      if (!device.last_seen_at) continue;
      const lastSeenMs = Date.parse(device.last_seen_at);
      if (!Number.isFinite(lastSeenMs) || nowMs - lastSeenMs > 120_000) continue;
      let reported: unknown;
      try { reported = JSON.parse(device.discovered_sources_json); } catch { reported = []; }
      if (!Array.isArray(reported)) continue;

      for (const rawSource of reported) {
        if (typeof rawSource !== "object" || rawSource === null) continue;
        const source = rawSource as { name?: unknown; url?: unknown };
        if (typeof source.name !== "string" || source.name.length === 0) continue;
        const address = typeof source.url === "string" && source.url.length > 0 ? source.url : null;
        const key = address ?? source.name;
        let entry = sourceMap.get(key);
        if (!entry) {
          entry = { name: source.name, address, devices: new Map(), lastSeenAt: null };
          sourceMap.set(key, entry);
        }
        entry.devices.set(device.id, device.name);
        if (device.last_seen_at && (!entry.lastSeenAt || device.last_seen_at > entry.lastSeenAt)) {
          entry.lastSeenAt = device.last_seen_at;
        }
      }
    }

    return {
      sources: [...sourceMap.entries()]
        .map(([id, source]) => ({
          id,
          name: source.name,
          address: source.address,
          deviceCount: source.devices.size,
          devices: [...source.devices.entries()].map(([deviceId, deviceName]) => ({
            id: deviceId,
            name: deviceName,
          })),
          lastSeenAt: source.lastSeenAt,
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    };
  });

  app.post("/api/v1/media", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    const operator = getAuthenticatedOperator(database, request, reply);
    if (!operator) return;

    if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
      return reply.code(400).send({ error: "An image file is required" });
    }
    const image = request.body as Buffer;
    if (image.length > MAX_MEDIA_BYTES) {
      return reply.code(413).send({ error: "Image exceeds the 20 MB upload limit" });
    }

    const detectedMime = detectImageMime(image);
    const declaredMime = ((request.headers["content-type"] ?? "").split(";")[0] ?? "").trim().toLowerCase();
    if (!detectedMime || detectedMime !== declaredMime) {
      return reply.code(415).send({ error: "Only valid PNG, JPEG, and WebP images are supported" });
    }

    const extension = detectedMime === "image/png" ? "png" : detectedMime === "image/jpeg" ? "jpg" : "webp";
    const id = randomUUID();
    const storageKey = `${id}.${extension}`;
    const filenameHeader = request.headers["x-veyra-filename"];
    const displayName = safeDisplayName(typeof filenameHeader === "string" ? filenameHeader : undefined);
    const createdAt = new Date().toISOString();
    const sha256 = createHash("sha256").update(image).digest("hex");

    ensurePrivateDirectory(mediaDirectory);
    const filePath = join(mediaDirectory, storageKey);
    let fileCreated = false;
    try {
      writeFileSync(filePath, image, { flag: "wx", mode: 0o600 });
      fileCreated = true;
      database.prepare(`
        INSERT INTO media_assets (id, display_name, storage_key, mime_type, size_bytes, sha256, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, displayName, storageKey, detectedMime, image.length, sha256, createdAt);
    } catch (error) {
      if (fileCreated) rmSync(filePath, { force: true });
      request.log.error(error, "Could not store uploaded Veyra media");
      return reply.code(500).send({ error: "Image could not be stored" });
    }

    return reply.code(201).send({
      id,
      name: displayName,
      mimeType: detectedMime,
      sizeBytes: image.length,
      sha256,
      createdAt,
      contentUrl: `/api/v1/media/${id}/content`,
    });
  });

  app.get("/api/v1/media", async (request, reply) => {
    const operator = getAuthenticatedOperator(database, request, reply);
    if (!operator) return;

    const media = database.prepare(`
      SELECT id, display_name, mime_type, size_bytes, sha256, created_at
      FROM media_assets
      ORDER BY created_at DESC
    `).all() as Array<{
      id: string;
      display_name: string;
      mime_type: string;
      size_bytes: number;
      sha256: string;
      created_at: string;
    }>;

    return {
      media: media.map((item) => ({
        id: item.id,
        name: item.display_name,
        mimeType: item.mime_type,
        sizeBytes: item.size_bytes,
        sha256: item.sha256,
        createdAt: item.created_at,
        contentUrl: `/api/v1/media/${item.id}/content`,
      })),
    };
  });

  app.get<{ Params: { mediaId: string } }>("/api/v1/media/:mediaId/content", async (request, reply) => {
    const operator = getAuthenticatedOperator(database, request, reply);
    if (!operator) return;

    const item = database.prepare("SELECT storage_key, mime_type FROM media_assets WHERE id = ?")
      .get(request.params.mediaId) as { storage_key: string; mime_type: string } | undefined;
    if (!item) return reply.code(404).send({ error: "Media item not found" });

    try {
      ensurePrivateDirectory(mediaDirectory);
      const filePath = resolve(mediaDirectory, item.storage_key);
      if (dirname(filePath) !== mediaDirectory) {
        return reply.code(404).send({ error: "Media item not found" });
      }
      const content = readFileSync(filePath);
      return reply
        .type(item.mime_type)
        .header("Content-Disposition", "inline")
        .send(content);
    } catch (error) {
      request.log.error(error, "Stored Veyra media file is missing or unreadable");
      return reply.code(404).send({ error: "Media file is unavailable" });
    }
  });

  app.delete<{ Params: { mediaId: string } }>("/api/v1/media/:mediaId", async (request, reply) => {
    const operator = getAuthenticatedOperator(database, request, reply);
    if (!operator) return;

    const item = database.prepare("SELECT storage_key FROM media_assets WHERE id = ?")
      .get(request.params.mediaId) as { storage_key: string } | undefined;
    if (!item) return reply.code(404).send({ error: "Media item not found" });

    const references = database.prepare("SELECT COUNT(*) AS count FROM playlist_items WHERE media_id = ?")
      .get(request.params.mediaId) as { count: number };
    if (references.count > 0) {
      return reply.code(409).send({ error: "This image is used by a playlist and cannot be deleted yet" });
    }

    try {
      ensurePrivateDirectory(mediaDirectory);
      const filePath = resolve(mediaDirectory, item.storage_key);
      if (dirname(filePath) !== mediaDirectory) {
        return reply.code(500).send({ error: "Stored media path is invalid" });
      }
      rmSync(filePath, { force: true });
      database.prepare("DELETE FROM media_assets WHERE id = ?").run(request.params.mediaId);
      return reply.code(204).send();
    } catch (error) {
      request.log.error(error, "Could not delete Veyra media");
      return reply.code(500).send({ error: "Image could not be deleted" });
    }
  });

  app.get("/api/v1/playlists", async (request, reply) => {
    const operator = getAuthenticatedOperator(database, request, reply);
    if (!operator) return;

    const playlists = database.prepare(`
      SELECT playlists.id, playlists.name, playlists.description, playlists.created_at,
             playlists.updated_at, COUNT(playlist_items.id) AS item_count
      FROM playlists
      LEFT JOIN playlist_items ON playlist_items.playlist_id = playlists.id
      GROUP BY playlists.id
      ORDER BY playlists.updated_at DESC
    `).all() as Array<{
      id: string;
      name: string;
      description: string;
      created_at: string;
      updated_at: string;
      item_count: number;
    }>;

    return {
      playlists: playlists.map((playlist) => ({
        id: playlist.id,
        name: playlist.name,
        description: playlist.description,
        itemCount: playlist.item_count,
        createdAt: playlist.created_at,
        updatedAt: playlist.updated_at,
      })),
    };
  });

  app.post<{ Body: { name?: unknown; description?: unknown } }>("/api/v1/playlists", async (request, reply) => {
    const operator = getAuthenticatedOperator(database, request, reply);
    if (!operator) return;

    const body = request.body ?? {};
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    if (name.length < 1 || name.length > 80) {
      return reply.code(400).send({ error: "Playlist name must be between 1 and 80 characters" });
    }
    if (description.length > 500) {
      return reply.code(400).send({ error: "Playlist description cannot exceed 500 characters" });
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    database.prepare("INSERT INTO playlists (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, name, description, now, now);
    return reply.code(201).send({ id, name, description, itemCount: 0, createdAt: now, updatedAt: now });
  });

  app.get<{ Params: { playlistId: string } }>("/api/v1/playlists/:playlistId", async (request, reply) => {
    const operator = getAuthenticatedOperator(database, request, reply);
    if (!operator) return;

    const playlist = database.prepare("SELECT id, name, description, created_at, updated_at FROM playlists WHERE id = ?")
      .get(request.params.playlistId) as {
        id: string; name: string; description: string; created_at: string; updated_at: string;
      } | undefined;
    if (!playlist) return reply.code(404).send({ error: "Playlist not found" });

    const items = database.prepare(`
      SELECT playlist_items.id, playlist_items.media_id, playlist_items.position,
             playlist_items.duration_seconds, media_assets.display_name, media_assets.mime_type,
             media_assets.size_bytes
      FROM playlist_items
      INNER JOIN media_assets ON media_assets.id = playlist_items.media_id
      WHERE playlist_items.playlist_id = ?
      ORDER BY playlist_items.position ASC
    `).all(playlist.id) as Array<{
      id: string; media_id: string; position: number; duration_seconds: number;
      display_name: string; mime_type: string; size_bytes: number;
    }>;

    return {
      id: playlist.id,
      name: playlist.name,
      description: playlist.description,
      createdAt: playlist.created_at,
      updatedAt: playlist.updated_at,
      items: items.map((item) => ({
        id: item.id,
        mediaId: item.media_id,
        position: item.position,
        durationSeconds: item.duration_seconds,
        mediaName: item.display_name,
        mimeType: item.mime_type,
        sizeBytes: item.size_bytes,
        contentUrl: `/api/v1/media/${item.media_id}/content`,
      })),
    };
  });

  app.put<{ Params: { playlistId: string }; Body: { name?: unknown; description?: unknown; items?: unknown } }>(
    "/api/v1/playlists/:playlistId",
    async (request, reply) => {
      const operator = getAuthenticatedOperator(database, request, reply);
      if (!operator) return;

      const existing = database.prepare("SELECT id FROM playlists WHERE id = ?")
        .get(request.params.playlistId) as { id: string } | undefined;
      if (!existing) return reply.code(404).send({ error: "Playlist not found" });

      const body = request.body ?? {};
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const description = typeof body.description === "string" ? body.description.trim() : "";
      if (name.length < 1 || name.length > 80) {
        return reply.code(400).send({ error: "Playlist name must be between 1 and 80 characters" });
      }
      if (description.length > 500) {
        return reply.code(400).send({ error: "Playlist description cannot exceed 500 characters" });
      }
      if (!Array.isArray(body.items) || body.items.length > 200) {
        return reply.code(400).send({ error: "Playlist items must be an array containing at most 200 images" });
      }

      const items: Array<{ mediaId: string; durationSeconds: number }> = [];
      for (const rawItem of body.items) {
        if (typeof rawItem !== "object" || rawItem === null) {
          return reply.code(400).send({ error: "Each playlist item must be an object" });
        }
        const item = rawItem as { mediaId?: unknown; durationSeconds?: unknown };
        if (typeof item.mediaId !== "string" || item.mediaId.length < 1 ||
            typeof item.durationSeconds !== "number" || !Number.isInteger(item.durationSeconds) ||
            item.durationSeconds < 1 || item.durationSeconds > 3600) {
          return reply.code(400).send({ error: "Each item needs a media ID and a duration from 1 to 3600 seconds" });
        }
        items.push({ mediaId: item.mediaId, durationSeconds: item.durationSeconds });
      }

      const uniqueMediaIds = [...new Set(items.map((item) => item.mediaId))];
      if (uniqueMediaIds.length > 0) {
        const placeholders = uniqueMediaIds.map(() => "?").join(",");
        const found = database.prepare(`SELECT id, size_bytes FROM media_assets WHERE id IN (${placeholders})`)
          .all(...uniqueMediaIds) as Array<{ id: string; size_bytes: number }>;
        if (found.length !== uniqueMediaIds.length) {
          return reply.code(400).send({ error: "One or more playlist images do not exist in the media library" });
        }
        const sizesById = new Map(found.map((asset) => [asset.id, asset.size_bytes]));
        const totalBytes = items.reduce((total, item) => total + (sizesById.get(item.mediaId) ?? 0), 0);
        if (totalBytes > MAX_PLAYLIST_BYTES) {
          return reply.code(400).send({ error: "A receiver fallback playlist cannot exceed 512 MiB" });
        }
      }

      const now = new Date().toISOString();
      const replaceItems = database.transaction(() => {
        database.prepare("UPDATE playlists SET name = ?, description = ?, updated_at = ?, revision = revision + 1 WHERE id = ?")
          .run(name, description, now, request.params.playlistId);
        database.prepare("DELETE FROM playlist_items WHERE playlist_id = ?").run(request.params.playlistId);
        const insert = database.prepare(`
          INSERT INTO playlist_items (id, playlist_id, media_id, position, duration_seconds)
          VALUES (?, ?, ?, ?, ?)
        `);
        items.forEach((item, position) => {
          insert.run(randomUUID(), request.params.playlistId, item.mediaId, position, item.durationSeconds);
        });
      });
      replaceItems();

      return {
        id: request.params.playlistId,
        name,
        description,
        itemCount: items.length,
        updatedAt: now,
      };
    },
  );

  app.delete<{ Params: { playlistId: string } }>("/api/v1/playlists/:playlistId", async (request, reply) => {
    const operator = getAuthenticatedOperator(database, request, reply);
    if (!operator) return;

    const result = database.prepare("DELETE FROM playlists WHERE id = ?").run(request.params.playlistId);
    if (result.changes === 0) return reply.code(404).send({ error: "Playlist not found" });
    return reply.code(204).send();
  });

  app.post("/api/v1/devices/pairing-codes", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    const operator = getAuthenticatedOperator(database, request, reply);
    if (!operator) return;

    const code = randomInt(0, 1_000_000_000_000).toString().padStart(12, "0");
    database.prepare("DELETE FROM pairing_codes WHERE expires_at <= ? OR used_at IS NOT NULL")
      .run(new Date().toISOString());
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();

    database.prepare(`
      INSERT INTO pairing_codes (id, code_hash, created_by, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(randomUUID(), hashPairingCode(code, pairingSecret), operator.id, expiresAt, now.toISOString());

    return reply.code(201).send({ code, expiresAt });
  });

  app.get("/api/v1/devices", async (request, reply) => {
    const operator = getAuthenticatedOperator(database, request, reply);
    if (!operator) return;

    const rows = database.prepare(`
      SELECT id, name, platform, software_version, last_seen_at, last_ip,
             playback_mode, ndi_source_name, uptime_seconds, created_at,
             credential_revoked_at, config_version, assigned_ndi_source_name,
             assigned_ndi_source_address, fallback_playlist_id
      FROM devices
      ORDER BY name COLLATE NOCASE ASC
    `).all() as Array<{
      id: string;
      name: string;
      platform: string;
      software_version: string;
      last_seen_at: string | null;
      last_ip: string | null;
      playback_mode: string;
      ndi_source_name: string | null;
      uptime_seconds: number | null;
      created_at: string;
      credential_revoked_at: string | null;
      config_version: number;
      assigned_ndi_source_name: string | null;
      assigned_ndi_source_address: string | null;
      fallback_playlist_id: string | null;
    }>;

    const now = Date.now();
    return {
      devices: rows.map((device) => {
        const age = device.last_seen_at ? now - Date.parse(device.last_seen_at) : Number.POSITIVE_INFINITY;
        const status = age <= 45_000 ? "online" : age <= 120_000 ? "stale" : "offline";
        return {
          id: device.id,
          name: device.name,
          status,
          platform: device.platform,
          softwareVersion: device.software_version,
          lastSeenAt: device.last_seen_at,
          lastIp: device.last_ip,
          playbackMode: device.playback_mode,
          ndiSourceName: device.ndi_source_name,
          uptimeSeconds: device.uptime_seconds,
          createdAt: device.created_at,
          credentialRevokedAt: device.credential_revoked_at,
          credentialStatus: device.credential_revoked_at ? "revoked" : "active",
          configVersion: device.config_version,
          assignedNdiSourceName: device.assigned_ndi_source_name,
          assignedNdiSourceAddress: device.assigned_ndi_source_address,
          fallbackPlaylistId: device.fallback_playlist_id,
        };
      }),
    };
  });


  app.put<{ Params: { deviceId: string }; Body: { ndiSourceName?: unknown; ndiSourceAddress?: unknown; fallbackPlaylistId?: unknown } }>(
    "/api/v1/devices/:deviceId/config",
    async (request, reply) => {
      const operator = getAuthenticatedOperator(database, request, reply);
      if (!operator) return;

      const device = database.prepare(
        "SELECT id FROM devices WHERE id = ? AND credential_revoked_at IS NULL",
      ).get(request.params.deviceId) as { id: string } | undefined;
      if (!device) return reply.code(404).send({ error: "Active device not found" });

      const body = request.body ?? {};
      const sourceName = body.ndiSourceName === null || body.ndiSourceName === ""
        ? null
        : typeof body.ndiSourceName === "string" ? stripControlCharacters(body.ndiSourceName).trim() : undefined;
      const sourceAddress = body.ndiSourceAddress === null || body.ndiSourceAddress === ""
        ? null
        : typeof body.ndiSourceAddress === "string" ? stripControlCharacters(body.ndiSourceAddress).trim() : undefined;
      const fallbackPlaylistId = body.fallbackPlaylistId === null || body.fallbackPlaylistId === ""
        ? null
        : typeof body.fallbackPlaylistId === "string" ? body.fallbackPlaylistId : undefined;

      if (sourceName === undefined || sourceAddress === undefined || fallbackPlaylistId === undefined ||
          (sourceName !== null && (sourceName.length === 0 || sourceName.length > 160)) ||
          (sourceAddress !== null && (sourceAddress.length === 0 || sourceAddress.length > 2048))) {
        return reply.code(400).send({ error: "Invalid device configuration values" });
      }
      if ((sourceName === null) !== (sourceAddress === null)) {
        return reply.code(400).send({ error: "Set both NDI source name and address, or clear both" });
      }
      if (fallbackPlaylistId !== null) {
        const playlist = database.prepare("SELECT id FROM playlists WHERE id = ?")
          .get(fallbackPlaylistId) as { id: string } | undefined;
        if (!playlist) return reply.code(400).send({ error: "Fallback playlist does not exist" });
      }

      database.prepare(`
        UPDATE devices
        SET assigned_ndi_source_name = ?, assigned_ndi_source_address = ?,
            fallback_playlist_id = ?, config_version = config_version + 1,
            updated_at = ?
        WHERE id = ?
      `).run(sourceName, sourceAddress, fallbackPlaylistId, new Date().toISOString(), device.id);

      const updated = database.prepare(`
        SELECT config_version, assigned_ndi_source_name, assigned_ndi_source_address,
               fallback_playlist_id
        FROM devices WHERE id = ?
      `).get(device.id) as {
        config_version: number; assigned_ndi_source_name: string | null;
        assigned_ndi_source_address: string | null; fallback_playlist_id: string | null;
      };
      return {
        deviceId: device.id,
        configVersion: updated.config_version,
        ndiSourceName: updated.assigned_ndi_source_name,
        ndiSourceAddress: updated.assigned_ndi_source_address,
        fallbackPlaylistId: updated.fallback_playlist_id,
      };
    },
  );

  function authenticateReceiver(request: FastifyRequest, reply: FastifyReply): { id: string } | null {
    const authorization = request.headers.authorization ?? "";
    const deviceToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!deviceToken) {
      reply.code(401).send({ error: "Device authentication required" });
      return null;
    }
    const device = database.prepare(
      "SELECT id FROM devices WHERE device_token_hash = ? AND credential_revoked_at IS NULL",
    ).get(hashSessionToken(deviceToken)) as { id: string } | undefined;
    if (!device) {
      reply.code(401).send({ error: "Invalid device credential" });
      return null;
    }
    return device;
  }

  app.get("/api/v1/receiver/config", async (request, reply) => {
    const device = authenticateReceiver(request, reply);
    if (!device) return;
    const config = database.prepare(`
      SELECT config_version, assigned_ndi_source_name, assigned_ndi_source_address,
             fallback_playlist_id
      FROM devices WHERE id = ?
    `).get(device.id) as {
      config_version: number; assigned_ndi_source_name: string | null;
      assigned_ndi_source_address: string | null; fallback_playlist_id: string | null;
    };
    return {
      schemaVersion: 1,
      configVersion: config.config_version,
      ndi: { sourceName: config.assigned_ndi_source_name, sourceAddress: config.assigned_ndi_source_address },
      fallbackPlaylistId: config.fallback_playlist_id,
    };
  });

  app.get("/api/v1/receiver/media-manifest", async (request, reply) => {
    const device = authenticateReceiver(request, reply);
    if (!device) return;
    const assignment = database.prepare(`
      SELECT d.config_version, d.fallback_playlist_id, p.updated_at, p.revision
      FROM devices d LEFT JOIN playlists p ON p.id = d.fallback_playlist_id
      WHERE d.id = ?
    `).get(device.id) as { config_version: number; fallback_playlist_id: string | null; updated_at: string | null; revision: number | null };
    const items = assignment.fallback_playlist_id ? database.prepare(`
      SELECT pi.position, pi.duration_seconds, ma.id, ma.mime_type, ma.size_bytes, ma.sha256
      FROM playlist_items pi
      INNER JOIN media_assets ma ON ma.id = pi.media_id
      WHERE pi.playlist_id = ?
      ORDER BY pi.position ASC
    `).all(assignment.fallback_playlist_id) as Array<{
      position: number; duration_seconds: number; id: string; mime_type: string; size_bytes: number; sha256: string;
    }> : [];
    return {
      schemaVersion: 1,
      configVersion: assignment.config_version,
      playlistId: assignment.fallback_playlist_id,
      playlistUpdatedAt: assignment.updated_at,
      playlistRevision: assignment.revision,
      items: items.map((item) => ({
        mediaId: item.id,
        position: item.position,
        durationSeconds: item.duration_seconds,
        mimeType: item.mime_type,
        sizeBytes: item.size_bytes,
        sha256: item.sha256,
        downloadPath: `/api/v1/receiver/media/${item.id}`,
      })),
    };
  });

  app.get<{ Params: { mediaId: string } }>("/api/v1/receiver/media/:mediaId", async (request, reply) => {
    const device = authenticateReceiver(request, reply);
    if (!device) return;
    const asset = database.prepare(`
      SELECT ma.storage_key, ma.mime_type
      FROM media_assets ma
      INNER JOIN playlist_items pi ON pi.media_id = ma.id
      INNER JOIN devices d ON d.fallback_playlist_id = pi.playlist_id
      WHERE d.id = ? AND ma.id = ?
      LIMIT 1
    `).get(device.id, request.params.mediaId) as { storage_key: string; mime_type: string } | undefined;
    if (!asset) return reply.code(404).send({ error: "Assigned media item not found" });
    try {
      ensurePrivateDirectory(mediaDirectory);
      const filePath = resolve(mediaDirectory, asset.storage_key);
      if (dirname(filePath) !== mediaDirectory) return reply.code(404).send({ error: "Media item not found" });
      return reply.type(asset.mime_type).header("Cache-Control", "private, no-store").send(readFileSync(filePath));
    } catch (error) {
      request.log.error(error, "Assigned Veyra media is missing or unreadable");
      return reply.code(404).send({ error: "Media file is unavailable" });
    }
  });

  app.delete<{ Params: { deviceId: string } }>("/api/v1/devices/:deviceId", async (request, reply) => {
    const operator = getAuthenticatedOperator(database, request, reply);
    if (!operator) return;

    const result = database.prepare("DELETE FROM devices WHERE id = ? AND credential_revoked_at IS NOT NULL")
      .run(request.params.deviceId);
    if (result.changes === 0) {
      return reply.code(409).send({ error: "Revoke the device credential before removing the device" });
    }
    return reply.code(204).send();
  });

  app.post<{ Params: { deviceId: string } }>("/api/v1/devices/:deviceId/revoke", async (request, reply) => {
    const operator = getAuthenticatedOperator(database, request, reply);
    if (!operator) return;

    const result = database.prepare(`
      UPDATE devices
      SET credential_revoked_at = COALESCE(credential_revoked_at, ?), updated_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), new Date().toISOString(), request.params.deviceId);
    if (result.changes === 0) {
      return reply.code(404).send({ error: "Device not found" });
    }
    return { revoked: true };
  });

  app.post<{ Body: { code?: unknown; deviceName?: unknown; platform?: unknown; version?: unknown } }>(
    "/api/v1/receiver/pair",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = request.body ?? {};
      const code = typeof body.code === "string" ? body.code.trim() : "";
      const deviceName = typeof body.deviceName === "string" ? body.deviceName.trim() : "";
      const platform = typeof body.platform === "string" ? body.platform.trim().slice(0, 80) : "unknown";
      const version = typeof body.version === "string" ? body.version.trim().slice(0, 40) : "unknown";

      if (!/^\d{12}$/.test(code)) {
        return reply.code(400).send({ error: "Pairing code must contain 12 digits" });
      }
      if (deviceName.length < 1 || deviceName.length > 64) {
        return reply.code(400).send({ error: "Device name must be between 1 and 64 characters" });
      }

      const deviceId = randomUUID();
      const deviceToken = randomBytes(32).toString("base64url");
      const now = new Date().toISOString();

      const pairDevice = database.transaction(() => {
        const pairing = database.prepare(`
          SELECT id, expires_at, used_at
          FROM pairing_codes
          WHERE code_hash = ?
        `).get(hashPairingCode(code, pairingSecret)) as { id: string; expires_at: string; used_at: string | null } | undefined;

        if (!pairing || pairing.used_at || Date.parse(pairing.expires_at) <= Date.now()) return false;

        const used = database.prepare("UPDATE pairing_codes SET used_at = ? WHERE id = ? AND used_at IS NULL")
          .run(now, pairing.id);
        if (used.changes !== 1) return false;

        database.prepare(`
          INSERT INTO devices (
            id, name, device_token_hash, platform, software_version,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(deviceId, deviceName, hashSessionToken(deviceToken), platform || "unknown", version || "unknown", now, now);

        return true;
      });

      if (!pairDevice()) {
        return reply.code(403).send({ error: "Pairing code is invalid, expired, or already used" });
      }

      return reply.code(201).send({
        deviceId,
        deviceToken,
        heartbeatIntervalSeconds: 15,
      });
    },
  );

  app.post<{ Body: { version?: unknown; platform?: unknown; uptimeSeconds?: unknown; playbackMode?: unknown; ndiSourceName?: unknown; ndiSources?: unknown } }>(
    "/api/v1/receiver/heartbeat",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const device = authenticateReceiver(request, reply);
      if (!device) return;

      const body = request.body ?? {};
      const version = typeof body.version === "string" ? body.version.trim().slice(0, 40) : "unknown";
      const platform = typeof body.platform === "string" ? body.platform.trim().slice(0, 80) : "unknown";
      const uptimeSeconds = typeof body.uptimeSeconds === "number" &&
        Number.isSafeInteger(body.uptimeSeconds) && body.uptimeSeconds >= 0
        ? body.uptimeSeconds
        : null;
      const allowedModes = new Set(["ndi", "fallback", "idle", "error", "unknown"]);
      const playbackMode = typeof body.playbackMode === "string" && allowedModes.has(body.playbackMode)
        ? body.playbackMode
        : "unknown";
      const ndiSourceName = typeof body.ndiSourceName === "string"
        ? body.ndiSourceName.slice(0, 160)
        : null;
      let discoveredSourcesJson: string | null = null;
      if (body.ndiSources !== undefined) {
        if (!Array.isArray(body.ndiSources) || body.ndiSources.length > 100) {
          return reply.code(400).send({ error: "ndiSources must be an array of at most 100 sources" });
        }
        const discoveredSources: Array<{ name: string; url: string }> = [];
        const seenSources = new Set<string>();
        for (const rawSource of body.ndiSources) {
          if (typeof rawSource !== "object" || rawSource === null) {
            return reply.code(400).send({ error: "Each discovered source must be an object" });
          }
          const source = rawSource as { name?: unknown; url?: unknown };
          const sourceName = typeof source.name === "string"
            ? stripControlCharacters(source.name)
            : "";
          const sourceUrl = typeof source.url === "string"
            ? stripControlCharacters(source.url)
            : "";
          if (!sourceName) {
            return reply.code(400).send({ error: "Each discovered source needs a valid name" });
          }
          const identity = sourceUrl || sourceName;
          if (seenSources.has(identity)) continue;
          seenSources.add(identity);
          discoveredSources.push({ name: sourceName, url: sourceUrl });
        }
        discoveredSourcesJson = JSON.stringify(discoveredSources);
      }
      const now = new Date().toISOString();

      database.prepare(`
        UPDATE devices
        SET last_seen_at = ?, last_ip = ?, software_version = ?, platform = ?,
            playback_mode = ?, ndi_source_name = ?, uptime_seconds = ?,
            discovered_sources_json = COALESCE(?, discovered_sources_json), updated_at = ?
        WHERE id = ?
      `).run(now, request.ip, version || "unknown", platform || "unknown", playbackMode, ndiSourceName, uptimeSeconds, discoveredSourcesJson, now, device.id);

      return { accepted: true, serverTime: now };
    },
  );


  // Church operations API. All routes remain inside the authenticated local control plane.
  const requireOperator = (request: FastifyRequest, reply: FastifyReply) =>
    getAuthenticatedOperator(database, request, reply);

  const requireAdmin = (request: FastifyRequest, reply: FastifyReply) => {
    const operator = requireOperator(request, reply);
    if (!operator) return null;
    const row = database.prepare("SELECT role, active FROM operators WHERE id = ?").get(operator.id) as
      { role: string; active: number } | undefined;
    if (!row || row.active !== 1) {
      reply.code(403).send({ error: "This staff account is disabled" });
      return null;
    }
    if (row.role !== "admin") {
      reply.code(403).send({ error: "Administrator permission required" });
      return null;
    }
    return operator;
  };

  const requireProductionOperator = (request: FastifyRequest, reply: FastifyReply) => {
    const operator = requireOperator(request, reply);
    if (!operator) return null;
    const row = database.prepare("SELECT role, active FROM operators WHERE id = ?").get(operator.id) as
      { role: string; active: number } | undefined;
    if (!row || row.active !== 1) {
      reply.code(403).send({ error: "This staff account is disabled" });
      return null;
    }
    if (row.role !== "admin" && row.role !== "production") {
      reply.code(403).send({ error: "Production permission required" });
      return null;
    }
    return operator;
  };

  app.get("/api/v1/church/overview", async (request, reply) => {
    if (!requireOperator(request, reply)) return;
    const staff = database.prepare("SELECT COUNT(*) AS count FROM operators WHERE active = 1").get() as { count: number };
    const services = database.prepare("SELECT COUNT(*) AS count FROM church_services WHERE starts_at >= ?").get(new Date().toISOString()) as { count: number };
    const events = database.prepare("SELECT COUNT(*) AS count FROM church_events WHERE status != 'cancelled' AND (ends_at IS NULL OR ends_at >= ?)").get(new Date().toISOString()) as { count: number };
    const groups = database.prepare("SELECT COUNT(*) AS count FROM church_groups WHERE active = 1").get() as { count: number };
    const devices = database.prepare("SELECT COUNT(*) AS count, SUM(CASE WHEN last_seen_at >= ? THEN 1 ELSE 0 END) AS online FROM devices WHERE credential_revoked_at IS NULL").get(new Date(Date.now() - 60_000).toISOString()) as { count: number; online: number | null };
    const propresenter = database.prepare("SELECT connected, version, presentation_name, slide_index, slide_count, slide_text, last_checked_at, error FROM propresenter_state WHERE id = 1").get() ?? null;
    return {
      staffCount: staff.count,
      upcomingServices: services.count,
      activeEvents: events.count,
      activeGroups: groups.count,
      receiverCount: devices.count,
      onlineReceivers: devices.online ?? 0,
      propresenter,
    };
  });

  app.get("/api/v1/church/staff", async (request, reply) => {
    if (!requireOperator(request, reply)) return;
    const rows = database.prepare(`
      SELECT id, username, display_name AS displayName, role, department, active, created_at AS createdAt
      FROM operators ORDER BY display_name COLLATE NOCASE, username COLLATE NOCASE
    `).all();
    return { staff: rows };
  });

  app.post<{ Body: Record<string, unknown> }>("/api/v1/church/staff", async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const body = request.body ?? {};
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const role = typeof body.role === "string" ? body.role : "staff";
    const department = typeof body.department === "string" ? body.department.trim() : null;
    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(username)) return reply.code(400).send({ error: "Username must be 3–32 characters and use letters, numbers, _ or -" });
    if (password.length < 12 || password.length > 256) return reply.code(400).send({ error: "Password must be at least 12 characters" });
    if (!displayName || displayName.length > 100) return reply.code(400).send({ error: "A display name is required" });
    if (!["admin", "staff", "production", "leader"].includes(role)) return reply.code(400).send({ error: "Invalid staff role" });
    const id = randomUUID();
    const now = new Date().toISOString();
    try {
      database.prepare("INSERT INTO operators (id, username, password_hash, display_name, role, department, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)")
        .run(id, username, await hashPassword(password), displayName, role, department, now);
    } catch {
      return reply.code(409).send({ error: "That username is already in use" });
    }
    return reply.code(201).send({ id, username, displayName, role, department, active: true, createdAt: now });
  });

  app.patch<{ Params: { staffId: string }; Body: Record<string, unknown> }>("/api/v1/church/staff/:staffId", async (request, reply) => {
    const actor = requireAdmin(request, reply);
    if (!actor) return;
    const body = request.body ?? {};
    const current = database.prepare("SELECT id, role, active FROM operators WHERE id = ?").get(request.params.staffId) as
      { id: string; role: string; active: number } | undefined;
    if (!current) return reply.code(404).send({ error: "Staff account not found" });
    const role = typeof body.role === "string" ? body.role : null;
    const active = typeof body.active === "boolean" ? (body.active ? 1 : 0) : null;
    const department = typeof body.department === "string" ? body.department.trim() : undefined;
    if (role && !["admin", "staff", "production", "leader"].includes(role)) return reply.code(400).send({ error: "Invalid staff role" });

    const removesAdminAccess = (role !== null ? role !== "admin" : current.role !== "admin") ||
      (active !== null ? active !== 1 : current.active !== 1);
    if (current.role === "admin" && current.active === 1 && removesAdminAccess) {
      const otherAdmins = database.prepare("SELECT COUNT(*) AS count FROM operators WHERE role = 'admin' AND active = 1 AND id != ?")
        .get(current.id) as { count: number };
      if (otherAdmins.count === 0) {
        return reply.code(409).send({ error: "The church must retain at least one active administrator" });
      }
    }

    database.prepare("UPDATE operators SET role = COALESCE(?, role), active = COALESCE(?, active), department = COALESCE(?, department) WHERE id = ?")
      .run(role, active, department === undefined ? null : department, request.params.staffId);
    return { updated: true };
  });

  app.get("/api/v1/church/services", async (request, reply) => {
    if (!requireOperator(request, reply)) return;
    const services = database.prepare(`
      SELECT s.id, s.title, s.starts_at AS startsAt, s.ends_at AS endsAt, s.status, s.location, s.notes, s.source, s.external_id AS externalId, s.service_type_name AS serviceTypeName,
             (SELECT COUNT(*) FROM church_service_items i WHERE i.service_id = s.id) AS itemCount
      FROM church_services s ORDER BY s.starts_at IS NULL, s.starts_at ASC LIMIT 100
    `).all();
    return { services };
  });

  app.post<{ Body: Record<string, unknown> }>("/api/v1/church/services", async (request, reply) => {
    if (!requireOperator(request, reply)) return;
    const body = request.body ?? {};
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title || title.length > 160) return reply.code(400).send({ error: "Service title is required (maximum 160 characters)" });
    const id = randomUUID();
    const now = new Date().toISOString();
    database.prepare("INSERT INTO church_services (id, title, starts_at, ends_at, status, location, notes, source, created_at, updated_at) VALUES (?, ?, ?, ?, 'planned', ?, ?, 'local', ?, ?)")
      .run(id, title, typeof body.startsAt === "string" ? body.startsAt : null, typeof body.endsAt === "string" ? body.endsAt : null, typeof body.location === "string" ? body.location : null, typeof body.notes === "string" ? body.notes : null, now, now);
    return reply.code(201).send({ id, title, startsAt: body.startsAt ?? null, endsAt: body.endsAt ?? null, status: "planned", source: "local" });
  });

  app.get<{ Params: { serviceId: string } }>("/api/v1/church/services/:serviceId/workspace", async (request, reply) => {
    if (!requireOperator(request, reply)) return;
    const service = database.prepare("SELECT id, title, starts_at AS startsAt, ends_at AS endsAt, status, location, notes, source, external_id AS externalId, service_type_name AS serviceTypeName FROM church_services WHERE id = ?").get(request.params.serviceId);
    if (!service) return reply.code(404).send({ error: "Service not found" });
    const items = database.prepare("SELECT id, position, title, item_type AS itemType, duration_seconds AS durationSeconds, assigned_to AS assignedTo, notes, song_external_id AS songExternalId, arrangement_external_id AS arrangementExternalId, service_position AS servicePosition FROM church_service_items WHERE service_id = ? ORDER BY position ASC, title COLLATE NOCASE").all(request.params.serviceId) as Array<Record<string, unknown>>;
    const itemAssignments = database.prepare("SELECT ia.id, ia.item_id AS itemId, ia.assignable_type AS assignableType, ia.assignable_external_id AS assignableExternalId, COALESCE(p.display_name, pos.name, ia.display_name) AS displayName FROM service_item_assignments ia LEFT JOIN service_people p ON p.id = ia.person_id LEFT JOIN service_positions pos ON pos.id = ia.position_id JOIN church_service_items i ON i.id = ia.item_id WHERE i.service_id = ? ORDER BY displayName COLLATE NOCASE").all(request.params.serviceId);
    const teams = database.prepare("SELECT t.id, t.external_id AS externalId, t.name, t.sequence FROM service_plan_teams pt JOIN service_teams t ON t.id = pt.team_id WHERE pt.service_id = ? ORDER BY pt.position, t.sequence, t.name COLLATE NOCASE").all(request.params.serviceId);
    const assignments = database.prepare("SELECT a.id, a.person_id AS personId, p.display_name AS personName, a.team_id AS teamId, t.name AS teamName, a.position_id AS positionId, COALESCE(pos.name, a.position_name) AS positionName, a.status, a.notes, (SELECT group_concat(pt.name, ', ') FROM service_assignment_times sat JOIN service_plan_times pt ON pt.id = sat.plan_time_id WHERE sat.assignment_id = a.id) AS serviceTimes FROM service_plan_assignments a JOIN service_people p ON p.id = a.person_id LEFT JOIN service_teams t ON t.id = a.team_id LEFT JOIN service_positions pos ON pos.id = a.position_id WHERE a.service_id = ? ORDER BY t.sequence, t.name COLLATE NOCASE, COALESCE(pos.sequence, 9999), positionName COLLATE NOCASE, p.display_name COLLATE NOCASE").all(request.params.serviceId);
    const times = database.prepare("SELECT id, external_id AS externalId, name, starts_at AS startsAt, ends_at AS endsAt, time_type AS timeType FROM service_plan_times WHERE service_id = ? ORDER BY starts_at, name").all(request.params.serviceId);
    const live = database.prepare("SELECT matched_item_id AS matchedItemId, match_method AS matchMethod, presentation_name AS presentationName, current_slide_text AS currentSlideText, current_slide_uuid AS currentSlideUuid, connected, observed_at AS observedAt, stale_at AS staleAt, message FROM service_live_state WHERE service_id = ?").get(request.params.serviceId) ?? null;
    const assignmentsByItem = new Map<string, Array<Record<string, unknown>>>();
    for (const assignment of itemAssignments as Array<Record<string, unknown>>) {
      const itemId = String(assignment.itemId);
      const list = assignmentsByItem.get(itemId) ?? [];
      list.push(assignment);
      assignmentsByItem.set(itemId, list);
    }
    return {
      service,
      items: items.map((item) => ({ ...item, assignments: assignmentsByItem.get(String(item.id)) ?? [] })),
      teams, assignments, times, live,
    };
  });

  app.get("/api/v1/church/teams", async (request, reply) => {
    if (!requireOperator(request, reply)) return;
    const teams = database.prepare("SELECT id, external_id AS externalId, name, sequence, archived_at AS archivedAt FROM service_teams ORDER BY sequence, name COLLATE NOCASE").all() as Array<Record<string, unknown>>;
    const positions = database.prepare("SELECT id, external_id AS externalId, team_id AS teamId, name, sequence FROM service_positions ORDER BY sequence, name COLLATE NOCASE").all() as Array<Record<string, unknown>>;
    const members = database.prepare("SELECT m.id, m.position_id AS positionId, p.id AS personId, p.display_name AS personName, m.schedule_preference AS schedulePreference FROM service_team_memberships m JOIN service_people p ON p.id = m.person_id ORDER BY p.display_name COLLATE NOCASE").all() as Array<Record<string, unknown>>;
    return { teams: teams.map((team) => ({
      ...team,
      positions: positions.filter((position) => position.teamId === team.id).map((position) => ({
        ...position,
        members: members.filter((member) => member.positionId === position.id),
      })),
    })) };
  });

  app.get<{ Params: { serviceId: string } }>("/api/v1/church/services/:serviceId/items", async (request, reply) => {
    if (!requireOperator(request, reply)) return;
    const service = database.prepare("SELECT id FROM church_services WHERE id = ?").get(request.params.serviceId);
    if (!service) return reply.code(404).send({ error: "Service not found" });
    const items = database.prepare(`
      SELECT id, position, title, item_type AS itemType, duration_seconds AS durationSeconds,
             assigned_to AS assignedTo, notes
      FROM church_service_items WHERE service_id = ? ORDER BY position ASC, title COLLATE NOCASE
    `).all(request.params.serviceId);
    return { items };
  });

  app.get("/api/v1/church/events", async (request, reply) => {
    if (!requireOperator(request, reply)) return;
    const events = database.prepare("SELECT id, title, description, starts_at AS startsAt, ends_at AS endsAt, location, capacity, status, source FROM church_events ORDER BY starts_at IS NULL, starts_at ASC LIMIT 100").all();
    return { events };
  });

  app.post<{ Body: Record<string, unknown> }>("/api/v1/church/events", async (request, reply) => {
    if (!requireOperator(request, reply)) return;
    const body = request.body ?? {};
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title || title.length > 160) return reply.code(400).send({ error: "Event title is required (maximum 160 characters)" });
    const id = randomUUID();
    const now = new Date().toISOString();
    database.prepare("INSERT INTO church_events (id, title, description, starts_at, ends_at, location, capacity, status, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'planned', 'local', ?, ?)")
      .run(id, title, typeof body.description === "string" ? body.description : null, typeof body.startsAt === "string" ? body.startsAt : null, typeof body.endsAt === "string" ? body.endsAt : null, typeof body.location === "string" ? body.location : null, typeof body.capacity === "number" && Number.isInteger(body.capacity) ? body.capacity : null, now, now);
    return reply.code(201).send({ id, title, status: "planned", source: "local" });
  });

  app.get("/api/v1/church/groups", async (request, reply) => {
    if (!requireOperator(request, reply)) return;
    const groups = database.prepare(`
      SELECT g.id, g.name, g.description, g.leader, g.meeting_day AS meetingDay,
             g.meeting_time AS meetingTime, g.location, g.active,
             COUNT(m.operator_id) AS memberCount
      FROM church_groups g LEFT JOIN church_group_members m ON m.group_id = g.id
      GROUP BY g.id ORDER BY g.name COLLATE NOCASE
    `).all();
    return { groups };
  });

  app.post<{ Body: Record<string, unknown> }>("/api/v1/church/groups", async (request, reply) => {
    if (!requireOperator(request, reply)) return;
    const body = request.body ?? {};
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 120) return reply.code(400).send({ error: "Group name is required (maximum 120 characters)" });
    const id = randomUUID();
    const now = new Date().toISOString();
    database.prepare("INSERT INTO church_groups (id, name, description, leader, meeting_day, meeting_time, location, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)")
      .run(id, name, typeof body.description === "string" ? body.description : null, typeof body.leader === "string" ? body.leader : null, typeof body.meetingDay === "string" ? body.meetingDay : null, typeof body.meetingTime === "string" ? body.meetingTime : null, typeof body.location === "string" ? body.location : null, now, now);
    return reply.code(201).send({ id, name, active: true, memberCount: 0 });
  });

  app.get("/api/v1/integrations/planning-center/status", async (request, reply) => {
    if (!requireOperator(request, reply)) return;
    const appId = process.env.PLANNING_CENTER_APP_ID?.trim();
    const secret = process.env.PLANNING_CENTER_SECRET?.trim();
    if (!appId || !secret) return { configured: false, connected: false, message: "Set PLANNING_CENTER_APP_ID and PLANNING_CENTER_SECRET on the local server." };
    try {
      const response = await fetch("https://api.planningcenteronline.com/services/v2/service_types?per_page=1", {
        headers: { Authorization: "Basic " + Buffer.from(`${appId}:${secret}`).toString("base64"), Accept: "application/json", "User-Agent": "Church Operations (https://github.com/lucamoldovan/church-management)" },
        signal: AbortSignal.timeout(5000),
      });
      return { configured: true, connected: response.ok, statusCode: response.status, message: response.ok ? "Planning Center Services API reachable." : "Planning Center rejected the credentials or request." };
    } catch {
      return { configured: true, connected: false, message: "Planning Center could not be reached from the local server." };
    }
  });

  app.post("/api/v1/integrations/planning-center/sync", async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const appId = process.env.PLANNING_CENTER_APP_ID?.trim();
    const secret = process.env.PLANNING_CENTER_SECRET?.trim();
    if (!appId || !secret) return reply.code(409).send({ error: "Configure Planning Center credentials on the local server first" });
    const headers = {
      Authorization: "Basic " + Buffer.from(appId + ":" + secret).toString("base64"),
      Accept: "application/json",
      "User-Agent": "Church Operations (https://github.com/lucamoldovan/church-management)",
    };
    const apiBase = "https://api.planningcenteronline.com/services/v2";
    type PcoResource = { id: string; type?: string; attributes?: Record<string, unknown>; relationships?: Record<string, { data?: { id: string; type: string } | Array<{ id: string; type: string }> | null }> };
    type PcoDocument = { data?: PcoResource[] | PcoResource; included?: PcoResource[]; links?: { next?: string | null } };
    const fetchPage = async (url: string): Promise<PcoDocument> => {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error("Planning Center returned HTTP " + response.status + " for " + new URL(url).pathname);
      return response.json() as Promise<PcoDocument>;
    };
    const fetchAll = async (url: string): Promise<{ data: PcoResource[]; included: PcoResource[] }> => {
      let next: string | null = url;
      const data: PcoResource[] = [];
      const included: PcoResource[] = [];
      let pages = 0;
      while (next) {
        if (++pages > 100) throw new Error("Planning Center pagination exceeded 100 pages; sync stopped safely.");
        const targetUrl: URL = new URL(next, apiBase + "/");
        if (targetUrl.origin !== "https://api.planningcenteronline.com" || !targetUrl.pathname.startsWith("/services/v2/")) {
          throw new Error("Planning Center returned an unexpected pagination URL; sync stopped safely.");
        }
        const page = await fetchPage(targetUrl.toString());
        const pageData = Array.isArray(page.data) ? page.data : page.data ? [page.data] : [];
        data.push(...pageData);
        included.push(...(page.included ?? []));
        next = page.links?.next ? new URL(page.links.next, targetUrl).toString() : null;
      }
      return { data, included };
    };
    const attr = (resource: PcoResource | undefined, key: string): unknown => resource?.attributes?.[key];
    const relationship = (resource: PcoResource | undefined, key: string): { id: string; type: string } | null => {
      const value = resource?.relationships?.[key]?.data;
      return value && !Array.isArray(value) ? value : null;
    };
    const relationshipMany = (resource: PcoResource | undefined, key: string): Array<{ id: string; type: string }> => {
      const value = resource?.relationships?.[key]?.data;
      return Array.isArray(value) ? value : [];
    };
    const includedIndex = (resources: PcoResource[]) => new Map(resources.map((resource) => [resource.type + ":" + resource.id, resource]));
    const displayName = (person: PcoResource | undefined, fallback?: unknown): string => {
      const first = attr(person, "first_name");
      const last = attr(person, "last_name");
      const full = attr(person, "full_name") ?? attr(person, "name") ?? fallback;
      const composed = [first, last].filter((part): part is string => typeof part === "string" && part.trim().length > 0).join(" ");
      return String(composed || full || "Unnamed person").trim().slice(0, 160);
    };
    const now = () => new Date().toISOString();
    const upsertPerson = (person: PcoResource | undefined, externalId: string, fallback?: unknown): string => {
      const attributes = person?.attributes ?? {};
      const name = displayName(person, fallback);
      const id = database.prepare("SELECT id FROM service_people WHERE external_id = ?").get(externalId) as { id: string } | undefined;
      const localId = id?.id ?? randomUUID();
      database.prepare("INSERT INTO service_people (id, external_id, display_name, first_name, last_name, photo_url, raw_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(external_id) DO UPDATE SET display_name=excluded.display_name, first_name=excluded.first_name, last_name=excluded.last_name, photo_url=excluded.photo_url, raw_json=excluded.raw_json, updated_at=excluded.updated_at")
        .run(localId, externalId, name,
          typeof attributes.first_name === "string" ? attributes.first_name : null,
          typeof attributes.last_name === "string" ? attributes.last_name : null,
          typeof attributes.photo_thumbnail === "string" ? attributes.photo_thumbnail : null,
          JSON.stringify(person ?? { attributes: { name } }), now());
      return localId;
    };
    const upsertTeam = (team: PcoResource): string => {
      const id = database.prepare("SELECT id FROM service_teams WHERE external_id = ?").get(team.id) as { id: string } | undefined;
      const localId = id?.id ?? randomUUID();
      const a = team.attributes ?? {};
      database.prepare("INSERT INTO service_teams (id, external_id, name, sequence, archived_at, raw_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(external_id) DO UPDATE SET name=excluded.name, sequence=excluded.sequence, archived_at=excluded.archived_at, raw_json=excluded.raw_json, updated_at=excluded.updated_at")
        .run(localId, team.id, String(a.name ?? "Unnamed team").slice(0, 160),
          typeof a.sequence === "number" ? a.sequence : null,
          typeof a.archived_at === "string" ? a.archived_at : null, JSON.stringify(team), now());
      return localId;
    };
    const upsertPosition = (position: PcoResource, teamId: string): string => {
      const id = database.prepare("SELECT id FROM service_positions WHERE external_id = ?").get(position.id) as { id: string } | undefined;
      const localId = id?.id ?? randomUUID();
      const a = position.attributes ?? {};
      database.prepare("INSERT INTO service_positions (id, external_id, team_id, name, sequence, raw_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(external_id) DO UPDATE SET team_id=excluded.team_id, name=excluded.name, sequence=excluded.sequence, raw_json=excluded.raw_json, updated_at=excluded.updated_at")
        .run(localId, position.id, teamId, String(a.name ?? "Unnamed position").slice(0, 160),
          typeof a.sequence === "number" ? a.sequence : null, JSON.stringify(position), now());
      return localId;
    };
    try {
      const typeResult = await fetchAll(apiBase + "/service_types?per_page=100");
      let plansProcessed = 0;
      let itemsImported = 0;
      let peopleImported = 0;
      let teamsImported = 0;
      let positionsImported = 0;
      let scheduledAssignmentsImported = 0;
      let itemAssignmentsImported = 0;
      for (const type of typeResult.data) {
        const typeId = type.id;
        const typeTeams = await fetchAll(apiBase + "/service_types/" + encodeURIComponent(typeId) + "/teams?per_page=100");
        const teamResources = new Map<string, PcoResource>();
        const teamLocalIds = new Map<string, string>();
        const positionResources = new Map<string, PcoResource>();
        const positionLocalIds = new Map<string, string>();
        const positionTeamExternalIds = new Map<string, string>();
        const personResources = new Map<string, PcoResource>();
        const loadTeam = async (team: PcoResource) => {
          if (teamResources.has(team.id)) return;
          teamResources.set(team.id, team);
          const teamLocalId = upsertTeam(team);
          teamLocalIds.set(team.id, teamLocalId);
          const leaders = await fetchAll(apiBase + "/teams/" + encodeURIComponent(team.id) + "/team_leaders?include=people&per_page=100");
          for (const included of leaders.included) if (included.type === "Person") personResources.set(included.id, included);
          database.prepare("DELETE FROM service_team_leaders WHERE team_id = ?").run(teamLocalId);
          for (const leader of leaders.data) {
            const personRef = relationship(leader, "person");
            if (!personRef) continue;
            if (!personResources.has(personRef.id)) {
              const personDocument = await fetchPage(apiBase + "/people/" + encodeURIComponent(personRef.id));
              const person = Array.isArray(personDocument.data) ? personDocument.data[0] : personDocument.data;
              if (person) personResources.set(person.id, person);
            }
            const personId = upsertPerson(personResources.get(personRef.id), personRef.id);
            database.prepare("INSERT INTO service_team_leaders (id, external_id, team_id, person_id, raw_json, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(external_id) DO UPDATE SET team_id=excluded.team_id, person_id=excluded.person_id, raw_json=excluded.raw_json, updated_at=excluded.updated_at")
              .run(randomUUID(), leader.id, teamLocalId, personId, JSON.stringify(leader), now());
          }
          const positions = await fetchAll(apiBase + "/teams/" + encodeURIComponent(team.id) + "/team_positions?per_page=100");
          for (const position of positions.data) {
            positionResources.set(position.id, position);
            positionTeamExternalIds.set(position.id, team.id);
            const localPositionId = upsertPosition(position, teamLocalId);
            positionLocalIds.set(position.id, localPositionId);
            const memberships = await fetchAll(apiBase + "/service_types/" + encodeURIComponent(typeId) + "/team_positions/" + encodeURIComponent(position.id) + "/person_team_position_assignments?include=person&per_page=100");
            for (const included of memberships.included) if (included.type === "Person") personResources.set(included.id, included);
            for (const membership of memberships.data) {
              const personRef = relationship(membership, "person");
              if (!personRef) continue;
              const personId = upsertPerson(personResources.get(personRef.id), personRef.id);
              const membershipId = randomUUID();
              const ma = membership.attributes ?? {};
              database.prepare("INSERT INTO service_team_memberships (id, person_id, position_id, schedule_preference, raw_json, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(person_id, position_id) DO UPDATE SET schedule_preference=excluded.schedule_preference, raw_json=excluded.raw_json, updated_at=excluded.updated_at")
                .run(membershipId, personId, localPositionId,
                  typeof ma.schedule_preference === "string" ? ma.schedule_preference : null, JSON.stringify(membership), now());
            }
          }
        };
        for (const team of typeTeams.data) await loadTeam(team);
        const plansResult = await fetchAll(apiBase + "/service_types/" + encodeURIComponent(typeId) + "/plans?filter=future&per_page=100");
        for (const plan of plansResult.data) {
          const planPath = "/service_types/" + encodeURIComponent(typeId) + "/plans/" + encodeURIComponent(plan.id);
          const [itemsResult, peopleResult, timesResult, signupTeamsResult] = await Promise.all([
            fetchAll(apiBase + planPath + "/items?include=song,arrangement&per_page=100"),
            fetchAll(apiBase + planPath + "/team_members?include=person,team&per_page=100"),
            fetchAll(apiBase + planPath + "/plan_times?per_page=100"),
            fetchAll(apiBase + planPath + "/signup_teams?per_page=100"),
          ]);
          const planIncluded = includedIndex([...itemsResult.included, ...peopleResult.included, ...timesResult.included, ...signupTeamsResult.included]);
          for (const team of signupTeamsResult.data) await loadTeam(team);
          for (const scheduled of peopleResult.data) {
            const teamRef = relationship(scheduled, "team");
            if (teamRef && !teamResources.has(teamRef.id)) {
              const fromIncluded = planIncluded.get("Team:" + teamRef.id);
              if (fromIncluded) await loadTeam(fromIncluded);
            }
          }
          const scheduledTeamIds = new Set<string>(signupTeamsResult.data.map((team) => team.id));
          for (const scheduled of peopleResult.data) {
            const teamRef = relationship(scheduled, "team");
            if (teamRef) scheduledTeamIds.add(teamRef.id);
          }
          for (const included of planIncluded.values()) if (included.type === "Person") personResources.set(included.id, included);
          const planPeople = new Map<string, { resource: PcoResource; personId: string; teamId: string | null; positionName: string | null }>();
          for (const scheduled of peopleResult.data) {
            const personRef = relationship(scheduled, "person");
            const personResource = personRef ? personResources.get(personRef.id) : undefined;
            const personExternalId = personRef?.id ?? "plan-person:" + scheduled.id;
            const personId = upsertPerson(personResource, personExternalId, attr(scheduled, "name"));
            const teamRef = relationship(scheduled, "team");
            const teamId = teamRef ? teamLocalIds.get(teamRef.id) ?? null : null;
            planPeople.set(scheduled.id, {
              resource: scheduled, personId, teamId,
              positionName: typeof attr(scheduled, "team_position_name") === "string" ? String(attr(scheduled, "team_position_name")) : null,
            });
          }
          const itemAssignmentResources = new Map<string, PcoResource[]>();
          for (const item of itemsResult.data) {
            const assignmentResult = await fetchAll(apiBase + planPath + "/items/" + encodeURIComponent(item.id) + "/item_assignments?per_page=100");
            itemAssignmentResources.set(item.id, assignmentResult.data);
            for (const included of assignmentResult.included) {
              if (included.type === "Person") personResources.set(included.id, included);
              if (included.type === "TeamPosition") positionResources.set(included.id, included);
            }
            for (const assignment of assignmentResult.data) {
              const assignable = relationship(assignment, "assignable");
              if (assignable?.type === "Person" && !personResources.has(assignable.id)) {
                const personDocument = await fetchPage(apiBase + "/people/" + encodeURIComponent(assignable.id));
                const person = Array.isArray(personDocument.data) ? personDocument.data[0] : personDocument.data;
                if (person) personResources.set(person.id, person);
              }
            }
          }
          const transaction = database.transaction(() => {
            const planAttrs = plan.attributes ?? {};
            const title = String(planAttrs.series_title || planAttrs.title || type.attributes?.name || "Service plan").slice(0, 160);
            const startsAt = typeof planAttrs.sort_date === "string" ? planAttrs.sort_date : null;
            const existing = database.prepare("SELECT id FROM church_services WHERE external_id = ?").get(plan.id) as { id: string } | undefined;
            const serviceId = existing?.id ?? randomUUID();
            database.prepare("INSERT INTO church_services (id, title, starts_at, status, source, external_id, raw_json, service_type_external_id, service_type_name, created_at, updated_at) VALUES (?, ?, ?, 'planned', 'planning_center', ?, ?, ?, ?, ?, ?) ON CONFLICT(external_id) DO UPDATE SET title=excluded.title, starts_at=excluded.starts_at, raw_json=excluded.raw_json, service_type_external_id=excluded.service_type_external_id, service_type_name=excluded.service_type_name, updated_at=excluded.updated_at")
              .run(serviceId, title, startsAt, plan.id, JSON.stringify(plan), typeId, String(type.attributes?.name ?? "Service").slice(0, 160), now(), now());
            const service = database.prepare("SELECT id FROM church_services WHERE external_id = ?").get(plan.id) as { id: string };
            const localServiceId = service.id;
            database.prepare("DELETE FROM service_plan_teams WHERE service_id = ?").run(localServiceId);
            database.prepare("DELETE FROM service_assignment_times WHERE assignment_id IN (SELECT id FROM service_plan_assignments WHERE service_id = ?)").run(localServiceId);
            database.prepare("DELETE FROM service_plan_assignments WHERE service_id = ?").run(localServiceId);
            database.prepare("DELETE FROM service_plan_times WHERE service_id = ?").run(localServiceId);
            database.prepare("DELETE FROM church_service_items WHERE service_id = ?").run(localServiceId);
            let teamOrder = 0;
            for (const team of teamResources.values()) {
              const teamId = teamLocalIds.get(team.id);
              if (teamId && scheduledTeamIds.has(team.id)) database.prepare("INSERT INTO service_plan_teams (service_id, team_id, position) VALUES (?, ?, ?)").run(localServiceId, teamId, teamOrder++);
            }
            const timeIds = new Map<string, string>();
            for (const time of timesResult.data) {
              const timeId = randomUUID();
              const ta = time.attributes ?? {};
              database.prepare("INSERT INTO service_plan_times (id, service_id, external_id, name, starts_at, ends_at, time_type, raw_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
                .run(timeId, localServiceId, time.id, String(ta.name ?? "Service time"), typeof ta.starts_at === "string" ? ta.starts_at : null,
                  typeof ta.ends_at === "string" ? ta.ends_at : null, typeof ta.time_type === "string" ? ta.time_type : null, JSON.stringify(time), now());
              timeIds.set(time.id, timeId);
            }
            for (const [scheduledId, info] of planPeople) {
              const personRef = relationship(info.resource, "person");
              const teamRef = relationship(info.resource, "team");
              const position = [...positionResources.values()].find((candidate) =>
                positionTeamExternalIds.get(candidate.id) === teamRef?.id &&
                String(attr(candidate, "name") ?? "").toLowerCase() === (info.positionName ?? "").toLowerCase());
              const positionId = position ? positionLocalIds.get(position.id) ?? null : null;
              const assignmentId = randomUUID();
              const sa = info.resource.attributes ?? {};
              database.prepare("INSERT INTO service_plan_assignments (id, service_id, person_id, team_id, position_id, position_name, status, notes, plan_person_external_id, raw_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
                .run(assignmentId, localServiceId, info.personId, info.teamId, positionId, info.positionName,
                  typeof sa.status === "string" ? sa.status : null, typeof sa.notes === "string" ? sa.notes : null,
                  plan.id + ":" + scheduledId, JSON.stringify(info.resource), now());
              const timeRefs = [...relationshipMany(info.resource, "times"), ...relationshipMany(info.resource, "service_times")];
              for (const timeRef of timeRefs) {
                const localTimeId = timeIds.get(timeRef.id);
                if (localTimeId) database.prepare("INSERT OR IGNORE INTO service_assignment_times (assignment_id, plan_time_id) VALUES (?, ?)").run(assignmentId, localTimeId);
              }
              scheduledAssignmentsImported++;
            }
            const insertedItems = new Map<string, string>();
            for (const [index, item] of itemsResult.data.entries()) {
              const ia = item.attributes ?? {};
              const itemTitle = String(ia.title || ia.service_position || "Untitled item").slice(0, 160);
              const position = typeof ia.sequence === "number" ? Math.max(0, Math.floor(ia.sequence)) : index;
              const itemType = typeof ia.item_type === "string" ? ia.item_type.slice(0, 60) : "other";
              const songRef = relationship(item, "song");
              const arrangementRef = relationship(item, "arrangement");
              const itemId = randomUUID();
              database.prepare("INSERT INTO church_service_items (id, service_id, position, title, item_type, duration_seconds, notes, external_id, song_external_id, arrangement_external_id, service_position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
                .run(itemId, localServiceId, position, itemTitle, itemType,
                  typeof ia.length === "number" ? ia.length : null,
                  typeof ia.description === "string" ? ia.description.slice(0, 4000) : null,
                  plan.id + ":" + item.id, songRef?.id ?? null, arrangementRef?.id ?? null,
                  typeof ia.service_position === "string" ? ia.service_position : null, now(), now());
              insertedItems.set(item.id, itemId);
              itemsImported++;
            }
            for (const [itemExternalId, assignments] of itemAssignmentResources) {
              const localItemId = insertedItems.get(itemExternalId);
              if (!localItemId) continue;
              for (const assignment of assignments) {
                const assignable = relationship(assignment, "assignable");
                if (!assignable) continue;
                const personId = assignable.type === "Person"
                  ? upsertPerson(personResources.get(assignable.id), assignable.id)
                  : null;
                const positionId = assignable.type === "TeamPosition" ? positionLocalIds.get(assignable.id) ?? null : null;
                const positionName = positionId ? String(attr(positionResources.get(assignable.id), "name") ?? "") : null;
                const assignmentId = randomUUID();
                database.prepare("INSERT INTO service_item_assignments (id, item_id, assignable_type, assignable_external_id, person_id, position_id, display_name, external_id, raw_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
                  .run(assignmentId, localItemId, assignable.type, assignable.id, personId, positionId,
                    personId ? (database.prepare("SELECT display_name FROM service_people WHERE id = ?").get(personId) as { display_name: string }).display_name : positionName,
                    plan.id + ":" + itemExternalId + ":" + assignment.id, JSON.stringify(assignment), now());
                itemAssignmentsImported++;
              }
            }
          });
          transaction();
          plansProcessed++;
        }
      }
      return {
        imported: plansProcessed, itemsImported, peopleImported: (database.prepare("SELECT COUNT(*) AS count FROM service_people").get() as { count: number }).count,
        teamsImported: (database.prepare("SELECT COUNT(*) AS count FROM service_teams").get() as { count: number }).count,
        positionsImported: (database.prepare("SELECT COUNT(*) AS count FROM service_positions").get() as { count: number }).count,
        scheduledAssignmentsImported, itemAssignmentsImported, serviceTypes: typeResult.data.length,
        syncedAt: new Date().toISOString(),
      };
    } catch (error) {
      request.log.error({ err: error }, "Planning Center sync failed");
      return reply.code(502).send({ error: error instanceof Error ? error.message : "Planning Center sync failed" });
    }
  });

  app.get("/api/v1/integrations/propresenter/live", async (request, reply) => {
    if (!requireOperator(request, reply)) return;
    const query = request.query as { serviceId?: string };
    const serviceId = typeof query.serviceId === "string" ? query.serviceId : null;
    if (serviceId && !database.prepare("SELECT id FROM church_services WHERE id = ?").get(serviceId)) {
      return reply.code(404).send({ error: "Service not found" });
    }
    const baseUrl = process.env.PROPRESENTER_URL?.trim().replace(/\/$/, "");
    const checkedAt = new Date().toISOString();
    const saveDisconnected = (message: string) => {
      if (serviceId) database.prepare("INSERT INTO service_live_state (service_id, matched_item_id, match_method, connected, observed_at, stale_at, message) VALUES (?, NULL, NULL, 0, ?, ?, ?) ON CONFLICT(service_id) DO UPDATE SET matched_item_id=NULL, match_method=NULL, connected=0, observed_at=excluded.observed_at, stale_at=excluded.stale_at, message=excluded.message")
        .run(serviceId, checkedAt, checkedAt, message);
    };
    if (!baseUrl) {
      const message = "Set PROPRESENTER_URL on the local server.";
      saveDisconnected(message);
      return { configured: false, connected: false, message, checkedAt, rundownMatch: serviceId ? { status: "disconnected", itemId: null, matchMethod: null, message } : undefined };
    }
    const headers: Record<string, string> = { Accept: "application/json" };
    try {
      const [versionResponse, presentationResponse, slideResponse, slideIndexResponse] = await Promise.all([
        fetch(baseUrl + "/version", { headers, signal: AbortSignal.timeout(4000) }),
        fetch(baseUrl + "/v1/presentation/active", { headers, signal: AbortSignal.timeout(4000) }),
        fetch(baseUrl + "/v1/status/slide", { headers, signal: AbortSignal.timeout(4000) }),
        fetch(baseUrl + "/v1/presentation/slide_index", { headers, signal: AbortSignal.timeout(4000) }),
      ]);
      if (!versionResponse.ok) throw new Error("ProPresenter returned HTTP " + versionResponse.status);
      const version = await versionResponse.json();
      const presentation = presentationResponse.ok ? await presentationResponse.json() as Record<string, unknown> : null;
      const slide = slideResponse.ok ? await slideResponse.json() as Record<string, unknown> : null;
      const slideIndexData = slideIndexResponse.ok ? await slideIndexResponse.json() : null;
      const readSlideIndex = (value: unknown): number | null => {
        if (typeof value === "number" && Number.isInteger(value)) return value;
        if (!value || typeof value !== "object" || Array.isArray(value)) return null;
        const record = value as Record<string, unknown>;
        if (typeof record.slide_index === "number" && Number.isInteger(record.slide_index)) return record.slide_index;
        if (typeof record.index === "number" && Number.isInteger(record.index)) return record.index;
        return readSlideIndex(record.presentation) ?? readSlideIndex(record.announcements);
      };
      const nestedPresentation = presentation?.presentation && typeof presentation.presentation === "object"
        ? presentation.presentation as Record<string, unknown> : null;
      const announcements = presentation?.announcements && typeof presentation.announcements === "object"
        ? presentation.announcements as Record<string, unknown> : null;
      const presentationName = String(presentation?.name ?? nestedPresentation?.name ?? announcements?.name ?? "").trim() || null;
      const currentSlide = slide?.current && typeof slide.current === "object" ? slide.current as Record<string, unknown> : null;
      const slideText = typeof currentSlide?.text === "string" ? currentSlide.text.slice(0, 2000) : null;
      const slideUuid = typeof currentSlide?.uuid === "string" ? currentSlide.uuid.slice(0, 160) : null;
      const slideIndex = readSlideIndex(slideIndexData);
      database.prepare("INSERT INTO propresenter_state (id, connected, version, presentation_name, slide_index, slide_count, slide_text, last_checked_at, error) VALUES (1, 1, ?, ?, ?, NULL, ?, ?, NULL) ON CONFLICT(id) DO UPDATE SET connected=1, version=excluded.version, presentation_name=excluded.presentation_name, slide_index=excluded.slide_index, slide_count=NULL, slide_text=excluded.slide_text, last_checked_at=excluded.last_checked_at, error=NULL")
        .run(typeof version === "object" && version && "version" in version ? String((version as Record<string, unknown>).version) : JSON.stringify(version).slice(0, 160),
          presentationName, slideIndex, slide ? JSON.stringify(slide).slice(0, 2000) : null, checkedAt);
      let rundownMatch: { status: "matched" | "unmatched" | "ambiguous" | "disconnected"; itemId: string | null; matchMethod: string | null; message: string } | undefined;
      if (serviceId) {
        const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        const songItems = database.prepare("SELECT id, title FROM church_service_items WHERE service_id = ? AND lower(item_type) = 'song'").all(serviceId) as Array<{ id: string; title: string }>;
        const matchBy = (value: string | null, method: string) => {
          if (!value) return null;
          const key = normalize(value);
          if (!key) return null;
          const matches = songItems.filter((item) => normalize(item.title) === key);
          return { matches, method };
        };
        const presentationMatch = matchBy(presentationName, "exact_presentation_title");
        const slideMatch = presentationMatch?.matches.length ? null : matchBy(slideText, "exact_current_slide_title");
        const selected = presentationMatch?.matches.length ? presentationMatch : slideMatch;
        const uniqueMatchedItem = selected?.matches.length === 1 ? selected.matches[0] : undefined;
        if (selected && uniqueMatchedItem) {
          rundownMatch = { status: "matched", itemId: uniqueMatchedItem.id, matchMethod: selected.method, message: "ProPresenter matches one song in this service rundown." };
        } else if (selected && selected.matches.length > 1) {
          rundownMatch = { status: "ambiguous", itemId: null, matchMethod: selected.method, message: "More than one rundown song has this title. No item was highlighted." };
        } else {
          rundownMatch = { status: "unmatched", itemId: null, matchMethod: null, message: presentationName ? "ProPresenter is connected, but its active presentation does not exactly match a song in this rundown." : "ProPresenter is connected, but no active presentation title is available to match." };
        }
        database.prepare("INSERT INTO service_live_state (service_id, matched_item_id, match_method, presentation_name, current_slide_text, current_slide_uuid, connected, observed_at, stale_at, message) VALUES (?, ?, ?, ?, ?, ?, 1, ?, NULL, ?) ON CONFLICT(service_id) DO UPDATE SET matched_item_id=excluded.matched_item_id, match_method=excluded.match_method, presentation_name=excluded.presentation_name, current_slide_text=excluded.current_slide_text, current_slide_uuid=excluded.current_slide_uuid, connected=1, observed_at=excluded.observed_at, stale_at=NULL, message=excluded.message")
          .run(serviceId, rundownMatch.itemId, rundownMatch.matchMethod, presentationName, slideText, slideUuid, checkedAt, rundownMatch.message);
      }
      return { connected: true, version, presentation, presentationName, slide, slideIndex, slideUuid, checkedAt, rundownMatch };
    } catch (error) {
      const message = error instanceof Error ? error.message : "ProPresenter connection failed";
      database.prepare("INSERT INTO propresenter_state (id, connected, last_checked_at, error) VALUES (1, 0, ?, ?) ON CONFLICT(id) DO UPDATE SET connected=0, last_checked_at=excluded.last_checked_at, error=excluded.error")
        .run(checkedAt, message);
      saveDisconnected(message);
      return { configured: true, connected: false, message, checkedAt, rundownMatch: serviceId ? { status: "disconnected", itemId: null, matchMethod: null, message } : undefined };
    }
  });

  app.post<{ Body: { action?: unknown } }>("/api/v1/integrations/propresenter/command", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    if (!requireProductionOperator(request, reply)) return;
    const action = request.body?.action;
    const endpoints: Record<string, string> = {
      next: "/v1/presentation/active/next/trigger",
      previous: "/v1/presentation/active/previous/trigger",
      clear_slide: "/v1/clear/layer/slide",
    };
    if (typeof action !== "string" || !(action in endpoints)) {
      return reply.code(400).send({ error: "Unsupported ProPresenter action" });
    }
    const baseUrl = process.env.PROPRESENTER_URL?.trim().replace(/\/$/, "");
    if (!baseUrl) return reply.code(409).send({ error: "Set PROPRESENTER_URL on the local server." });
    try {
      const response = await fetch(baseUrl + endpoints[action], {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        return reply.code(502).send({ error: "ProPresenter rejected the action with HTTP " + response.status });
      }
      return { success: true, action, message: action === "next" ? "Advanced to the next cue."
        : action === "previous" ? "Returned to the previous cue." : "Cleared the slide layer." };
    } catch (error) {
      return reply.code(502).send({ error: error instanceof Error ? error.message : "ProPresenter action failed" });
    }
  });

  return app;
}
