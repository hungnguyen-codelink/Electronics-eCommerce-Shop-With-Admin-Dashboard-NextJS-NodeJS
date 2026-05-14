---
confidence: 0.95
sources: [architecture/_index.md, project/_index.md]
synthesized_at: '2026-05-13T07:30:00.736Z'
type: synthesis
title: Mandatory Prisma Singleton Pattern
summary: To prevent connection leaks, the system enforces a strict Prisma Client singleton pattern across both frontend and backend environments.
tags: [database, prisma, performance, infrastructure]
related: []
keywords: [prisma, singleton, database, connection, pooling, leak, globalthis]
createdAt: '2026-05-13T07:30:00.736Z'
updatedAt: '2026-05-13T07:30:00.736Z'
---

# Mandatory Prisma Singleton Pattern

Connection management is standardized globally via a mandatory Prisma Client singleton pattern, enforced through `globalThis` to ensure resource efficiency across the dual-stack architecture.

## Evidence

- **architecture**: Mandatory PrismaClient singleton enforced via globalThis to prevent connection leaks.
- **project**: Implements a Prisma Client singleton pattern via globalThis to optimize connection pooling and prevent resource leaks.
