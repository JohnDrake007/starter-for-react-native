const { DATABASE_ID, api } = require("./config");

// The FieldAgent mobile app makes all requests as a guest (no login), so every
// collection it writes to must grant CRUD to the `any` role. The inventory
// collections were created by the tally-sync setup with create/update/delete
// restricted to `users`, which made "Add Product" fail with:
//   Missing "create" permission for role "users".
// This aligns every app-written collection to `any`, matching customers/visits.
const collections = [
  "customers",
  "visits",
  "recommendations",
  "visit_photos",
  "inventory_items",
  "inventory_batches",
];

const ANY_CRUD = [
  'read("any")',
  'create("any")',
  'update("any")',
  'delete("any")',
];

async function fixPermissions() {
  for (const colId of collections) {
    // Fetch the collection first — the update endpoint requires its name.
    const col = await api(`/databases/${DATABASE_ID}/collections/${colId}`, "GET");
    if (!col || !col.$id) {
      console.log(`⚠️  ${colId}: not found, skipping`);
      continue;
    }
    const res = await api(`/databases/${DATABASE_ID}/collections/${colId}`, "PUT", {
      name: col.name || colId,
      permissions: ANY_CRUD,
      documentSecurity: false,
      enabled: true,
    });
    if (res) {
      console.log(`✅ ${colId}: permissions set to any (CRUD)`);
    } else {
      console.log(`❌ ${colId}: update failed (see error above)`);
    }
  }
  console.log("\nDone.");
}

fixPermissions().catch(console.error);
