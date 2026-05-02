package cmd

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/fatih/color"
	"github.com/spf13/cobra"

	"github.com/kern-dev/kern-agent/internal/client"
	"github.com/kern-dev/kern-agent/internal/config"
	"github.com/kern-dev/kern-agent/internal/db"
)

var daemonCmd = &cobra.Command{
	Use:   "daemon",
	Short: "Run background sync daemon",
	Long: `Runs a background process that flushes the local event buffer to the
KERN API on a regular schedule (default: every 5 minutes).

Add to your shell startup to run automatically:
  nohup kern daemon &>/dev/null &`,
	RunE: runDaemon,
}

var daemonInterval int

func init() {
	daemonCmd.Flags().IntVar(&daemonInterval, "interval", 0, "Sync interval in seconds (overrides config)")
}

func runDaemon(cmd *cobra.Command, args []string) error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}

	interval := cfg.SyncEvery
	if daemonInterval > 0 {
		interval = daemonInterval
	}
	if interval < 30 {
		interval = 30 // minimum 30s
	}

	bold := color.New(color.Bold)
	green := color.New(color.FgGreen)
	dim := color.New(color.Faint)

	bold.Printf("\n  KERN daemon started (sync every %ds)\n", interval)
	dim.Printf("  PID %d — press Ctrl+C to stop\n\n", os.Getpid())

	ticker := time.NewTicker(time.Duration(interval) * time.Second)
	defer ticker.Stop()

	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)

	syncOnce := func() {
		database, err := db.Open(config.DBPath())
		if err != nil {
			fmt.Fprintf(os.Stderr, "  db error: %v\n", err)
			return
		}
		defer database.Close()

		events, err := database.UnsyncedEvents(1000)
		if err != nil || len(events) == 0 {
			return
		}

		sessions := client.GroupIntoSessions(events)
		if len(sessions) == 0 {
			return
		}

		if cfg.APIEndpoint == "" || cfg.APIEndpoint == "https://kern.dev/api" {
			dim.Printf("  [%s] %d sessions buffered (no endpoint configured)\n",
				time.Now().Format("15:04:05"), len(sessions))
			return
		}

		c := client.New(cfg.APIEndpoint, cfg.APIKey)
		_, err = c.Sync(sessions)
		if err != nil {
			fmt.Fprintf(os.Stderr, "  [%s] sync error: %v\n", time.Now().Format("15:04:05"), err)
			return
		}

		var ids []int64
		for _, e := range events {
			ids = append(ids, e.ID)
		}
		database.MarkSynced(ids)
		database.Prune(30 * 24 * time.Hour)

		green.Printf("  [%s] ✓ Synced %d sessions\n", time.Now().Format("15:04:05"), len(sessions))
	}

	// Sync immediately on start
	syncOnce()

	for {
		select {
		case <-ticker.C:
			syncOnce()
		case sig := <-sigs:
			fmt.Printf("\n  Received %v — shutting down daemon.\n", sig)
			return nil
		}
	}
}
