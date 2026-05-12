---
title: Product Reviews MVP
summary: MVP for product reviews including data model, API endpoints, error handling, and implementation tasks.
tags: []
related: [architecture/database_access/prisma_client_singleton_pattern.md, features/stripe_payments/stripe_payment_integration.md]
keywords: []
createdAt: '2026-05-04T02:43:02.267Z'
updatedAt: '2026-05-04T02:49:29.241Z'
---
## Reason
Document Product Reviews MVP implementation plan

## Raw Concept
**Task:**
Implement Product Reviews MVP

**Changes:**
- Added Review model to prisma/schema.prisma
- Implemented reviews API endpoints in Express
- Created frontend review components (ReviewsTab, ReviewCard, ReviewForm)
- Added rating recomputation service

**Files:**
- prisma/schema.prisma
- components/ProductTabs.tsx

**Flow:**
User submits review -> Create record -> Recompute cached Product.rating

**Timestamp:** 2026-05-04

**Author:** Development Team

## Narrative
### Structure
Architecture uses Prisma 6, Express 4, Next.js 15, and next-auth v4. Data model includes a Review table with unique constraint on [productId, userId].

### Dependencies
Requires Prisma, Express, and existing Product and User models.

### Highlights
Supports paginated GET, POST (create), and DELETE (user-only) operations with specific HTTP error handling.

### Rules
Rating must be integer 1-5. Comments max 2000 chars. Only users can delete their own reviews. Duplicate reviews return 409.

### Examples
GET /api/reviews/product/:productId?offset=0&limit=10

## Facts
- **mvp_goal**: Product reviews MVP goal is minimal 1-5 star rating with optional comment. [project]
- **review_limit**: Reviews are limited to one per user per product. [convention]
- **db_pattern**: Prisma singleton pattern is required using require('../utills/db'). [convention]
- **controller_pattern**: Express controllers must use asyncHandler and AppError. [convention]
- **rating_caching**: Product.rating is a cached rounded average. [project]
