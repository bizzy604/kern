package client

import (
        "bytes"
        "compress/gzip"
        "encoding/json"
        "fmt"
        "net/http"
        "time"

        "github.com/kern-dev/kern-agent/internal/db"
)

// Session is the payload sent to the KERN ingest API.
type Session struct {
        ActivityType string  `json:"activityType"`
        InferredTask string  `json:"inferredTask"`
        Project      string  `json:"project"`
        Language     string  `json:"language"`
        DurationMins int     `json:"durationMinutes"`
        CommandCount int     `json:"commandCount"`
        StartedAt    string  `json:"startedAt"`
        EndedAt      string  `json:"endedAt"`
        Confidence   float64 `json:"confidence"`
}

// GitCommitPayload is a single git commit sent to the API.
type GitCommitPayload struct {
        Hash         string `json:"hash"`
        ShortHash    string `json:"shortHash"`
        Branch       string `json:"branch"`
        Message      string `json:"message"`
        Author       string `json:"author"`
        FilesChanged int    `json:"filesChanged"`
        Insertions   int    `json:"insertions"`
        Deletions    int    `json:"deletions"`
        Project      string `json:"project"`
        CommittedAt  string `json:"committedAt"`
}

type SyncPayload struct {
        Sessions   []Session          `json:"sessions"`
        GitCommits []GitCommitPayload `json:"gitCommits,omitempty"`
}

type SyncResult struct {
        Accepted    int `json:"accepted"`
        GitAccepted int `json:"gitAccepted"`
}

type Client struct {
        endpoint   string
        apiKey     string
        httpClient *http.Client
}

func New(endpoint, apiKey string) *Client {
        return &Client{
                endpoint: endpoint,
                apiKey:   apiKey,
                httpClient: &http.Client{
                        Timeout: 30 * time.Second,
                },
        }
}

// GroupIntoSessions converts raw DB events into sessions by merging consecutive
// events of the same activity type within a 5-minute gap window.
func GroupIntoSessions(events []*db.Event) []Session {
        if len(events) == 0 {
                return nil
        }

        const gapThreshold = 5 * time.Minute

        var sessions []Session
        cur := events[0]
        curEnd := cur.EndTime
        cmdCount := 1

        flush := func(end time.Time) {
                durationSecs := end.Sub(cur.StartTime).Seconds()
                if durationSecs < 5 {
                        return // skip noise
                }
                sessions = append(sessions, Session{
                        ActivityType: cur.ActivityType,
                        InferredTask: inferTask(cur.Command, cur.ActivityType),
                        Project:      cur.Project,
                        Language:     cur.Language,
                        DurationMins: int(durationSecs / 60),
                        CommandCount: cmdCount,
                        StartedAt:    cur.StartTime.UTC().Format(time.RFC3339),
                        EndedAt:      end.UTC().Format(time.RFC3339),
                        Confidence:   cur.Confidence,
                })
        }

        for i := 1; i < len(events); i++ {
                e := events[i]
                gap := e.StartTime.Sub(curEnd)
                if e.ActivityType == cur.ActivityType && gap < gapThreshold {
                        // Extend current session
                        curEnd = e.EndTime
                        cmdCount++
                } else {
                        flush(curEnd)
                        cur = e
                        curEnd = e.EndTime
                        cmdCount = 1
                }
        }
        flush(curEnd)
        return sessions
}

// inferTask produces a human-readable task description from the command + activity type.
func inferTask(cmd, activityType string) string {
        if len(cmd) > 120 {
                cmd = cmd[:120] + "..."
        }
        switch activityType {
        case "TESTING":
                return "Running tests: " + cmd
        case "DEBUGGING":
                return "Debugging with " + cmd
        case "DEVOPS":
                return "DevOps operation: " + cmd
        case "RESEARCHING":
                return "Researching: " + cmd
        default:
                return cmd
        }
}

// BuildGitPayload converts db.GitEvent slice into API payloads.
func BuildGitPayload(events []*db.GitEvent) []GitCommitPayload {
        var commits []GitCommitPayload
        for _, g := range events {
                commits = append(commits, GitCommitPayload{
                        Hash:         g.Hash,
                        ShortHash:    g.ShortHash,
                        Branch:       g.Branch,
                        Message:      g.Message,
                        Author:       g.Author,
                        FilesChanged: g.FilesChanged,
                        Insertions:   g.Insertions,
                        Deletions:    g.Deletions,
                        Project:      g.Project,
                        CommittedAt:  g.CreatedAt.UTC().Format(time.RFC3339),
                })
        }
        return commits
}

// Sync sends the given sessions (and optional git commits) to the KERN API.
func (c *Client) Sync(sessions []Session, gitCommits []GitCommitPayload) (*SyncResult, error) {
        payload := SyncPayload{Sessions: sessions, GitCommits: gitCommits}
        body, err := json.Marshal(payload)
        if err != nil {
                return nil, err
        }

        // Gzip compress
        var buf bytes.Buffer
        gz := gzip.NewWriter(&buf)
        if _, err := gz.Write(body); err != nil {
                return nil, err
        }
        gz.Close()

        req, err := http.NewRequest("POST", c.endpoint+"/sessions/ingest", &buf)
        if err != nil {
                return nil, err
        }
        req.Header.Set("Content-Type", "application/json")
        req.Header.Set("Content-Encoding", "gzip")
        req.Header.Set("X-Kern-Agent", "kern-agent/1.0")
        if c.apiKey != "" {
                req.Header.Set("Authorization", "Bearer "+c.apiKey)
        }

        resp, err := c.httpClient.Do(req)
        if err != nil {
                return nil, fmt.Errorf("request failed: %w", err)
        }
        defer resp.Body.Close()

        if resp.StatusCode >= 400 {
                return nil, fmt.Errorf("server returned %d", resp.StatusCode)
        }

        var result SyncResult
        if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
                // Non-fatal — server might not return a body
                result.Accepted = len(sessions)
        }
        return &result, nil
}

// RegisterRequest is the payload for creating a new developer account.
type RegisterRequest struct {
        Name         string `json:"name"`
        Email        string `json:"email"`
        GithubHandle string `json:"githubHandle,omitempty"`
        Timezone     string `json:"timezone,omitempty"`
        TeamCode     string `json:"teamCode,omitempty"`
}

// RegisterResult is the response from the register endpoint.
type RegisterResult struct {
        ID           int    `json:"id"`
        Name         string `json:"name"`
        Email        string `json:"email"`
        GithubHandle string `json:"githubHandle"`
        Role         string `json:"role"`
        Timezone     string `json:"timezone"`
        APIKey       string `json:"apiKey"`
        TeamName     string `json:"teamName"`
}

// Register creates a new developer account and returns the API key.
func (c *Client) Register(req RegisterRequest) (*RegisterResult, error) {
        body, err := json.Marshal(req)
        if err != nil {
                return nil, err
        }

        httpReq, err := http.NewRequest("POST", c.endpoint+"/developers/register", bytes.NewReader(body))
        if err != nil {
                return nil, err
        }
        httpReq.Header.Set("Content-Type", "application/json")

        resp, err := c.httpClient.Do(httpReq)
        if err != nil {
                return nil, fmt.Errorf("request failed: %w", err)
        }
        defer resp.Body.Close()

        if resp.StatusCode == 409 {
                return nil, fmt.Errorf("email already registered — run `kern config --endpoint %s --key <your-key>` to log in", c.endpoint)
        }
        if resp.StatusCode >= 400 {
                return nil, fmt.Errorf("server returned %d", resp.StatusCode)
        }

        var result RegisterResult
        if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
                return nil, fmt.Errorf("could not parse response: %w", err)
        }
        return &result, nil
}

// Ping checks if the KERN API is reachable.
func (c *Client) Ping() error {
        req, err := http.NewRequest("GET", c.endpoint+"/healthz", nil)
        if err != nil {
                return err
        }
        resp, err := c.httpClient.Do(req)
        if err != nil {
                return fmt.Errorf("cannot reach KERN API: %w", err)
        }
        defer resp.Body.Close()
        if resp.StatusCode >= 500 {
                return fmt.Errorf("KERN API returned %d", resp.StatusCode)
        }
        return nil
}
