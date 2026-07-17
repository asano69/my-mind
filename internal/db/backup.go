// Package db (continued): automatic backup of maps into the snapshots
// collection.
package db

import (
	"bytes"
	"encoding/json"

	"github.com/asano69/my-mind/internal/errs"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const (
	mapsCollection      = "maps"
	snapshotsCollection = "snapshots"
	workingTier         = "working"

	// Number of working-tier snapshots kept per map. At an estimated
	// ~20KB per snapshot (mymind JSON + SVG), 32 generations stay well
	// under 1MB per map (see docs/design.md).
	workingRetention = 32

	// Upper bound used when listing a single map's working snapshots.
	// Rotation keeps the real count at workingRetention, so this is only
	// a safety margin against runaway growth, not an expected count.
	workingListLimit = 1000
)

// BackupWorkingSnapshots scans every map and, for any map whose content
// has changed since its last working-tier snapshot, stores a new
// snapshot and prunes old ones beyond the retention window. It is meant
// to run on a short interval (e.g. once a minute) while maps are
// actively being edited. Other tiers (daily/weekly/...) are handled
// separately, directly by PocketBase's own cron-based rules, not by
// this function (see docs/design.md).
func (d *Database) BackupWorkingSnapshots() error {
	maps, err := d.app.FindAllRecords(mapsCollection)
	if err != nil {
		return errs.Newf("list maps: %v", err)
	}
	for _, m := range maps {
		if err := d.backupWorkingSnapshotForMap(m); err != nil {
			return err
		}
	}
	return nil
}

// backupWorkingSnapshotForMap applies the two-stage check from
// docs/design.md: skip entirely if the map has not been saved since the
// last working snapshot, and skip creating a new snapshot if the map's
// content (mymind) did not actually change (e.g. only the title was
// updated).
func (d *Database) backupWorkingSnapshotForMap(m *core.Record) error {
	latest, err := d.latestWorkingSnapshot(m.Id)
	if err != nil {
		return err
	}
	if latest != nil && !m.GetDateTime("updated").Time().After(latest.GetDateTime("created").Time()) {
		return nil // no edits since the last snapshot
	}
	if latest != nil && sameJSON(latest.Get("mymind"), m.Get("mymind")) {
		return nil // map was saved again, but its content is unchanged
	}
	if err := d.createWorkingSnapshot(m); err != nil {
		return err
	}
	return d.pruneWorkingSnapshots(m.Id)
}

func (d *Database) latestWorkingSnapshot(mapID string) (*core.Record, error) {
	records, err := d.app.FindRecordsByFilter(
		snapshotsCollection,
		"map = {:map} && tier = {:tier}",
		"-created",
		1,
		0,
		dbx.Params{"map": mapID, "tier": workingTier},
	)
	if err != nil {
		return nil, errs.Newf("find latest working snapshot: %v", err)
	}
	if len(records) == 0 {
		return nil, nil
	}
	return records[0], nil
}

func (d *Database) createWorkingSnapshot(m *core.Record) error {
	collection, err := d.app.FindCollectionByNameOrId(snapshotsCollection)
	if err != nil {
		return errs.Newf("find snapshots collection: %v", err)
	}
	snapshot := core.NewRecord(collection)
	snapshot.Set("map", m.Id)
	snapshot.Set("tier", workingTier)
	snapshot.Set("mymind", m.Get("mymind"))
	snapshot.Set("svg", m.GetString("svg"))
	if err := d.app.Save(snapshot); err != nil {
		return errs.Newf("save working snapshot: %v", err)
	}
	return nil
}

// pruneWorkingSnapshots deletes every working-tier snapshot for mapID
// beyond the retention window, keeping the most recent workingRetention
// generations.
func (d *Database) pruneWorkingSnapshots(mapID string) error {
	records, err := d.app.FindRecordsByFilter(
		snapshotsCollection,
		"map = {:map} && tier = {:tier}",
		"-created",
		workingListLimit,
		0,
		dbx.Params{"map": mapID, "tier": workingTier},
	)
	if err != nil {
		return errs.Newf("list working snapshots: %v", err)
	}
	for _, r := range records[min(len(records), workingRetention):] {
		if err := d.app.Delete(r); err != nil {
			return errs.Newf("delete old working snapshot: %v", err)
		}
	}
	return nil
}

// sameJSON reports whether two values (typically PocketBase JSON field
// values) marshal to identical JSON.
func sameJSON(a, b any) bool {
	aBytes, aErr := json.Marshal(a)
	bBytes, bErr := json.Marshal(b)
	return aErr == nil && bErr == nil && bytes.Equal(aBytes, bBytes)
}
