---
title: Browser and Server API Client
summary: API client using dual-base URLs (INTERNAL_API_BASE_URL vs NEXT_PUBLIC_API_BASE_URL) to support containerized networking.
tags: []
related: []
keywords: []
createdAt: '2026-05-04T04:30:45.919Z'
updatedAt: '2026-05-04T04:30:45.919Z'
---
## Reason
Documenting the API client abstraction for containerized networking

## Raw Concept
**Task:**
Implement API client with dual-base URL support

**Files:**
- lib/api.ts
- lib/config.ts

**Flow:**
request -> check typeof window -> select base URL -> fetch

**Timestamp:** 2026-05-04

## Narrative
### Structure
apiClient in lib/api.ts uses config.ts to resolve base URL.

### Highlights
Server-side SSR uses http://express:3001 (INTERNAL_API_BASE_URL). Browser-side uses http://localhost:3001 (NEXT_PUBLIC_API_BASE_URL).

### Rules
1. INTERNAL_API_BASE_URL must not have NEXT_PUBLIC_ prefix to prevent browser leakage.
2. Use apiClient.get/post/put/delete convenience methods.
