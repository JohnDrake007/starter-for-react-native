const { ENDPOINT, DATABASE_ID, headers, api, delay } = require("./config");

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