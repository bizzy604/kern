package classifier

import (
	"path/filepath"
	"strings"
)

type ActivityType string

const (
	Coding     ActivityType = "CODING"
	Debugging  ActivityType = "DEBUGGING"
	Testing    ActivityType = "TESTING"
	DevOps     ActivityType = "DEVOPS"
	Researching ActivityType = "RESEARCHING"
	Idle       ActivityType = "IDLE"
)

type rule struct {
	prefixes     []string
	contains     []string
	activityType ActivityType
}

var rules = []rule{
	{
		prefixes:     []string{"go test", "npm test", "yarn test", "pnpm test", "pytest", "python -m pytest", "jest", "vitest", "mocha", "rspec", "cargo test", "mix test", "php artisan test", "dotnet test"},
		activityType: Testing,
	},
	{
		prefixes:     []string{"gdb", "lldb", "dlv", "delve", "pdb", "ipdb", "debugpy", "node --inspect", "node inspect"},
		activityType: Debugging,
	},
	{
		prefixes: []string{
			"docker", "docker-compose", "kubectl", "helm", "terraform", "ansible",
			"aws ", "gcloud", "az ", "fly ", "railway", "heroku", "systemctl",
			"nginx", "apache2", "certbot", "k9s", "kind ", "minikube",
			"vagrant", "packer", "pulumi", "cdk ", "serverless",
		},
		activityType: DevOps,
	},
	{
		prefixes: []string{
			"curl", "wget", "http ", "httpie", "man ", "tldr",
			"grep ", "rg ", "ag ", "ripgrep", "find ", "locate",
			"cat ", "less ", "more ", "head ", "tail ", "jq ",
			"dig ", "nslookup", "ping ", "traceroute", "netstat",
		},
		activityType: Researching,
	},
}

// Classify determines the ActivityType for a given shell command.
// confidence is 0.0–1.0.
func Classify(cmd string) (ActivityType, float64) {
	cmd = strings.TrimSpace(cmd)
	if cmd == "" {
		return Idle, 1.0
	}

	lower := strings.ToLower(cmd)

	// Check all rules
	for _, r := range rules {
		for _, prefix := range r.prefixes {
			if strings.HasPrefix(lower, prefix) {
				return r.activityType, 0.92
			}
		}
		for _, sub := range r.contains {
			if strings.Contains(lower, sub) {
				return r.activityType, 0.85
			}
		}
	}

	// Heuristic: if command involves a well-known build/editor tool → CODING
	base := filepath.Base(strings.Fields(cmd)[0])
	codingTools := []string{
		"vim", "nvim", "nano", "emacs", "code", "subl", "atom",
		"git", "gh", "make", "cmake", "cargo", "go", "rustc",
		"tsc", "node", "python", "ruby", "java", "javac",
		"npm", "yarn", "pnpm", "pip", "gem", "bundle",
		"gcc", "g++", "clang", "ld", "ar",
	}
	for _, tool := range codingTools {
		if base == tool {
			return Coding, 0.88
		}
	}

	// Default to coding
	return Coding, 0.72
}

// ClassifyByDuration adds IDLE for very short commands with no substance.
func ClassifyByDuration(cmd string, durationSecs float64) (ActivityType, float64) {
	activity, confidence := Classify(cmd)
	// Very long pauses between commands suggest IDLE
	if durationSecs > 900 {
		return Idle, 0.95
	}
	return activity, confidence
}
