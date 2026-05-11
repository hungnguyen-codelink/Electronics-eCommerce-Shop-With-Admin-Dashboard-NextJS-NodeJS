const prisma = require('../utills/db');
const stripe = require('../services/stripeClient');
const { createPaymentNotification } = require('../utills/notificationHelpers');

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

async function markPaid(order, paymentIntentId, tx) {
  if (order.paymentStatus === 'paid') return false;
  await tx.customer_order.update({
    where: { id: order.id },
    data: {
      paymentStatus: 'paid',
      status: order.status === 'pending' ? 'processing' : order.status,
      stripePaymentIntentId: paymentIntentId || order.stripePaymentIntentId,
      paidAt: new Date(),
    },
  });
  return true;
}

async function markTerminal(order, terminalPaymentStatus, tx) {
  if (order.paymentStatus === terminalPaymentStatus) return false;
  if (order.paymentStatus === 'paid') return false; // never regress from paid
  await tx.customer_order.update({
    where: { id: order.id },
    data: { paymentStatus: terminalPaymentStatus, status: 'cancelled' },
  });
  return true;
}

async function findUserIdForOrder(email, tx) {
  const user = await tx.user.findFirst({ where: { email } });
  return user?.id ?? null;
}

async function handleSessionCompleted(session) {
  const orderId = session.metadata?.orderId;
  if (!orderId) {
    console.warn('webhook: session.completed without metadata.orderId, skipping');
    return;
  }
  await prisma.$transaction(async (tx) => {
    const order = await tx.customer_order.findUnique({ where: { id: orderId } });
    if (!order) {
      console.warn(`webhook: order ${orderId} not found for session.completed`);
      return;
    }
    const flipped = await markPaid(order, session.payment_intent, tx);
    if (flipped) {
      const userId = await findUserIdForOrder(order.email, tx);
      if (userId) {
        await createPaymentNotification(userId, 'success', order.total, order.id, tx);
      }
    }
  });
}

async function handleSessionExpired(session) {
  const orderId = session.metadata?.orderId;
  if (!orderId) return;
  await prisma.$transaction(async (tx) => {
    const order = await tx.customer_order.findUnique({ where: { id: orderId } });
    if (!order) return;
    const flipped = await markTerminal(order, 'expired', tx);
    if (flipped) {
      const userId = await findUserIdForOrder(order.email, tx);
      if (userId) {
        await createPaymentNotification(userId, 'failed', order.total, order.id, tx);
      }
    }
  });
}

async function handlePaymentIntentFailed(intent) {
  const orderId = intent.metadata?.orderId;
  await prisma.$transaction(async (tx) => {
    const order = orderId
      ? await tx.customer_order.findUnique({ where: { id: orderId } })
      : await tx.customer_order.findFirst({ where: { stripePaymentIntentId: intent.id } });
    if (!order) return;
    const flipped = await markTerminal(order, 'failed', tx);
    if (flipped) {
      const userId = await findUserIdForOrder(order.email, tx);
      if (userId) {
        await createPaymentNotification(userId, 'failed', order.total, order.id, tx);
      }
    }
  });
}

async function handleStripeWebhook(req, res) {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
  } catch (e) {
    return res.status(400).json({ error: `webhook signature failed: ${e.message}` });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleSessionCompleted(event.data.object);
        break;
      case 'checkout.session.expired':
        await handleSessionExpired(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object);
        break;
      default:
        break;
    }
    res.json({ received: true });
  } catch (e) {
    console.error(`webhook handler failed for ${event.type}:`, e);
    res.status(500).json({ error: 'webhook handler failed' });
  }
}

module.exports = { handleStripeWebhook };
