---
title: Express Backend Patterns
summary: Standardized backend patterns including asyncHandler, AppError handling, and Prisma singleton usage.
tags: []
related: [architecture/express_backend/server_security_and_logging.md]
keywords: []
createdAt: '2026-05-11T05:17:25.999Z'
updatedAt: '2026-05-11T05:17:25.999Z'
---
## Reason
Documenting backend architectural standards and patterns from provided context

## Raw Concept
**Task:**
Standardize Express Backend Architecture

**Changes:**
- Enforced use of asyncHandler for all controller methods
- Standardized error responses using AppError
- Implemented Prisma Client singleton pattern for database connectivity

**Files:**
- server/controllers/
- server/routes/

**Flow:**
Request -> Route -> Controller (asyncHandler) -> Prisma (singleton) -> Response/Error (AppError)

**Timestamp:** 2026-05-11

**Author:** System

## Narrative
### Structure
Backend codebase organized into controllers, routes, and utilities. Database access is centralized through a Prisma singleton to prevent connection leaks.

### Dependencies
Prisma Client, Express, asyncHandler, AppError

### Highlights
Uniform JSON error responses, consistent async/await error handling, efficient database connection management.

### Rules
Rule: All controllers must use asyncHandler to wrap async operations. Rule: Use AppError for all operational errors to ensure uniform JSON responses.

## Facts
- **controller_pattern**: All Express controllers must use asyncHandler [convention]
- **error_handling**: Use AppError for all operational errors [convention]
- **database_access**: Database access uses Prisma Client singleton pattern [project]

---

Standardized patterns for Express controllers, Prisma DB usage, error handling, and input validation. This file serves as the primary knowledge repository for Express backend architecture.
