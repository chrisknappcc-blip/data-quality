// ─── Token Bridge ─────────────────────────────────────────────────────────────
// Reads the HubSpot OAuth token stored by Cipher in Azure Blob Storage.
// Uses AZURE_STORAGE_ACCOUNT_NAME + AZURE_STORAGE_SAS_TOKEN (same as Cipher).

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const ACCOUNT   = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const SAS_TOKEN = process.env.AZURE_STORAGE_SAS_TOKEN;
const CONTAINER = process.env.AZURE_STORAGE_CONTAINER || "crm-tokens";
const HS_ID     = process.env.HUBSPOT_CLIENT_ID;
const HS_SEC    = process.env.HUBSPOT_CLIENT_SECRET;

function blobUrl(blobName) {
  return `https://${ACCOUNT}.blob.core.windows.net/${CONTAINER}/${blobName}?${SAS_TOKEN}`;
}

async function readBlob(blobName) {
  const res = await fetch(blobUrl(blobName));
  if (!res.ok) throw new Error(`Blob not found: ${blobName} (${res.status})`);
  return res.json();
}

async function writeBlob(blobName, data) {
  const body = JSON.stringify(data);
  const res  = await fetch(blobUrl(blobName), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "x-ms-blob-type": "BlockBlob",
      "Content-Length": String(Buffer.byteLength(body)),
    },
    body,
  });
  if (!res.ok) throw new Error(`Failed to write blob: ${blobName} (${res.status})`);
}

async function refreshHubSpotToken(userId, refreshToken) {
  const res = await fetch("https://api.hubapi.com/oauth/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "refresh_token",
      client_id:     HS_ID,
      client_secret: HS_SEC,
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error("Failed to refresh HubSpot token");
  const data = await res.json();
  const tokenData = {
    access_token:  data.access_token,
    refresh_token: data.refresh_token || refreshToken,
    expires_at:    Date.now() + (data.expires_in || 1800) * 1000,
  };
  await writeBlob(`hs-token--${userId}.json`, tokenData);
  return tokenData;
}

export default async (req) => {
  if (req.method === "OPTIONS") return new Response("", { status: 200, headers: CORS });
  if (req.method !== "GET")    return new Response("Method not allowed", { status: 405, headers: CORS });

  try {
    const dqUserId = new URL(req.url).searchParams.get("userId");
    if (!dqUserId) return new Response(JSON.stringify({ error: "userId required" }), { status: 400, headers: CORS });

    // DQ uses a separate Clerk app so the user ID differs from Cipher's.
    // CIPHER_USER_ID env var maps the DQ Clerk user to the correct Cipher blob key.
    const blobUserId = process.env.CIPHER_USER_ID || dqUserId;

    // Try both blob naming patterns Cipher may have used
    let tokenData;
    try {
      tokenData = await readBlob(`hs-token--${blobUserId}.json`);
    } catch {
      tokenData = await readBlob(`tokens--${blobUserId}.json`);
    }

    // Refresh if expired (with 60s buffer)
    if (!tokenData.access_token || Date.now() > (tokenData.expires_at - 60000)) {
      const refreshed = await refreshHubSpotToken(blobUserId, tokenData.refresh_token);
      return new Response(JSON.stringify({ token: refreshed.access_token }), { status: 200, headers: CORS });
    }

    return new Response(JSON.stringify({ token: tokenData.access_token }), { status: 200, headers: CORS });

  } catch (err) {
    console.error("[dq-token]", err.message);
    return new Response(
      JSON.stringify({ error: "No HubSpot token found. Sign into Cipher and authorize HubSpot first." }),
      { status: 401, headers: CORS }
    );
  }
};

export const config = { path: "/api/dq-token" };
