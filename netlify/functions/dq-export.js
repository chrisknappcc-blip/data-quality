// ─── Cipher Data Quality — CSV Export ────────────────────────────────────────
// Generates all output files from scan results.
// No HubSpot API calls — pure CSV generation from scan data.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const csv = rows =>
  rows.map(r => r.map(v => `"${String(v??'').replace(/"/g,'""')}"`).join(",")).join("\n");

export default async (req) => {
  if (req.method === "OPTIONS") return new Response("", {status:200,headers:CORS});
  if (req.method !== "POST")   return new Response("Method not allowed", {status:405,headers:CORS});

  try {
    const { type, scanResult } = await req.json();
    const date = new Date().toISOString().slice(0,10);

    // ── 1. Field Updates — import directly into HubSpot ──────────────────────
    if (type === "field-updates") {
      const rows = [["Record ID","Record Type","Name","Tier / Company","Field","Current Value","Proposed Value","Confidence","Source","Notes"]];

      // Phase 0: vendor tagging — companies that need company_type = Vendor/Supplier
      for (const co of (scanResult.phase0?.excludedCompanies||[]).filter(c => c.flaggedForTag)) {
        rows.push([co.id,"Company",co.name,"—","company_type",co.company_type||"","Vendor/Supplier","medium","Phase 0 - Vendor detection",co.reason]);
      }

      // Phase 1: domain cleanup
      for (const issue of (scanResult.phase1?.issues||[]).filter(i => i.csvExportable)) {
        for (const rec of issue.records) {
          rows.push([rec.id,"Company",rec.name,rec.tier,issue.field||"domain",rec.domain||"",issue.proposedValue||"","medium","Phase 1 - Domain cleanup",issue.description]);
        }
      }

      // Phase 2: company_type + parent_system_name
      for (const p of (scanResult.phase2?.proposals||[]).filter(p => p.csvExportable)) {
        for (const u of (p.fieldUpdates||[])) {
          rows.push([p.companyId,"Company",p.companyName,p.tier,u.field,u.currentValue||"",u.proposedValue||"",p.confidence,p.source,p.notes||""]);
        }
      }

      // Phase 3: contact field updates (only those with proposed values)
      for (const issue of (scanResult.phase3?.issues||[]).filter(i => i.csvExportable && i.proposedValue)) {
        rows.push([issue.contactId,"Contact",issue.contactName,issue.companyName,issue.field,issue.currentValue||"",issue.proposedValue,"medium","Phase 3 - Contact fix",issue.note||""]);
      }

      return csvResponse(csv(rows), `cipher-dq-field-updates-${date}.csv`);
    }

    // ── 2. Merge List — manual action in HubSpot UI ───────────────────────────
    if (type === "merge-list") {
      const rows = [["Primary ID","Primary Name","Primary Contacts","Primary Tier","Merge ID","Merge Name","Merge Contacts","Reason","Primary HubSpot Link","Merge HubSpot Link"]];
      for (const issue of (scanResult.phase1?.issues||[]).filter(i => i.action === "MERGE_MANUAL")) {
        const [primary,...others] = issue.records;
        for (const other of others) {
          rows.push([primary.id,primary.name,primary.contacts,primary.tier,other.id,other.name,other.contacts,issue.label,primary.url,other.url]);
        }
      }
      return csvResponse(csv(rows), `cipher-dq-merge-list-${date}.csv`);
    }

    // ── 3. Parent/Child Association List — manual action in HubSpot UI ────────
    if (type === "parent-child") {
      const rows = [["Child Company ID","Child Name","Tier","Parent Name","Parent ID (if in portal)","Confidence","Source","Notes","Child HubSpot Link","Action"]];
      for (const p of (scanResult.phase2?.proposals||[]).filter(p => p.parentCompanyName)) {
        rows.push([p.companyId,p.companyName,p.tier,p.parentCompanyName,p.parentCompanyId||"Not in portal",p.confidence,p.source,p.notes||"",p.url,"Open record in HubSpot → Company Information → Parent Company → set value"]);
      }
      return csvResponse(csv(rows), `cipher-dq-parent-child-${date}.csv`);
    }

    // ── 4. Contact Issues — full Phase 3 export ───────────────────────────────
    if (type === "phase3-full") {
      const rows = [["Contact ID","Contact Name","Email","Title","Company","Tier","Issue Type","Severity","Field","Current Value","Proposed Value","Notes","HubSpot Link"]];
      for (const i of (scanResult.phase3?.issues||[])) {
        rows.push([i.contactId,i.contactName,i.contactEmail,i.contactTitle||"",i.companyName,i.tier,i.type,i.severity,i.field||"",i.currentValue||"",i.proposedValue||"",i.note||"",i.url]);
      }
      return csvResponse(csv(rows), `cipher-dq-contacts-${date}.csv`);
    }

    // ── 5. Email Repair Targets — contacts needing email finding ──────────────
    if (type === "email-repair") {
      const rows = [["Contact ID","Contact Name","Current Email","Title","Company","Company Domain","Tier","Reason","HubSpot Link"]];

      // From Phase 0 email repair targets
      for (const c of (scanResult.phase0?.emailRepairTargets||[])) {
        rows.push([c.id,c.name,c.email||"",c.title||"","—","—","—",c.reason,c.url]);
      }
      // From Phase 3 email repair issues
      for (const i of (scanResult.phase3?.issues||[]).filter(i => i.type === "EMAIL_REPAIR")) {
        rows.push([i.contactId,i.contactName,i.contactEmail||"",i.contactTitle||"",i.companyName,"",i.tier,i.note||"",i.url]);
      }

      return csvResponse(csv(rows), `cipher-dq-email-repair-${date}.csv`);
    }

    // ── 6. Vendor Exclusion List — companies + contacts to tag ────────────────
    if (type === "vendor-list") {
      const coRows = [["","COMPANIES TO TAG AS VENDOR/SUPPLIER","","",""]];
      coRows.push(["Company ID","Name","Current company_type","Reason","HubSpot Link"]);
      for (const co of (scanResult.phase0?.excludedCompanies||[])) {
        coRows.push([co.id,co.name,co.company_type||"",co.reason,co.url]);
      }
      coRows.push([]);

      const cRows = [["","CONTACTS TO REVIEW / EXCLUDE","","","",""]];
      cRows.push(["Contact ID","Name","Email","Title","Reason","Needs Tag","HubSpot Link"]);
      for (const c of (scanResult.phase0?.excludedContacts||[])) {
        cRows.push([c.id,c.name,c.email||"",c.title||"",c.reason,c.needsTag?"Yes":"No",c.url]);
      }

      const all = [...coRows,...cRows];
      return csvResponse(csv(all), `cipher-dq-vendor-list-${date}.csv`);
    }

    // ── 7. Stale Records ──────────────────────────────────────────────────────
    if (type === "stale") {
      const rows = [["Company ID","Name","Tier","Assigned BDR","Contacts","Days Inactive","Last Activity","Status","HubSpot Link"]];
      for (const r of (scanResult.phase4?.records||[])) {
        rows.push([r.companyId,r.name,r.tier,r.assignedBdr||"",r.contacts,r.daysSince??"Never",r.lastActivity?new Date(r.lastActivity).toLocaleDateString():"Never",r.status,r.url]);
      }
      return csvResponse(csv(rows), `cipher-dq-stale-${date}.csv`);
    }

    return new Response(JSON.stringify({error:"Unknown export type"}), {status:400,headers:CORS});

  } catch (err) {
    console.error("[dq-export]", err.message);
    return new Response(JSON.stringify({error:err.message}), {status:500,headers:CORS});
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
