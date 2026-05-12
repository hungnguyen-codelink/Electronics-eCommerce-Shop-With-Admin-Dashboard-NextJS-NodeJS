---
confidence: 0.95
sources:
  - architecture/_index.md
  - design/_index.md
synthesized_at: '2026-05-04T02:38:25.971Z'
type: synthesis
---

# Decoupled Authentication Architecture

The platform suffers from a bifurcated authentication model where the frontend and backend operate under conflicting security paradigms, creating significant authorization bypass vulnerabilities.

## Evidence

- **architecture**: The Express API relies on trust-based authorization and lacks native authentication middleware, relying on frontend-level route protection.
- **design**: The design domain implements a strict JWT-only strategy via NextAuth, which operates independently of the Express backend.
