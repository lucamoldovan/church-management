# ProPresenter and Planning Center integration setup

## ProPresenter: enable the local API

The Church Operations connector talks directly to the ProPresenter computer over the church LAN. It does not use a cloud service or a browser-to-ProPresenter connection.

1. Open ProPresenter on the production computer.
2. Open **ProPresenter → Settings → Network**.
3. Enable the Network/API listener.
4. Record the exact IP address and port displayed by ProPresenter. The port can differ between installations; Renewed Vision's example uses 1025, but do not assume that value.
5. On that same Network settings page, open **API Documentation**. This is the documentation generated for the installed ProPresenter version and is the final authority for that installation.
6. Keep the ProPresenter computer on the same trusted wired LAN as the Church Operations server.
7. Configure the ProPresenter computer's firewall to allow the API TCP port only from the Church Operations server's reserved IP address.

Official references:
- API reference: https://openapi.propresenter.com/
- Renewed Vision network setup: https://support.renewedvision.com/hc/en-us/articles/6024791423763-Connecting-to-ProPresenter-Control
- API TCP/IP documentation: https://support.renewedvision.com/hc/en-us/articles/31606866768147-TCP-IP-Connections-with-ProPresenter-API

## Configure Church Operations

On the server, set the ProPresenter base URL in the private root `.env` file:

```dotenv
PROPRESENTER_URL=http://192.168.1.50:1025
```

Replace both address and port with the exact values from ProPresenter Settings → Network. Do not add an endpoint path or trailing slash. Restart the server:

```bash
sudo systemctl restart church-operations
sudo journalctl -u church-operations -n 50 --no-pager
```

Open **ProPresenter** in the Church Operations dashboard. The current integration checks:

- `GET /version` — ProPresenter version and instance information.
- `GET /v1/presentation/active` — active presentation.
- `GET /v1/status/slide` — current/next slide text and image UUIDs.
- `GET /v1/presentation/slide_index` — current slide index.

The dashboard polls live status every five seconds and now exposes an allowlisted control panel for administrators and production staff: Previous cue, Next cue, and Clear slide. The server calls the documented ProPresenter HTTP API endpoints from the LAN. Clear slide affects only the slide layer. These commands are intentionally narrow; arbitrary URL or shell commands are not accepted.

## Planning Center Services: single-church authentication

For this one-church deployment, use a Planning Center Personal Access Token (PAT), not OAuth. Planning Center's official docs state that PATs are intended for scripts and servers controlled by the same organization and must be sent using HTTP Basic Authentication. PAT credentials must never be placed in browser code.

1. Sign in to the Planning Center account for the church.
2. Open the developer account at https://api.planningcenteronline.com/.
3. Create a Personal Access Token for a user who has permission to view the relevant Services plans.
4. Copy the generated client ID and secret.
5. Put them only in the server's private `.env` file:

```dotenv
PLANNING_CENTER_APP_ID=your_client_id
PLANNING_CENTER_SECRET=your_secret
```

6. Restart Church Operations.
7. Open **Services** in the dashboard. The Planning Center status indicator should report that the Services API is reachable.
8. As an administrator, select **Sync services**. Confirm the imported plans and service-order items appear in the local Services list.

The current importer reads future Service Types, plans and their ordered items. It is a one-way import into the local SQLite database. It does not sync Planning Center People, Groups, Check-Ins, Giving, volunteer assignments or attendance. It also does not write changes back to Planning Center.

### Optional: ProPresenter's own Planning Center integration

This is separate from the Church Operations server connector. If you want ProPresenter itself to import and use Planning Center service plans, open **ProPresenter → Settings → Integrations → Planning Center**, sign in, select the church organization if prompted, and approve access. Renewed Vision recommends an account with Editor or Administrator privileges on the Planning Center plan; this feature also requires an active Planning Center Services subscription. The server-side PAT does not sign ProPresenter in.

Official references:
- Getting started: https://api.planningcenteronline.com/docs/overview/getting-started
- Authentication: https://api.planningcenteronline.com/docs/overview/authentication
- Services API reference: https://api.planningcenteronline.com/docs/apps/services

## Troubleshooting

- **ProPresenter disconnected:** confirm the Network listener is enabled, IP/port are correct, the server can reach that TCP port, and the ProPresenter computer firewall permits the server IP.
- **ProPresenter responds but no active slide:** this is valid when no presentation is active; inspect the API Documentation for the installed version.
- **Planning Center 401/403:** confirm the client ID/secret pair, the token owner, and that the owner has Services permission.
- **Planning Center status is connected but sync imports nothing:** confirm there are future plans in the Service Types the token owner can access.
- **Do not paste PATs or ProPresenter passwords into the dashboard or repository.**
