### Authentication Architecture Overview

#### Key Points
*   **JWT-Only Strategy:** The system utilizes NextAuth with a stateless JWT strategy rather than database-backed sessions.
*   **Short-Lived Sessions:** JWTs are configured with a 15-minute `maxAge`, necessitating frequent re-authentication for security.
*   **Role-Based Access Control (RBAC):** JWT payloads explicitly include `id` and `role` claims to facilitate authorization checks.
*   **Middleware Enforcement:** All routes under `/admin/*` are protected at the edge via `middleware.ts`.
*   **Server-Side Helpers:** Dedicated utility files (`utils/auth.ts`, `utils/adminAuth.ts`) provide consistent authorization logic for server-side operations.

#### Structure / Sections Summary
*   **Configuration:** Defines the NextAuth setup, including the JWT strategy and session lifecycle settings.
*   **Flow:** Outlines the authentication lifecycle from initial login to session cookie generation and subsequent middleware verification.
*   **Implementation Details:** Lists the core files responsible for auth logic, including API routes, middleware, and helper utilities.
*   **Rules & Constraints:** Establishes mandatory security policies, including admin route restrictions and password verification methods.

#### Notable Entities, Patterns, and Decisions
*   **Entities:**
    *   **NextAuth:** Primary authentication framework.
    *   **Prisma:** Used for database user lookups.
    *   **bcryptjs:** Used for secure password hashing and verification.
*   **Patterns:**
    *   **Decoupled Backend:** The current authentication flow is specific to the Next.js frontend/API layer and is explicitly decoupled from any external Express backend.
    *   **Middleware Protection:** Centralized route guarding to ensure consistent enforcement of the "admin" role requirement.
*   **Decisions:**
    *   **Forced Re-auth:** The 15-minute expiry was chosen as a security measure to limit the window of opportunity for compromised tokens.
    *   **JWT Claims:** Inclusion of `role` and `id` in the token payload to minimize database hits during authorization checks.