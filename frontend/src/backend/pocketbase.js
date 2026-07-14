// src/backend/pocketbase.ts
// The only save/load mechanism for maps. Talks directly to the "maps"
// collection through the shared PocketBase client.
import pb from "../lib/pb.js";

const COLLECTION = "maps";

// Creates a new record when id is falsy, otherwise updates the existing one.
// mymind is a plain object (the map's JSON tree) — PocketBase stores it
// natively in the "mymind" json field, no string (de)serialization needed.
export async function save(id, name, mymind) {
  if (id) {
    return pb.collection(COLLECTION).update(id, { name, mymind });
  }
  return pb.collection(COLLECTION).create({ name, mymind });
}

export async function load(id) {
  return pb.collection(COLLECTION).getOne(id);
}
