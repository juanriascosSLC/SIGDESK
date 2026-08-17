import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './features/auth/AuthProvider';
import { useAuth } from './features/auth/useAuth';
import { PERMISSIONS } from './features/auth/permissions';

// Layouts
import AgentLayout from './layouts/AgentLayout';
import EndUserLayout from './layouts/EndUserLayout';

// Auth Features
import Login from './features/auth/Login';
import ForgotPassword from './features/auth/ForgotPassword';

// App Features (Agent/Admin)
import TicketsKanban from './features/tickets/TicketsKanban';
import TicketDetail from './features/tickets/TicketDetail';
import TicketsList from './features/tickets/TicketsList';
import CatalogForm from './features/catalog/CatalogForm';
import ApiKeys from './features/settings/ApiKeys';
import ChatOps from './features/settings/ChatOps';
import ChangeBoard from './features/changes/ChangeBoard';
import ChangeDetail from './features/changes/ChangeDetail';
import AutomationsList from './features/automations/AutomationsList';
import WorkflowBuilder from './features/automations/WorkflowBuilder';
import KnowledgeBase from './features/knowledge/KnowledgeBase';
import ArticleDetail from './features/knowledge/ArticleDetail';
import SlaPolicies from './features/settings/SlaPolicies';
import Reports from './features/reports/Reports';
import ProblemsList from './features/problems/ProblemsList';
import ProblemDetail from './features/problems/ProblemDetail';

// End User Portal Features
import EndUserDashboard from './features/endUser/EndUserDashboard';
import MyTickets from './features/endUser/MyTickets';

// Admin Features
import UsersManager from './features/admin/UsersManager';
const CatalogBuilder = React.lazy(
  () => import('./features/admin/CatalogBuilder'),
);

// Mock components previously in App.tsx
import { Dashboard } from './features/dashboard/Dashboard';
import { ServiceCatalog } from './features/catalog/ServiceCatalog';

function FullScreenLoader() {
  return (
    <div className="min-h-screen bg-surface-container-lowest flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-full border-2 border-cyan-500/30 border-t-cyan-400 animate-spin" />
        <p className="text-xs font-mono uppercase tracking-[0.3em] text-cyan-500/70">
          Verificando sesión
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
  return <Navigate to="/portal" replace />;
}

/**
 * Rendered inside <AuthProvider> so it can read real organization_service
 * capabilities (e.g. canManageUsersAndRoles) to gate routes with, rather
 * than a role string.
 */
function AppRoutes() {
  const { canManageUsersAndRoles, canViewTickets } = useAuth();

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
            PERMISSIONS.ticketsView,
            PERMISSIONS.changesView,
            PERMISSIONS.problemsView,
          ]}
          orCondition={canManageUsersAndRoles || canViewTickets}
          fallbackTo="/portal"
        >
          <AgentLayout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/catalog" element={<ServiceCatalog />} />
              <Route path="/catalog/:categoryId" element={<CatalogForm />} />
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
              <Route path="/changes/:id" element={
                <ProtectedRoute requiredPermission={PERMISSIONS.changesView}>
                  <ChangeDetail />
                </ProtectedRoute>
              } />
              <Route path="/knowledge" element={<KnowledgeBase />} />
              <Route path="/knowledge/:id" element={<ArticleDetail />} />
              <Route path="/reports" element={<Reports />} />
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
              <Route path="/automations" element={<AutomationsList />} />
              <Route path="/automations/:id" element={<WorkflowBuilder />} />

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
                  <React.Suspense fallback={<FullScreenLoader />}>
                    <CatalogBuilder />
                  </React.Suspense>
                }
              />
              <Route path="/settings/sla" element={<SlaPolicies />} />
              <Route path="/settings/chatops" element={<ChatOps />} />
              <Route path="/settings/api-keys" element={<ApiKeys />} />

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
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
