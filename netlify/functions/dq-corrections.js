// ─── Cipher DQ — Corrections Store ───────────────────────────────────────────
// Read/write user-verified company corrections to Azure Blob.
// Blob path: crm-tokens/dq-corrections.json
// Structure: { corrections: [{ companyNamePattern, ...fields, addedBy, addedAt }] }

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const ACCOUNT   = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const SAS_TOKEN = process.env.AZURE_STORAGE_SAS_TOKEN;
const CONTAINER = process.env.AZURE_STORAGE_CONTAINER || "crm-tokens";
const BLOB_NAME = "dq-corrections.json";

function blobUrl() {
  const sas = SAS_TOKEN.startsWith("?") ? SAS_TOKEN : `?${SAS_TOKEN}`;
  return `https://${ACCOUNT}.blob.core.windows.net/${CONTAINER}/${BLOB_NAME}${sas}`;
}

async function readCorrections() {
  const res = await fetch(blobUrl());
  if (res.status === 404) return { corrections: [] };
  if (!res.ok) throw new Error(`Failed to read corrections: ${res.status}`);
  return res.json();
}

async function writeCorrections(data) {
  const body = JSON.stringify(data, null, 2);
  const res  = await fetch(blobUrl(), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "x-ms-blob-type": "BlockBlob",
      "Content-Length": String(Buffer.byteLength(body)),
    },
    body,
  });
  if (!res.ok) throw new Error(`Failed to write corrections: ${res.status}`);
}

export default async (req) => {
  if (req.method === "OPTIONS") return new Response("", { status: 200, headers: CORS });

  const ok  = d => new Response(JSON.stringify(d), { status: 200, headers: CORS });
  const err = (s, m) => new Response(JSON.stringify({ error: m }), { status: s, headers: CORS });

  try {
    // GET — return all corrections
    if (req.method === "GET") {
      const data = await readCorrections();
      return ok(data);
    }

    // POST — add a new correction
    if (req.method === "POST") {
      const body = await req.json();
      const { companyName, currentName, nameChanged, company_type,
              parent_system_name, notes, recentChanges, evidenceUrl, addedBy } = body;

      if (!companyName) return err(400, "companyName required");

      const data = await readCorrections();
      // Remove any existing correction for this company
      data.corrections = data.corrections.filter(
        c => c.companyName.toLowerCase() !== companyName.toLowerCase()
      );
      // Add new correction
      data.corrections.push({
        companyName:        companyName.trim(),
        companyNameLower:   companyName.trim().toLowerCase(),
        currentName:        currentName || companyName,
        nameChanged:        !!nameChanged,
        company_type:       company_type || null,
        parent_system_name: parent_system_name || null,
        notes:              notes || null,
        recentChanges:      recentChanges || null,
        evidenceUrl:        evidenceUrl || null,
        addedBy:            addedBy || "unknown",
        addedAt:            new Date().toISOString(),
        confidence:         "high", // user-verified = always high
        source:             "User verified",
      });

      await writeCorrections(data);
      return ok({ success: true, total: data.corrections.length });
    }

    // DELETE — remove a correction by companyName
    if (req.method === "DELETE") {
      const { companyName } = await req.json();
      if (!companyName) return err(400, "companyName required");

      const data = await readCorrections();
      const before = data.corrections.length;
      data.corrections = data.corrections.filter(
        c => c.companyNameLower !== companyName.toLowerCase()
      );
      await writeCorrections(data);
      return ok({ success: true, removed: before - data.corrections.length });
    }

    return err(405, "Method not allowed");

  } catch (e) {
    console.error("[dq-corrections]", e.message);
    return err(500, e.message);
  }
};

export const config = { path: "/api/dq-corrections" };
