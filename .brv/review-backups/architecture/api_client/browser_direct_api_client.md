---
title: Browser-Direct API Client
summary: Frontend uses an apiClient to call the Express backend (localhost:3001) directly, bypassing session-based auth.
tags: []
related: []
keywords: []
createdAt: '2026-05-04T02:13:29.906Z'
updatedAt: '2026-05-04T02:13:29.906Z'
---
## Reason
Document architecture for frontend-to-Express communication

## Raw Concept
**Task:**
Document frontend-to-backend communication architecture

**Files:**
- lib/api.ts
- lib/config.ts

**Flow:**
Browser/Server Component -> apiClient -> fetch(localhost:3001)

**Timestamp:** 2026-05-04

## Narrative
### Structure
The frontend interacts with the Express backend using a centralized apiClient defined in lib/api.ts.

### Dependencies
Relies on NEXT_PUBLIC_API_BASE_URL from lib/config.ts.

### Highlights
Direct browser-to-Express communication. Authentication is handled purely at the UI routing level via middleware, making backend API calls unauthenticated by design.

### Rules
Always use apiClient for network requests to ensure consistent base URL and header configuration.
