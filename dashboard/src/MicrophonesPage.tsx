import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, Mic, Radio, RefreshCw, UserRound } from "lucide-react";
import {
  getChurchServices,
  getChurchServiceWorkspace,
  getMicrophoneAssignments,
  saveMicrophoneAssignments,
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
  { key: "headset", label: "Headset", detail: "Headset / bodypack channel" },
];

function isSingerRole(teamName: string | null, positionName: string | null): boolean {
  const team = (teamName ?? "").toLowerCase();
  const position = (positionName ?? "").toLowerCase();
  return /singer|vocal|choir/.test(position) ||
    /singer|vocal|choir/.test(team) ||
    /worship leader/.test(position);
}

export function MicrophonesPage() {
  const [services, setServices] = useState<ChurchService[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [workspace, setWorkspace] = useState<ChurchServiceWorkspace | null>(null);
  const [saved, setSaved] = useState<MicrophoneAssignment[]>([]);
  const [draft, setDraft] = useState<Record<SlotKey, string>>({
    "mic-1": "", "mic-2": "", "mic-3": "", "mic-4": "", "mic-5": "", headset: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const candidates = useMemo<PersonOption[]>(() => {
    if (!workspace) return [];
    const unique = new Map<string, PersonOption>();
    for (const person of workspace.assignments) {
      if (!isSingerRole(person.teamName, person.positionName)) continue;
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
      setServices(result.services);
      setServiceId((current) => current && result.services.some((service) => service.id === current)
        ? current
        : result.services[0]?.id ?? "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load Planning Center services.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadPlans(); }, []);

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
  }, [serviceId]);

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
          <p>Assign the six wireless channels to the people scheduled for each Sunday service.</p>
        </div>
        <button className="button button-secondary" onClick={() => void loadPlans()} disabled={loading}>
          <RefreshCw size={15} /> Refresh services
        </button>
      </section>

      <section className="panel mic-service-picker">
        <div>
          <div className="mic-section-kicker">SERVICE PLAN</div>
          <h2>Who is serving this Sunday?</h2>
          <p>Choose a Planning Center plan to load its scheduled singer roster and saved microphone assignments.</p>
        </div>
        <label className="mic-plan-select">
          <span>Sunday service</span>
          <select value={serviceId} onChange={(event) => setServiceId(event.target.value)} disabled={loading || services.length === 0}>
            {services.length === 0 && <option value="">No service plans available</option>}
            {services.map((service) => <option key={service.id} value={service.id}>{serviceLabel(service)}</option>)}
          </select>
        </label>
      </section>

      {error && <div className="inline-error" role="alert"><AlertCircle size={16} /> {error}</div>}
      {notice && <div className="mic-notice" role="status"><Check size={15} /> {notice}</div>}

      <section className="mic-hardware-banner">
        <div className="mic-hardware-icon"><Radio size={19} /></div>
        <div><strong>SLX-D receiver monitoring</strong><span>Hardware discovery is not enabled yet. Receiver battery, RF and audio readings will appear here after the first physical receiver test.</span></div>
        <span className="mic-hardware-state">Setup pending</span>
      </section>

      {loading ? (
        <section className="panel mic-empty"><span className="mic-loading" /> Loading service roster…</section>
      ) : !selectedService ? (
        <section className="panel mic-empty"><Mic size={22} /><strong>No Planning Center service plans found</strong><span>Sync Planning Center from the Services page, then return here.</span></section>
      ) : (
        <>
          <div className="mic-roster-summary">
            <div><span>ELIGIBLE SINGERS</span><strong>{candidates.length}</strong></div>
            <p>{selectedService.title} · {selectedService.startsAt ? new Date(selectedService.startsAt).toLocaleDateString() : "Date not set"} · {workspace?.assignments.length ?? 0} people scheduled on this plan</p>
          </div>
          {candidates.length === 0 && (
            <div className="mic-empty-roster" role="status">
              <AlertCircle size={17} />
              <div><strong>No singers identified on this service plan</strong><span>Only people scheduled to this Sunday plan are considered. Check that the Planning Center team positions are named with a singer/vocal role. The church-wide directory is never used as a fallback.</span></div>
            </div>
          )}
          <div className="mic-slot-grid">
            {slots.map((slot, index) => {
              const assigned = candidates.find((person) => person.id === draft[slot.key]);
              const previous = saved.find((item) => item.slotKey === slot.key);
              const stale = Boolean(previous && !assigned);
              return (
                <article className="panel mic-slot-card" key={slot.key}>
                  <div className="mic-slot-top">
                    <div className="mic-slot-icon"><Mic size={18} /></div>
                    <span className="mic-slot-number">{slot.key === "headset" ? "H" : String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <div className="mic-slot-title"><h2>{slot.label}</h2><span>{slot.detail}</span></div>
                  <div className="mic-slot-telemetry"><span className="mic-offline-dot" /> Receiver not yet discovered</div>
                  <label className="mic-person-select">
                    <span><UserRound size={14} /> Assigned person</span>
                    <select
                      value={draft[slot.key]}
                      disabled={candidates.length === 0}
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
            <button className="button button-dark" onClick={() => void save()} disabled={saving || !dirty || duplicateSelection || candidates.length === 0}>
              {saving ? "Saving…" : "Save microphone assignments"}
            </button>
          </div>
        </>
      )}
      <footer className="page-footer"><span>CHURCH OPS <span className="footer-separator">/</span> WIRELESS</span><span>Local assignments · Planning Center read-only</span></footer>
    </>
  );
}
