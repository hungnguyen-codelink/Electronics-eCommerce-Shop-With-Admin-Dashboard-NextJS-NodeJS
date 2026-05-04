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
