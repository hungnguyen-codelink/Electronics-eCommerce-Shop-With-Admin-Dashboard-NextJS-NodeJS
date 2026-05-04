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
    // After deleting the rating-5 review, 12 original seeded reviews remain
    // with ratings [1,2,3,4,5,1,2,3,4,5,1,2], sum = 33
    let p13 = await prisma.product.findUnique({ where: { id: product.id } });
    const expectedAvg13 = Math.round((1 + 2 + 3 + 4 + 5 + 1 + 2 + 3 + 4 + 5 + 1 + 2) / 12);
    assert.strictEqual(p13.rating, expectedAvg13, `Product.rating = ${expectedAvg13}`);
    console.log("✓ delete by author => 200, row gone, rating recomputed");

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
