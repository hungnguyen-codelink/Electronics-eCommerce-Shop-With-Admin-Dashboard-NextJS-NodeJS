// Mock data seed for the product reviews feature.
// Idempotent: re-runs replace the mock reviews and reset Product.rating.
// Run from repo root with the host DB URL:
//   DATABASE_URL="mysql://root:dockerpass@127.0.0.1:3306/electronics_db" \
//     node server/scripts/seed-reviews-mock.js

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const prisma = require("../utills/db");
const {
  recomputeProductRating,
} = require("../services/productRating");

const CATEGORY_NAME = "mock-electronics";
const MERCHANT_NAME = "Mock Electronics Co.";
const SLUG_WITH_REVIEWS = "mock-headphones-pro";
const SLUG_EMPTY = "mock-headphones-empty";
const USER_EMAIL_PREFIX = "mock-reviewer";

const NUM_USERS = 14;

const COMMENTS = [
  "Loved the build quality. Battery lasts a full day.",
  "Solid for the price. Mids are a bit recessed though.",
  null,
  "Cans are tight on my head after an hour. Not for me.",
  "Best headphones I have ever owned. Would buy again.",
  "Bluetooth dropouts every now and then. Annoying.",
  "Pretty good! Noise cancellation is decent.",
  null,
  "Returned it. Plastic feels cheap.",
  "Great purchase, thanks!",
  "Sound staging is impressive at this price point.",
  "Mic quality is mediocre on calls.",
  "Five stars, fast shipping, exactly as described.",
];

async function main() {
  // Category
  const category = await prisma.category.upsert({
    where: { name: CATEGORY_NAME },
    update: {},
    create: { name: CATEGORY_NAME },
  });

  // Merchant — no @unique field, so look-up-then-create
  let merchant = await prisma.merchant.findFirst({
    where: { name: MERCHANT_NAME },
  });
  if (!merchant) {
    merchant = await prisma.merchant.create({
      data: { name: MERCHANT_NAME, status: "ACTIVE" },
    });
  }

  // Products. Prices kept ≤ 3000 so the shop page's default price filter
  // (filters[price][$lte]=3000 in components/Products.tsx) doesn't hide them.
  const withReviewsData = {
    slug: SLUG_WITH_REVIEWS,
    title: "Mock Headphones Pro",
    mainImage: "headphones1.webp",
    price: 2499,
    description:
      "Mock product seeded for the reviews feature. Pagination test: 13 reviews.",
    manufacturer: "MockBrand",
    inStock: 25,
    categoryId: category.id,
    merchantId: merchant.id,
  };
  const productWithReviews = await prisma.product.upsert({
    where: { slug: SLUG_WITH_REVIEWS },
    update: withReviewsData,
    create: withReviewsData,
  });

  const emptyData = {
    slug: SLUG_EMPTY,
    title: "Mock Headphones (no reviews yet)",
    mainImage: "headphones2.webp",
    price: 1499,
    description: "Mock product seeded with zero reviews to test the empty state.",
    manufacturer: "MockBrand",
    inStock: 10,
    categoryId: category.id,
    merchantId: merchant.id,
  };
  const productEmpty = await prisma.product.upsert({
    where: { slug: SLUG_EMPTY },
    update: emptyData,
    create: emptyData,
  });

  // Users (no password — they exist purely to satisfy the FK on Review.userId)
  const users = [];
  for (let i = 0; i < NUM_USERS; i++) {
    const email = `${USER_EMAIL_PREFIX}-${i}@example.test`;
    const u = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, role: "user" },
    });
    users.push(u);
  }

  // Wipe any previous mock reviews on the seeded product so re-runs are clean.
  await prisma.review.deleteMany({
    where: {
      productId: productWithReviews.id,
      userId: { in: users.map((u) => u.id) },
    },
  });

  // Insert 13 reviews (one per user 0..12) so the "5 first + Load more 10" UX
  // shows: page 1 = 5, page 2 = 8 remaining, hasMore=false after.
  // Ratings cycle 1..5; oldest first so "newest-first" sort is testable.
  const now = Date.now();
  for (let i = 0; i < COMMENTS.length; i++) {
    const ratingRaw = (i % 5) + 1;
    await prisma.review.create({
      data: {
        productId: productWithReviews.id,
        userId: users[i].id,
        rating: ratingRaw,
        comment: COMMENTS[i],
        // Stagger createdAt so newest-first ordering is meaningful.
        createdAt: new Date(now - (COMMENTS.length - i) * 60 * 1000),
      },
    });
  }

  // Recompute the cached rating using the same service the API uses.
  await recomputeProductRating(productWithReviews.id);
  await recomputeProductRating(productEmpty.id);

  const finalCounts = await prisma.review.groupBy({
    by: ["productId"],
    _count: true,
    where: { productId: { in: [productWithReviews.id, productEmpty.id] } },
  });

  console.log("");
  console.log("✓ Mock data seeded.");
  console.log("");
  console.log(`Category : ${category.name}`);
  console.log(`Merchant : ${merchant.name}`);
  console.log(`Users    : ${users.length} mock reviewers (${USER_EMAIL_PREFIX}-0..${USER_EMAIL_PREFIX}-${NUM_USERS - 1}@example.test)`);
  console.log("");
  console.log("Products:");
  for (const p of [productWithReviews, productEmpty]) {
    const refreshed = await prisma.product.findUnique({ where: { id: p.id } });
    const c = finalCounts.find((x) => x.productId === p.id);
    console.log(
      `  • ${p.title}\n      slug    : ${p.slug}\n      reviews : ${c ? c._count : 0}\n      rating  : ${refreshed.rating}\n      url     : http://localhost:3000/product/${p.slug}`
    );
  }
  console.log("");
  console.log("Manual UI checklist:");
  console.log("  1. Open the 'with reviews' URL while LOGGED OUT → see 13-count, paginated list, and the 'Log in to write a review' link.");
  console.log("  2. Click 'Load more' on the 'with reviews' product → 8 more reviews append, button hides.");
  console.log("  3. Open the 'empty' URL while LOGGED OUT → see 'No reviews yet'.");
  console.log("  4. Log in as your existing user → ReviewForm appears on whichever product you have NOT reviewed.");
  console.log("  5. Post a 4-star review → toast 'Review posted', YourReviewPanel appears at the top, list refetches.");
  console.log("  6. Delete from YourReviewPanel → toast 'Review deleted', form reappears.");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
