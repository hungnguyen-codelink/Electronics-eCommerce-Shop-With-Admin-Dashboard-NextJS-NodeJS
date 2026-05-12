---
confidence: 0.95
sources:
  - architecture/_index.md
  - design/_index.md
synthesized_at: '2026-05-11T05:35:39.936Z'
type: synthesis
---

# Bifurcated Authentication & Authorization Risk

The platform suffers from a critical security conflict where NextAuth (frontend) and Express (backend) maintain decoupled authentication paradigms, leading to potential authorization bypasses that span across both security design and backend implementation.

## Evidence

- **architecture**: Decoupled model where NextAuth (frontend) and Express (backend) maintain conflicting security paradigms, creating authorization bypass risks.
- **design**: Stateless jwt session management via NextAuth; server-side verification managed by utils/auth.ts and utils/adminAuth.ts.
