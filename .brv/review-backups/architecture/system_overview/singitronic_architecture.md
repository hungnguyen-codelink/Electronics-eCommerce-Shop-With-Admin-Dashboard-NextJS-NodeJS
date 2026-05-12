---
title: Singitronic Architecture
summary: Singitronic uses a dual-app architecture (Next.js 15 for UI, Express for API) sharing a MySQL database, with a critical security vulnerability in the unauthenticated Express API.
tags: []
related: []
keywords: []
createdAt: '2026-05-04T02:13:03.980Z'
updatedAt: '2026-05-04T02:13:03.980Z'
---
## Reason
Documenting the dual-app architecture and security posture identified during architecture investigation.

## Raw Concept
**Task:**
Document Singitronic dual-app system architecture

**Changes:**
- Mapped dual-app dependencies
- Identified unauthenticated Express API endpoints
- Documented shared database strategy

**Files:**
- server/app.js
- middleware.ts
- lib/api.ts
- utils/db.ts
- server/utills/db.js

**Flow:**
Browser -> Express -> MySQL (CRUD); Browser -> Next.js -> MySQL (Auth)

**Timestamp:** 2026-05-04

**Author:** System Architect

## Narrative
### Structure
The system consists of two co-located Node applications sharing a single MySQL database: (1) Next.js 15 App Router (port 3000) for frontend and Auth, (2) Express 4.18 (port 3001) for the main API.

### Dependencies
Both apps rely on Prisma Client (canonical schema at root prisma/schema.prisma). Express app uses root node_modules for Prisma if local not found.

### Highlights
Critical security finding: Express API endpoints have NO authentication middleware. Admin pages (Next.js) communicate directly with Express API via apiClient, bypassing Next.js authentication protections for Express routes.

### Rules
Rule 1: All Express routes (except /health, /rate-limit-info) are public and unauthenticated.
Rule 2: Admin routes in Next.js are gated by middleware.ts (admin role check).
Rule 3: Database connection relies on DATABASE_URL environment variable.

## Facts
- **nextjs_port**: Next.js 15 App Router uses port 3000 [project]
- **express_port**: Express 4.18 API uses port 3001 [project]
- **security_vulnerability**: Express API has NO authentication middleware [project]
- **admin_security**: Admin routes are gated in Next.js middleware [project]
