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
