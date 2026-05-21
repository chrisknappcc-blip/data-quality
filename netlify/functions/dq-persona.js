// ─── Cipher Data Quality — Contact Persona Inference ─────────────────────────
// Infers target_persona from job title + company type context.
// Three-pass approach:
//   1. Rule-based: clear matches handled instantly, free
//   2. Context-aware non-ICP detection: uses company_type to avoid false negatives
//   3. Claude Haiku batch inference: ambiguous titles only
//
// KEY PRINCIPLE: Never flag as non-ICP based on title alone.
// "Sales Executive" at a hospital = Business Development (target)
// "Sales Executive" at a Vendor/Supplier = Non-ICP
// Company type context is required for accurate classification.

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const ACCOUNT   = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const SAS_TOKEN = process.env.AZURE_STORAGE_SAS_TOKEN;
const CONTAINER = process.env.AZURE_STORAGE_CONTAINER || "crm-tokens";
const CACHE_BLOB = "dq-persona-cache.json";

// ─── Your 22 target personas with exhaustive title mapping ───────────────────
// Built from actual CRM titles pulled from your portal.
// Each hint is a substring match — longer = more specific = higher priority.
// Ordering within each persona matters: more specific hints first.
const PERSONA_MAP = [

  { value: "Nursing Officer", hints: [
    "nursing officer", "chief nurse", "chief nursing",
    "cno", "vp nursing", "vp of nursing", "vice president nursing", "vice president of nursing",
    "svp nursing", "svp chief nursing", "senior vice president nursing", "senior vp nursing",
    "assistant chief nursing", "associate chief nursing", "deputy chief nursing",
    "system cne", "system vp nursing", "system chief nurse",
  ]},

  { value: "Operating Officer", hints: [
    "chief operating", "operating officer",
    "coo", "vp operations", "vp of operations",
    "vice president operations", "vice president of operations",
    "svp operations", "senior vp operations", "system vp operations",
    "deputy chief operating", "associate chief operating",
  ]},

  { value: "Chief Clinical Officer", hints: [
    "chief clinical", "chief medical officer", "chief medical",
    "cmo", "cco", "associate chief medical", "deputy chief medical",
    "vice president and chief medical", "system chief medical",
    "vice chair of clinical", "vice chair clinical",
  ]},

  { value: "Medical Officer", hints: [
    "medical director",
    "associate medical director", "regional medical director",
    "market medical director", "site medical director", "senior medical director",
  ]},

  { value: "Physician Executive", hints: [
    "physician executive", "physician leader", "physician leadership",
    "chief of staff", "medical staff president", "president medical staff",
    "vice chair of research", "vice chair research",
  ]},

  { value: "Finance", hints: [
    "chief financial", "revenue cycle", "finance director", "finance officer",
    "cfo", "vp finance", "vp of finance", "vice president finance", "vice president of finance",
    "svp finance", "director of finance", "director finance",
    "director accounts payable", "director collections",
    "director revenue cycle", "regional director revenue cycle",
    "director of accounting", "director billing", "director coding",
    "director budget", "director fiscal", "director treasury", "controller",
    "executive director finance", "executive director of finance",
    "accounts payable director",
  ]},

  { value: "Executive/Leadership", hints: [
    "chief executive officer", "ceo",
    "president",
    "executive vice president", "system president", "hospital president",
    "president and chief executive", "president & chief executive",
    "executive director and",
    "executive director of ancillary", "executive director ancillary",
  ]},

  { value: "Strategy", hints: [
    "chief strategy", "strategic planning", "business transformation",
    "cso", "vp strategy", "vp of strategy", "vp, strategy",
    "vice president strategy", "vice president, strategy", "vice president of strategy",
    "svp strategy", "senior vp strategy", "director of strategy", "director strategy",
    "senior director strategy", "director strategic planning",
    "senior director strategic insights",
    "vp market research and strategy", "vice president market research",
    "svp governance", "senior director transformation",
    "director of transformation", "director market strategy",
    "director payer strategy", "division senior vp market",
    "business lead",
  ]},

  { value: "Innovation", hints: [
    "chief digital", "chief data officer", "chief information officer",
    "chief technology", "digital transformation", "data science",
    "health informatics", "clinical informatics",
    "cdio", "ciso",
    "vp digital", "vp of digital", "vice president digital",
    "svp digital", "senior vp digital", "senior vice president digital",
    "vp technology", "vp of technology", "vice president technology",
    "director of digital", "director digital", "digital director",
    "director technology", "director of technology", "technology director",
    "director information technology", "director of information technology",
    "director it ", "director of it", "it director",
    "senior director information technology",
    "director data", "director of data", "data director",
    "director analytics", "director of analytics", "analytics director",
    "director data analytics", "director of data analytics",
    "director data science", "director of data science",
    "senior director data", "senior director analytics",
    "head of data science", "head data science",
    "vp digital product", "associate director digital", "associate vp digital",
    "senior director of digital", "director ai",
    "principal technology architect", "technology architect",
    "executive director digital", "director digital platforms",
    "hit strategist", "senior medical director of health informatics",
    "vp of digital product engineering", "svp digital solutions",
    "vice president of design and innovation",
    "svp experience design", "chief product officer",
  ]},

  { value: "Population Health", hints: [
    "population health", "public health", "community health", "health equity",
    "disease management", "care management",
    "vp population health", "vice president population health",
    "director of population health", "director population health",
    "sr. director population health", "senior director population health",
    "director market community health", "director community health",
    "vp preventive", "director preventive",
    "population health analyst", "population health data analyst",
  ]},

  { value: "Quality Officer", hints: [
    "quality officer", "patient safety", "quality improvement",
    "quality and compliance", "quality compliance",
    "chief quality", "cqo",
    "vp quality", "vp of quality", "vp, quality",
    "vice president quality", "vice president, quality", "vice president of quality",
    "director quality", "director of quality", "quality director",
    "managing director quality", "managing director, quality",
    "executive director quality", "executive director of quality",
    "director patient safety", "director of patient safety",
    "director accreditation", "director of accreditation",
    "director compliance", "director of compliance", "compliance director",
    "director regulatory", "director of regulatory",
    "director risk management", "director of risk management",
    "director coding compliance", "area compliance",
  ]},

  { value: "Case Management", hints: [
    "case management", "care coordination", "post acute", "post-acute",
    "transitions of care", "discharge planning", "utilization management",
    "utilization review",
    "director case management", "director of case management",
    "vp case management", "vice president case management",
    "director care coordination", "director of care coordination",
    "director post acute", "director of post acute", "vp post acute",
    "director transitions of care", "director discharge planning",
    "director utilization management", "director utilization review",
    "director, utilization management",
    "executive director post acute", "executive director of post acute",
    "manager post acute", "manager-post acute", "manager, post acute",
  ]},

  { value: "Access/Patient Access", hints: [
    "patient access", "patient registration", "patient scheduling", "patient admissions",
    "director patient access", "director of patient access",
    "vp patient access", "vice president patient access",
    "regional director patient access",
    "director registration", "director scheduling",
    "director admissions", "director of admissions",
    "director referral", "director of referrals",
    "patient access manager", "access director", "director access", "director of access",
  ]},

  { value: "Patient Experience", hints: [
    "patient experience", "patient satisfaction", "patient engagement",
    "consumer experience", "patient relations",
    "vp patient experience", "vice president patient experience",
    "head of customer experience", "director customer experience",
    "director patient relations",
  ]},

  { value: "Business Development", hints: [
    "business development",
    "chief growth officer",
    "network development", "referral development",
    "strategic partnerships",
    "director strategic partnerships", "vp strategic partnerships",
    "vice president strategic partnerships",
    "director provider network", "director of provider network",
    "director network development", "director referral development",
    "senior director business solutions", "director business solutions",
    "executive director business solutions",
    "vp of health plan business", "vice president of health plan business",
    "head of commercialization", "director commercialization",
    "senior director value creation", "director value creation",
    "vice president of development", "vp development",
    "avp strategic client growth",
    "director market access",
    "regional director",
  ]},

  { value: "Value Based Care", hints: [
    "value based", "value-based", "accountable care",
    "managed care", "risk adjustment", "payer strategy",
    "aco director", "director aco",
    "managed care director", "director managed care",
    "director of managed care", "vp managed care",
    "director payer strategy", "director, payer strategy",
    "vp payer", "vice president payer",
    "health plan director", "director health plan",
    "vp health plan", "vice president health plan",
    "director risk adjustment",
    "director of value", "director value",
    "svp government programs", "senior vp government programs",
    "vp of market access", "vice president of market access",
    "division senior vp market corporate responsibility",
  ]},

  { value: "Service Line", hints: [
    "service line",
    "cardiovascular service", "heart and vascular", "cardiology service",
    "oncology service", "cancer service",
    "cardiovascular director", "director cardiovascular",
    "cardiology director", "director cardiology",
    "oncology director", "director oncology",
    "director cancer", "director of cancer",
    "orthopedic director", "director orthopedic",
    "neuroscience director", "director neuroscience",
    "director maternal child health", "director women services",
    "director maternal",
    "director emergency services", "director of emergency",
    "director emergency department",
  ]},

  { value: "Clinical Operations", hints: [
    "clinical operations", "director of nursing", "director nursing",
    "vp clinical", "vice president clinical",
    "nursing director",
    "director clinical excellence",
    "director rehab services", "director of rehab",
    "director rehabilitation", "director of rehabilitation",
    "director ancillary", "director of ancillary",
    "executive director ancillary", "executive director of ancillary",
    "director supply chain", "director of supply chain", "supply chain director",
    "director laboratory", "director of laboratory", "lab director",
    "director pharmacy", "director of pharmacy", "pharmacy director",
    "director clinic operations", "director, clinic operations",
    "director operations", "director, operations", "director of operations",
    "assistant vp patient care", "assistant vice president patient care",
    "director patient care", "director of patient care",
    "director clinical nutrition",
    "director transportation",
  ]},

  { value: "Emergency Department", hints: [
    "emergency department", "emergency medicine", "trauma director",
    "emergency services director", "director emergency services",
  ]},

  { value: "Medical Group", hints: [
    "medical group", "physician group",
    "vp medical group", "vice president medical group",
  ]},

  { value: "Medical Information", hints: [
    "health information management", "him director", "director him",
    "health information technology", "medical informatics",
  ]},

  { value: "Ambulatory/Urgent Care", hints: [
    "ambulatory", "urgent care", "outpatient",
  ]},

];
// BE CONSERVATIVE — only add titles where you are 100% certain.
const ALWAYS_NON_ICP = [
  // Bedside clinical (not decision makers, not buyers)
  "paramedic", "emergency medical technician", "emt",
  "registered nurse", " rn ", "clinical nurse ", "staff nurse",
  "licensed practical nurse", "lpn",
  "physical therapist", "occupational therapist", "speech therapist",
  "respiratory therapist", "radiology technician", "radiologic technologist",
  "sonographer", "ultrasound technician", "lab technician", "laboratory technician",
  "phlebotomist", "pharmacy technician",
  "medical assistant", "certified medical assistant", "cma",
  "clinical instructor", "nursing instructor",
  "paramedic", "emt-", "emt ",
  // Hard vendor signals (never at a health system)
  "demand generation manager", "account-based marketing",
  "field marketing", "global marketing director", "global head market access",
  "sdr ", "sdr,", "sales development representative",
  "lead product designer", "ui designer", "ux designer",
  "agile delivery manager", "scrum master",
  "talent acquisition", "recruiter", "recruiting",
  "media relations", "media relations specialist", "pr specialist",
  "patient data coordinator", // data entry, not strategic
  "administrative coordinator iii", // very junior admin
  "technical secretary",
  "program coordinator", // usually junior coordinator, not strategic
  "assistant to the president", // EA/admin
  "executive assistant to",
  "administrative assistant",
];

// ─── Titles that require company context to classify correctly ────────────────
// These could be health system ICP or vendor depending on company.
const CONTEXT_DEPENDENT = [
  "sales executive", "sales director", "vice president of sales", "vp of sales",
  "vp sales", "svp sales", "account executive", "account manager",
  "enterprise account executive", "senior client executive", "client executive",
  "senior solutions consultant", "solutions consultant", "principal consultant",
  "analytics consultant", "senior analytics consultant",
  "product manager", "senior product manager", "product owner",
  "program manager", "senior project manager", "project manager",
  "director of communications", "communications director",
  "partner", "principal",
  "founder", "co-founder",
  "consultant", "managing consultant",
  "general manager",
];

// ─── Vendor company type signals ─────────────────────────────────────────────
const VENDOR_COMPANY_TYPES = ["Vendor/Supplier"];
const HEALTH_SYSTEM_TYPES  = ["Parent System","Subsidiary/Hospital","Medical Group","Independent"];

function blobUrl(name) {
  const sas = SAS_TOKEN.startsWith("?") ? SAS_TOKEN : `?${SAS_TOKEN}`;
  return `https://${ACCOUNT}.blob.core.windows.net/${CONTAINER}/${name}${sas}`;
}

async function loadCache() {
  try {
    const res = await fetch(blobUrl(CACHE_BLOB));
    if (res.status === 404) return {};
    if (!res.ok) return {};
    return await res.json();
  } catch { return {}; }
}

async function saveCache(cache) {
  try {
    const body = JSON.stringify(cache);
    await fetch(blobUrl(CACHE_BLOB), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-ms-blob-type": "BlockBlob",
        "Content-Length": String(Buffer.byteLength(body)),
      },
      body,
    });
  } catch (e) { console.error("[dq-persona] cache save failed:", e.message); }
}

// ─── Rule-based persona matching ─────────────────────────────────────────────
// Hints that should NOT match if preceded by these prefixes
// key = hint, value = array of prefixes that disqualify it
const HINT_EXCLUSIONS = {
  "president":    ["vice president", "vice-president", "assistant to the president"],
  "chief medical": ["assistant chief medical", "associate chief medical"],
};

function ruleMatch(title) {
  if (!title) return null;
  const t = title.toLowerCase();
  let bestMatch = null;
  let bestScore = 0;

  for (const persona of PERSONA_MAP) {
    for (const hint of persona.hints) {
      if (!t.includes(hint)) continue;
      if (hint.length <= bestScore) continue;

      // Check exclusions — some hints shouldn't fire if preceded by disqualifying prefix
      const exclusions = HINT_EXCLUSIONS[hint];
      if (exclusions && exclusions.some(exc => t.includes(exc))) continue;

      bestScore = hint.length;
      bestMatch = persona.value;
    }
  }

  return bestMatch ? { persona: bestMatch, confidence: "high", score: bestScore } : null;
}

// ─── Context-aware non-ICP detection ─────────────────────────────────────────
function classifyContact(title, companyType) {
  if (!title) return { send_to_claude: true, reason: "no title" };
  const t = title.toLowerCase();
  const isVendorCompany        = VENDOR_COMPANY_TYPES.includes(companyType);
  const isHealthSystemCompany  = HEALTH_SYSTEM_TYPES.includes(companyType);
  const companyTypeKnown       = !!companyType;

  // Step 1: Check always-non-ICP titles (regardless of company)
  const alwaysNonICP = ALWAYS_NON_ICP.some(sig => t.includes(sig));
  if (alwaysNonICP) {
    return { isNonICP: true, confidence: "high",
      reasoning: `Title "${title}" indicates individual contributor or non-ICP role` };
  }

  // Step 2: Rule-based persona match — try this before worrying about vendor status
  const rule = ruleMatch(title);
  if (rule) {
    // Even vendor company employees with clear health-system titles get assigned
    // (they may be ex-health-system or dual-role — Claude can refine)
    if (isVendorCompany) {
      // Vendor company + clear ICP title = flag for Claude with context
      return { send_to_claude: true,
        reason: `Vendor company but title "${title}" maps to ${rule.persona} — needs context check` };
    }
    return { persona: rule.persona, confidence: "high", method: "rule",
      reasoning: `Title "${title}" directly maps to ${rule.persona}` };
  }

  // Step 3: Context-dependent titles
  const contextDep = CONTEXT_DEPENDENT.some(sig => t.includes(sig));
  if (contextDep) {
    if (isVendorCompany) {
      return { isNonICP: true, confidence: "high",
        reasoning: `Title "${title}" at a Vendor/Supplier company = non-ICP` };
    }
    if (isHealthSystemCompany) {
      // Context-dependent at a health system = likely ICP, send to Claude for specifics
      return { send_to_claude: true,
        reason: `"${title}" at health system — could be Business Development or other ICP persona` };
    }
    // Company type unknown
    return { send_to_claude: true,
      reason: `"${title}" is context-dependent and company type unknown` };
  }

  // Step 4: Title not matched by rules — send to Claude
  return { send_to_claude: true, reason: `Title "${title}" not matched by rules` };
}

// ─── Claude batch inference ───────────────────────────────────────────────────
async function inferPersonasBatch(contacts) {
  const personaList = PERSONA_MAP.map(p => `- ${p.value}`).join("\n");

  const contactList = contacts.map((c, i) =>
    `${i+1}. ID:${c.id} | Title: "${c.jobtitle}" | Company: "${c.companyName || "unknown"}" | Company Type: ${c.company_type || "unknown"}`
  ).join("\n");

  const prompt = `You are classifying healthcare CRM contacts into sales personas for CarePathIQ, a post-acute care coordination platform sold to health systems and hospitals.

VALID PERSONAS — use EXACT values:
${personaList}
- NON_ICP (use for vendor sales/marketing staff, bedside clinicians, HR, PR, junior admins — but NOT for health system employees with strategic titles)

CRITICAL CONTEXT RULES:
- "Sales Executive", "Account Executive", "Client Executive" at a HEALTH SYSTEM = Business Development (they are selling or developing the health system's services/network — they are your buyer)
- "Sales Executive" at a VENDOR company = NON_ICP
- "Solutions Consultant", "Analytics Consultant" at a health system = could be Innovation or Strategy
- "Program Manager" at a health system = could be Population Health, Case Management, or Clinical Operations depending on context
- "Director of Communications" at a health system = likely Strategy or NON_ICP (not a buyer)
- "General Manager" at a health system acute care unit = Clinical Operations or Operating Officer
- "Principal" at a health system = likely Strategy or Business Development
- "Founder" at a vendor company = NON_ICP
- "Consultant" roles at health systems = send to Innovation or Strategy if senior, NON_ICP if junior
- Always prefer a specific functional persona over Executive/Leadership unless the title is purely CEO/President

CONTACTS:
${contactList}

Return ONLY a JSON array:
[{"id":"contact_id","persona":"Exact Value or NON_ICP","confidence":"high|medium|low","reasoning":"one sentence"}]`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const e = await res.text();
    throw new Error(`Claude ${res.status}: ${e.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  const clean = text.replace(/```json|```/g, "").trim();
  const match = clean.match(/\[[\s\S]*\]/);
  if (!match) throw new Error(`No JSON array: ${clean.slice(0, 200)}`);
  return JSON.parse(match[0]);
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export default async (req) => {
  if (req.method === "OPTIONS") return new Response("", { status: 200, headers: CORS });
  if (req.method !== "POST")   return new Response("Method not allowed", { status: 405, headers: CORS });

  try {
    const { contacts, batchStart = 0, batchSize = 50, forceRefresh = false } = await req.json();
    if (!contacts?.length) return new Response(JSON.stringify({ error: "contacts array required" }), { status: 400, headers: CORS });

    const cache = forceRefresh ? {} : await loadCache();
    console.log(`[dq-persona] cache: ${Object.keys(cache).length} entries`);

    const batch      = contacts.slice(batchStart, batchStart + batchSize);
    const results    = [];
    const needClaude = [];

    // Pass 1 + 2: cache check, rule match, context-aware classification
    for (const contact of batch) {
      if (cache[contact.id] && !forceRefresh) {
        results.push({ ...cache[contact.id], fromCache: true });
        continue;
      }

      const classification = classifyContact(contact.jobtitle, contact.company_type);

      if (classification.isNonICP) {
        const r = {
          contactId: contact.id, contactName: contact.name,
          jobtitle: contact.jobtitle, companyName: contact.companyName,
          company_type: contact.company_type,
          persona: null, confidence: classification.confidence,
          isNonICP: true, reasoning: classification.reasoning, method: "rule",
          processedAt: new Date().toISOString(),
        };
        results.push(r); cache[contact.id] = r;
        continue;
      }

      if (classification.persona) {
        const r = {
          contactId: contact.id, contactName: contact.name,
          jobtitle: contact.jobtitle, companyName: contact.companyName,
          company_type: contact.company_type,
          persona: classification.persona, confidence: classification.confidence,
          isNonICP: false, reasoning: classification.reasoning, method: "rule",
          processedAt: new Date().toISOString(),
        };
        results.push(r); cache[contact.id] = r;
        continue;
      }

      // Needs Claude
      needClaude.push(contact);
    }

    // Pass 3: Claude batch inference
    if (needClaude.length > 0) {
      console.log(`[dq-persona] ${needClaude.length} to Claude`);
      for (let i = 0; i < needClaude.length; i += 20) {
        const sub = needClaude.slice(i, i + 20);
        try {
          const inferred  = await inferPersonasBatch(sub);
          const inferMap  = Object.fromEntries(inferred.map(r => [r.id, r]));
          for (const contact of sub) {
            const inf = inferMap[contact.id] || {};
            const r = {
              contactId: contact.id, contactName: contact.name,
              jobtitle: contact.jobtitle, companyName: contact.companyName,
              company_type: contact.company_type,
              persona:    inf.persona === "NON_ICP" ? null : (inf.persona || null),
              confidence: inf.confidence || "low",
              isNonICP:   inf.persona === "NON_ICP",
              reasoning:  inf.reasoning || "",
              method:     "claude",
              processedAt: new Date().toISOString(),
            };
            results.push(r); cache[contact.id] = r;
          }
        } catch (err) {
          console.error(`[dq-persona] sub-batch error:`, err.message);
          for (const contact of sub) {
            results.push({
              contactId: contact.id, contactName: contact.name,
              jobtitle: contact.jobtitle, companyName: contact.companyName,
              persona: null, confidence: "error", isNonICP: false,
              reasoning: `Error: ${err.message}`, method: "error",
            });
          }
        }
        await new Promise(r => setTimeout(r, 300));
      }
    }

    await saveCache(cache);

    const nextBatch = batchStart + batchSize;
    const hasMore   = nextBatch < contacts.length;
    const icp       = results.filter(r => r.persona && !r.isNonICP);
    const nonICP    = results.filter(r => r.isNonICP);
    const unclear   = results.filter(r => !r.persona && !r.isNonICP && r.confidence !== "error");

    return new Response(JSON.stringify({
      results, batchStart,
      batchEnd:  batchStart + batch.length,
      total:     contacts.length,
      hasMore,
      nextBatch: hasMore ? nextBatch : null,
      summary: {
        processed:      results.length,
        fromCache:      results.filter(r => r.fromCache).length,
        fromRule:       results.filter(r => r.method === "rule").length,
        fromClaude:     results.filter(r => r.method === "claude").length,
        icpWithPersona: icp.length,
        nonICP:         nonICP.length,
        unclear:        unclear.length,
        highConf:       results.filter(r => r.confidence === "high").length,
      },
    }), { status: 200, headers: CORS });

  } catch (err) {
    console.error("[dq-persona]", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
  }
};

export const config = { path: "/api/dq-persona" };
