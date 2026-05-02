package cmd

import (
        "fmt"
        "os"
        "path/filepath"
        "strconv"
        "strings"
        "time"

        "github.com/spf13/cobra"

        "github.com/kern-dev/kern-agent/internal/classifier"
        "github.com/kern-dev/kern-agent/internal/config"
        "github.com/kern-dev/kern-agent/internal/db"
        "github.com/kern-dev/kern-agent/internal/git"
)

var (
        recordCmd_cmd      string
        recordCmd_start    string
        recordCmd_exit     int
        recordCmd_cwd      string
)

var recordCmd = &cobra.Command{
        Use:    "record",
        Short:  "Record a command event (called by shell hooks)",
        Hidden: true, // Users don't call this directly
        RunE:   runRecord,
}

func init() {
        recordCmd.Flags().StringVar(&recordCmd_cmd, "cmd", "", "The command that was run")
        recordCmd.Flags().StringVar(&recordCmd_start, "start", "0", "Start time as Unix nanoseconds")
        recordCmd.Flags().IntVar(&recordCmd_exit, "exit", 0, "Exit code")
        recordCmd.Flags().StringVar(&recordCmd_cwd, "cwd", "", "Working directory")
        recordCmd.MarkFlagRequired("cmd")
}

func runRecord(cmd *cobra.Command, args []string) error {
        command := strings.TrimSpace(recordCmd_cmd)
        if command == "" || isNoisy(command) {
                return nil
        }

        endTime := time.Now()

        var startTime time.Time
        if startNs, err := strconv.ParseInt(recordCmd_start, 10, 64); err == nil && startNs > 0 {
                startTime = time.Unix(0, startNs)
        } else {
                startTime = endTime.Add(-1 * time.Second)
        }

        // Sanity check: clamp if start is in the future or way too old
        if startTime.After(endTime) || endTime.Sub(startTime) > 12*time.Hour {
                startTime = endTime.Add(-1 * time.Second)
        }

        durationSecs := endTime.Sub(startTime).Seconds()
        activityType, confidence := classifier.ClassifyByDuration(command, durationSecs)

        cwd := recordCmd_cwd
        if cwd == "" {
                cwd, _ = os.Getwd()
        }

        project := inferProject(cwd)
        language := inferLanguage(command)

        cfg, err := config.Load()
        if err != nil {
                return nil // silently fail — don't break the user's shell
        }

        database, err := db.Open(config.DBPath())
        if err != nil {
                return nil
        }
        defer database.Close()

        event := &db.Event{
                Command:      command,
                Cwd:          cwd,
                StartTime:    startTime,
                EndTime:      endTime,
                ExitCode:     recordCmd_exit,
                ActivityType: string(activityType),
                Confidence:   confidence,
                Project:      project,
                Language:     language,
        }

        eventID, err := database.InsertEvent(event)
        if err != nil {
                return nil // silently fail
        }

        // If this was a git commit-producing command, extract and store commit metadata
        if git.IsCommitTrigger(command) {
                if info, err := git.ExtractLatestCommit(cwd); err == nil && info != nil {
                        _ = database.InsertGitEvent(
                                eventID,
                                info.Hash, info.ShortHash,
                                info.Branch, info.Message, info.Author,
                                info.FilesChanged, info.Insertions, info.Deletions,
                                project,
                        )
                }
        }

        _ = cfg
        return nil
}

// isNoisy returns true for commands that are too trivial to track.
func isNoisy(cmd string) bool {
        noise := []string{"ls", "ll", "la", "pwd", "echo", "clear", "exit", "cd", "history", "kern "}
        lower := strings.ToLower(strings.TrimSpace(cmd))
        for _, n := range noise {
                if lower == n || strings.HasPrefix(lower, n) {
                        return true
                }
        }
        return false
}

// inferProject extracts a project name from the cwd path.
func inferProject(cwd string) string {
        if cwd == "" {
                return ""
        }
        // Walk up looking for go.mod, package.json, Cargo.toml, etc.
        markers := []string{"go.mod", "package.json", "Cargo.toml", "pyproject.toml", "setup.py", "composer.json", "Gemfile", ".git"}
        dir := cwd
        for {
                for _, marker := range markers {
                        if _, err := os.Stat(filepath.Join(dir, marker)); err == nil {
                                return filepath.Base(dir)
                        }
                }
                parent := filepath.Dir(dir)
                if parent == dir {
                        break
                }
                dir = parent
        }
        return filepath.Base(cwd)
}

// inferLanguage guesses the primary language from the command.
func inferLanguage(cmd string) string {
        parts := strings.Fields(strings.ToLower(cmd))
        if len(parts) == 0 {
                return ""
        }
        langMap := map[string]string{
                "go":       "Go",
                "python":   "Python",
                "python3":  "Python",
                "node":     "JavaScript",
                "npm":      "JavaScript",
                "yarn":     "JavaScript",
                "pnpm":     "JavaScript",
                "npx":      "JavaScript",
                "deno":     "TypeScript",
                "tsc":      "TypeScript",
                "ts-node":  "TypeScript",
                "rust":     "Rust",
                "cargo":    "Rust",
                "rustc":    "Rust",
                "ruby":     "Ruby",
                "bundle":   "Ruby",
                "rails":    "Ruby",
                "java":     "Java",
                "javac":    "Java",
                "mvn":      "Java",
                "gradle":   "Java",
                "php":      "PHP",
                "composer": "PHP",
                "dotnet":   "C#",
                "swift":    "Swift",
                "kotlin":   "Kotlin",
                "gcc":      "C",
                "g++":      "C++",
                "clang":    "C",
                "clang++":  "C++",
                "cmake":    "C/C++",
        }
        base := filepath.Base(parts[0])
        if lang, ok := langMap[base]; ok {
                return lang
        }
        return ""
}

// formatDuration formats a duration as "1h 23m" or "45m".
func formatDuration(d time.Duration) string {
        h := int(d.Hours())
        m := int(d.Minutes()) % 60
        if h > 0 {
                if m > 0 {
                        return fmt.Sprintf("%dh %dm", h, m)
                }
                return fmt.Sprintf("%dh", h)
        }
        if m > 0 {
                return fmt.Sprintf("%dm", m)
        }
        s := int(d.Seconds())
        return fmt.Sprintf("%ds", s)
}
