---
title: Docker Development Environment
summary: Four-service Docker Compose stack (mysql, express, nextjs, adminer) with bind-mounts and hot-reload.
tags: []
related: [architecture/api_client/api_client_architecture.md]
keywords: []
createdAt: '2026-05-04T03:07:34.635Z'
updatedAt: '2026-05-04T04:30:45.911Z'
---
## Reason
Documenting the four-service Docker Compose stack for development

## Raw Concept
**Task:**
Define and document Docker development infrastructure

**Changes:**
- Added docker-compose.yml
- Added Dockerfile.dev for Next.js
- Added server/Dockerfile.dev for Express
- Implemented dual-API URL strategy (SSR vs Browser)
- Configured persistent MySQL volume
- Added Docker Compose v2 stack with mysql, express, nextjs, adminer
- Configured Prisma 6 with hot-regeneration
- Implemented API URL switching logic for host vs container access

**Files:**
- lib/api.ts
- lib/config.ts
- docker-compose.yml
- Dockerfile.dev
- server/Dockerfile.dev

**Flow:**
mysql (healthcheck) -> express/nextjs (depends_on) -> adminer

**Timestamp:** 2026-05-04

**Author:** System Architecture

**Patterns:**
- `node:20-bookworm-slim` - Mandatory base image for glibc compatibility

## Narrative
### Structure
Four-service stack on singitronic bridge network: mysql:8.0, express (server/Dockerfile.dev), nextjs (Dockerfile.dev), adminer:4.

### Dependencies
Requires Docker Compose v2, Node 20, Prisma 6.

### Highlights
Uses node:20-bookworm-slim. Hot reload via bind-mounts + anonymous volumes (node_modules/.next). Prisma generate runs at container start.

### Rules
1. Bind-mount source code for HMR.
2. Use anonymous volumes for node_modules and .next to prevent host-container shadowing.
3. Express uses Node 20 native --watch.
4. Prisma migrate dev must be run manually via docker compose exec express npx prisma migrate dev.

### Examples
Start stack: docker compose up -d --build. Reset: docker compose down -v.
