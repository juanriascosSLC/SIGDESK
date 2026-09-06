import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './features/auth/AuthProvider';
import { useAuth } from './features/auth/useAuth';
import { PERMISSIONS } from './features/auth/permissions';
import { CatalogBuilderErrorBoundary } from './features/admin/catalog-builder/CatalogBuilderErrorBoundary';

// Layouts
import AgentLayout from './layouts/AgentLayout';
import EndUserLayout from './layouts/EndUserLayout';

// Route-level code splitting: opening Tickets must not download Catalog
// Builder, Assets, Reports and every administration screen up front.
const Login = React.lazy(() => import('./features/auth/Login'));
const ForgotPassword = React.lazy(() => import('./features/auth/ForgotPassword'));
const TicketsKanban = React.lazy(() => import('./features/tickets/TicketsKanban'));
const TicketDetail = React.lazy(() => import('./features/tickets/TicketDetail'));
const TicketsList = React.lazy(() => import('./features/tickets/TicketsList'));
const CatalogForm = React.lazy(() => import('./features/catalog/CatalogForm'));
const ApiKeys = React.lazy(() => import('./features/settings/ApiKeys'));
const ChatOps = React.lazy(() => import('./features/settings/ChatOps'));
const ChangeBoard = React.lazy(() => import('./features/changes/ChangeBoard'));
const ChangeDetail = React.lazy(() => import('./features/changes/ChangeDetail'));
const MyChangeTasks = React.lazy(() => import('./features/changes/MyChangeTasks'));
const AutomationsList = React.lazy(() => import('./features/automations/AutomationsList'));
const WorkflowBuilder = React.lazy(() => import('./features/automations/WorkflowBuilder'));
const ServicesDashboard = React.lazy(() => import('./features/services/ServicesDashboard'));
const DealershipView = React.lazy(() => import('./features/services/DealershipView'));
const SrvDetail = React.lazy(() => import('./features/services/SrvDetail'));
const KnowledgeBase = React.lazy(() => import('./features/knowledge/KnowledgeBase'));
const ArticleDetail = React.lazy(() => import('./features/knowledge/ArticleDetail'));
const SlaPolicies = React.lazy(() => import('./features/settings/SlaPolicies'));
const Reports = React.lazy(() => import('./features/reports/Reports'));
const ProblemsList = React.lazy(() => import('./features/problems/ProblemsList'));
const ProblemDetail = React.lazy(() => import('./features/problems/ProblemDetail'));
const AssetsCMDB = React.lazy(() => import('./features/assets/AssetsCMDB'));
const EndUserDashboard = React.lazy(() => import('./features/endUser/EndUserDashboard'));
const MyTickets = React.lazy(() => import('./features/endUser/MyTickets'));
const UsersManager = React.lazy(() => import('./features/admin/UsersManager'));
const CatalogBuilder = React.lazy(() => import('./features/admin/CatalogBuilder'));
const Dashboard = React.lazy(() =>
  import('./features/dashboard/Dashboard').then((module) => ({ default: module.Dashboard })),
);
const ServiceCatalog = React.lazy(() =>
  import('./features/catalog/ServiceCatalog').then((module) => ({ default: module.ServiceCatalog })),
);

function FullScreenLoader() {
  return (
    <div className="min-h-screen bg-surface-container-lowest flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-full border-2 border-cyan-500/30 border-t-cyan-400 animate-spin" />
        <p className="text-xs font-mono uppercase tracking-[0.3em] text-cyan-500/70">
          Verifying session
        </p>
      </div>
    </div>
  );
}

/**
 * Route guard. Access is decided by permissions granted on the shared SIGTools
 * platform, not by a role string invented here — the company registry has its
 * own role names and SIG-DESK should not duplicate them.
 */
function ProtectedRoute({
  children,
  requiredPermission,
  requiredAnyPermissions,
  requireCondition,
  orCondition,
  fallbackTo,
}: {
  children: React.ReactNode;
  requiredPermission?: string;
  requiredAnyPermissions?: string[];
  /**
   * Extra gate independent of `can()` — for capabilities computed straight
   * from real organization_service permissions (entity:action:scope) rather
   * than the dotted SIGTools-registry keys `can()` checks. Required in
   * addition to any permission above, unless `orCondition` is set.
   */
  requireCondition?: boolean;
  /**
   * Lets the route through even if the permission checks above fail — used
   * to admit SIG-DESK admins (real roles/usuarios permissions) into the
   * /app shell without granting them the ticket-specific permissions
   * checked by the nested routes inside it.
   */
  orCondition?: boolean;
  fallbackTo?: string;
}) {
  const { isAuthenticated, isLoading, can } = useAuth();
  const location = useLocation();

  // Without this, a page refresh bounces to /login before GET /me/ has had a
  // chance to restore the still-valid cookie session.
  if (isLoading) return <FullScreenLoader />;

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const permissionOk =
    (!requiredPermission || can(requiredPermission)) &&
    (!requiredAnyPermissions?.length || requiredAnyPermissions.some((permission) => can(permission))) &&
    (requireCondition === undefined || requireCondition);

  if (!permissionOk && !orCondition) {
    return <Navigate to={fallbackTo ?? '/portal'} replace />;
  }

  return <>{children}</>;
}

/**
 * Sends each user to the surface they can actually use: the staff workspace if
 * they may work tickets, otherwise the self-service portal.
 */
function LandingRedirect() {
  const { isAuthenticated, isLoading, can, canManageUsersAndRoles, canViewTickets } =
    useAuth();
  if (isLoading) return <FullScreenLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  // An admin keeps landing on the workspace shell, where the Administration
  // nav lives. Someone whose real grant is only over tickets lands straight
  // on their pool instead of /app: the Dashboard there is not their working
  // surface, "Tickets & Issues" is.
  if (canManageUsersAndRoles) return <Navigate to="/app" replace />;
  if (canViewTickets) return <Navigate to="/app/tickets" replace />;
  if (can(PERMISSIONS.changesView)) return <Navigate to="/app/changes" replace />;
  // Su superficie de trabajo es su propia bandeja de tareas, no el tablero
  // de RFC — que ademas no puede leer.
  if (can(PERMISSIONS.changeTasksView)) return <Navigate to="/app/changes/my-tasks" replace />;
  return <Navigate to="/portal" replace />;
}

/**
 * Rendered inside <AuthProvider> so it can read real organization_service
 * capabilities (e.g. canManageUsersAndRoles) to gate routes with, rather
 * than a role string.
 */
function AppRoutes() {
  const { canManageUsersAndRoles, canViewTickets, can } = useAuth();

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/" element={<LandingRedirect />} />

      {/* End User Portal Routes — any authenticated user may raise and
          follow their own requests. */}
      <Route path="/portal/*" element={
        <ProtectedRoute>
          <EndUserLayout>
            <Routes>
              <Route path="/" element={<EndUserDashboard />} />
              <Route path="/catalog" element={<ServiceCatalog />} />
              <Route path="/catalog/:categoryId" element={<CatalogForm />} />
              <Route path="/knowledge" element={<KnowledgeBase />} />
              <Route path="/knowledge/:id" element={<ArticleDetail />} />
              <Route path="/tickets" element={<MyTickets />} />
              <Route path="/tickets/:id" element={<TicketDetail />} />
            </Routes>
          </EndUserLayout>
        </ProtectedRoute>
      } />

      {/* Agent/Admin App Routes — needs a real grant over tickets
          (canViewTickets), OR to be a SIG-DESK admin heading straight for
          /app/admin/users: without that OR, an admin with no
          ticket/change/problem permission could never reach the Users & Roles
          screen at all. The dotted requiredAnyPermissions below are kept for
          the SIGTools-registry vocabulary, but organization_service never
          emits them — an agent whose only grant is `tickets:read:*` used to
          fail this gate and get bounced to /portal, unable to enter the
          workspace at all. */}
      <Route path="/app/*" element={
        <ProtectedRoute
          requiredAnyPermissions={[
            PERMISSIONS.changesView,
            // Quien solo EJECUTA tareas de RFC no tiene `changes:read` — su
            // grant es sobre `change_tasks`. Sin esta linea, el asignado de
            // una Task no podia entrar al workspace donde vive su trabajo.
            PERMISSIONS.changeTasksView,
            PERMISSIONS.problemsView,
            PERMISSIONS.assetsView,
            PERMISSIONS.reportsView,
            PERMISSIONS.automationsView,
            PERMISSIONS.slaView,
            PERMISSIONS.catalogAuthor,
          ]}
          orCondition={canManageUsersAndRoles || canViewTickets || can(PERMISSIONS.assetsView)}
          fallbackTo="/portal"
        >
          <AgentLayout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/catalog" element={
                <ProtectedRoute requiredPermission={PERMISSIONS.catalogView}>
                  <ServiceCatalog />
                </ProtectedRoute>
              } />
              <Route path="/catalog/:categoryId" element={
                <ProtectedRoute requiredPermission={PERMISSIONS.catalogView}>
                  <CatalogForm />
                </ProtectedRoute>
              } />
              {/* Gated by the real `tickets` grant from the JWT, not by
                  PERMISSIONS.ticketsView: that dotted SIGTools-registry key
                  is never emitted by organization_service (emitir_sesion.go
                  always serializes entity:action:scope), so no real role —
                  not even one holding tickets:read:global — could satisfy
                  it. Same pattern as /admin/users below. */}
              <Route path="/tickets" element={
                <ProtectedRoute requireCondition={canViewTickets}>
                  <TicketsKanban />
                </ProtectedRoute>
              } />
              <Route path="/tickets/list" element={
                <ProtectedRoute requireCondition={canViewTickets}>
                  <TicketsList />
                </ProtectedRoute>
              } />
              <Route path="/tickets/:id" element={
                <ProtectedRoute requireCondition={canViewTickets}>
                  <TicketDetail />
                </ProtectedRoute>
              } />
              <Route path="/changes" element={
                <ProtectedRoute requiredPermission={PERMISSIONS.changesView}>
                  <ChangeBoard />
                </ProtectedRoute>
              } />
              {/* Antes de /changes/:id a proposito: si no, "my-tasks" se
                  interpreta como el identificador de una RFC. Y se gatea con
                  changeTasksView, NO con changesView: ver el trabajo que te
                  asignaron no es leer las RFC de otro departamento. */}
              <Route path="/changes/my-tasks" element={
                <ProtectedRoute requiredPermission={PERMISSIONS.changeTasksView}>
                  <MyChangeTasks />
                </ProtectedRoute>
              } />
              <Route path="/changes/:id" element={
                <ProtectedRoute requiredPermission={PERMISSIONS.changesView}>
                  <ChangeDetail />
                </ProtectedRoute>
              } />
              <Route path="/knowledge" element={
                <ProtectedRoute requiredPermission={PERMISSIONS.knowledgeView}>
                  <KnowledgeBase />
                </ProtectedRoute>
              } />
              <Route path="/knowledge/:id" element={
                <ProtectedRoute requiredPermission={PERMISSIONS.knowledgeView}>
                  <ArticleDetail />
                </ProtectedRoute>
              } />
              <Route path="/reports" element={
                <ProtectedRoute requiredPermission={PERMISSIONS.reportsView}>
                  <Reports />
                </ProtectedRoute>
              } />
              <Route path="/assets" element={
                <ProtectedRoute requiredPermission={PERMISSIONS.assetsView}>
                  <AssetsCMDB />
                </ProtectedRoute>
              } />
              <Route path="/problems" element={
                <ProtectedRoute requiredPermission={PERMISSIONS.problemsView}>
                  <ProblemsList />
                </ProtectedRoute>
              } />
              <Route path="/problems/:id" element={
                <ProtectedRoute requiredPermission={PERMISSIONS.problemsView}>
                  <ProblemDetail />
                </ProtectedRoute>
              } />
              {/* Services department slice (PR1) — mock-only, gated on the
                  already-real sigdesk.changes.view until sigdesk.services.view
                  exists in SIGTools (services-department-frontend.md,
                  Constraints). */}
              {/* fallbackTo="/app" is deliberate: ProtectedRoute's default is
                  "/portal", the END-USER portal, so a staff agent who lacks
                  the permission would be ejected from the agent workspace
                  entirely rather than sent somewhere useful inside it. */}
              <Route path="/services" element={
                <ProtectedRoute requiredPermission={PERMISSIONS.changesView} fallbackTo="/app">
                  <ServicesDashboard />
                </ProtectedRoute>
              } />
              <Route path="/services/dealerships/:dealershipId" element={
                <ProtectedRoute requiredPermission={PERMISSIONS.changesView} fallbackTo="/app">
                  <DealershipView />
                </ProtectedRoute>
              } />
              <Route path="/services/tickets/:id" element={
                <ProtectedRoute requiredPermission={PERMISSIONS.changesView} fallbackTo="/app">
                  <SrvDetail />
                </ProtectedRoute>
              } />
              <Route path="/automations" element={
                <ProtectedRoute requiredPermission={PERMISSIONS.automationsView}>
                  <AutomationsList />
                </ProtectedRoute>
              } />
              <Route path="/automations/:id" element={
                <ProtectedRoute requiredPermission={PERMISSIONS.automationsManage}>
                  <WorkflowBuilder />
                </ProtectedRoute>
              } />

              {/* Administration — Users & Roles is gated by a real
                  organization_service permission (roles/usuarios), decoded
                  from the JWT via GET /me, not a hardcoded role name.
                  Catalog Builder is explicitly out of scope for this plan
                  (Docs/plans/conexion-backend-frontend-identidad-rol-plan.md)
                  and is left unguarded, as before. */}
              <Route path="/admin/users" element={
                <ProtectedRoute requireCondition={canManageUsersAndRoles} fallbackTo="/app">
                  <UsersManager />
                </ProtectedRoute>
              } />
              <Route
                path="/admin/catalog-builder"
                element={
                  <ProtectedRoute requiredPermission={PERMISSIONS.catalogAuthor} fallbackTo="/app">
                    <React.Suspense fallback={<FullScreenLoader />}>
                      <CatalogBuilderErrorBoundary>
                        <CatalogBuilder />
                      </CatalogBuilderErrorBoundary>
                    </React.Suspense>
                  </ProtectedRoute>
                }
              />
              <Route path="/settings/sla" element={
                <ProtectedRoute requiredPermission={PERMISSIONS.slaView} fallbackTo="/app">
                  <SlaPolicies />
                </ProtectedRoute>
              } />
              {/* Neither route has a canonical chatops or apikeys permission on
                  the backend — both screens are also fully non-functional
                  placeholders (see ChatOps.tsx / ApiKeys.tsx) with no data to
                  protect yet. Gated on canManageUsersAndRoles, the same
                  capability the sidebar already nav-gates them behind, so
                  this is consistency, not a new restriction. Replace with a
                  real capability check once one exists on the backend. */}
              <Route path="/settings/chatops" element={
                <ProtectedRoute requireCondition={canManageUsersAndRoles} fallbackTo="/app">
                  <ChatOps />
                </ProtectedRoute>
              } />
              <Route path="/settings/api-keys" element={
                <ProtectedRoute requireCondition={canManageUsersAndRoles} fallbackTo="/app">
                  <ApiKeys />
                </ProtectedRoute>
              } />

              <Route path="*" element={<div className="p-8 text-on-surface-variant">Module in development...</div>} />
            </Routes>
          </AgentLayout>
        </ProtectedRoute>
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <React.Suspense fallback={<FullScreenLoader />}>
          <AppRoutes />
        </React.Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
