const PROJECT_ID = "6a1bf181002ff774402d";
const ENDPOINT = "https://sgp.cloud.appwrite.io/v1";
const API_KEY = "standard_115bd37902061debdcc3117f5241878b58d56e6dabfaf0c055400313212b0314424d7362cc38cbe8dc0e26b6c3a53e1677e77bb9927cb7e52d5d3e1ae87ac63b7ed6ec04d219390159f30c00c539e1689669c1269a31bc63ac2ff471005f771fd19b56f53c2f761c4264fb0f30fa230436307768f9c3a53841b2d28187a4d973";
const DATABASE_ID = "6a1c0a8a0029a3ca0c82";

const headers = {
  "Content-Type": "application/json",
  "X-Appwrite-Project": PROJECT_ID,
  "X-Appwrite-Key": API_KEY,
};

async function api(path, method, body) {
  const url = ENDPOINT + path;
  const res = await fetch(url, {
    method: method,
    headers: headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (res.ok) {
    console.log("  OK: " + method + " " + path);
    return data;
  } else {
    console.error("  ERROR " + res.status + ": " + (data.message || JSON.stringify(data)));
    return null;
  }
}

async function fixPermissions() {
  const collections = ["customers", "items", "visits", "recommendations", "visit_photos"];

  for (const colId of collections) {
    console.log("Setting permissions for: " + colId + "...");
    await api("/databases/" + DATABASE_ID + "/collections/" + colId, "PATCH", {
      read: ["any"],
      write: ["any"],
      create: ["any"],
      update: ["any"],
      delete: ["any"],
      documentSecurity: false,
    });
  }

  console.log("\nDone! If permissions still show errors, update them manually in the Appwrite Console:");
  console.log("  https://sgp.cloud.appwrite.io → Database → Field Agent → Each Collection → Settings → Permissions");
  console.log("  Enable Read/Write/Create/Update/Delete for 'Any' role on each collection.");
}

fixPermissions().catch(console.error);