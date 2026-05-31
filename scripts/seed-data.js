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

const customers = [
  { name: "Rajan Pillai", phone: "+91 94470 12345", address: "Munnar Road, Idukki", latitude: 10.0889, longitude: 77.0595, cropType: "Cardamom" },
  { name: "Devaki Amma", phone: "+91 94470 45678", address: "Nedumkandam, Idukki", latitude: 9.85, longitude: 77, cropType: "Coffee" },
  { name: "Meenakshi Amma", phone: "+91 94470 78901", address: "Cheruthoni, Idukki", latitude: 9.85, longitude: 76.9667, cropType: "Cardamom" },
  { name: "Suresh Kumar", phone: "+91 94470 56789", address: "Peermade, Idukki", latitude: 9.5833, longitude: 77, cropType: "Tea" },
  { name: "Lakshmi Nair", phone: "+91 94470 23456", address: "Kumily, Thekkady", latitude: 9.6167, longitude: 77.1667, cropType: "Pepper" },
  { name: "Gopalan Menon", phone: "+91 94470 34567", address: "Vandanmedu, Idukki", latitude: 9.75, longitude: 77.1667, cropType: "Cardamom" },
  { name: "Raghavan Panicker", phone: "+91 94470 01234", address: "Munnar Town, Idukki", latitude: 10.0889, longitude: 77.0622, cropType: "Tea" },
  { name: "Parvathi Menon", phone: "+91 94471 34567", address: "Erattupetta, Kottayam", latitude: 9.7, longitude: 76.7833, cropType: "Cardamom" },
  { name: "Savithri Amma", phone: "+91 94471 12345", address: "Kanjirappally, Kottayam", latitude: 9.55, longitude: 76.8, cropType: "Pepper" },
  { name: "Madhavan Pillai", phone: "+91 94471 45678", address: "Mundakkayam, Kottayam", latitude: 9.55, longitude: 76.9, cropType: "Tea" },
  { name: "Krishnan Kutty", phone: "+91 94471 23456", address: "Pala, Kottayam", latitude: 9.7167, longitude: 76.6833, cropType: "Coffee" },
  { name: "Kamala Amma", phone: "+91 94471 56789", address: "Kuttikanam, Idukki", latitude: 9.5833, longitude: 76.9833, cropType: "Cardamom" },
  { name: "Ammini Kutty", phone: "+91 94470 90123", address: "Adimali, Idukki", latitude: 10.05, longitude: 76.95, cropType: "Pepper" },
  { name: "Venugopal Nair", phone: "+91 94470 89012", address: "Thodupuzha, Idukki", latitude: 9.9, longitude: 76.7167, cropType: "Coffee" },
  { name: "Balakrishnan Menon", phone: "+91 94471 89012", address: "Devikulam, Idukki", latitude: 10.0333, longitude: 77.0833, cropType: "Tea" },
  { name: "Saroja Kumari", phone: "+91 94471 78901", address: "Udumbanchola, Idukki", latitude: 9.85, longitude: 77.15, cropType: "Pepper" },
  { name: "Govindan Nair", phone: "+91 94471 67890", address: "Elappara, Idukki", latitude: 9.6167, longitude: 76.9167, cropType: "Coffee" },
  { name: "Kuttan Pillai", phone: "+91 94470 67890", address: "Kattappana, Idukki", latitude: 9.75, longitude: 77.1167, cropType: "Pepper" },
];

const items = [
  { name: "Urea (46% N)", category: "Fertilizer", unit: "kg", tallyCode: "FER001" },
  { name: "DAP (18-46-0)", category: "Fertilizer", unit: "kg", tallyCode: "FER002" },
  { name: "MOP (60% K2O)", category: "Fertilizer", unit: "kg", tallyCode: "FER003" },
  { name: "NPK 10:26:26", category: "Fertilizer", unit: "kg", tallyCode: "FER004" },
  { name: "NPK 19:19:19", category: "Fertilizer", unit: "kg", tallyCode: "FER005" },
  { name: "NPK 20:20:20", category: "Fertilizer", unit: "kg", tallyCode: "FER006" },
  { name: "Single Super Phosphate", category: "Fertilizer", unit: "kg", tallyCode: "FER007" },
  { name: "Ammonium Sulphate", category: "Fertilizer", unit: "kg", tallyCode: "FER008" },
  { name: "Calcium Ammonium Nitrate", category: "Fertilizer", unit: "kg", tallyCode: "FER009" },
  { name: "Zinc Sulphate", category: "Micronutrient", unit: "kg", tallyCode: "MIC001" },
  { name: "Borax", category: "Micronutrient", unit: "g", tallyCode: "MIC002" },
  { name: "Ferrous Sulphate", category: "Micronutrient", unit: "kg", tallyCode: "MIC003" },
  { name: "Magnesium Sulphate", category: "Micronutrient", unit: "kg", tallyCode: "MIC004" },
  { name: "Imidacloprid 17.8% SL", category: "Insecticide", unit: "ml", tallyCode: "INS001" },
  { name: "Chlorpyrifos 20% EC", category: "Insecticide", unit: "ml", tallyCode: "INS002" },
  { name: "Quinalphos 25% EC", category: "Insecticide", unit: "ml", tallyCode: "INS003" },
  { name: "Acephate 75% SP", category: "Insecticide", unit: "g", tallyCode: "INS004" },
  { name: "Thiamethoxam 25% WG", category: "Insecticide", unit: "g", tallyCode: "INS005" },
  { name: "Acetamiprid 20% SP", category: "Insecticide", unit: "g", tallyCode: "INS006" },
  { name: "Lambda Cyhalothrin 5% EC", category: "Insecticide", unit: "ml", tallyCode: "INS007" },
  { name: "Deltamethrin 2.8% EC", category: "Insecticide", unit: "ml", tallyCode: "INS008" },
  { name: "Mancozeb 75% WP", category: "Fungicide", unit: "g", tallyCode: "FUN001" },
  { name: "Carbendazim 50% WP", category: "Fungicide", unit: "g", tallyCode: "FUN002" },
  { name: "Hexaconazole 5% EC", category: "Fungicide", unit: "ml", tallyCode: "FUN003" },
  { name: "Propiconazole 25% EC", category: "Fungicide", unit: "ml", tallyCode: "FUN004" },
  { name: "Tricyclazole 75% WP", category: "Fungicide", unit: "g", tallyCode: "FUN005" },
  { name: "Copper Oxychloride 50% WP", category: "Fungicide", unit: "g", tallyCode: "FUN006" },
  { name: "Bordeaux Mixture", category: "Fungicide", unit: "kg", tallyCode: "FUN007" },
  { name: "Metalaxyl + Mancozeb", category: "Fungicide", unit: "g", tallyCode: "FUN008" },
  { name: "Neem Oil (3000 ppm)", category: "Organic", unit: "ml", tallyCode: "ORG001" },
  { name: "Vermicompost", category: "Organic", unit: "kg", tallyCode: "ORG002" },
  { name: "Pseudomonas fluorescens", category: "Organic", unit: "g", tallyCode: "ORG003" },
  { name: "Trichoderma viride", category: "Organic", unit: "g", tallyCode: "ORG004" },
  { name: "Beauveria bassiana", category: "Organic", unit: "g", tallyCode: "ORG005" },
  { name: "Cow dung compost", category: "Organic", unit: "kg", tallyCode: "ORG006" },
  { name: "Gibberellic Acid 0.001% L", category: "PGR", unit: "ml", tallyCode: "PGR001" },
  { name: "NAA 5% W/W", category: "PGR", unit: "ml", tallyCode: "PGR002" },
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

async function seed() {
  console.log("Seeding mock data to Appwrite...\n");

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