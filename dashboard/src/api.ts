export interface ServerHealth {
  status: "ok";
  service: string;
  version: string;
}

export interface Operator {
  id: string;
  username: string;
  role: string;
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
  serviceTypeName?: string | null; itemCount?: number;
}
export interface ChurchServiceItem {
  id: string; position: number; title: string; itemType: string; durationSeconds: number | null;
  assignedTo: string | null; notes: string | null; songExternalId?: string | null;
  arrangementExternalId?: string | null; servicePosition?: string | null;
  assignments?: Array<{ id: string; itemId: string; assignableType: string; assignableExternalId: string; displayName: string | null }>;
}
export interface ServicePlanTeam { id: string; externalId: string; name: string; sequence: number | null; leaders?: string[]; }
export interface ServicePlanAssignment {
  id: string; personId: string; personName: string; teamId: string | null; teamName: string | null;
  positionId: string | null; positionName: string | null; status: string | null; notes: string | null; serviceTimes: string | null;
}
export interface ServicePlanTime { id: string; externalId: string; name: string; startsAt: string | null; endsAt: string | null; timeType: string | null; }
export interface ServiceLiveState {
  matchedItemId: string | null; matchMethod: string | null; presentationName: string | null;
  currentSlideText: string | null; currentSlideUuid: string | null; connected: number;
  observedAt: string | null; staleAt: string | null; message: string | null;
}
export interface ChurchServiceWorkspace {
  service: ChurchService; items: ChurchServiceItem[]; teams: ServicePlanTeam[];
  assignments: ServicePlanAssignment[]; times: ServicePlanTime[]; live: ServiceLiveState | null;
}
export interface ChurchTeamDirectory {
  id: string; externalId: string; name: string; sequence: number | null; archivedAt: string | null; leaders?: string[];
  positions: Array<{ id: string; externalId: string; teamId: string; name: string; sequence: number | null;
    members: Array<{ id: string; positionId: string; personId: string; personName: string; schedulePreference: string | null }> }>;
}
export interface ChurchPerson {
  id: string;
  externalId: string;
  displayName: string;
  teams: string[];
}
export function getChurchPeople(signal?: AbortSignal): Promise<{ people: ChurchPerson[]; total: number }> {
  return request("/api/v1/church/people", { signal });
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
export function getChurchServiceItems(serviceId: string): Promise<{ items: ChurchServiceItem[] }> {
  return request<{ items: ChurchServiceItem[] }>(`/api/v1/church/services/${encodeURIComponent(serviceId)}/items`);
}
export function getChurchServiceWorkspace(serviceId: string): Promise<ChurchServiceWorkspace> {
  return request<ChurchServiceWorkspace>(`/api/v1/church/services/${encodeURIComponent(serviceId)}/workspace`);
}
export function getChurchTeams(): Promise<{ teams: ChurchTeamDirectory[] }> {
  return request<{ teams: ChurchTeamDirectory[] }>("/api/v1/church/teams");
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
export function syncPlanningCenter(): Promise<{ imported: number; itemsImported: number; peopleImported: number; peopleInDirectory?: number; teamsImported: number; positionsImported: number; scheduledAssignmentsImported: number; itemAssignmentsImported: number; serviceTypes: number; syncedAt: string }> {
  return request("/api/v1/integrations/planning-center/sync", { method: "POST" });
}
export interface ProPresenterLive {
  configured?: boolean; connected: boolean; message?: string; version?: unknown;
  presentation?: unknown; presentationName?: string | null; slide?: unknown; slideIndex?: unknown;
  slideUuid?: string | null; checkedAt?: string;
  rundownMatch?: { status: "matched" | "unmatched" | "ambiguous" | "disconnected"; itemId: string | null; matchMethod: string | null; message: string };
}
export function getProPresenterLive(serviceId?: string): Promise<ProPresenterLive> {
  const query = serviceId ? `?serviceId=${encodeURIComponent(serviceId)}` : "";
  return request(`/api/v1/integrations/propresenter/live${query}`);
}

export type ProPresenterAction = "next" | "previous" | "clear_slide";
export function sendProPresenterCommand(action: ProPresenterAction): Promise<{ success: true; action: ProPresenterAction; message: string }> {
  return request("/api/v1/integrations/propresenter/command", {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}


export interface MicrophoneAssignment {
  slotKey: "mic-1" | "mic-2" | "mic-3" | "mic-4" | "mic-5" | "headset";
  personId: string;
  personName: string;
  updatedAt: string;
}
export function getMicrophoneAssignments(serviceId: string): Promise<{ assignments: MicrophoneAssignment[] }> {
  return request(`/api/v1/church/services/${encodeURIComponent(serviceId)}/microphones`);
}
export function saveMicrophoneAssignments(serviceId: string, assignments: Array<{ slotKey: MicrophoneAssignment["slotKey"]; personId: string | null }>): Promise<{ saved: true; assignments: MicrophoneAssignment[] }> {
  return request(`/api/v1/church/services/${encodeURIComponent(serviceId)}/microphones`, {
    method: "PUT",
    body: JSON.stringify({ assignments }),
  });
}

export interface ShureSlxdDevice {
  deviceId: string; model: string | null; firmware: string | null; rfBand: string | null;
  channelName: string | null; frequencyHz: number | null; groupChannel: string | null;
  transmitterModel: string | null; transmitterConnected: boolean | null;
  batteryBars: number | null; batteryPercentEstimate: number | null; batteryRuntimeMinutes: number | null;
  batteryRuntimeState: "available" | "calculating" | "communication_warning" | "unknown";
  rfAntennaADbm: number | null; rfAntennaBDbm: number | null; rfDbm: number | null;
  audioPeakDbfs: number | null; audioRmsDbfs: number | null;
  connected: boolean; lastSeenAt: string; lastSampleAt: string | null;
  remoteAddress: string; channel: number; diagnostic: string | null;
}
export interface ShureSlxdStatus {
  enabled: boolean; listening: boolean; host: string | null; port: number | null;
  configuredReceiverCount: number; devices: ShureSlxdDevice[]; message: string;
}
export function getShureSlxdStatus(): Promise<ShureSlxdStatus> {
  return request("/api/v1/integrations/shure-slxd/status");
}
