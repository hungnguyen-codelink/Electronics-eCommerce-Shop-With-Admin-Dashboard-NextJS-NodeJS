const express = require("express");
const router = express.Router();
const { listReviewsForProduct } = require("../controllers/reviews");

router.get("/product/:productId", listReviewsForProduct);

module.exports = router;
