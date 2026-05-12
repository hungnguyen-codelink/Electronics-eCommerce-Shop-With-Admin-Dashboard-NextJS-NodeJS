const express = require('express');
const router = express.Router();
const { createCheckoutSession, getCheckoutSession } = require('../controllers/stripeCheckout');

router.post('/create-session', createCheckoutSession);
router.get('/session/:id', getCheckoutSession);

module.exports = router;
