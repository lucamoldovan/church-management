"""Phase 5 — auto-publishing integrations: Google Calendar + Facebook Page.

All endpoints degrade gracefully when credentials are not configured, so the
platform keeps working before keys are supplied. Future channels (Instagram,
WhatsApp, Email, Push) plug into the same `publish_event` dispatcher.
"""
import os
from datetime import datetime, timezone, timedelta
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest
from googleapiclient.discovery import build

SUPABASE_URL = os.environ["SUPABASE_URL"]
SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET")
GOOGLE_CALENDAR_ID = os.environ.get("GOOGLE_CALENDAR_ID", "primary")
FB_PAGE_ID = os.environ.get("FB_PAGE_ID")
FB_PAGE_ACCESS_TOKEN = os.environ.get("FB_PAGE_ACCESS_TOKEN")
TIMEZONE = os.environ.get("EVENT_TIMEZONE", "Europe/Bucharest")
GOOGLE_SCOPES = ["https://www.googleapis.com/auth/calendar"]

SB_HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}

router = APIRouter(prefix="/api")


async def sb(method: str, path: str, json=None, prefer: str | None = None):
    headers = dict(SB_HEADERS)
    if prefer:
        headers["Prefer"] = prefer
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.request(method, f"{SUPABASE_URL}/rest/v1/{path}", headers=headers, json=json)
        r.raise_for_status()
        return r.json() if r.text else None


def _redirect_uri(request: Request) -> str:
    base = str(request.base_url)
    return f"{base}api/oauth/calendar/callback"


# ---------------------------------------------------------------- status
@router.get("/integrations/status")
async def integrations_status():
    google_connected = False
    if GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET:
        rows = await sb("GET", "integration_tokens?provider=eq.google_calendar&select=tokens")
        google_connected = bool(rows and rows[0].get("tokens", {}).get("refresh_token"))
    return {
        "google": {
            "configured": bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET),
            "connected": google_connected,
            "calendar_id": GOOGLE_CALENDAR_ID,
        },
        "facebook": {
            "configured": bool(FB_PAGE_ID and FB_PAGE_ACCESS_TOKEN),
            "page_id": FB_PAGE_ID,
        },
    }


# ---------------------------------------------------------- google oauth
@router.get("/integrations/google/connect")
async def google_connect(request: Request):
    if not (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET):
        return {"error": "Google credentials not configured."}
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": _redirect_uri(request),
        "response_type": "code",
        "scope": " ".join(GOOGLE_SCOPES),
        "access_type": "offline",
        "prompt": "consent",
    }
    return {"authorization_url": f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"}


@router.get("/oauth/calendar/callback")
async def google_callback(request: Request, code: str | None = None):
    frontend = str(request.base_url).replace("/api", "")
    target = f"{frontend}admin/integrations"
    if not code or not (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET):
        return RedirectResponse(f"{target}?google=error")
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post("https://oauth2.googleapis.com/token", data={
            "code": code,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri": _redirect_uri(request),
            "grant_type": "authorization_code",
        })
    tok = resp.json()
    if "error" in tok or "access_token" not in tok:
        return RedirectResponse(f"{target}?google=error")
    expiry = (datetime.now(timezone.utc) + timedelta(seconds=int(tok.get("expires_in", 3600)))).isoformat()
    tok["expiry"] = expiry
    await sb("POST", "integration_tokens", json={
        "provider": "google_calendar", "tokens": tok, "updated_at": datetime.now(timezone.utc).isoformat(),
    }, prefer="resolution=merge-duplicates")
    return RedirectResponse(f"{target}?google=connected")


async def _google_creds():
    rows = await sb("GET", "integration_tokens?provider=eq.google_calendar&select=tokens")
    if not rows:
        return None
    tok = rows[0].get("tokens") or {}
    if not tok.get("refresh_token"):
        return None
    creds = Credentials(
        token=tok.get("access_token"),
        refresh_token=tok.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        scopes=GOOGLE_SCOPES,
    )
    if not creds.valid:
        creds.refresh(GoogleRequest())
        tok["access_token"] = creds.token
        await sb("PATCH", "integration_tokens?provider=eq.google_calendar", json={"tokens": tok})
    return creds


def _event_times(event: dict):
    date = event.get("date")
    time = event.get("time")
    if not date:
        return None, None
    if time:
        start = f"{date}T{time}"
        try:
            dt = datetime.fromisoformat(start)
        except ValueError:
            dt = datetime.fromisoformat(f"{date}T00:00:00")
        end = (dt + timedelta(hours=2)).isoformat()
        return {"dateTime": dt.isoformat(), "timeZone": TIMEZONE}, {"dateTime": end, "timeZone": TIMEZONE}
    # all-day
    return {"date": date}, {"date": date}


async def _publish_google(event: dict) -> str:
    creds = await _google_creds()
    if not creds:
        raise RuntimeError("Google Calendar nu este conectat.")
    service = build("calendar", "v3", credentials=creds, cache_discovery=False)
    start, end = _event_times(event)
    if not start:
        raise RuntimeError("Evenimentul nu are dată.")
    body = {
        "summary": event.get("title"),
        "description": (event.get("description") or "") + f"\n\nLocație: {event.get('location') or ''}",
        "location": event.get("location") or "",
        "start": start,
        "end": end,
    }
    existing = event.get("google_event_id")
    if existing:
        res = service.events().update(calendarId=GOOGLE_CALENDAR_ID, eventId=existing, body=body).execute()
    else:
        res = service.events().insert(calendarId=GOOGLE_CALENDAR_ID, body=body).execute()
    return res.get("id")


async def _publish_facebook(event: dict, link: str) -> str:
    if not (FB_PAGE_ID and FB_PAGE_ACCESS_TOKEN):
        raise RuntimeError("Facebook nu este configurat.")
    if not event.get("poster_url"):
        raise RuntimeError("Lipsește posterul (imagine publică necesară).")
    msg = f"{event.get('title')}\n\n{event.get('description') or ''}\n\nÎnscrie-te aici: {link}"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"https://graph.facebook.com/v19.0/{FB_PAGE_ID}/photos",
            data={"url": event["poster_url"], "message": msg, "access_token": FB_PAGE_ACCESS_TOKEN},
        )
    data = resp.json()
    if "error" in data:
        raise RuntimeError(data["error"].get("message", "Eroare Facebook"))
    return data.get("post_id") or data.get("id")


class PublishBody(BaseModel):
    origin: str


@router.post("/events/{event_id}/publish")
async def publish_event(event_id: str, body: PublishBody):
    rows = await sb("GET", f"events?id=eq.{event_id}&select=*")
    if not rows:
        return {"error": "Eveniment negăsit"}
    event = rows[0]
    link = f"{body.origin}/events/{event_id}"
    log: dict = {}
    update: dict = {}

    if event.get("publish_google"):
        try:
            gid = await _publish_google(event)
            update["google_event_id"] = gid
            log["google"] = {"ok": True, "id": gid}
        except Exception as e:
            log["google"] = {"ok": False, "error": str(e)}

    if event.get("publish_facebook"):
        try:
            fid = await _publish_facebook(event, link)
            update["facebook_post_id"] = fid
            log["facebook"] = {"ok": True, "id": fid}
        except Exception as e:
            log["facebook"] = {"ok": False, "error": str(e)}

    if log:
        update["publish_log"] = log
        await sb("PATCH", f"events?id=eq.{event_id}", json=update)
    return {"published": True, "log": log}
