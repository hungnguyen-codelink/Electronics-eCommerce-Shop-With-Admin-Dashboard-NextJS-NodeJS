# Design — Stripe Payments (Phase 1, Test Mode)

**Date:** 2026-05-11
**Status:** Brainstormed, approved, ready for plan.
**Author:** brainstormed with Claude (architectural-memory active).

## Goal

Add Stripe-backed card payments to the existing checkout. Ship in **test mode** first (test keys, test cards, no real money), then flip to **live mode** as an operational step (no code change). Reuse the existing checkout form and order-first flow; payment becomes the trigger that promotes a `pending` order to `processing`.

## Scope (phase 1)

**In:**
- Card payments for one-off purchases via **Stripe Checkout** (hosted redirect).
- Webhook-driven status reconciliation (`checkout.session.completed`, `checkout.session.expired`, `payment_intent.payment_failed`).
- In-app payment notifications via the existing dormant `createPaymentNotification` helper and `PAYMENT_STATUS` notification enum.

**Out (explicit phase-2 boundary):**
- Refunds (no `/api/refunds`, no admin button, no `charge.refunded` handler).
- Saved cards / Stripe Customer linking to user accounts.
- Subscriptions / recurring billing.
- Multi-currency.
- Migrating `Product.price` and `Customer_order.total` from dollars-as-int to cents or `Decimal`.
- 3DS/SCA-specific UI (handled on Stripe's hosted page).
- A cron sweeper for orphan unpaid orders (Stripe's `checkout.session.expired` is the clock).
- Apple Pay / Google Pay buttons on our pages (they appear automatically inside Stripe Checkout).

## End-to-end flow

```
[Client - app/checkout/page.tsx]
  1. Customer fills shipping form, clicks "Pay"
  2. POST /api/orders          → Customer_order(status="pending", paymentStatus="unpaid")
  3. POST /api/order-product   → one per cart item (existing endpoint, unchanged)
  4. POST /api/checkout/create-session   [NEW]
       body: { orderId }
       → server builds Stripe Checkout Session:
            mode: 'payment'
            line_items: cart items (unit_amount = price * 100, qty, name)
            metadata.orderId
            success_url: ${FRONTEND_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}
            cancel_url:  ${FRONTEND_URL}/checkout/cancel?orderId=<id>
            idempotency_key: `${orderId}-${attempt}`   (attempt = checkoutAttempts+1)
       → returns { url, sessionId }
       → controller is RE-ENTRANT: if order.stripeSessionId points at a still-`open`
         session, return that URL instead of creating a new one.
  5. window.location.assign(url)   — hard navigation to Stripe-hosted page
     Cart is NOT cleared yet.

[Stripe-hosted page]
  6. Customer enters card (test cards in test mode), 3DS if required.
  7a. Pays → Stripe redirects to /checkout/success?session_id=...
  7b. Cancels/closes → checkout.session.expired fires from Stripe at 24h.

[Webhook - POST /webhook/stripe]   [NEW]
  - Mounted with express.raw({ type: 'application/json' }) BEFORE express.json().
  - Verifies signature with STRIPE_WEBHOOK_SECRET.
  - Exempt from generalLimiter (Stripe retries must not be rate-limited).
  - No NextAuth, no CORS allowlist. Trust = signature only.

  On checkout.session.completed:
    $transaction:
      Customer_order.update {
        paymentStatus: "paid",
        status: "processing",
        stripePaymentIntentId: <pi_…>,
        paidAt: now()
      }
      createPaymentNotification(userId, 'success', orderId, total)

  On checkout.session.expired:
    Customer_order.update { paymentStatus: "expired", status: "cancelled" }
    createPaymentNotification(userId, 'failed', orderId, total)

  On payment_intent.payment_failed:
    Customer_order.update { paymentStatus: "failed", status: "cancelled" }
    createPaymentNotification(userId, 'failed', orderId, total)

  Idempotent: skip if order already in target paymentStatus.

[Client - app/checkout/success/page.tsx]   [NEW]
  - Reads ?session_id from query.
  - Polls GET /api/checkout/session/:id every 2s, up to 30s.
  - When paymentStatus === 'paid' → confirmation + order summary, then clearCart() once.
  - Still 'unpaid' after 30s → "Payment is taking longer than expected." Cart preserved.
  - 'failed' or 'expired' → "Payment didn't go through." Cart preserved.

[Client - app/checkout/cancel/page.tsx]   [NEW, interactive]
  - Reads ?orderId from query, fetches the order summary.
  - "Try again" button → POST /api/checkout/create-session { orderId } again → window.location.assign(url).
    The same orderId is re-used; no new Customer_order row is inserted.
  - "Back to cart" link → /cart (cart contents are preserved in sessionStorage throughout).
  - No DB write from this page. checkout.session.expired sweeps the abandoned order at 24h
    if the customer doesn't retry.
```

**Invariants:**
- `Customer_order` is the source of truth for **fulfillment**; Stripe is the source of truth for **payment state**. The webhook is the only writer that reconciles the two.
- Webhook signature verification is the **only** trust check on `/webhook/stripe`. No JWT, no CORS check applies.
- The `session_id` query param on `/checkout/success` is **not** trusted as proof of payment — it is a lookup key only. State is read from the DB, which the webhook owns.

## Schema changes — `prisma/schema.prisma`

Add five fields to `Customer_order` and one enum. No new models. No changes to `Product`, `customer_order_product`, `User`.

```prisma
model Customer_order {
  // ... existing fields unchanged ...
  status                  String        // pending | processing | shipped | delivered | cancelled (unchanged)
  total                   Int           // dollars-as-int (unchanged)

  // NEW
  paymentStatus           PaymentStatus @default(unpaid)
  stripeSessionId         String?       @unique
  stripePaymentIntentId   String?       @unique
  paidAt                  DateTime?
  checkoutAttempts        Int           @default(0)   // increments per create-session call; used to suffix the Stripe idempotency key
}

enum PaymentStatus {
  unpaid    // order created; no completed payment attempt
  paid      // checkout.session.completed; money captured
  failed    // payment_intent.payment_failed (card declined inside session)
  expired   // checkout.session.expired (customer abandoned)
}
```

**Why split `status` and `paymentStatus`:**
- `status` continues to mean **fulfillment** (pending → processing → shipped → delivered → cancelled).
- `paymentStatus` is **money state**, written exclusively by the webhook handler.
- They interact at one place: the webhook handler bumps `status` from `pending → processing` when `paymentStatus` flips to `paid`, in the same transaction.
- Keeps refunds-after-shipping clean for phase 2 (`status=delivered`, `paymentStatus=refunded`).

**Indexes:** `@unique` on `stripeSessionId` and `stripePaymentIntentId` so the webhook can `findUnique` cheaply and we get DB-level duplicate protection.

**Migration:** `npx prisma migrate dev --name add_stripe_payment_fields`. Defaults are safe — existing rows backfill to `paymentStatus="unpaid"` and NULLs on the Stripe ID columns.

## State machines

**`paymentStatus` (webhook-owned):**
```
  unpaid ──[checkout.session.completed]──► paid
     │
     ├──[checkout.session.expired]──► expired
     │
     └──[payment_intent.payment_failed]──► failed
```

Terminal states in phase 1: `paid`, `expired`, `failed`. (Refund-driven transitions arrive in phase 2.)

**`status` (admin-owned, with one auto transition):**
```
  pending ──[paymentStatus → paid (auto, same tx as webhook write)]──► processing
     │
     └──[paymentStatus → expired/failed (auto)]──► cancelled

  processing ──[admin]──► shipped ──[admin]──► delivered
  Any state  ──[admin]──► cancelled   (existing manual-cancel behavior)
```

`failed` and `expired` both collapse to `status=cancelled` for fulfillment purposes (distinct only on the `paymentStatus` axis, sufficient for reporting).

## Orphan handling

An "orphan" is a `Customer_order` with `paymentStatus="unpaid"` that never reaches a terminal state.

**Phase 1 strategy:** Stripe's `checkout.session.expired` event (fires at 24h) is the clock. No cron. No sweeper script.

The three orphan sources:
1. **Customer abandons** → `checkout.session.expired` fires automatically (covers ~all real cases).
2. **Webhook delivery lost** (rare; server down past Stripe's retry window) → order sits `unpaid`; admin can manually cancel. Log a WARN when an order stays `unpaid` past 25h to leave a breadcrumb.
3. **Customer never reaches Stripe** (network failure between `create-session` response and the redirect) → same as #2.

`/orders` UI tweak: hide orders with `paymentStatus IN ('expired', 'failed')` from the customer list. Show "Awaiting payment" for `paymentStatus === 'unpaid'`. Retry-from-orders-list is **not** phase 1 — retry happens via `/checkout/cancel` immediately after cancellation, which is when it actually matters.

**Phase 2 plan (not built):** a nightly reconciliation cron that calls `stripe.checkout.sessions.retrieve` for every `unpaid` order older than 25h.

## Server changes

### File layout

```
server/
├── controllers/
│   └── stripe.js                ← NEW
├── routes/
│   ├── checkout.js              ← NEW   (mounted at /api/checkout)
│   └── stripeWebhook.js         ← NEW   (mounted at /webhook/stripe, raw-body)
├── services/
│   └── stripeClient.js          ← NEW   (singleton, mirrors utills/db.js)
└── app.js                       ← edit (wire routes; webhook BEFORE express.json)
```

### Endpoints

| Method | Path                              | Trust check        | Purpose |
|--------|-----------------------------------|--------------------|---------|
| POST   | `/api/checkout/create-session`    | rate limiter       | Build Stripe Checkout Session for an existing `unpaid` order. Returns `{ url, sessionId }`. |
| GET    | `/api/checkout/session/:id`       | rate limiter       | Look up order by `stripeSessionId`. Returns `{ paymentStatus, orderId }` for `/success` polling. |
| POST   | `/webhook/stripe`                 | Stripe signature   | Receives `checkout.session.completed`, `checkout.session.expired`, `payment_intent.payment_failed`. Idempotent. Exempt from `generalLimiter`. |

### `stripeClient.js` (singleton)

```js
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
module.exports = stripe;
```

### `createCheckoutSession` controller skeleton

Uses existing `asyncHandler` + `AppError` pattern. **Re-entrant**: safe to call repeatedly for the same `orderId` (powers the "Try again" button on `/checkout/cancel`).

```js
exports.createCheckoutSession = asyncHandler(async (req, res) => {
  const { orderId } = req.body;
  if (!orderId) throw new AppError('orderId required', 400);

  const order = await prisma.customer_order.findUnique({
    where: { id: orderId },
    include: { products: { include: { product: true } } },
  });
  if (!order) throw new AppError('Order not found', 404);
  if (order.paymentStatus !== 'unpaid') throw new AppError('Order not payable', 409);

  // Re-use an existing live session if one is still open at Stripe.
  if (order.stripeSessionId) {
    const existing = await stripe.checkout.sessions.retrieve(order.stripeSessionId);
    if (existing.status === 'open' && existing.url) {
      return res.json({ url: existing.url, sessionId: existing.id });
    }
    // else: existing session is complete/expired — fall through to create a fresh one
  }

  // Idempotency key includes an attempt suffix so a fresh session can replace an expired one
  // within Stripe's 24h idempotency cache. First attempt: `${orderId}-1`.
  const attempt = (order.checkoutAttempts ?? 0) + 1;

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: order.products.map(op => ({
      price_data: {
        currency: 'usd',
        product_data: { name: op.product.title },
        unit_amount: op.product.price * 100,    // dollars → cents at the boundary
      },
      quantity: op.quantity,
    })),
    metadata: { orderId: order.id },
    success_url: `${process.env.FRONTEND_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${process.env.FRONTEND_URL}/checkout/cancel?orderId=${order.id}`,
  }, { idempotencyKey: `${order.id}-${attempt}` });

  await prisma.customer_order.update({
    where: { id: order.id },
    data: { stripeSessionId: session.id, checkoutAttempts: attempt },
  });

  res.json({ url: session.url, sessionId: session.id });
});
```

This adds one more field to the schema — see below.

### Webhook handler (the critical bits)

- Mounted with `express.raw({ type: 'application/json' })` BEFORE the global `express.json()`. Other routes keep JSON parsing.
- Signature verified with `stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET)`. Bad signature → 400; payload not logged.
- Each event handler is **idempotent**: look up by `stripeSessionId`, no-op if already in target `paymentStatus`. Stripe retries non-2xx responses; idempotency is mandatory.
- All DB writes inside a Prisma `$transaction` so the status flip and the notification insert succeed together.
- Exempt from `generalLimiter`.
- No NextAuth, no CORS check.

### `createCustomerOrder` — duplicate-detection adjustment

Today the controller 409s if a same-email-same-total order exists within the last 1 minute. With Stripe, a normal user flow is: hit Pay → land on Stripe → cancel → tap "Try again" on `/checkout/cancel` (which re-uses the same orderId, no problem) — **but** if they instead navigate back to `/checkout` and re-submit, they'd hit this 409 and be stuck.

Change: if the would-be duplicate's `paymentStatus === 'unpaid'`, return `{ id: <existingOrderId>, reused: true }` with a 200 instead of 409. The client treats the response identically and proceeds to `create-session` for that orderId. If `paymentStatus === 'paid'` (true duplicate, real concern), keep the 409.

This is one of the few cases where existing controller behavior changes; call it out clearly in the implementation plan.

### `app.js` wiring (order matters)

```
addRequestId
→ securityLogger
→ requestLogger
→ errorLogger
→ generalLimiter (skipped for /webhook/stripe)
→ POST /webhook/stripe   (express.raw, signature verified inside)
→ express.json()
→ CORS
→ fileUpload
→ per-route limiters
→ /api/orders, /api/order-product, /api/checkout/*, etc.
→ 404
→ handleServerError
```

## Client changes (Next.js)

### File layout

```
app/
├── checkout/
│   ├── page.tsx               ← edit
│   ├── success/
│   │   └── page.tsx           ← NEW
│   └── cancel/
│       └── page.tsx           ← NEW
```

No new dependency (`@stripe/stripe-js` is **not** needed because we redirect rather than embed Elements). Zustand cart store unchanged.

### Edits to `app/checkout/page.tsx`

Replace the existing post-success block (`clearCart()` + home redirect + "you will be contacted" toast) with:

```ts
// after the existing addOrderProduct loop:
const { url } = await apiClient.post('/api/checkout/create-session', { orderId });
window.location.assign(url);   // hard navigation; we are leaving the SPA
```

Remove the "Payment will be processed after order confirmation" info box — copy is obsolete. Cart is preserved across the round-trip and cleared on the `/success` page once `paymentStatus === 'paid'` is confirmed.

### `app/checkout/success/page.tsx` (new, client component)

States:
- **`paid`**: confirmation + order ID + items. Call `clearCart()` once on first entry to this state.
- **Still `unpaid`, polling**: spinner + "Confirming your payment…" (poll every 2s, max 30s).
- **Timed out (30s)**: "Payment is taking longer than expected. We'll notify you when it's confirmed." Cart preserved.
- **`failed`/`expired`**: "Payment didn't go through — your cart is still here." Link to `/checkout`.

### `app/checkout/cancel/page.tsx` (new, client component, interactive)

Reads `orderId` from query. Renders:
- Cart summary (read from Zustand — cart is still in `sessionStorage`).
- "**Try again**" button → `POST /api/checkout/create-session { orderId }` → `window.location.assign(url)`. Re-uses the existing order; no new `Customer_order` row. Controller is re-entrant (see Section 3).
- "**Back to cart**" link → `/cart`.

No DB write from this page. If the customer never retries, `checkout.session.expired` sweeps the order at 24h.

### `/orders` UI tweak

Hide orders with `paymentStatus IN ('expired', 'failed')` from the customer-facing list. Show "Awaiting payment" for `paymentStatus === 'unpaid'` (no action button in phase 1 — retry is reachable via `/checkout/cancel` immediately after cancellation, which is when retry actually happens in practice).

Admin-facing `/admin/orders` continues to show all orders regardless of `paymentStatus`.

## Env vars and secrets

| Var | Side | Phase 1 (test) | Phase 2 (live) | Notes |
|---|---|---|---|---|
| `STRIPE_SECRET_KEY` | `server/.env` | `sk_test_…` | `sk_live_…` | Never logged. Express-only. |
| `STRIPE_WEBHOOK_SECRET` | `server/.env` | `whsec_…` from Stripe CLI in dev; `whsec_…` from Dashboard in deployed test/staging | new `whsec_…` per env | Issued per webhook endpoint. |
| `STRIPE_SUCCESS_URL_BASE` | `server/.env` | optional; defaults to `FRONTEND_URL` | optional | Only needed if success/cancel URLs ever differ from the frontend host. |

Add placeholders in `.env.docker.example`. Fail fast at boot in `server/app.js` if `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` is missing.

**No browser-side Stripe key.** No `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. Resist adding one preemptively.

### Local dev: webhook delivery

Stripe can't POST to `localhost`. Use the Stripe CLI to forward:

```bash
brew install stripe/stripe-cli/stripe       # one-time
stripe login                                 # one-time per machine
stripe listen --forward-to http://localhost:3001/webhook/stripe
# → prints whsec_…; paste into server/.env as STRIPE_WEBHOOK_SECRET (dev value only)

# trigger test events manually
stripe trigger checkout.session.completed
stripe trigger checkout.session.expired
```

Document this under a new "Stripe (dev)" section in README.

### Test → live rollout (operational steps; no code change)

1. **Stripe Dashboard (live mode):** create live API key and a live webhook endpoint pointing at the production domain. Subscribe to: `checkout.session.completed`, `checkout.session.expired`, `payment_intent.payment_failed`.
2. **Production secrets store:** swap `STRIPE_SECRET_KEY` → `sk_live_…`, `STRIPE_WEBHOOK_SECRET` → live endpoint signing secret. Local and staging keep `sk_test_…`.
3. **Smoke test:** complete a real low-value purchase ($0.50), confirm order moves to `paid`, refund from Dashboard.

**No `STRIPE_MODE` env var.** The key prefix (`sk_test_` vs `sk_live_`) is the mode discriminator inside the Stripe SDK.

## Acceptance criteria (phase 1)

Done when, in **test mode**:

1. Logged-in customer completes the full flow with test card `4242 4242 4242 4242` → success page → order visible with `status="processing"`, `paymentStatus="paid"`, `paidAt` set, `stripePaymentIntentId` populated.
2. Test card `4000 0000 0000 0002` (always-declines) → "payment failed" state on success page, order `paymentStatus="failed"`, `status="cancelled"`, cart preserved.
3. Closing the Stripe page mid-flow → order stays `unpaid`. `stripe trigger checkout.session.expired` flips it to `expired/cancelled` and creates a `PAYMENT_STATUS` notification.
4. Webhook handler is idempotent: replaying the same `checkout.session.completed` event twice via `stripe events resend <id>` does not double-notify or move state backwards.
5. Re-submitting checkout with the same `orderId` while a session is still `open` at Stripe returns the same URL (re-entrant `create-session`); after that session is expired, a fresh one is generated and the order's `checkoutAttempts` increments.
5a. After cancelling at Stripe, tapping "Try again" on `/checkout/cancel` reopens a Stripe page for the **same** orderId (no new `Customer_order` row created).
5b. Re-submitting `/api/orders` with the same email+total within 1 min, where the prior order is `unpaid`, returns the existing orderId (not a 409) and the client proceeds to `create-session` normally.
6. Forged POST to `/webhook/stripe` with right `Stripe-Signature` shape but wrong secret → 400 response, no DB write.
7. No `sk_live_…` key exists in any committed file or env example.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Customer arrives at `/success` before webhook fires (race). | Success page polls `/api/checkout/session/:id` for up to 30s; falls back to "confirming…" message. Cart NOT cleared until `paid` confirmed. |
| Customer double-clicks "Pay" → two sessions for one order. | Controller is re-entrant: first checks `order.stripeSessionId` against Stripe and returns the existing `open` session if found. Stripe `idempotencyKey: ${orderId}-${attempt}` is a backstop. |
| Webhook event lost (Stripe retried past window). | Order stays `unpaid`; log WARN past 25h; admin manual cancel. Phase 2 cron handles systematically. |
| Cents lost forever due to dollars-as-int schema. | Acknowledged debt. `* 100` at Stripe boundary works correctly for whole-dollar prices today. Migration deferred to phase 2 (or whenever a non-whole-dollar price is needed). |
| Stripe secret key leaks. | Live secret only in production secrets store. Never sent to browser. Webhook signing secret per-endpoint and rotatable from Dashboard. |
| Webhook bypasses `generalLimiter` — could be DOS'd. | Stripe signature verification is fast and short-circuits invalid requests at 400. The actual Stripe-origin traffic is bounded. Add a separate IP-based limit if abuse is ever observed. |
