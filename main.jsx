// ─── Token Bridge ─────────────────────────────────────────────────────────────
// Reads the HubSpot OAuth token stored by Cipher's auth flow in Azure Blob.
// Read-only — no writes.

import { BlobServiceClient } from "@azure/storage-blob";

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const AZURE  = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CNAME  = process.env.AZURE_CONTAINER_NAME || "cipher-tokens";
const HS_ID  = process.env.HUBSPOT_CLIENT_ID;
const HS_SEC = process.env.HUBSPOT_CLIENT_SECRET;

async function refreshToken(userId, refreshToken) {
  const res = await fetch("https://api.hubapi.com/oauth/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type:"refresh_token", client_id:HS_ID, client_secret:HS_SEC, refresh_token:refreshToken }),
  });
  if (!res.ok) throw new Error("Failed to refresh HubSpot token");
  const data = await res.json();
  const tokenData = {
    access_token:  data.access_token,
    refresh_token: data.refresh_token || refreshToken,
    expires_at:    Date.now() + (data.expires_in || 1800) * 1000,
  };
  const client = BlobServiceClient.fromConnectionString(AZURE);
  const blob   = client.getContainerClient(CNAME).getBlockBlobClient(`hs-token--${userId}.json`);
  const str    = JSON.stringify(tokenData);
  await blob.upload(str, str.length, { blobHTTPHeaders:{ blobContentType:"application/json" } });
  return tokenData;
}

export default async (req) => {
  if (req.method === "OPTIONS") return new Response("", {status:200,headers:CORS});
  if (req.method !== "GET")    return new Response("Method not allowed", {status:405,headers:CORS});

  try {
    const userId = new URL(req.url).searchParams.get("userId");
    if (!userId) return new Response(JSON.stringify({error:"userId required"}), {status:400,headers:CORS});

    const client = BlobServiceClient.fromConnectionString(AZURE);
    const blob   = client.getContainerClient(CNAME).getBlockBlobClient(`hs-token--${userId}.json`);
    const dl     = await blob.download();
    const chunks = [];
    for await (const chunk of dl.readableStreamBody) chunks.push(chunk);
    const tokenData = JSON.parse(Buffer.concat(chunks).toString());

    if (!tokenData.access_token || Date.now() > (tokenData.expires_at - 60000)) {
      const refreshed = await refreshToken(userId, tokenData.refresh_token);
      return new Response(JSON.stringify({token:refreshed.access_token}), {status:200,headers:CORS});
    }

    return new Response(JSON.stringify({token:tokenData.access_token}), {status:200,headers:CORS});

  } catch (err) {
    console.error("[dq-token]", err.message);
    return new Response(
      JSON.stringify({error:"No HubSpot token found. Authorize via Cipher first."}),
      {status:401,headers:CORS}
    );
  }
};

export const config = { path: "/api/dq-token" };
