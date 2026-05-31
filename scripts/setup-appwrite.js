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
    // 409 = already exists, that's fine
    if (data.code === 409) {
      console.log("  EXISTS: " + path);
      return data;
    }
    console.error("  ERROR " + res.status + ": " + (data.message || JSON.stringify(data)));
    return null;
  }
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function createCollection(collectionId, name, attrs) {
  console.log("\nCreating collection: " + name + " (" + collectionId + ")...");
  const colRes = await api("/databases/" + DATABASE_ID + "/collections", "POST", {
    databaseId: DATABASE_ID,
    collectionId: collectionId,
    name: name,
    read: ["any"],
    write: ["any"],
  });

  await delay(500);

  for (const attr of attrs) {
    const attrBase = "/databases/" + DATABASE_ID + "/collections/" + collectionId + "/attributes";
    let attrPath, attrBody;

    if (attr.type === "string") {
      attrPath = attrBase + "/string";
      attrBody = { key: attr.key, size: attr.size || 255, required: !!attr.required };
    } else if (attr.type === "float") {
      attrPath = attrBase + "/float";
      attrBody = { key: attr.key, required: !!attr.required };
    } else if (attr.type === "datetime") {
      attrPath = attrBase + "/datetime";
      attrBody = { key: attr.key, required: !!attr.required };
    } else if (attr.type === "integer") {
      attrPath = attrBase + "/integer";
      attrBody = { key: attr.key, required: !!attr.required };
    }

    console.log("  Creating " + attr.type + " attribute: " + attr.key);
    await api(attrPath, "POST", attrBody);
    await delay(300);
  }
}

async function setup() {
  console.log("Database ID: " + DATABASE_ID);
  console.log("Starting collection creation...\n");

  await createCollection("customers", "Customers", [
    { key: "name", type: "string", size: 255, required: true },
    { key: "phone", type: "string", size: 255, required: true },
    { key: "address", type: "string", size: 500, required: false },
    { key: "latitude", type: "float", required: false },
    { key: "longitude", type: "float", required: false },
    { key: "cropType", type: "string", size: 255, required: false },
  ]);

  await createCollection("items", "Items", [
    { key: "name", type: "string", size: 255, required: true },
    { key: "category", type: "string", size: 255, required: false },
    { key: "unit", type: "string", size: 255, required: false },
    { key: "tallyCode", type: "string", size: 255, required: false },
  ]);

  await createCollection("visits", "Visits", [
    { key: "customerId", type: "string", size: 255, required: true },
    { key: "observations", type: "string", size: 10000, required: false },
    { key: "latitude", type: "float", required: false },
    { key: "longitude", type: "float", required: false },
    { key: "locationName", type: "string", size: 500, required: false },
    { key: "nextVisitDate", type: "datetime", required: false },
    { key: "nextVisitTask", type: "string", size: 1000, required: false },
    { key: "visitDate", type: "datetime", required: false },
  ]);

  await createCollection("recommendations", "Recommendations", [
    { key: "visitId", type: "string", size: 255, required: true },
    { key: "itemId", type: "string", size: 255, required: false },
    { key: "customItem", type: "string", size: 255, required: false },
    { key: "dosage", type: "string", size: 255, required: false },
    { key: "quantity", type: "string", size: 255, required: false },
    { key: "notes", type: "string", size: 5000, required: false },
  ]);

  await createCollection("visit_photos", "Visit Photos", [
    { key: "visitId", type: "string", size: 255, required: true },
    { key: "url", type: "string", size: 2000, required: true },
    { key: "caption", type: "string", size: 1000, required: false },
  ]);

  console.log("\n\nDone! Wait ~30 seconds for attributes to be provisioned, then verify in the Appwrite Console.");
}

setup().catch(console.error);