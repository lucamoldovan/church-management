# Services — Planning Center mirror and live rundown

## Verified Planning Center API surface

The official Services API documents the following read endpoints needed for the first implementation:

- Plans and their ordered items: service type → plans → plan items.
- Scheduled people on a particular plan: `GET /services/v2/service_types/{service_type_id}/plans/{plan_id}/team_members` (PlanPerson resources).
- Service times: `GET /services/v2/service_types/{service_type_id}/plans/{plan_id}/plan_times`.
- Teams assigned to a plan: `GET /services/v2/service_types/{service_type_id}/plans/{plan_id}/signup_teams`.
- Team directory and positions: `GET /services/v2/teams` and `GET /services/v2/teams/{team_id}/team_positions`.
- Person profile and plan/team associations: Services People and PlanPerson resources.
- Item-specific assignments: `GET /services/v2/service_types/{service_type_id}/plans/{plan_id}/items/{item_id}/item_assignments`.

PlanPerson resources expose the scheduled person, team, status, notes and team-position name, with related endpoints for plan times and team. ItemAssignment can identify a Person or TeamPosition assigned to a specific rundown item. The importer should use these relationships rather than trying to infer teams from a person's global profile.

API responses use JSON:API relationships and pagination. The implementation must follow next-page links and should use include relationships only where the endpoint supports them.

Official references:
- [Planning Center JSON:API format and includes](https://api.planningcenteronline.com/docs/overview/json-api)
- [Plan API](https://api.planningcenteronline.com/docs/apps/services/versions/2018-11-01/vertices/plan)
- [PlanPerson API](https://api.planningcenteronline.com/docs/apps/services/versions/2018-11-01/vertices/plan_person)
- [Team API](https://api.planningcenteronline.com/docs/apps/services/versions/2018-11-01/vertices/team)
- [PlanTime API](https://api.planningcenteronline.com/docs/apps/services/versions/2018-11-01/vertices/plan_time)
- [ItemAssignment API](https://api.planningcenteronline.com/docs/apps/services/versions/2018-11-01/vertices/item_assignment)

## Goal

Build a staff-facing Services workspace that mirrors the useful operational parts of Planning Center Services while keeping Church Operations self-hosted and keeping Planning Center as the read-only source of truth during this integration phase.

The local data model must remain provider-independent. Store Planning Center identifiers as external IDs and normalize people, teams, positions, service plans, plan items, and scheduled assignments locally. This allows a future migration to native Church Operations planning without redesigning the dashboard.

## Current implementation (baseline on local-operations-platform)

- The server authenticates to Planning Center Services using a server-side Personal Access Token (HTTP Basic Auth).
- The connection status endpoint checks the Services API.
- Manual sync imports at most 25 future plans across service types.
- For each imported plan, it imports ordered plan items, including title, item type, sequence/position, and description/notes.
- The dashboard lists services and allows staff to expand a plan to see its order.
- The existing ProPresenter endpoint fetches the active presentation, current/next slide status, and slide index.
- The ProPresenter dashboard currently polls every five seconds, but the Services page does not yet poll live status or highlight a matching rundown item.

Not currently imported: Planning Center Services people, teams, team membership, positions, team leaders, plan-specific scheduled people/assignments, plan times, song relationships/arrangements, and detailed item metadata/attachments.

## Intended Services workspace

### 1. Service selector and overview

- Upcoming service plans grouped by date/service type.
- Search/filter by date and service type.
- Plan metadata: service type, title, date, service times, location, notes, and source/sync timestamp.
- Clear Planning Center connection and last-sync state.
- Read-only Planning Center data in this phase; no accidental writes back to Planning Center.

### 2. Service rundown

- Ordered list of all plan items.
- Item type/category, planned duration, notes, song/media metadata, and relevant attachments where the API exposes them.
- Visually distinct current item, previous item, and next item.
- Current item indicator sourced from ProPresenter live state.
- Unknown/unmatched ProPresenter content must show as "Live item not matched" rather than highlighting the wrong row.
- Song matching should prefer stable Planning Center song IDs/relationships when available; fallback title matching must be normalized and conservative.
- Show the ProPresenter presentation name and current slide text as diagnostic context, without treating arbitrary lyric text as a definitive song match.

### 3. Scheduled teams and people

For the selected service plan, show the teams actually scheduled on that plan, not merely the church-wide team directory.

- One section/card per scheduled team, in Planning Center order where available.
- Each team shows its scheduled people grouped by position/role.
- Show person display name and scheduled position; include response/confirmation status if returned by the API.
- Show team leader(s) and plan-specific time assignment where available.
- Preserve people scheduled as guests or outside a normal team/position, instead of dropping them.
- A separate organization/team directory can be added later; it is not a substitute for plan-specific scheduling.

### 4. Live state

- ProPresenter is polled server-side or through the authenticated local API at a controlled interval (initial target: 3–5 seconds).
- Match active ProPresenter presentation to a Planning Center plan item using stable IDs/relationships where possible and conservative normalized names otherwise.
- When a match is found, the same item is highlighted for every staff member viewing the selected plan.
- Keep the live state separate from the imported plan snapshot. A live cue must never mutate or reorder the planned rundown.
- Show connection freshness and last successful ProPresenter poll; stale/disconnected status clears the live highlight after a defined timeout and displays a clear warning.

## Data model direction

Keep normalized local entities with provider-independent primary keys and nullable Planning Center external IDs:

- service_people
- service_teams
- service_positions
- service_team_memberships
- service_plans (or extend existing church_services)
- service_plan_times
- service_plan_items (or extend existing church_service_items)
- service_plan_assignments (person + team + position + service time + response status)
- service_live_state (plan/item match, ProPresenter presentation/slide metadata, observed timestamp)

Do not overload the existing internal operators/church_staff table with Planning Center volunteers. A volunteer does not need a Church Operations login to appear in the schedule.

Use database migrations, foreign keys, unique external-ID constraints, and transactional per-plan sync so a failed import does not leave a half-replaced team/rundown snapshot. Paginate every Planning Center collection; do not silently assume the first 100 records are complete.

## Implementation phases

1. API contract audit: inspect the official Services API schema and confirm endpoints/relationships for plan items, plan people, scheduled team members, teams, positions, and service times. Record scopes/permissions and pagination behavior.
2. Local schema and importer: add normalized tables and idempotent transactional sync for plans, ordered items, teams, people, positions, and plan-specific assignments.
3. Services UI: replace the current expandable list with a plan workspace containing rundown and team schedule views.
4. Live matching: poll ProPresenter state, match the active song/item, and broadcast the current item state to all connected dashboard clients through the local server.
5. Validation: fixture tests for pagination, missing relationships, guests, multiple services/times, duplicate people, reordered/deleted items, unmatched slides, stale ProPresenter state, and real account verification with the church's Planning Center and ProPresenter instances.

## Acceptance criteria

- A selected plan shows every imported rundown item in the correct order.
- Every person scheduled to that plan is visible under the correct team and position, including guests/unassigned people where returned.
- Sync is repeatable and does not duplicate records.
- A ProPresenter cue matching a song highlights exactly one corresponding plan item; ambiguous or absent matches do not guess.
- All clients viewing the same plan see the same live highlight and a clear connection/staleness indicator.
- The feature works with the local server and local database; no Cloudflare, Supabase, or hosted realtime dependency is introduced.


## Implementation status on services-live-rundown

The first implementation is now present on the feature branch:

- Schema version 8 adds provider-independent people, teams, positions, team-position memberships, plan-team links, plan times, plan-person assignments, item assignments, and per-plan live state.
- The Planning Center importer follows JSON:API pagination (with a 100-page safety limit per collection), imports future plans across service types, imports service-type teams and positions, imports people assigned to positions, team leaders, and imports plan-specific scheduled people, times, and item-level Person/TeamPosition assignments.
- Plan replacement is performed transactionally after the API snapshot has been fetched. Existing service items and their item assignments are replaced together so deleted items do not leave stale assignment rows.
- The authenticated Services workspace endpoint returns the selected plan, ordered items, assigned teams, scheduled people/positions/normalized response statuses, team leaders, plan times, item assignments, and saved live state.
- The authenticated team directory endpoint returns teams with leaders, positions, assigned members, and their schedule preferences.
- The Services dashboard has a plan selector, live rundown, scheduled-team roster, service-time panel, and separate team-directory view. Only Planning Center service plans are exposed; local service creation and schedule editing are intentionally unavailable.
- The ProPresenter live endpoint can accept a selected service ID. It matches only an exact normalized active presentation name or exact normalized current-slide title against a song item. It never uses substring lyric matching. One unique match is highlighted; duplicate matches are reported as ambiguous and do not highlight any row. Unmatched and disconnected states are explicit.
- The dashboard polls the selected service workspace and ProPresenter state every five seconds. This is shared server-backed state observed by each staff dashboard; it is polling, not a WebSocket push channel.

## Verification notes and limitations

Automated tests cover service/team/position/person import, plan-specific assignments and service times, item-level Person and TeamPosition assignments, workspace and team-directory responses, exact ProPresenter matching, and ambiguous duplicate-song matching. The draft pull request runs the repository's build and API test workflow.

A real Planning Center account is still needed to confirm the church's exact API permission set and actual response payloads. A real ProPresenter service is needed to confirm whether the active presentation name corresponds to each song presentation in the church's playlist. If the church uses one combined presentation for the whole service, an explicit ProPresenter-to-Planning-Center cue mapping will be needed; this implementation deliberately does not guess from lyric fragments.

The importer is read-only with respect to Planning Center. Planning Center remains the source of truth for imported plans, teams, people, and assignments.
