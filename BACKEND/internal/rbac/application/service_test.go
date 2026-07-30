package application

import (
	"context"
	"errors"
	"testing"

	identityDomain "sig-desk/backend/internal/identity/domain"
	"sig-desk/backend/internal/rbac/adapters/memory"
	"sig-desk/backend/internal/rbac/domain"
)

func newService(t *testing.T, bootstrapAdmins ...string) (*Service, *memory.Repository) {
	t.Helper()
	repository := memory.NewRepository()
	return NewService(repository, bootstrapAdmins), repository
}

func roleNamed(t *testing.T, service *Service, name string) domain.Role {
	t.Helper()
	roles, err := service.ListRoles(context.Background())
	if err != nil {
		t.Fatalf("ListRoles: %v", err)
	}
	for _, role := range roles {
		if role.Name == name {
			return role
		}
	}
	t.Fatalf("role %q was not seeded; got %d roles", name, len(roles))
	return domain.Role{}
}

// The whole point of this module: whatever roles and permissions the shared
// company auth service reports for its OTHER apps must not grant anything here.
func TestAuthorizationIgnoresWhatTheSharedPlatformReports(t *testing.T) {
	service, _ := newService(t)
	ctx := context.Background()

	// An identity carrying SIGInstallations/SIGInventory roles and permissions,
	// as SIGTools would actually return them.
	identity := identityDomain.Identity{
		Username:    "lkim",
		Name:        "Laura Kim",
		Roles:       []string{"inventory_op", "field_tech", "designer"},
		Permissions: []string{"inventory.view", "installations.projects.create"},
	}

	roles, permissions, err := service.AuthorizeUser(ctx, identity)
	if err != nil {
		t.Fatalf("AuthorizeUser: %v", err)
	}
	if len(roles) != 0 || len(permissions) != 0 {
		t.Fatalf(
			"a user with no SIG-DESK roles must get nothing; got roles=%v permissions=%v",
			roles, permissions,
		)
	}

	// Now grant a SIG-DESK role and confirm the permissions come from here.
	agent := roleNamed(t, service, "agent")
	if err := service.SetUserRoles(ctx, "lkim", []string{agent.ID}, nil); err != nil {
		t.Fatalf("SetUserRoles: %v", err)
	}

	roles, permissions, err = service.AuthorizeUser(ctx, identity)
	if err != nil {
		t.Fatalf("AuthorizeUser after grant: %v", err)
	}
	if len(roles) != 1 || roles[0] != "agent" {
		t.Fatalf("roles = %v, want [agent] from SIG-DESK's own database", roles)
	}

	granted := make(map[string]bool, len(permissions))
	for _, permission := range permissions {
		granted[permission] = true
	}
	if !granted[identityDomain.PermTicketsView] {
		t.Error("agent should hold sigdesk.tickets.view")
	}
	// Permissions belonging to the other apps must never appear.
	for _, foreign := range []string{"inventory.view", "installations.projects.create"} {
		if granted[foreign] {
			t.Errorf("permission %q from another app leaked into SIG-DESK", foreign)
		}
	}
	// Nor should a SIG-DESK permission the agent role does not include.
	if granted[identityDomain.PermAdminRoles] {
		t.Error("agent must not hold role administration")
	}
}

func TestBootstrapAdminOpensTheDoorWithoutDatabaseRows(t *testing.T) {
	service, _ := newService(t, "jriascos")
	ctx := context.Background()

	roles, _, err := service.AuthorizeUser(ctx, identityDomain.Identity{Username: "JRiascos"})
	if err != nil {
		t.Fatalf("AuthorizeUser: %v", err)
	}
	// Matching is case-insensitive: SIGTools may report a different casing than
	// whatever an operator typed into the env var.
	if !(domain.Grants{Roles: roles}).IsAdmin() {
		t.Fatalf("roles = %v, want the bootstrap admin to be admin", roles)
	}
	if !service.HasBootstrapAdmins() {
		t.Error("HasBootstrapAdmins should report true so main does not warn")
	}

	// Everyone else is unaffected.
	otherRoles, _, err := service.AuthorizeUser(ctx, identityDomain.Identity{Username: "someone"})
	if err != nil {
		t.Fatalf("AuthorizeUser other: %v", err)
	}
	if len(otherRoles) != 0 {
		t.Fatalf("roles = %v, want none for a non-bootstrap user", otherRoles)
	}
}

func TestUnknownPermissionKeyIsRejected(t *testing.T) {
	service, _ := newService(t)
	ctx := context.Background()
	agent := roleNamed(t, service, "agent")

	// A typo stored as a grant would look granted in the UI while never
	// matching anything the routes check, so it has to fail loudly.
	_, err := service.SetRolePermissions(ctx, agent.ID, []string{"sigdesk.tickets.viwe"})
	if !errors.Is(err, domain.ErrUnknownPermission) {
		t.Fatalf("err = %v, want ErrUnknownPermission", err)
	}

	// Permissions belonging to another application are equally invalid here.
	_, err = service.SetRolePermissions(ctx, agent.ID, []string{"inventory.view"})
	if !errors.Is(err, domain.ErrUnknownPermission) {
		t.Fatalf("err = %v, want ErrUnknownPermission for another app's key", err)
	}

	// And the valid case still works, replacing the whole set.
	role, err := service.SetRolePermissions(ctx, agent.ID, []string{
		identityDomain.PermTicketsView, identityDomain.PermTicketsComment,
	})
	if err != nil {
		t.Fatalf("SetRolePermissions: %v", err)
	}
	if len(role.Permissions) != 2 {
		t.Fatalf("permissions = %v, want exactly the two keys sent", role.Permissions)
	}
}

func TestSystemRoleCannotBeRenamedOrDeleted(t *testing.T) {
	service, _ := newService(t)
	ctx := context.Background()
	admin := roleNamed(t, service, domain.AdminRoleName)

	if err := service.DeleteRole(ctx, admin.ID); !errors.Is(err, domain.ErrSystemRoleLocked) {
		t.Fatalf("delete err = %v, want ErrSystemRoleLocked", err)
	}

	// The label is presentation and stays editable; the name is what the code
	// reasons about, so it is pinned.
	updated, err := service.UpdateRole(ctx, admin.ID, domain.NewRole{
		Name: "superuser", Label: "Súper Admin",
	})
	if err != nil {
		t.Fatalf("UpdateRole: %v", err)
	}
	if updated.Name != domain.AdminRoleName {
		t.Errorf("name = %q, want it pinned to %q", updated.Name, domain.AdminRoleName)
	}
	if updated.Label != "Súper Admin" {
		t.Errorf("label = %q, want the new label applied", updated.Label)
	}
}

func TestCreateRoleValidatesNameAndRejectsDuplicates(t *testing.T) {
	service, _ := newService(t)
	ctx := context.Background()

	for _, invalid := range []string{"", "Agent", "with space", "a", "tiene-guion"} {
		if _, err := service.CreateRole(ctx, domain.NewRole{Name: invalid, Label: "X"}, nil); err == nil {
			t.Errorf("name %q should have been rejected", invalid)
		}
	}

	if _, err := service.CreateRole(ctx, domain.NewRole{Name: "approver", Label: ""}, nil); !errors.Is(err, domain.ErrInvalidRoleLabel) {
		t.Errorf("err = %v, want ErrInvalidRoleLabel", err)
	}

	created, err := service.CreateRole(ctx, domain.NewRole{
		Name: "approver", Label: "Aprobador",
	}, []string{identityDomain.PermChangesApprove})
	if err != nil {
		t.Fatalf("CreateRole: %v", err)
	}
	if created.IsSystem {
		t.Error("a role created through the API must not be a system role")
	}

	if _, err := service.CreateRole(ctx, domain.NewRole{Name: "approver", Label: "Otro"}, nil); !errors.Is(err, domain.ErrRoleNameTaken) {
		t.Errorf("err = %v, want ErrRoleNameTaken", err)
	}
}

func TestPermissionsAreTheUnionOfSeveralRoles(t *testing.T) {
	service, _ := newService(t)
	ctx := context.Background()
	agent := roleNamed(t, service, "agent")

	approver, err := service.CreateRole(ctx, domain.NewRole{
		Name: "approver", Label: "Aprobador",
	}, []string{identityDomain.PermChangesApprove})
	if err != nil {
		t.Fatalf("CreateRole: %v", err)
	}
	if err := service.SetUserRoles(ctx, "mross", []string{agent.ID, approver.ID}, nil); err != nil {
		t.Fatalf("SetUserRoles: %v", err)
	}

	_, permissions, err := service.AuthorizeUser(ctx, identityDomain.Identity{Username: "mross"})
	if err != nil {
		t.Fatalf("AuthorizeUser: %v", err)
	}
	granted := make(map[string]bool, len(permissions))
	for _, permission := range permissions {
		granted[permission] = true
	}
	if !granted[identityDomain.PermTicketsView] || !granted[identityDomain.PermChangesApprove] {
		t.Fatalf("permissions = %v, want the union of both roles", permissions)
	}
}

func TestSetUserRolesRejectsUnknownRole(t *testing.T) {
	service, _ := newService(t)
	if err := service.SetUserRoles(
		context.Background(), "someone", []string{"00000000-0000-0000-0000-000000000000"}, nil,
	); !errors.Is(err, domain.ErrRoleNotFound) {
		t.Fatalf("err = %v, want ErrRoleNotFound", err)
	}
}

// Someone who signs in must become visible to administrators even with no
// roles, otherwise there is no way to find them and grant one.
func TestSignedInUsersBecomeAssignable(t *testing.T) {
	service, _ := newService(t)
	ctx := context.Background()

	if _, _, err := service.AuthorizeUser(ctx, identityDomain.Identity{
		Username: "echen", Name: "Emily Chen", Email: "echen@sig.com",
	}); err != nil {
		t.Fatalf("AuthorizeUser: %v", err)
	}

	users, err := service.ListKnownUsers(ctx)
	if err != nil {
		t.Fatalf("ListKnownUsers: %v", err)
	}
	for _, user := range users {
		if user.Username == "echen" {
			if user.DisplayName != "Emily Chen" || user.Email != "echen@sig.com" {
				t.Errorf("profile not recorded: %#v", user)
			}
			return
		}
	}
	t.Fatalf("a user who signed in should be listed; got %#v", users)
}
