---
title: System Architecture and Workflow Patterns
summary: Centralized architecture and workflow patterns for system operations and data flow.
tags: []
related: []
keywords: []
createdAt: '2026-05-11T05:48:28.454Z'
updatedAt: '2026-05-11T05:48:28.454Z'
---
## Reason
Curated from RLM session context

## Raw Concept
**Task:**
Consolidate system architecture and workflow knowledge

**Timestamp:** 2026-05-11

## Narrative
### Structure
Consolidated overview of system components, workflow patterns, and configuration standards.

### Highlights
Centralized API client for frontend, Prisma singleton patterns for database access, and standardized admin routing.

## Facts
- **handleServerError**: The handleServerError function must guard on code.startsWith('P') to correctly identify Prisma errors.
- **Stripe SDK integration**: Stripe errors contain a 'code' property that can cause misrouting if not explicitly guarded against in handleServerError.
- **error handling**: When integrating third-party SDKs that throw structured errors, audit handleServerError's discriminator checks.
- **handleServerError**: AppError instances are handled by checking 'instanceof AppError' and returning the associated statusCode.
- **handleServerError**: Prisma errors are identified by the presence of a 'code' property starting with 'P'.
- **asyncHandler**: asyncHandler wraps asynchronous functions and catches errors to pass them to handleServerError.
- **createCheckoutSession**: Stripe checkout sessions use an idempotency key based on order ID and checkout attempt count.
- **Stripe integration**: Stripe unit amounts are calculated by multiplying product price by 100 to convert dollars to cents.
- **createCheckoutSession**: The system attempts to retrieve and reuse existing open Stripe sessions before creating new ones.
- **handlePrismaError**: Prisma error codes P2002, P2025, P2003, P2014, P2021, and P2022 have specific error message mappings.
- **createCheckoutSession**: The createCheckoutSession function updates an order record with a stripeSessionId and checkoutAttempts count.
- **createCheckoutSession**: The createCheckoutSession function returns a JSON response containing the Stripe session URL and session ID.
- **createCheckoutSession**: The createCheckoutSession function is exported using module.exports.
- **Checkout Data Structure**: The system uses a data object to store stripeSessionId and checkoutAttempts during the checkout process.
- **data processing**: Process every row without summarizing table data.
- **documentation standards**: Preserve exact code examples, API signatures, and interface definitions.
- **narrative.rules**: Preserve step-by-step procedures and numbered instructions in narrative.rules.
