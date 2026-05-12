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
