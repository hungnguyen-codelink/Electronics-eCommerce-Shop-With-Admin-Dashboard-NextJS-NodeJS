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

module.exports = {
  listReviewsForProduct,
  getUserReviewForProduct,
};
