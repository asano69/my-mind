// internal/db/seed.go
package db

import (
	_ "embed"
	"encoding/json"

	"github.com/asano69/solid-mind/internal/errs"
	"github.com/pocketbase/pocketbase/core"
)

//go:embed sample_map.json
var sampleMapJSON []byte

// Keys stripped from the exported record JSON before insert -- "id"
// would force that exact record id (risking a collision or a
// validation failure against this DB's own id pattern), "uuid" would
// bypass serve.go's OnRecordCreate auto-assignment, and
// "collectionId"/"collectionName"/"created"/"updated" are either
// ignored (unknown schema field) or overwritten by PocketBase itself
// (autodate) -- but stripping them too keeps the seeded record's
// intent explicit rather than relying on that overwrite behavior.
var seedStripKeys = []string{
	"id", "collectionId", "collectionName", "created", "updated",
}

// SeedSampleMap inserts one example map into "maps" the first time the
// app starts against an empty database, so a fresh install has
// something to open instead of a blank catalog. No-op once any map
// exists (including one the user later deletes), so this only ever
// fires once, right after the schema itself is created.
func (d *Database) SeedSampleMap() error {
	existing, err := d.app.FindRecordsByFilter(mapsCollection, "", "", 1, 0, nil)
	if err != nil {
		return errs.Newf("check existing maps: %v", err)
	}
	if len(existing) > 0 {
		return nil
	}

	var fields map[string]any
	if err := json.Unmarshal(sampleMapJSON, &fields); err != nil {
		return errs.Newf("parse sample map json: %v", err)
	}
	for _, key := range seedStripKeys {
		delete(fields, key)
	}

	collection, err := d.app.FindCollectionByNameOrId(mapsCollection)
	if err != nil {
		return errs.Newf("find maps collection: %v", err)
	}
	record := core.NewRecord(collection)
	for key, value := range fields {
		record.Set(key, value)
	}
	if err := d.app.Save(record); err != nil {
		return errs.Newf("save sample map: %v", err)
	}
	return nil
}
