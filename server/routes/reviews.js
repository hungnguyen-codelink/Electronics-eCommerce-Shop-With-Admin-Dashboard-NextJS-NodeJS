const express = require("express");
const router = express.Router();
const {
  listReviewsForProduct,
  getUserReviewForProduct,
} = require("../controllers/reviews");

router.get("/product/:productId", listReviewsForProduct);
router.get("/product/:productId/user/:userId", getUserReviewForProduct);

module.exports = router;
