const PROJECT_ID = "6a1bf181002ff774402d";
const ENDPOINT = "https://sgp.cloud.appwrite.io/v1";
const API_KEY = "standard_115bd37902061debdcc3117f5241878b58d56e6dabfaf0c055400313212b0314424d7362cc38cbe8dc0e26b6c3a53e1677e77bb9927cb7e52d5d3e1ae87ac63b7ed6ec04d219390159f30c00c539e1689669c1269a31bc63ac2ff471005f771fd19b56f53c2f761c4264fb0f30fa230436307768f9c3a53841b2d28187a4d973";

const headers = {
  "Content-Type": "application/json",
  "X-Appwrite-Project": PROJECT_ID,
  "X-Appwrite-Key": API_KEY,
};

async function api(path, method, body) {
  const url = ENDPOINT + path;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (res.ok) {
    return data;
  }
  console.error("  ERROR " + res.status + ": " + (data.message || JSON.stringify(data)));
  return null;
}

async function setup() {
  console.log("Creating storage bucket: visit-photos...");

  const bucket = await api("/storage/buckets", "POST", {
    bucketId: "visit-photos",
    name: "Visit Photos",
    read: ["role:all"],
    write: ["role:all"],
    create: ["role:all"],
    update: ["role:all"],
    delete: ["role:all"],
    maximumFileSize: 5000000,
    allowedFileExtensions: ["jpg", "jpeg", "png", "webp", "heic"],
    compression: "none",
    encryption: false,
    antivirus: false,
  });

  if (bucket) {
    console.log("  Bucket created:", bucket.$id);
  } else {
    console.log("  Bucket may already exist or creation failed. Trying to update...");
    const existing = await api("/storage/buckets/visit-photos", "PUT", {
      name: "Visit Photos",
      maximumFileSize: 5000000,
      allowedFileExtensions: ["jpg", "jpeg", "png", "webp", "heic"],
      compression: "none",
      encryption: false,
      antivirus: false,
    });
    if (existing) {
      console.log("  Bucket updated:", existing.$id);
    }
  }

  console.log("\nDone! The visit-photos bucket is ready.");
  console.log("Make sure to set bucket permissions in the Appwrite Console if needed.");
}

setup().catch(console.error);