---
title: Express Backend Patterns
summary: Centralized patterns for Express controllers, Prisma DB usage, error handling, and input validation.
tags: []
related: []
keywords: []
createdAt: '2026-05-04T02:13:52.307Z'
updatedAt: '2026-05-04T02:13:52.307Z'
---
## Reason
Document established Express backend patterns, conventions, and security practices

## Raw Concept
**Task:**
Document Express backend architecture

**Changes:**
- Standardized controller pattern
- Centralized error handling
- Prisma singleton usage

**Files:**
- server/controllers/
- server/routes/
- server/utills/db.js
- server/utills/errorHandler.js

**Flow:**
request -> asyncHandler(controller) -> (DB query) -> res.json() | throw AppError -> handleServerError

**Timestamp:** 2026-05-04

## Narrative
### Structure
Backend follows a controller-based architecture with shared utilities for DB and error handling.

### Dependencies
Uses Prisma as ORM, bcrypt for hashing.

### Highlights
Centralized error handling maps Prisma errors (e.g., P2002) to HTTP status codes (e.g., 409).

### Rules
Rule 1: Always use asyncHandler for async controllers.
Rule 2: Use shared Prisma client, never instantiate new PrismaClient.

### Examples
asyncHandler(async (req, res) => { throw new AppError("Not found", 404); });

## Facts
- **error_handling**: Use asyncHandler to wrap all async controller functions [convention]
- **database_usage**: Prisma singleton client from ../utills/db must be used instead of new PrismaClient [project]
- **error_handling**: AppError class extends Error and adds statusCode and isOperational [project]
- **routing_pattern**: Controllers must use thin route definitions mapping verbs to functions [convention]
- **password_hashing**: Password hashing uses bcrypt with cost factor 14 [project]
