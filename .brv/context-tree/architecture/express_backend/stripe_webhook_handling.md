---
title: Stripe Webhook Handling
summary: Stripe webhook handling pattern using Prisma transactions for atomic order status updates and notifications.
tags: []
related: []
keywords: []
createdAt: '2026-05-11T06:00:45.818Z'
updatedAt: '2026-05-11T06:00:45.818Z'
---
## Reason
Document the Stripe webhook handling architecture including transaction management and notification integration.

## Raw Concept
**Task:**
Implement Stripe webhook handlers

**Files:**
- server/controllers/stripeWebhook.js
- server/utills/notificationHelpers.js

**Flow:**
webhook event -> construct event -> transaction block -> mark status -> create notification

**Timestamp:** 2026-05-11

## Narrative
### Structure
Webhooks use `prisma.$transaction` to ensure atomic updates to `customer_order` status and consistent notification creation.

### Dependencies
Relies on `server/utills/db.js` for Prisma singleton and `server/utills/notificationHelpers.js` for notification creation.

### Highlights
Webhook handler supports `checkout.session.completed`, `checkout.session.expired`, and `payment_intent.payment_failed`.
