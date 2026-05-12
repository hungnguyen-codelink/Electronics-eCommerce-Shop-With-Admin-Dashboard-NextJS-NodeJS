---
confidence: 0.9
sources:
  - architecture/_index.md
  - project/_index.md
synthesized_at: '2026-05-04T02:38:25.972Z'
type: synthesis
---

# Prisma Connection Management Strategy

The platform enforces a mandatory singleton pattern for database access to prevent connection exhaustion, applied consistently across both the Next.js frontend and the Express backend.

## Evidence

- **architecture**: Mandatory singleton pattern for PrismaClient via utils/db.ts (frontend) and server/utills/db.js (backend) to prevent connection leaks.
- **project**: The project is a full-stack platform utilizing a Next.js frontend and a Node.js backend both interacting with a MySQL database.
