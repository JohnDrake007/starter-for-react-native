import { Client, Databases, ID, Permission, Role } from "react-native-appwrite";

const client = new Client()
  .setProject("6a1bf181002ff774402d")
  .setEndpoint("https://sgp.cloud.appwrite.io/v1");

const databases = new Databases(client);

const DATABASE_ID = "field-agent";

async function setup() {
  console.log("Creating database...");
  try {
    await databases.create(DATABASE_ID, "Field Agent");
    console.log("Database created:", DATABASE_ID);
  } catch (e: any) {
    if (e.message?.includes("already exists")) {
      console.log("Database already exists, skipping.");
    } else {
      console.error("Error creating database:", e.message);
    }
  }

  console.log("\nCreating collections...");

  // --- Customers ---
  console.log("Creating customers collection...");
  try {
    await databases.createCollection(DATABASE_ID, "customers", "Customers", [
      Permission.read(Role.any()),
      Permission.create(Role.any()),
      Permission.update(Role.any()),
      Permission.delete(Role.any()),
    ]);
  } catch (e: any) {
    if (e.message?.includes("already exists")) console.log("  customers already exists");
    else console.error("  Error:", e.message);
  }

  const customerAttrs = [
    { key: "name", type: "string", size: 255, required: true },
    { key: "phone", type: "string", size: 255, required: true },
    { key: "address", type: "string", size: 500, required: false },
    { key: "latitude", type: "float", required: false },
    { key: "longitude", type: "float", required: false },
    { key: "cropType", type: "string", size: 255, required: false },
  ];

  for (const attr of customerAttrs) {
    try {
      if (attr.type === "string") {
        await databases.createStringAttribute(DATABASE_ID, "customers", attr.key, attr.size!, attr.required as boolean);
      } else if (attr.type === "float") {
        await databases.createFloatAttribute(DATABASE_ID, "customers", attr.key, attr.required as boolean);
      }
      console.log(`  Created attribute: ${attr.key}`);
    } catch (e: any) {
      if (e.message?.includes("already exists")) console.log(`  Attribute ${attr.key} already exists`);
      else console.error(`  Error creating ${attr.key}:`, e.message);
    }
  }

  // --- Items ---
  console.log("\nCreating items collection...");
  try {
    await databases.createCollection(DATABASE_ID, "items", "Items", [
      Permission.read(Role.any()),
      Permission.create(Role.any()),
      Permission.update(Role.any()),
      Permission.delete(Role.any()),
    ]);
  } catch (e: any) {
    if (e.message?.includes("already exists")) console.log("  items already exists");
    else console.error("  Error:", e.message);
  }

  const itemAttrs = [
    { key: "name", type: "string", size: 255, required: true },
    { key: "category", type: "string", size: 255, required: false },
    { key: "unit", type: "string", size: 255, required: false },
    { key: "tallyCode", type: "string", size: 255, required: false },
  ];

  for (const attr of itemAttrs) {
    try {
      await databases.createStringAttribute(DATABASE_ID, "items", attr.key, attr.size!, attr.required as boolean);
      console.log(`  Created attribute: ${attr.key}`);
    } catch (e: any) {
      if (e.message?.includes("already exists")) console.log(`  Attribute ${attr.key} already exists`);
      else console.error(`  Error creating ${attr.key}:`, e.message);
    }
  }

  // --- Visits ---
  console.log("\nCreating visits collection...");
  try {
    await databases.createCollection(DATABASE_ID, "visits", "Visits", [
      Permission.read(Role.any()),
      Permission.create(Role.any()),
      Permission.update(Role.any()),
      Permission.delete(Role.any()),
    ]);
  } catch (e: any) {
    if (e.message?.includes("already exists")) console.log("  visits already exists");
    else console.error("  Error:", e.message);
  }

  const visitAttrs: any[] = [
    { key: "customerId", type: "string", size: 255, required: true },
    { key: "observations", type: "string", size: 5000, required: false },
    { key: "latitude", type: "float", required: false },
    { key: "longitude", type: "float", required: false },
    { key: "locationName", type: "string", size: 500, required: false },
    { key: "nextVisitDate", type: "datetime", required: false },
    { key: "nextVisitTask", type: "string", size: 1000, required: false },
    { key: "visitDate", type: "datetime", required: false },
  ];

  for (const attr of visitAttrs) {
    try {
      if (attr.type === "string") {
        await databases.createStringAttribute(DATABASE_ID, "visits", attr.key, attr.size, attr.required);
      } else if (attr.type === "float") {
        await databases.createFloatAttribute(DATABASE_ID, "visits", attr.key, attr.required);
      } else if (attr.type === "datetime") {
        await databases.createDatetimeAttribute(DATABASE_ID, "visits", attr.key, attr.required);
      }
      console.log(`  Created attribute: ${attr.key}`);
    } catch (e: any) {
      if (e.message?.includes("already exists")) console.log(`  Attribute ${attr.key} already exists`);
      else console.error(`  Error creating ${attr.key}:`, e.message);
    }
  }

  // --- Visit Recommendations ---
  console.log("\nCreating recommendations collection...");
  try {
    await databases.createCollection(DATABASE_ID, "recommendations", "Recommendations", [
      Permission.read(Role.any()),
      Permission.create(Role.any()),
      Permission.update(Role.any()),
      Permission.delete(Role.any()),
    ]);
  } catch (e: any) {
    if (e.message?.includes("already exists")) console.log("  recommendations already exists");
    else console.error("  Error:", e.message);
  }

  const recAttrs = [
    { key: "visitId", type: "string", size: 255, required: true },
    { key: "itemId", type: "string", size: 255, required: false },
    { key: "customItem", type: "string", size: 255, required: false },
    { key: "dosage", type: "string", size: 255, required: false },
    { key: "quantity", type: "string", size: 255, required: false },
    { key: "notes", type: "string", size: 5000, required: false },
  ];

  for (const attr of recAttrs) {
    try {
      await databases.createStringAttribute(DATABASE_ID, "recommendations", attr.key, attr.size!, attr.required as boolean);
      console.log(`  Created attribute: ${attr.key}`);
    } catch (e: any) {
      if (e.message?.includes("already exists")) console.log(`  Attribute ${attr.key} already exists`);
      else console.error(`  Error creating ${attr.key}:`, e.message);
    }
  }

  // --- Visit Photos ---
  console.log("\nCreating visit_photos collection...");
  try {
    await databases.createCollection(DATABASE_ID, "visit_photos", "Visit Photos", [
      Permission.read(Role.any()),
      Permission.create(Role.any()),
      Permission.update(Role.any()),
      Permission.delete(Role.any()),
    ]);
  } catch (e: any) {
    if (e.message?.includes("already exists")) console.log("  visit_photos already exists");
    else console.error("  Error:", e.message);
  }

  const photoAttrs = [
    { key: "visitId", type: "string", size: 255, required: true },
    { key: "url", type: "string", size: 2000, required: true },
    { key: "caption", type: "string", size: 1000, required: false },
  ];

  for (const attr of photoAttrs) {
    try {
      await databases.createStringAttribute(DATABASE_ID, "visit_photos", attr.key, attr.size!, attr.required as boolean);
      console.log(`  Created attribute: ${attr.key}`);
    } catch (e: any) {
      if (e.message?.includes("already exists")) console.log(`  Attribute ${attr.key} already exists`);
      else console.error(`  Error creating ${attr.key}:`, e.message);
    }
  }

  console.log("\nSetup complete!");
}

setup().catch(console.error);