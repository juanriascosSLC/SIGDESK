import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen, Plus, Search } from 'lucide-react';
import UserProfilePopover from '../components/layout/UserProfilePopover';
import RagChatbot from '../features/assistant/RagChatbot';
import { useAuth } from '../features/auth/useAuth';
import { useNavStore } from '../store/navStore';
import { NotificationBell } from '../features/notifications/NotificationBell';
import { Drawer } from '@/components/ui/Drawer';
import { NavSectionList, BottomNav } from '@/components/layout/AgentNav';
import {
  selectSidebarItems,
  selectDrawerItems,
  selectBottomNavItems,
  selectMoreItems,
  findActiveNavItem,
  type NavPermissionContext,
} from '@/config/navigation';

/** Stable ids so a trigger button's `aria-controls` can point at the exact
 *  drawer panel it opens (Drawer generates its own id when none is given,
 *  but that auto id isn't knowable from the trigger's side). */
const TABLET_NAV_DRAWER_ID = 'agent-tablet-nav-drawer';
const MORE_DRAWER_ID = 'agent-more-nav-drawer';

/** What every nav surface below needs from `useAuth()` — see the type's
 *  own doc comment in config/navigation.ts for why this is a plain object,
 *  not a role name. */
function useNavPermissionContext(): NavPermissionContext {
  const { can, canViewTickets, canManageUsersAndRoles } = useAuth();
  return { can, canViewTickets, canManageUsersAndRoles };
}

function Brand({ collapsed, compact }: { collapsed?: boolean; compact?: boolean }) {
  return (
    <Link
      to="/app"
      aria-label="SIG-DESK Home"
      className={`relative flex items-center group rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${collapsed ? 'justify-center' : 'gap-3'}`}
    >
      <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200" />
      <div className="relative p-1.5 rounded-xl bg-surface-container-low border border-cyan-500/30 flex items-center justify-center">
        {/* Decorative: the Link above already carries the accessible name,
            so the logo doesn't need its own (avoids announcing it twice). */}
        <img src="/logo.png" alt="" className={compact ? 'w-6 h-6 object-contain' : 'w-8 h-8 object-contain drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]'} />
      </div>
      {!collapsed && !compact && (
        <div className="whitespace-nowrap">
          <div className="text-sm font-black tracking-[0.2em] text-on-surface uppercase drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">SIG-DESK</div>
          <div className="text-[9px] font-mono font-bold tracking-[0.3em] text-primary uppercase mt-0.5">Agent Workspace</div>
        </div>
      )}
    </Link>
  );
}

/** The persistent desktop rail (>= lg). Below that, TabletDrawer/BottomNav
 *  take over — see AgentLayout below. */
function Sidebar({ collapsed }: { collapsed: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const ctx = useNavPermissionContext();
  const items = selectSidebarItems(ctx);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <nav
      id="app-nav"
      className={`fixed left-0 top-0 hidden h-screen flex-col bg-surface-container-lowest/95 backdrop-blur-2xl lg:flex border-r border-border shadow-[4px_0_24px_rgba(0,0,0,0.3)] z-50 transition-[width] duration-300 ease-out ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      <div className={`relative mt-4 py-8 ${collapsed ? 'px-0' : 'px-6'}`}>
        <div className={`absolute top-10 w-20 h-20 bg-cyan-500/20 rounded-full blur-[40px] pointer-events-none ${collapsed ? 'left-0' : 'left-10'}`} />
        <div className="relative z-10">
          <Brand collapsed={collapsed} />
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto overflow-x-hidden pb-8 ${collapsed ? 'px-3' : 'px-4'}`}>
        <div className="py-2">
          <NavSectionList items={items} pathname={location.pathname} collapsed={collapsed} />
        </div>
      </div>

      <div className={`mt-auto bg-gradient-to-b from-transparent to-surface-container-low/80 border-t border-border ${collapsed ? 'p-3' : 'p-4'}`}>
        <button
          onClick={handleLogout}
          title={collapsed ? 'Sign out' : undefined}
          aria-label={collapsed ? 'Sign out' : undefined}
          className={`group relative flex min-h-[44px] items-center w-full rounded-xl overflow-hidden bg-on-surface/5 border border-border transition-all duration-300 hover:border-red-500/30 hover:bg-red-500/10 ${
            collapsed ? 'justify-center px-0 py-3' : 'justify-between px-6 py-3'
          }`}
        >
          <div className="flex items-center gap-3 relative z-10">
            <div className="w-8 h-8 rounded-lg bg-surface-container-low border border-border flex items-center justify-center group-hover:border-red-500/30 group-hover:bg-red-500/20 transition-colors">
              <LogOut size={14} className="text-on-surface-variant group-hover:text-status-danger-fg transition-colors" />
            </div>
            {!collapsed && (
              <span className="whitespace-nowrap text-xs font-bold text-on-surface-variant group-hover:text-status-danger-fg transition-colors">
                Sign out
              </span>
            )}
          </div>
        </button>
      </div>
    </nav>
  );
}

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  // The notification bell only queries once permissions have resolved:
  // requesting the inbox without a usable session produces a 401 that
  // apiClient turns into a sign-out, which would bounce back to login on
  // every startup.
  const { canViewTickets } = useAuth();
  const location = useLocation();
  const collapsed = useNavStore((state) => state.collapsed);
  const toggleNav = useNavStore((state) => state.toggle);
  const ctx = useNavPermissionContext();

  // Tablet drawer (sm–lg) and the mobile "More" sheet are two different
  // Drawer instances with two different item lists — never open at once
  // (they're gated on non-overlapping breakpoints), so one boolean each is
  // enough; a single shared "navOpen" would conflate two different
  // triggers restoring focus to two different buttons.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const drawerItems = selectDrawerItems(ctx);
  const bottomNavItems = selectBottomNavItems(ctx);
  const moreItems = selectMoreItems(ctx, bottomNavItems);
  const activeBottomItem = findActiveNavItem(bottomNavItems, location.pathname);
  const moreActive = !activeBottomItem && findActiveNavItem(moreItems, location.pathname) !== undefined;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex overflow-hidden">
      <Sidebar collapsed={collapsed} />

      {/* Tablet drawer — same permitted item list as the sidebar
          (selectDrawerItems), just a different container. Closes on
          Escape/backdrop/navigate (Drawer + onNavigate below); focus
          returns to whichever button opened it (useFocusTrap). */}
      <Drawer id={TABLET_NAV_DRAWER_ID} open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Navigation">
        <div className="p-3">
          <NavSectionList items={drawerItems} pathname={location.pathname} onNavigate={() => setDrawerOpen(false)} />
        </div>
      </Drawer>

      {/* Mobile "More" — everything not already pinned to the bottom bar. */}
      <Drawer id={MORE_DRAWER_ID} open={moreOpen} onClose={() => setMoreOpen(false)} title="More" side="right">
        <div className="p-3">
          <NavSectionList items={moreItems} pathname={location.pathname} onNavigate={() => setMoreOpen(false)} />
        </div>
      </Drawer>

      {/* Main Content — the nav is `fixed`, so the content reserves its width
          with a margin. Both sides animate together or the layout visibly
          tears while the rail slides. Below lg there is no persistent rail
          (tablet uses the drawer above, mobile the bottom bar below), so no
          margin is reserved there either. */}
      <main
        className={`flex-1 flex flex-col bg-surface overflow-hidden relative transition-[margin] duration-300 ease-out ${
          collapsed ? 'lg:ml-20' : 'lg:ml-64'
        }`}
      >
        <header className="h-16 sm:h-20 border-b border-border/40 bg-surface-container-lowest/50 backdrop-blur-xl flex items-center px-3 sm:px-6 lg:px-8 justify-between sticky top-0 z-30 gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-4 w-full max-w-xl min-w-0">
            {/* Desktop: fold/unfold the persistent rail. */}
            <button
              type="button"
              onClick={toggleNav}
              aria-expanded={!collapsed}
              aria-controls="app-nav"
              aria-label={collapsed ? 'Show navigation' : 'Hide navigation'}
              title={collapsed ? 'Show navigation' : 'Hide navigation'}
              data-testid="app-nav-toggle"
              className="hidden lg:flex shrink-0 w-11 h-11 rounded-xl bg-surface-container-low border border-border/50 items-center justify-center text-on-surface-variant hover:text-primary hover:border-primary/30 transition-colors"
            >
              {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
            {/* Tablet: open the drawer version of the same nav. Hidden on
                mobile (bottom nav + More covers it) and desktop (the rail
                is always visible there). */}
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={drawerOpen}
              aria-controls={TABLET_NAV_DRAWER_ID}
              aria-label="Open navigation"
              title="Open navigation"
              data-testid="app-nav-drawer-toggle"
              className="hidden sm:flex lg:hidden shrink-0 w-11 h-11 rounded-xl bg-surface-container-low border border-border/50 items-center justify-center text-on-surface-variant hover:text-primary hover:border-primary/30 transition-colors"
            >
              <Menu className="w-4 h-4" />
            </button>
            {/* Brand mark for narrow viewports, where the sidebar (which
                normally carries it) isn't rendered at all. */}
            <div className="lg:hidden shrink-0">
              <Brand compact />
            </div>
            <div className="relative w-full min-w-0 hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
              {/* Global search across tickets/assets/knowledge has no backend
                  yet — this used to fake a results dropdown with hardcoded
                  entries regardless of what was typed. Per "honestly disable
                  search if no real backend, never fake results", this is
                  disabled rather than pretending to work. Re-enable once a
                  real search endpoint exists. */}
              <input
                type="text"
                disabled
                placeholder="Search isn't available yet"
                title="Global search isn't available yet"
                aria-label="Global search isn't available yet"
                className="w-full bg-surface-container-low border border-border/50 text-on-surface-variant text-sm rounded-xl pl-10 pr-4 py-2 cursor-not-allowed opacity-70 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <Link
              to="/app/catalog"
              className="bg-primary text-primary-foreground px-3 sm:px-4 py-2 rounded-xl text-sm font-bold shadow-[0_0_15px_rgba(34,211,238,0.3)] hover:shadow-[0_0_25px_rgba(34,211,238,0.5)] transition-all flex items-center gap-2 min-h-[44px]"
            >
              {/* Points at /app/catalog, which opens ANY published case type
                  (INC, PRB, RFC…). "Ticket" in the glossary means INC
                  specifically, so the old label promised less — and
                  something other — than the destination delivers. */}
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Case</span>
            </Link>

            {/* La campana real: contador de no leídas, bandeja del backend y
                marcado de lectura. Antes era un array estático en este mismo
                archivo — se veía idéntico con el backend caído. */}
            <NotificationBell enabled={canViewTickets} />

            <UserProfilePopover />
          </div>
        </header>
        {/* `z-0` crea un CONTEXTO DE APILAMIENTO para todo el contenido de la
            página, y hace falta: el diseñador de páginas apoya en él el
            apilamiento de su capa de arrastre, y sin el contexto la cabecera
            (z-10) se pinta por encima e intercepta los sueltos. Se comprobó
            quitándolo: «una región fija rechaza todo lo que ofrece la paleta»
            pasaba a expirar por un arrastre que nunca llegaba a su destino.

            El precio de ese contexto es que TODO lo que hay dentro queda topado
            en z-0. Por eso <RagChatbot/> se pinta AQUÍ DENTRO y no como hermano
            de <main>: desde fuera, cualquier z positivo suyo ganaba a los
            modales de la página —topados en 0— y su botón flotante interceptaba
            los clics de todos ellos. Dentro, comparte contexto con los modales
            y su z-40 pierde limpiamente contra el z-50 de un modal, que es el
            orden correcto.

            Sigue siendo `fixed`, así que se posiciona respecto al viewport y el
            `overflow-y-auto` de este contenedor no lo recorta ni lo desplaza:
            un elemento fijo solo queda atrapado por un ancestro con transform o
            filter, y aquí no hay ninguno.

            pb-16 + safe-area: below `sm` the bottom nav bar overlays the
            viewport edge, so scrollable content needs room to clear it —
            otherwise its last rows render underneath the bar, unreadable and
            untappable. */}
        <div className="flex-1 overflow-y-auto bg-surface relative z-0 pb-[calc(env(safe-area-inset-bottom)+4rem)] sm:pb-0">
          {children}
          <RagChatbot />
        </div>
      </main>

      <BottomNav
        items={bottomNavItems}
        pathname={location.pathname}
        onOpenMore={() => setMoreOpen(true)}
        moreActive={moreActive}
        moreOpen={moreOpen}
        moreItemCount={moreItems.length}
        moreDrawerId={MORE_DRAWER_ID}
      />
    </div>
  );
}
