const Stripe = require('stripe');

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set. Add it to server/.env before starting the server.');
}

const config = { apiVersion: '2024-06-20' };

// Dev/test escape hatch: point at stripe-mock (https://github.com/stripe/stripe-mock)
// so the integration can be exercised end-to-end without a real Stripe account.
// Example: STRIPE_API_BASE=http://host.docker.internal:12111
if (process.env.STRIPE_API_BASE) {
  const u = new URL(process.env.STRIPE_API_BASE);
  config.host = u.hostname;
  config.port = Number(u.port) || (u.protocol === 'https:' ? 443 : 80);
  config.protocol = u.protocol.replace(':', '');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, config);

module.exports = stripe;
