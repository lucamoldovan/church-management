import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Activity, CalendarDays, CircleAlert, LoaderCircle, Plus, RefreshCw, Users, UsersRound, RadioTower, ShieldCheck } from "lucide-react";
import {
  createChurchEvent, createChurchGroup, createChurchService, createChurchStaff,
  getChurchEvents, getChurchGroups, getChurchServices, getChurchStaff,
  getPlanningCenterStatus, getProPresenterLive, getChurchServiceItems, sendProPresenterCommand, syncPlanningCenter,
  type ChurchEvent, type ChurchGroup, type ChurchService, type ChurchServiceItem, type ChurchStaff,
  type ProPresenterLive,
} from "./api";

export type ChurchPageId = "services" | "staff" | "events" | "groups" | "production";

const dateLabel = (value: string | null) => value
  ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
  : "Not scheduled";
const localIso = (value: string) => value ? new Date(value).toISOString() : undefined;

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <section className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</section>;
}

function Notice({ error, success }: { error: string; success: string }) {
  if (!error && !success) return null;
  return <div className={`church-notice ${error ? "church-notice-error" : "church-notice-success"}`} role="status">{error || success}</div>;
}

export function ChurchPage({ page, role }: { page: ChurchPageId; role: string }) {
  const [services, setServices] = useState<ChurchService[]>([]);
  const [expandedServiceId, setExpandedServiceId] = useState<string | null>(null);
  const [serviceItems, setServiceItems] = useState<Record<string, ChurchServiceItem[]>>({});
  const [staff, setStaff] = useState<ChurchStaff[]>([]);
  const [events, setEvents] = useState<ChurchEvent[]>([]);
  const [groups, setGroups] = useState<ChurchGroup[]>([]);
  const [pco, setPco] = useState<{ configured: boolean; connected: boolean; message: string } | null>(null);
  const [propresenter, setPropresenter] = useState<ProPresenterLive | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);

  const refresh = async () => {
    setError("");
    try {
      if (page === "services") {
        const [result, status] = await Promise.all([getChurchServices(), getPlanningCenterStatus()]);
        setServices(result.services); setPco(status);
      } else if (page === "staff") {
        setStaff((await getChurchStaff()).staff);
      } else if (page === "events") {
        setEvents((await getChurchEvents()).events);
      } else if (page === "groups") {
        setGroups((await getChurchGroups()).groups);
      } else {
        setPropresenter(await getProPresenterLive());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this section.");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    setLoading(true);
    void refresh();
    if (page !== "production") return;
    const timer = window.setInterval(() => {
      void getProPresenterLive().then(setPropresenter).catch((e) => {
        setError(e instanceof Error ? e.message : "Could not refresh ProPresenter status.");
      });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [page]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(""); setSuccess("");
    const data = new FormData(event.currentTarget);
    const value = (key: string) => String(data.get(key) ?? "").trim();
    try {
      if (page === "services") {
        await createChurchService({ title: value("title"), startsAt: localIso(value("startsAt")), endsAt: localIso(value("endsAt")), location: value("location") });
        setSuccess("Service created.");
      } else if (page === "events") {
        await createChurchEvent({ title: value("title"), description: value("description"), startsAt: localIso(value("startsAt")), endsAt: localIso(value("endsAt")), location: value("location"), capacity: value("capacity") ? Number(value("capacity")) : undefined });
        setSuccess("Event created.");
      } else if (page === "groups") {
        await createChurchGroup({ name: value("name"), description: value("description"), leader: value("leader"), meetingDay: value("meetingDay"), meetingTime: value("meetingTime"), location: value("location") });
        setSuccess("Group created.");
      } else if (page === "staff") {
        await createChurchStaff({ username: value("username"), displayName: value("displayName"), password: value("password"), role: value("role"), department: value("department") });
        setSuccess("Staff account created.");
      }
      setShowForm(false); event.currentTarget.reset(); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save this record."); }
    finally { setBusy(false); }
  };

  const toggleServiceItems = async (serviceId: string) => {
    if (expandedServiceId === serviceId) { setExpandedServiceId(null); return; }
    setExpandedServiceId(serviceId);
    if (serviceItems[serviceId]) return;
    setBusy(true); setError("");
    try {
      const result = await getChurchServiceItems(serviceId);
      setServiceItems(current => ({ ...current, [serviceId]: result.items }));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load the service order."); }
    finally { setBusy(false); }
  };

  const sync = async () => {
    setBusy(true); setError(""); setSuccess("");
    try {
      const result = await syncPlanningCenter();
      setSuccess(`Synced ${result.imported} service plans and ${result.itemsImported} order items from Planning Center.`);
      setServiceItems({}); setExpandedServiceId(null);
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Planning Center sync failed."); }
    finally { setBusy(false); }
  };

  const refreshLive = async () => {
    setBusy(true); setError("");
    try { setPropresenter(await getProPresenterLive()); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not reach ProPresenter."); }
    finally { setBusy(false); }
  };

  const runProductionAction = async (action: "next" | "previous" | "clear_slide") => {
    setBusy(true); setError(""); setSuccess("");
    try {
      const result = await sendProPresenterCommand(action);
      setSuccess(result.message);
      setPropresenter(await getProPresenterLive());
    } catch (e) {
      setError(e instanceof Error ? e.message : "ProPresenter command failed.");
    } finally {
      setBusy(false);
    }
  };

  const presentationPayload = propresenter?.presentation as {
    name?: string;
    presentation?: { name?: string };
    announcements?: { name?: string };
  } | null;
  const presentationName = presentationPayload?.name ??
    presentationPayload?.presentation?.name ?? presentationPayload?.announcements?.name;
  const slidePayload = propresenter?.slide as {
    current?: { text?: string; notes?: string } | null;
    next?: { text?: string; notes?: string } | null;
  } | null;

  if (page === "services") return <div>
    <PageHeader eyebrow="SERVICE PLANNING" title="Services" description="Plan services locally and bring in existing plans from Planning Center." action={<button className="button button-dark" onClick={() => setShowForm(v => !v)}><Plus size={15}/> New service</button>}/>
    <div className="integration-strip">
      <div><span className={`integration-dot ${pco?.connected ? "online" : ""}`}/><div><strong>Planning Center</strong><small>{pco?.message ?? "Checking connection…"}</small></div></div>
      {role === "admin" && <button className="button button-secondary" onClick={() => void sync()} disabled={busy || !pco?.connected}><RefreshCw size={14}/> Sync services</button>}
    </div>
    {showForm && <form className="panel church-form" onSubmit={submit}><h2>Create service</h2><label>Title<input name="title" required maxLength={160}/></label><label>Starts<input name="startsAt" type="datetime-local"/></label><label>Ends<input name="endsAt" type="datetime-local"/></label><label>Location<input name="location"/></label><button className="button button-dark" disabled={busy}>Save service</button></form>}
    <Notice error={error} success={success}/>
    {loading ? <Loading/> : <div className="church-list">{services.map(s => <div key={s.id}>
      <article className="panel church-row"><div className="church-row-icon"><CalendarDays/></div><div className="church-row-main"><strong>{s.title}</strong><span>{dateLabel(s.startsAt)}{s.location ? ` · ${s.location}` : ""}</span></div><span className="source-pill">{s.itemCount ?? 0} items</span><span className={`source-pill ${s.source === "planning_center" ? "source-external" : ""}`}>{s.source === "planning_center" ? "Planning Center" : "Local"}</span>{(s.itemCount ?? 0) > 0 && <button className="button button-secondary" onClick={() => void toggleServiceItems(s.id)} disabled={busy}>{expandedServiceId === s.id ? "Hide order" : "View order"}</button>}</article>
      {expandedServiceId === s.id && <div className="panel service-order">{(serviceItems[s.id] ?? []).map((item, index) => <div className="service-order-item" key={item.id}><span className="service-order-number">{item.position > 0 ? item.position : index + 1}</span><div><strong>{item.title}</strong><small>{item.itemType}{item.notes ? ` · ${item.notes}` : ""}</small></div></div>)}{!serviceItems[s.id]?.length && <Empty text="No order items found for this service."/>}</div>}
    </div>)}{!services.length && <Empty text="No services yet. Create one or sync Planning Center."/>}</div>}
  </div>;

  if (page === "staff") return <div>
    <PageHeader eyebrow="PEOPLE & ACCESS" title="Staff" description="Internal accounts for church staff, team leaders and production operators." action={role === "admin" ? <button className="button button-dark" onClick={() => setShowForm(v => !v)}><Plus size={15}/> Add staff</button> : undefined}/>
    {showForm && role === "admin" && <form className="panel church-form" onSubmit={submit}><h2>Create staff account</h2><div className="church-form-grid"><label>Display name<input name="displayName" required/></label><label>Username<input name="username" required minLength={3} maxLength={32}/></label><label>Temporary password<input name="password" type="password" required minLength={12}/></label><label>Role<select name="role"><option value="staff">Staff</option><option value="production">Production</option><option value="leader">Team leader</option><option value="admin">Administrator</option></select></label><label>Department<input name="department" placeholder="e.g. Media"/></label></div><p className="form-hint">Passwords must be at least 12 characters. Share initial credentials securely.</p><button className="button button-dark" disabled={busy}>Create account</button></form>}
    <Notice error={error} success={success}/>
    {loading ? <Loading/> : <div className="church-list">{staff.map(person => <article className="panel church-row" key={person.id}><div className="church-row-icon"><Users/></div><div className="church-row-main"><strong>{person.displayName || person.username}</strong><span>@{person.username}{person.department ? ` · ${person.department}` : ""}</span></div><span className="source-pill">{person.role}</span><span className={`source-pill ${person.active ? "source-active" : "source-inactive"}`}>{person.active ? "Active" : "Disabled"}</span></article>)}{!staff.length && <Empty text="No staff accounts found."/>}</div>}
  </div>;

  if (page === "events") return <div>
    <PageHeader eyebrow="CHURCH CALENDAR" title="Events" description="Internal events, conferences, camps and church activities." action={<button className="button button-dark" onClick={() => setShowForm(v => !v)}><Plus size={15}/> New event</button>}/>
    {showForm && <form className="panel church-form" onSubmit={submit}><h2>Create event</h2><label>Title<input name="title" required/></label><label>Description<textarea name="description" rows={3}/></label><label>Starts<input name="startsAt" type="datetime-local"/></label><label>Ends<input name="endsAt" type="datetime-local"/></label><label>Location<input name="location"/></label><label>Capacity<input name="capacity" type="number" min="1"/></label><button className="button button-dark" disabled={busy}>Save event</button></form>}
    <Notice error={error} success={success}/>
    {loading ? <Loading/> : <div className="church-list">{events.map(e => <article className="panel church-row" key={e.id}><div className="church-row-icon"><CalendarDays/></div><div className="church-row-main"><strong>{e.title}</strong><span>{dateLabel(e.startsAt)}{e.location ? ` · ${e.location}` : ""}</span></div><span className="source-pill">{e.status}</span></article>)}{!events.length && <Empty text="No events have been added yet."/>}</div>}
  </div>;

  if (page === "groups") return <div>
    <PageHeader eyebrow="COMMUNITY" title="Groups" description="Manage small groups, study groups and their meeting details." action={<button className="button button-dark" onClick={() => setShowForm(v => !v)}><Plus size={15}/> New group</button>}/>
    {showForm && <form className="panel church-form" onSubmit={submit}><h2>Create group</h2><label>Group name<input name="name" required/></label><label>Description<textarea name="description" rows={2}/></label><label>Leader<input name="leader"/></label><label>Meeting day<input name="meetingDay" placeholder="e.g. Wednesday"/></label><label>Meeting time<input name="meetingTime" type="time"/></label><label>Location<input name="location"/></label><button className="button button-dark" disabled={busy}>Save group</button></form>}
    <Notice error={error} success={success}/>
    {loading ? <Loading/> : <div className="church-list">{groups.map(g => <article className="panel church-row" key={g.id}><div className="church-row-icon"><UsersRound/></div><div className="church-row-main"><strong>{g.name}</strong><span>{[g.leader, g.meetingDay, g.meetingTime, g.location].filter(Boolean).join(" · ") || "Meeting details not set"}</span></div><span className="source-pill">{g.memberCount} members</span></article>)}{!groups.length && <Empty text="No groups have been created yet."/>}</div>}
  </div>;

  return <div>
    <PageHeader eyebrow="LIVE PRODUCTION" title="ProPresenter" description="Monitor the active presentation from the local church operations dashboard." action={<button className="button button-secondary" onClick={() => void refreshLive()} disabled={busy}><RefreshCw size={14}/> Refresh status</button>}/>
    <Notice error={error} success={success}/>
    {loading ? <Loading/> : <div className="production-grid">
      <section className="panel production-status"><div className="production-status-icon"><RadioTower size={22}/></div><div><span className={`integration-dot ${propresenter?.connected ? "online" : ""}`}/><strong>{propresenter?.connected ? "Connected" : propresenter?.configured === false ? "Not configured" : "Disconnected"}</strong><p>{propresenter?.message ?? (propresenter?.connected ? "ProPresenter API is responding." : "Configure PROPRESENTER_URL on the local server.")}</p></div></section>
      {(role === "admin" || role === "production") && <section className="panel production-controls">
        <div className="panel-heading"><div><h2>Live controls</h2><p>Commands are sent to the active ProPresenter presentation.</p></div></div>
        <div className="production-control-actions">
          <button className="button button-secondary" disabled={!propresenter?.connected || busy} onClick={() => void runProductionAction("previous")}>Previous cue</button>
          <button className="button button-dark" disabled={!propresenter?.connected || busy} onClick={() => void runProductionAction("next")}>Next cue</button>
          <button className="button button-secondary" disabled={!propresenter?.connected || busy} onClick={() => { if (window.confirm("Clear the current slide layer in ProPresenter?")) void runProductionAction("clear_slide"); }}>Clear slide</button>
        </div>
        <p className="form-hint">Only administrators and production staff can use these controls. Clear slide affects the slide layer only.</p>
      </section>}
      <section className="panel"><div className="panel-heading"><div><h2>Active presentation</h2><p>Live data from ProPresenter</p></div><Activity size={18}/></div><strong>{presentationName || (propresenter?.presentation ? "Presentation active" : "No active presentation")}</strong></section>
      <section className="panel"><div className="panel-heading"><div><h2>Live slide status</h2><p>Current and upcoming slide text</p></div><ShieldCheck size={18}/></div>
        <p className="form-hint">Current slide index: {propresenter?.slideIndex == null ? "—" : String(propresenter.slideIndex)}</p>
        <div className="service-order-item"><div><strong>On screen</strong><pre className="live-json">{slidePayload?.current?.text || "No current slide text."}</pre>{slidePayload?.current?.notes && <small>Notes: {slidePayload.current.notes}</small>}</div></div>
        <div className="service-order-item"><div><strong>Up next</strong><pre className="live-json">{slidePayload?.next?.text || "No next slide text."}</pre>{slidePayload?.next?.notes && <small>Notes: {slidePayload.next.notes}</small>}</div></div>
      </section>
    </div>}
  </div>;
}

function Loading() { return <div className="church-loading"><LoaderCircle className="auth-spinner" size={20}/> Loading…</div>; }
function Empty({ text }: { text: string }) { return <div className="church-empty"><CircleAlert size={18}/>{text}</div>; }
