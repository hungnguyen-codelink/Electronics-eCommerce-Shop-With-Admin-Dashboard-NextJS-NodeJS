# Decision Note — Product Reviews MVP

**Date:** 2026-05-04
**Spec:** [2026-05-04-product-reviews-design.md](./2026-05-04-product-reviews-design.md)

## Context

The codebase is a Next.js + Express + Prisma e-commerce platform. The `Product` model already has a `rating Int @default(0)` field, and `components/ProductTabs.tsx` carries dead imports for `RatingPercentElement` and `SingleReview` — a planned-but-never-built reviews feature. This task is to actually ship that feature as a minimal MVP.

Two pieces of prior architectural context shaped the design:
1. The Express server in `server/` has **no auth middleware** — routes accept `userId` from path or body and trust the client. NextAuth lives only in the Next.js side. This is consistent across wishlist, customer orders, etc.
2. The codebase already follows a controllers + routes + services split inside `server/`, and an `apiClient` helper in `lib/api.ts` proxies all frontend calls to the Express server.

The user explicitly chose minimal scope (no moderation, no verified-purchase, no helpful votes, no images, no merchant replies) and accepted the existing auth gap as out of scope for this feature.

## Choice

Add a `Review` Prisma model with a unique constraint on `(productId, userId)`, expose four Express endpoints (`GET` paged list, `GET` user's-own-review, `POST`, `DELETE`) under `/api/reviews/*`, and recompute the existing `Product.rating` field as a cached rounded average inside the same transaction as each write. Surface reviews in a third tab inside `ProductTabs.tsx` with anonymous cards (rating + comment + date), a separate "Your review" panel for the logged-in author, and offset-based pagination (5 first, then 10 per "Load more" click). Match the existing client-trusts-userId auth pattern and explicitly document the gap as a known limitation.

## Alternatives Rejected

- **Verified-purchase gating** — rejected at Q2; user wants any logged-in user to be able to review. Out of MVP scope.
- **Edit-in-place / UPSERT for re-submission** — rejected at Q4; chose explicit delete-to-recreate so reviews are immutable once posted (no `updatedAt`, no edit history complexity).
- **Compute average on read instead of caching** — rejected at Q5; the cached field already exists and a write-time recompute keeps reads cheap.
- **Float average with half-stars** — rejected at Q5 to avoid a schema migration; rounded int matches the existing field type.
- **Pagination with sort controls** — rejected at Q6; newest-first only for MVP.
- **Reviewer display names / verified badges** — rejected at Q7; anonymous cards sidestep the missing `User.name` field entirely.
- **"My reviews" page in account settings** — rejected at Q8; the "Your review" panel on the product page is enough.
- **Real Express auth middleware (option B at Q9)** — rejected because it would create a one-feature divergence in a codebase where every other route trusts the client. Tracked as a separate hardening task.
- **Next.js API routes with `getServerSession()` (option C at Q9)** — rejected for the same divergence reason; would split the backend.
- **Inline rating recompute in the controller (Approach 1)** — rejected after the approaches discussion; the recompute is genuinely shared between two write paths (create + delete) and the existing `server/services/` folder convention fits.
- **Frontend automated tests (option B in Section 5)** — rejected; no test runner is configured and adding one is out of MVP scope.
- **Page-based pagination** — rejected during spec self-review because the "5 first, then 10 per Load more" UX produces awkward page math; switched to offset-based.

## Invariants Preserved

- **The "client passes userId, server trusts it" pattern** in `server/` remains the single auth model across all routes. The new reviews endpoints do not introduce a competing pattern.
- **The `controllers/` + `routes/` + `services/` split** inside `server/` is preserved — reviews follow the same three-file shape as other features (e.g. products, customer_orders).
- **`asyncHandler` from `utills/errorHandler.js`** wraps all new handlers; no parallel error-handling utility introduced.
- **`apiClient` from `lib/api.ts`** is the only path the frontend uses to reach the Express server; the new components do not bypass it.
- **`sanitize`/`sanitizeHtml` from `lib/sanitize.ts`** is used wherever user-supplied review text is rendered, matching the product-description treatment.
- **The existing `Product.rating Int` shape and semantics** (0..5 integer) are preserved; the field's interpretation is now "rounded average across reviews, 0 if none" — a strengthening of its meaning, not a breaking change.
- **DB-level uniqueness** is the source of truth for "one review per user per product" via `@@unique([productId, userId])`; the application-level pre-check is a UX optimization, not the guarantee.

## In-flight Refinements

None yet.
