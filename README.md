# Cipher Data Quality Tool

Full CRM cleanup tool. Read-only against HubSpot — scans, analyzes, exports CSVs.
Nothing writes to HubSpot without you importing the file yourself.

## Phases

| Phase | What | Output |
|-------|------|--------|
| 0 — Pre-filter | Vendors, retired contacts, email repair targets | Vendor list CSV |
| 1 — Dedup | Duplicate companies, shared domains, missing domains | Merge list CSV + field updates |
| 2 — Hierarchy | company_type, parent_system_name, parent/child | Field updates CSV + parent-child CSV |
| 3 — Contacts | Missing persona, rep, phone, email repair, domain mismatch | Contact fixes CSV |
| 4 — Stale | Never contacted, inactive 90d/6mo/1yr | Stale records CSV |

## Fields used (all existing in HubSpot)

**Companies:**
- `company_type` — hierarchy + vendor flag (Vendor/Supplier value added)
- `parent_system_name` — parent system name for subsidiaries

**Contacts:**
- `associated_company_type` — VENDOR value already exists
- `lifecyclestage` — "other" = retired/former
- `contact_priority_tier` — Tier 1/2/3 for enrichment priority
- `primary_outreach_rep` — backfill from assigned_bdr
- `target_persona` — 22 personas for Gold gap analysis
- `primary_entity` — which subsidiary a contact works at

## CSV outputs

1. **cipher-dq-field-updates.csv** → Import into HubSpot (Settings → Import)
2. **cipher-dq-merge-list.csv** → Manual: HubSpot UI → Actions → Merge
3. **cipher-dq-parent-child.csv** → Manual: each record → Parent Company field
4. **cipher-dq-vendor-list.csv** → Review then import
5. **cipher-dq-contacts.csv** → Review + import
6. **cipher-dq-email-repair.csv** → ZoomInfo enrichment priority list
7. **cipher-dq-stale.csv** → Review

## Setup

### 1. New Netlify site
Connect this repo. Same team as hubspot-overlay-ck.

### 2. Environment variables
Copy from hubspot-overlay-ck Netlify site settings:
- AZURE_STORAGE_CONNECTION_STRING
- AZURE_CONTAINER_NAME
- HUBSPOT_CLIENT_ID
- HUBSPOT_CLIENT_SECRET

Add:
- VITE_CLERK_PUBLISHABLE_KEY (same as Cipher)

### 3. Clerk
Add the new site URL to your existing Clerk app's allowed origins.
No new Clerk app needed — same users, same HubSpot tokens.

### 4. Note on Full CRM mode
Full CRM scans the entire portal (all companies + contacts).
With 67k contacts this will take 60-90 seconds and cost ~$0 (no AI calls yet).
The AI enrichment layer (Claude-powered persona inference) is a separate future phase.
