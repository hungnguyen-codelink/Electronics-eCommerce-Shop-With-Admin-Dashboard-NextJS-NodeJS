---
title: Bulk Upload
summary: Mass product creation via CSV with batch management and deletion logic.
tags: []
related: [features/bulk_upload/troubleshooting/bulk_delete_troubleshooting.md]
keywords: []
createdAt: '2026-05-04T02:03:00.685Z'
updatedAt: '2026-05-04T02:03:00.685Z'
---
## Reason
Documenting bulk product upload feature via CSV

## Raw Concept
**Task:**
Document Bulk Upload feature

**Flow:**
POST /api/bulk-upload -> Parse CSV -> Insert Products -> Batch Created

**Timestamp:** 2026-05-04

## Narrative
### Structure
Supports CSV mass product creation. API endpoints for listing, details, and deletion.

### Highlights
Delete logic: deleteProducts=false keeps products, true removes them. Protection: prevents deletion if used in orders.

### Examples
CSV format requires columns: title, price, manufacturer, description, slug, categoryId.

## Facts
- **bulk_upload_format**: Bulk upload API supports CSV format [project]
- **delete_protection**: Bulk deletion prevents deleting products used in orders [project]
