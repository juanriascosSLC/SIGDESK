package buildinfo

import "time"

// Default local build values (MUST NOT look like an official release)
var (
	Version   = "dev"
	Commit    = "unknown"
	BuildTime = "unknown"
)

type Info struct {
	Version   string `json:"version"`
	Commit    string `json:"commit"`
	BuildTime string `json:"buildTime"`
}

func Get() Info {
	return Info{
		Version:   Version,
		Commit:    Commit,
		BuildTime: BuildTime,
	}
}

// IsRFC3339 reports whether s parses strictly as RFC3339 UTC.
func IsRFC3339(s string) bool {
	t, err := time.Parse(time.RFC3339, s)
	return err == nil && t.Location() == time.UTC
}
