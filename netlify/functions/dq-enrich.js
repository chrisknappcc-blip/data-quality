// ─── Cipher Data Quality — Company Enrichment ────────────────────────────────
// Target: 99%+ accuracy on company name, type, and parent system.
//
// Accuracy stack (checked in order, first match wins):
//   1. User corrections (Azure Blob) — user-verified, highest priority
//   2. Hardcoded known changes — pre-verified facts for major systems
//   3. Two-pass Claude + web search with trade publication targeting
//      Pass 1: Current status search
//      Pass 2: Merger/rebrand search on authoritative sources only
//      Both passes required before returning any result

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const ACCOUNT   = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const SAS_TOKEN = process.env.AZURE_STORAGE_SAS_TOKEN;
const CONTAINER = process.env.AZURE_STORAGE_CONTAINER || "crm-tokens";

// ─── Layer 1: User corrections from Azure Blob ────────────────────────────────
async function loadUserCorrections() {
  try {
    const sas = SAS_TOKEN.startsWith("?") ? SAS_TOKEN : `?${SAS_TOKEN}`;
    const url = `https://${ACCOUNT}.blob.core.windows.net/${CONTAINER}/dq-corrections.json${sas}`;
    const res = await fetch(url);
    if (res.status === 404) return [];
    if (!res.ok) return [];
    const data = await res.json();
    return data.corrections || [];
  } catch {
    return [];
  }
}

function matchCorrection(corrections, companyName) {
  const nameLower = companyName.toLowerCase();
  return corrections.find(c =>
    nameLower.includes(c.companyNameLower) ||
    c.companyNameLower.includes(nameLower)
  ) || null;
}

// ─── Layer 2: Hardcoded known changes ─────────────────────────────────────────
// Pre-verified facts. Only covers what we already know with certainty.
// For anything not here, we search.
const KNOWN_CHANGES = [
  {
    match: ["edward-elmhurst", "edward elmhurst"],
    currentName: "Endeavor Health", nameChanged: true,
    previousName: "Edward-Elmhurst Health",
    company_type: "Parent System", parent_system_name: null,
    notes: "Merged with NorthShore University HealthSystem and rebranded as Endeavor Health in December 2023. Third largest health system in Illinois.",
    recentChanges: "Merged with NorthShore, rebranded to Endeavor Health (December 2023).",
    evidenceUrl: "https://www.prnewswire.com/news-releases/northshore--edward-elmhurst-health-is-now-endeavor-health-302006318.html",
  },
  {
    match: ["northshore university healthsystem", "northshore university health"],
    currentName: "Endeavor Health", nameChanged: true,
    previousName: "NorthShore University HealthSystem",
    company_type: "Parent System", parent_system_name: null,
    notes: "Merged with Edward-Elmhurst Health and rebranded as Endeavor Health in December 2023.",
    recentChanges: "Merged with Edward-Elmhurst Health, rebranded to Endeavor Health (December 2023).",
    evidenceUrl: "https://www.prnewswire.com/news-releases/northshore--edward-elmhurst-health-is-now-endeavor-health-302006318.html",
  },
  {
    match: ["advocate aurora"],
    currentName: "Advocate Aurora Health", nameChanged: false,
    company_type: "Subsidiary/Hospital", parent_system_name: "Advocate Health",
    notes: "Advocate Aurora Health merged with Atrium Health in December 2022 forming Advocate Health as the parent system.",
    recentChanges: "Merged with Atrium Health to form Advocate Health (December 2022).",
    evidenceUrl: "https://www.advocatehealth.com",
  },
  {
    match: ["atrium health"],
    currentName: "Atrium Health", nameChanged: false,
    company_type: "Subsidiary/Hospital", parent_system_name: "Advocate Health",
    notes: "Atrium Health merged with Advocate Aurora Health in December 2022. Advocate Health is the parent system.",
    recentChanges: "Merged with Advocate Aurora Health to form Advocate Health (December 2022).",
    evidenceUrl: "https://www.advocatehealth.com",
  },
  {
    match: ["geisinger"],
    currentName: "Geisinger", nameChanged: false,
    company_type: "Subsidiary/Hospital", parent_system_name: "Risant Health",
    notes: "Geisinger was acquired by Risant Health (created by Kaiser Permanente) on March 31, 2024. Retains its name and brand.",
    recentChanges: "Acquired by Risant Health (Kaiser Permanente subsidiary) on March 31, 2024.",
    evidenceUrl: "https://www.geisinger.org/about-geisinger/news-and-media/news-releases/2024/04/02/15/07/risant-health-completes-acquisition-of-geisinger",
  },
  {
    match: ["chi franciscan"],
    currentName: "CHI Franciscan", nameChanged: false,
    company_type: "Subsidiary/Hospital", parent_system_name: "CommonSpirit Health",
    notes: "CHI Franciscan is a regional subsidiary of CommonSpirit Health.",
    recentChanges: null,
    evidenceUrl: "https://www.commonspirit.org",
  },
  {
    match: ["dignity health"],
    currentName: "Dignity Health", nameChanged: false,
    company_type: "Subsidiary/Hospital", parent_system_name: "CommonSpirit Health",
    notes: "Dignity Health is a regional subsidiary of CommonSpirit Health.",
    recentChanges: null,
    evidenceUrl: "https://www.commonspirit.org",
  },
  {
    match: ["mercyone"],
    currentName: "MercyOne", nameChanged: false,
    company_type: "Subsidiary/Hospital", parent_system_name: "Trinity Health",
    notes: "MercyOne is a joint operating company, majority owned by Trinity Health.",
    recentChanges: null,
    evidenceUrl: "https://www.mercyone.org",
  },
];

function checkKnownChanges(companyName) {
  const nameLower = companyName.toLowerCase();
  const match = KNOWN_CHANGES.find(e =>
    e.match.some(pattern => nameLower.includes(pattern))
  );
  if (!match) return null;
  return {
    currentName:        match.currentName,
    nameChanged:        match.nameChanged || false,
    previousName:       match.previousName || null,
    company_type:       match.company_type,
    parent_system_name: match.parent_system_name,
    notes:              match.notes,
    recentChanges:      match.recentChanges,
    evidenceUrl:        match.evidenceUrl,
    confidence:         "high",
    source:             "Verified known change",
  };
}

// ─── Layer 3: Two-pass Claude + web search ────────────────────────────────────
// Pass 1: Current status — what is this organization today?
// Pass 2: Merger check — search authoritative trade sources specifically
// Both passes run. Pass 2 can override Pass 1 if it finds evidence of a change.
async function researchCompany(company) {

  const AUTHORITATIVE_SOURCES = [
    "site:modernhealthcare.com",
    "site:healthcaredive.com",
    "site:beckershospitalreview.com",
    "site:prnewswire.com",
    "site:businesswire.com",
    "site:fiercehealthcare.com",
  ].join(" OR ");

  const prompt = `You are verifying healthcare organization data for a production CRM. Accuracy is critical.

COMPANY TO RESEARCH: "${company.name}"
Domain in CRM: ${company.domain || "unknown"}
Contacts in CRM: ${company.contacts || 0}
Current company_type: ${company.company_type || "not set"}
Current parent_system_name: ${company.parent_system_name || "not set"}

YOU MUST RUN EXACTLY THESE TWO SEARCHES — both are required:

SEARCH 1: "${company.name}" current status 2024 2025
SEARCH 2: "${company.name}" merger OR acquisition OR rebrand OR "now known as" OR "formerly" (${AUTHORITATIVE_SOURCES})

RULES FOR YOUR ANSWER:
- Search 2 uses authoritative trade publications. If they report a merger or rebrand, that is ground truth.
- If Search 2 finds a press release on prnewswire.com or businesswire.com about a name change, set nameChanged: true and use the new name.
- A system with ${company.contacts || 0} contacts is almost certainly NOT Independent — research carefully before returning Independent.
- Only return confidence "high" if you found a direct source URL. Otherwise return "medium" or "low".
- If the two searches conflict, trust Search 2 (trade publications) over Search 1.
- Do NOT return information from before 2022 as current fact.

RESPOND WITH ONLY this JSON — no markdown, no explanation:
{
  "currentName": "official name as of 2025",
  "nameChanged": true or false,
  "previousName": "old name if changed, otherwise null",
  "company_type": "Parent System" or "Subsidiary/Hospital" or "Medical Group" or "Independent",
  "parent_system_name": "parent system name or null",
  "confidence": "high" or "medium" or "low",
  "evidenceUrl": "URL from Search 2 that supports your answer, or null",
  "notes": "plain English summary in 1-2 sentences",
  "recentChanges": "description of any changes since 2022, or null"
}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const e = await response.text();
    throw new Error(`Claude API ${response.status}: ${e.slice(0, 200)}`);
  }

  const data = await response.json();
  let text = "";
  for (const block of (data.content || [])) {
    if (block.type === "text") text += block.text;
  }

  const clean = text.replace(/```json|```/g, "").trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON in response: ${clean.slice(0, 200)}`);

  const result = JSON.parse(match[0]);

  // Safety: downgrade confidence if no evidence URL
  if (result.confidence === "high" && !result.evidenceUrl) {
    result.confidence = "medium";
    result.notes = (result.notes || "") + " (Confidence downgraded — no source URL returned)";
  }

  // Safety: large contact counts shouldn't be Independent
  if (result.company_type === "Independent" && (company.contacts || 0) > 20) {
    result.confidence = "low";
    result.notes = (result.notes || "") + ` (Review: ${company.contacts} contacts — unlikely to be Independent)`;
  }

  result.source = "Claude + web search (two-pass)";
  return result;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export default async (req) => {
  if (req.method === "OPTIONS") return new Response("", { status: 200, headers: CORS });
  if (req.method !== "POST")   return new Response("Method not allowed", { status: 405, headers: CORS });

  try {
    const { companies, batchStart = 0, batchSize = 8 } = await req.json();
    if (!companies?.length) return new Response(JSON.stringify({ error: "companies array required" }), { status: 400, headers: CORS });

    // Load user corrections once per batch
    const userCorrections = await loadUserCorrections();
    console.log(`[dq-enrich] loaded ${userCorrections.length} user corrections`);

    const batch = companies.slice(batchStart, batchStart + batchSize);
    const results = [];

    console.log(`[dq-enrich] batch ${batchStart}–${batchStart + batch.length} of ${companies.length}`);

    for (const company of batch) {
      console.log(`[dq-enrich] processing: ${company.name}`);
      let research = null;
      let resolvedBy = null;

      try {
        // Layer 1: user corrections
        const userCorrection = matchCorrection(userCorrections, company.name);
        if (userCorrection) {
          research = {
            currentName:        userCorrection.currentName || company.name,
            nameChanged:        userCorrection.nameChanged || false,
            previousName:       null,
            company_type:       userCorrection.company_type || null,
            parent_system_name: userCorrection.parent_system_name || null,
            notes:              userCorrection.notes || null,
            recentChanges:      userCorrection.recentChanges || null,
            evidenceUrl:        userCorrection.evidenceUrl || null,
            confidence:         "high",
            source:             `User verified (added by ${userCorrection.addedBy} on ${userCorrection.addedAt?.slice(0,10)})`,
          };
          resolvedBy = "user_correction";
          console.log(`[dq-enrich] ✓ user correction: ${company.name}`);
        }

        // Layer 2: hardcoded known changes
        if (!research) {
          const known = checkKnownChanges(company.name);
          if (known) {
            research = known;
            resolvedBy = "known_change";
            console.log(`[dq-enrich] ✓ known change: ${company.name}`);
          }
        }

        // Layer 3: two-pass Claude search
        if (!research) {
          research = await researchCompany(company);
          resolvedBy = "web_search";
          console.log(`[dq-enrich] ✓ web search: ${company.name} → ${research.confidence} confidence`);
        }

        // Build output
        const flags = [];
        const fieldUpdates = [];

        if (research.nameChanged && research.currentName &&
            research.currentName.toLowerCase() !== company.name.toLowerCase()) {
          flags.push({
            type: "NAME_CHANGED",
            severity: "high",
            message: `"${company.name}" is now "${research.currentName}"`,
            currentName: company.name,
            correctName: research.currentName,
          });
        }

        if (research.company_type && research.company_type !== (company.company_type || "")) {
          fieldUpdates.push({
            field: "company_type",
            currentValue: company.company_type || null,
            proposedValue: research.company_type,
          });
        }

        if (research.parent_system_name && research.parent_system_name !== (company.parent_system_name || "")) {
          fieldUpdates.push({
            field: "parent_system_name",
            currentValue: company.parent_system_name || null,
            proposedValue: research.parent_system_name,
          });
        }

        if (research.recentChanges) {
          flags.push({ type: "RECENT_CHANGE", severity: "medium", message: research.recentChanges });
        }

        results.push({
          companyId: company.id, companyName: company.name,
          tier: company.tier, domain: company.domain,
          contacts: company.contacts, url: company.url,
          research, fieldUpdates, flags,
          hasIssues:  flags.length > 0 || fieldUpdates.length > 0,
          confidence: research.confidence,
          resolvedBy,
          enrichedAt: new Date().toISOString(),
        });

      } catch (err) {
        console.error(`[dq-enrich] failed: ${company.name}:`, err.message);
        results.push({
          companyId: company.id, companyName: company.name,
          error: err.message, fieldUpdates: [], flags: [],
          hasIssues: false, confidence: "error", resolvedBy: "error",
        });
      }

      // Only delay if we made an API call
      if (resolvedBy === "web_search") await new Promise(r => setTimeout(r, 800));
    }

    const nextBatch = batchStart + batchSize;
    const hasMore   = nextBatch < companies.length;

    return new Response(JSON.stringify({
      results, batchStart,
      batchEnd:  batchStart + batch.length,
      total:     companies.length,
      hasMore,
      nextBatch: hasMore ? nextBatch : null,
      summary: {
        processed:     results.length,
        fromUser:      results.filter(r => r.resolvedBy === "user_correction").length,
        fromKnown:     results.filter(r => r.resolvedBy === "known_change").length,
        fromSearch:    results.filter(r => r.resolvedBy === "web_search").length,
        withIssues:    results.filter(r => r.hasIssues).length,
        nameChanges:   results.flatMap(r => r.flags||[]).filter(f => f.type === "NAME_CHANGED").length,
        errors:        results.filter(r => r.error).length,
      },
    }), { status: 200, headers: CORS });

  } catch (err) {
    console.error("[dq-enrich] Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
  }
};

export const config = { path: "/api/dq-enrich" };
