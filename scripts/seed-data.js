const { PROJECT_ID, ENDPOINT, API_KEY, DATABASE_ID, headers, api, delay } = require("./config");

async function seed() {
  console.log("Seeding mock data to Appwrite...\n");

  const customers = [
    { name: "Rajan Pillai", phone: "+91 94470 12345", address: "Munnar Road, Idukki", latitude: 10.0889, longitude: 77.0595, cropType: "Cardamom", contactName: "Anitha Kumari", contactPhone: "+91 94470 11111" },
    { name: "Devaki Amma", phone: "+91 94470 45678", address: "Nedumkandam, Idukki", latitude: 9.85, longitude: 77, cropType: "Coffee", contactName: "Sunil Kumar", contactPhone: "+91 94470 22222" },
    { name: "Meenakshi Amma", phone: "+91 94470 78901", address: "Cheruthoni, Idukki", latitude: 9.85, longitude: 76.9667, cropType: "Cardamom", contactName: "Kalyani Amma", contactPhone: "+91 94470 33333" },
    { name: "Suresh Kumar", phone: "+91 94470 56789", address: "Peermade, Idukki", latitude: 9.5833, longitude: 77, cropType: "Tea", contactName: "Vijayan Nair", contactPhone: "+91 94470 44444" },
    { name: "Lakshmi Nair", phone: "+91 94470 23456", address: "Kumily, Thekkady", latitude: 9.6167, longitude: 77.1667, cropType: "Pepper", contactName: "Radha Devi", contactPhone: "+91 94470 55555" },
    { name: "Gopalan Menon", phone: "+91 94470 34567", address: "Vandanmedu, Idukki", latitude: 9.75, longitude: 77.1667, cropType: "Cardamom", contactName: "Unnikrishnan", contactPhone: "+91 94470 66666" },
    { name: "Raghavan Panicker", phone: "+91 94470 01234", address: "Munnar Town, Idukki", latitude: 10.0889, longitude: 77.0622, cropType: "Tea", contactName: "Latha Kumari", contactPhone: "+91 94470 77777" },
    { name: "Parvathi Menon", phone: "+91 94471 34567", address: "Erattupetta, Kottayam", latitude: 9.7, longitude: 76.7833, cropType: "Cardamom", contactName: "Pradeep Menon", contactPhone: "+91 94471 11111" },
    { name: "Savithri Amma", phone: "+91 94471 12345", address: "Kanjirappally, Kottayam", latitude: 9.55, longitude: 76.8, cropType: "Pepper", contactName: "Sreedevi Amma", contactPhone: "+91 94471 22222" },
    { name: "Madhavan Pillai", phone: "+91 94471 45678", address: "Mundakkayam, Kottayam", latitude: 9.55, longitude: 76.9, cropType: "Tea", contactName: "Ravi Pillai", contactPhone: "+91 94471 33333" },
    { name: "Krishnan Kutty", phone: "+91 94471 56789", address: "Pala, Kottayam", latitude: 9.7167, longitude: 76.6833, cropType: "Coffee", contactName: "Leelavathy", contactPhone: "+91 94471 44444" },
    { name: "Kamala Amma", phone: "+91 94471 23456", address: "Kuttikanam, Idukki", latitude: 9.5833, longitude: 76.9833, cropType: "Cardamom", contactName: "Gopika Devi", contactPhone: "+91 94471 55555" },
    { name: "Ammini Kutty", phone: "+91 94470 90123", address: "Adimali, Idukki", latitude: 10.05, longitude: 76.95, cropType: "Pepper", contactName: "Mani Kutty", contactPhone: "+91 94470 99999" },
    { name: "Venugopal Nair", phone: "+91 94470 89012", address: "Thodupuzha, Idukki", latitude: 9.9, longitude: 76.7167, cropType: "Coffee", contactName: "Ambika Amma", contactPhone: "+91 94470 88888" },
    { name: "Balakrishnan Menon", phone: "+91 94471 89012", address: "Devikulam, Idukki", latitude: 10.0333, longitude: 77.0833, cropType: "Tea", contactName: "Sankaran Nair", contactPhone: "+91 94471 66666" },
    { name: "Saroja Kumari", phone: "+91 94471 78901", address: "Udumbanchola, Idukki", latitude: 9.85, longitude: 77.15, cropType: "Pepper", contactName: "Padmavathi", contactPhone: "+91 94471 77777" },
    { name: "Govindan Nair", phone: "+91 94471 67890", address: "Elappara, Idukki", latitude: 9.6167, longitude: 76.9167, cropType: "Coffee", contactName: "Mohan Das", contactPhone: "+91 94471 88888" },
    { name: "Kuttan Pillai", phone: "+91 94470 67890", address: "Kattappana, Idukki", latitude: 9.75, longitude: 77.1167, cropType: "Pepper", contactName: "Rema Devi", contactPhone: "+91 94470 77788" },
  ];

  const items = [
    { name: "Urea (46% N)", category: "Fertilizer", unit: "kg", tallyCode: "FER001", expiryDate: "2026-07-15" },
    { name: "DAP (18-46-0)", category: "Fertilizer", unit: "kg", tallyCode: "FER002", expiryDate: "2026-08-22" },
    { name: "MOP (60% K2O)", category: "Fertilizer", unit: "kg", tallyCode: "FER003", expiryDate: "2026-06-28" },
    { name: "NPK 10:26:26", category: "Fertilizer", unit: "kg", tallyCode: "FER004", expiryDate: "2026-08-10" },
    { name: "NPK 19:19:19", category: "Fertilizer", unit: "kg", tallyCode: "FER005", expiryDate: "2026-07-30" },
    { name: "NPK 20:20:20", category: "Fertilizer", unit: "kg", tallyCode: "FER006", expiryDate: "2026-06-18" },
    { name: "Single Super Phosphate", category: "Fertilizer", unit: "kg", tallyCode: "FER007", expiryDate: "2026-08-05" },
    { name: "Ammonium Sulphate", category: "Fertilizer", unit: "kg", tallyCode: "FER008", expiryDate: "2026-07-22" },
    { name: "Calcium Ammonium Nitrate", category: "Fertilizer", unit: "kg", tallyCode: "FER009", expiryDate: "2026-06-12" },
    { name: "Zinc Sulphate", category: "Micronutrient", unit: "kg", tallyCode: "MIC001", expiryDate: "2026-08-18" },
    { name: "Borax", category: "Micronutrient", unit: "g", tallyCode: "MIC002", expiryDate: "2026-07-08" },
    { name: "Ferrous Sulphate", category: "Micronutrient", unit: "kg", tallyCode: "MIC003", expiryDate: "2026-06-25" },
    { name: "Magnesium Sulphate", category: "Micronutrient", unit: "kg", tallyCode: "MIC004", expiryDate: "2026-08-30" },
    { name: "Imidacloprid 17.8% SL", category: "Insecticide", unit: "ml", tallyCode: "INS001", expiryDate: "2026-06-05" },
    { name: "Chlorpyrifos 20% EC", category: "Insecticide", unit: "ml", tallyCode: "INS002", expiryDate: "2026-07-18" },
    { name: "Quinalphos 25% EC", category: "Insecticide", unit: "ml", tallyCode: "INS003", expiryDate: "2026-08-12" },
    { name: "Acephate 75% SP", category: "Insecticide", unit: "g", tallyCode: "INS004", expiryDate: "2026-06-20" },
    { name: "Thiamethoxam 25% WG", category: "Insecticide", unit: "g", tallyCode: "INS005", expiryDate: "2026-07-06" },
    { name: "Acetamiprid 20% SP", category: "Insecticide", unit: "g", tallyCode: "INS006", expiryDate: "2026-08-25" },
    { name: "Lambda Cyhalothrin 5% EC", category: "Insecticide", unit: "ml", tallyCode: "INS007", expiryDate: "2026-06-30" },
    { name: "Deltamethrin 2.8% EC", category: "Insecticide", unit: "ml", tallyCode: "INS008", expiryDate: "2026-07-28" },
    { name: "Mancozeb 75% WP", category: "Fungicide", unit: "g", tallyCode: "FUN001", expiryDate: "2026-06-14" },
    { name: "Carbendazim 50% WP", category: "Fungicide", unit: "g", tallyCode: "FUN002", expiryDate: "2026-08-08" },
    { name: "Hexaconazole 5% EC", category: "Fungicide", unit: "ml", tallyCode: "FUN003", expiryDate: "2026-07-24" },
    { name: "Propiconazole 25% EC", category: "Fungicide", unit: "ml", tallyCode: "FUN004", expiryDate: "2026-06-08" },
    { name: "Tricyclazole 75% WP", category: "Fungicide", unit: "g", tallyCode: "FUN005", expiryDate: "2026-08-20" },
    { name: "Copper Oxychloride 50% WP", category: "Fungicide", unit: "g", tallyCode: "FUN006", expiryDate: "2026-07-12" },
    { name: "Bordeaux Mixture", category: "Fungicide", unit: "kg", tallyCode: "FUN007", expiryDate: "2026-06-22" },
    { name: "Metalaxyl + Mancozeb", category: "Fungicide", unit: "g", tallyCode: "FUN008", expiryDate: "2026-08-14" },
    { name: "Neem Oil (3000 ppm)", category: "Organic", unit: "ml", tallyCode: "ORG001", expiryDate: "2026-07-10" },
    { name: "Vermicompost", category: "Organic", unit: "kg", tallyCode: "ORG002", expiryDate: "2026-08-28" },
    { name: "Pseudomonas fluorescens", category: "Organic", unit: "g", tallyCode: "ORG003", expiryDate: "2026-06-16" },
    { name: "Trichoderma viride", category: "Organic", unit: "g", tallyCode: "ORG004", expiryDate: "2026-07-02" },
    { name: "Beauveria bassiana", category: "Organic", unit: "g", tallyCode: "ORG005", expiryDate: "2026-08-16" },
    { name: "Cow dung compost", category: "Organic", unit: "kg", tallyCode: "ORG006", expiryDate: "2026-06-10" },
    { name: "Gibberellic Acid 0.001% L", category: "PGR", unit: "ml", tallyCode: "PGR001", expiryDate: "2026-07-20" },
    { name: "NAA 5% W/W", category: "PGR", unit: "ml", tallyCode: "PGR002", expiryDate: "2026-06-04" },
  ];

  const visitsSeed = [
    { observations: "Cardamom plants showing signs of capsule rot. Lower leaves yellowing. Some plants with stunted growth. Soil appears compacted.", locationName: "Munnar Road Farm", nextVisitTask: "Follow up on capsule rot treatment; check new growth" },
    { observations: "Pepper vines showing leaf spot disease. Some vines with foot rot symptoms. Good overall growth but needs nutrient boost.", locationName: "Kumily Spice Garden", nextVisitTask: "Check foot rot progress; evaluate nutrient response" },
    { observations: "Coffee plants with berry borer infestation in lower branches. Leaves showing iron deficiency. Shade cover adequate.", locationName: "Nedumkandam Coffee Estate", nextVisitTask: "Monitor berry borer traps; apply second round of treatment" },
    { observations: "Tea bushes showing red spider mite damage. Upper leaves with characteristic bronzing. Pruning schedule needs adjustment.", locationName: "Peermade Tea Garden", nextVisitTask: "Reassess mite population; check pruning recovery" },
    { observations: "Cardamom plantation recovering from earlier katte disease. New shoots appearing. Need preventive fungicide application.", locationName: "Cheruthoni Cardamom Farm", nextVisitTask: "Apply preventive fungicide; assess katte disease recovery" },
    { observations: "Tea estate showing good health after last treatment. Minor thrips infestation in section B. Recommend immediate action.", locationName: "Munnar Tea Estate", nextVisitTask: "Follow up on thrips treatment; general health check" },
    { observations: "Cardamom nursery with damping off in seedlings. Poor drainage observed. Recommended raised beds and fungicide drench.", locationName: "Erattupetta Cardamom Nursery", nextVisitTask: "Check seedling recovery; verify drainage improvements" },
  ];

  const recommendationsSeed = [
    { customItem: "Capsule rot treatment", dosage: "2g per liter", quantity: "500g", notes: "Apply as soil drench" },
    { customItem: "Foot rot management", dosage: "5g per liter", quantity: "1kg", notes: "Drench at base of vine" },
    { customItem: "Berry borer control", dosage: "2ml per liter", quantity: "250ml", notes: "Spray on affected branches" },
    { customItem: "Mite control spray", dosage: "1ml per liter", quantity: "200ml", notes: "Spray on upper canopy" },
    { customItem: "Katte disease prevention", dosage: "3g per liter", quantity: "750g", notes: "Spray on new growth" },
    { customItem: "Thrips control", dosage: "1.5ml per liter", quantity: "300ml", notes: "Spot spray in section B" },
    { customItem: "Damping off control", dosage: "2.5g per liter", quantity: "500g", notes: "Soil drench in nursery beds" },
  ];

  const idMap = { customers: {}, items: {} };

  console.log("=== Creating Customers ===");
  for (const c of customers) {
    console.log("  Creating: " + c.name);
    const doc = await api("/databases/" + DATABASE_ID + "/collections/customers/documents", "POST", {
      documentId: "unique()",
      data: {
        name: c.name,
        phone: c.phone,
        address: c.address,
        latitude: c.latitude,
        longitude: c.longitude,
        cropType: c.cropType,
        contactName: c.contactName || null,
        contactPhone: c.contactPhone || null,
      },
      read: ["role:all"],
      write: ["role:all"],
    });
    if (doc) idMap.customers[c.name] = doc.$id;
    await delay(150);
  }

  console.log("\n=== Creating Items ===");
  for (const item of items) {
    console.log("  Creating: " + item.name);
    const doc = await api("/databases/" + DATABASE_ID + "/collections/items/documents", "POST", {
      documentId: "unique()",
      data: {
        name: item.name,
        category: item.category,
        unit: item.unit,
        tallyCode: item.tallyCode,
        expiryDate: item.expiryDate,
      },
      read: ["role:all"],
      write: ["role:all"],
    });
    if (doc) idMap.items[item.tallyCode] = doc.$id;
    await delay(150);
  }

  console.log("\n=== Creating Visits ===");
  const customerNames = Object.keys(idMap.customers);
  const visitIds = [];

  for (let i = 0; i < visitsSeed.length; i++) {
    if (i >= customerNames.length) break;
    const v = visitsSeed[i];
    const customerId = idMap.customers[customerNames[i]];
    const daysAgo = [7, 3, 1, 14, 21, 0, 30][i] || 1;
    const daysUntil = [7, 14, 3, 7, 10, 14, 5, 3][i] || 7;
    const visitDate = new Date(Date.now() - daysAgo * 86400000);
    const nextVisitDate = new Date(Date.now() + daysUntil * 86400000);

    console.log("  Creating visit for: " + customerNames[i]);
    const doc = await api("/databases/" + DATABASE_ID + "/collections/visits/documents", "POST", {
      documentId: "unique()",
      data: {
        customerId: customerId,
        visitDate: visitDate.toISOString(),
        observations: v.observations,
        locationName: v.locationName,
        nextVisitDate: nextVisitDate.toISOString(),
        nextVisitTask: v.nextVisitTask,
      },
      read: ["role:all"],
      write: ["role:all"],
    });
    if (doc) visitIds.push(doc.$id);
    await delay(150);
  }

  console.log("\n=== Creating Recommendations ===");
  for (let i = 0; i < recommendationsSeed.length; i++) {
    if (i >= visitIds.length) break;
    const r = recommendationsSeed[i];
    console.log("  Creating recommendation for visit " + (i + 1));
    const body = {
      documentId: "unique()",
      data: {
        visitId: visitIds[i],
        customItem: r.customItem,
        dosage: r.dosage,
        quantity: r.quantity,
        notes: r.notes,
      },
      read: ["role:all"],
      write: ["role:all"],
    };
    await api("/databases/" + DATABASE_ID + "/collections/recommendations/documents", "POST", body);
    await delay(150);
  }

  console.log("\n=== Done! ===");
  console.log("Created " + Object.keys(idMap.customers).length + " customers");
  console.log("Created " + Object.keys(idMap.items).length + " items");
  console.log("Created " + visitIds.length + " visits");
  console.log("Created " + Math.min(recommendationsSeed.length, visitIds.length) + " recommendations");
  console.log("\nIf you see permission errors, make sure collection permissions are set in the Appwrite Console.");
}

seed().catch(console.error);