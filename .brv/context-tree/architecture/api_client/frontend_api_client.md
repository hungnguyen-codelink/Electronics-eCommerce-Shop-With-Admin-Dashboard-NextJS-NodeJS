---
title: Frontend API Client
summary: Frontend API client wrapper for fetch with base URL configuration and convenience methods.
tags: []
related: [architecture/api_client/browser_direct_api_client.md]
keywords: []
createdAt: '2026-05-04T02:22:42.739Z'
updatedAt: '2026-05-04T02:22:42.739Z'
---
## Reason
Document frontend API utility

## Raw Concept
**Task:**
Document frontend API client

**Files:**
- lib/api.ts

**Timestamp:** 2026-05-04

## Narrative
### Structure
API client (lib/api.ts) wraps fetch with base URL and default JSON headers.

### Highlights
Convenience methods: get, post, put, delete wrappers. Centralized configuration via lib/config.ts.
