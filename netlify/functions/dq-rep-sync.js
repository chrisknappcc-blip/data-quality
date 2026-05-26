// ─── Cipher Data Quality — Primary Rep Sync from CSV Export ──────────────────
// Accepts a HubSpot contact export CSV, determines primary_outreach_rep for
// each contact based on most recent activity owner, and returns an
// import-ready CSV to write back to HubSpot.
//
// Logic:
//   1. If existing_customer is set → skip (DNC)
//   2. If hs_email_optout is true → skip (DNC)
//   3. Most recent engagement owner wins (derived from Contact Owner +
//      Last Contacted date as proxy — exact engagement lookup not needed)
//   4. AE/VP activity overrides BDR
//   5. BDRs cannot take over each other's contacts
//   6. Irene Wong and Cole Hooper are never primary_outreach_rep
//   7. Default = assigned_bdr → hubspot_owner_id fallback
//
// POST /api/dq-rep-sync
// Body: { rows: [...parsed CSV rows as objects] }
// Returns: { output: [...import rows], stats: {...} }

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Valid values for primary_outreach_rep HubSpot enumeration
const VALID_REPS = new Set([
  "Chris Knapp", "Chiara Pate", "Matt Valin",
  "Joe Haine", "Joseph Haine", "Tim Grisham", "John Hansel",
]);

// Normalize "Joe Haine" vs "Joseph Haine"
const NORMALIZE_NAME = {
  "Joe Haine":    "Joe Haine",
  "Joseph Haine": "Joe Haine",
};
function normalizeName(name) {
  if (!name) return null;
  const n = name.trim();
  return NORMALIZE_NAME[n] || n;
}

// BDRs — can only be primary if it's their assigned contact
const BDR_NAMES = new Set(["Chris Knapp", "Chiara Pate"]);

// Excluded from primary_outreach_rep entirely
const EXCLUDED_NAMES = new Set(["Irene Wong", "Cole Hooper"]);

// DNC existing_customer values
const DNC_VALUES = new Set([
  "yes", "contract discussion", "org yes - but not this market"
]);

// Extract rep name from HubSpot owner display format
// e.g. "Matt Valin (mvalin@carecontinuity.com)" → "Matt Valin"
function extractRepName(ownerStr) {
  if (!ownerStr) return null;
  const match = ownerStr.match(/^([^(]+)/);
  return match ? normalizeName(match[1].trim()) : null;
}

// Determine primary_outreach_rep for a single contact row
// CSV columns (flexible matching):
//   Record ID, First Name, Last Name, Email,
//   Contact Owner (hubspot_owner_id display),
//   Assigned BDR (assigned_bdr),
//   Primary Outreach Rep (primary_outreach_rep — current value),
//   Last Contacted (notes_last_contacted),
//   Last Activity Date (notes_last_updated),
//   Existing Customer (existing_customer),
//   Email Opt Out (hs_email_optout)
function determineRep(row) {
  // Normalize column names — HubSpot exports use label names
  const get = (...keys) => {
    for (const k of keys) {
      const val = row[k] || row[k.toLowerCase()] || row[k.toUpperCase()];
      if (val !== undefined && val !== null && val !== '') return String(val).trim();
    }
    return null;
  };

  const recordId       = get('Record ID', 'record id', 'hs_object_id');
  const existingCust   = get('Existing Customer', 'existing_customer');
  const optOut         = get('Email Opt Out', 'hs_email_optout', 'Email opt out');
  const assignedBdr    = normalizeName(get('Assigned BDR', 'assigned_bdr'));
  const contactOwner   = extractRepName(get('Contact Owner', 'contact_owner', 'hubspot_owner_id'));
  const currentRep     = normalizeName(get('Primary Outreach Rep', 'primary_outreach_rep'));

  if (!recordId) return null;

  // Skip DNC contacts
  if (existingCust && DNC_VALUES.has(existingCust.toLowerCase())) {
    return { recordId, skip: true, reason: 'existing_customer' };
  }
  if (optOut === 'true' || optOut === '1' || optOut === 'Yes') {
    return { recordId, skip: true, reason: 'opt_out' };
  }

  // Determine new rep
  // Since we don't have per-engagement data in the export, we use:
  // - Contact Owner as proxy for "who last worked this contact"
  // - If Contact Owner is an AE/VP → they take over
  // - If Contact Owner is a BDR → only their assigned contacts
  // - If Contact Owner is excluded → fall back to assigned_bdr
  let newRep = assignedBdr; // default

  if (contactOwner && !EXCLUDED_NAMES.has(contactOwner) && VALID_REPS.has(contactOwner)) {
    const ownerIsBdr = BDR_NAMES.has(contactOwner);
    if (!ownerIsBdr) {
      // AE/VP owns the contact — they're the primary rep
      newRep = contactOwner;
    } else {
      // BDR owns the contact — only primary if it's their assigned contact
      if (assignedBdr && contactOwner === assignedBdr) {
        newRep = contactOwner;
      } else {
        // BDR owns but it's not their assigned contact — use assigned_bdr
        newRep = assignedBdr || currentRep;
      }
    }
  }

  // Only include if value is valid and different from current
  if (!newRep || !VALID_REPS.has(newRep)) {
    return { recordId, skip: true, reason: 'no_valid_rep' };
  }
  if (newRep === currentRep) {
    return { recordId, skip: true, reason: 'unchanged' };
  }

  return { recordId, newRep, skip: false };
}

export const config = { path: "/api/dq-rep-sync" };

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const rows = body.rows || [];

    if (!rows.length) {
      return new Response(JSON.stringify({ error: "No rows provided" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Process each row
    const results = rows.map(determineRep).filter(Boolean);

    const toUpdate  = results.filter(r => !r.skip);
    const skipped   = results.filter(r => r.skip);
    const dnc       = skipped.filter(r => r.reason === 'existing_customer' || r.reason === 'opt_out');
    const unchanged = skipped.filter(r => r.reason === 'unchanged');
    const noRep     = skipped.filter(r => r.reason === 'no_valid_rep');

    // Build import-ready CSV rows
    // Header matches exact HubSpot property label for auto-mapping
    const csvRows = [
      ["Record ID", "Primary Outreach Rep"],
      ...toUpdate.map(r => [r.recordId, r.newRep]),
    ];

    const csv = csvRows
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    return new Response(JSON.stringify({
      csv,
      stats: {
        total:     rows.length,
        toUpdate:  toUpdate.length,
        unchanged: unchanged.length,
        dnc:       dnc.length,
        noRep:     noRep.length,
      },
      preview: toUpdate.slice(0, 20).map(r => ({ id: r.recordId, rep: r.newRep })),
    }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[dq-rep-sync] error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
}
