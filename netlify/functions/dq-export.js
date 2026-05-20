// ─── Cipher Data Quality — CSV Export ────────────────────────────────────────
// Produces HubSpot import-ready CSVs with exact property label headers.
// HubSpot auto-maps column headers to properties when labels match exactly.
// No manual column mapping needed during import.
//
// Column headers match HubSpot property labels confirmed from API:
//   Companies: "Record ID", "Company name", "Company Type",
//              "Parent System Name", "Company Domain Name"
//   Contacts:  "Record ID", "First Name", "Last Name", "Email",
//              "Primary Outreach Rep", "Target Persona", "Primary Entity"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Valid enum values confirmed from HubSpot property API
const VALID_COMPANY_TYPES = [
  "Parent System", "Subsidiary/Hospital", "Medical Group",
  "Independent", "Vendor/Supplier",
];
const VALID_PERSONAS = [
  "Access/Patient Access","Ambulatory/Urgent Care","Business Development",
  "Case Management","Clinical Operations","Emergency Department",
  "Executive/Leadership","Finance","Innovation","Medical Group",
  "Medical Information","Chief Clinical Officer","Medical Officer",
  "Nursing Officer","Operating Officer","Patient Experience",
  "Physician Executive","Population Health","Quality Officer",
  "Service Line","Strategy","Value Based Care",
];
const VALID_PRIMARY_REPS = [
  "Chiara Pate","Chris Knapp","Joe Haine","John Hansel","Matt Valin","Tim Grisham",
];

function validEnum(value, validValues) {
  if (!value) return null;
  // Exact match first
  if (validValues.includes(value)) return value;
  // Case-insensitive match fallback
  const lower = value.toLowerCase();
  const match = validValues.find(v => v.toLowerCase() === lower);
  return match || null;
}

const csvRow = cells =>
  cells.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",");

const csvFile = rows => rows.map(csvRow).join("\n");

export default async (req) => {
  if (req.method === "OPTIONS") return new Response("", { status: 200, headers: CORS });
  if (req.method !== "POST")   return new Response("Method not allowed", { status: 405, headers: CORS });

  try {
    const { type, scanResult } = await req.json();
    const date = new Date().toISOString().slice(0, 10);

    // ── COMPANY FIELD UPDATES ─────────────────────────────────────────────────
    // Headers match HubSpot property labels exactly — auto-maps on import.
    // Import path: HubSpot → Contacts → Import → Companies
    // Unique identifier: Record ID (updates existing, never creates new)
    if (type === "company-updates") {
      const rows = [];
      // Header row — these labels auto-map in HubSpot import
      rows.push(["Record ID", "Company name", "Company Type", "Parent System Name", "Company Domain Name"]);

      const seen = new Set();

      const addCompanyRow = (id, name, type_val, parent, domain) => {
        if (seen.has(id)) {
          // Merge into existing row if already added
          return;
        }
        seen.add(id);
        rows.push([
          id,
          name || "",
          validEnum(type_val, VALID_COMPANY_TYPES) || "",
          parent || "",
          domain || "",
        ]);
      };

      // Gather all company updates, merging multiple changes per company
      const companyData = {};

      const upsert = (id, name, domain) => {
        if (!companyData[id]) companyData[id] = { id, name, domain, company_type: "", parent_system_name: "" };
      };

      // Vendor tagging
      for (const co of (scanResult.phase0?.excludedCompanies || []).filter(c => c.flaggedForTag)) {
        upsert(co.id, co.name, co.domain || "");
        companyData[co.id].company_type = "Vendor/Supplier";
      }

      // Domain cleanup
      for (const issue of (scanResult.phase1?.issues || []).filter(i => i.csvExportable && i.proposedValue)) {
        for (const rec of issue.records) {
          upsert(rec.id, rec.name, rec.domain || "");
          if (issue.field === "domain") companyData[rec.id].domain = issue.proposedValue;
        }
      }

      // Hierarchy proposals (company_type + parent_system_name)
      for (const p of (scanResult.phase2?.proposals || []).filter(p => p.csvExportable)) {
        upsert(p.companyId, p.companyName, p.domain || "");
        for (const u of (p.fieldUpdates || [])) {
          if (u.field === "company_type") {
            const val = validEnum(u.proposedValue, VALID_COMPANY_TYPES);
            if (val) companyData[p.companyId].company_type = val;
          }
          if (u.field === "parent_system_name" && u.proposedValue) {
            companyData[p.companyId].parent_system_name = u.proposedValue;
          }
        }
      }

      // Write one row per company, only include columns with a value
      for (const c of Object.values(companyData)) {
        rows.push([
          c.id,
          c.name,
          c.company_type || "",
          c.parent_system_name || "",
          c.domain || "",
        ]);
      }

      if (rows.length === 1) {
        // Header only — no updates
        rows.push(["", "No company updates to apply", "", "", ""]);
      }

      return csvResponse(csvFile(rows), `UPLOAD-TO-HUBSPOT-companies-${date}.csv`);
    }

    // ── CONTACT FIELD UPDATES ─────────────────────────────────────────────────
    // Headers match HubSpot property labels exactly — auto-maps on import.
    // Import path: HubSpot → Contacts → Import → Contacts
    // Unique identifier: Record ID (updates existing, never creates new)
    if (type === "contact-updates") {
      const rows = [];
      // Header row — these labels auto-map in HubSpot import
      rows.push(["Record ID", "First Name", "Last Name", "Email", "Primary Outreach Rep", "Target Persona", "Primary Entity"]);

      for (const issue of (scanResult.phase3?.issues || []).filter(i => i.csvExportable && i.proposedValue)) {
        let rep     = "";
        let persona = "";
        let entity  = "";

        if (issue.field === "primary_outreach_rep") {
          rep = validEnum(issue.proposedValue, VALID_PRIMARY_REPS) || "";
        }
        if (issue.field === "target_persona") {
          persona = validEnum(issue.proposedValue, VALID_PERSONAS) || "";
        }
        if (issue.field === "primary_entity") {
          entity = issue.proposedValue || "";
        }

        // Only write rows where at least one field has a valid proposed value
        if (!rep && !persona && !entity) continue;

        // Split name back into first/last for the import
        const nameParts = (issue.contactName || "").trim().split(/\s+/);
        const firstName = nameParts[0] || "";
        const lastName  = nameParts.slice(1).join(" ") || "";

        rows.push([
          issue.contactId,
          firstName,
          lastName,
          issue.contactEmail || "",
          rep,
          persona,
          entity,
        ]);
      }

      if (rows.length === 1) {
        rows.push(["", "", "", "", "No contact updates with valid proposed values", "", ""]);
      }

      return csvResponse(csvFile(rows), `UPLOAD-TO-HUBSPOT-contacts-${date}.csv`);
    }

    // ── MERGE LIST ────────────────────────────────────────────────────────────
    if (type === "merge-list") {
      const rows = [["Primary Record ID","Primary Name","Primary Contacts","Tier","Merge Record ID","Merge Name","Merge Contacts","Reason","Primary HubSpot Link","Merge HubSpot Link","Action"]];
      for (const issue of (scanResult.phase1?.issues || []).filter(i => i.action === "MERGE_MANUAL")) {
        const [primary, ...others] = issue.records;
        for (const other of others) {
          rows.push([
            primary.id, primary.name, primary.contacts, primary.tier,
            other.id, other.name, other.contacts, issue.label,
            primary.url, other.url,
            "Open primary record in HubSpot > Actions > Merge > enter merge record ID",
          ]);
        }
      }
      if (rows.length === 1) rows.push(["", "No duplicate companies found", "", "", "", "", "", "", "", "", ""]);
      return csvResponse(csvFile(rows), `REVIEW-merge-list-${date}.csv`);
    }

    // ── PARENT/CHILD ASSOCIATIONS ─────────────────────────────────────────────
    if (type === "parent-child") {
      const rows = [["Child Record ID","Child Company","Tier","Proposed Parent","Parent in Portal","Confidence","Notes","Child HubSpot Link","Action"]];
      for (const p of (scanResult.phase2?.proposals || []).filter(p => p.parentCompanyName)) {
        const inPortal = p.parentCompanyId
          ? `Yes (Record ID: ${p.parentCompanyId})`
          : "Parent not found in portal";
        rows.push([
          p.companyId, p.companyName, p.tier,
          p.parentCompanyName, inPortal,
          p.confidence, p.notes || "",
          p.url,
          "Open child record > About > Company Information > Parent Company > search and select parent",
        ]);
      }
      if (rows.length === 1) rows.push(["", "No parent/child relationships to set", "", "", "", "", "", "", ""]);
      return csvResponse(csvFile(rows), `REVIEW-parent-child-${date}.csv`);
    }

    // ── VENDOR REVIEW LIST ────────────────────────────────────────────────────
    // Only companies flagged as vendors. Retired contacts are NOT in this file.
    if (type === "vendor-list") {
      const rows = [["Company Record ID","Company Name","Current Company Type","Detection Reason","Already Tagged as Vendor","HubSpot Link"]];
      for (const co of (scanResult.phase0?.excludedCompanies || [])) {
        rows.push([
          co.id, co.name,
          co.company_type || "Not set",
          co.reason,
          co.company_type === "Vendor/Supplier" ? "Yes" : "No - included in Company Updates import",
          co.url,
        ]);
      }
      if (rows.length === 1) rows.push(["", "No vendor companies detected", "", "", "", ""]);
      return csvResponse(csvFile(rows), `REVIEW-vendor-list-${date}.csv`);
    }

    // ── CONTACT ISSUES (FULL LIST) ────────────────────────────────────────────
    if (type === "phase3-full") {
      const typeLabels = {
        EMAIL_REPAIR:            "Email repair needed",
        MISSING_PERSONA:         "No target persona assigned",
        MISSING_PRIMARY_REP:     "No primary outreach rep",
        MISSING_PHONE:           "No phone number",
        MISSING_PRIMARY_ENTITY:  "No primary entity",
        DOMAIN_MISMATCH:         "Email domain mismatch - verify company association",
      };
      const rows = [["Contact Record ID","Contact Name","Email","Job Title","Company","Tier","Issue","Proposed Fix","Notes","HubSpot Link"]];
      for (const i of (scanResult.phase3?.issues || [])) {
        rows.push([
          i.contactId, i.contactName, i.contactEmail,
          i.contactTitle || "", i.companyName, i.tier,
          typeLabels[i.type] || i.type,
          i.proposedValue || "Manual review required",
          i.note || "", i.url,
        ]);
      }
      if (rows.length === 1) rows.push(["", "No contact issues found", "", "", "", "", "", "", "", ""]);
      return csvResponse(csvFile(rows), `REVIEW-contact-issues-${date}.csv`);
    }

    // ── EMAIL REPAIR TARGETS ──────────────────────────────────────────────────
    if (type === "email-repair") {
      const rows = [["Contact Record ID","Contact Name","Current Email","Job Title","Company","Tier","Issue","HubSpot Link"]];
      for (const c of (scanResult.phase0?.emailRepairTargets || [])) {
        rows.push([c.id, c.name, c.email || "", c.title || "", "", "", c.reason, c.url]);
      }
      for (const i of (scanResult.phase3?.issues || []).filter(i => i.type === "EMAIL_REPAIR")) {
        rows.push([i.contactId, i.contactName, i.contactEmail || "", i.contactTitle || "", i.companyName, i.tier, i.note || "", i.url]);
      }
      if (rows.length === 1) rows.push(["", "No email repair targets found", "", "", "", "", "", ""]);
      return csvResponse(csvFile(rows), `REVIEW-email-repair-${date}.csv`);
    }

    // ── ACTIVITY STATUS ───────────────────────────────────────────────────────
    if (type === "stale") {
      const statusLabels = {
        NEVER_CONTACTED: "Never contacted",
        STALE_1YEAR:     "Stale - over 1 year inactive",
        STALE_6MONTHS:   "Stale - over 6 months inactive",
        STALE_90DAYS:    "Stale - over 90 days inactive",
        ACTIVE:          "Active",
      };
      const rows = [["Company Record ID","Company Name","Tier","Assigned BDR","Contact Count","Days Since Last Activity","Last Activity Date","Activity Status","HubSpot Link"]];
      for (const r of (scanResult.phase4?.records || [])) {
        rows.push([
          r.companyId, r.name, r.tier, r.assignedBdr || "", r.contacts,
          r.daysSince ?? "Never",
          r.lastActivity ? new Date(r.lastActivity).toLocaleDateString("en-US") : "Never",
          statusLabels[r.status] || r.status,
          r.url,
        ]);
      }
      return csvResponse(csvFile(rows), `REVIEW-activity-status-${date}.csv`);
    }

    return new Response(JSON.stringify({ error: "Unknown export type" }), { status: 400, headers: CORS });

  } catch (err) {
    console.error("[dq-export]", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
  }
};

function csvResponse(content, filename) {
  return new Response(content, {
    status: 200,
    headers: {
      ...CORS,
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export const config = { path: "/api/dq-export" };
