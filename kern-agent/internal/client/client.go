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

type SyncPayload struct {
	Sessions []Session `json:"sessions"`
}

type SyncResult struct {
	Accepted int `json:"accepted"`
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

// Sync sends the given sessions to the KERN API.
func (c *Client) Sync(sessions []Session) (*SyncResult, error) {
	payload := SyncPayload{Sessions: sessions}
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
