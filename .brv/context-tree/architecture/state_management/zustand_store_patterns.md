---
title: Zustand Store Patterns
summary: Zustand stores with sessionStorage persistence for client-side state like shopping cart
tags: []
related: []
keywords: []
createdAt: '2026-05-04T02:15:23.901Z'
updatedAt: '2026-05-04T02:15:23.901Z'
---
## Reason
Documenting client-side state management using Zustand and sessionStorage

## Raw Concept
**Task:**
Implement client-side state persistence

**Files:**
- app/_zustand/store.ts

**Flow:**
Define Store Interface -> Create Store with persist middleware -> Configure sessionStorage -> Export hook

**Timestamp:** 2026-05-04

## Narrative
### Structure
State management uses Zustand. Stores are defined in app/_zustand/. The cart store uses the `persist` middleware with `sessionStorage`.

### Highlights
Cart items survive page reloads but are cleared when the tab is closed. Actions like `addToCart` do not automatically recompute totals, requiring a manual call to `calculateTotals`.

### Rules
1. All client-side stores should be placed in app/_zustand/.
2. When using `persist`, ensure the storage key is unique.
3. Always call `calculateTotals()` after any mutation that affects prices or quantities.

### Examples
export const useProductStore = create<State & Actions>()(
  persist(
    (set) => ({ ... }),
    {
      name: "products-storage",
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
