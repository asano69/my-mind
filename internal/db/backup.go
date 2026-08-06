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

	workingTier = "working"
	dailyTier   = "daily"
	weeklyTier  = "weekly"

	// Number of snapshots kept per map, per tier. Working snapshots are
	// taken every minute, so more generations are kept; daily/weekly run
	// far less often, so a handful of generations already spans a long
	// history (see docs/design.md).
	workingRetention = 32
	dailyRetention   = 8
	weeklyRetention  = 8

	// Upper bound used when listing a single map's snapshots for a tier.
	// Rotation keeps the real count at the tier's retention, so this is
	// only a safety margin against runaway growth, not an expected count.
	snapshotListLimit = 1000
)

// BackupWorkingSnapshots scans every map and, for any map whose content
// has changed since its last working-tier snapshot, stores a new
// snapshot and prunes old ones beyond the retention window. Meant to run
// on a short interval (e.g. once a minute) while maps are actively being
// edited.
func (d *Database) BackupWorkingSnapshots() error {
	return d.backupTierSnapshots(workingTier, workingRetention)
}

// BackupDailySnapshots takes one daily-tier snapshot per map (skipping
// maps unchanged since the last daily snapshot) and prunes old ones
// beyond the retention window. Meant to run once a day, at a time the
// map is unlikely to be actively edited (see docs/design.md).
func (d *Database) BackupDailySnapshots() error {
	return d.backupTierSnapshots(dailyTier, dailyRetention)
}

// BackupWeeklySnapshots is BackupDailySnapshots' weekly-tier
// counterpart. Meant to run once a week.
func (d *Database) BackupWeeklySnapshots() error {
	return d.backupTierSnapshots(weeklyTier, weeklyRetention)
}

// backupTierSnapshots applies the two-stage check from docs/design.md
// (skip if the map has no edits since the tier's last snapshot; skip if
// its content did not actually change) to every map, for the given tier.
// workingTier/dailyTier/weeklyTier all share this same logic -- only the
// cadence they're called at (see internal/cmd/serve/serve.go's cron
// registrations) and the retention window differ between tiers.
func (d *Database) backupTierSnapshots(tier string, retention int) error {
	maps, err := d.app.FindAllRecords(mapsCollection)
	if err != nil {
		return errs.Newf("list maps: %v", err)
	}
	for _, m := range maps {
		if err := d.backupSnapshotForMap(m, tier, retention); err != nil {
			return err
		}
	}
	return nil
}

func (d *Database) backupSnapshotForMap(m *core.Record, tier string, retention int) error {
	latest, err := d.latestSnapshot(m.Id, tier)
	if err != nil {
		return err
	}
	if latest != nil && !m.GetDateTime("updated").Time().After(latest.GetDateTime("created").Time()) {
		return nil // no edits since the last snapshot
	}
	if latest != nil && sameJSON(latest.Get("mymind"), m.Get("mymind")) {
		return nil // map was saved again, but its content is unchanged
	}
	if err := d.createSnapshot(m, tier); err != nil {
		return err
	}
	return d.pruneSnapshots(m.Id, tier, retention)
}

func (d *Database) latestSnapshot(mapID, tier string) (*core.Record, error) {
	records, err := d.app.FindRecordsByFilter(
		snapshotsCollection,
		"map = {:map} && tier = {:tier}",
		"-created",
		1,
		0,
		dbx.Params{"map": mapID, "tier": tier},
	)
	if err != nil {
		return nil, errs.Newf("find latest %s snapshot: %v", tier, err)
	}
	if len(records) == 0 {
		return nil, nil
	}
	return records[0], nil
}

func (d *Database) createSnapshot(m *core.Record, tier string) error {
	collection, err := d.app.FindCollectionByNameOrId(snapshotsCollection)
	if err != nil {
		return errs.Newf("find snapshots collection: %v", err)
	}
	snapshot := core.NewRecord(collection)
	snapshot.Set("map", m.Id)
	snapshot.Set("tier", tier)
	snapshot.Set("mymind", m.Get("mymind"))
	snapshot.Set("svg", m.GetString("svg"))
	if err := d.app.Save(snapshot); err != nil {
		return errs.Newf("save %s snapshot: %v", tier, err)
	}
	return nil
}

// pruneSnapshots deletes every tier snapshot for mapID beyond the
// retention window, keeping the most recent `retention` generations.
func (d *Database) pruneSnapshots(mapID, tier string, retention int) error {
	records, err := d.app.FindRecordsByFilter(
		snapshotsCollection,
		"map = {:map} && tier = {:tier}",
		"-created",
		snapshotListLimit,
		0,
		dbx.Params{"map": mapID, "tier": tier},
	)
	if err != nil {
		return errs.Newf("list %s snapshots: %v", tier, err)
	}
	for _, r := range records[min(len(records), retention):] {
		if err := d.app.Delete(r); err != nil {
			return errs.Newf("delete old %s snapshot: %v", tier, err)
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
