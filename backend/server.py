import os
from datetime import datetime, timezone
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest

load_dotenv(Path(__file__).parent / ".env")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
STRIPE_API_KEY = os.environ["STRIPE_API_KEY"]

SB_HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}

app = FastAPI(title="Casa Pâinii API")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
    allow_headers=["*"], allow_credentials=True,
)
api = APIRouter(prefix="/api")


async def sb_request(method: str, path: str, json=None, prefer: str | None = None):
    headers = dict(SB_HEADERS)
    if prefer:
        headers["Prefer"] = prefer
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.request(method, f"{SUPABASE_URL}/rest/v1/{path}", headers=headers, json=json)
        r.raise_for_status()
        return r.json() if r.text else None


class CheckoutBody(BaseModel):
    registration_id: str
    origin: str


@api.get("/health")
async def health():
    return {"status": "ok"}


@api.post("/payments/checkout")
async def create_checkout(body: CheckoutBody, request: Request):
    regs = await sb_request("GET", f"registrations?id=eq.{body.registration_id}&select=*")
    if not regs:
        raise HTTPException(404, "Înregistrare negăsită")
    reg = regs[0]
    amount = float(reg.get("package_price") or 0)

    # Free ticket — mark paid, no Stripe needed
    if amount <= 0:
        await sb_request("PATCH", f"registrations?id=eq.{body.registration_id}", json={"payment_status": "paid"})
        return {"free": True}

    host_url = str(request.base_url)
    webhook_url = f"{host_url}api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)

    success_url = f"{body.origin}/payment/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{body.origin}/dashboard"
    metadata = {
        "registration_id": str(body.registration_id),
        "user_id": str(reg.get("user_id") or ""),
        "event_title": str(reg.get("event_title") or ""),
    }
    checkout_request = CheckoutSessionRequest(
        amount=amount, currency="ron", success_url=success_url, cancel_url=cancel_url, metadata=metadata,
    )
    session = await stripe_checkout.create_checkout_session(checkout_request)

    await sb_request("POST", "payment_transactions", json={
        "user_id": reg.get("user_id"),
        "registration_id": body.registration_id,
        "session_id": session.session_id,
        "amount": amount,
        "currency": "ron",
        "status": "initiated",
        "payment_status": "pending",
        "metadata": metadata,
    }, prefer="return=minimal")

    return {"url": session.url, "session_id": session.session_id}


@api.get("/payments/status/{session_id}")
async def checkout_status(session_id: str, request: Request):
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=f"{str(request.base_url)}api/webhook/stripe")
    status = await stripe_checkout.get_checkout_status(session_id)

    await sb_request("PATCH", f"payment_transactions?session_id=eq.{session_id}", json={
        "status": status.status,
        "payment_status": status.payment_status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })

    if status.payment_status == "paid":
        txs = await sb_request("GET", f"payment_transactions?session_id=eq.{session_id}&select=registration_id")
        if txs and txs[0].get("registration_id"):
            await sb_request("PATCH", f"registrations?id=eq.{txs[0]['registration_id']}", json={"payment_status": "paid"})

    return {
        "status": status.status,
        "payment_status": status.payment_status,
        "amount_total": status.amount_total,
        "currency": status.currency,
    }


@api.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    try:
        stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=f"{str(request.base_url)}api/webhook/stripe")
        body = await request.body()
        sig = request.headers.get("Stripe-Signature", "")
        event = await stripe_checkout.handle_webhook(body, sig)
        if event.payment_status == "paid" and event.metadata.get("registration_id"):
            await sb_request("PATCH", f"registrations?id=eq.{event.metadata['registration_id']}", json={"payment_status": "paid"})
            await sb_request("PATCH", f"payment_transactions?session_id=eq.{event.session_id}", json={"payment_status": "paid", "status": "complete"})
    except Exception:
        pass
    return {"received": True}


app.include_router(api)

from integrations import router as integrations_router  # noqa: E402
app.include_router(integrations_router)
