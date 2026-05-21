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
    "nursing officer", "nurse executive", "nursing executive", "chief nurse", "chief nursing", " cno", "& cno", "nursing services", "vp of nursing services",
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
    "chief clinical officer", "chief clinical", "chief medical officer", "chief medical",
    " cmo", "& cmo",
    "evp chief clinical officer", "evp chief medical officer",
    "executive vp chief clinical", "executive vp chief medical",
    "executive vice president chief clinical", "executive vice president chief medical", "associate chief medical", "deputy chief medical",
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
    "financial operations", "financial planning", "financial services director",
    "cfo", "vp finance", "vp of finance", "vice president finance", "vice president of finance",
    "svp finance", "director of finance", "director finance",
    "director accounts payable", "director of accounts payable", "director collections",
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
    "chief strategy", "strategic planning", "corporate strategy", "enterprise strategy", "business transformation",
    "cso", "chief growth and strategy", "vp strategy", "vp of strategy", "vp, strategy",
    "vice president strategy", "vice president, strategy", "vice president of strategy",
    "svp strategy", "senior vp strategy", "director of strategy", "director strategy",
    "senior director strategy", "director strategic planning",
    "senior director strategic insights", "senior director of strategic insights",
    "vp market research and strategy", "vice president market research", "vice president of market research",
    "svp governance", "senior director transformation",
    "director of transformation", "director market strategy",
    "director payer strategy", "division senior vp market",
    "business lead",
  ]},

  { value: "Innovation", hints: [
    "chief digital", "chief data officer", "chief information officer",
    "chief technology", "chief healthcare technology", "digital transformation", "data science",
    "health informatics", "clinical informatics", "information systems",
    "cdio", "ciso", "chief information security", "information security officer",
    "vp digital", "vp of digital", "vice president digital",
    "svp digital", "senior vp digital", "senior vice president digital",
    "vp technology", "vp of technology", "vice president technology",
    "director of digital", "director digital", "digital director",
    "director technology", "director of technology", "technology director",
    "director information technology", "director of information technology",
    "director it ", "director of it", "it director",
    "senior director information technology",
    "director data", "director of data", "data director",
    "director analytics", "director of analytics", "analytics director", "data & analytics", "data and analytics",
    "director data analytics", "director of data analytics",
    "director data science", "director of data science",
    "senior director data", "senior director analytics",
    "head of data science", "head data science", "healthcare data", "director of healthcare data",
    "vp digital product", "associate director digital", "associate vp digital", "associate vice president of digital", "associate vice president digital",
    "senior director of digital", "director ai", "director of ai", "ai/ml", "machine learning director",
    "principal technology architect", "technology architect",
    "executive director digital", "director digital platforms",
    "hit strategist", "health information technology strategist", "senior medical director of health informatics",
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
    "case management", "complex care management", "care coordination", "care transitions", "complex care", "post acute", "post-acute",
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
    "patient access", "patient services", "patient registration", "patient scheduling", "patient admissions",
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
    "consumer experience", "consumer experience", "patient relations",
    "vp patient experience", "vice president patient experience",
    "head of customer experience", "director customer experience",
    "director patient relations",
  ]},

  { value: "Business Development", hints: [
    "business development",
    "chief growth officer",
    "network development", "network services", "provider relations", "referral development",
    "strategic partnerships",
    "director strategic partnerships", "vp strategic partnerships",
    "vice president strategic partnerships",
    "director provider network", "director of provider network",
    "director network development", "director referral development",
    "senior director business solutions", "senior director of business solutions", "director business solutions",
    "executive director business solutions", "executive director of business solutions",
    "vp of health plan business", "vice president of health plan business",
    "head of commercialization", "director commercialization", "pharmacy pricing", "director of pharmacy pricing",
    "senior director value creation", "senior director of value creation", "director value creation", "director of value creation",
    "vice president of development", "vp development",
    "avp strategic client growth", "avp - strategic client growth",
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
    "svp government programs", "senior vp government programs",
    "vp of market access", "vice president of market access",
    "division senior vp market corporate responsibility",
  ]},

  { value: "Service Line", hints: [
    "service line", "cardiovascular services", "oncology services", "cancer services",
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
    "clinical operations", "clinic operations", "clinical ops", "clinic ops",
    "director of nursing", "director nursing",
    "vp clinical", "vice president clinical",
    "nursing director",
    "director clinical excellence",
    "director rehab services", "director of rehab",
    "director rehabilitation", "director of rehabilitation",
    "director ancillary", "director of ancillary",
    "executive director ancillary", "executive director of ancillary",
    "director supply chain", "director of supply chain", "supply chain director",
    "director laboratory", "director of laboratory", "lab director",
    "pharmacy director", "director of pharmacy operations", "director pharmacy services",
    "director clinic operations", "director, clinic operations",
    "director operations", "director, operations", "director of operations",
    "assistant vp patient care", "assistant vice president patient care",
    "director patient care", "director of patient care",
    "director clinical nutrition",
    "director transportation", "transfer center", "patient logistics", "patient transport",
    "general manager of acute care", "acute care manager",
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
    "health information management director", "medical informatics",
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
  // Normalize: remove commas so "Vice President, Operations" matches "vice president operations"
  // Also normalize multiple spaces
  const t = title.toLowerCase().replace(/,/g, ' ').replace(/&/g, ' ').replace(/\s+/g, ' ').trim();
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
// ─── Sonnet inference — the backbone ─────────────────────────────────────────
// Claude Sonnet does the actual reasoning. Every contact that isn't a dead-certain
// rule match comes here. Sonnet gets:
//   - Job title
//   - Full company name + company type
//   - Email domain (reveals which subsidiary they're actually at)
//   - Peer context: what other contacts at same company are already tagged as
//   - CarePathIQ product context so it understands what "target" means
//
// Batch size: 10 contacts per call (Sonnet needs more reasoning space per contact)
async function inferPersonasBatch(contacts, peerContext = {}) {
  const personaList = PERSONA_MAP.map(p => `- ${p.value}`).join("\n");

  // Build rich contact descriptions with all available context
  const contactList = contacts.map((c, i) => {
    const emailDomain = c.email ? c.email.split("@")[1] || "" : "";
    const peers = peerContext[c.companyId] || [];
    const peerSummary = peers.length > 0
      ? ` | Peers at same company already tagged: ${peers.slice(0, 5).join(", ")}`
      : "";
    return `${i+1}. ID:${c.id}
   Title: "${c.jobtitle || "unknown"}"
   Company: "${c.companyName || "unknown"}" (${c.company_type || "unknown type"})
   Email domain: ${emailDomain || "unknown"}${peerSummary}`;
  }).join("\n\n");

  const prompt = `You are an expert healthcare sales intelligence analyst classifying contacts for CarePathIQ.

ABOUT CAREPATHIQ:
CarePathIQ sells post-acute care coordination software to health systems and hospitals. 
Our buyers are health system executives and leaders who make or influence decisions about:
- Post-acute network management and care transitions
- Clinical operations, case management, care coordination
- Population health and value-based care programs
- Finance, strategy, and technology/innovation

VALID PERSONAS — respond with EXACT values only:
${personaList}
- NON_ICP — use for: vendor employees, bedside clinicians (nurses/physicians/therapists at clinical level), HR, PR/communications, recruiters, administrative assistants, lab techs, paramedics, junior program coordinators

CLASSIFICATION RULES:
1. COMPANY TYPE IS CRITICAL:
   - At a health system (Parent System/Subsidiary/Medical Group/Independent): classify by functional role
   - At a Vendor/Supplier: almost always NON_ICP unless they are a C-suite decision maker you might sell TO
   - Unknown company type: use email domain and company name to infer

2. TITLE INTERPRETATION:
   - "Sales Executive/Director/VP" AT A HEALTH SYSTEM = Business Development (they sell the health system's services, they are YOUR buyer)
   - "Account Executive" AT A HEALTH SYSTEM = Business Development (same logic)
   - "VP of X" = use functional persona for X, not Executive/Leadership
   - "SVP of X" = same — functional persona
   - "Director of X" = functional persona for X
   - "Chief X Officer" = functional persona (CFO=Finance, CNO=Nursing Officer, COO=Operating Officer, CMO=Chief Clinical Officer/Medical Officer, CIO/CTO/CDO=Innovation, CSO=Strategy)
   - "President" (standalone) = Executive/Leadership
   - "President of [division/hospital]" = Executive/Leadership
   - "Vice President" (no function) = send to unclear unless context makes it obvious
   - "Senior Vice President" (no function) = send to unclear unless context makes it obvious

3. PEER CONTEXT: If contacts at the same company already have assigned personas, use that as signal for what roles exist there and what level of seniority is typical.

4. EMAIL DOMAIN: Can reveal which subsidiary a contact actually works at within a parent system (e.g., aurora.org vs advocatehealth.com both map to Advocate Aurora).

5. WHEN GENUINELY UNCLEAR: Return confidence "low" with your best guess — never return null as persona unless NON_ICP.

CONTACTS TO CLASSIFY:
${contactList}

Return ONLY a valid JSON array — no markdown, no explanation:
[
  {
    "id": "contact_id_string",
    "persona": "Exact Persona Value or NON_ICP",
    "confidence": "high|medium|low",
    "reasoning": "one sentence explaining why — reference title and company type"
  }
]`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
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
  if (!match) throw new Error(`No JSON array in response: ${clean.slice(0, 200)}`);

  const parsed = JSON.parse(match[0]);

  // Validate — ensure all returned personas are in the valid list or NON_ICP
  const validPersonas = new Set([...PERSONA_MAP.map(p => p.value), "NON_ICP"]);
  return parsed.map(r => {
    if (!validPersonas.has(r.persona)) {
      // Sonnet returned an invalid persona — downgrade to low confidence with note
      return { ...r, persona: null, confidence: "low",
        reasoning: `Invalid persona "${r.persona}" returned — needs manual review. Original: ${r.reasoning}` };
    }
    return r;
  });
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export default async (req) => {
  if (req.method === "OPTIONS") return new Response("", { status: 200, headers: CORS });
  if (req.method !== "POST")   return new Response("Method not allowed", { status: 405, headers: CORS });

  try {
    const { contacts, batchStart = 0, batchSize = 10, forceRefresh = false } = await req.json();
    if (!contacts?.length) return new Response(JSON.stringify({ error: "contacts array required" }), { status: 400, headers: CORS });

    const cache = forceRefresh ? {} : await loadCache();
    console.log(`[dq-persona] cache: ${Object.keys(cache).length} entries`);

    const batch      = contacts.slice(batchStart, batchStart + batchSize);
    const results    = [];
    const needClaude = [];

    // Pass 1: cache check + rule-based classification
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
          company_type: contact.company_type, email: contact.email || "",
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
          company_type: contact.company_type, email: contact.email || "",
          persona: classification.persona, confidence: classification.confidence,
          isNonICP: false, reasoning: classification.reasoning, method: "rule",
          processedAt: new Date().toISOString(),
        };
        results.push(r); cache[contact.id] = r;
        continue;
      }

      // Needs Sonnet
      needClaude.push(contact);
    }

    // Pass 2: Sonnet inference with peer context
    // One Sonnet call per function invocation (batchSize=10, ~4s, within Netlify 26s limit)
    if (needClaude.length > 0) {
      console.log(`[dq-persona] ${needClaude.length} contacts to Sonnet`);

      // Build peer context from cache (contacts already processed in previous batches)
      const peerContext = {};
      for (const r of Object.values(cache)) {
        if (r.persona && !r.isNonICP && r.companyId) {
          if (!peerContext[r.companyId]) peerContext[r.companyId] = [];
          if (!peerContext[r.companyId].includes(r.persona)) peerContext[r.companyId].push(r.persona);
        }
      }
      // Add rule-based results from this batch too
      for (const r of results) {
        if (r.persona && !r.isNonICP && r.companyId) {
          if (!peerContext[r.companyId]) peerContext[r.companyId] = [];
          if (!peerContext[r.companyId].includes(r.persona)) peerContext[r.companyId].push(r.persona);
        }
      }

      try {
        const inferred = await inferPersonasBatch(needClaude, peerContext);
        const inferMap = Object.fromEntries(inferred.map(r => [String(r.id), r]));

        for (const contact of needClaude) {
          const inf = inferMap[String(contact.id)] || {};
          const isNonICP = inf.persona === "NON_ICP";
          const r = {
            contactId:    contact.id,
            contactName:  contact.name,
            jobtitle:     contact.jobtitle,
            companyName:  contact.companyName,
            companyId:    contact.companyId,
            company_type: contact.company_type,
            email:        contact.email || "",
            persona:      isNonICP ? null : (inf.persona || null),
            confidence:   inf.confidence || "low",
            isNonICP,
            reasoning:    inf.reasoning || "",
            method:       "sonnet",
            processedAt:  new Date().toISOString(),
          };
          results.push(r);
          cache[contact.id] = r;
        }
      } catch (err) {
        console.error(`[dq-persona] Sonnet error:`, err.message);
        for (const contact of needClaude) {
          results.push({
            contactId: contact.id, contactName: contact.name,
            jobtitle: contact.jobtitle, companyName: contact.companyName,
            company_type: contact.company_type, email: contact.email || "",
            persona: null, confidence: "error", isNonICP: false,
            reasoning: `Sonnet error: ${err.message}`, method: "error",
          });
        }
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
        fromSonnet:     results.filter(r => r.method === "sonnet").length,
        icpWithPersona: icp.length,
        nonICP:         nonICP.length,
        unclear:        unclear.length,
        highConf:       results.filter(r => r.confidence === "high").length,
        medConf:        results.filter(r => r.confidence === "medium").length,
        lowConf:        results.filter(r => r.confidence === "low").length,
      },
    }), { status: 200, headers: CORS });

  } catch (err) {
    console.error("[dq-persona]", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
  }
};

export const config = { path: "/api/dq-persona" };
