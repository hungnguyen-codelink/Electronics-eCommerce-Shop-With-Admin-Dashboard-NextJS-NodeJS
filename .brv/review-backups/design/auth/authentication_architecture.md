---
title: Authentication Architecture
summary: JWT-only authentication (15m expiry) with role-based access control and admin route protection.
tags: []
related: []
keywords: []
createdAt: '2026-05-04T02:14:50.156Z'
updatedAt: '2026-05-04T02:14:50.156Z'
---
## Reason
Documenting NextAuth JWT-based authentication system

## Raw Concept
**Task:**
Implement JWT authentication with NextAuth

**Changes:**
- Configured NextAuth with JWT strategy
- Added JWT expiry (15 min) with forced re-auth
- Added role-based admin route protection via middleware
- Implemented admin authorization helpers

**Files:**
- app/api/auth/[...nextauth]/route.ts
- middleware.ts
- utils/auth.ts
- utils/adminAuth.ts

**Flow:**
Login -> NextAuth (JWT) -> Session Cookie -> Middleware/Auth Helpers (Verify Role)

**Timestamp:** 2026-05-04

## Narrative
### Structure
NextAuth is configured for JWT-only strategy. Session strategy is "jwt" with 15-minute maxAge and 5-minute updateAge. JWT payloads include "role" and "id".

### Dependencies
Requires NEXTAUTH_SECRET, bcryptjs, prisma for user lookups.

### Highlights
Admin routes are protected by middleware.ts. utils/auth.ts and utils/adminAuth.ts provide server-side admin checks. Note: Express backend is currently decoupled from this auth flow.

### Rules
Rule 1: All /admin/* routes require "admin" role.
Rule 2: JWT expires in 15 minutes, forcing re-authentication.
Rule 3: CredentialsProvider uses bcrypt for password verification.

## Facts
- **auth_strategy**: NextAuth session strategy is JWT-only [project]
- **session_expiry**: Session maximum age is 15 minutes [project]
- **admin_route_protection**: Admin routes are defined in middleware.ts [project]
- **jwt_claims**: JWT token includes user role and ID [project]
