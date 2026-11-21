import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, Mic, Radio, RefreshCw, UserRound } from "lucide-react";
import {
  getChurchServices,
  getChurchServiceWorkspace,
  getMicrophoneAssignments,
  saveMicrophoneAssignments,
  getShureSlxdStatus,
  type ShureSlxdStatus,
  type ChurchService,
  type ChurchServiceWorkspace,
  type MicrophoneAssignment,
} from "./api";

type SlotKey = MicrophoneAssignment["slotKey"];
type PersonOption = { id: string; name: string; role: string };
const slots: Array<{ key: SlotKey; label: string; detail: string }> = [
  { key: "mic-1", label: "Microphone 1", detail: "Singer channel 1" },
  { key: "mic-2", label: "Microphone 2", detail: "Singer channel 2" },
  { key: "mic-3", label: "Microphone 3", detail: "Singer channel 3" },
  { key: "mic-4", label: "Microphone 4", detail: "Singer channel 4" },
  { key: "mic-5", label: "Microphone 5", detail: "Singer channel 5" },
  { key: "headset", label: "Headset", detail: "Pastor headset / bodypack channel" },
];

function isOnVociTeam(teamName: string | null): boolean {
  // Every person scheduled in Planning Center's Voci team is eligible for every wireless slot.
  // Position (Voci or Lider De Închinare) does not restrict microphone choice.
  return (teamName ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("ro") === "voci";
}

export function MicrophonesPage() {
  const [services, setServices] = useState<ChurchService[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [serviceManuallySelected, setServiceManuallySelected] = useState(false);
  const [workspace, setWorkspace] = useState<ChurchServiceWorkspace | null>(null);
  const [saved, setSaved] = useState<MicrophoneAssignment[]>([]);
  const [draft, setDraft] = useState<Record<SlotKey, string>>({
    "mic-1": "", "mic-2": "", "mic-3": "", "mic-4": "", "mic-5": "", headset: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [hardware, setHardware] = useState<ShureSlxdStatus | null>(null);

  const candidates = useMemo<PersonOption[]>(() => {
    if (!workspace) return [];
    const unique = new Map<string, PersonOption>();
    for (const person of workspace.assignments) {
      if (!isOnVociTeam(person.teamName)) continue;
      if (!unique.has(person.personId)) {
        unique.set(person.personId, {
          id: person.personId,
          name: person.personName,
          role: [person.teamName, person.positionName].filter(Boolean).join(" · "),
        });
      }
    }
    return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [workspace]);

  const loadPlans = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getChurchServices();
      const planningCenterPlans = result.services.filter((service) => service.source === "planning_center");
      setServices(planningCenterPlans);
      setServiceId((current) => {
        if (serviceManuallySelected && current && planningCenterPlans.some((service) => service.id === current)) return current;
        const now = new Date();
        const daysUntilSunday = (7 - now.getDay()) % 7;
        const targetSunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilSunday);
        const dateKey = (date: Date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
        const sundayPlans = planningCenterPlans.filter((service) => service.startsAt && new Date(service.startsAt).getDay() === 0);
        const sameSunday = sundayPlans.find((service) => dateKey(new Date(service.startsAt!)) === dateKey(targetSunday));
        if (sameSunday) return sameSunday.id;
        const upcoming = sundayPlans.filter((service) => new Date(service.startsAt!) >= targetSunday)
          .sort((a, b) => new Date(a.startsAt!).getTime() - new Date(b.startsAt!).getTime());
        if (upcoming[0]) return upcoming[0].id;
        const previous = sundayPlans.filter((service) => new Date(service.startsAt!) < targetSunday)
          .sort((a, b) => new Date(b.startsAt!).getTime() - new Date(a.startsAt!).getTime());
        return previous[0]?.id ?? planningCenterPlans[0]?.id ?? "";
      });
      // Refreshing the plan list must also reload the selected plan roster and saved assignments.
      setRefreshVersion((version) => version + 1);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load Planning Center services.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadPlans(); }, []);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void getShureSlxdStatus().then((status) => { if (active) setHardware(status); })
        .catch(() => { if (active) setHardware(null); });
    };
    refresh();
    const interval = window.setInterval(refresh, 2000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    if (!serviceId) {
      setWorkspace(null);
      setSaved([]);
      setDraft({ "mic-1": "", "mic-2": "", "mic-3": "", "mic-4": "", "mic-5": "", headset: "" });
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([getChurchServiceWorkspace(serviceId), getMicrophoneAssignments(serviceId)])
      .then(([plan, assignments]) => {
        if (!active) return;
        setWorkspace(plan);
        setSaved(assignments.assignments);
        const next: Record<SlotKey, string> = {
          "mic-1": "", "mic-2": "", "mic-3": "", "mic-4": "", "mic-5": "", headset: "",
        };
        for (const assignment of assignments.assignments) next[assignment.slotKey] = assignment.personId;
        setDraft(next);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Could not load this service's microphone assignments.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [serviceId, refreshVersion]);

  const selectedService = services.find((service) => service.id === serviceId) ?? null;
  const selectedPeople = Object.values(draft).filter(Boolean);
  const duplicateSelection = new Set(selectedPeople).size !== selectedPeople.length;
  const dirty = slots.some((slot) => (draft[slot.key] || "") !== (saved.find((item) => item.slotKey === slot.key)?.personId ?? ""));

  const save = async () => {
    if (!serviceId || duplicateSelection) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const assignments = slots.filter((slot) => draft[slot.key]).map((slot) => ({ slotKey: slot.key, personId: draft[slot.key] }));
      const result = await saveMicrophoneAssignments(serviceId, assignments);
      setSaved(result.assignments);
      setNotice("Microphone assignments saved for this service.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save microphone assignments.");
    } finally {
      setSaving(false);
    }
  };

  const serviceLabel = (service: ChurchService) => {
    const date = service.startsAt ? new Date(service.startsAt).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "Date not set";
    return `${date} · ${service.title}`;
  };

  return (
    <>
      <section className="page-heading">
        <div>
          <div className="eyebrow">WIRELESS PRODUCTION</div>
          <h1>Microphones</h1>
          <p>Assign the five handheld microphones and the pastor’s headset to people scheduled in the Voci team for each Sunday service.</p>
        </div>
        <button className="button button-secondary" onClick={() => void loadPlans()} disabled={loading}>
          <RefreshCw size={15} /> Refresh services
        </button>
      </section>

      <section className="panel mic-service-picker">
        <div>
          <div className="mic-section-kicker">SERVICE PLAN</div>
          <h2>Who is serving this Sunday?</h2>
          <p>Choose a Planning Center plan to load everyone scheduled in the Voci team and this Sunday’s saved microphone assignments.</p>
        </div>
        <label className="mic-plan-select">
          <span>Sunday service</span>
          <select value={serviceId} onChange={(event) => { setServiceManuallySelected(true); setServiceId(event.target.value); }} disabled={loading || services.length === 0}>
            {services.length === 0 && <option value="">No service plans available</option>}
            {services.map((service) => <option key={service.id} value={service.id}>{serviceLabel(service)}</option>)}
          </select>
        </label>
      </section>

      {error && <div className="inline-error" role="alert"><AlertCircle size={16} /> {error}</div>}
      {notice && <div className="mic-notice" role="status"><Check size={15} /> {notice}</div>}

      <section className="mic-hardware-banner">
        <div className="mic-hardware-icon"><Radio size={19} /></div>
        <div>
          <strong>SLX-D receiver monitoring</strong>
          <span>{hardware?.message ?? "Checking the local SLX-D monitor…"}</span>
          {hardware?.enabled && <small>{hardware.running ? `Polling ${hardware.configuredReceiverCount} configured receiver IPs on TCP ${hardware.port}` : "Monitor not running"}</small>}
        </div>
        <span className={`mic-hardware-state ${hardware?.running ? "is-online" : ""}`}>{hardware?.running ? "Active" : hardware?.enabled ? "Unavailable" : "Disabled"}</span>
      </section>
      {hardware?.devices && hardware.devices.length > 0 && (
        <section className="mic-hardware-grid" aria-label="Discovered Shure SLX-D receivers">
          {hardware.devices.map((device) => {
            const batteryLabel = device.batteryBars === null ? "Unknown" : `${device.batteryBars}/5 bars · ~${device.batteryPercentEstimate}%`;
            const runtimeLabel = device.batteryRuntimeState === "available" && device.batteryRuntimeMinutes !== null
              ? `${Math.floor(device.batteryRuntimeMinutes / 60)}h ${device.batteryRuntimeMinutes % 60}m`
              : device.batteryRuntimeState === "calculating" ? "Calculating" : device.batteryRuntimeState === "communication_warning" ? "Battery data warning" : "Unavailable";
            const age = Math.max(0, Math.round((Date.now() - new Date(device.lastSeenAt).getTime()) / 1000));
            return (
              <article className="panel mic-hardware-card" key={device.deviceId}>
                <header><div><strong>{device.channelName || device.deviceId}</strong><span>{device.model || "SLX-D receiver"} · {device.deviceId}{device.firmware ? ` · FW ${device.firmware}` : ""}</span></div><span className={device.connected ? "mic-live-pill" : "mic-stale-pill"}>{device.connected ? "Connected" : "Stale"}</span></header>
                <div className="mic-hardware-metrics">
                  <div><span>TRANSMITTER</span><strong>{device.transmitterConnected === true ? (device.transmitterModel || "Connected") : device.transmitterConnected === false ? "No link" : "Unknown"}</strong></div>
                  <div><span>AA BATTERY</span><strong>{batteryLabel}</strong><small>{runtimeLabel}</small></div>
                  <div><span>RF ANTENNA A / B</span><strong>{device.rfAntennaADbm === null ? "—" : `${device.rfAntennaADbm} dBm`} / {device.rfAntennaBDbm === null ? "—" : `${device.rfAntennaBDbm} dBm`}</strong></div>
                  <div><span>AUDIO PEAK / RMS</span><strong>{device.audioPeakDbfs === null ? "—" : `${device.audioPeakDbfs} dBFS`} / {device.audioRmsDbfs === null ? "—" : `${device.audioRmsDbfs} dBFS`}</strong></div>
                  <div><span>FREQUENCY / BAND</span><strong>{device.frequencyHz === null ? "—" : `${(device.frequencyHz / 1000).toFixed(3)} MHz`} · {device.rfBand || "Unknown band"}{device.groupChannel ? ` · G/C ${device.groupChannel}` : ""}</strong></div>
                  <div><span>LAST CONTACT</span><strong>{device.connected ? "Live" : `${age}s ago`}</strong><small>{device.remoteAddress}</small></div>
                </div>
                {device.diagnostic && <p className="mic-hardware-diagnostic">{device.diagnostic}</p>}
              </article>
            );
          })}
        </section>
      )}

      {loading ? (
        <section className="panel mic-empty"><span className="mic-loading" /> Loading service roster…</section>
      ) : !selectedService ? (
        <section className="panel mic-empty"><Mic size={22} /><strong>No Planning Center service plans found</strong><span>Sync Planning Center from the Services page, then return here.</span></section>
      ) : (
        <>
          <div className="mic-roster-summary">
            <div><span>PEOPLE IN VOCI</span><strong>{candidates.length}</strong></div>
            <p>{selectedService.title} · {selectedService.startsAt ? new Date(selectedService.startsAt).toLocaleDateString() : "Date not set"} · {workspace?.assignments.length ?? 0} people scheduled on this plan</p>
          </div>
          {candidates.length === 0 && (
            <div className="mic-empty-roster" role="status">
              <AlertCircle size={17} />
              <div><strong>No one from the Voci team is scheduled on this service</strong><span>Only people scheduled in the Voci team on this Sunday plan are shown. All positions within Voci are eligible for all six slots. The church-wide directory is never used as a fallback.</span></div>
            </div>
          )}
          <div className="mic-slot-grid">
            {slots.map((slot, index) => {
              const assigned = candidates.find((person) => person.id === draft[slot.key]);
              const previous = saved.find((item) => item.slotKey === slot.key);
              const stale = Boolean(previous && draft[slot.key] === previous.personId && !candidates.some((person) => person.id === previous.personId));
              return (
                <article className="panel mic-slot-card" key={slot.key}>
                  <div className="mic-slot-top">
                    <div className="mic-slot-icon"><Mic size={18} /></div>
                    <span className="mic-slot-number">{slot.key === "headset" ? "H" : String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <div className="mic-slot-title"><h2>{slot.label}</h2><span>{slot.detail}</span></div>
                  <div className="mic-slot-telemetry"><span className="mic-offline-dot" /> Receiver telemetry is shown in the hardware inventory above</div>
                  <label className="mic-person-select">
                    <span><UserRound size={14} /> Assigned person</span>
                    <select
                      value={draft[slot.key]}
                      disabled={candidates.length === 0 && !draft[slot.key]}
                      onChange={(event) => {
                        setNotice("");
                        setDraft((current) => ({ ...current, [slot.key]: event.target.value }));
                      }}
                    >
                      <option value="">Unassigned</option>
                      {stale && <option value={previous!.personId} disabled>{previous!.personName} · no longer on plan</option>}
                      {candidates.map((person) => (
                        <option key={person.id} value={person.id} disabled={selectedPeople.includes(person.id) && draft[slot.key] !== person.id}>
                          {person.name}{person.role ? ` · ${person.role}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="mic-slot-foot">{assigned ? <><span className="mic-assigned-dot" /> Assigned for this Sunday</> : <><span className="mic-unassigned-dot" /> {stale ? "Review outdated assignment" : "No person assigned"}</>}</div>
                </article>
              );
            })}
          </div>
          {duplicateSelection && <div className="inline-error" role="alert">A person can only be assigned to one microphone for this service.</div>}
          <div className="mic-save-row">
            <span>Assignments are saved locally for this service only. Planning Center is not modified.</span>
            <button className="button button-dark" onClick={() => void save()} disabled={saving || !dirty || duplicateSelection}>
              {saving ? "Saving…" : "Save microphone assignments"}
            </button>
          </div>
        </>
      )}
      <footer className="page-footer"><span>CHURCH OPS <span className="footer-separator">/</span> WIRELESS</span><span>Local assignments · Planning Center read-only</span></footer>
    </>
  );
}
