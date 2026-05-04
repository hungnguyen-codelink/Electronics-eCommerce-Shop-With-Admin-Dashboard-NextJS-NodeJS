# Product Reviews — Design Spec

**Date:** 2026-05-04
**Status:** Draft for review
**Scope:** Minimal MVP — star rating + optional text review, one per user per product, no moderation.

## 1. Goal

Let logged-in users post a 1–5 star rating (with optional comment) on any product, see the aggregated rating on the product page, and read other users' reviews. Replace the dead, never-built review hooks already referenced in `components/ProductTabs.tsx`.

## 2. Decisions captured during brainstorming

| # | Decision |
|---|---|
| Q1 | Minimal MVP — no moderation, no verified-purchase gate, no images, no helpful votes, no merchant replies. |
| Q2 | Any logged-in user can review any product. |
| Q3 | Rating (1..5) required; comment text optional. |
| Q4 | One review per user per product. Re-submission is **blocked** with a 409; user must delete their existing review to write a new one. |
| Q5 | Reuse the existing `Product.rating Int @default(0)` field as a cached aggregate (rounded average). Recomputed on every review create/delete. |
| Q6 | Product page shows 5 newest reviews + a "Load more" button paging by 10. Default sort: newest first. |
| Q7 | Review cards are anonymous — only rating, comment, and date. No reviewer name. |
| Q8 | The author's edit/delete affordance lives in a separate "Your review" panel at the top of the reviews section. |
| Q9 | Auth: match the existing server pattern — client passes `userId` from the NextAuth session in path/body. **Known limitation**: the Express server has no auth middleware, so a malicious client could submit a review under any `userId`. Tracked as a follow-up; not closed as part of this feature. |
| Q10 | Reviews appear as a third tab inside `components/ProductTabs.tsx`. |

## 3. Data model

Add a new `Review` model to `prisma/schema.prisma`:

```prisma
model Review {
  id        String   @id @default(uuid())
  productId String
  product   Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  rating    Int      // 1..5, validated at API layer
  comment   String?  @db.Text
  createdAt DateTime @default(now())

  @@unique([productId, userId])
  @@index([productId, createdAt])
  @@index([userId])
}
```

Add back-relations on `Product` and `User`:

```prisma
// in Product
reviews Review[]

// in User
reviews Review[]
```

The existing `Product.rating Int @default(0)` field is reused as the cached aggregate (rounded average across all reviews; `0` when there are no reviews).

**Notes:**
- `@@unique([productId, userId])` is the source-of-truth enforcement for "one review per user per product" — even if the API pre-check races, the DB rejects the duplicate.
- `comment` is `String? @db.Text` to allow longer-form prose than the default VARCHAR(191).
- `@@index([productId, createdAt])` makes paginated newest-first reads an index scan.
- No `updatedAt` — reviews are immutable; users delete-to-recreate per Q4.
- `onDelete: Cascade` on both relations: deleting a product or user removes their reviews.

## 4. Backend (Express)

### Files to add

```
server/
  controllers/reviews.js          # CRUD handlers
  routes/reviews.js               # Express router
  services/productRating.js       # recomputeProductRating(productId, tx)
```

Mount the router in `server/app.js`: `app.use("/api/reviews", reviewsRouter)`.

### Endpoints

| Method | Path | Body / Query | Purpose |
|---|---|---|---|
| `GET` | `/api/reviews/product/:productId?offset=0&limit=10` | — | Paginated reviews, newest first. Offset-based to support the "5 first, then 10 per Load more" UX (Q6). Returns `{ reviews: [...], total, offset, limit, hasMore }`. |
| `GET` | `/api/reviews/product/:productId/user/:userId` | — | The current user's review for this product, or `null`. Powers the "Your review" panel. |
| `POST` | `/api/reviews` | `{ productId, userId, rating, comment? }` | Create. Validates `rating ∈ [1,5]`, product/user exist, no existing review. Recomputes `Product.rating` in the same transaction. |
| `DELETE` | `/api/reviews/:id` | `{ userId }` | Deletes the review only if `review.userId === body.userId`. Recomputes `Product.rating`. |

### `services/productRating.js`

```js
async function recomputeProductRating(productId, tx) {
  const result = await tx.review.aggregate({
    where: { productId },
    _avg: { rating: true },
    _count: true,
  });
  const newRating = result._count > 0 ? Math.round(result._avg.rating) : 0;
  await tx.product.update({
    where: { id: productId },
    data: { rating: newRating },
  });
}
```

Reviews controller calls it inside `prisma.$transaction`:

```js
await prisma.$transaction(async (tx) => {
  await tx.review.create({ data: { ... } });
  await recomputeProductRating(productId, tx);
});
```

### Validation

- `rating`: integer in `[1, 5]`.
- `comment`: optional string, max 2000 characters.
- `productId`, `userId`: existence check via `findUnique`.
- All handlers wrapped with the existing `asyncHandler` from `utills/errorHandler.js`. No new error utility introduced.

### Auth

Per Q9, no auth middleware. The `userId` from the NextAuth session on the Next.js side is passed into the Express server in the path or body. The DELETE handler enforces ownership by comparing `review.userId === body.userId`. The pre-existing trust-based pattern is **explicitly accepted as a known limitation** for this feature.

## 5. Frontend (Next.js)

### Files to add

```
components/
  ReviewsTab.tsx          # container — fetches, owns pagination state
  ReviewCard.tsx          # anonymous card: stars + comment + date
  ReviewForm.tsx          # star picker + textarea + Submit
  YourReviewPanel.tsx     # logged-in author's panel with Delete
  StarRating.tsx          # presentational, supports interactive mode
```

### Files to modify

- `components/ProductTabs.tsx` — add a third "Reviews" tab; remove the dead imports for `RatingPercentElement` and `SingleReview`; render `<ReviewsTab product={product} />` when the tab is active.
- `components/index.ts` — export the new components.
- `types/` — add a `Review` type matching the API response.

### Component tree

```
ProductTabs
  └─ ReviewsTab                        (active when tab === 2)
       ├─ YourReviewPanel              (if user has reviewed)
       │    └─ StarRating + Delete button
       ├─ ReviewForm                   (if logged in, no existing review)
       │    └─ StarRating (interactive) + textarea
       ├─ ReviewCard × N               (5 newest, then +10 per Load more)
       │    └─ StarRating + comment + date
       └─ "Load more" button           (visible while hasMore)
```

### Data flow

- `ReviewsTab` calls `apiClient.get('/api/reviews/product/:productId?offset=0&limit=5')` on mount. "Load more" calls `?offset=<loaded count>&limit=10` and appends to the local list.
- If a NextAuth session exists (`useSession` from `next-auth/react`), it also calls `/api/reviews/product/:productId/user/:userId` to populate `YourReviewPanel` or unlock `ReviewForm`.
- After a successful submit/delete, refetch the first page **and** the user's-review query. One extra round trip per write is acceptable and avoids client-side cache surgery.
- Initial-load spinner: existing `<Loader />` component. Submit-in-flight: button-local spinner.

### UX details

- Star picker: 5 clickable star icons from `react-icons/fa` (already a dep). Hover preview, click commits.
- Logged-out state: `ReviewForm` is replaced by a "Log in to write a review" link to `/login`.
- Empty state: "No reviews yet — be the first to review this product."
- Toasts via `react-hot-toast` (already a dep): "Review posted" / "Review deleted" / error messages.
- All user-supplied `comment` text is rendered through the existing `sanitize`/`sanitizeHtml` utilities from `lib/sanitize.ts`.

## 6. Error handling

### Server

| Condition | HTTP | Body |
|---|---|---|
| `rating` not in 1..5 / missing / non-integer | 400 | `{ error: "Rating must be an integer between 1 and 5" }` |
| `comment` exceeds 2000 chars | 400 | `{ error: "Comment too long" }` |
| `productId` not found | 404 | `{ error: "Product not found" }` |
| `userId` not found | 404 | `{ error: "User not found" }` |
| User already has a review (pre-check or `P2002`) | 409 | `{ error: "You have already reviewed this product" }` |
| `DELETE` where `review.userId !== body.userId` | 403 | `{ error: "You can only delete your own review" }` |
| `DELETE` where review id not found | 404 | `{ error: "Review not found" }` |
| Anything else | 500 | Falls into existing `handleServerError`. |

The `P2002` unique-constraint catch is the DB-level guarantee: even if two simultaneous creates pass the pre-check, only one inserts; the loser gets 409.

### Frontend

- All API calls wrapped in try/catch; failures surface via `toast.error(message)`.
- The 409 path is defensive — `ReviewForm` shouldn't render if the user already has a review (gated by the user's-review query). If it's hit anyway, the toast asks the user to refresh.
- Initial-load network failure: "Failed to load reviews" with a retry button.

## 7. Edge cases

- **Concurrent recomputes**: each transaction reads `aggregate({ where: { productId } })` fresh. MySQL's default `REPEATABLE READ` isolation gives consistent per-transaction snapshots. Worst case the cached field is briefly off by a rounding step; the next write corrects it.
- **Deleting the only review**: aggregate `_count = 0` → `Product.rating = 0`.
- **Product deleted while reviews exist**: `onDelete: Cascade` removes them; no orphans.
- **User deleted while reviews exist**: cascade removes their reviews, but the existing user-deletion code path will not call `recomputeProductRating`. The implementation step will inspect `controllers/users.js` and either patch the deletion path to recompute affected products or note this as a follow-up. Acceptable for MVP because user deletion is rare and the field eventually self-corrects on the next review write.
- **XSS in `comment`**: rendered via the existing `sanitize`/`sanitizeHtml` utilities.

## 8. Known limitations

1. **Auth gap (Q9)**: Express trusts client-supplied `userId`. Mitigation: the DELETE handler enforces ownership, but the create path can still be spoofed. Tracked as a separate hardening task across all server routes.
2. **User deletion → stale rating**: see "Edge cases."
3. **No review-specific rate limiting** beyond whatever the global limiter (`server/middleware/rateLimiter.js`) already enforces.

## 9. Testing

### Backend (`server/tests/reviews.test.js`)

| Case | Asserts |
|---|---|
| `POST` valid body | 201; row exists; `Product.rating` matches rounded average. |
| `POST` rating = 0 / 6 / `"abc"` | 400. |
| `POST` non-existent product or user | 404. |
| `POST` when user already reviewed | 409 (covers pre-check and unique-constraint paths). |
| `POST` → `DELETE` → `POST` | Second `POST` succeeds (delete-to-recreate). |
| `DELETE` by author | 200; row gone; `Product.rating` recomputed. |
| `DELETE` by a different user | 403; row remains. |
| `DELETE` on a missing id | 404. |
| `GET ?offset=0&limit=5` with 12 seeded reviews | Returns 5 newest; `total = 12`; `hasMore = true`. |
| `GET ?offset=5&limit=10` (the "Load more" path) | Returns the remaining 7; `hasMore = false`. |
| `GET /product/:productId/user/:userId` when no review exists | Returns `null`. |
| `recomputeProductRating` after deleting last review | `Product.rating = 0`. |
| `recomputeProductRating` rounding | Reviews `[5,5,4,3]` → avg 4.25 → stored as `4`. |

### Frontend

No frontend test runner is configured in this codebase, and adding one is out of MVP scope. Pre-completion manual verification checklist:

- Logged-out → `ReviewForm` shows the login link.
- Logged-in, no existing review → form renders, submit creates a review, list refetches, `YourReviewPanel` appears.
- Submit with no comment → succeeds.
- Trying to submit twice without deleting → form is hidden; a direct API call returns 409.
- Delete → panel disappears, form reappears, list updates.
- `Product.rating` on the product detail page updates correctly after writes.
- Pagination: "Load more" appends 10; button hides when `hasMore === false`.

## 10. Out of scope (not in this feature)

- Verified-purchase gating
- Admin moderation, review reporting/flagging
- Helpful/unhelpful votes
- Review images
- Merchant replies
- Sort controls beyond "newest first"
- Reviewer display names
- Review edit (replaced by delete-to-recreate)
- Frontend automated tests
- Closing the server-side auth gap (tracked separately)
