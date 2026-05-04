# Product Reviews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the minimal product reviews MVP described in `docs/superpowers/specs/2026-05-04-product-reviews-design.md` — star rating + optional comment, one review per user per product, anonymous cards, "Your review" delete panel, recompute the cached `Product.rating` on every write.

**Architecture:** New `Review` Prisma model with `@@unique([productId, userId])`. Express endpoints under `/api/reviews/*` (controllers + routes + a shared `services/productRating.js` recompute helper). Frontend renders reviews as a third tab inside `ProductTabs.tsx` using new components: `StarRating`, `ReviewCard`, `ReviewForm`, `YourReviewPanel`, `ReviewsTab`. Match the existing client-trusts-userId auth pattern; the server-side auth gap is documented in the spec as out of scope.

**Tech Stack:** Prisma 6 + MySQL, Express 4 (`server/`), Next.js 15 + React 18 (`app/`, `components/`), `next-auth` v4, `apiClient` from `lib/api.ts`, `react-hot-toast`, `react-icons/fa`, `date-fns`, `lib/sanitize.ts` for output sanitization.

**Codebase conventions to obey** (recalled from byterover):
- Use the **Prisma singleton** via `require("../utills/db")` in every backend module — never `new PrismaClient()`.
- Wrap every controller with `asyncHandler` from `utills/errorHandler.js` and throw `AppError(message, statusCode)` for typed failures.
- Mount routers in `server/app.js` alongside the existing `app.use("/api/...", ...)` block.
- Match the `controllers/` + `routes/` + `services/` split.
- Backend tests are standalone Node scripts in `server/tests/` (fetch-based smoke tests against `http://localhost:3001`). No framework is configured. We follow that pattern.
- Frontend has no test runner; verify manually per the spec's checklist.

---

## File Manifest

**Create:**
- `server/services/productRating.js` — shared recompute helper.
- `server/controllers/reviews.js` — CRUD handlers.
- `server/routes/reviews.js` — Express router.
- `server/tests/test-reviews-rating-service.js` — service-level smoke test.
- `server/tests/test-reviews-api.js` — full API smoke test.
- `components/StarRating.tsx`
- `components/ReviewCard.tsx`
- `components/ReviewForm.tsx`
- `components/YourReviewPanel.tsx`
- `components/ReviewsTab.tsx`
- `types/review.ts`

**Modify:**
- `prisma/schema.prisma` — add `Review` model + back-relations.
- `server/app.js` — mount reviews router.
- `components/ProductTabs.tsx` — add Reviews tab, remove dead imports.
- `components/index.ts` — export new components.

---

## Task 1: Add `Review` model to Prisma schema and run migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Edit `prisma/schema.prisma` — append the `Review` model and back-relations**

Add this block at the end of the file (after the existing `bulk_upload_item` / enums):

```prisma
model Review {
  id        String   @id @default(uuid())
  productId String
  product   Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  rating    Int
  comment   String?  @db.Text
  createdAt DateTime @default(now())

  @@unique([productId, userId])
  @@index([productId, createdAt])
  @@index([userId])
}
```

Inside the existing `model Product { ... }` block, add this line just below `Wishlist Wishlist[]`:

```prisma
  reviews        Review[]
```

Inside the existing `model User { ... }` block, add this line just below `notifications Notification[]`:

```prisma
  reviews       Review[]
```

- [ ] **Step 2: Run the migration**

Run: `npx prisma migrate dev --name add_review_model`
Expected: Prisma generates a new migration under `prisma/migrations/<timestamp>_add_review_model/migration.sql`, applies it to the dev DB, and regenerates the client. Output ends with `✔ Generated Prisma Client`.

If the dev DB cannot be reached, fall back to `npx prisma db push` and note the failure in the commit message — the project does not gate on every migration being applied in CI. Do not skip schema generation either way.

- [ ] **Step 3: Verify the new Review type exists in the generated client**

Run: `node -e "const p = require('./node_modules/@prisma/client'); console.log(typeof new p.PrismaClient().review)"`
Expected: `object`. If it prints `undefined`, the client wasn't regenerated — re-run `npx prisma generate`.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add Review model with unique (productId, userId)"
```

---

## Task 2: Implement `services/productRating.js` (the recompute helper)

**Files:**
- Create: `server/services/productRating.js`
- Create: `server/tests/test-reviews-rating-service.js`

- [ ] **Step 1: Write the failing test — `server/tests/test-reviews-rating-service.js`**

```js
// Smoke test for recomputeProductRating.
// Requires a working DATABASE_URL. Seeds a test product + reviews,
// runs the service, asserts Product.rating, then cleans up.
const assert = require("assert");
const prisma = require("../utills/db");
const { recomputeProductRating } = require("../services/productRating");

async function withTestProduct(run) {
  const category = await prisma.category.upsert({
    where: { name: "__rating_test_cat__" },
    update: {},
    create: { name: "__rating_test_cat__" },
  });
  const merchant = await prisma.merchant.create({
    data: { name: "__rating_test_merchant__" },
  });
  const product = await prisma.product.create({
    data: {
      slug: `__rating_test_${Date.now()}__`,
      title: "Rating Test Product",
      mainImage: "x.jpg",
      price: 1,
      description: "x",
      manufacturer: "x",
      categoryId: category.id,
      merchantId: merchant.id,
    },
  });
  const userIds = [];
  for (let i = 0; i < 5; i++) {
    const u = await prisma.user.create({
      data: { email: `rating_test_${Date.now()}_${i}@example.com` },
    });
    userIds.push(u.id);
  }
  try {
    await run({ product, userIds });
  } finally {
    await prisma.review.deleteMany({ where: { productId: product.id } });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.merchant.delete({ where: { id: merchant.id } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

(async () => {
  await withTestProduct(async ({ product, userIds }) => {
    // Case 1: no reviews -> rating = 0
    await prisma.$transaction(async (tx) => {
      await recomputeProductRating(product.id, tx);
    });
    let p = await prisma.product.findUnique({ where: { id: product.id } });
    assert.strictEqual(p.rating, 0, "no reviews => rating 0");
    console.log("✓ no reviews => 0");

    // Case 2: ratings [5,5,4,3] -> avg 4.25 -> rounded 4
    const ratings = [5, 5, 4, 3];
    for (let i = 0; i < ratings.length; i++) {
      await prisma.review.create({
        data: { productId: product.id, userId: userIds[i], rating: ratings[i] },
      });
    }
    await prisma.$transaction(async (tx) => {
      await recomputeProductRating(product.id, tx);
    });
    p = await prisma.product.findUnique({ where: { id: product.id } });
    assert.strictEqual(p.rating, 4, "[5,5,4,3] avg 4.25 => 4");
    console.log("✓ [5,5,4,3] => 4");

    // Case 3: delete the lowest, add a 5 -> [5,5,5,4] avg 4.75 => 5
    await prisma.review.delete({
      where: { productId_userId: { productId: product.id, userId: userIds[3] } },
    });
    await prisma.review.create({
      data: { productId: product.id, userId: userIds[4], rating: 5 },
    });
    await prisma.$transaction(async (tx) => {
      await recomputeProductRating(product.id, tx);
    });
    p = await prisma.product.findUnique({ where: { id: product.id } });
    assert.strictEqual(p.rating, 5, "[5,5,5,4] avg 4.75 => 5");
    console.log("✓ [5,5,5,4] => 5");

    // Case 4: delete all -> 0
    await prisma.review.deleteMany({ where: { productId: product.id } });
    await prisma.$transaction(async (tx) => {
      await recomputeProductRating(product.id, tx);
    });
    p = await prisma.product.findUnique({ where: { id: product.id } });
    assert.strictEqual(p.rating, 0, "all deleted => 0");
    console.log("✓ all deleted => 0");
  });

  console.log("\nAll productRating service cases passed.");
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error("✗ test failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node server/tests/test-reviews-rating-service.js`
Expected: FAIL with `Cannot find module '../services/productRating'`.

- [ ] **Step 3: Implement `server/services/productRating.js`**

```js
const prisma = require("../utills/db");

/**
 * Recompute Product.rating as the rounded average of its reviews,
 * or 0 when there are none. Must be called inside a transaction `tx`
 * so the read and write see a consistent snapshot.
 */
async function recomputeProductRating(productId, tx) {
  const client = tx || prisma;
  const result = await client.review.aggregate({
    where: { productId },
    _avg: { rating: true },
    _count: true,
  });
  const newRating = result._count > 0 ? Math.round(result._avg.rating) : 0;
  await client.product.update({
    where: { id: productId },
    data: { rating: newRating },
  });
}

module.exports = { recomputeProductRating };
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `node server/tests/test-reviews-rating-service.js`
Expected: prints `✓ no reviews => 0`, `✓ [5,5,4,3] => 4`, `✓ [5,5,5,4] => 5`, `✓ all deleted => 0`, then `All productRating service cases passed.`

- [ ] **Step 5: Commit**

```bash
git add server/services/productRating.js server/tests/test-reviews-rating-service.js
git commit -m "feat(server): add productRating recompute service with rounding tests"
```

---

## Task 3: Skeleton reviews controller + route + mount, with the GET-list endpoint

**Files:**
- Create: `server/controllers/reviews.js`
- Create: `server/routes/reviews.js`
- Modify: `server/app.js`
- Create: `server/tests/test-reviews-api.js`

- [ ] **Step 1: Write the failing test — `server/tests/test-reviews-api.js`**

This test file will grow across Tasks 3–6. Start with the GET-list cases.

```js
// API smoke test. Assumes the Express server is running on localhost:3001
// (e.g. `npm start` from server/) and DATABASE_URL points at a dev DB.
const assert = require("assert");
const prisma = require("../utills/db");

const BASE = process.env.API_BASE_URL || "http://localhost:3001";

async function seed() {
  const category = await prisma.category.upsert({
    where: { name: "__reviews_api_cat__" },
    update: {},
    create: { name: "__reviews_api_cat__" },
  });
  const merchant = await prisma.merchant.create({
    data: { name: "__reviews_api_merchant__" },
  });
  const product = await prisma.product.create({
    data: {
      slug: `__reviews_api_${Date.now()}__`,
      title: "Reviews API Product",
      mainImage: "x.jpg",
      price: 1,
      description: "x",
      manufacturer: "x",
      categoryId: category.id,
      merchantId: merchant.id,
    },
  });
  const users = [];
  for (let i = 0; i < 14; i++) {
    users.push(
      await prisma.user.create({
        data: { email: `reviews_api_${Date.now()}_${i}@example.com` },
      })
    );
  }
  return { category, merchant, product, users };
}

async function cleanup({ product, merchant, users }) {
  await prisma.review.deleteMany({ where: { productId: product.id } });
  await prisma.product.delete({ where: { id: product.id } });
  await prisma.merchant.delete({ where: { id: merchant.id } });
  await prisma.user.deleteMany({
    where: { id: { in: users.map((u) => u.id) } },
  });
}

async function run() {
  const ctx = await seed();
  const { product, users } = ctx;
  try {
    // Pre-seed 12 reviews so we can test pagination.
    for (let i = 0; i < 12; i++) {
      await prisma.review.create({
        data: {
          productId: product.id,
          userId: users[i].id,
          rating: ((i % 5) + 1),
          comment: `seed comment #${i}`,
        },
      });
    }

    // Case 1: offset=0, limit=5 => 5 reviews, total 12, hasMore true
    let r = await fetch(
      `${BASE}/api/reviews/product/${product.id}?offset=0&limit=5`
    );
    let body = await r.json();
    assert.strictEqual(r.status, 200, "list ok");
    assert.strictEqual(body.reviews.length, 5, "5 returned");
    assert.strictEqual(body.total, 12, "total 12");
    assert.strictEqual(body.hasMore, true, "hasMore true");
    console.log("✓ list page 1 (5 of 12)");

    // Case 2: offset=5, limit=10 => last 7 returned, hasMore false
    r = await fetch(
      `${BASE}/api/reviews/product/${product.id}?offset=5&limit=10`
    );
    body = await r.json();
    assert.strictEqual(body.reviews.length, 7, "7 remaining");
    assert.strictEqual(body.hasMore, false, "hasMore false");
    console.log("✓ list page 2 (rest)");

    // Case 3: missing product => 404
    r = await fetch(`${BASE}/api/reviews/product/does-not-exist`);
    assert.strictEqual(r.status, 404, "missing product 404");
    console.log("✓ list missing product => 404");
  } finally {
    await cleanup(ctx);
    await prisma.$disconnect();
  }
}

run()
  .then(() => console.log("\nAll reviews API list cases passed."))
  .catch(async (e) => {
    console.error("✗ test failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Start the server in another terminal: `cd server && npm start`
Then: `node server/tests/test-reviews-api.js`
Expected: FAIL with 404 on `/api/reviews/...` (route not mounted yet).

- [ ] **Step 3: Implement `server/controllers/reviews.js` — start with the list handler only**

```js
const prisma = require("../utills/db");
const { asyncHandler, AppError } = require("../utills/errorHandler");
const { recomputeProductRating } = require("../services/productRating");

const MAX_LIMIT = 50;
const MAX_COMMENT_LEN = 2000;

function parseNonNegativeInt(value, fallback) {
  if (value === undefined || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

const listReviewsForProduct = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const offset = parseNonNegativeInt(req.query.offset, 0);
  const limitRaw = parseNonNegativeInt(req.query.limit, 10);
  if (offset === null || limitRaw === null) {
    throw new AppError("offset and limit must be non-negative integers", 400);
  }
  const limit = Math.min(limitRaw, MAX_LIMIT);

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new AppError("Product not found", 404);

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where: { productId },
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        userId: true,
      },
    }),
    prisma.review.count({ where: { productId } }),
  ]);

  res.json({
    reviews,
    total,
    offset,
    limit,
    hasMore: offset + reviews.length < total,
  });
});

module.exports = {
  listReviewsForProduct,
};
```

- [ ] **Step 4: Implement `server/routes/reviews.js`**

```js
const express = require("express");
const router = express.Router();
const { listReviewsForProduct } = require("../controllers/reviews");

router.get("/product/:productId", listReviewsForProduct);

module.exports = router;
```

- [ ] **Step 5: Mount the router in `server/app.js`**

In `server/app.js`, find the block of `app.use("/api/...", ...)` route mounts (around line 121–133). Add the import alongside the existing imports near the top:

```js
const reviewsRouter = require("./routes/reviews");
```

And mount it next to the others:

```js
app.use("/api/reviews", reviewsRouter);
```

- [ ] **Step 6: Restart the server and re-run the test**

Stop and restart the server (Ctrl+C in the server terminal, then `npm start`).
Run: `node server/tests/test-reviews-api.js`
Expected: prints `✓ list page 1 (5 of 12)`, `✓ list page 2 (rest)`, `✓ list missing product => 404`, then `All reviews API list cases passed.`

- [ ] **Step 7: Commit**

```bash
git add server/controllers/reviews.js server/routes/reviews.js server/app.js server/tests/test-reviews-api.js
git commit -m "feat(server): GET /api/reviews/product/:productId paginated list"
```

---

## Task 4: GET the current user's review for a product

**Files:**
- Modify: `server/controllers/reviews.js`
- Modify: `server/routes/reviews.js`
- Modify: `server/tests/test-reviews-api.js`

- [ ] **Step 1: Append the failing test cases to `server/tests/test-reviews-api.js`**

Inside the `try { ... }` block of `run()`, after the existing list cases, add:

```js
    // Case 4: user's review when none exists => null
    r = await fetch(
      `${BASE}/api/reviews/product/${product.id}/user/${users[12].id}`
    );
    body = await r.json();
    assert.strictEqual(r.status, 200, "user-review ok");
    assert.strictEqual(body.review, null, "no review => null");
    console.log("✓ user review null when none exists");

    // Case 5: user's review when one exists => returned
    // users[0] was seeded with rating=1, comment "seed comment #0"
    r = await fetch(
      `${BASE}/api/reviews/product/${product.id}/user/${users[0].id}`
    );
    body = await r.json();
    assert.strictEqual(r.status, 200);
    assert.ok(body.review, "review present");
    assert.strictEqual(body.review.rating, 1);
    assert.strictEqual(body.review.comment, "seed comment #0");
    console.log("✓ user review returned when present");
```

- [ ] **Step 2: Run the test — expect FAIL**

Run: `node server/tests/test-reviews-api.js`
Expected: 404 on `/api/reviews/product/.../user/...` (handler not implemented).

- [ ] **Step 3: Add the handler to `server/controllers/reviews.js`**

Add this function above `module.exports`:

```js
const getUserReviewForProduct = asyncHandler(async (req, res) => {
  const { productId, userId } = req.params;
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new AppError("Product not found", 404);

  const review = await prisma.review.findUnique({
    where: { productId_userId: { productId, userId } },
    select: {
      id: true,
      rating: true,
      comment: true,
      createdAt: true,
      userId: true,
    },
  });

  res.json({ review: review || null });
});
```

Update the `module.exports` to include it:

```js
module.exports = {
  listReviewsForProduct,
  getUserReviewForProduct,
};
```

- [ ] **Step 4: Add the route to `server/routes/reviews.js`**

Update the file to:

```js
const express = require("express");
const router = express.Router();
const {
  listReviewsForProduct,
  getUserReviewForProduct,
} = require("../controllers/reviews");

router.get("/product/:productId", listReviewsForProduct);
router.get("/product/:productId/user/:userId", getUserReviewForProduct);

module.exports = router;
```

- [ ] **Step 5: Restart the server and re-run the test — expect PASS**

Run: `node server/tests/test-reviews-api.js`
Expected: previous cases still pass plus `✓ user review null when none exists` and `✓ user review returned when present`.

- [ ] **Step 6: Commit**

```bash
git add server/controllers/reviews.js server/routes/reviews.js server/tests/test-reviews-api.js
git commit -m "feat(server): GET /api/reviews/product/:productId/user/:userId"
```

---

## Task 5: POST `/api/reviews` — create a review (with transactional rating recompute)

**Files:**
- Modify: `server/controllers/reviews.js`
- Modify: `server/routes/reviews.js`
- Modify: `server/tests/test-reviews-api.js`

- [ ] **Step 1: Append the failing test cases**

Inside the `try { ... }` block in `server/tests/test-reviews-api.js`, after the user-review cases, add:

```js
    // Case 6: create with valid body (users[12] has not reviewed yet) => 201
    r = await fetch(`${BASE}/api/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: product.id,
        userId: users[12].id,
        rating: 5,
        comment: "Great product",
      }),
    });
    body = await r.json();
    assert.strictEqual(r.status, 201, `expected 201, got ${r.status}: ${JSON.stringify(body)}`);
    assert.ok(body.review.id, "id returned");
    assert.strictEqual(body.review.rating, 5);
    console.log("✓ create returns 201");

    // Case 7: Product.rating recomputed
    let p = await prisma.product.findUnique({ where: { id: product.id } });
    // 12 seeded ratings (1..5 cycling) + the new 5 => 13 reviews
    const expectedAvg = Math.round(
      (1 + 2 + 3 + 4 + 5 + 1 + 2 + 3 + 4 + 5 + 1 + 2 + 5) / 13
    );
    assert.strictEqual(p.rating, expectedAvg, `Product.rating = ${expectedAvg}`);
    console.log("✓ Product.rating recomputed after create");

    // Case 8: rating out of range => 400
    r = await fetch(`${BASE}/api/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: product.id,
        userId: users[13].id,
        rating: 6,
      }),
    });
    assert.strictEqual(r.status, 400);
    console.log("✓ rating=6 => 400");

    // Case 9: missing user => 404
    r = await fetch(`${BASE}/api/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: product.id,
        userId: "nope",
        rating: 4,
      }),
    });
    assert.strictEqual(r.status, 404);
    console.log("✓ unknown userId => 404");

    // Case 10: duplicate (users[12] already reviewed) => 409
    r = await fetch(`${BASE}/api/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: product.id,
        userId: users[12].id,
        rating: 4,
        comment: "again",
      }),
    });
    assert.strictEqual(r.status, 409);
    console.log("✓ duplicate review => 409");

    // Case 11: oversize comment => 400
    r = await fetch(`${BASE}/api/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: product.id,
        userId: users[13].id,
        rating: 4,
        comment: "x".repeat(2001),
      }),
    });
    assert.strictEqual(r.status, 400);
    console.log("✓ comment > 2000 chars => 400");
```

- [ ] **Step 2: Run the test — expect FAIL**

Run: `node server/tests/test-reviews-api.js`
Expected: 404 on `POST /api/reviews` (handler not implemented).

- [ ] **Step 3: Add `createReview` to `server/controllers/reviews.js`**

Add above `module.exports`:

```js
const createReview = asyncHandler(async (req, res) => {
  const { productId, userId, rating, comment } = req.body || {};

  if (!productId || typeof productId !== "string") {
    throw new AppError("productId is required", 400);
  }
  if (!userId || typeof userId !== "string") {
    throw new AppError("userId is required", 400);
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new AppError("Rating must be an integer between 1 and 5", 400);
  }
  if (comment !== undefined && comment !== null) {
    if (typeof comment !== "string") {
      throw new AppError("Comment must be a string", 400);
    }
    if (comment.length > MAX_COMMENT_LEN) {
      throw new AppError("Comment too long", 400);
    }
  }

  const [product, user] = await Promise.all([
    prisma.product.findUnique({ where: { id: productId } }),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);
  if (!product) throw new AppError("Product not found", 404);
  if (!user) throw new AppError("User not found", 404);

  const existing = await prisma.review.findUnique({
    where: { productId_userId: { productId, userId } },
  });
  if (existing) {
    throw new AppError("You have already reviewed this product", 409);
  }

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const row = await tx.review.create({
        data: {
          productId,
          userId,
          rating,
          comment: comment ? comment.trim() : null,
        },
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          userId: true,
        },
      });
      await recomputeProductRating(productId, tx);
      return row;
    });
  } catch (err) {
    // Race: another request inserted between the pre-check and the create.
    if (err && err.code === "P2002") {
      throw new AppError("You have already reviewed this product", 409);
    }
    throw err;
  }

  res.status(201).json({ review: created });
});
```

Update `module.exports`:

```js
module.exports = {
  listReviewsForProduct,
  getUserReviewForProduct,
  createReview,
};
```

- [ ] **Step 4: Add the route**

Update `server/routes/reviews.js`:

```js
const express = require("express");
const router = express.Router();
const {
  listReviewsForProduct,
  getUserReviewForProduct,
  createReview,
} = require("../controllers/reviews");

router.post("/", createReview);
router.get("/product/:productId", listReviewsForProduct);
router.get("/product/:productId/user/:userId", getUserReviewForProduct);

module.exports = router;
```

- [ ] **Step 5: Restart the server and re-run the test — expect PASS**

Run: `node server/tests/test-reviews-api.js`
Expected: prior cases pass plus `✓ create returns 201`, `✓ Product.rating recomputed after create`, `✓ rating=6 => 400`, `✓ unknown userId => 404`, `✓ duplicate review => 409`, `✓ comment > 2000 chars => 400`.

- [ ] **Step 6: Commit**

```bash
git add server/controllers/reviews.js server/routes/reviews.js server/tests/test-reviews-api.js
git commit -m "feat(server): POST /api/reviews with transactional rating recompute"
```

---

## Task 6: DELETE `/api/reviews/:id` (with ownership check)

**Files:**
- Modify: `server/controllers/reviews.js`
- Modify: `server/routes/reviews.js`
- Modify: `server/tests/test-reviews-api.js`

- [ ] **Step 1: Append the failing test cases**

Inside the `try { ... }` block, after the create cases:

```js
    // Capture the freshly created review id for delete cases.
    let listResp = await fetch(
      `${BASE}/api/reviews/product/${product.id}/user/${users[12].id}`
    );
    const userReview = (await listResp.json()).review;
    assert.ok(userReview && userReview.id, "user review present for delete");

    // Case 12: delete by a different user => 403, row remains.
    r = await fetch(`${BASE}/api/reviews/${userReview.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: users[0].id }),
    });
    assert.strictEqual(r.status, 403);
    let stillThere = await prisma.review.findUnique({
      where: { id: userReview.id },
    });
    assert.ok(stillThere, "review still present after 403");
    console.log("✓ delete by other user => 403");

    // Case 13: delete by author => 200, row gone, rating recomputed.
    r = await fetch(`${BASE}/api/reviews/${userReview.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: users[12].id }),
    });
    assert.strictEqual(r.status, 200);
    stillThere = await prisma.review.findUnique({
      where: { id: userReview.id },
    });
    assert.strictEqual(stillThere, null);
    console.log("✓ delete by author => 200, row gone");

    // Case 14: missing review => 404.
    r = await fetch(`${BASE}/api/reviews/does-not-exist`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: users[12].id }),
    });
    assert.strictEqual(r.status, 404);
    console.log("✓ delete missing review => 404");

    // Case 15: delete-then-recreate flow (Q4 acceptance test).
    // users[12] just deleted their review; they should be able to post a new one.
    r = await fetch(`${BASE}/api/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: product.id,
        userId: users[12].id,
        rating: 3,
        comment: "second take",
      }),
    });
    assert.strictEqual(r.status, 201);
    console.log("✓ delete-then-recreate succeeds");
```

- [ ] **Step 2: Run the test — expect FAIL**

Run: `node server/tests/test-reviews-api.js`
Expected: 404 on `DELETE /api/reviews/:id` (handler not implemented).

- [ ] **Step 3: Add `deleteReview` to `server/controllers/reviews.js`**

Above `module.exports`:

```js
const deleteReview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { userId } = req.body || {};

  if (!userId || typeof userId !== "string") {
    throw new AppError("userId is required", 400);
  }

  const review = await prisma.review.findUnique({ where: { id } });
  if (!review) throw new AppError("Review not found", 404);
  if (review.userId !== userId) {
    throw new AppError("You can only delete your own review", 403);
  }

  await prisma.$transaction(async (tx) => {
    await tx.review.delete({ where: { id } });
    await recomputeProductRating(review.productId, tx);
  });

  res.status(200).json({ ok: true });
});
```

Update `module.exports`:

```js
module.exports = {
  listReviewsForProduct,
  getUserReviewForProduct,
  createReview,
  deleteReview,
};
```

- [ ] **Step 4: Add the route**

Update `server/routes/reviews.js`:

```js
const express = require("express");
const router = express.Router();
const {
  listReviewsForProduct,
  getUserReviewForProduct,
  createReview,
  deleteReview,
} = require("../controllers/reviews");

router.post("/", createReview);
router.get("/product/:productId", listReviewsForProduct);
router.get("/product/:productId/user/:userId", getUserReviewForProduct);
router.delete("/:id", deleteReview);

module.exports = router;
```

- [ ] **Step 5: Restart the server and re-run the test — expect PASS**

Run: `node server/tests/test-reviews-api.js`
Expected: all 15 cases print `✓` and the script ends with `All reviews API list cases passed.`

- [ ] **Step 6: Commit**

```bash
git add server/controllers/reviews.js server/routes/reviews.js server/tests/test-reviews-api.js
git commit -m "feat(server): DELETE /api/reviews/:id with ownership check"
```

---

## Task 7: Frontend — `Review` type definition

**Files:**
- Create: `types/review.ts`

- [ ] **Step 1: Create `types/review.ts`**

```ts
export interface Review {
  id: string;
  rating: number; // 1..5
  comment: string | null;
  createdAt: string; // ISO timestamp
  userId: string;
}

export interface ReviewListResponse {
  reviews: Review[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface UserReviewResponse {
  review: Review | null;
}

export interface CreateReviewPayload {
  productId: string;
  userId: string;
  rating: number;
  comment?: string;
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors involving `types/review.ts`.

- [ ] **Step 3: Commit**

```bash
git add types/review.ts
git commit -m "feat(types): add Review type definitions"
```

---

## Task 8: Frontend — `StarRating.tsx` (presentational + interactive)

**Files:**
- Create: `components/StarRating.tsx`

- [ ] **Step 1: Create `components/StarRating.tsx`**

```tsx
"use client";

import React, { useState } from "react";
import { FaStar, FaRegStar } from "react-icons/fa";

interface StarRatingProps {
  value: number; // 0..5
  interactive?: boolean;
  onChange?: (value: number) => void;
  size?: number; // px
  ariaLabel?: string;
}

const StarRating: React.FC<StarRatingProps> = ({
  value,
  interactive = false,
  onChange,
  size = 20,
  ariaLabel,
}) => {
  const [hover, setHover] = useState<number | null>(null);
  const display = hover ?? value;

  const stars = [1, 2, 3, 4, 5].map((n) => {
    const filled = n <= display;
    const Icon = filled ? FaStar : FaRegStar;
    const common = {
      size,
      style: { color: filled ? "#facc15" : "#9ca3af" },
    };
    if (interactive) {
      return (
        <button
          key={n}
          type="button"
          aria-label={`Rate ${n} star${n === 1 ? "" : "s"}`}
          onClick={() => onChange?.(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(null)}
          className="p-0.5 cursor-pointer"
        >
          <Icon {...common} />
        </button>
      );
    }
    return <Icon key={n} {...common} />;
  });

  return (
    <div
      role={interactive ? "radiogroup" : "img"}
      aria-label={ariaLabel || `Rated ${value} out of 5`}
      className="inline-flex items-center gap-0.5"
    >
      {stars}
    </div>
  );
};

export default StarRating;
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/StarRating.tsx
git commit -m "feat(ui): add StarRating component (display + interactive)"
```

---

## Task 9: Frontend — `ReviewCard.tsx`

**Files:**
- Create: `components/ReviewCard.tsx`

- [ ] **Step 1: Create `components/ReviewCard.tsx`**

```tsx
"use client";

import React from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import StarRating from "./StarRating";
import { sanitize } from "@/lib/sanitize";
import type { Review } from "@/types/review";

const ReviewCard: React.FC<{ review: Review }> = ({ review }) => {
  let when = "";
  try {
    when = formatDistanceToNow(parseISO(review.createdAt), { addSuffix: true });
  } catch {
    when = review.createdAt;
  }

  return (
    <article className="border-b border-gray-200 py-4">
      <div className="flex items-center justify-between">
        <StarRating value={review.rating} size={16} />
        <time className="text-sm text-gray-500">{when}</time>
      </div>
      {review.comment ? (
        <p className="mt-2 whitespace-pre-line text-base text-gray-800">
          {sanitize(review.comment)}
        </p>
      ) : null}
    </article>
  );
};

export default ReviewCard;
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/ReviewCard.tsx
git commit -m "feat(ui): add anonymous ReviewCard"
```

---

## Task 10: Frontend — `ReviewForm.tsx`

**Files:**
- Create: `components/ReviewForm.tsx`

- [ ] **Step 1: Create `components/ReviewForm.tsx`**

```tsx
"use client";

import React, { useState } from "react";
import toast from "react-hot-toast";
import StarRating from "./StarRating";
import apiClient from "@/lib/api";
import type { Review } from "@/types/review";

interface Props {
  productId: string;
  userId: string;
  onCreated: (review: Review) => void;
}

const MAX_COMMENT = 2000;

const ReviewForm: React.FC<Props> = ({ productId, userId, onCreated }) => {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1) {
      toast.error("Please pick a star rating.");
      return;
    }
    if (comment.length > MAX_COMMENT) {
      toast.error(`Comment is too long (${comment.length}/${MAX_COMMENT}).`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiClient.post("/api/reviews", {
        productId,
        userId,
        rating,
        comment: comment.trim() || undefined,
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body?.error || "Failed to post review");
        return;
      }
      toast.success("Review posted");
      setRating(0);
      setComment("");
      onCreated(body.review);
    } catch {
      toast.error("Network error — try again");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded border border-gray-200 p-4">
      <h3 className="text-lg font-medium">Write a review</h3>
      <div className="mt-2">
        <StarRating
          value={rating}
          interactive
          onChange={setRating}
          size={24}
        />
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Optional: share your experience…"
        maxLength={MAX_COMMENT}
        rows={4}
        className="mt-2 w-full rounded border border-gray-300 p-2 text-base"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm text-gray-500">
          {comment.length}/{MAX_COMMENT}
        </span>
        <button
          type="submit"
          disabled={submitting || rating < 1}
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {submitting ? "Posting…" : "Post review"}
        </button>
      </div>
    </form>
  );
};

export default ReviewForm;
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/ReviewForm.tsx
git commit -m "feat(ui): add ReviewForm with star picker and validation"
```

---

## Task 11: Frontend — `YourReviewPanel.tsx`

**Files:**
- Create: `components/YourReviewPanel.tsx`

- [ ] **Step 1: Create `components/YourReviewPanel.tsx`**

```tsx
"use client";

import React, { useState } from "react";
import toast from "react-hot-toast";
import { formatDistanceToNow, parseISO } from "date-fns";
import StarRating from "./StarRating";
import apiClient from "@/lib/api";
import { sanitize } from "@/lib/sanitize";
import type { Review } from "@/types/review";

interface Props {
  review: Review;
  userId: string;
  onDeleted: () => void;
}

const YourReviewPanel: React.FC<Props> = ({ review, userId, onDeleted }) => {
  const [busy, setBusy] = useState(false);

  let when = "";
  try {
    when = formatDistanceToNow(parseISO(review.createdAt), { addSuffix: true });
  } catch {
    when = review.createdAt;
  }

  const onDelete = async () => {
    if (!confirm("Delete your review?")) return;
    setBusy(true);
    try {
      const res = await apiClient.delete(`/api/reviews/${review.id}`, {
        body: JSON.stringify({ userId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error || "Failed to delete review");
        return;
      }
      toast.success("Review deleted");
      onDeleted();
    } catch {
      toast.error("Network error — try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded border border-blue-200 bg-blue-50 p-4">
      <header className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Your review</h3>
        <time className="text-sm text-gray-500">{when}</time>
      </header>
      <div className="mt-2">
        <StarRating value={review.rating} size={18} />
      </div>
      {review.comment ? (
        <p className="mt-2 whitespace-pre-line text-base text-gray-800">
          {sanitize(review.comment)}
        </p>
      ) : null}
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="rounded border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-100 disabled:opacity-50"
        >
          {busy ? "Deleting…" : "Delete review"}
        </button>
      </div>
    </section>
  );
};

export default YourReviewPanel;
```

Note about `apiClient.delete`: looking at `lib/api.ts`, the `delete` method accepts `(endpoint, options?)` and forwards `options` to `fetch`. Passing `body` in `options` works against Express's `express.json()` body parser. If `apiClient.delete` rejects a `body` field at the type level, fall back to:

```ts
const res = await apiClient.request(`/api/reviews/${review.id}`, {
  method: "DELETE",
  body: JSON.stringify({ userId }),
});
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors. If a type error appears on `apiClient.delete({ body })`, switch to the `apiClient.request` form shown above.

- [ ] **Step 3: Commit**

```bash
git add components/YourReviewPanel.tsx
git commit -m "feat(ui): add YourReviewPanel with delete affordance"
```

---

## Task 12: Frontend — `ReviewsTab.tsx` container

**Files:**
- Create: `components/ReviewsTab.tsx`

- [ ] **Step 1: Create `components/ReviewsTab.tsx`**

```tsx
"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import apiClient from "@/lib/api";
import ReviewCard from "./ReviewCard";
import ReviewForm from "./ReviewForm";
import YourReviewPanel from "./YourReviewPanel";
import type {
  Review,
  ReviewListResponse,
  UserReviewResponse,
} from "@/types/review";

interface Props {
  productId: string;
}

const FIRST_PAGE_LIMIT = 5;
const LOAD_MORE_LIMIT = 10;

const ReviewsTab: React.FC<Props> = ({ productId }) => {
  const { data: session, status } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  const [reviews, setReviews] = useState<Review[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [yourReview, setYourReview] = useState<Review | null>(null);
  const [loadingYours, setLoadingYours] = useState(false);

  const fetchPage = useCallback(
    async (offset: number, limit: number, append: boolean) => {
      const res = await apiClient.get(
        `/api/reviews/product/${productId}?offset=${offset}&limit=${limit}`
      );
      const body: ReviewListResponse = await res.json();
      if (!res.ok) {
        toast.error(
          (body as unknown as { error?: string })?.error || "Failed to load reviews"
        );
        return;
      }
      setTotal(body.total);
      setHasMore(body.hasMore);
      setReviews((prev) =>
        append ? [...prev, ...body.reviews] : body.reviews
      );
    },
    [productId]
  );

  const fetchYourReview = useCallback(
    async (uid: string) => {
      setLoadingYours(true);
      try {
        const res = await apiClient.get(
          `/api/reviews/product/${productId}/user/${uid}`
        );
        const body: UserReviewResponse = await res.json();
        if (res.ok) setYourReview(body.review);
      } finally {
        setLoadingYours(false);
      }
    },
    [productId]
  );

  // Initial load.
  useEffect(() => {
    setLoadingList(true);
    fetchPage(0, FIRST_PAGE_LIMIT, false).finally(() => setLoadingList(false));
  }, [fetchPage]);

  // Your-review load when session resolves.
  useEffect(() => {
    if (status === "authenticated" && userId) {
      fetchYourReview(userId);
    } else if (status === "unauthenticated") {
      setYourReview(null);
    }
  }, [status, userId, fetchYourReview]);

  const onLoadMore = async () => {
    setLoadingMore(true);
    await fetchPage(reviews.length, LOAD_MORE_LIMIT, true);
    setLoadingMore(false);
  };

  const refreshAfterWrite = async () => {
    setLoadingList(true);
    await fetchPage(0, FIRST_PAGE_LIMIT, false);
    setLoadingList(false);
    if (userId) await fetchYourReview(userId);
  };

  return (
    <div className="space-y-4 pb-8">
      {status === "authenticated" && userId && yourReview ? (
        <YourReviewPanel
          review={yourReview}
          userId={userId}
          onDeleted={refreshAfterWrite}
        />
      ) : null}

      {status === "authenticated" && userId && !yourReview && !loadingYours ? (
        <ReviewForm
          productId={productId}
          userId={userId}
          onCreated={refreshAfterWrite}
        />
      ) : null}

      {status === "unauthenticated" ? (
        <p className="text-base">
          <Link href="/login" className="text-blue-600 underline">
            Log in
          </Link>{" "}
          to write a review.
        </p>
      ) : null}

      <div>
        <h3 className="text-lg font-medium">
          {total > 0 ? `${total} review${total === 1 ? "" : "s"}` : "Reviews"}
        </h3>
        {loadingList ? (
          <p className="mt-2 text-sm text-gray-500">Loading reviews…</p>
        ) : reviews.length === 0 ? (
          <p className="mt-2 text-base text-gray-600">
            No reviews yet — be the first to review this product.
          </p>
        ) : (
          <div>
            {reviews.map((r) => (
              <ReviewCard key={r.id} review={r} />
            ))}
            {hasMore ? (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={onLoadMore}
                  disabled={loadingMore}
                  className="rounded border border-gray-300 px-4 py-2 text-base disabled:opacity-50"
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReviewsTab;
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors. If TypeScript complains that `session.user.id` doesn't exist on the default `next-auth` `Session` type, that's expected — the codebase already passes `userId` in other places. Either:
- Cast as shown above (`session?.user as { id?: string } | undefined`), or
- Fall back to using `session?.user?.email` and resolve to id via an existing endpoint. The cast is fine for now and matches how other components in this codebase work.

- [ ] **Step 3: Commit**

```bash
git add components/ReviewsTab.tsx
git commit -m "feat(ui): add ReviewsTab container wiring form, panel, list, pagination"
```

---

## Task 13: Wire `ReviewsTab` into `ProductTabs.tsx` and update `components/index.ts`

**Files:**
- Modify: `components/ProductTabs.tsx`
- Modify: `components/index.ts`

- [ ] **Step 1: Replace `components/ProductTabs.tsx` entirely**

Overwrite the file with this content. The dead `RatingPercentElement` and `SingleReview` imports are removed; a new third tab "Reviews" is added.

```tsx
"use client";

import React, { useState } from "react";
import { formatCategoryName } from "@/utils/categoryFormating";
import { sanitize, sanitizeHtml } from "@/lib/sanitize";
import ReviewsTab from "./ReviewsTab";

const ProductTabs = ({ product }: { product: Product }) => {
  const [currentProductTab, setCurrentProductTab] = useState<number>(0);

  const tabClass = (active: boolean) =>
    `tab text-lg text-black pb-8 max-[500px]:text-base max-[400px]:text-sm max-[370px]:text-xs ${
      active ? "tab-active" : ""
    }`;

  return (
    <div className="px-5 text-black">
      <div role="tablist" className="tabs tabs-bordered">
        <a
          role="tab"
          className={tabClass(currentProductTab === 0)}
          onClick={() => setCurrentProductTab(0)}
        >
          Description
        </a>
        <a
          role="tab"
          className={tabClass(currentProductTab === 1)}
          onClick={() => setCurrentProductTab(1)}
        >
          Additional info
        </a>
        <a
          role="tab"
          className={tabClass(currentProductTab === 2)}
          onClick={() => setCurrentProductTab(2)}
        >
          Reviews
        </a>
      </div>
      <div className="pt-5">
        {currentProductTab === 0 && (
          <div
            className="text-lg max-sm:text-base max-sm:text-sm"
            dangerouslySetInnerHTML={{
              __html: sanitizeHtml(product?.description),
            }}
          />
        )}

        {currentProductTab === 1 && (
          <div className="overflow-x-auto">
            <table className="table text-xl text-center max-[500px]:text-base">
              <tbody>
                <tr>
                  <th>Manufacturer:</th>
                  <td>{sanitize(product?.manufacturer)}</td>
                </tr>
                <tr>
                  <th>Category:</th>
                  <td>
                    {product?.category?.name
                      ? sanitize(formatCategoryName(product?.category?.name))
                      : "No category"}
                  </td>
                </tr>
                <tr>
                  <th>Color:</th>
                  <td>Silver, LightSlateGray, Blue</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {currentProductTab === 2 && product?.id ? (
          <ReviewsTab productId={product.id} />
        ) : null}
      </div>
    </div>
  );
};

export default ProductTabs;
```

- [ ] **Step 2: Update `components/index.ts` — add the new exports**

Add these lines next to the existing `ProductTabs` export:

```ts
export { default as ReviewsTab } from "./ReviewsTab";
export { default as ReviewCard } from "./ReviewCard";
export { default as ReviewForm } from "./ReviewForm";
export { default as YourReviewPanel } from "./YourReviewPanel";
export { default as StarRating } from "./StarRating";
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors. If the `Product` type in scope here doesn't include `id`, check `typings.d.ts` and either add `id: string` if missing or rely on the inferred shape from the API.

- [ ] **Step 4: Build a clean dev bundle to surface runtime issues**

Run: `npm run build`
Expected: build completes; if it fails on something pre-existing (unrelated to the new code), record the failure and proceed — but new errors must be fixed.

- [ ] **Step 5: Commit**

```bash
git add components/ProductTabs.tsx components/index.ts
git commit -m "feat(ui): mount Reviews tab in ProductTabs and remove dead imports"
```

---

## Task 14: Manual verification + completion commit

**No code changes — this is the spec's manual verification checklist (Section 9).**

- [ ] **Step 1: Start both processes**

Terminal 1: `cd server && npm start` (Express on `:3001`).
Terminal 2: `npm run dev` (Next.js on `:3000`).

- [ ] **Step 2: Walk through the verification checklist**

Open any product detail page in the browser and the "Reviews" tab. Verify each:

1. **Logged-out** → Reviews tab shows "Log in to write a review" link to `/login`.
2. **Logged-in, no existing review** → `ReviewForm` renders. Pick 4 stars, type "nice", click "Post review". Toast: "Review posted". `YourReviewPanel` appears at the top, the new review shows in the list, list count updates.
3. **Submit with no comment** → after deleting and re-posting with rating only and empty textarea, succeeds. The card shows just stars + date.
4. **Try to submit twice** → after posting, `ReviewForm` is hidden (panel is shown instead). Open the network panel and direct-POST `/api/reviews` with the same `userId` + `productId` — server returns **409**.
5. **Delete** → click "Delete review" in `YourReviewPanel`, confirm. Toast: "Review deleted". Panel disappears. `ReviewForm` reappears. List updates.
6. **Aggregate rating** → reload the product detail page after a write. The `Product.rating` field used elsewhere on the page reflects the rounded average.
7. **Pagination** → with 12+ reviews on a single product (use the seeded test data, or seed manually via direct API calls), the first paint shows 5 reviews and a "Load more" button. Click it; 10 more append. After all are loaded, the button hides.

- [ ] **Step 3: Verify pre-existing bulk-upload tests still run (regression sanity)**

Run: `node server/tests/test-create-product.js`
Expected: passes against the running server (`✅ Product created successfully!`).

- [ ] **Step 4: Final commit**

If any tweaks were needed during verification (a styling fix, a missing `Product.id` type), include them. Otherwise this step has nothing to commit and can be skipped.

```bash
git status
# If there are changes:
git add <changed files>
git commit -m "chore(reviews): manual-verification fixes"
```

---

## Self-Review (already performed by author)

- **Spec coverage**:
  - Data model (Section 3 of spec) → Task 1.
  - Backend service (Section 4) → Task 2.
  - Endpoints (Section 4) → Tasks 3, 4, 5, 6 (one per endpoint).
  - Frontend components (Section 5) → Tasks 7–12 (one per component).
  - Integration into product page (Section 5) → Task 13.
  - Error handling matrix (Section 6) → covered by negative cases in Tasks 3, 5, 6.
  - Edge cases (Section 7): rounding & empty review set covered in Task 2 tests; cascade-on-product/user-delete relies on Prisma schema set up in Task 1; concurrent-recompute is covered by the `prisma.$transaction` wrapper used in Tasks 5 and 6.
  - Known limitations (Section 8): auth gap is documented in the spec and explicitly accepted; no plan task is required.
  - Backend tests (Section 9) → Tasks 2, 3, 4, 5, 6 each add their own assertions.
  - Frontend manual verification (Section 9) → Task 14.
- **Placeholder scan**: every step contains either explicit code or an exact command. The only "if it fails, do X" branches are the migration fallback (Task 1 Step 2) and the type-cast fallback (Tasks 11, 12) — both spelled out, not deferred.
- **Type consistency**: `Review` shape is identical across `types/review.ts`, the controller's `select`, and the test assertions (`id`, `rating`, `comment`, `createdAt`, `userId`). Endpoint paths agree across `routes/reviews.js`, the test file, and the frontend (`/api/reviews`, `/api/reviews/product/:productId`, `/api/reviews/product/:productId/user/:userId`, `/api/reviews/:id`). Pagination params (`offset`, `limit`) match the spec.
