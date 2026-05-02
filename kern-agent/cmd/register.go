package cmd

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"github.com/fatih/color"
	"github.com/spf13/cobra"

	"github.com/kern-dev/kern-agent/internal/client"
	"github.com/kern-dev/kern-agent/internal/config"
)

var registerCmd = &cobra.Command{
	Use:   "register",
	Short: "Create a KERN account and save your API key",
	Long: `Registers a new developer account on the KERN server and saves
the returned API key + endpoint to your local config (~/.kern/config.json).

If your team admin has shared an invite code, pass it with --team-code
to automatically join the team on registration.`,
	RunE: runRegister,
}

var (
	registerEndpoint string
	registerName     string
	registerEmail    string
	registerGitHub   string
	registerTimezone string
	registerTeamCode string
)

func init() {
	registerCmd.Flags().StringVar(&registerEndpoint, "endpoint", "", "KERN API endpoint URL (e.g. https://kern.dev/api)")
	registerCmd.Flags().StringVar(&registerName, "name", "", "Your full name")
	registerCmd.Flags().StringVar(&registerEmail, "email", "", "Your email address")
	registerCmd.Flags().StringVar(&registerGitHub, "github", "", "GitHub username (optional)")
	registerCmd.Flags().StringVar(&registerTimezone, "timezone", "UTC", "Your timezone (e.g. America/New_York)")
	registerCmd.Flags().StringVar(&registerTeamCode, "team-code", "", "Team invite code (e.g. ABCD-1234) — get this from your admin's Settings page")
}

func runRegister(cmd *cobra.Command, args []string) error {
	bold := color.New(color.Bold)
	dim := color.New(color.Faint)
	green := color.New(color.FgGreen)
	cyan := color.New(color.FgCyan)
	yellow := color.New(color.FgYellow)

	fmt.Println()
	bold.Println("  KERN_ register")
	dim.Println("  Create a developer account and save your API key")
	fmt.Println()

	reader := bufio.NewReader(os.Stdin)

	endpoint := registerEndpoint
	if endpoint == "" {
		fmt.Println()
		yellow.Println("  ℹ  Where to find your API endpoint:")
		dim.Println("     Open your KERN dashboard → Settings → Invite Teammates")
		dim.Println("     Copy the full `kern register` command shown there — it includes")
		dim.Println("     the endpoint and your team code pre-filled.")
		fmt.Println()
		endpoint = prompt(reader, "  API endpoint", "")
		if endpoint == "" {
			return fmt.Errorf("endpoint is required — find it in Settings → Invite Teammates on the dashboard")
		}
	}
	endpoint = strings.TrimRight(strings.TrimSpace(endpoint), "/")

	name := registerName
	if name == "" {
		name = prompt(reader, "  Your name", "")
		if name == "" {
			return fmt.Errorf("name is required")
		}
	}

	email := registerEmail
	if email == "" {
		email = prompt(reader, "  Email", "")
		if email == "" {
			return fmt.Errorf("email is required")
		}
	}

	github := registerGitHub
	if github == "" {
		github = prompt(reader, "  GitHub handle (optional, press Enter to skip)", "")
	}

	tz := registerTimezone
	if tz == "UTC" && registerTimezone == "UTC" {
		tzInput := prompt(reader, "  Timezone (Enter for UTC)", "UTC")
		if tzInput != "" {
			tz = tzInput
		}
	}

	teamCode := registerTeamCode
	if teamCode == "" {
		dim.Println()
		dim.Println("  ℹ  Team invite code (optional):")
		dim.Println("     If your admin shared a code from Settings → Invite Teammates,")
		dim.Println("     paste it here to join the team automatically.")
		teamCode = prompt(reader, "  Team invite code (Enter to skip)", "")
	}

	fmt.Println()
	dim.Println("  Registering…")

	c := client.New(endpoint, "")
	result, err := c.Register(client.RegisterRequest{
		Name:         name,
		Email:        email,
		GithubHandle: github,
		Timezone:     tz,
		TeamCode:     teamCode,
	})
	if err != nil {
		return fmt.Errorf("registration failed: %w", err)
	}

	// Save config
	cfg, _ := config.Load()
	if cfg == nil {
		cfg = config.DefaultConfig()
	}
	cfg.APIEndpoint = endpoint
	cfg.APIKey = result.APIKey
	if err := cfg.Save(); err != nil {
		color.New(color.FgYellow).Printf("  ⚠ Could not save config: %v\n", err)
		color.New(color.FgYellow).Println("  Save manually:")
		fmt.Printf("    kern config --endpoint %s --key %s\n", endpoint, result.APIKey)
	}

	fmt.Println()
	green.Println("  ✓ Account created successfully!")
	fmt.Println()
	fmt.Printf("    Name     %s\n", cyan.Sprint(result.Name))
	fmt.Printf("    Email    %s\n", cyan.Sprint(result.Email))
	fmt.Printf("    Role     %s\n", result.Role)
	if result.TeamName != "" {
		fmt.Printf("    Team     %s\n", cyan.Sprint(result.TeamName))
	}
	fmt.Println()
	dim.Println("  Your API key has been saved to ~/.kern/config.json")
	dim.Println("  Run `kern init` to inject shell hooks and start tracking.")
	fmt.Println()
	return nil
}

func prompt(reader *bufio.Reader, label, defaultVal string) string {
	if defaultVal != "" {
		fmt.Printf("%s [%s]: ", label, defaultVal)
	} else {
		fmt.Printf("%s: ", label)
	}
	line, _ := reader.ReadString('\n')
	line = strings.TrimSpace(line)
	if line == "" {
		return defaultVal
	}
	return line
}
