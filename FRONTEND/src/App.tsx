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
  fallbackTo,
}: {
  children: React.ReactNode;
  requiredPermission?: string;
  requiredAnyPermissions?: string[];
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

  if (requiredPermission && !can(requiredPermission)) {
    return <Navigate to={fallbackTo ?? '/portal'} replace />;
  }
  if (
    requiredAnyPermissions?.length &&
    !requiredAnyPermissions.some((permission) => can(permission))
  ) {
    return <Navigate to={fallbackTo ?? '/portal'} replace />;
  }

  return <>{children}</>;
}

/**
 * Sends each user to the surface they can actually use: the staff workspace if
 * they may work tickets, otherwise the self-service portal.
 */
function LandingRedirect() {
  const { isAuthenticated, isLoading, can } = useAuth();
  if (isLoading) return <FullScreenLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (can(PERMISSIONS.ticketsView)) return <Navigate to="/app" replace />;
  if (can(PERMISSIONS.changesView)) return <Navigate to="/app/changes" replace />;
  return <Navigate to="/portal" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
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

          {/* Agent/Admin App Routes — needs permission to work on tickets. */}
          <Route path="/app/*" element={
            <ProtectedRoute
              requiredAnyPermissions={[
                PERMISSIONS.ticketsView,
                PERMISSIONS.changesView,
                PERMISSIONS.problemsView,
              ]}
              fallbackTo="/portal"
            >
              <AgentLayout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/catalog" element={<ServiceCatalog />} />
                  <Route path="/catalog/:categoryId" element={<CatalogForm />} />
                  <Route path="/tickets" element={
                    <ProtectedRoute requiredPermission={PERMISSIONS.ticketsView}>
                      <TicketsKanban />
                    </ProtectedRoute>
                  } />
                  <Route path="/tickets/list" element={
                    <ProtectedRoute requiredPermission={PERMISSIONS.ticketsView}>
                      <TicketsList />
                    </ProtectedRoute>
                  } />
                  <Route path="/tickets/:id" element={
                    <ProtectedRoute requiredPermission={PERMISSIONS.ticketsView}>
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

                  {/* Administration */}
                  <Route path="/admin/users" element={<UsersManager />} />
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
      </AuthProvider>
    </BrowserRouter>
  );
}
