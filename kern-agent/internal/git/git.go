package git

import (
	"fmt"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

// CommitInfo holds metadata extracted from a git commit.
type CommitInfo struct {
	Hash         string
	ShortHash    string
	Branch       string
	Message      string
	Author       string
	FilesChanged int
	Insertions   int
	Deletions    int
}

// triggerCommands are git subcommands that create a new commit or push one.
var triggerCommands = map[string]bool{
	"commit": true,
	"merge":  true,
	"rebase": true, // interactive rebases can create commits
	"cherry-pick": true,
	"revert": true,
	"tag":    true,
}

// IsCommitTrigger returns true if the command will likely produce a new commit.
func IsCommitTrigger(cmd string) bool {
	parts := strings.Fields(strings.TrimSpace(cmd))
	if len(parts) < 2 {
		return false
	}
	// Must start with "git"
	if filepath.Base(parts[0]) != "git" {
		return false
	}
	// Find the subcommand (skip flags)
	for _, p := range parts[1:] {
		if !strings.HasPrefix(p, "-") {
			return triggerCommands[p]
		}
	}
	return false
}

// IsGitCommand returns true if the command is any git command.
func IsGitCommand(cmd string) bool {
	parts := strings.Fields(strings.TrimSpace(cmd))
	if len(parts) == 0 {
		return false
	}
	return filepath.Base(parts[0]) == "git"
}

// IsPushCommand returns true if this is a git push.
func IsPushCommand(cmd string) bool {
	parts := strings.Fields(strings.TrimSpace(cmd))
	if len(parts) < 2 {
		return false
	}
	if filepath.Base(parts[0]) != "git" {
		return false
	}
	for _, p := range parts[1:] {
		if !strings.HasPrefix(p, "-") {
			return p == "push"
		}
	}
	return false
}

// ExtractLatestCommit reads metadata for the most recent commit in cwd.
// Returns nil if the directory is not a git repo or no commits exist.
func ExtractLatestCommit(cwd string) (*CommitInfo, error) {
	// Check if it's a git repo
	checkCmd := exec.Command("git", "-C", cwd, "rev-parse", "--git-dir")
	if err := checkCmd.Run(); err != nil {
		return nil, nil // not a git repo, silently skip
	}

	// Get commit metadata: hash, short hash, author, message
	logOut, err := runGit(cwd, "log", "-1",
		"--format=%H%x00%h%x00%an%x00%s")
	if err != nil || strings.TrimSpace(logOut) == "" {
		return nil, nil
	}

	parts := strings.SplitN(strings.TrimSpace(logOut), "\x00", 4)
	if len(parts) < 4 {
		return nil, nil
	}

	info := &CommitInfo{
		Hash:      parts[0],
		ShortHash: parts[1],
		Author:    parts[2],
		Message:   parts[3],
	}

	// Get current branch
	branch, err := runGit(cwd, "rev-parse", "--abbrev-ref", "HEAD")
	if err == nil {
		info.Branch = strings.TrimSpace(branch)
	}

	// Get diff stats vs parent (files changed, insertions, deletions)
	statOut, err := runGit(cwd, "diff", "--shortstat", "HEAD~1", "HEAD")
	if err == nil && strings.TrimSpace(statOut) != "" {
		parseShortStat(strings.TrimSpace(statOut), info)
	} else {
		// First commit — diff against empty tree
		statOut, err = runGit(cwd, "diff", "--shortstat",
			"4b825dc642cb6eb9a060e54bf8d69288fbee4904", "HEAD")
		if err == nil {
			parseShortStat(strings.TrimSpace(statOut), info)
		}
	}

	return info, nil
}

// CurrentBranch returns the current git branch for a directory.
func CurrentBranch(cwd string) string {
	out, err := runGit(cwd, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return ""
	}
	return strings.TrimSpace(out)
}

func runGit(cwd string, args ...string) (string, error) {
	fullArgs := append([]string{"-C", cwd}, args...)
	out, err := exec.Command("git", fullArgs...).Output()
	if err != nil {
		return "", fmt.Errorf("git %v: %w", args, err)
	}
	return string(out), nil
}

// parseShortStat parses output like:
//   3 files changed, 42 insertions(+), 7 deletions(-)
func parseShortStat(s string, info *CommitInfo) {
	for _, part := range strings.Split(s, ",") {
		part = strings.TrimSpace(part)
		fields := strings.Fields(part)
		if len(fields) < 2 {
			continue
		}
		n, _ := strconv.Atoi(fields[0])
		switch {
		case strings.Contains(part, "file"):
			info.FilesChanged = n
		case strings.Contains(part, "insertion"):
			info.Insertions = n
		case strings.Contains(part, "deletion"):
			info.Deletions = n
		}
	}
}
