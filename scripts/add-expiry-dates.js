const { DATABASE_ID, headers, api, delay } = require("./config");

const expiryDates = {
  "FER001": "2026-07-15",
  "FER002": "2026-08-22",
  "FER003": "2026-06-28",
  "FER004": "2026-08-10",
  "FER005": "2026-07-30",
  "FER006": "2026-06-18",
  "FER007": "2026-08-05",
  "FER008": "2026-07-22",
  "FER009": "2026-06-12",
  "MIC001": "2026-08-18",
  "MIC002": "2026-07-08",
  "MIC003": "2026-06-25",
  "MIC004": "2026-08-30",
  "INS001": "2026-06-05",
  "INS002": "2026-07-18",
  "INS003": "2026-08-12",
  "INS004": "2026-06-20",
  "INS005": "2026-07-06",
  "INS006": "2026-08-25",
  "INS007": "2026-06-30",
  "INS008": "2026-07-28",
  "FUN001": "2026-06-14",
  "FUN002": "2026-08-08",
  "FUN003": "2026-07-24",
  "FUN004": "2026-06-08",
  "FUN005": "2026-08-20",
  "FUN006": "2026-07-12",
  "FUN007": "2026-06-22",
  "FUN008": "2026-08-14",
  "ORG001": "2026-07-10",
  "ORG002": "2026-08-28",
  "ORG003": "2026-06-16",
  "ORG004": "2026-07-02",
  "ORG005": "2026-08-16",
  "ORG006": "2026-06-10",
  "PGR001": "2026-07-20",
  "PGR002": "2026-06-04",
};

async function addExpiryDates() {
  console.log("Adding expiry dates to existing items...\n");

  console.log("Creating expiryDate attribute on items collection...");
  const attrRes = await api("/databases/" + DATABASE_ID + "/collections/items/attributes/string", "POST", {
    key: "expiryDate",
    size: 30,
    required: false,
  });
  if (attrRes) {
    console.log("Attribute created or already exists, waiting 5s for processing...");
  } else {
    console.log("Attribute creation failed (may already exist), continuing...");
  }
  await delay(5000);

  const itemsRes = await api("/databases/" + DATABASE_ID + "/collections/items/documents?limit=200", "GET");
  if (!itemsRes || !itemsRes.documents) {
    console.error("Failed to fetch items");
    return;
  }

  console.log("Found " + itemsRes.documents.length + " items\n");

  for (const item of itemsRes.documents) {
    const expiryDate = expiryDates[item.tallyCode];
    if (expiryDate) {
      console.log("  Updating: " + item.name + " -> expiryDate: " + expiryDate);
      await api("/databases/" + DATABASE_ID + "/collections/items/documents/" + item.$id, "PATCH", {
        data: { expiryDate: expiryDate },
      });
      await delay(200);
    } else {
      console.log("  Skipping (no expiry date mapping): " + item.name);
    }
  }

  console.log("\n=== Done! ===");
}

addExpiryDates().catch(console.error);