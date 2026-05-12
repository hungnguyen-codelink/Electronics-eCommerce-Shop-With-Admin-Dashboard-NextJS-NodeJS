# Decision Note — Stripe Payments (Phase 1, Test Mode)

**Date:** 2026-05-11
**Spec:** [./2026-05-11-stripe-payments-design.md](./2026-05-11-stripe-payments-design.md)

## Context

The existing checkout flow in [app/checkout/page.tsx](../../../app/checkout/page.tsx) creates a `Customer_order` row with `status="pending"` before any money is involved, then shows a placeholder "you will be contacted for payment" message — payment is currently deferred entirely. The schema in [prisma/schema.prisma](../../../prisma/schema.prisma) has no payment-related fields on `Customer_order`; `total` is stored as `Int` in **whole dollars** (e.g., `22` for $22), losing cents. The two-process architecture means Express owns all DB writes via Prisma, and Next.js communicates with Express through `apiClient` (browser) or its `internalApiBaseUrl` (SSR) — never directly to the DB. byterover confirms no prior Stripe context exists for this project, but it does have detailed context on the `createCustomerOrder` controller, the Prisma client singleton pattern, and the `asyncHandler` + `AppError` controller convention. Dormant scaffolding for payments already exists in the codebase — a `PAYMENT_STATUS` notification enum and an unused `createPaymentNotification` helper — and we will reuse it rather than rebuild. The user articulated the rollout target during brainstorming: test mode first (Stripe test keys, test cards, no real money), then a key-swap to live mode as an operational step, not a code change.

## Choice

Integrate **Stripe Checkout** (hosted redirect flow) on the Express side. Preserve the order-first flow: the existing `POST /api/orders` and per-item `POST /api/order-product` calls continue to create `Customer_order` + `customer_order_product` rows, then a new `POST /api/checkout/create-session` builds a Stripe Checkout Session referencing the order and returns its URL; the browser hard-navigates to Stripe; on completion Stripe redirects to a new `/checkout/success` page that polls the server for confirmed status, and a `POST /webhook/stripe` handler (raw-body, signature-verified, mounted **before** the global `express.json()`) reconciles `paymentStatus` and bumps `status` from `pending → processing` in a single Prisma `$transaction`. Schema adds five fields to `Customer_order` (`paymentStatus`, `stripeSessionId`, `stripePaymentIntentId`, `paidAt`, `checkoutAttempts`) plus a `PaymentStatus` enum (`unpaid|paid|failed|expired`). `paymentStatus` and `status` are deliberately split — money state vs fulfillment state — with one auto transition between them inside the webhook transaction. The `createCheckoutSession` controller is re-entrant (powers retry from `/checkout/cancel`), checking Stripe for an existing `open` session before minting a new one and using `${orderId}-${attempt}` as the idempotency key so a fresh session can replace an expired one within Stripe's 24h idempotency cache. The `createCustomerOrder` duplicate-detection is loosened to return the existing orderId (200) instead of 409 when the prior duplicate is `unpaid`, preventing dead-ends when the customer navigates back to `/checkout` after cancelling.

## Alternatives Rejected

- **Stripe Elements / Payment Element (embedded form).** More code, larger PCI surface for us, and no UX win that matters at this scope — customers don't perceive a meaningful difference between an inline card form and Stripe's hosted page for a one-off purchase. Reconsider only if branding constraints demand same-domain payment UI.
- **Pay-first-then-create-order (webhook owns the row insert).** Cleaner in principle — no orphan unpaid rows — but it inverts the existing cart→order flow into something async, requires a "processing" intermediate state on submit, and changes how every downstream component reads orders. Too large a rewrite for the value it adds at phase 1 scale.
- **Hybrid: draft order with TTL, swept by a cron.** Needs cron infra we don't currently have, plus an extra `draft` paymentStatus value. Rejected for phase 1; revisit if abandoned-order volume becomes a real ops burden.
- **Migrate `Product.price` / `Customer_order.total` to cents-as-Int or `Decimal` now.** Correct long-term but bleeds into bulk upload pipelines, admin product editor, display formatting, and seeded demo data. Deferred. `* 100` at the Stripe boundary works correctly while prices remain whole-dollar — this is acknowledged tech debt.
- **"Resume payment" button on `/orders`.** Tempting but requires expired-session detection at a UI surface where retry isn't the main use case. Retry from `/checkout/cancel` covers the realistic flow; defer the listing-page widget to phase 2.
- **A `STRIPE_MODE=test|live` env var.** Unnecessary indirection — the `sk_test_…` vs `sk_live_…` key prefix is the mode discriminator inside the Stripe SDK. Adding a flag invites accidental misconfiguration.
- **No-NextAuth check on the webhook.** Not strictly an "alternative" but worth recording: relying solely on Stripe's signature for trust on `/webhook/stripe` is a deliberate choice. The Express API as a whole does not verify NextAuth JWTs today (CLAUDE.md "Architecture notes"), so requiring one here would be an inconsistent new gate; Stripe signature is the equivalent trust mechanism for this endpoint.

## Invariants Preserved

- **Express owns all DB writes.** Next.js never gains Prisma access. Both new endpoints (`/api/checkout/*`) and the webhook live on the Express side; the Next.js client only fetches via `apiClient`.
- **Two-Prisma-client singleton pattern unchanged.** Root `utils/db.ts` (Next.js, TS) and `server/utills/db.js` (Express, JS, two L's) remain independent singletons generated from the shared `prisma/schema.prisma`. The new Stripe code uses the Express-side singleton; no second Prisma client is introduced.
- **`asyncHandler` + `AppError` controller pattern.** The new `createCheckoutSession`, `getCheckoutSession`, and the webhook event handlers all use it. No bare try/catch in controllers; errors flow to `handleServerError`.
- **"Related writes inside the same `$transaction`" rule** (originally codified by `recomputeProductRating` per CLAUDE.md). Extended to the webhook: the `paymentStatus` flip, the `status` auto-bump, and the `createPaymentNotification` call all run inside a single Prisma `$transaction`. Skipping this would leave the system in inconsistent states under partial failure.
- **`Customer_order` remains the source of truth for fulfillment.** `status` semantics are unchanged (`pending|processing|shipped|delivered|cancelled`). The new `paymentStatus` is an additional axis, not a replacement.
- **Cart state stays client-only.** Zustand `sessionStorage` continues to own cart contents; we do not promote the cart to server-side storage to survive the Stripe redirect. Cart preservation across the round-trip is achieved by *not* clearing it on submit — only on confirmed `paid` state at `/success`.
- **No new browser-side payment dependency.** `@stripe/stripe-js` is intentionally not added — hosted Checkout means the browser never touches the Stripe SDK. Keeps the dep graph and Next.js bundle lean.
- **Webhook trust model is consistent with the rest of the Express API.** No NextAuth check (the API doesn't verify JWTs today); Stripe signature is the explicit replacement trust mechanism for this single route.
- **Webhook route is exempt from `generalLimiter`.** Stripe's retry traffic must not be rate-limited away. Signature verification provides the equivalent abuse-prevention guarantee.

## In-flight Refinements

### 2026-05-11 — No customer-facing `/orders` page exists
- **Plan assumed:** The spec's Section 5 described a `/orders` UI tweak (hide expired/failed orders, show "Awaiting payment" for unpaid).
- **Turned out:** Only admin orders exist at `app/(dashboard)/admin/orders/`. There is no customer-facing orders listing.
- **Chose:** Drop the `/orders` UI tweak entirely from phase 1 scope. Admin view continues to show all orders regardless of `paymentStatus` (no change there).
- **Why:** Building a customer orders page is out of scope for a payments integration; if customers need to see their orders post-checkout, that's a separate feature.

### 2026-05-11 — `customer_orders.js` violates Prisma singleton pattern
- **Plan assumed:** The controller already follows the codebase's `require('../utills/db')` convention.
- **Turned out:** `server/controllers/customer_orders.js` does `new PrismaClient()` directly — a known violation already flagged in byterover's architectural-invariants entry for the Prisma singleton pattern.
- **Chose:** Fix it as part of the duplicate-detection adjustment task in the plan (we're touching the file anyway).
- **Why:** Touching a file that violates a documented invariant without fixing the violation perpetuates the issue. Cheap to fix in the same commit.

### 2026-05-11 — `handleServerError` Prisma branch misroutes Stripe errors
- **Plan assumed:** Stripe API errors thrown from controllers would fall cleanly to the generic 500 handler.
- **Turned out:** Stripe errors carry a `code` property too (e.g. `'authentication_error'`, `'card_declined'`), so `"code" in error` matched and routed them through `handlePrismaError`, surfacing as "Database operation failed" 500s.
- **Chose:** Add a `error.code.startsWith("P")` guard to the Prisma branch (Prisma codes are always P-prefixed: `P2002`, `P2025`, …). Stripe errors then fall through to the generic 500, where they get logged but not echoed to the client. Rejected the alternative of adding a dedicated Stripe branch — it would have leaked raw Stripe `error.message` to clients (including potential API key fragments) and broken the codebase's "expected failures throw AppError; unexpected fall to 500" pattern.
- **Why:** The Prisma guard is a narrow, defensible bug fix that any future third-party SDK with `code`-bearing errors will also benefit from. Bespoke per-SDK branches in `handleServerError` would invite leaky-by-default error UX.

### 2026-05-11 — `createPaymentNotification` arg order differed from the plan
- **Plan assumed:** signature was `(userId, status, orderId, total, client)`.
- **Turned out:** existing helper at `server/utills/notificationHelpers.js:93` is `(userId, paymentStatus, amount, orderId)` — `amount` before `orderId`. `grep -rn` showed zero callers anywhere (confirmed dormant scaffolding as the decision note noted).
- **Chose:** Keep the existing helper's arg order, add optional `client = null` as the 5th argument, and use `(client || prisma).notification.create(...)` inside (mirroring the `recomputeProductRating(productId, tx)` pattern from CLAUDE.md). Adapt the webhook's three call sites to pass `(userId, paymentStatus, order.total, order.id, tx)`.
- **Why:** No callers means we have freedom to choose; matching the helper's existing shape preserves the surface anyone reading `notificationHelpers.js` standalone would expect. Changing the helper to match the plan's order would have created a no-callers refactor for cosmetic reasons.
