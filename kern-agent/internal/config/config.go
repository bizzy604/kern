package config

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type Config struct {
	APIEndpoint string `json:"api_endpoint"`
	APIKey      string `json:"api_key"`
	DeveloperID int    `json:"developer_id"`
	SyncEvery   int    `json:"sync_every_seconds"` // default 300
}

func DefaultConfig() *Config {
	return &Config{
		APIEndpoint: "https://kern.dev/api",
		SyncEvery:   300,
	}
}

func Dir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ".kern"
	}
	return filepath.Join(home, ".kern")
}

func Path() string {
	return filepath.Join(Dir(), "config.json")
}

func DBPath() string {
	return filepath.Join(Dir(), "events.db")
}

func Load() (*Config, error) {
	cfg := DefaultConfig()
	data, err := os.ReadFile(Path())
	if err != nil {
		if os.IsNotExist(err) {
			return cfg, nil
		}
		return nil, err
	}
	if err := json.Unmarshal(data, cfg); err != nil {
		return nil, err
	}
	return cfg, nil
}

func (c *Config) Save() error {
	if err := os.MkdirAll(Dir(), 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(Path(), data, 0600)
}
