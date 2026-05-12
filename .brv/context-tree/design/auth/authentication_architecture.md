---
consolidated_at: '2026-05-04T02:38:17.073Z'
consolidated_from:
  - {date: '2026-05-04T02:38:17.073Z', path: design/auth/authentication_architecture.abstract.md, reason: These files all document the same NextAuth authentication architecture. Consolidating them into the main architecture file reduces redundancy while maintaining depth.}
  - {date: '2026-05-04T02:38:17.073Z', path: design/auth/authentication_architecture.overview.md, reason: These files all document the same NextAuth authentication architecture. Consolidating them into the main architecture file reduces redundancy while maintaining depth.}
  - {date: '2026-05-04T02:38:17.073Z', path: design/auth/context.md, reason: These files all document the same NextAuth authentication architecture. Consolidating them into the main architecture file reduces redundancy while maintaining depth.}
---
## Authentication Architecture

### Overview
JWT-only authentication (15m expiry) with role-based access control and admin route protection. The system utilizes NextAuth with a stateless JWT strategy rather than database-backed sessions.

### Raw Concept
**Task:** Implement JWT authentication with NextAuth

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

### Notable Entities & Patterns
*   **Entities:** NextAuth (primary framework), Prisma (DB lookups), bcryptjs (password hashing).
*   **Patterns:** Decoupled Backend (auth flow specific to Next.js, decoupled from Express backend), Middleware Protection (centralized route guarding).

### Highlights
Admin routes are protected by middleware.ts. utils/auth.ts and utils/adminAuth.ts provide server-side admin checks. The 15-minute expiry acts as a security measure to limit the window of opportunity for compromised tokens.

### Rules
Rule 1: All /admin/* routes require "admin" role.
Rule 2: JWT expires in 15 minutes, forcing re-authentication.
Rule 3: CredentialsProvider uses bcrypt for password verification.

## Facts
- **auth_strategy**: NextAuth session strategy is JWT-only [project]
- **session_expiry**: Session maximum age is 15 minutes [project]
- **admin_route_protection**: Admin routes are defined in middleware.ts [project]
- **jwt_claims**: JWT token includes user role and ID [project]