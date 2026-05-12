---
title: Prisma Client Singleton Pattern
summary: Prisma client singleton pattern used in Next.js and Express to prevent connection leaks
tags: []
related: []
keywords: []
createdAt: '2026-05-04T02:15:06.953Z'
updatedAt: '2026-05-04T02:15:06.953Z'
---
## Reason
Standardize database access patterns and document singleton enforcement

## Raw Concept
**Task:**
Document Prisma Client singleton pattern and enforcement rules

**Files:**
- utils/db.ts
- server/utills/db.js
- server/controllers/customer_orders.js

**Flow:**
App startup -> initialize singleton -> cache in globalThis -> export singleton instance

**Timestamp:** 2026-05-04

**Author:** System Architecture

## Narrative
### Structure
Both frontend (Next.js) and backend (Express) use a singleton pattern for PrismaClient. Frontend uses ESM in utils/db.ts, backend uses CommonJS in server/utills/db.js.

### Highlights
Both apps cache the Prisma instance in globalThis to prevent multiple connections in dev mode. Backend specifically resolves to root node_modules/@prisma/client to ensure bulk upload models are available. Violation: server/controllers/customer_orders.js uses new PrismaClient() directly, causing connection leaks.

### Rules
1. Next.js code must import from @/utils/db
2. Express controllers must require ../utills/db
3. Do not instantiate new PrismaClient() directly in controllers or services

## Facts
- **db_access_frontend**: Frontend uses utils/db.ts for Prisma singleton [project]
- **db_access_backend**: Backend uses server/utills/db.js for Prisma singleton [project]
- **db_violation**: server/controllers/customer_orders.js violates singleton pattern [project]
