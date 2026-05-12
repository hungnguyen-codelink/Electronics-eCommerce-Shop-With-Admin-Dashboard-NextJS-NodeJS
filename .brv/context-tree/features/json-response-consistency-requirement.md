---
confidence: 0.85
sources:
  - features/_index.md
  - architecture/_index.md
synthesized_at: '2026-05-04T02:38:25.974Z'
type: synthesis
---

# JSON Response Consistency Requirement

Backend services are required to adhere to strict JSON response formatting to maintain UI stability, specifically to prevent parsing errors in complex feature interfaces.

## Evidence

- **features**: Backend services must return strictly formatted JSON to prevent frontend parsing failures in bulk upload operations.
- **architecture**: Express controller-based architecture uses asyncHandler for consistent error management and AppError mapping to ensure uniform API responses.
