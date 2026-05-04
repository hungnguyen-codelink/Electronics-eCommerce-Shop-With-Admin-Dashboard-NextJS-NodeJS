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

module.exports = {
  listReviewsForProduct,
  getUserReviewForProduct,
  createReview,
  deleteReview,
};
