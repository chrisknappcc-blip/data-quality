// ─── Cipher Data Quality — Company Enrichment ────────────────────────────────
// Uses Claude + web search to verify and update company hierarchy proposals.
// Called after dq-scan.js to add real-time research layer on top of static knowledge.
// Read-only output — returns updated proposals, never writes to HubSpot.

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL         = "claude-sonnet-4-20250514";

// ─── Call Claude with web search ─────────────────────────────────────────────
async function researchCompany(company) {
  const prompt = `You are researching a healthcare organization for a CRM data quality project.

Company in our CRM: "${company.name}"
Current domain: ${company.domain || "unknown"}
Current company_type in CRM: ${company.company_type || "not set"}
Current parent_system_name in CRM: ${company.parent_system_name || "not set"}
HubSpot tier: ${company.tier || "—"}

Please research this organization and answer:
1. Is this organization still operating under this name, or has it been rebranded/merged/acquired?
2. What is the current correct name as of 2025?
3. What type of organization is it? (Parent System / Subsidiary/Hospital / Medical Group / Independent)
4. If it's a subsidiary, what is the parent health system?
5. Are there any recent (2022-2025) mergers, acquisitions, or rebrandings we should know about?

Respond ONLY with a JSON object in this exact format (no markdown, no explanation):
{
  "currentName": "current official name as of 2025",
  "nameChanged": true or false,
  "previousName": "old name if changed, otherwise null",
  "company_type": "Parent System" or "Subsidiary/Hospital" or "Medical Group" or "Independent" or "Vendor/Supplier",
  "parent_system_name": "parent system name or null if independent/parent",
  "confidence": "high" or "medium" or "low",
  "notes": "brief explanation of findings, especially any mergers or rebrandings",
  "recentChanges": "description of any mergers/acquisitions/rebrandings since 2022, or null if none"
}`;

  const response = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1000,
      tools: [{
        type: "web_search_20250305",
        name: "web_search",
      }],
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error ${response.status}: ${err}`);
  }

  const data = await response.json();

  // Extract text from response — may include tool_use blocks
  let text = "";
  for (const block of (data.content || [])) {
    if (block.type === "text") text += block.text;
  }

  // Parse JSON from response
  const clean = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    // Try to extract JSON from within the text
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error(`Failed to parse Claude response: ${clean.slice(0, 200)}`);
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export default async (req) => {
  if (req.method === "OPTIONS") return new Response("", { status: 200, headers: CORS });
  if (req.method !== "POST")   return new Response("Method not allowed", { status: 405, headers: CORS });

  try {
    const { companies, batchStart = 0, batchSize = 10 } = await req.json();

    if (!companies?.length) {
      return new Response(JSON.stringify({ error: "companies array required" }), { status: 400, headers: CORS });
    }

    // Process a batch to stay within timeout limits
    // Netlify functions timeout at 26s — 10 companies × ~2s each = ~20s, safe
    const batch = companies.slice(batchStart, batchStart + batchSize);
    const results = [];

    console.log(`[dq-enrich] processing batch ${batchStart}-${batchStart + batch.length} of ${companies.length}`);

    for (const company of batch) {
      console.log(`[dq-enrich] researching: ${company.name}`);
      try {
        const research = await researchCompany(company);

        // Build enriched proposal
        const fieldUpdates = [];
        const flags = [];

        // Company name changed?
        if (research.nameChanged && research.currentName !== company.name) {
          flags.push({
            type: "NAME_CHANGED",
            severity: "high",
            message: `"${company.name}" is now "${research.currentName}" — HubSpot record name is outdated`,
            currentName: company.name,
            correctName: research.currentName,
            previousName: research.previousName,
          });
        }

        // company_type update needed?
        if (research.company_type && research.company_type !== (company.company_type || "")) {
          fieldUpdates.push({
            field: "company_type",
            currentValue: company.company_type || null,
            proposedValue: research.company_type,
          });
        }

        // parent_system_name update needed?
        const proposedParent = research.parent_system_name || null;
        if (proposedParent && proposedParent !== (company.parent_system_name || "")) {
          fieldUpdates.push({
            field: "parent_system_name",
            currentValue: company.parent_system_name || null,
            proposedValue: proposedParent,
          });
        }

        // Recent changes flag
        if (research.recentChanges) {
          flags.push({
            type: "RECENT_CHANGE",
            severity: "medium",
            message: research.recentChanges,
          });
        }

        results.push({
          companyId:   company.id,
          companyName: company.name,
          tier:        company.tier,
          domain:      company.domain,
          url:         company.url,
          research,
          fieldUpdates,
          flags,
          hasIssues:   flags.length > 0 || fieldUpdates.length > 0,
          confidence:  research.confidence,
          source:      "Claude + web search (live research)",
          enrichedAt:  new Date().toISOString(),
        });

      } catch (err) {
        console.error(`[dq-enrich] failed for ${company.name}:`, err.message);
        results.push({
          companyId:   company.id,
          companyName: company.name,
          error:       err.message,
          fieldUpdates: [],
          flags: [],
          hasIssues: false,
          confidence: "low",
          source: "Error — research failed",
        });
      }

      // Small gap between calls to avoid rate limits
      await new Promise(r => setTimeout(r, 500));
    }

    const nextBatch = batchStart + batchSize;
    const hasMore   = nextBatch < companies.length;

    return new Response(JSON.stringify({
      results,
      batchStart,
      batchEnd:   batchStart + batch.length,
      total:      companies.length,
      hasMore,
      nextBatch:  hasMore ? nextBatch : null,
      summary: {
        processed:    results.length,
        withIssues:   results.filter(r => r.hasIssues).length,
        nameChanges:  results.flatMap(r => r.flags).filter(f => f.type === "NAME_CHANGED").length,
        recentChanges:results.flatMap(r => r.flags).filter(f => f.type === "RECENT_CHANGE").length,
        errors:       results.filter(r => r.error).length,
      },
    }), { status: 200, headers: CORS });

  } catch (err) {
    console.error("[dq-enrich] Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
  }
};

export const config = { path: "/api/dq-enrich" };
