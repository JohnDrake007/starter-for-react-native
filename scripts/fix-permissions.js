const { DATABASE_ID, headers, api } = require("./config");

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

  console.log("\nDone! If permissions still show errors, update them manually in the Appwrite Console.");
  console.log("  https://sgp.cloud.appwrite.io → Database → Field Agent → Each Collection → Settings → Permissions");
  console.log("  Enable Read/Write/Create/Update/Delete for 'Any' role on each collection.");
}

fixPermissions().catch(console.error);