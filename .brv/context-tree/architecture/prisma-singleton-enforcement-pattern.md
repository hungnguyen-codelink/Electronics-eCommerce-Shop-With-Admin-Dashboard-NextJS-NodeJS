---
confidence: 1
sources:
  - architecture/_index.md
  - features/_index.md
synthesized_at: '2026-05-11T05:35:39.935Z'
type: synthesis
---

# Prisma Singleton Enforcement Pattern

The platform enforces a mandatory Prisma Client singleton pattern across both frontend (ESM) and backend (CommonJS) to prevent connection leaks, which is a foundational architectural requirement for all features.

## Evidence

- **architecture**: Mandatory use of PrismaClient singleton to prevent connection leaks; frontend uses utils/db.ts (ESM) and backend uses server/utills/db.js (CommonJS).
- **features**: Adherence to the Prisma singleton pattern (@/utils/db) is mandatory across all services to ensure connection stability.
