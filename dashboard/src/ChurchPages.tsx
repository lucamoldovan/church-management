import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Activity, CalendarDays, CircleAlert, LoaderCircle, Plus, RefreshCw, Users, UsersRound, RadioTower, ShieldCheck } from "lucide-react";
import {
  createChurchEvent, createChurchGroup, createChurchStaff,
  getChurchEvents, getChurchGroups, getChurchServices, getChurchStaff,
  getPlanningCenterStatus, getProPresenterLive, getChurchServiceWorkspace, getChurchTeams, getChurchPeople,
  sendProPresenterCommand, syncPlanningCenter,
  type ChurchEvent, type ChurchGroup, type ChurchService, type ChurchStaff,
  type ChurchServiceWorkspace, type ChurchTeamDirectory, type ChurchPerson, type ProPresenterLive,
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
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [workspace, setWorkspace] = useState<ChurchServiceWorkspace | null>(null);
  const [teamDirectory, setTeamDirectory] = useState<ChurchTeamDirectory[]>([]);
  const [serviceView, setServiceView] = useState<"rundown" | "teams">("rundown");
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
        const planningCenterPlans = result.services.filter((service) => service.source === "planning_center");
        setServices(planningCenterPlans); setPco(status);
        if (!selectedServiceId && planningCenterPlans[0]) setSelectedServiceId(planningCenterPlans[0].id);
        if (selectedServiceId && !planningCenterPlans.some((service) => service.id === selectedServiceId)) {
          setSelectedServiceId(planningCenterPlans[0]?.id ?? "");
          setWorkspace(null);
        }
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

  useEffect(() => {
    if (page !== "services" || !selectedServiceId) {
      setWorkspace(null);
      return;
    }
    let active = true;
    const loadWorkspace = async () => {
      try {
        const [data, live] = await Promise.all([
          getChurchServiceWorkspace(selectedServiceId),
          getProPresenterLive(selectedServiceId),
        ]);
        if (!active) return;
        setWorkspace(data);
        setPropresenter(live);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Could not load the service workspace.");
      }
    };
    void loadWorkspace();
    const timer = window.setInterval(() => void loadWorkspace(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [page, selectedServiceId]);

  useEffect(() => {
    if (page !== "services" || serviceView !== "teams") return;
    let active = true;
    void getChurchTeams().then((result) => { if (active) setTeamDirectory(result.teams); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "Could not load Planning Center teams."); });
    return () => { active = false; };
  }, [page, serviceView]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const value = (key: string) => {
      const raw = String(data.get(key) ?? "");
      return key === "password" ? raw : raw.trim();
    };
    setBusy(true); setError(""); setSuccess("");
    try {
      if (page === "events") {
        await createChurchEvent({ title: value("title"), description: value("description"), startsAt: localIso(value("startsAt")), endsAt: localIso(value("endsAt")), location: value("location"), capacity: value("capacity") ? Number(value("capacity")) : undefined });
        setSuccess("Event created.");
      } else if (page === "groups") {
        await createChurchGroup({ name: value("name"), description: value("description"), leader: value("leader"), meetingDay: value("meetingDay"), meetingTime: value("meetingTime"), location: value("location") });
        setSuccess("Group created.");
      } else if (page === "staff") {
        await createChurchStaff({ username: value("username"), displayName: value("displayName"), password: value("password"), role: value("role"), department: value("department") });
        setSuccess("Staff account created.");
      }
      form.reset(); setShowForm(false); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save this record."); }
    finally { setBusy(false); }
  };

  const sync = async () => {
    setBusy(true); setError(""); setSuccess("");
    try {
      const result = await syncPlanningCenter();
      setSuccess(`Synced ${result.imported} plans, ${result.itemsImported} rundown items, ${result.peopleImported} people, ${result.teamsImported} teams, ${result.positionsImported} positions, ${result.scheduledAssignmentsImported} scheduled roles and ${result.itemAssignmentsImported} item assignments.`);
      setWorkspace(null);
      await refresh();
      if (serviceView === "teams") setTeamDirectory((await getChurchTeams()).teams);
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

  if (page === "services") {
    const currentItemId = propresenter?.rundownMatch?.status === "matched" ? propresenter.rundownMatch.itemId : null;
    const currentIndex = workspace?.items.findIndex((item) => item.id === currentItemId) ?? -1;
    const planAssignmentsForTeam = (teamId: string) => workspace?.assignments.filter((assignment) => assignment.teamId === teamId) ?? [];
    return <div>
      <PageHeader eyebrow="SERVICE PLANNING" title="Services" description="A read-only Planning Center workspace for the rundown, teams and scheduled people." action={role === "admin" ? <button className="button button-dark" onClick={() => void sync()} disabled={busy || !pco?.connected}><RefreshCw size={14}/> Sync Planning Center</button> : undefined}/>
      <div className="integration-strip">
        <div><span className={`integration-dot ${pco?.connected ? "online" : ""}`}/><div><strong>Planning Center Services</strong><small>{pco?.message ?? "Checking connection…"}</small></div></div>
        <small>Planning Center is the source of truth · Read-only sync</small>
      </div>
      <Notice error={error} success={success}/>
      {loading ? <Loading/> : <>
        <section className="panel service-selector">
          <label htmlFor="service-plan-select">Selected service plan</label>
          <select id="service-plan-select" value={selectedServiceId} onChange={(event) => { setSelectedServiceId(event.target.value); setWorkspace(null); setPropresenter(null); }}>
            {services.map((service) => <option value={service.id} key={service.id}>{service.title}{service.serviceTypeName ? ` · ${service.serviceTypeName}` : ""} · {dateLabel(service.startsAt)}</option>)}
          </select>
          {!services.length && <Empty text="No Planning Center service plans yet. Sync Planning Center to load the schedule."/>}
        </section>
        {workspace && <>
          <section className="panel service-live-banner">
            <div className="service-live-heading">
              <span className={`integration-dot ${propresenter?.connected ? "online" : ""}`}/>
              <div><strong>{propresenter?.connected ? "ProPresenter connected" : "ProPresenter disconnected"}</strong><small>{propresenter?.presentationName || "No active presentation detected"}</small></div>
              <span className={`source-pill ${propresenter?.rundownMatch?.status === "matched" ? "source-active" : ""}`}>{propresenter?.rundownMatch?.status === "matched" ? "Live item matched" : propresenter?.rundownMatch?.status === "ambiguous" ? "Ambiguous match" : propresenter?.rundownMatch?.status === "unmatched" ? "No rundown match" : "No live signal"}</span>
            </div>
            <p>{propresenter?.rundownMatch?.message ?? "Live matching is waiting for ProPresenter status."}</p>
            {propresenter?.checkedAt && <small>Last checked {new Date(propresenter.checkedAt).toLocaleTimeString()}</small>}
          </section>
          <div className="service-view-tabs" role="tablist" aria-label="Service views">
            <button className={serviceView === "rundown" ? "service-view-tab active" : "service-view-tab"} onClick={() => setServiceView("rundown")} role="tab" aria-selected={serviceView === "rundown"}>Service rundown</button>
            <button className={serviceView === "teams" ? "service-view-tab active" : "service-view-tab"} onClick={() => setServiceView("teams")} role="tab" aria-selected={serviceView === "teams"}>Teams directory</button>
          </div>
          {serviceView === "rundown" ? <>
            <section className="service-workspace-grid">
              <div className="panel service-rundown-panel">
                <div className="panel-heading"><div><h2>Service rundown</h2><p>{workspace.items.length} ordered items · refreshed every 5 seconds</p></div><CalendarDays size={18}/></div>
                {workspace.items.map((item, index) => {
                  const isCurrent = item.id === currentItemId;
                  return <article key={item.id} className={`service-rundown-item ${isCurrent ? "is-current" : ""}`}>
                    <span className="service-rundown-number">{String(index + 1).padStart(2, "0")}</span>
                    <div className="service-rundown-copy">
                      <div className="service-rundown-title">{isCurrent && <span className="live-now-pill"><span/> NOW</span>}<strong>{item.title}</strong></div>
                      <small>{item.itemType}{item.durationSeconds ? ` · ${Math.round(item.durationSeconds / 60)} min` : ""}{item.servicePosition ? ` · ${item.servicePosition}` : ""}</small>
                      {item.notes && <p>{item.notes}</p>}
                      {!!item.assignments?.length && <div className="item-assignment-list">Assigned: {item.assignments.map((assignment) => assignment.displayName).filter(Boolean).join(", ")}</div>}
                    </div>
                    {isCurrent && <span className="current-indicator"><Activity size={15}/></span>}
                  </article>;
                })}
                {!workspace.items.length && <Empty text="This service has no rundown items."/>}
                {currentIndex >= 0 && <p className="service-live-foot">Live position: item {currentIndex + 1} of {workspace.items.length}</p>}
              </div>
              <div className="service-team-column">
                <section className="panel service-teams-panel">
                  <div className="panel-heading"><div><h2>Teams serving</h2><p>People scheduled for this specific service</p></div><UsersRound size={18}/></div>
                  {workspace.teams.map((team) => {
                    const people = planAssignmentsForTeam(team.id);
                    return <div className="service-team-block" key={team.id}>
                      <div className="service-team-heading"><div><strong>{team.name}</strong>{!!team.leaders?.length && <small className="service-team-leaders">Lead: {team.leaders.join(", ")}</small>}</div><span>{people.length} scheduled</span></div>
                      {people.map((person) => <div className="service-person-row" key={person.id}>
                        <div><strong>{person.personName}</strong><small>{person.positionName || "Team member"}{person.serviceTimes ? ` · ${person.serviceTimes}` : ""}</small></div>
                        {person.status && <span className={`source-pill ${person.status.toLowerCase().includes("confirm") ? "source-active" : ""}`}>{person.status}</span>}
                      </div>)}
                      {!people.length && <small className="service-team-empty">No people scheduled on this team.</small>}
                    </div>;
                  })}
                  {!workspace.teams.length && <Empty text="No teams are assigned to this service plan."/>}
                  {workspace.assignments.some((assignment) => !assignment.teamId) && <div className="service-team-block"><div className="service-team-heading"><strong>Unassigned / guest</strong></div>{workspace.assignments.filter((assignment) => !assignment.teamId).map((person) => <div className="service-person-row" key={person.id}><div><strong>{person.personName}</strong><small>{person.positionName || "No team position"}</small></div></div>)}</div>}
                </section>
                <section className="panel service-times-panel">
                  <div className="panel-heading"><div><h2>Service times</h2><p>Times and schedule blocks from Planning Center</p></div><CalendarDays size={18}/></div>
                  {workspace.times.map((time) => <div className="service-time-row" key={time.id}><strong>{time.name}</strong><small>{dateLabel(time.startsAt)}{time.timeType ? ` · ${time.timeType}` : ""}</small></div>)}
                  {!workspace.times.length && <Empty text="No service times were returned for this plan."/>}
                </section>
              </div>
            </section>
          </> : <section className="panel service-directory-panel">
            <div className="panel-heading"><div><h2>Planning Center teams</h2><p>Team directory with positions and assigned members</p></div><UsersRound size={18}/></div>
            {teamDirectory.map((team) => <div className="service-directory-team" key={team.id}>
              <div className="service-team-heading"><div><strong>{team.name}</strong>{!!team.leaders?.length && <small className="service-team-leaders">Lead: {team.leaders.join(", ")}</small>}</div><span>{team.positions.reduce((count, position) => count + position.members.length, 0)} members</span></div>
              <div className="service-position-grid">{team.positions.map((position) => <div className="service-position-card" key={position.id}>
                <strong>{position.name}</strong><small>{position.members.length} members</small>
                {position.members.map((member) => <span key={member.id}>{member.personName}{member.schedulePreference ? ` · ${member.schedulePreference}` : ""}</span>)}
                {!position.members.length && <span className="service-team-empty">No assigned members</span>}
              </div>)}</div>
              {!team.positions.length && <Empty text="No positions imported for this team."/>}
            </div>)}
            {!teamDirectory.length && <Empty text="No teams imported yet. Run a Planning Center sync."/>}
          </section>}
        </>}
      </>}
    </div>;
  }

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
    <PageHeader eyebrow="LIVE PRODUCTION" title="ProPresenter" description="Monitor the active presentation from Kasapini Dashboard." action={<button className="button button-secondary" onClick={() => void refreshLive()} disabled={busy}><RefreshCw size={14}/> Refresh status</button>}/>
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

export function PeoplePage() {
  const [people, setPeople] = useState<ChurchPerson[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getChurchPeople().then((result) => {
      if (active) setPeople(result.people);
    }).catch((e) => {
      if (active) setError(e instanceof Error ? e.message : "Could not load people.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredPeople = people.filter((person) =>
    person.displayName.toLocaleLowerCase().includes(normalizedQuery) ||
    person.teams.some((team) => team.toLocaleLowerCase().includes(normalizedQuery))
  );

  return <div>
    <PageHeader eyebrow="CHURCH DIRECTORY" title="People" description="People imported from Planning Center, with the teams they serve on. Planning Center remains the source of truth." />
    <div className="integration-strip">
      <div><span className="integration-dot online"/><div><strong>Planning Center People</strong><small>Names and team memberships only · No contact details stored</small></div></div>
      <strong>{people.length} people</strong>
    </div>
    <section className="panel service-directory-panel">
      <div className="panel-heading">
        <div><h2>People directory</h2><p>Local read-only copy of the Planning Center directory</p></div>
        <Users size={18}/>
      </div>
      <label className="people-search">Search people or teams<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or team…" /></label>
      {error && <Notice error={error} success=""/>}
      {loading ? <div className="loading-state"><LoaderCircle className="spin" size={20}/> Loading people…</div> :
        filteredPeople.map((person) => <div className="service-person-row" key={person.id}>
          <div><strong>{person.displayName}</strong><small>{person.teams.length ? person.teams.join(" · ") : "No team membership recorded"}</small></div>
          <span className="source-pill">{person.teams.length} {person.teams.length === 1 ? "team" : "teams"}</span>
        </div>)}
      {!loading && !error && filteredPeople.length === 0 && <Empty text={people.length ? "No people match this search." : "No people imported yet. Run Sync Planning Center from Services."}/>}
    </section>
  </div>;
}
