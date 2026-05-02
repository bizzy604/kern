package cmd

import (
        "fmt"
        "os"

        "github.com/fatih/color"
        "github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
        Use:   "kern",
        Short: "KERN — developer behavioral intelligence agent",
        Long: `kern captures your terminal activity, classifies it by type,
buffers it locally in SQLite, and syncs it to the KERN dashboard.

  kern init          Inject shell hooks into your shell config
  kern record        Record a single command event (called by shell hooks)
  kern sync          Flush buffered events to the KERN API
  kern daemon        Run background sync daemon
  kern status        Show local buffer stats and recent events
  kern config        Show or set configuration values
  kern dashboard     Open the KERN dashboard in your browser`,
        Version: "1.0.0",
}

func Execute() {
        if err := rootCmd.Execute(); err != nil {
                fmt.Fprintln(os.Stderr, color.RedString("Error: ")+err.Error())
                os.Exit(1)
        }
}

func init() {
        rootCmd.AddCommand(initCmd)
        rootCmd.AddCommand(recordCmd)
        rootCmd.AddCommand(syncCmd)
        rootCmd.AddCommand(daemonCmd)
        rootCmd.AddCommand(statusCmd)
        rootCmd.AddCommand(configCmd)
        rootCmd.AddCommand(dashboardCmd)
}
