import { Client, Account, Databases, Storage, Query, ID } from "react-native-appwrite";

const APPWRITE_ENDPOINT = process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT || "https://sgp.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID || "6a6ebd81003a7ff40656";
const APPWRITE_DATABASE_ID = process.env.EXPO_PUBLIC_APPWRITE_DATABASE_ID || "field_agent_db";
const APPWRITE_STORAGE_NAMESPACE = `@fa:${APPWRITE_PROJECT_ID}:${APPWRITE_DATABASE_ID}`;

const client = new Client()
  .setProject(APPWRITE_PROJECT_ID)
  .setEndpoint(APPWRITE_ENDPOINT)
  .setPlatform("com.agri.fieldagent");

const account = new Account(client);
const databases = new Databases(client);
const storage = new Storage(client);

async function ping(): Promise<string> {
  try {
    await fetch(APPWRITE_ENDPOINT + "/health");
    return "ok";
  } catch {
    return "error";
  }
}

const DATABASE_ID = APPWRITE_DATABASE_ID;
const CUSTOMERS_COLLECTION_ID = "customers";
const VISITS_COLLECTION_ID = "visits";
const RECOMMENDATIONS_COLLECTION_ID = "recommendations";
const VISIT_PHOTOS_COLLECTION_ID = "visit_photos";
const INVENTORY_ITEMS_COLLECTION_ID = "inventory_items";
const INVENTORY_BATCHES_COLLECTION_ID = "inventory_batches";
const STORAGE_BUCKET_ID = process.env.EXPO_PUBLIC_APPWRITE_STORAGE_BUCKET_ID || "visit-photos";

export { client, account, databases, storage, Query, ID, ping, DATABASE_ID, APPWRITE_STORAGE_NAMESPACE, CUSTOMERS_COLLECTION_ID, VISITS_COLLECTION_ID, RECOMMENDATIONS_COLLECTION_ID, VISIT_PHOTOS_COLLECTION_ID, INVENTORY_ITEMS_COLLECTION_ID, INVENTORY_BATCHES_COLLECTION_ID, STORAGE_BUCKET_ID };
