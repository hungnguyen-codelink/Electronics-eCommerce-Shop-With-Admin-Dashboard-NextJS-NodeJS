const express = require('express');
const router = express.Router();
const { handleStripeWebhook } = require('../controllers/stripeWebhook');

// IMPORTANT: this router is mounted BEFORE the global express.json() in server/app.js.
// The raw body is required for Stripe signature verification.
router.post('/', express.raw({ type: 'application/json' }), handleStripeWebhook);

module.exports = router;
