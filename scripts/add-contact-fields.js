const { DATABASE_ID, headers, api, delay } = require("./config");

const contacts = [
  { contactName: "Anitha Kumari", contactPhone: "+91 94470 11111" },
  { contactName: "Sunil Kumar", contactPhone: "+91 94470 22222" },
  { contactName: "Kalyani Amma", contactPhone: "+91 94470 33333" },
  { contactName: "Vijayan Nair", contactPhone: "+91 94470 44444" },
  { contactName: "Radha Devi", contactPhone: "+91 94470 55555" },
  { contactName: "Unnikrishnan", contactPhone: "+91 94470 66666" },
  { contactName: "Latha Kumari", contactPhone: "+91 94470 77777" },
  { contactName: "Pradeep Menon", contactPhone: "+91 94471 11111" },
  { contactName: "Sreedevi Amma", contactPhone: "+91 94471 22222" },
  { contactName: "Ravi Pillai", contactPhone: "+91 94471 33333" },
  { contactName: "Leelavathy", contactPhone: "+91 94471 44444" },
  { contactName: "Gopika Devi", contactPhone: "+91 94471 55555" },
  { contactName: "Mani Kutty", contactPhone: "+91 94470 99999" },
  { contactName: "Ambika Amma", contactPhone: "+91 94470 88888" },
  { contactName: "Sankaran Nair", contactPhone: "+91 94471 66666" },
  { contactName: "Padmavathi", contactPhone: "+91 94471 77777" },
  { contactName: "Mohan Das", contactPhone: "+91 94471 88888" },
  { contactName: "Rema Devi", contactPhone: "+91 94470 77788" },
];

async function addContactFields() {
  console.log("Adding contactName and contactPhone to customers collection...\n");

  console.log("Creating contactName attribute...");
  await api("/databases/" + DATABASE_ID + "/collections/customers/attributes/string", "POST", {
    key: "contactName",
    size: 100,
    required: false,
  });
  await delay(3000);

  console.log("Creating contactPhone attribute...");
  await api("/databases/" + DATABASE_ID + "/collections/customers/attributes/string", "POST", {
    key: "contactPhone",
    size: 50,
    required: false,
  });
  await delay(5000);

  const customersRes = await api("/databases/" + DATABASE_ID + "/collections/customers/documents?limit=200", "GET");
  if (!customersRes || !customersRes.documents) {
    console.error("Failed to fetch customers");
    return;
  }

  console.log("Found " + customersRes.documents.length + " customers\n");

  for (let i = 0; i < customersRes.documents.length; i++) {
    const customer = customersRes.documents[i];
    const contact = contacts[i] || { contactName: "", contactPhone: "" };
    console.log("  Updating: " + customer.name + " -> " + (contact.contactName || "(none)"));
    await api("/databases/" + DATABASE_ID + "/collections/customers/documents/" + customer.$id, "PATCH", {
      data: {
        contactName: contact.contactName || null,
        contactPhone: contact.contactPhone || null,
      },
    });
    await delay(200);
  }

  console.log("\n=== Done! ===");
}

addContactFields().catch(console.error);