package cmd

import (
	"fmt"
	"time"

	"github.com/fatih/color"
	"github.com/kern-dev/kern-agent/internal/config"
	"github.com/spf13/cobra"
)

var dashboardCmd = &cobra.Command{
	Use:   "dashboard",
	Short: "Open the KERN dashboard in your browser",
	Long:  `Derives the dashboard URL from your configured API endpoint and opens it in the default browser.`,
	RunE:  runDashboard,
}

func runDashboard(_ *cobra.Command, _ []string) error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}

	bold := color.New(color.Bold)
	green := color.New(color.FgGreen)
	cyan := color.New(color.FgCyan)
	dim := color.New(color.Faint)

	dashURL := dashboardURL(cfg.APIEndpoint)

	fmt.Println()
	bold.Println("  KERN_ dashboard")
	fmt.Println()
	fmt.Printf("  %s  %s\n", green.Sprint("→"), termLink(dashURL, dashURL))
	fmt.Println()
	fmt.Printf("  %s\n", dim.Sprint("Opening in your browser…"))
	fmt.Println()

	time.Sleep(300 * time.Millisecond)
	openBrowser(dashURL)

	fmt.Printf("  %s If the browser didn't open, visit: %s\n",
		dim.Sprint("→"), cyan.Sprint(dashURL))
	fmt.Println()
	return nil
}
