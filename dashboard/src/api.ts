export interface ServerHealth {
  status: "ok";
  service: string;
  version: string;
}

export interface Operator {
  id: string;
  username: string;
}

export interface AuthSession {
  authenticated: boolean;
  operator: Operator | null;
}

export interface SetupStatus {
  setupRequired: boolean;
}

export type ConnectionState = "checking" | "online" | "offline";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  if (init?.body) headers.set("Content-Type", "application/json");

  const response = await fetch(url, {
    ...init,
    headers,
    cache: "no-store",
  });

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : `Request failed with HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

export async function getServerHealth(signal?: AbortSignal): Promise<ServerHealth> {
  const response = await fetch("/api/v1/health", {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });

  if (!response.ok) throw new Error(`Server returned HTTP ${response.status}`);
  const payload: unknown = await response.json();

  if (
    typeof payload !== "object" ||
    payload === null ||
    !("status" in payload) ||
    payload.status !== "ok" ||
    !("service" in payload) ||
    typeof payload.service !== "string" ||
    !("version" in payload) ||
    typeof payload.version !== "string"
  ) {
    throw new Error("Server returned an invalid health response");
  }

  return payload as ServerHealth;
}

export function getSetupStatus(): Promise<SetupStatus> {
  return request<SetupStatus>("/api/v1/setup/status");
}

export function getAuthSession(): Promise<AuthSession> {
  return request<AuthSession>("/api/v1/auth/session");
}

export function createInitialOperator(input: {
  setupKey: string;
  username: string;
  password: string;
}): Promise<AuthSession> {
  return request<AuthSession>("/api/v1/setup", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function login(input: { username: string; password: string }): Promise<AuthSession> {
  return request<AuthSession>("/api/v1/auth/session", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function logout(): Promise<{ authenticated: false }> {
  return request<{ authenticated: false }>("/api/v1/auth/session", {
    method: "DELETE",
  });
}

export interface Device {
  id: string;
  name: string;
  status: "online" | "stale" | "offline";
  platform: string;
  softwareVersion: string;
  lastSeenAt: string | null;
  lastIp: string | null;
  playbackMode: string;
  ndiSourceName: string | null;
  uptimeSeconds: number | null;
  createdAt: string;
  credentialRevokedAt: string | null;
  credentialStatus: "active" | "revoked";
  configVersion: number;
  assignedNdiSourceName: string | null;
  assignedNdiSourceAddress: string | null;
  fallbackPlaylistId: string | null;
}

export interface PairingCode {
  code: string;
  expiresAt: string;
}

export function getDevices(signal?: AbortSignal): Promise<{ devices: Device[] }> {
  return request<{ devices: Device[] }>("/api/v1/devices", { signal });
}

export function createDevicePairingCode(): Promise<PairingCode> {
  return request<PairingCode>("/api/v1/devices/pairing-codes", {
    method: "POST",
  });
}

export function revokeDeviceCredential(deviceId: string): Promise<{ revoked: true }> {
  return request<{ revoked: true }>(`/api/v1/devices/${encodeURIComponent(deviceId)}/revoke`, {
    method: "POST",
  });
}

export function removeRevokedDevice(deviceId: string): Promise<void> {
  return request<void>(`/api/v1/devices/${encodeURIComponent(deviceId)}`, {
    method: "DELETE",
  });
}

export interface MediaAsset {
  id: string;
  name: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  sizeBytes: number;
  sha256: string;
  createdAt: string;
  contentUrl: string;
}

export function getMedia(signal?: AbortSignal): Promise<{ media: MediaAsset[] }> {
  return request<{ media: MediaAsset[] }>("/api/v1/media", { signal });
}

export async function uploadMedia(file: File): Promise<MediaAsset> {
  const response = await fetch("/api/v1/media", {
    method: "POST",
    headers: {
      "Content-Type": file.type,
      "X-Veyra-Filename": encodeURIComponent(file.name),
      Accept: "application/json",
    },
    body: file,
    cache: "no-store",
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : `Upload failed with HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload as MediaAsset;
}

export function deleteMedia(mediaId: string): Promise<void> {
  return request<void>(`/api/v1/media/${encodeURIComponent(mediaId)}`, { method: "DELETE" });
}

export interface PlaylistSummary {
  id: string;
  name: string;
  description: string;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlaylistItem {
  id?: string;
  mediaId: string;
  position?: number;
  durationSeconds: number;
  mediaName?: string;
  mimeType?: string;
  sizeBytes?: number;
  contentUrl?: string;
}

export interface PlaylistDetail {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  items: PlaylistItem[];
}

export function getPlaylists(signal?: AbortSignal): Promise<{ playlists: PlaylistSummary[] }> {
  return request<{ playlists: PlaylistSummary[] }>("/api/v1/playlists", { signal });
}

export function createPlaylist(input: { name: string; description?: string }): Promise<PlaylistSummary> {
  return request<PlaylistSummary>("/api/v1/playlists", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getPlaylist(playlistId: string, signal?: AbortSignal): Promise<PlaylistDetail> {
  return request<PlaylistDetail>(`/api/v1/playlists/${encodeURIComponent(playlistId)}`, { signal });
}

export function updatePlaylist(
  playlistId: string,
  input: { name: string; description: string; items: Array<{ mediaId: string; durationSeconds: number }> },
): Promise<{ id: string; name: string; description: string; itemCount: number; updatedAt: string }> {
  return request(`/api/v1/playlists/${encodeURIComponent(playlistId)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deletePlaylist(playlistId: string): Promise<void> {
  return request<void>(`/api/v1/playlists/${encodeURIComponent(playlistId)}`, { method: "DELETE" });
}

export interface NdiSource {
  id: string;
  name: string;
  address: string | null;
  deviceCount: number;
  devices: Array<{ id: string; name: string }>;
  lastSeenAt: string | null;
}

export function getSources(signal?: AbortSignal): Promise<{ sources: NdiSource[] }> {
  return request<{ sources: NdiSource[] }>("/api/v1/sources", { signal });
}

export function updateDeviceConfig(deviceId: string, input: {
  ndiSourceName: string | null;
  ndiSourceAddress: string | null;
  fallbackPlaylistId: string | null;
}): Promise<{ deviceId: string; configVersion: number; ndiSourceName: string | null; ndiSourceAddress: string | null; fallbackPlaylistId: string | null }> {
  return request(`/api/v1/devices/${encodeURIComponent(deviceId)}/config`, {
    method: "PUT", body: JSON.stringify(input),
  });
}

export interface ChurchOverview {
  staffCount: number;
  upcomingServices: number;
  activeEvents: number;
  activeGroups: number;
  receiverCount: number;
  onlineReceivers: number;
  propresenter: { connected: number; version: string | null; presentation_name: string | null; slide_index: number | null; slide_count: number | null; slide_text: string | null; last_checked_at: string | null; error: string | null } | null;
}
export interface ChurchService {
  id: string; title: string; startsAt: string | null; endsAt: string | null;
  status: string; location: string | null; notes: string | null; source: string; externalId: string | null;
}
export interface ChurchStaff {
  id: string; username: string; displayName: string; role: string; department: string | null; active: number; createdAt: string;
}
export interface ChurchEvent {
  id: string; title: string; description: string | null; startsAt: string | null;
  endsAt: string | null; location: string | null; capacity: number | null; status: string; source: string;
}
export interface ChurchGroup {
  id: string; name: string; description: string | null; leader: string | null;
  meetingDay: string | null; meetingTime: string | null; location: string | null; active: number; memberCount: number;
}
export function getChurchOverview(signal?: AbortSignal): Promise<ChurchOverview> {
  return request<ChurchOverview>("/api/v1/church/overview", { signal });
}
export function getChurchServices(signal?: AbortSignal): Promise<{ services: ChurchService[] }> {
  return request<{ services: ChurchService[] }>("/api/v1/church/services", { signal });
}
export function createChurchService(input: { title: string; startsAt?: string; endsAt?: string; location?: string; notes?: string }): Promise<ChurchService> {
  return request<ChurchService>("/api/v1/church/services", { method: "POST", body: JSON.stringify(input) });
}
export function getChurchStaff(signal?: AbortSignal): Promise<{ staff: ChurchStaff[] }> {
  return request<{ staff: ChurchStaff[] }>("/api/v1/church/staff", { signal });
}
export function createChurchStaff(input: { username: string; displayName: string; password: string; role: string; department?: string }): Promise<ChurchStaff> {
  return request<ChurchStaff>("/api/v1/church/staff", { method: "POST", body: JSON.stringify(input) });
}
export function getChurchEvents(signal?: AbortSignal): Promise<{ events: ChurchEvent[] }> {
  return request<{ events: ChurchEvent[] }>("/api/v1/church/events", { signal });
}
export function createChurchEvent(input: { title: string; description?: string; startsAt?: string; endsAt?: string; location?: string; capacity?: number }): Promise<ChurchEvent> {
  return request<ChurchEvent>("/api/v1/church/events", { method: "POST", body: JSON.stringify(input) });
}
export function getChurchGroups(signal?: AbortSignal): Promise<{ groups: ChurchGroup[] }> {
  return request<{ groups: ChurchGroup[] }>("/api/v1/church/groups", { signal });
}
export function createChurchGroup(input: { name: string; description?: string; leader?: string; meetingDay?: string; meetingTime?: string; location?: string }): Promise<ChurchGroup> {
  return request<ChurchGroup>("/api/v1/church/groups", { method: "POST", body: JSON.stringify(input) });
}
export function getPlanningCenterStatus(): Promise<{ configured: boolean; connected: boolean; message: string }> {
  return request("/api/v1/integrations/planning-center/status");
}
export function syncPlanningCenter(): Promise<{ imported: number; serviceTypes: number; syncedAt: string }> {
  return request("/api/v1/integrations/planning-center/sync", { method: "POST" });
}
export interface ProPresenterLive {
  configured?: boolean; connected: boolean; message?: string; version?: unknown;
  presentation?: unknown; slide?: unknown; checkedAt?: string;
}
export function getProPresenterLive(): Promise<ProPresenterLive> {
  return request("/api/v1/integrations/propresenter/live");
}
