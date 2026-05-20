// ─── Cipher Data Quality — Scan Function ─────────────────────────────────────
// Read-only. Fetches ALL companies + contacts from HubSpot, runs all phases.
// Uses existing HubSpot fields — no new fields required except company_type=Vendor/Supplier.
//
// Field mapping (all existing HubSpot fields):
//   company_type           → hierarchy type + vendor flag
//   associated_company_type → contact-level vendor/type flag (VENDOR value already exists)
//   lifecyclestage          → retired/former contacts flagged as "other"
//   contact_priority_tier   → Tier 1/2/3 for enrichment prioritization
//   conference_tier         → Non-Tiered = excluded from conference segments
//
// Phase 0: Pre-filter — identify and skip vendors, retired, invalids
// Phase 1: Company dedup + domain cleanup
// Phase 2: Parent/subsidiary hierarchy mapping
// Phase 3: Contact data fixes (missing persona, rep, entity, email)
// Phase 4: Stale record flagging

const HS_API  = "https://api.hubapi.com";
const PORTAL  = "39921549";

// Exclusion criteria — these records are skipped in enrichment
const EXCLUDED_COMPANY_TYPES  = ["Vendor/Supplier"];
const EXCLUDED_CONTACT_TYPES  = ["VENDOR", "Vendor"];
const EXCLUDED_LIFECYCLE       = ["other"]; // retired, former employees

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ─── HubSpot helpers ─────────────────────────────────────────────────────────
async function hsApiCall(fn, retries = 4) {
  for (let i = 0; i < retries; i++) {
    try { return await fn(); }
    catch (err) {
      const is429 = err.status === 429 || String(err.message).includes("429");
      if (is429 && i < retries - 1) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      throw err;
    }
  }
}

async function hsPost(token, path, body) {
  return hsApiCall(async () => {
    const res = await fetch(`${HS_API}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text();
      const err = new Error(`HubSpot ${res.status}: ${txt}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  });
}

// ─── Fetch companies with pagination ─────────────────────────────────────────
// scope: 'gold' = only Gold tier | 'all' = entire CRM
async function fetchCompanies(token, scope = "gold", batchCallback) {
  const GOLD_TIERS = [
    "GOLD - 1-10","GOLD - 11-20","GOLD - 21-30","GOLD - 31-40","GOLD - 41-50",
    "GOLD - 51-60","GOLD - 61-70","GOLD - 71-80","GOLD - 81-90","GOLD - 91-100",
  ];

  const filterGroups = scope === "gold"
    ? [{ filters: [{ propertyName: "priority_tier__bdr", operator: "IN", values: GOLD_TIERS }] }]
    : [{ filters: [{ propertyName: "hs_object_id", operator: "HAS_PROPERTY" }] }];

  const results = [];
  let after;
  let page = 0;

  while (true) {
    const body = {
      filterGroups,
      properties: [
        "name","domain","priority_tier__bdr","assigned_bdr","hubspot_owner_id",
        "company_type","parent_system_name","associated_company_type",
        "num_associated_contacts","hs_lastmodifieddate","notes_last_updated",
        "notes_last_contacted","city","state","country","phone","industry",
        "description","annualrevenue","numberofemployees",
        "hs_last_logged_call_date","hs_last_booked_meeting_date",
      ],
      sorts: [{ propertyName: "name", direction: "ASCENDING" }],
      limit: 100,
    };
    if (after) body.after = after;

    const d = await hsPost(token, "/crm/v3/objects/companies/search", body);
    results.push(...(d.results || []));
    page++;

    if (batchCallback) batchCallback(results.length, d.total || 0);
    if (!d.paging?.next?.after) break;
    after = d.paging.next.after;
    await new Promise(r => setTimeout(r, 200));
  }

  return results;
}

// ─── Fetch contacts for company IDs via batch association ────────────────────
async function fetchContactsForCompanies(token, companyIds) {
  if (!companyIds.length) return {};

  // Batch association lookups in chunks of 100
  const contactIdsByCompany = {};
  for (let i = 0; i < companyIds.length; i += 100) {
    const batch = companyIds.slice(i, i + 100);
    try {
      const d = await hsPost(token, "/crm/v4/associations/companies/contacts/batch/read", {
        inputs: batch.map(id => ({ id: String(id) })),
      });
      for (const r of (d.results || [])) {
        const compId = String(r.from?.id || r.id);
        contactIdsByCompany[compId] = (r.to || [])
          .map(t => String(t.toObjectId || t.id))
          .filter(Boolean);
      }
    } catch (e) { console.error("[dq] assoc batch:", e.message); }
    await new Promise(r => setTimeout(r, 250));
  }

  // Fetch contact details in batches of 100
  const allIds = [...new Set(Object.values(contactIdsByCompany).flat())];
  const details = {};

  for (let i = 0; i < allIds.length; i += 100) {
    const batch = allIds.slice(i, i + 100);
    try {
      const d = await hsPost(token, "/crm/v3/objects/contacts/batch/read", {
        inputs: batch.map(id => ({ id })),
        properties: [
          "firstname","lastname","email","phone","jobtitle",
          "assigned_bdr","hubspot_owner_id","primary_outreach_rep",
          "target_persona","hs_buying_role","primary_entity",
          "associated_company_type","lifecyclestage","contact_priority_tier",
          "conference_tier","hs_email_last_send_date","hs_sequences_is_enrolled",
          "hs_email_optout","hs_email_bounce","hs_email_bad_address",
          "hs_lastmodifieddate","createdate",
        ],
      });
      for (const c of (d.results || [])) details[c.id] = c;
    } catch (e) { console.error("[dq] contact batch:", e.message); }
    await new Promise(r => setTimeout(r, 200));
  }

  // Build company → contacts map
  const byCompany = {};
  for (const [compId, ids] of Object.entries(contactIdsByCompany)) {
    byCompany[compId] = ids.map(id => details[id]).filter(Boolean);
  }
  return byCompany;
}

// ─── Phase 0: Pre-filter ──────────────────────────────────────────────────────
// Classifies every record before any analysis runs.
// Vendors, retired contacts, invalid records are flagged for skipping.
// Uses existing HubSpot fields — no new fields needed.
function runPhase0(companies, contactsByCompany) {
  const excluded = { companies: [], contacts: [] };
  const vendorCompanyIds = new Set();

  // Classify companies
  for (const co of companies) {
    const p = co.properties || {};
    const type = p.company_type || "";
    const name = (p.name || "").toLowerCase();

    let reason = null;

    // Already tagged as vendor in company_type
    if (EXCLUDED_COMPANY_TYPES.includes(type)) {
      reason = "company_type = Vendor/Supplier";
    }
    // Name-based vendor detection (for untagged records)
    else if (/\b(consulting|consultants|solutions|software|technology|technologies|corp|llc|inc)\b/i.test(p.name) &&
             !/health|medical|hospital|clinic|care|patient/i.test(p.name)) {
      reason = "Name pattern suggests vendor — review";
    }

    if (reason) {
      vendorCompanyIds.add(co.id);
      excluded.companies.push({
        id: co.id, name: p.name, domain: p.domain || "",
        company_type: type, reason,
        url: `https://app.hubspot.com/contacts/${PORTAL}/record/0-2/${co.id}`,
        flaggedForTag: type !== "Vendor/Supplier", // needs tagging if not already tagged
      });
    }
  }

  // Classify contacts
  for (const [compId, contacts] of Object.entries(contactsByCompany)) {
    for (const c of contacts) {
      const cp = c.properties || {};
      const assocType = cp.associated_company_type || "";
      const lifecycle = cp.lifecyclestage || "";
      const title = (cp.jobtitle || "").toLowerCase();
      const email = (cp.email || "").toLowerCase();
      let reason = null;

      // Already tagged as vendor
      if (EXCLUDED_CONTACT_TYPES.some(v => assocType.includes(v))) {
        reason = "associated_company_type = Vendor";
      }
      // Retired / former employee
      else if (lifecycle === "other" ||
               /\b(retired|emeritus|former|ex-|president emeritus)\b/i.test(title)) {
        reason = "Retired or former employee";
      }
      // Contact at a vendor company
      else if (vendorCompanyIds.has(compId)) {
        reason = "Associated with vendor company";
      }
      // Bounced / opted out / bad address
      else if (cp.hs_email_bounce === "true" || cp.hs_email_bad_address === "true") {
        reason = cp.hs_email_bounce === "true" ? "Email bounced" : "Bad email address";
        // NOTE: these are repair targets, not true exclusions — flag for email finding
      }

      if (reason) {
        const isRepairTarget = reason.includes("Email") || reason.includes("bad");
        excluded.contacts.push({
          id: c.id,
          name: `${cp.firstname||""} ${cp.lastname||""}`.trim() || email,
          email: cp.email || "",
          title: cp.jobtitle || "",
          companyId: compId,
          reason,
          isRepairTarget, // email finding targets, not true exclusions
          url: `https://app.hubspot.com/contacts/${PORTAL}/record/0-1/${c.id}`,
          needsTag: !EXCLUDED_CONTACT_TYPES.some(v => assocType.includes(v)) && !isRepairTarget,
        });
      }
    }
  }

  const vendorContacts = excluded.contacts.filter(c => !c.isRepairTarget);
  const repairTargets  = excluded.contacts.filter(c => c.isRepairTarget);

  return {
    excludedCompanies:     excluded.companies,
    excludedContacts:      vendorContacts,
    emailRepairTargets:    repairTargets,
    vendorCompanyIds:      [...vendorCompanyIds],
    summary: {
      vendorCompanies:     excluded.companies.length,
      needsVendorTag:      excluded.companies.filter(c => c.flaggedForTag).length,
      excludedContacts:    vendorContacts.length,
      emailRepairTargets:  repairTargets.length,
      totalExcluded:       excluded.companies.length + vendorContacts.length,
    },
  };
}

// ─── Phase 1: Company Dedup + Domain Cleanup ─────────────────────────────────
function runPhase1(companies, excludedCompanyIds) {
  const active = companies.filter(c => !excludedCompanyIds.has(c.id));
  const issues = [];

  const norm = s => (s || "").toLowerCase()
    .replace(/\b(health|healthcare|health care|system|systems|network|inc|llc|corp|the|of|at)\b/g, "")
    .replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();

  const byNorm   = {};
  const byDomain = {};

  for (const co of active) {
    const p = co.properties || {};
    const n = norm(p.name);
    const d = (p.domain || "").toLowerCase().trim();
    if (n) { if (!byNorm[n])   byNorm[n]   = []; byNorm[n].push(co); }
    if (d) { if (!byDomain[d]) byDomain[d] = []; byDomain[d].push(co); }
  }

  // Duplicate names
  for (const [, cos] of Object.entries(byNorm)) {
    if (cos.length < 2) continue;
    const sorted = [...cos].sort((a,b) =>
      parseInt(b.properties.num_associated_contacts||0) -
      parseInt(a.properties.num_associated_contacts||0)
    );
    issues.push({
      issueId: `dup-name-${sorted[0].id}`,
      type: "DUPLICATE_NAME",
      phase: 1,
      severity: "high",
      label: `Duplicate: "${sorted[0].properties.name}"`,
      description: `${cos.length} records share a similar name. Merge into the record with most contacts.`,
      records: sorted.map(co => ({
        id: co.id, name: co.properties.name,
        domain: co.properties.domain || "",
        tier: co.properties.priority_tier__bdr || "—",
        contacts: parseInt(co.properties.num_associated_contacts||0),
        url: `https://app.hubspot.com/contacts/${PORTAL}/record/0-2/${co.id}`,
      })),
      primaryId: sorted[0].id,
      mergeIds: sorted.slice(1).map(c => c.id),
      action: "MERGE_MANUAL",
      csvExportable: false,
      manualNote: "HubSpot UI: open record → Actions → Merge",
    });
  }

  // Same domain, different names
  for (const [d, cos] of Object.entries(byDomain)) {
    if (cos.length < 2) continue;
    const norms = [...new Set(cos.map(c => norm(c.properties.name)))];
    if (norms.length === 1) continue; // already caught by name dedup
    issues.push({
      issueId: `dup-domain-${d}`,
      type: "SAME_DOMAIN_DIFF_NAMES",
      phase: 1,
      severity: "medium",
      label: `Shared domain, different names: ${d}`,
      description: `${cos.length} records share domain "${d}" but have different names. Likely parent/subsidiary — review in Phase 2.`,
      records: cos.map(co => ({
        id: co.id, name: co.properties.name,
        domain: co.properties.domain,
        tier: co.properties.priority_tier__bdr || "—",
        contacts: parseInt(co.properties.num_associated_contacts||0),
        url: `https://app.hubspot.com/contacts/${PORTAL}/record/0-2/${co.id}`,
      })),
      action: "REVIEW_PHASE2",
      csvExportable: false,
      manualNote: "Review in Phase 2 before deciding — may be intentional parent/subsidiary split",
    });
  }

  // Missing domains
  for (const co of active) {
    const p = co.properties || {};
    if (!p.domain) {
      issues.push({
        issueId: `missing-domain-${co.id}`,
        type: "MISSING_DOMAIN",
        phase: 1,
        severity: "low",
        label: `No domain: ${p.name}`,
        description: "Missing website domain. Required for deduplication and routing.",
        records: [{
          id: co.id, name: p.name, domain: "",
          tier: p.priority_tier__bdr || "—",
          contacts: parseInt(p.num_associated_contacts||0),
          url: `https://app.hubspot.com/contacts/${PORTAL}/record/0-2/${co.id}`,
        }],
        action: "UPDATE_FIELD",
        field: "domain",
        csvExportable: true,
        proposedValue: "",
        manualNote: "Research correct domain and fill in CSV before importing",
      });
    }
  }

  return {
    issues,
    analyzedCompanies: active.length,
    summary: {
      duplicateNames:  issues.filter(i => i.type === "DUPLICATE_NAME").length,
      sameDomain:      issues.filter(i => i.type === "SAME_DOMAIN_DIFF_NAMES").length,
      missingDomain:   issues.filter(i => i.type === "MISSING_DOMAIN").length,
      mergesRequired:  issues.filter(i => i.action === "MERGE_MANUAL").length,
      csvUpdates:      issues.filter(i => i.csvExportable).length,
    },
  };
}

// ─── Phase 2: Parent/Subsidiary Hierarchy ────────────────────────────────────
const HEALTH_SYSTEMS = [
  { parent:"CommonSpirit Health",    domain:"commonspirit.org",           type:"Parent System",
    subsidiaries:[
      { name:"CHI Franciscan",              patterns:["chi franciscan"],            domain:"chifranciscan.org" },
      { name:"Dignity Health",              patterns:["dignity health"],             domain:"dignityhealth.org" },
      { name:"Virginia Mason Franciscan",   patterns:["virginia mason franciscan","vmfh"] },
      { name:"Creighton Health",            patterns:["creighton health"] },
    ]},
  { parent:"Advocate Health",        domain:"advocatehealth.com",         type:"Parent System",
    subsidiaries:[
      { name:"Advocate Aurora Health",      patterns:["advocate aurora"],            domain:"advocateaurorahealth.org" },
      { name:"Atrium Health",               patterns:["atrium health"],              domain:"atriumhealth.org" },
      { name:"Wake Forest Baptist Health",  patterns:["wake forest baptist"] },
    ]},
  { parent:"Ascension",              domain:"ascension.org",              type:"Parent System",
    subsidiaries:[
      { name:"Ascension Via Christi Health",patterns:["via christi","ascension via christi"], domain:"via-christi.org" },
      { name:"Ascension St. Vincent",       patterns:["ascension st. vincent","st. vincent ascension"] },
      { name:"Ascension Wisconsin",         patterns:["ascension wisconsin"] },
      { name:"Ascension Michigan",          patterns:["ascension michigan"] },
    ]},
  { parent:"Kaiser Permanente",      domain:"kaiserpermanente.org",       type:"Parent System",
    subsidiaries:[
      { name:"Kaiser Permanente (Internal)",patterns:[],domain:"nsmtp.kp.org",
        note:"Internal Kaiser email domain — same org as kaiserpermanente.org. Review for merge." },
    ]},
  { parent:"Parkview Health",        domain:"parkview.com",               type:"Parent System",
    subsidiaries:[
      { name:"Parkview Health System, Inc.",patterns:["parkview health system"],domain:"parkview.com" },
    ]},
  { parent:"HCA Healthcare",         domain:"hcahealthcare.com",          type:"Parent System",
    subsidiaries:[
      { name:"HCA Midwest Health",          patterns:["hca midwest"],               domain:"hcamidwest.com" },
    ]},
  { parent:"Trinity Health",         domain:"trinity-health.org",         type:"Parent System",
    subsidiaries:[
      { name:"MercyOne",                    patterns:["mercyone"],                  domain:"mercyone.org" },
    ]},
  { parent:"Mayo Clinic",            domain:"mayoclinic.org",             type:"Parent System",  subsidiaries:[] },
  { parent:"Geisinger",              domain:"geisinger.org",              type:"Parent System",  subsidiaries:[] },
  { parent:"UPMC",                   domain:"upmc.com",                   type:"Parent System",  subsidiaries:[] },
  { parent:"OSF HealthCare",         domain:"osfhealthcare.org",          type:"Parent System",  subsidiaries:[] },
  { parent:"SSM Health",             domain:"ssmhealth.com",              type:"Parent System",  subsidiaries:[] },
  { parent:"Mercy",                  domain:"mercy.net",                  type:"Parent System",  subsidiaries:[] },
  { parent:"Rush",                   domain:"rush.edu",                   type:"Parent System",  subsidiaries:[] },
  { parent:"UChicago Medicine",      domain:"uchicagomedicine.org",        type:"Parent System",  subsidiaries:[] },
  { parent:"OhioHealth",             domain:"ohiohealth.com",             type:"Parent System",  subsidiaries:[] },
  { parent:"Montefiore Health System",domain:"montefiore.org",            type:"Parent System",  subsidiaries:[] },
  { parent:"Hackensack Meridian Health",domain:"hackensackmeridianhealth.org",type:"Parent System",subsidiaries:[] },
];

function inferCompanyType(name, domain) {
  const n = (name || "").toLowerCase();
  const d = (domain || "").toLowerCase();
  for (const sys of HEALTH_SYSTEMS) {
    if (d === sys.domain || n.includes(sys.parent.toLowerCase())) return "Parent System";
    for (const sub of (sys.subsidiaries||[])) {
      if ((sub.domain && d === sub.domain) || sub.patterns?.some(p => n.includes(p))) return "Subsidiary/Hospital";
    }
  }
  if (/\b(health system|healthcare system|health network)\b/i.test(name)) return "Parent System";
  if (/\bmedical (group|associates|partners|practice)\b/i.test(name)) return "Medical Group";
  if (/\b(hospital|medical center|health center|regional health)\b/i.test(name)) return "Subsidiary/Hospital";
  return "Independent";
}

function runPhase2(companies, excludedCompanyIds) {
  const active = companies.filter(c => !excludedCompanyIds.has(c.id));
  const proposals = [];
  const byName   = Object.fromEntries(active.map(c => [(c.properties.name||"").toLowerCase().trim(), c]));
  const byDomain = Object.fromEntries(active.filter(c=>c.properties.domain).map(c => [(c.properties.domain||"").toLowerCase(), c]));

  for (const co of active) {
    const p = co.properties || {};
    const name   = p.name || "";
    const domain = (p.domain || "").toLowerCase();
    const nameLo = name.toLowerCase();

    let proposedType   = p.company_type || inferCompanyType(name, domain);
    let proposedParent = p.parent_system_name || "";
    let parentCompanyId= null;
    let confidence     = "medium";
    let source         = "Name pattern analysis";
    let notes          = "";

    for (const sys of HEALTH_SYSTEMS) {
      if (domain === sys.domain || nameLo.includes(sys.parent.toLowerCase())) {
        proposedType = "Parent System"; confidence = "high"; source = "Known health system";
        break;
      }
      const sub = sys.subsidiaries?.find(s =>
        (s.domain && domain === s.domain) || s.patterns?.some(pat => nameLo.includes(pat))
      );
      if (sub) {
        proposedType   = "Subsidiary/Hospital";
        proposedParent = sys.parent;
        confidence     = "high";
        source         = "Known health system hierarchy";
        if (sub.note) notes = sub.note;
        parentCompanyId = (byName[sys.parent.toLowerCase()] || byDomain[sys.domain])?.id || null;
        break;
      }
    }

    const fieldUpdates = [];
    if (proposedType && proposedType !== (p.company_type||"")) {
      fieldUpdates.push({ field:"company_type", currentValue:p.company_type||null, proposedValue:proposedType });
    }
    if (proposedParent && proposedParent !== (p.parent_system_name||"")) {
      fieldUpdates.push({ field:"parent_system_name", currentValue:p.parent_system_name||null, proposedValue:proposedParent });
    }

    if (fieldUpdates.length > 0) {
      proposals.push({
        proposalId: `phase2-${co.id}`,
        phase: 2,
        type: "HIERARCHY_MAPPING",
        companyId: co.id,
        companyName: name,
        tier: p.priority_tier__bdr || "—",
        domain: p.domain || "",
        url: `https://app.hubspot.com/contacts/${PORTAL}/record/0-2/${co.id}`,
        fieldUpdates,
        confidence,
        source,
        notes,
        parentCompanyId,
        parentCompanyName: proposedParent || null,
        csvExportable: true,
        associationRequired: !!parentCompanyId,
        manualNote: parentCompanyId
          ? `After importing CSV: open record in HubSpot → Company Information → Parent Company → set "${proposedParent}"`
          : null,
      });
    }
  }

  return {
    proposals,
    analyzedCompanies: active.length,
    summary: {
      total:              proposals.length,
      highConfidence:     proposals.filter(p => p.confidence === "high").length,
      mediumConfidence:   proposals.filter(p => p.confidence === "medium").length,
      requireAssociation: proposals.filter(p => p.associationRequired).length,
      csvExportable:      proposals.filter(p => p.csvExportable).length,
    },
  };
}

// ─── Phase 3: Contact Data Fixes ─────────────────────────────────────────────
function runPhase3(companies, contactsByCompany, excludedCompanyIds, excludedContactIds) {
  const issues = [];
  const seen = new Set();

  const activeCompanies = companies.filter(c => !excludedCompanyIds.has(c.id));

  for (const co of activeCompanies) {
    const p = co.properties || {};
    const contacts = (contactsByCompany[co.id] || [])
      .filter(c => !excludedContactIds.has(c.id));

    for (const c of contacts) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      const cp = c.properties || {};
      const name = `${cp.firstname||""} ${cp.lastname||""}`.trim() || cp.email || c.id;

      // Missing target_persona
      if (!cp.target_persona) {
        issues.push({
          issueId: `persona-${c.id}`, type:"MISSING_PERSONA", phase:3, severity:"high",
          contactId:c.id, contactName:name, contactEmail:cp.email||"",
          contactTitle:cp.jobtitle||"", companyId:co.id, companyName:p.name,
          tier:p.priority_tier__bdr||"—",
          url:`https://app.hubspot.com/contacts/${PORTAL}/record/0-1/${c.id}`,
          field:"target_persona", currentValue:null, proposedValue:null,
          csvExportable:true,
          note:"Assign target persona — required for Gold gap analysis and segmentation",
        });
      }

      // Missing primary_outreach_rep — backfill from assigned_bdr
      if (!cp.primary_outreach_rep) {
        const suggested = cp.assigned_bdr || null;
        issues.push({
          issueId:`rep-${c.id}`, type:"MISSING_PRIMARY_REP", phase:3, severity:"medium",
          contactId:c.id, contactName:name, contactEmail:cp.email||"",
          contactTitle:cp.jobtitle||"", companyId:co.id, companyName:p.name,
          tier:p.priority_tier__bdr||"—",
          url:`https://app.hubspot.com/contacts/${PORTAL}/record/0-1/${c.id}`,
          field:"primary_outreach_rep", currentValue:null, proposedValue:suggested,
          csvExportable:true,
          note: suggested ? `Backfill from assigned_bdr: "${suggested}"` : "No assigned_bdr — assign manually",
        });
      }

      // Missing or bounced email — repair target
      const hasBadEmail = cp.hs_email_bounce === "true" || cp.hs_email_bad_address === "true";
      const missingEmail = !cp.email;
      if (missingEmail || hasBadEmail) {
        issues.push({
          issueId:`email-${c.id}`, type:"EMAIL_REPAIR", phase:3, severity:"high",
          contactId:c.id, contactName:name, contactEmail:cp.email||"",
          contactTitle:cp.jobtitle||"", companyId:co.id, companyName:p.name,
          tier:p.priority_tier__bdr||"—",
          url:`https://app.hubspot.com/contacts/${PORTAL}/record/0-1/${c.id}`,
          field:"email", currentValue:cp.email||null, proposedValue:null,
          csvExportable:true,
          isRepairTarget:true,
          note: missingEmail ? "No email on record" : hasBadEmail ? "Email bounced/bad address — needs new email" : "",
        });
      }

      // Missing phone
      if (!cp.phone) {
        issues.push({
          issueId:`phone-${c.id}`, type:"MISSING_PHONE", phase:3, severity:"low",
          contactId:c.id, contactName:name, contactEmail:cp.email||"",
          contactTitle:cp.jobtitle||"", companyId:co.id, companyName:p.name,
          tier:p.priority_tier__bdr||"—",
          url:`https://app.hubspot.com/contacts/${PORTAL}/record/0-1/${c.id}`,
          field:"phone", currentValue:null, proposedValue:null,
          csvExportable:true,
          note:"No phone number on record",
        });
      }

      // Missing primary_entity for parent system contacts
      if (!cp.primary_entity && p.company_type === "Parent System") {
        issues.push({
          issueId:`entity-${c.id}`, type:"MISSING_PRIMARY_ENTITY", phase:3, severity:"low",
          contactId:c.id, contactName:name, contactEmail:cp.email||"",
          contactTitle:cp.jobtitle||"", companyId:co.id, companyName:p.name,
          tier:p.priority_tier__bdr||"—",
          url:`https://app.hubspot.com/contacts/${PORTAL}/record/0-1/${c.id}`,
          field:"primary_entity", currentValue:null, proposedValue:null,
          csvExportable:true,
          note:"Contact at parent system — specify which subsidiary/hospital they work at",
        });
      }

      // Email domain mismatch
      const emailDomain = (cp.email||"").split("@")[1]?.toLowerCase()||"";
      const companyDomain = (p.domain||"").toLowerCase();
      if (emailDomain && companyDomain) {
        const emailBase = emailDomain.split(".").slice(-2).join(".");
        const coBase = companyDomain.split(".").slice(-2).join(".");
        if (emailBase !== coBase) {
          issues.push({
            issueId:`domain-mismatch-${c.id}`, type:"DOMAIN_MISMATCH", phase:3, severity:"low",
            contactId:c.id, contactName:name, contactEmail:cp.email||"",
            contactTitle:cp.jobtitle||"", companyId:co.id, companyName:p.name,
            tier:p.priority_tier__bdr||"—",
            url:`https://app.hubspot.com/contacts/${PORTAL}/record/0-1/${c.id}`,
            csvExportable:false,
            note:`Email domain (${emailDomain}) ≠ company domain (${companyDomain}) — verify company association`,
          });
        }
      }
    }
  }

  const byType = t => issues.filter(i => i.type === t).length;
  return {
    issues,
    summary: {
      missingPersona:     byType("MISSING_PERSONA"),
      missingPrimaryRep:  byType("MISSING_PRIMARY_REP"),
      emailRepair:        byType("EMAIL_REPAIR"),
      missingPhone:       byType("MISSING_PHONE"),
      missingEntity:      byType("MISSING_PRIMARY_ENTITY"),
      domainMismatch:     byType("DOMAIN_MISMATCH"),
      total:              issues.length,
      withProposedValue:  issues.filter(i => i.proposedValue).length,
      csvExportable:      issues.filter(i => i.csvExportable).length,
    },
  };
}

// ─── Phase 4: Stale Record Flagging ──────────────────────────────────────────
function runPhase4(companies, excludedCompanyIds) {
  const now = Date.now();
  const records = [];

  for (const co of companies) {
    if (excludedCompanyIds.has(co.id)) continue;
    const p = co.properties || {};
    const ts = Math.max(
      p.notes_last_updated   ? new Date(p.notes_last_updated).getTime()   : 0,
      p.notes_last_contacted ? new Date(p.notes_last_contacted).getTime() : 0,
      p.hs_last_logged_call_date ? new Date(p.hs_last_logged_call_date).getTime() : 0,
    );
    const daysSince = ts > 0 ? Math.floor((now - ts) / 86400000) : null;
    const status = daysSince === null ? "NEVER_CONTACTED"
                 : daysSince > 365   ? "STALE_1YEAR"
                 : daysSince > 180   ? "STALE_6MONTHS"
                 : daysSince > 90    ? "STALE_90DAYS"
                 : "ACTIVE";

    records.push({
      companyId:co.id, name:p.name, tier:p.priority_tier__bdr||"—",
      assignedBdr:p.assigned_bdr||"", contacts:parseInt(p.num_associated_contacts||0),
      daysSince, lastActivity:ts>0?new Date(ts).toISOString():null,
      url:`https://app.hubspot.com/contacts/${PORTAL}/record/0-2/${co.id}`,
      status,
    });
  }

  records.sort((a,b) => (b.daysSince??99999) - (a.daysSince??99999));
  const s = k => records.filter(r => r.status === k).length;

  return {
    records,
    summary: {
      neverContacted: s("NEVER_CONTACTED"),
      stale1Year:     s("STALE_1YEAR"),
      stale6Months:   s("STALE_6MONTHS"),
      stale90Days:    s("STALE_90DAYS"),
      active:         s("ACTIVE"),
    },
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export default async (req) => {
  if (req.method === "OPTIONS") return new Response("", { status:200, headers:CORS });
  if (req.method !== "GET")     return new Response(JSON.stringify({error:"Method not allowed"}), {status:405,headers:CORS});

  const url   = new URL(req.url);
  const scope = url.searchParams.get("scope") || "gold"; // 'gold' | 'all'
  const phase = parseInt(url.searchParams.get("phase") || "0");
  const token = req.headers.get("x-hs-token");

  if (!token) return new Response(JSON.stringify({error:"Missing HubSpot token"}), {status:401,headers:CORS});

  try {
    console.log(`[dq-scan] scope=${scope} phase=${phase}`);

    // ── Fetch companies ───────────────────────────────────────────────────────
    const companies = await fetchCompanies(token, scope);
    console.log(`[dq-scan] fetched ${companies.length} companies`);

    // ── Fetch contacts ────────────────────────────────────────────────────────
    // Phase 3 requires contacts. Other phases work from company data alone.
    let contactsByCompany = {};
    if (!phase || phase === 3) {
      console.log("[dq-scan] fetching contacts...");
      const companyIds = companies.map(c => c.id);
      contactsByCompany = await fetchContactsForCompanies(token, companyIds);
      console.log(`[dq-scan] fetched contacts for ${Object.keys(contactsByCompany).length} companies`);
    }

    // ── Phase 0: Pre-filter ───────────────────────────────────────────────────
    console.log("[dq-scan] running Phase 0 pre-filter");
    const phase0 = runPhase0(companies, contactsByCompany);
    const excludedCompanyIds = new Set(phase0.vendorCompanyIds);
    const excludedContactIds = new Set(phase0.excludedContacts.map(c => c.id));

    // ── Build result ──────────────────────────────────────────────────────────
    const result = {
      scannedAt: new Date().toISOString(),
      scope,
      totalCompanies: companies.length,
      activeCompanies: companies.length - excludedCompanyIds.size,
      totalContacts: Object.values(contactsByCompany).reduce((s,a) => s+a.length, 0),
      phase0,
      companies: companies.map(co => ({
        id: co.id, name: co.properties.name,
        tier: co.properties.priority_tier__bdr || "—",
        domain: co.properties.domain || "",
        assignedBdr: co.properties.assigned_bdr || "",
        company_type: co.properties.company_type || "",
        parent_system_name: co.properties.parent_system_name || "",
        contacts: parseInt(co.properties.num_associated_contacts || 0),
        isExcluded: excludedCompanyIds.has(co.id),
        url: `https://app.hubspot.com/contacts/${PORTAL}/record/0-2/${co.id}`,
      })),
    };

    if (!phase || phase === 1) {
      console.log("[dq-scan] running Phase 1");
      result.phase1 = runPhase1(companies, excludedCompanyIds);
    }
    if (!phase || phase === 2) {
      console.log("[dq-scan] running Phase 2");
      result.phase2 = runPhase2(companies, excludedCompanyIds);
    }
    if (!phase || phase === 3) {
      console.log("[dq-scan] running Phase 3");
      result.phase3 = runPhase3(companies, contactsByCompany, excludedCompanyIds, excludedContactIds);
    }
    if (!phase || phase === 4) {
      console.log("[dq-scan] running Phase 4");
      result.phase4 = runPhase4(companies, excludedCompanyIds);
    }

    console.log("[dq-scan] scan complete");
    return new Response(JSON.stringify(result), {status:200,headers:CORS});

  } catch (err) {
    console.error("[dq-scan] Error:", err.message, err.stack);
    return new Response(JSON.stringify({error:err.message}), {status:500,headers:CORS});
  }
};

export const config = { path: "/api/dq-scan" };
