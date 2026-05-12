---
title: Transaction Client Pattern
summary: Architectural pattern for database helpers to participate in caller transactions using an optional client parameter.
tags: []
related: []
keywords: []
createdAt: '2026-05-11T06:00:45.817Z'
updatedAt: '2026-05-11T06:00:45.817Z'
---
## Reason
Document the optional transaction client pattern used in services and helpers to support atomicity.

## Raw Concept
**Task:**
Implement optional transaction client parameter for DB helpers

**Files:**
- server/services/productRating.js
- server/utills/notificationHelpers.js

**Flow:**
caller provides tx client -> helper uses (client || prisma) -> operation executed within transaction

**Timestamp:** 2026-05-11

**Author:** System

## Narrative
### Structure
When a helper writes to the DB but might also need to participate in a caller's transaction, expose an optional client arg as the LAST positional parameter (default null).

### Highlights
Backwards-compatible: existing call sites that pass no client get the module-level singleton.

### Examples
Pattern: `(client || prisma).model.action(...)`
