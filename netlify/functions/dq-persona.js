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
    "chief nursing officer", "cno", "chief nurse executive", "chief nursing executive",
    "svp chief nursing", "vp nursing", "vice president nursing", "vice president of nursing",
    "vp of nursing", "svp nursing", "senior vice president nursing", "senior vp nursing",
    "assistant chief nursing", "associate chief nursing", "deputy chief nursing",
    "nursing officer", "system cne", "system vp nursing", "system chief nurse",
  ]},

  { value: "Operating Officer", hints: [
    "chief operating officer", "coo", "chief operations officer",
    "vp operations", "vice president operations", "vice president of operations",
    "vp of operations", "svp operations", "senior vp operations",
    "system vp operations", "deputy chief operating", "associate chief operating",
    "operating officer",
  ]},

  { value: "Chief Clinical Officer", hints: [
    "chief clinical officer", "chief medical officer", "cmo", "cco",
    "associate chief medical officer", "associate cmo", "deputy chief medical",
    "vice president and chief medical", "vp chief medical",
    "vice chair of clinical affairs", "vice chair clinical",
    "chief of clinical", "system chief medical",
  ]},

  { value: "Medical Officer", hints: [
    "medical director", "associate medical director", "regional medical director",
    "market medical director", "site medical director", "senior medical director",
    "medical director cancer", "medical director dignity",
  ]},

  { value: "Physician Executive", hints: [
    "physician executive", "physician leader", "physician leadership",
    "chief of staff", "medical staff president", "president medical staff",
    "vice chair of research", "vice chair research",
  ]},

  { value: "Finance", hints: [
    "chief financial officer", "cfo", "vice president finance", "vp finance",
    "vp of finance", "vice president of finance", "svp finance",
    "director of finance", "director finance", "finance director",
    "director accounts payable", "director of accounts payable",
    "director collections", "director revenue cycle", "regional director revenue cycle",
    "revenue cycle director", "accounts payable", "director of accounting",
    "director billing", "director coding", "director coding compliance",
    "system coding compliance", "director budget", "director fiscal",
    "director treasury", "controller", "chief financial",
  ]},

  { value: "Executive/Leadership", hints: [
    "president and chief executive officer", "president & chief executive officer",
    "chief executive officer", "ceo", "president, sequoia", "president, dominican",
    "president aslmc", "president medical center", "president hospital",
    "president health", "integrated dual programs president",
    "executive director and", "executive vice president",
    "system president", "hospital president",
    "executive director of ancillary", "executive director ancillary",
  ]},

  { value: "Strategy", hints: [
    "chief strategy officer", "cso", "chief strategy",
    "vice president strategy", "vp strategy", "vp of strategy",
    "vice president of strategy", "senior vp strategy",
    "director of strategy", "director strategy",
    "senior director strategy", "strategic planning director",
    "director strategic planning", "senior director strategic insights",
    "vp market research and strategy", "vice president market research and strategy",
    "svp governance", "senior vp governance", "senior director transformation",
    "director of transformation", "chief strategy and innovation",
    "director market strategy", "director payer strategy",
    "division senior vp market", "senior vp market",
    "business transformation", "business lead",
  ]},

  { value: "Innovation", hints: [
    "chief digital officer", "cdo", "chief data officer",
    "chief digital and technology officer", "chief data and digital",
    "chief digital & technology", "chief technology officer", "cto",
    "chief information officer", "cio", "chief information security officer", "ciso",
    "chief product officer", "cpo",
    "vp digital", "vice president digital", "vp of digital",
    "svp digital", "senior vp digital", "senior vice president digital",
    "vp technology", "vice president technology", "vp of technology",
    "director of digital", "director digital", "digital director",
    "director technology", "director of technology", "technology director",
    "director information technology", "director of information technology",
    "director it", "director of it", "it director",
    "senior director information technology", "senior director it",
    "director data", "director of data", "data director",
    "director analytics", "director of analytics", "analytics director",
    "director data analytics", "director of data analytics",
    "director data science", "director of data science",
    "senior director data", "senior director analytics",
    "head of data science", "head data science",
    "director healthcare data", "director of healthcare data",
    "vp digital product", "vice president digital product",
    "associate director digital", "associate director of digital",
    "associate vp digital", "associate vice president digital",
    "senior director of digital", "director ai", "director of ai",
    "director ai/ml", "director of ai/ml",
    "site director information technology", "site director it",
    "principal technology architect", "technology architect",
    "executive director digital", "executive director of digital",
    "associate director digital platforms", "director digital platforms",
    "health information technology strategist", "hit strategist",
    "senior medical director of health informatics",
    "medical director health informatics", "director health informatics",
    "chief research data science", "head of data science and ai",
    "senior director data science and analytics",
    "vp of digital product engineering", "svp digital solutions",
    "senior vice president digital solutions",
    "vice president of design and innovation", "director of design and innovation",
    "svp experience design", "senior vp experience design",
    "senior vice president of experience design",
    "chief product officer",
  ]},

  { value: "Population Health", hints: [
    "population health", "public health director", "community health director",
    "director community health", "director of community health",
    "vp population health", "vice president population health",
    "director market of community health", "director market community health",
    "health equity", "vp preventive", "director preventive",
    "population health management", "population health analyst",
    "population health data analyst",
    "sr. director population health", "senior director population health",
  ]},

  { value: "Quality Officer", hints: [
    "chief quality officer", "cqo",
    "vice president quality", "vp quality", "vp of quality",
    "director quality", "director of quality", "quality director",
    "managing director quality", "managing director, quality",
    "executive director quality", "executive director of quality",
    "director patient safety", "director of patient safety",
    "director accreditation", "director of accreditation",
    "director compliance", "director of compliance", "compliance director",
    "director regulatory", "director of regulatory",
    "director risk management", "director of risk management",
    "director system coding compliance", "director coding compliance",
    "area compliance", "quality and compliance",
    "quality improvement", "director quality improvement",
    "managing director, quality and compliance",
  ]},

  { value: "Case Management", hints: [
    "case management director", "director case management",
    "director of case management", "vp case management",
    "vice president case management", "care coordination director",
    "director care coordination", "director of care coordination",
    "post acute", "post-acute", "director post acute",
    "director of post acute", "vp post acute",
    "transitions of care", "director transitions of care",
    "discharge planning", "director discharge planning",
    "utilization management director", "director utilization management",
    "director utilization review", "director of utilization management",
    "director utilization", "director, utilization management",
    "executive director post acute", "executive director of post acute network",
    "manager post acute", "manager-post acute", "manager, post acute",
  ]},

  { value: "Access/Patient Access", hints: [
    "patient access director", "director patient access",
    "director of patient access", "vp patient access",
    "vice president patient access", "regional director patient access",
    "director registration", "director scheduling",
    "director admissions", "director of admissions",
    "director referral", "director of referrals",
    "patient access manager", "access director",
    "director access", "director of access",
  ]},

  { value: "Patient Experience", hints: [
    "patient experience", "director patient experience",
    "director of patient experience", "vp patient experience",
    "patient satisfaction director", "patient engagement director",
    "director patient engagement", "consumer experience",
    "head of customer experience", "director customer experience",
    "patient relations director", "director patient relations",
  ]},

  { value: "Business Development", hints: [
    "chief growth officer", "chief business development",
    "vice president business development", "vp business development",
    "vp of business development", "director business development",
    "director of business development", "business development director",
    "avp strategic client growth", "avp - strategic client growth",
    "vice president of development", "vp development",
    "strategic partnerships", "director strategic partnerships",
    "director of strategic partnerships", "head of strategic partnerships",
    "vp strategic partnerships", "vice president strategic partnerships",
    "director provider network", "director of provider network",
    "network development", "director network development",
    "referral development", "director referral development",
    "senior director business solutions", "director business solutions",
    "director of business solutions", "executive director business solutions",
    "executive director of business solutions",
    "vp of health plan business", "vice president of health plan business",
    "director market access", "global head market access",
    "head of commercialization", "director commercialization",
    "senior director value creation", "director value creation",
    "regional director", // in health system context = business dev / market dev
  ]},

  { value: "Value Based Care", hints: [
    "value based care", "value-based care", "vbc",
    "accountable care", "aco director", "director aco",
    "managed care director", "director managed care",
    "director of managed care", "vp managed care",
    "payer strategy", "director payer strategy", "director, payer strategy",
    "vp payer", "vice president payer",
    "health plan director", "director health plan",
    "vp health plan", "vice president health plan",
    "risk adjustment", "director risk adjustment",
    "director of value", "director value",
    "market access director", "director market access",
    "svp government programs", "senior vp government programs",
    "vp of market access", "vice president of market access",
    "vice president of market access and reimbursement",
    "division senior vp market corporate responsibility",
  ]},

  { value: "Service Line", hints: [
    "service line director", "director service line",
    "cardiovascular director", "director cardiovascular",
    "cardiology director", "director cardiology",
    "oncology director", "director oncology",
    "director cancer", "director of cancer",
    "orthopedic director", "director orthopedic",
    "neuroscience director", "director neuroscience",
    "director maternal child health", "director women services",
    "director women's services", "director maternal",
    "director emergency services", "director of emergency",
    "director emergency department",
  ]},

  { value: "Clinical Operations", hints: [
    "director nursing", "director of nursing", "nursing director",
    "vp clinical operations", "vice president clinical operations",
    "director clinical operations", "director of clinical operations",
    "clinical operations director", "director clinical excellence",
    "director rehab services", "director of rehab",
    "director rehabilitation", "director of rehabilitation",
    "director ancillary", "director of ancillary",
    "executive director ancillary", "executive director of ancillary",
    "director supply chain", "director market supply chain",
    "director of supply chain", "supply chain director",
    "director laboratory", "director of laboratory", "lab director",
    "director pharmacy", "director of pharmacy", "pharmacy director",
    "director clinic operations", "director, clinic operations",
    "director operations", "director, operations",
    "chief operating officer (st johns", // hospital-level COO
    "director transportation", "director, transportation",
    "assistant vp patient care", "assistant vice president patient care",
    "director patient care", "director of patient care",
    "director maternal child", "director market of clinical nutrition",
    "director clinical nutrition",
  ]},

  { value: "Emergency Department", hints: [
    "emergency department director", "director emergency department",
    "director of emergency medicine", "emergency medicine director",
    "trauma director", "director trauma",
    "emergency services director", "director emergency services",
    "director, emergency services",
  ]},

  { value: "Medical Group", hints: [
    "medical group director", "director medical group",
    "physician group director", "director physician group",
    "medical group operations", "vp medical group",
    "vice president medical group",
  ]},

  { value: "Medical Information", hints: [
    "health information management", "him director", "director him",
    "director health information management", "director of health information",
    "director market health information", "health information director",
  ]},

  { value: "Ambulatory/Urgent Care", hints: [
    "ambulatory director", "director ambulatory",
    "director of ambulatory", "vp ambulatory",
    "urgent care director", "director urgent care",
    "director outpatient", "outpatient director",
    "director of ambulatory care", "ambulatory care director",
  ]},

];

// ─── Titles that are UNAMBIGUOUSLY non-ICP regardless of company type ─────────
// These people are individual contributors with no buying influence or
// are clearly vendor-side regardless of context.
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
function ruleMatch(title) {
  if (!title) return null;
  const t = title.toLowerCase();
  let bestMatch = null;
  let bestScore = 0;

  for (const persona of PERSONA_MAP) {
    for (const hint of persona.hints) {
      if (t.includes(hint) && hint.length > bestScore) {
        bestScore = hint.length;
        bestMatch = persona.value;
      }
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
