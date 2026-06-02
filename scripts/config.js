require("dotenv").config();

const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const STORAGE_BUCKET_ID = process.env.APPWRITE_STORAGE_BUCKET_ID || "visit-photos";

if (!PROJECT_ID || !ENDPOINT || !API_KEY || !DATABASE_ID) {
  console.error("Missing required env vars. Check APPWRITE_PROJECT_ID, APPWRITE_ENDPOINT, APPWRITE_API_KEY, APPWRITE_DATABASE_ID");
  process.exit(1);
}

const headers = {
  "Content-Type": "application/json",
  "X-Appwrite-Project": PROJECT_ID,
  "X-Appwrite-Key": API_KEY,
};

async function api(path, method, body) {
  const url = ENDPOINT + path;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204 || res.status === 404) return { ok: true };
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (res.ok) return data;
  console.error("  ERROR " + res.status + ": " + (data.message || JSON.stringify(data)));
  return null;
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { PROJECT_ID, ENDPOINT, API_KEY, DATABASE_ID, STORAGE_BUCKET_ID, headers, api, delay };