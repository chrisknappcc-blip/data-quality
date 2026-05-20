// ─── Cipher Data Quality — Company Enrichment ────────────────────────────────
// Uses Claude + web search to verify company hierarchy with ~1% error target.
// Five accuracy mechanisms:
//   1. Pre-seeded merger/rebrand knowledge for known recent changes
//   2. Two targeted searches per company (current status + merger check)
//   3. Verification pass confirming proposed parent exists
//   4. Source citation requirement — no high confidence without evidence
//   5. Stale name detection — flags if current search returns different name

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ─── Pre-seeded knowledge: known recent mergers/rebrandings (2022–2025) ───────
// These are verified facts seeded into the prompt so Claude doesn't have to
// discover them from scratch. Update this list as new mergers are confirmed.
const KNOWN_RECENT_CHANGES = `
VERIFIED HEALTH SYSTEM CHANGES (2022–2025) — treat these as ground truth:

REBRANDINGS / NAME CHANGES:
- Edward-Elmhurst Health → now "Endeavor Health" (merged with NorthShore University HealthSystem, rebranded December 2023). Parent system. Domain: endeavorhealth.com
- NorthShore University HealthSystem → now part of "Endeavor Health" (same merger, December 2023)
- Advocate Aurora Health → now part of "Advocate Health" (merged with Atrium Health, completed December 2022). Advocate Health is the parent. Domain: advocatehealth.com
- Atrium Health → now part of "Advocate Health" (same merger). Subsidiary/regional brand under Advocate Health.
- Partners HealthCare → rebranded to "Mass General Brigham" (2020, still operating under this name in 2025)

ACQUISITIONS (organization still operates under original name but has new parent):
- Geisinger → acquired by Risant Health (closed March 31, 2024). Risant Health was created by Kaiser Permanente. Geisinger retains its name and brand but parent_system_name = "Risant Health"
- Cone Health → acquired by Risant Health (2024). Retains name, parent = "Risant Health"
- Ascension Illinois hospitals → sold to Prime Healthcare (2024)
- CHI Franciscan → part of CommonSpirit Health (ongoing, no name change)
- Dignity Health → part of CommonSpirit Health (ongoing)
- MercyOne → joint operating company of Trinity Health and Mayo Clinic, now majority Trinity Health

MERGERS IN PROGRESS / ANNOUNCED:
- Sanford Health + Marshfield Clinic Health System → merger announced 2024, pending completion
- Allegheny Health Network + Heritage Valley Health System → affiliation agreement 2024

DO NOT ASSUME these unless search confirms: any merger not on this list.
`;

// ─── Claude API call with web search ─────────────────────────────────────────
async function researchCompany(company) {
  const prompt = `You are a healthcare industry analyst verifying CRM data for a sales team.
Your job is to research this health system and return VERIFIED, ACCURATE information.
Accuracy is critical — this data will be imported into a production CRM.

COMPANY TO RESEARCH:
Name in CRM: "${company.name}"
Domain: ${company.domain || "unknown"}
Current company_type in CRM: ${company.company_type || "not set"}
Current parent_system_name in CRM: ${company.parent_system_name || "not set"}

${KNOWN_RECENT_CHANGES}

INSTRUCTIONS:
1. Search for "${company.name}" current status 2024 2025 to find the latest information
2. Search for "${company.name}" merger OR acquisition OR rebrand OR "now known as" 2022 2023 2024 2025
3. If you find a parent organization, search to verify it exists and is correct
4. Check if the name in our CRM is still the current name, or if the organization has rebranded

CRITICAL RULES:
- If the organization appears in the KNOWN RECENT CHANGES list above, use that as ground truth
- Only return "high" confidence if you found direct evidence (press release, news article, official website)
- If you cannot find clear evidence for parent/type, return "low" confidence and explain why
- Never return "Independent" with high confidence for a large health system without searching first
- A health system with 5+ hospitals is almost certainly a "Parent System" not "Independent"
- If the current name differs from what's in our CRM, set nameChanged: true

RESPOND WITH ONLY a JSON object — no markdown, no explanation, just the JSON:
{
  "currentName": "the current official name as of 2025",
  "nameChanged": true or false,
  "previousName": "the old name if changed, otherwise null",
  "company_type": "Parent System" or "Subsidiary/Hospital" or "Medical Group" or "Independent" or "Vendor/Supplier",
  "parent_system_name": "name of parent system, or null if this IS the parent or is truly independent",
  "confidence": "high" or "medium" or "low",
  "evidenceUrl": "URL of the source that confirms your answer, or null",
  "notes": "1-2 sentence plain English summary of current status",
  "recentChanges": "description of any mergers/acquisitions/rebrandings since 2022, or null if none found"
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
    const err = await response.text();
    throw new Error(`Claude API ${response.status}: ${err.slice(0, 200)}`);
  }

  const data = await response.json();

  // Extract text blocks (may follow tool_use blocks)
  let text = "";
  for (const block of (data.content || [])) {
    if (block.type === "text") text += block.text;
  }

  // Parse JSON
  const clean = text.replace(/```json|```/g, "").trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON in response: ${clean.slice(0, 200)}`);

  const result = JSON.parse(match[0]);

  // Safety check: downgrade confidence if no evidence URL
  if (result.confidence === "high" && !result.evidenceUrl) {
    result.confidence = "medium";
    result.notes = (result.notes || "") + " (Confidence downgraded: no source URL provided)";
  }

  // Safety check: large health systems shouldn't be Independent
  const name = (company.name || "").toLowerCase();
  const contacts = company.contacts || 0;
  if (result.company_type === "Independent" && contacts > 20) {
    result.confidence = "low";
    result.notes = (result.notes || "") + " (Review: large contact count suggests this may not be independent)";
  }

  return result;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export default async (req) => {
  if (req.method === "OPTIONS") return new Response("", { status: 200, headers: CORS });
  if (req.method !== "POST")   return new Response("Method not allowed", { status: 405, headers: CORS });

  try {
    const { companies, batchStart = 0, batchSize = 8 } = await req.json();
    if (!companies?.length) return new Response(JSON.stringify({ error: "companies array required" }), { status: 400, headers: CORS });

    // Smaller batches (8 instead of 10) to stay within Netlify's 26s timeout
    // Each company does 2-3 web searches + response parsing = ~3-4s each
    const batch = companies.slice(batchStart, batchStart + batchSize);
    const results = [];

    console.log(`[dq-enrich] batch ${batchStart}–${batchStart + batch.length} of ${companies.length}`);

    for (const company of batch) {
      console.log(`[dq-enrich] researching: ${company.name}`);
      try {
        const research = await researchCompany(company);

        const flags = [];
        const fieldUpdates = [];

        // Name changed?
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

        // company_type update?
        if (research.company_type && research.company_type !== (company.company_type || "")) {
          fieldUpdates.push({
            field: "company_type",
            currentValue: company.company_type || null,
            proposedValue: research.company_type,
          });
        }

        // parent_system_name update?
        if (research.parent_system_name && research.parent_system_name !== (company.parent_system_name || "")) {
          fieldUpdates.push({
            field: "parent_system_name",
            currentValue: company.parent_system_name || null,
            proposedValue: research.parent_system_name,
          });
        }

        // Recent changes flag?
        if (research.recentChanges) {
          flags.push({
            type: "RECENT_CHANGE",
            severity: "medium",
            message: research.recentChanges,
          });
        }

        results.push({
          companyId:    company.id,
          companyName:  company.name,
          tier:         company.tier,
          domain:       company.domain,
          contacts:     company.contacts,
          url:          company.url,
          research,
          fieldUpdates,
          flags,
          hasIssues:    flags.length > 0 || fieldUpdates.length > 0,
          confidence:   research.confidence,
          source:       "Claude + web search",
          enrichedAt:   new Date().toISOString(),
        });

      } catch (err) {
        console.error(`[dq-enrich] failed: ${company.name}:`, err.message);
        results.push({
          companyId:    company.id,
          companyName:  company.name,
          error:        err.message,
          fieldUpdates: [],
          flags:        [],
          hasIssues:    false,
          confidence:   "error",
          source:       "Research failed",
        });
      }

      // Gap between calls to avoid API rate limits
      await new Promise(r => setTimeout(r, 800));
    }

    const nextBatch = batchStart + batchSize;
    const hasMore   = nextBatch < companies.length;

    return new Response(JSON.stringify({
      results,
      batchStart,
      batchEnd:  batchStart + batch.length,
      total:     companies.length,
      hasMore,
      nextBatch: hasMore ? nextBatch : null,
      summary: {
        processed:     results.length,
        withIssues:    results.filter(r => r.hasIssues).length,
        nameChanges:   results.flatMap(r => r.flags||[]).filter(f => f.type === "NAME_CHANGED").length,
        recentChanges: results.flatMap(r => r.flags||[]).filter(f => f.type === "RECENT_CHANGE").length,
        highConf:      results.filter(r => r.confidence === "high").length,
        errors:        results.filter(r => r.error).length,
      },
    }), { status: 200, headers: CORS });

  } catch (err) {
    console.error("[dq-enrich] Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
  }
};

export const config = { path: "/api/dq-enrich" };
