// The only save/load mechanism for maps. Talks directly to the "maps"
// collection through the shared PocketBase client.
import pb from "../../pb.js";

const COLLECTION = "maps";

// Creates a new record when id is falsy, otherwise updates the existing one.
// mymind is a plain object (the map's JSON tree) — PocketBase stores it
// natively in the "mymind" json field, no string (de)serialization needed.
// svg is the rendered SVG snapshot, stored alongside for use on the catalog
// page. It's optional: pass undefined to leave the stored svg untouched
// (used by auto-save, which should not re-send it on every keystroke).
export async function save(id, title, mymind, svg) {
  const data = { title, mymind };
  if (svg !== undefined) {
    data.svg = svg;
  }
  if (id) {
    return pb.collection(COLLECTION).update(id, data);
  }
  return pb.collection(COLLECTION).create(data);
}

// Maps are addressed publicly by "uuid" (see /maps/<uuid>), not by
// PocketBase's own record id.
export async function loadByUuid(uuid) {
  return pb
    .collection(COLLECTION)
    .getFirstListItem(pb.filter("uuid = {:uuid}", { uuid }));
}

export async function updateTitle(id, title) {
  return pb.collection(COLLECTION).update(id, { title });
}

export async function deleteMap(id) {
  return pb.collection(COLLECTION).delete(id);
}

export async function updatePin(id, pin) {
  return pb.collection(COLLECTION).update(id, { pin });
}

// Lightweight list of every saved map (used by both Catalog.jsx and
// CatalogList.jsx's inline sidebar view). Pinned maps sort first, then
// most-recently-updated first. svg is included directly so callers can
// render a thumbnail without a second request.
export async function listMaps(query) {
  return pb.collection(COLLECTION).getFullList({
    sort: "-pin,-updated",
    fields: "id,uuid,title,svg,pin",
    filter: query ? pb.filter("title ~ {:q}", { q: query }) : "",
  });
}

const SNAPSHOTS_COLLECTION = "snapshots";

// Lightweight list of a map's restorable past snapshots, newest first.
// Excludes "mymind" (the full map JSON) since the list view only needs
// enough to render a thumbnail; see getSnapshot() for restoring one.
export async function listSnapshots(mapId) {
  return pb.collection(SNAPSHOTS_COLLECTION).getFullList({
    filter: pb.filter("map = {:map}", { map: mapId }),
    sort: "-created",
    fields: "id,tier,svg,created",
  });
}

// Fetches a single snapshot's full record (including "mymind"), used
// right before restoring it.
export async function getSnapshot(id) {
  return pb.collection(SNAPSHOTS_COLLECTION).getOne(id);
}
