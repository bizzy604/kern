package cmd

import (
	"fmt"

	"github.com/fatih/color"
	"github.com/spf13/cobra"

	"github.com/kern-dev/kern-agent/internal/config"
)

var configCmd = &cobra.Command{
	Use:   "config",
	Short: "Show or update KERN configuration",
	Long:  `View the current configuration or update specific settings.`,
	RunE:  runConfig,
}

var (
	configEndpoint string
	configAPIKey   string
	configDevID    int
)

func init() {
	configCmd.Flags().StringVar(&configEndpoint, "endpoint", "", "KERN API base URL (e.g. https://kern.dev/api)")
	configCmd.Flags().StringVar(&configAPIKey, "key", "", "API key for authentication")
	configCmd.Flags().IntVar(&configDevID, "dev-id", 0, "Developer ID")
}

func runConfig(cmd *cobra.Command, args []string) error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}

	changed := false
	if configEndpoint != "" {
		cfg.APIEndpoint = configEndpoint
		changed = true
	}
	if configAPIKey != "" {
		cfg.APIKey = configAPIKey
		changed = true
	}
	if configDevID > 0 {
		cfg.DeveloperID = configDevID
		changed = true
	}

	if changed {
		if err := cfg.Save(); err != nil {
			return fmt.Errorf("failed to save config: %w", err)
		}
		color.New(color.FgGreen).Println("  ✓ Configuration saved.")
	}

	bold := color.New(color.Bold)
	dim := color.New(color.Faint)
	cyan := color.New(color.FgCyan)

	fmt.Println()
	bold.Println("  KERN_ configuration")
	fmt.Println()
	fmt.Printf("    %-20s %s\n", dim.Sprint("api_endpoint"), cyan.Sprint(cfg.APIEndpoint))
	if cfg.APIKey != "" {
		fmt.Printf("    %-20s %s\n", dim.Sprint("api_key"), "****"+cfg.APIKey[max(0, len(cfg.APIKey)-4):])
	} else {
		fmt.Printf("    %-20s %s\n", dim.Sprint("api_key"), dim.Sprint("(not set)"))
	}
	fmt.Printf("    %-20s %s\n", dim.Sprint("developer_id"), fmt.Sprintf("%d", cfg.DeveloperID))
	fmt.Printf("    %-20s %s\n", dim.Sprint("sync_every"), fmt.Sprintf("%ds", cfg.SyncEvery))
	fmt.Printf("    %-20s %s\n", dim.Sprint("config_path"), dim.Sprint(config.Path()))
	fmt.Printf("    %-20s %s\n", dim.Sprint("db_path"), dim.Sprint(config.DBPath()))
	fmt.Println()
	return nil
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
