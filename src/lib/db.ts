import { openDB, type DBSchema, type IDBPDatabase } from "idb";

interface RougeeDB extends DBSchema {
  /** Content-addressed local media blobs (dev fallback for IPFS). */
  media: {
    key: string; // content hash
    value: { hash: string; mime: string; blob: Blob; createdAt: number };
  };
  /** Encrypted wallet keystores, keyed by rouge1 address. */
  wallets: {
    key: string; // address
    value: {
      address: string;
      publicKey: string;
      /** AES-GCM encrypted JSON of { privateKey, mnemonic? } */
      ciphertext: string;
      iv: string;
      salt: string;
      createdAt: number;
    };
    indexes: { "by-created": number };
  };
  /** Small misc key/value store. */
  kv: {
    key: string;
    value: unknown;
  };
}

let dbPromise: Promise<IDBPDatabase<RougeeDB>> | null = null;

export function db(): Promise<IDBPDatabase<RougeeDB>> {
  if (!dbPromise) {
    dbPromise = openDB<RougeeDB>("rougee-gram", 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains("media")) {
          database.createObjectStore("media", { keyPath: "hash" });
        }
        if (!database.objectStoreNames.contains("wallets")) {
          const store = database.createObjectStore("wallets", {
            keyPath: "address",
          });
          store.createIndex("by-created", "createdAt");
        }
        if (!database.objectStoreNames.contains("kv")) {
          database.createObjectStore("kv");
        }
      },
    });
  }
  return dbPromise;
}
