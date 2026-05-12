---
title: Docker Development Environment
summary: Docker Compose stack (MySQL, Express, Next.js, Adminer) with hot-reload, persistent volumes, and dual-API URL strategy for SSR/client separation.
tags: []
related: []
keywords: []
createdAt: '2026-05-04T03:07:34.635Z'
updatedAt: '2026-05-04T03:07:34.635Z'
---
## Reason
Documenting the new Dockerized development stack implementation

## Raw Concept
**Task:**
Implement Dockerized development environment

**Changes:**
- Added docker-compose.yml
- Added Dockerfile.dev for Next.js
- Added server/Dockerfile.dev for Express
- Implemented dual-API URL strategy (SSR vs Browser)
- Configured persistent MySQL volume

**Files:**
- lib/api.ts
- lib/config.ts

**Flow:**
Docker Compose -> Bridge Network -> Services -> Bind Mounts -> Hot Reload

**Timestamp:** 2026-05-04

**Author:** Development Team

## Narrative
### Structure
Four-service compose stack: mysql:8.0, express, nextjs, adminer. Uses node:20-bookworm-slim. Express uses node --watch, Next.js uses npm run dev.

### Dependencies
MySQL 8.0, Node.js 20+, Prisma.

### Highlights
Supports hot-reload via bind-mounts, persistent DB via named volume, and dual-API URLs (INTERNAL_API_BASE_URL for SSR, NEXT_PUBLIC_API_BASE_URL for client).

### Rules
1. Internal URLs must not use NEXT_PUBLIC_ prefix to prevent leaking into browser bundle.
2. Manual migrations via: docker compose exec express npx prisma migrate dev.

### Examples
Dual-URL branch: const base = typeof window === "undefined" ? config.internalApiBaseUrl : config.apiBaseUrl;

## Facts
- **docker_image**: Docker stack uses node:20-bookworm-slim image [environment]
- **hot_reload**: Express uses node --watch for hot reload [convention]
- **api_url_ssr**: Internal API URL for SSR is http://express:3001 [project]
- **api_url_browser**: Public API URL for browser is http://localhost:3001 [project]
