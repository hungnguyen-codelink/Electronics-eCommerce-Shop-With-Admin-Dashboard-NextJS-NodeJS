const express = require('express');
const router = express.Router();
const { createCheckoutSession } = require('../controllers/stripeCheckout');

router.post('/create-session', createCheckoutSession);

module.exports = router;
