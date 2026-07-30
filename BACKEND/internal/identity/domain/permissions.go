package domain

// SIG-DESK's permission keys, following the shared registry's
// "<module>.<resource>.<action>" convention (the same shape as
// installations.projects.create and inventory.view in the other two apps).
//
// These strings are the contract with the shared platform: each one must
// exist as a row in the SIGTools permissions table with app = "sigdesk"
// before it can be granted to a role. Until a key is seeded there, no role
// can hold it, so admins (who bypass every check) are the only ones able to
// operate — which is the safe direction to fail.
const (
	PermTicketsView    = "sigdesk.tickets.view"
	PermTicketsCreate  = "sigdesk.tickets.create"
	PermTicketsEdit    = "sigdesk.tickets.edit"
	PermTicketsAssign  = "sigdesk.tickets.assign"
	PermTicketsResolve = "sigdesk.tickets.resolve"
	PermTicketsMerge   = "sigdesk.tickets.merge"
	PermTicketsComment = "sigdesk.tickets.comment"
	PermTicketsAttach  = "sigdesk.tickets.attach"

	PermCatalogView    = "sigdesk.catalog.view"
	PermCatalogAuthor  = "sigdesk.catalog.author"
	PermCatalogPublish = "sigdesk.catalog.publish"

	PermSLAView   = "sigdesk.sla.view"
	PermSLAManage = "sigdesk.sla.manage"

	// Grants access to SIG-DESK's own role administration. Not a SIGTools
	// permission: users are provisioned there, but what they may do *here* is
	// governed by this app's own roles.
	PermAdminRoles = "sigdesk.admin.roles"

	PermChangesView      = "sigdesk.changes.view"
	PermChangesCreate    = "sigdesk.changes.create"
	PermChangesEdit      = "sigdesk.changes.edit"
	PermChangesApprove   = "sigdesk.changes.approve"
	PermChangesImplement = "sigdesk.changes.implement"

	PermProblemsView    = "sigdesk.problems.view"
	PermProblemsCreate  = "sigdesk.problems.create"
	PermProblemsEdit    = "sigdesk.problems.edit"
	PermProblemsResolve = "sigdesk.problems.resolve"
)

// CatalogEntry describes a permission for the admin UI, which reads this list
// to know what SIG-DESK expects to exist in the shared registry.
type CatalogEntry struct {
	Key      string `json:"key"`
	Label    string `json:"label"`
	Category string `json:"category"`
	App      string `json:"app"`
}

// PermissionCatalog is the full set SIG-DESK defines. Exposed over HTTP so the
// roles screen can show which keys are missing from the shared registry
// instead of silently offering nothing to assign.
func PermissionCatalog() []CatalogEntry {
	return []CatalogEntry{
		{Key: PermTicketsView, Label: "Ver tickets", Category: "Tickets", App: "sigdesk"},
		{Key: PermTicketsCreate, Label: "Crear tickets", Category: "Tickets", App: "sigdesk"},
		{Key: PermTicketsEdit, Label: "Editar tickets", Category: "Tickets", App: "sigdesk"},
		{Key: PermTicketsAssign, Label: "Asignar tickets", Category: "Tickets", App: "sigdesk"},
		{Key: PermTicketsResolve, Label: "Resolver y cambiar estado", Category: "Tickets", App: "sigdesk"},
		{Key: PermTicketsMerge, Label: "Fusionar tickets", Category: "Tickets", App: "sigdesk"},
		{Key: PermTicketsComment, Label: "Comentar tickets", Category: "Tickets", App: "sigdesk"},
		{Key: PermTicketsAttach, Label: "Adjuntar archivos", Category: "Tickets", App: "sigdesk"},
		{Key: PermCatalogView, Label: "Ver catálogo de servicios", Category: "Catálogo", App: "sigdesk"},
		{Key: PermCatalogAuthor, Label: "Editar definiciones del catálogo", Category: "Catálogo", App: "sigdesk"},
		{Key: PermCatalogPublish, Label: "Publicar definiciones", Category: "Catálogo", App: "sigdesk"},
		{Key: PermSLAView, Label: "Ver políticas de SLA", Category: "SLA", App: "sigdesk"},
		{Key: PermSLAManage, Label: "Gestionar políticas de SLA", Category: "SLA", App: "sigdesk"},
		{Key: PermChangesView, Label: "Ver solicitudes de cambio", Category: "Change Management", App: "sigdesk"},
		{Key: PermChangesCreate, Label: "Crear solicitudes de cambio", Category: "Change Management", App: "sigdesk"},
		{Key: PermChangesEdit, Label: "Evaluar y programar cambios", Category: "Change Management", App: "sigdesk"},
		{Key: PermChangesApprove, Label: "Aprobar o rechazar cambios", Category: "Change Management", App: "sigdesk"},
		{Key: PermChangesImplement, Label: "Implementar y cerrar cambios", Category: "Change Management", App: "sigdesk"},
		{Key: PermProblemsView, Label: "Ver problemas", Category: "Problem Management", App: "sigdesk"},
		{Key: PermProblemsCreate, Label: "Crear problemas", Category: "Problem Management", App: "sigdesk"},
		{Key: PermProblemsEdit, Label: "Investigar problemas y gestionar relaciones", Category: "Problem Management", App: "sigdesk"},
		{Key: PermProblemsResolve, Label: "Resolver y reabrir problemas", Category: "Problem Management", App: "sigdesk"},
		{Key: PermAdminRoles, Label: "Gestionar roles y permisos", Category: "Administración", App: "sigdesk"},
	}
}
