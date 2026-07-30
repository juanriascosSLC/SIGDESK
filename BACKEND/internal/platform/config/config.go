package config

import (
	"os"
	"strings"
)

type Config struct {
	Environment                  string
	Port                         string
	DatabaseURL                  string
	FrontendOrigin               string
	AttachmentsDir               string
	IncidentWebhookCredentialRef string
	// SigtoolsAPIURL points at the company-wide auth service shared with
	// SIGInstallations and SIGInventory (e.g. http://api.sig.systems:8091).
	// When empty, authentication is disabled — allowed for local development
	// only; main refuses to start in production without it.
	SigtoolsAPIURL string
	// BootstrapAdmins are SIGTools usernames that always resolve as SIG-DESK
	// administrators. Without at least one, a fresh install has nobody able to
	// reach role administration and therefore no way to grant the first role.
	BootstrapAdmins []string
}

func Load() Config {
	return Config{
		Environment:                  valueOrDefault("APP_ENV", "development"),
		Port:                         valueOrDefault("PORT", "8080"),
		DatabaseURL:                  os.Getenv("DATABASE_URL"),
		FrontendOrigin:               valueOrDefault("FRONTEND_ORIGIN", "http://localhost:3003"),
		AttachmentsDir:               valueOrDefault("ATTACHMENTS_DIR", "./data/attachments"),
		IncidentWebhookCredentialRef: os.Getenv("INCIDENT_WEBHOOK_CREDENTIAL_REF"),
		SigtoolsAPIURL:               strings.TrimSuffix(os.Getenv("SIGTOOLS_API_URL"), "/"),
		BootstrapAdmins:              splitList(os.Getenv("SIGDESK_BOOTSTRAP_ADMINS")),
	}
}

func splitList(value string) []string {
	items := make([]string, 0)
	for _, item := range strings.Split(value, ",") {
		if trimmed := strings.TrimSpace(item); trimmed != "" {
			items = append(items, trimmed)
		}
	}
	return items
}

// AuthEnabled reports whether requests are authenticated against SIGTools.
func (config Config) AuthEnabled() bool {
	return config.SigtoolsAPIURL != ""
}

// IsProduction gates the refusal to run without an auth authority.
func (config Config) IsProduction() bool {
	return strings.EqualFold(config.Environment, "production")
}

func valueOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
