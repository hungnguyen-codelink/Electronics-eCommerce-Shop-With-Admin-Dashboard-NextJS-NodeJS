const prisma = require('../utills/db');
const stripe = require('../services/stripeClient');
const { asyncHandler, AppError } = require('../utills/errorHandler');

const buildSuccessUrl = () =>
  `${process.env.STRIPE_SUCCESS_URL_BASE || process.env.FRONTEND_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;

const buildCancelUrl = (orderId) =>
  `${process.env.STRIPE_SUCCESS_URL_BASE || process.env.FRONTEND_URL}/checkout/cancel?orderId=${orderId}`;

const createCheckoutSession = asyncHandler(async (req, res) => {
  const { orderId } = req.body || {};
  if (!orderId) throw new AppError('orderId required', 400);

  const order = await prisma.customer_order.findUnique({
    where: { id: orderId },
    include: { products: { include: { product: true } } },
  });
  if (!order) throw new AppError('Order not found', 404);
  if (order.paymentStatus !== 'unpaid') {
    throw new AppError(`Order not payable (paymentStatus=${order.paymentStatus})`, 409);
  }
  if (!order.products.length) {
    throw new AppError('Order has no line items', 400);
  }

  // Re-use an existing live session if one is still open at Stripe.
  if (order.stripeSessionId) {
    try {
      const existing = await stripe.checkout.sessions.retrieve(order.stripeSessionId);
      if (existing.status === 'open' && existing.url) {
        return res.json({ url: existing.url, sessionId: existing.id });
      }
      // else: complete/expired — fall through to create a fresh one
    } catch (e) {
      // If retrieval fails (session purged etc.), fall through and mint a new one.
      console.warn(`stripeCheckout: retrieve(${order.stripeSessionId}) failed: ${e.message}`);
    }
  }

  const attempt = (order.checkoutAttempts ?? 0) + 1;

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: order.products.map((op) => ({
      price_data: {
        currency: 'usd',
        product_data: { name: op.product.title },
        unit_amount: op.product.price * 100, // dollars → cents at the Stripe boundary
      },
      quantity: op.quantity,
    })),
    metadata: { orderId: order.id },
    success_url: buildSuccessUrl(),
    cancel_url: buildCancelUrl(order.id),
  }, { idempotencyKey: `${order.id}-${attempt}` });

  await prisma.customer_order.update({
    where: { id: order.id },
    data: { stripeSessionId: session.id, checkoutAttempts: attempt },
  });

  res.json({ url: session.url, sessionId: session.id });
});

module.exports = { createCheckoutSession };
