package db

import (
        "database/sql"
        "fmt"
        "os"
        "path/filepath"
        "time"

        _ "modernc.org/sqlite"
)

type Event struct {
        ID           int64
        Command      string
        Cwd          string
        StartTime    time.Time
        EndTime      time.Time
        ExitCode     int
        ActivityType string
        Confidence   float64
        Project      string
        Language     string
        Synced       bool
        CreatedAt    time.Time
}

type DB struct {
        conn *sql.DB
}

func Open(path string) (*DB, error) {
        // Ensure parent directory exists
        if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
                return nil, fmt.Errorf("cannot create db directory: %w", err)
        }
        conn, err := sql.Open("sqlite", path+"?_journal_mode=WAL&_busy_timeout=5000&_synchronous=NORMAL")
        if err != nil {
                return nil, err
        }
        d := &DB{conn: conn}
        if err := d.migrate(); err != nil {
                return nil, err
        }
        return d, nil
}

func (d *DB) Close() error {
        return d.conn.Close()
}

func (d *DB) migrate() error {
        _, err := d.conn.Exec(`
                CREATE TABLE IF NOT EXISTS events (
                        id            INTEGER PRIMARY KEY AUTOINCREMENT,
                        command       TEXT    NOT NULL,
                        cwd           TEXT    NOT NULL DEFAULT '',
                        start_time    INTEGER NOT NULL,
                        end_time      INTEGER NOT NULL,
                        exit_code     INTEGER NOT NULL DEFAULT 0,
                        activity_type TEXT    NOT NULL DEFAULT 'CODING',
                        confidence    REAL    NOT NULL DEFAULT 0.72,
                        project       TEXT    NOT NULL DEFAULT '',
                        language      TEXT    NOT NULL DEFAULT '',
                        synced        INTEGER NOT NULL DEFAULT 0,
                        created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
                );
                CREATE INDEX IF NOT EXISTS idx_events_synced ON events(synced);
                CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_time);
        `)
        return err
}

// InsertEvent stores a new captured event.
func (d *DB) InsertEvent(e *Event) (int64, error) {
        res, err := d.conn.Exec(`
                INSERT INTO events (command, cwd, start_time, end_time, exit_code, activity_type, confidence, project, language)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                e.Command,
                e.Cwd,
                e.StartTime.UnixNano(),
                e.EndTime.UnixNano(),
                e.ExitCode,
                e.ActivityType,
                e.Confidence,
                e.Project,
                e.Language,
        )
        if err != nil {
                return 0, err
        }
        return res.LastInsertId()
}

// UnsynedEvents returns all events not yet pushed to the API.
func (d *DB) UnsyncedEvents(limit int) ([]*Event, error) {
        rows, err := d.conn.Query(`
                SELECT id, command, cwd, start_time, end_time, exit_code, activity_type, confidence, project, language, created_at
                FROM events
                WHERE synced = 0
                ORDER BY start_time ASC
                LIMIT ?`, limit)
        if err != nil {
                return nil, err
        }
        defer rows.Close()

        var events []*Event
        for rows.Next() {
                e := &Event{}
                var startNs, endNs, createdAt int64
                if err := rows.Scan(
                        &e.ID, &e.Command, &e.Cwd,
                        &startNs, &endNs,
                        &e.ExitCode, &e.ActivityType, &e.Confidence,
                        &e.Project, &e.Language, &createdAt,
                ); err != nil {
                        return nil, err
                }
                e.StartTime = time.Unix(0, startNs)
                e.EndTime = time.Unix(0, endNs)
                e.CreatedAt = time.Unix(createdAt, 0)
                events = append(events, e)
        }
        return events, rows.Err()
}

// MarkSynced marks a batch of event IDs as synced.
func (d *DB) MarkSynced(ids []int64) error {
        if len(ids) == 0 {
                return nil
        }
        tx, err := d.conn.Begin()
        if err != nil {
                return err
        }
        stmt, err := tx.Prepare(`UPDATE events SET synced = 1 WHERE id = ?`)
        if err != nil {
                tx.Rollback()
                return err
        }
        defer stmt.Close()
        for _, id := range ids {
                if _, err := stmt.Exec(id); err != nil {
                        tx.Rollback()
                        return err
                }
        }
        return tx.Commit()
}

// Stats returns basic event counts.
func (d *DB) Stats() (total, synced, unsynced int, err error) {
        err = d.conn.QueryRow(`SELECT COUNT(*) FROM events`).Scan(&total)
        if err != nil {
                return
        }
        err = d.conn.QueryRow(`SELECT COUNT(*) FROM events WHERE synced = 1`).Scan(&synced)
        if err != nil {
                return
        }
        unsynced = total - synced
        return
}

// RecentEvents returns the N most recent events.
func (d *DB) RecentEvents(n int) ([]*Event, error) {
        rows, err := d.conn.Query(`
                SELECT id, command, cwd, start_time, end_time, exit_code, activity_type, confidence, project, language, synced, created_at
                FROM events
                ORDER BY start_time DESC
                LIMIT ?`, n)
        if err != nil {
                return nil, err
        }
        defer rows.Close()

        var events []*Event
        for rows.Next() {
                e := &Event{}
                var startNs, endNs, createdAt int64
                var syncedInt int
                if err := rows.Scan(
                        &e.ID, &e.Command, &e.Cwd,
                        &startNs, &endNs,
                        &e.ExitCode, &e.ActivityType, &e.Confidence,
                        &e.Project, &e.Language, &syncedInt, &createdAt,
                ); err != nil {
                        return nil, err
                }
                e.StartTime = time.Unix(0, startNs)
                e.EndTime = time.Unix(0, endNs)
                e.Synced = syncedInt == 1
                e.CreatedAt = time.Unix(createdAt, 0)
                events = append(events, e)
        }
        return events, rows.Err()
}

// Prune deletes synced events older than the given duration.
func (d *DB) Prune(olderThan time.Duration) (int64, error) {
        cutoff := time.Now().Add(-olderThan).UnixNano()
        res, err := d.conn.Exec(`DELETE FROM events WHERE synced = 1 AND start_time < ?`, cutoff)
        if err != nil {
                return 0, err
        }
        return res.RowsAffected()
}
