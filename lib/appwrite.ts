import { Client, Account, Databases, Storage, Query, ID } from "react-native-appwrite";

const client = new Client()
  .setProject("6a1bf181002ff774402d")
  .setEndpoint("https://sgp.cloud.appwrite.io/v1")
  .setPlatform("com.agri.fieldagent");

const account = new Account(client);
const databases = new Databases(client);
const storage = new Storage(client);

async function ping(): Promise<string> {
  try {
    await fetch("https://sgp.cloud.appwrite.io/v1/health");
    return "ok";
  } catch {
    return "error";
  }
}

const DATABASE_ID = "6a1c0a8a0029a3ca0c82";
const CUSTOMERS_COLLECTION_ID = "customers";
const VISITS_COLLECTION_ID = "visits";
const ITEMS_COLLECTION_ID = "items";
const RECOMMENDATIONS_COLLECTION_ID = "recommendations";
const VISIT_PHOTOS_COLLECTION_ID = "visit_photos";
const STORAGE_BUCKET_ID = "visit-photos";

export { client, account, databases, storage, Query, ID, ping, DATABASE_ID, CUSTOMERS_COLLECTION_ID, VISITS_COLLECTION_ID, ITEMS_COLLECTION_ID, RECOMMENDATIONS_COLLECTION_ID, VISIT_PHOTOS_COLLECTION_ID, STORAGE_BUCKET_ID };