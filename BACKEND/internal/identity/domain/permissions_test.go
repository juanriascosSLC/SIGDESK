package domain

import "testing"

// TestCatalogAuthorAndPublishPermissionsAreRegistered proves the two
// permission keys the layout-versioning feature depends on
// (LayoutService.CreateDraft/UpdateDraft gate on PermCatalogAuthor,
// PublishDraft/ActivateVersion gate on PermCatalogPublish) are actually
// present in the catalog exposed to the roles admin UI — not just defined as
// Go constants nobody ever surfaces. A key missing here means SIGTools would
// never learn to seed it, and no non-admin role could ever be granted it.
func TestCatalogAuthorAndPublishPermissionsAreRegistered(t *testing.T) {
	keys := make(map[string]CatalogEntry)
	for _, entry := range PermissionCatalog() {
		keys[entry.Key] = entry
	}

	for _, want := range []string{PermCatalogAuthor, PermCatalogPublish} {
		entry, ok := keys[want]
		if !ok {
			t.Fatalf("PermissionCatalog() is missing %q", want)
		}
		if entry.App != "sigdesk" {
			t.Errorf("%q has app %q, want \"sigdesk\"", want, entry.App)
		}
		if entry.Label == "" {
			t.Errorf("%q has no label", want)
		}
	}
}
