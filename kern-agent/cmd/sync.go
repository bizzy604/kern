package cmd

import (
	"fmt"

	"github.com/fatih/color"
	"github.com/spf13/cobra"

	"github.com/kern-dev/kern-agent/internal/client"
	"github.com/kern-dev/kern-agent/internal/config"
	"github.com/kern-dev/kern-agent/internal/db"
)

var syncCmd = &cobra.Command{
	Use:   "sync",
	Short: "Flush buffered events to the KERN API",
	Long:  `Reads unsynced events from the local SQLite buffer, groups them into sessions, and posts them to the KERN API. Run automatically by the daemon.`,
	RunE:  runSync,
}

var syncDryRun bool

func init() {
	syncCmd.Flags().BoolVar(&syncDryRun, "dry-run", false, "Show what would be synced without sending")
}

func runSync(cmd *cobra.Command, args []string) error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}

	database, err := db.Open(config.DBPath())
	if err != nil {
		return fmt.Errorf("failed to open local database: %w", err)
	}
	defer database.Close()

	events, err := database.UnsyncedEvents(500)
	if err != nil {
		return fmt.Errorf("failed to read events: %w", err)
	}

	if len(events) == 0 {
		color.New(color.FgGreen).Println("  ✓ Nothing to sync — buffer is empty.")
		return nil
	}

	sessions := client.GroupIntoSessions(events)
	if len(sessions) == 0 {
		color.New(color.FgYellow).Println("  ⚠ Events present but no valid sessions to sync.")
		return nil
	}

	fmt.Printf("  %d events → %d sessions\n", len(events), len(sessions))

	if syncDryRun {
		color.New(color.FgYellow).Println("  [dry-run] Would sync:")
		for _, s := range sessions {
			fmt.Printf("    %s  %s  %dm  %d cmds\n",
				s.ActivityType, s.StartedAt[:10], s.DurationMins, s.CommandCount)
		}
		return nil
	}

	if cfg.APIEndpoint == "" || cfg.APIEndpoint == "https://kern.dev/api" {
		color.New(color.FgYellow).Println("  ⚠ No API endpoint configured. Run `kern config --endpoint <url>` first.")
		color.New(color.FgYellow).Println("  Events are buffered locally and will sync once configured.")
		return nil
	}

	c := client.New(cfg.APIEndpoint, cfg.APIKey)

	result, err := c.Sync(sessions)
	if err != nil {
		return fmt.Errorf("sync failed: %w", err)
	}

	// Mark all synced events
	var ids []int64
	for _, e := range events {
		ids = append(ids, e.ID)
	}
	if err := database.MarkSynced(ids); err != nil {
		return fmt.Errorf("failed to mark events as synced: %w", err)
	}

	// Prune old synced events (keep 30 days)
	pruned, _ := database.Prune(30 * 24 * 60 * 60 * 1e9)

	color.New(color.FgGreen).Printf("  ✓ Synced %d sessions (%d accepted by server)\n", len(sessions), result.Accepted)
	if pruned > 0 {
		fmt.Printf("  Pruned %d old synced events.\n", pruned)
	}
	return nil
}
