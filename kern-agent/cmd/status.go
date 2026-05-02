package cmd

import (
	"fmt"
	"strings"
	"time"

	"github.com/fatih/color"
	"github.com/spf13/cobra"

	"github.com/kern-dev/kern-agent/internal/config"
	"github.com/kern-dev/kern-agent/internal/db"
)

var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show local buffer stats and recent captured events",
	RunE:  runStatus,
}

var statusLines int

func init() {
	statusCmd.Flags().IntVar(&statusLines, "lines", 10, "Number of recent events to display")
}

var activityColors = map[string]func(a ...interface{}) string{
	"CODING":      color.New(color.FgBlue).SprintFunc(),
	"DEBUGGING":   color.New(color.FgRed).SprintFunc(),
	"TESTING":     color.New(color.FgGreen).SprintFunc(),
	"DEVOPS":      color.New(color.FgYellow).SprintFunc(),
	"RESEARCHING": color.New(color.FgMagenta).SprintFunc(),
	"IDLE":        color.New(color.Faint).SprintFunc(),
}

func colorActivity(t string) string {
	if fn, ok := activityColors[t]; ok {
		return fn(t)
	}
	return t
}

func runStatus(cmd *cobra.Command, args []string) error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}

	database, err := db.Open(config.DBPath())
	if err != nil {
		return fmt.Errorf("failed to open local database: %w", err)
	}
	defer database.Close()

	total, synced, unsynced, err := database.Stats()
	if err != nil {
		return fmt.Errorf("failed to read stats: %w", err)
	}

	recent, err := database.RecentEvents(statusLines)
	if err != nil {
		return fmt.Errorf("failed to read recent events: %w", err)
	}

	bold := color.New(color.Bold)
	dim := color.New(color.Faint)
	green := color.New(color.FgGreen)
	cyan := color.New(color.FgCyan)

	fmt.Println()
	bold.Println("  KERN_ status")
	fmt.Println()

	// Config info
	dim.Println("  Configuration")
	fmt.Printf("    Endpoint  %s\n", cyan.Sprint(cfg.APIEndpoint))
	fmt.Printf("    DB path   %s\n", dim.Sprint(config.DBPath()))
	fmt.Println()

	// Buffer stats
	dim.Println("  Buffer")
	fmt.Printf("    Total events   %d\n", total)
	fmt.Printf("    Synced         %s\n", green.Sprintf("%d", synced))
	fmt.Printf("    Pending sync   %s\n", color.YellowString("%d", unsynced))
	fmt.Println()

	if len(recent) == 0 {
		dim.Println("  No events captured yet. Run `kern init` to set up shell hooks.")
		fmt.Println()
		return nil
	}

	// Recent events table
	dim.Printf("  Recent events (last %d)\n\n", len(recent))
	fmt.Printf("    %-12s  %-11s  %-8s  %s\n",
		dim.Sprint("TYPE"), dim.Sprint("TIME"), dim.Sprint("DURATION"), dim.Sprint("COMMAND"))
	fmt.Println("    " + strings.Repeat("─", 70))

	for _, e := range recent {
		duration := e.EndTime.Sub(e.StartTime)
		timeStr := formatTimeAgo(e.StartTime)
		cmdShort := e.Command
		if len(cmdShort) > 50 {
			cmdShort = cmdShort[:47] + "..."
		}
		syncMark := " "
		if e.Synced {
			syncMark = dim.Sprint("✓")
		}

		fmt.Printf("    %-12s  %-11s  %-8s  %s %s\n",
			colorActivity(e.ActivityType),
			timeStr,
			formatDuration(duration),
			cmdShort,
			syncMark,
		)
	}
	fmt.Println()

	if unsynced > 0 {
		color.New(color.FgYellow).Printf("  %d events pending sync. Run `kern sync` to flush.\n", unsynced)
	} else {
		green.Println("  All events synced.")
	}
	fmt.Println()
	return nil
}

func formatTimeAgo(t time.Time) string {
	d := time.Since(t)
	if d < time.Minute {
		return "just now"
	}
	if d < time.Hour {
		return fmt.Sprintf("%dm ago", int(d.Minutes()))
	}
	if d < 24*time.Hour {
		return fmt.Sprintf("%dh ago", int(d.Hours()))
	}
	return t.Format("Jan 2")
}
