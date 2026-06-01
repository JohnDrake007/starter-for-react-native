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
    return data;
  } else {
    console.error("  ERROR " + res.status + ": " + (data.message || JSON.stringify(data)));
    return null;
  }
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Random contact person names and phones for each customer (Kerala names)
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

  // Create contactName attribute
  console.log("Creating contactName attribute...");
  await api("/databases/" + DATABASE_ID + "/collections/customers/attributes/string", "POST", {
    key: "contactName",
    size: 100,
    required: false,
  });
  await delay(3000);

  // Create contactPhone attribute
  console.log("Creating contactPhone attribute...");
  await api("/databases/" + DATABASE_ID + "/collections/customers/attributes/string", "POST", {
    key: "contactPhone",
    size: 50,
    required: false,
  });
  await delay(5000);

  // Get all customers
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