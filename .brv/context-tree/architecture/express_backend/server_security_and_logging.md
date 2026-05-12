---
title: Server Security and Logging
summary: Express backend lacks auth middleware; trust-based client-side userId; logging via Morgan with request IDs and security alerts.
tags: []
related: [architecture/system_overview/singitronic_architecture.md, architecture/express_backend/express_backend_patterns.md]
keywords: []
createdAt: '2026-05-04T02:22:42.733Z'
updatedAt: '2026-05-04T02:22:42.733Z'
---
## Reason
Document security gaps and logging infrastructure in Express backend

## Raw Concept
**Task:**
Document Express backend security and logging patterns

**Files:**
- server/middleware/requestLogger.js
- server/routes/wishlist.js

**Flow:**
Client sends userId (from NextAuth session) -> Express API -> Trust-based authorization

**Timestamp:** 2026-05-04

## Narrative
### Structure
Logging implemented via Morgan middleware (server/middleware/requestLogger.js). Logs categorized into access.log, error.log, and security.log.

### Highlights
Security Gap: Server lacks native authentication middleware; trusts userId provided by client. Request ID: X-Request-ID header attached to every request using nanoid(8). Security Logging: Suspicious patterns (e.g., SQL injection, XSS) logged to security.log with IP and URL context.

### Rules
Suspicious patterns monitored: /script.*alert/i, /union.*select/i, /drop.*table/i, /<script/i, /javascript:/i
