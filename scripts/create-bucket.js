const { PROJECT_ID, STORAGE_BUCKET_ID, headers, api } = require("./config");

async function setup() {
  console.log("Creating storage bucket: " + STORAGE_BUCKET_ID + "...");

  const bucket = await api("/storage/buckets", "POST", {
    bucketId: STORAGE_BUCKET_ID,
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
    const existing = await api("/storage/buckets/" + STORAGE_BUCKET_ID, "PUT", {
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

  console.log("\nDone! The " + STORAGE_BUCKET_ID + " bucket is ready.");
  console.log("Make sure to set bucket permissions in the Appwrite Console if needed.");
}

setup().catch(console.error);