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
