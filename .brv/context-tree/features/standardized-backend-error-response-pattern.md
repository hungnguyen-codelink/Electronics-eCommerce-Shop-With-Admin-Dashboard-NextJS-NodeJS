---
confidence: 0.9
sources:
  - architecture/_index.md
  - features/_index.md
synthesized_at: '2026-05-11T05:35:39.937Z'
type: synthesis
---

# Standardized Backend Error & Response Pattern

To maintain frontend stability, all backend services—including core business features and system-level APIs—must utilize a standardized error handling and JSON response structure.

## Evidence

- **architecture**: Standardized flow using asyncHandler, centralized error handling, and AppError classes.
- **features**: All backend services must return strictly formatted JSON to prevent frontend SyntaxError parsing failures; Express controllers utilize asyncHandler and AppError.
