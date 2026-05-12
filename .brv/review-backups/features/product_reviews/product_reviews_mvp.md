---
title: Product Reviews MVP
summary: 'Product Reviews MVP: Prisma data model, Express API with rating recomputation, and Next.js frontend components.'
tags: []
related: [architecture/database_access/prisma_client_singleton_pattern.md]
keywords: []
createdAt: '2026-05-04T02:43:02.267Z'
updatedAt: '2026-05-04T02:43:02.267Z'
---
## Reason
Document architecture and implementation details for Product Reviews MVP

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

**Flow:**
User submits review -> API validates -> Prisma transaction updates Review & recomputes Product.rating -> Respond

**Timestamp:** 2026-05-04

**Author:** Development Team

## Narrative
### Structure
Data model uses Review model with unique constraint on [productId, userId]. Backend uses reviewsRouter with transaction-based rating updates. Frontend uses ReviewsTab container with sanitized comment rendering.

### Dependencies
Requires Prisma, Express, and sanitization library.

### Highlights
Supports pagination, ownership enforcement, and cached product ratings.

### Rules
Rule 1: One review per user per product (enforced by unique constraint).
Rule 2: Ratings must be 1-5.
Rule 3: Comments are sanitized before rendering.

### Examples
API endpoint: GET /api/reviews/product/:productId?offset=0&limit=10
