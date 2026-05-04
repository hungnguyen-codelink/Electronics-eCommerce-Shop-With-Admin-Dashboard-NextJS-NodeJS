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
