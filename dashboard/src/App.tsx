import { useEffect, useState, type FormEvent } from "react";
import {
  Activity,
  ArrowRight,
  CircleHelp,
  Check,
  Clipboard,
  CalendarDays,
  Users,
  UsersRound,
  RadioTower,
  Command,
  Disc3,
  HardDrive,
  Image,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Menu,
  Mic,
  Monitor,
  MonitorPlay,
  Network,
  Plus,
  Radio,
  RefreshCw,
  Server,
  Settings,
  ShieldCheck,
  Wifi,
  X,
} from "lucide-react";
import { createDevicePairingCode, createInitialOperator, getAuthSession, getDevices, getPlaylists, getSources, getServerHealth, getSetupStatus, getChurchOverview, getMedia, login, logout, revokeDeviceCredential, removeRevokedDevice, updateDeviceConfig, type ConnectionState, type Device, type NdiSource, type PlaylistSummary, type Operator, type PairingCode, type ServerHealth } from "./api";
import { MediaPage, PlaylistsPage, SourcesPage } from "./MediaPages";
import { ChurchPage, PeoplePage } from "./ChurchPages";
import { MicrophonesPage } from "./MicrophonesPage";

type Page = "overview" | "services" | "people" | "microphones" | "staff" | "events" | "groups" | "production" | "devices" | "sources" | "media" | "playlists" | "system";
type AuthState = "checking" | "setup" | "login" | "authenticated" | "unavailable";

const navigation: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "services", label: "Services", icon: CalendarDays },
  { id: "people", label: "People", icon: UsersRound },
  { id: "microphones", label: "Microphones", icon: Mic },
  { id: "staff", label: "Staff", icon: Users },
  { id: "events", label: "Events", icon: CalendarDays },
  { id: "groups", label: "Groups", icon: UsersRound },
  { id: "production", label: "ProPresenter", icon: RadioTower },
  { id: "devices", label: "NDI screens", icon: Monitor },
  { id: "sources", label: "NDI sources", icon: Radio },
  { id: "media", label: "Media library", icon: Image },
  { id: "playlists", label: "Playlists", icon: Disc3 },
];

function App() {
  const [page, setPage] = useState<Page>("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>("checking");
  const [health, setHealth] = useState<ServerHealth | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [operator, setOperator] = useState<Operator | null>(null);

  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;

    const checkHealth = async () => {
      controller?.abort();
      const currentController = new AbortController();
      controller = currentController;

      try {
        const result = await getServerHealth(currentController.signal);
        if (!active) return;
        setHealth(result);
        setConnection("online");
      } catch {
        if (!active || currentController.signal.aborted) return;
        setHealth(null);
        setConnection("offline");
      } finally {
        if (active && !currentController.signal.aborted) setLastChecked(new Date());
      }
    };

    void checkHealth();
    const interval = window.setInterval(() => void checkHealth(), 15000);

    return () => {
      active = false;
      window.clearInterval(interval);
      controller?.abort();
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadAuthentication = async () => {
      try {
        const [setupStatus, session] = await Promise.all([
          getSetupStatus(),
          getAuthSession(),
        ]);
        if (!active) return;

        if (session.authenticated && session.operator) {
          setOperator(session.operator);
          setAuthState("authenticated");
        } else {
          setAuthState(setupStatus.setupRequired ? "setup" : "login");
        }
      } catch {
        if (active) setAuthState("unavailable");
      }
    };

    void loadAuthentication();
    return () => { active = false; };
  }, []);

  const handleAuthenticated = (nextOperator: Operator) => {
    setOperator(nextOperator);
    setAuthState("authenticated");
  };

  const handleLogout = async () => {
    try {
      await logout();
      setOperator(null);
      setAuthState("login");
    } catch {
      setAuthState("unavailable");
    }
  };

  const navigate = (nextPage: Page) => {
    setPage(nextPage);
    setMobileNavOpen(false);
  };

  const pageTitle = navigation.find((item) => item.id === page)?.label ?? "System";

  if (authState !== "authenticated" || !operator) {
    return (
      <AuthScreen
        mode={authState}
        onAuthenticated={handleAuthenticated}
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="app-shell">
      {mobileNavOpen && (
        <button
          className="mobile-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-copy">
            <span className="brand-name">Kasapini Dashboard</span>
            <span className="brand-caption">OPERATIONS + MEDIA</span>
          </div>
          <button className="icon-button sidebar-close" aria-label="Close menu" onClick={() => setMobileNavOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <div className="workspace-switcher">
          <div className="workspace-copy">
            <strong>Staff workspace</strong>
            <span>Staff network</span>
          </div>
        </div>

        <div className="nav-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${page === id ? "nav-item-active" : ""}`}
              onClick={() => navigate(id)}
              aria-current={page === id ? "page" : undefined}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="nav-label system-label">SYSTEM</div>
        <nav className="main-nav" aria-label="System navigation">
          <button
            className={`nav-item ${page === "system" ? "nav-item-active" : ""}`}
            onClick={() => navigate("system")}
            aria-current={page === "system" ? "page" : undefined}
          >
            <Settings size={18} strokeWidth={1.8} />
            <span>System settings</span>
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon"><CircleHelp size={17} /></div>
            <div>
              <strong>Need a hand?</strong>
              <span>Locally hosted · Staff only</span>
            </div>
          </div>
          <button className="profile-row profile-button" onClick={() => void handleLogout()} title="Sign out">
            <div className="profile-avatar">{operator.username.slice(0, 1).toUpperCase()}</div>
            <div className="profile-copy">
              <strong>{operator.username}</strong>
              <span>Administrator · Sign out</span>
            </div>
            <LogOut size={16} className="muted-icon" />
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}>
              <Menu size={20} />
            </button>
            <div className="breadcrumbs"><span>Workspace</span><span className="crumb-divider">/</span><strong>{pageTitle}</strong></div>
          </div>
          <div className="topbar-actions">
            <div className={`server-indicator ${connection}`}>
              <span className="status-dot" />
              <span>{connection === "checking" ? "Connecting" : connection === "online" ? "Server online" : "Server offline"}</span>
            </div>
              <div className="topbar-avatar">{operator.username.slice(0, 1).toUpperCase()}</div>
          </div>
        </header>

        <div className="page-content">
          {page === "overview" && (
            <Overview
              connection={connection}
              lastChecked={lastChecked}
              onNavigate={navigate}
            />
          )}
          {page === "services" && <ChurchPage page="services" role={operator.role} />}
          {page === "people" && <PeoplePage />}
          {page === "microphones" && <MicrophonesPage />}
          {page === "staff" && <ChurchPage page="staff" role={operator.role} />}
          {page === "events" && <ChurchPage page="events" role={operator.role} />}
          {page === "groups" && <ChurchPage page="groups" role={operator.role} />}
          {page === "production" && <ChurchPage page="production" role={operator.role} />}
          {page === "devices" && <DevicesPage />}
          {page === "sources" && <SourcesPage />}
          {page === "media" && <MediaPage />}
          {page === "playlists" && <PlaylistsPage />}
          {page === "system" && (
            <SystemPage connection={connection} health={health} lastChecked={lastChecked} />
          )}
        </div>
      </main>
    </div>
  );
}


function AuthScreen({
  mode,
  onAuthenticated,
  onRetry,
}: {
  mode: AuthState;
  onAuthenticated: (operator: Operator) => void;
  onRetry: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [setupKey, setSetupKey] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isSetup = mode === "setup";

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (isSetup && password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const result = isSetup
        ? await createInitialOperator({ setupKey, username, password })
        : await login({ username, password });

      if (!result.authenticated || !result.operator) {
        throw new Error("Authentication did not complete. Please try again.");
      }
      onAuthenticated(result.operator);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-copy"><span className="brand-name">Kasapini Dashboard</span><span className="brand-caption">OPERATIONS + MEDIA</span></div>
        </div>

        {mode === "checking" && (
          <div className="auth-message">
            <LoaderCircle className="auth-spinner" size={25} />
            <h1>Connecting to Kasapini Dashboard</h1>
            <p>Checking your local workspace…</p>
          </div>
        )}

        {mode === "unavailable" && (
          <div className="auth-message">
            <div className="auth-symbol auth-symbol-error"><Server size={23} /></div>
            <h1>Server unavailable</h1>
            <p>Start the Local server, then try connecting again. Your dashboard and data stay on your local network.</p>
            <button className="button button-dark button-full" onClick={onRetry}>Try again <ArrowRight size={15} /></button>
          </div>
        )}

        {(mode === "setup" || mode === "login") && (
          <>
            <div className="auth-heading">
              <div className="auth-symbol"><LockKeyhole size={21} /></div>
              <div className="eyebrow">{isSetup ? "FIRST-TIME SETUP" : "LOCAL WORKSPACE"}</div>
              <h1>{isSetup ? "Create your workspace." : "Welcome back."}</h1>
              <p>{isSetup ? "Create the first administrator account for this church installation." : "Sign in to manage church operations and production."}</p>
            </div>

            <form className="auth-form" onSubmit={(event) => void submit(event)}>
              {isSetup && (
                <label className="field-label">
                  Setup key
                  <input
                    autoComplete="off"
                    maxLength={128}
                    required
                    value={setupKey}
                    onChange={(event) => setSetupKey(event.target.value)}
                    placeholder="Paste the key from the server terminal"
                  />
                  <span className="field-hint">The first-run key is printed once in the local server logs.</span>
                </label>
              )}
              <label className="field-label">
                Username
                <input
                  autoComplete="username"
                  minLength={3}
                  maxLength={32}
                  pattern="[a-zA-Z0-9_-]{3,32}"
                  required
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="Your username"
                />
              </label>
              <label className="field-label">
                Password
                <input
                  autoComplete={isSetup ? "new-password" : "current-password"}
                  minLength={isSetup ? 12 : 1}
                  maxLength={256}
                  required
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={isSetup ? "At least 12 characters" : "Your password"}
                />
              </label>
              {isSetup && (
                <label className="field-label">
                  Confirm password
                  <input
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={256}
                    required
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Enter your password again"
                  />
                </label>
              )}
              {error && <div className="auth-error" role="alert">{error}</div>}
              <button className="button button-dark button-full auth-submit" type="submit" disabled={submitting}>
                {submitting ? <LoaderCircle size={16} className="auth-spinner" /> : null}
                {submitting ? "Please wait…" : isSetup ? "Create administrator" : "Sign in"}
                {!submitting && <ArrowRight size={15} />}
              </button>
            </form>
            <div className="auth-foot"><ShieldCheck size={14} /> Local authentication · No cloud account required</div>
          </>
        )}
      </div>
      <div className="auth-background-mark">KASAPINI DASHBOARD</div>
    </main>
  );
}

function Overview({
  connection,
  lastChecked,
  onNavigate,
}: {
  connection: ConnectionState;
  lastChecked: Date | null;
  onNavigate: (page: Page) => void;
}) {
  const [deviceCount, setDeviceCount] = useState<number | null>(null);
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  const [sourceCount, setSourceCount] = useState<number | null>(null);
  const [mediaCount, setMediaCount] = useState<number | null>(null);
  const [churchStats, setChurchStats] = useState<{ staffCount: number; upcomingServices: number; activeEvents: number; activeGroups: number } | null>(null);

  useEffect(() => {
    let active = true;
    const loadChurchStats = async () => {
      try {
        const result = await getChurchOverview();
        if (active) setChurchStats(result);
      } catch {
        if (active) setChurchStats(null);
      }
    };
    void loadChurchStats();
    const timer = window.setInterval(() => void loadChurchStats(), 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;

    const refreshDevices = async () => {
      controller?.abort();
      const currentController = new AbortController();
      controller = currentController;
      try {
        const [result, sources, media] = await Promise.all([getDevices(currentController.signal), getSources(currentController.signal), getMedia(currentController.signal)]);
        if (!active) return;
        setDeviceCount(result.devices.length);
        setOnlineCount(result.devices.filter((device) => device.status === "online").length);
        setSourceCount(sources.sources.length);
        setMediaCount(media.media.length);
      } catch {
        if (!active || currentController.signal.aborted) return;
        setDeviceCount(null);
        setOnlineCount(null);
        setSourceCount(null);
        setMediaCount(null);
      }
    };

    void refreshDevices();
    const interval = window.setInterval(() => void refreshDevices(), 15000);
    return () => {
      active = false;
      window.clearInterval(interval);
      controller?.abort();
    };
  }, []);

  return (
    <>
      <section className="page-heading">
        <div>
          <div className="eyebrow">KASAPINI DASHBOARD AT A GLANCE</div>
          <h1>Church overview.</h1>
          <p>Here's what's happening across church operations and production.</p>
        </div>
        <button className="button button-secondary" onClick={() => onNavigate("devices")}>
          <Monitor size={16} /> View devices
        </button>
      </section>

      <section className="stat-grid church-summary-grid" aria-label="Church overview summary">
        <StatCard label="Staff accounts" value={churchStats === null ? "—" : String(churchStats.staffCount)} detail="Internal team access" icon={Users} />
        <StatCard label="Upcoming services" value={churchStats === null ? "—" : String(churchStats.upcomingServices)} detail="Planned service records" icon={CalendarDays} />
        <StatCard label="Active events" value={churchStats === null ? "—" : String(churchStats.activeEvents)} detail="Church calendar" icon={CalendarDays} />
        <StatCard label="Small groups" value={churchStats === null ? "—" : String(churchStats.activeGroups)} detail="Active groups" icon={UsersRound} />
      </section>

      <section className="stat-grid" aria-label="Network summary">
        <StatCard label="Total devices" value={deviceCount === null ? "—" : String(deviceCount)} detail={deviceCount === null ? "Device status unavailable" : deviceCount === 0 ? "No receivers registered" : "Registered receivers"} icon={Monitor} />
        <StatCard label="Online now" value={onlineCount === null ? "—" : String(onlineCount)} detail={onlineCount === null ? "Device status unavailable" : "Reporting a recent heartbeat"} icon={Wifi} />
        <StatCard label="NDI sources" value={sourceCount === null ? "—" : String(sourceCount)} detail="Discovered on the local network" icon={Radio} />
        <StatCard label="Media assets" value={mediaCount === null ? "—" : String(mediaCount)} detail="Media assets stored locally" icon={Image} />
      </section>

      <section className="overview-grid">
        <div className="panel network-panel">
          <div className="panel-heading">
            <div>
              <h2>Network status</h2>
              <p>Live connection to the local church server</p>
            </div>
            <span className={`pill ${connection === "online" ? "pill-success" : connection === "offline" ? "pill-danger" : "pill-neutral"}`}>
              <span className="status-dot" />
              {connection === "online" ? "Operational" : connection === "offline" ? "Disconnected" : "Checking"}
            </span>
          </div>

          <div className="network-visual">
            <div className="network-node network-node-server">
              <div className="network-node-icon"><Server size={22} /></div>
              <div><strong>Local application server</strong><span>{connection === "online" ? "Responding normally" : connection === "offline" ? "Cannot be reached" : "Checking connection"}</span></div>
              <span className={`node-dot ${connection}`} />
            </div>
            <div className="network-connector"><span /></div>
            <div className="network-node network-node-receivers">
              <div className="network-node-icon receiver-icon"><MonitorPlay size={22} /></div>
              <div><strong>NDI receivers</strong><span>{deviceCount === null ? "Device status unavailable" : deviceCount === 0 ? "Waiting for devices to pair" : `${deviceCount} registered receiver${deviceCount === 1 ? "" : "s"}`}</span></div>
              <span className="node-count">{deviceCount === null ? "—" : deviceCount}</span>
            </div>
          </div>

          <div className="panel-footer">
            <span>{lastChecked ? `Last checked at ${lastChecked.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Waiting for first health check"}</span>
            <button className="text-button" onClick={() => onNavigate("system")}>View system status <ArrowRight size={14} /></button>
          </div>
        </div>

        <div className="panel setup-panel">
          <div className="setup-topline"><span className="setup-kicker">GETTING STARTED</span><span className="setup-step">01 / 04</span></div>
          <div className="setup-icon"><Network size={22} /></div>
          <h2>{deviceCount === null ? "Checking your network." : deviceCount === 0 ? "Let's get your network connected." : "Your receivers are registered."}</h2>
          <p>{deviceCount === null ? "Device inventory is temporarily unavailable. Check the server connection and try again." : deviceCount === 0 ? "The local platform is ready for its first receiver. Generate a pairing code to begin enrollment." : "Your devices are registered. Receiver-side enrollment and playback reporting are the next integration steps."}</p>
          <div className="setup-progress"><span /></div>
          <div className="setup-progress-label"><span>Platform setup</span><strong>Just getting started</strong></div>
          <button className="button button-dark button-full" onClick={() => onNavigate("devices")}>
            Explore receiver management <ArrowRight size={16} />
          </button>
        </div>
      </section>

      <section className="lower-grid">
        <div className="panel table-panel">
          <div className="panel-heading">
            <div><h2>Devices</h2><p>Receivers connected to this workspace</p></div>
            <button className="text-button" onClick={() => onNavigate("devices")}>View all <ArrowRight size={14} /></button>
          </div>
          <div className="empty-table">
            <div className="empty-icon"><Monitor size={20} /></div>
            <strong>{deviceCount === null ? "Device inventory unavailable" : deviceCount === 0 ? "No devices yet" : `${deviceCount} receiver${deviceCount === 1 ? "" : "s"} registered`}</strong>
            <span>{deviceCount === null ? "The dashboard could not retrieve the protected device inventory." : deviceCount === 0 ? "Paired receivers will appear here with their live playback status." : "Open Devices to inspect receiver status, playback mode and last heartbeat."}</span>
          </div>
        </div>

        <div className="panel activity-panel">
          <div className="panel-heading"><div><h2>Recent activity</h2><p>Updates from your network</p></div><Activity size={18} className="muted-icon" /></div>
          <div className="empty-activity">
            <div className="activity-line" />
            <div><strong>It's quiet around here.</strong><span>Device events, playback changes and alerts will show up here.</span></div>
          </div>
          <div className="activity-foot"><span className="activity-foot-dot" /> Activity monitoring will start when your first receiver connects.</div>
        </div>
      </section>

      <footer className="page-footer"><span>KASAPINI DASHBOARD <span className="footer-separator">/</span> NETWORK VIDEO. SIMPLIFIED.</span><span>Local-first by design <ShieldCheck size={13} /></span></footer>
    </>
  );
}

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Monitor;
}) {
  return (
    <div className="stat-card">
      <div className="stat-top"><span>{label}</span><div className="stat-icon"><Icon size={17} /></div></div>
      <div className="stat-value">{value}</div>
      <div className="stat-detail">{detail}</div>
    </div>
  );
}


function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pairingCode, setPairingCode] = useState<PairingCode | null>(null);
  const [creatingCode, setCreatingCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [revokingDeviceId, setRevokingDeviceId] = useState<string | null>(null);
  const [sources, setSources] = useState<NdiSource[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { sourceAddress: string; fallbackPlaylistId: string }>>({});
  const [savingConfigId, setSavingConfigId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;

    const loadDevices = async () => {
      controller?.abort();
      const currentController = new AbortController();
      controller = currentController;

      try {
        const [result, sourceResult, playlistResult] = await Promise.all([
          getDevices(currentController.signal), getSources(currentController.signal), getPlaylists(currentController.signal),
        ]);
        if (!active) return;
        setDevices(result.devices);
        setSources(sourceResult.sources);
        setPlaylists(playlistResult.playlists);
        setDrafts((current) => {
          const next = { ...current };
          for (const device of result.devices) {
            if (!next[device.id]) next[device.id] = {
              sourceAddress: device.assignedNdiSourceAddress ?? "",
              fallbackPlaylistId: device.fallbackPlaylistId ?? "",
            };
          }
          return next;
        });
        setError("");
      } catch (loadError) {
        if (!active || currentController.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : "Could not load devices.");
      } finally {
        if (active && !currentController.signal.aborted) setLoading(false);
      }
    };

    void loadDevices();
    const interval = window.setInterval(() => void loadDevices(), 15000);

    return () => {
      active = false;
      window.clearInterval(interval);
      controller?.abort();
    };
  }, [refreshTick]);

  const createCode = async () => {
    setCreatingCode(true);
    setError("");
    setCopied(false);
    try {
      const result = await createDevicePairingCode();
      setPairingCode(result);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create a pairing code.");
    } finally {
      setCreatingCode(false);
    }
  };

  const copyCode = async () => {
    if (!pairingCode) return;
    try {
      await navigator.clipboard.writeText(pairingCode.code);
      setCopied(true);
    } catch {
      setError("Clipboard access is unavailable. You can select and copy the code manually.");
    }
  };

  const revokeCredential = async (device: Device) => {
    if (device.credentialStatus === "revoked") return;
    if (!window.confirm(`Revoke access for "${device.name}"? This receiver will no longer be able to send heartbeats. It will need to be removed and paired again to reconnect.`)) return;
    setRevokingDeviceId(device.id);
    setError("");
    try {
      await revokeDeviceCredential(device.id);
      setRefreshTick((tick) => tick + 1);
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "Could not revoke receiver access.");
    } finally {
      setRevokingDeviceId(null);
    }
  };


  const saveDeviceConfig = async (device: Device) => {
    const draft = drafts[device.id] ?? { sourceAddress: device.assignedNdiSourceAddress ?? "", fallbackPlaylistId: device.fallbackPlaylistId ?? "" };
    const selectedSource = sources.find((source) => source.address === draft.sourceAddress);
    if (draft.sourceAddress && !selectedSource) {
      setError("That NDI source is no longer in the current source inventory. Refresh the list and select it again.");
      return;
    }
    setSavingConfigId(device.id);
    setError("");
    try {
      await updateDeviceConfig(device.id, {
        ndiSourceName: selectedSource?.name ?? null,
        ndiSourceAddress: selectedSource?.address ?? null,
        fallbackPlaylistId: draft.fallbackPlaylistId || null,
      });
      setDrafts((current) => ({ ...current, [device.id]: draft }));
      setRefreshTick((tick) => tick + 1);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save receiver configuration.");
    } finally {
      setSavingConfigId(null);
    }
  };

  const removeDevice = async (device: Device) => {
    if (device.credentialStatus !== "revoked") return;
    if (!window.confirm(`Remove "${device.name}" from this church workspace? This cannot be undone.`)) return;
    setRevokingDeviceId(device.id);
    setError("");
    try {
      await removeRevokedDevice(device.id);
      setRefreshTick((tick) => tick + 1);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Could not remove receiver.");
    } finally {
      setRevokingDeviceId(null);
    }
  };

  return (
    <>
      <section className="page-heading">
        <div>
          <div className="eyebrow">RECEIVER MANAGEMENT</div>
          <h1>Devices</h1>
          <p>Manage NDI receivers, display assignments and playback state.</p>
        </div>
        <button className="button button-dark" onClick={() => void createCode()} disabled={creatingCode}>
          {creatingCode ? <LoaderCircle size={15} className="auth-spinner" /> : <Plus size={16} />}
          {creatingCode ? "Creating code…" : "Pair receiver"}
        </button>
      </section>

      {pairingCode && (
        <section className="panel pairing-panel">
          <div className="pairing-heading">
            <div className="pairing-icon"><Network size={19} /></div>
            <div><h2>One-time pairing code</h2><p>Generated for a new NDI receiver</p></div>
            <button className="icon-button" aria-label="Dismiss pairing code" onClick={() => setPairingCode(null)}><X size={17} /></button>
          </div>
          <div className="pairing-code-row">
            <code>{pairingCode.code}</code>
            <button className="button button-secondary" onClick={() => void copyCode()}>
              {copied ? <Check size={15} /> : <Clipboard size={15} />}
              {copied ? "Copied" : "Copy code"}
            </button>
          </div>
          <div className="pairing-foot">
            <span>This code expires at {new Date(pairingCode.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} and can only be used once.</span>
            <span>Enter this code in the receiver configuration to pair it with this server.</span>
          </div>
        </section>
      )}

      {error && <div className="inline-error" role="alert">{error}</div>}

      <section className="panel devices-panel">
        <div className="panel-heading">
          <div><h2>Registered receivers</h2><p>Live status is refreshed every 15 seconds</p></div>
          <button className="icon-button refresh-button" aria-label="Refresh device list" onClick={() => setRefreshTick((tick) => tick + 1)}><RefreshCw size={16} /></button>
        </div>

        {loading ? (
          <div className="devices-empty"><LoaderCircle size={22} className="auth-spinner" /><span>Loading devices…</span></div>
        ) : devices.length === 0 ? (
          <div className="devices-empty">
            <div className="empty-icon"><Monitor size={20} /></div>
            <strong>No receivers paired yet</strong>
            <span>Create a one-time pairing code to prepare a receiver for enrollment.</span>
            <button className="button button-secondary" onClick={() => void createCode()} disabled={creatingCode}>
              <Plus size={15} /> Generate pairing code
            </button>
          </div>
        ) : (
          <div className="device-list">
            <div className="device-list-head"><span>DEVICE</span><span>STATUS</span><span>PLAYBACK</span><span>LAST SEEN</span></div>
            {devices.map((device) => (
              <div className="device-row" key={device.id}>
                <div className="device-identity">
                  <div className="device-avatar"><MonitorPlay size={18} /></div>
                  <div><strong>{device.name}</strong><span>{device.platform} · v{device.softwareVersion}</span><span className={device.credentialStatus === "revoked" ? "device-credential-revoked" : "device-credential-active"}>{device.credentialStatus === "revoked" ? "Credential revoked" : "Credential active"}</span></div>
                </div>
                <div><span className={`device-status device-status-${device.status}`}><span />{device.status}</span></div>
                <div className="device-playback"><strong>{device.playbackMode}</strong><span>{device.ndiSourceName ?? "No NDI source reported"}</span></div>
                <div className="device-last-seen">{device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : "Never connected"}{device.credentialStatus === "active" ? <button className="button button-secondary device-revoke-button" disabled={revokingDeviceId === device.id} onClick={() => void revokeCredential(device)}>{revokingDeviceId === device.id ? "Revoking…" : "Revoke access"}</button> : <button className="button button-secondary device-revoke-button" disabled={revokingDeviceId === device.id} onClick={() => void removeDevice(device)}>{revokingDeviceId === device.id ? "Removing…" : "Remove device"}</button>}</div>
                <div className="device-assignment">
                  <label>NDI source
                    <select disabled={device.credentialStatus !== "active"} value={(drafts[device.id]?.sourceAddress ?? device.assignedNdiSourceAddress) ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [device.id]: { sourceAddress: event.target.value, fallbackPlaylistId: current[device.id]?.fallbackPlaylistId ?? device.fallbackPlaylistId ?? "" } }))}>
                      <option value="">Automatic / unassigned</option>
                      {device.assignedNdiSourceAddress && !sources.some((source) => source.address === device.assignedNdiSourceAddress) && <option value={device.assignedNdiSourceAddress}>{device.assignedNdiSourceName ?? "Previously assigned source"} (not currently discovered)</option>}
                      {sources.filter((source) => source.address).map((source) => <option key={source.address} value={source.address!}>{source.name}</option>)}
                    </select>
                  </label>
                  <label>Fallback playlist
                    <select disabled={device.credentialStatus !== "active"} value={(drafts[device.id]?.fallbackPlaylistId ?? device.fallbackPlaylistId) ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [device.id]: { sourceAddress: current[device.id]?.sourceAddress ?? device.assignedNdiSourceAddress ?? "", fallbackPlaylistId: event.target.value } }))}>
                      <option value="">No fallback assigned</option>
                      {playlists.map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.name}</option>)}
                    </select>
                  </label>
                  <button className="button button-secondary" disabled={device.credentialStatus !== "active" || savingConfigId === device.id} onClick={() => void saveDeviceConfig(device)}>{savingConfigId === device.id ? "Saving…" : "Save assignment"}</button>
                  <span>Config v{device.configVersion}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className="page-footer"><span>KASAPINI DASHBOARD <span className="footer-separator">/</span> NETWORK VIDEO. SIMPLIFIED.</span><span>Receiver status from local heartbeats <ShieldCheck size={13} /></span></footer>
    </>
  );
}

function SystemPage({
  connection,
  health,
  lastChecked,
}: {
  connection: ConnectionState;
  health: ServerHealth | null;
  lastChecked: Date | null;
}) {
  return (
    <>
      <section className="page-heading">
        <div><div className="eyebrow">PLATFORM HEALTH</div><h1>System</h1><p>Health and diagnostics for your local Kasapini Dashboard installation.</p></div>
        <span className={`pill ${connection === "online" ? "pill-success" : connection === "offline" ? "pill-danger" : "pill-neutral"}`}><span className="status-dot" />{connection === "online" ? "Operational" : connection === "offline" ? "Disconnected" : "Checking"}</span>
      </section>
      <section className="system-grid">
        <div className="panel system-card">
          <div className="system-card-icon"><Server size={19} /></div>
          <div className="system-card-label">LOCAL SERVER</div>
          <h2>{connection === "online" ? "Connected" : connection === "offline" ? "Unreachable" : "Checking…"}</h2>
          <p>{health ? `${health.service} · v${health.version}` : "The dashboard is checking the local server health endpoint."}</p>
          <div className="system-card-foot"><span className={`status-dot ${connection === "online" ? "dot-online" : connection === "offline" ? "dot-offline" : ""}`} />{lastChecked ? `Last checked ${lastChecked.toLocaleString()}` : "No successful check yet"}</div>
        </div>
        <div className="panel system-card">
          <div className="system-card-icon"><HardDrive size={19} /></div>
          <div className="system-card-label">DATABASE</div>
          <h2>SQLite · WAL enabled</h2>
          <p>Persistent local storage is initialized by the local server.</p>
          <div className="system-card-foot"><span className="status-dot dot-online" />Database ready</div>
        </div>
        <div className="panel system-card">
          <div className="system-card-icon"><Wifi size={19} /></div>
          <div className="system-card-label">RECEIVER NETWORK</div>
          <h2>Receiver control plane</h2>
          <p>Pairing, heartbeat, and receiver configuration APIs are connected. Full NDI SDK build and hardware validation remain.</p>
          <div className="system-card-foot"><span className="status-dot dot-pending" />Pairing and config APIs ready · SDK validation pending</div>
        </div>
        <div className="panel system-card">
          <div className="system-card-icon"><ShieldCheck size={19} /></div>
          <div className="system-card-label">SECURITY</div>
          <h2>Operator authentication</h2>
          <p>First-run setup keys, scrypt password hashes and HttpOnly sessions are implemented. Non-loopback binding requires TLS.</p>
          <div className="system-card-foot"><span className="status-dot dot-pending" />LAN access disabled by default</div>
        </div>
      </section>
      <section className="panel system-info">
        <div className="panel-heading"><div><h2>Platform components</h2><p>Implementation status of the local platform</p></div><Command size={18} className="muted-icon" /></div>
        <div className="component-row"><div className="component-icon"><MonitorPlay size={17} /></div><div className="component-copy"><strong>NDI Receiver Engine</strong><span>Native C++ / NDI / SDL2</span></div><span className="component-status status-foundation">Foundation</span></div>
        <div className="component-row"><div className="component-icon"><Server size={17} /></div><div className="component-copy"><strong>Local API Server</strong><span>TypeScript / Fastify</span></div><span className="component-status status-foundation">Foundation</span></div>
        <div className="component-row"><div className="component-icon"><LayoutDashboard size={17} /></div><div className="component-copy"><strong>Kasapini Dashboard</strong><span>React / Vite</span></div><span className="component-status status-foundation">Foundation</span></div>
      </section>
      <footer className="page-footer"><span>KASAPINI DASHBOARD <span className="footer-separator">/</span> NETWORK VIDEO. SIMPLIFIED.</span><span>Local-first by design <ShieldCheck size={13} /></span></footer>
    </>
  );
}

export default App;
