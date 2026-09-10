import React, { useState } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Ticket as TicketIcon,
  FilePlus2,
  Boxes,
  Bot,
  LogOut,
  Search,
  Plus,
  Settings,
  MessageSquare,
  Network,
  ListChecks,
  Workflow,
  BarChart3,
  SearchCode,
  Timer,
  BookOpen,
  Server,
  Users,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import UserProfilePopover from '../components/layout/UserProfilePopover';
import RagChatbot from '../features/assistant/RagChatbot';
import { useAuth } from '../features/auth/useAuth';
import { PERMISSIONS } from '../features/auth/permissions';
import { useNavStore } from '../store/navStore';
import { NotificationBell } from '../features/notifications/NotificationBell';

// --- Components from App.tsx Sidebar ---

interface NavButtonProps {
  active: boolean;
  to: string;
  icon: React.ElementType;
  label: string;
  isAmber?: boolean;
  collapsed?: boolean;
}

function NavButton({ active, to, icon: Icon, label, isAmber, collapsed }: NavButtonProps) {
  const activeBg = isAmber ? 'from-amber-500/20' : 'from-cyan-500/20';
  const activeText = isAmber ? 'text-amber-400' : 'text-cyan-400';
  const activeShadow = isAmber ? 'shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'shadow-[0_0_15px_rgba(34,211,238,0.3)]';
  const lineShadow = isAmber ? 'shadow-[0_0_10px_#f59e0b]' : 'shadow-[0_0_10px_#22d3ee]';
  const lineBg = isAmber ? 'bg-amber-400' : 'bg-cyan-400';
  const hoverText = isAmber ? 'group-hover:text-amber-400/80' : 'group-hover:text-cyan-400/80';
  const hoverShadow = isAmber ? 'group-hover:shadow-[0_0_10px_rgba(245,158,11,0.1)]' : 'group-hover:shadow-[0_0_10px_rgba(34,211,238,0.1)]';
  const iconBg = isAmber ? 'bg-amber-500/20' : 'bg-cyan-500/20';
  const iconBorder = isAmber ? 'border-amber-500/30' : 'border-cyan-500/30';

  // Collapsed, the icon is all that identifies the destination, so the label
  // has to survive as an accessible name and as a native tooltip — otherwise
  // the rail is a column of unlabelled glyphs.
  return (
    <Link
      to={to}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      className={`group flex items-center rounded-xl transition-all duration-300 text-left relative overflow-hidden ${
        collapsed ? 'justify-center px-0 py-2.5' : 'gap-4 px-4 py-2.5'
      } ${
        active
          ? `bg-gradient-to-r ${activeBg} to-transparent border border-border`
          : `text-on-surface-variant hover:text-on-surface hover:bg-on-surface/[0.03] border border-transparent ${collapsed ? '' : 'hover:translate-x-1'}`
      }`}
    >
      {active && (
        <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${lineBg} ${lineShadow}`} />
      )}
      
      <div className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-300 ${
        active 
          ? `${iconBg} ${activeText} ${activeShadow} border ${iconBorder}` 
          : `bg-surface-container-high/50 text-on-surface-variant border border-border group-hover:bg-surface-container-high ${hoverText} ${hoverShadow}`
      }`}>
        <Icon size={16} strokeWidth={active ? 2.5 : 2} />
      </div>

      {!collapsed && (
        <span className={`whitespace-nowrap text-[10px] font-black uppercase tracking-[0.15em] transition-colors duration-300 ${
          active ? 'text-on-surface drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]' : ''
        }`}>
          {label}
        </span>
      )}
    </Link>
  );
}

function SectionHeader({ title, isAmber, collapsed }: { title: string; isAmber?: boolean; collapsed?: boolean }) {
  // In the rail the title has nowhere to go without wrapping into an
  // unreadable stack, so the group is marked by a rule instead. The text stays
  // for screen readers: the grouping is still real, only its rendering changed.
  if (collapsed) {
    return (
      <div className="px-2 py-1 mb-2 mt-4 first:mt-0">
        <span className="sr-only">{title}</span>
        <div aria-hidden className={`h-px w-full ${isAmber ? 'bg-amber-500/30' : 'bg-border'}`} />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-2 py-1 mb-2 mt-4 first:mt-0">
      <div className={`h-px w-4 ${isAmber ? 'bg-gradient-to-r from-amber-500/50 to-transparent' : 'bg-gradient-to-r from-cyan-500/50 to-transparent'}`} />
      <p className={`text-[9px] font-black uppercase tracking-[0.2em] ${isAmber ? 'text-amber-500/80' : 'text-on-surface-variant'}`}>
        {title}
      </p>
      <div className={`h-px flex-1 ${isAmber ? 'bg-gradient-to-r from-transparent via-amber-500/10 to-transparent' : 'bg-gradient-to-r from-transparent via-white/5 to-transparent'}`} />
    </div>
  );
}

function Sidebar({ collapsed }: { collapsed: boolean }) {
  const location = useLocation();
  const currentPath = location.pathname;
  const { logout, canManageUsersAndRoles, canViewTickets, can } = useAuth();
  const navigate = useNavigate();

  // Changes/Problems are still gated by dotted SIGTools-registry keys that
  // organization_service never emits (their backend domain does not exist
  // yet — /entities/PRB and /entities/RFC answer 501), so this group can
  // legitimately end up with zero visible links. Count them before drawing
  // the section title: an "empty" heading reads as broken nav, and it only
  // went unnoticed while Tickets was equally unreachable.
  const canViewChanges = can(PERMISSIONS.changesView);
  // Grant distinto y a proposito: se puede ejecutar trabajo de una RFC sin
  // poder leer las RFC. Quien esta en ese caso solo ve "Mis tareas".
  const canViewChangeTasks = can(PERMISSIONS.changeTasksView);
  const canViewProblems = can(PERMISSIONS.problemsView);
  const canViewAssets = can(PERMISSIONS.assetsView);
  const canViewReports = can(PERMISSIONS.reportsView);
  const canViewCatalog = can(PERMISSIONS.catalogView);
  const canViewKnowledge = can(PERMISSIONS.knowledgeView);
  const canAuthorCatalog = can(PERMISSIONS.catalogAuthor);
  const canViewAutomations = can(PERMISSIONS.automationsView);
  const canViewSla = can(PERMISSIONS.slaView);
  // Agrupación por lo que el ítem ES, no por el framework del que viene:
  //  - "Cases" reúne los pools de los tipos de caso del glosario (INC, PRB,
  //    RFC) + el punto de creación. Antes INC vivía en "Service Desk (ITSM)"
  //    y PRB/RFC en "Change & Config (ITIL)", separados por Reports: dos
  //    títulos que nombran el mismo framework y parten un grupo que el
  //    glosario define como uno solo ("Los 4 tipos de caso").
  //  - "Reference" son las superficies que se consultan MIENTRAS se trabaja
  //    un caso pero no son casos: Knowledge Base y Assets/CMDB (items de
  //    configuración, explícitamente no un tipo de caso en el glosario).
  //  - "Workspace" son las superficies de orientación: el tablero, la
  //    bandeja propia y las métricas.
  const showCases = canViewCatalog || canViewTickets || canViewProblems || canViewChanges;
  const showReference = canViewKnowledge || canViewAssets;
  const showAdministration = canManageUsersAndRoles || canAuthorCatalog || canViewAutomations || canViewSla;

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <nav
      id="app-nav"
      className={`fixed left-0 top-0 hidden h-screen flex-col bg-surface-container-lowest/95 backdrop-blur-2xl md:flex border-r border-border shadow-[4px_0_24px_rgba(0,0,0,0.3)] z-50 transition-[width] duration-300 ease-out ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      
      {/* Brand Header */}
      <div className={`relative mt-4 py-8 ${collapsed ? 'px-0' : 'px-6'}`}>
        {/* Subtle glow behind logo */}
        <div className={`absolute top-10 w-20 h-20 bg-cyan-500/20 rounded-full blur-[40px] pointer-events-none ${collapsed ? 'left-0' : 'left-10'}`} />
        
        <div className={`flex items-center mb-2 relative z-10 ${collapsed ? 'justify-center' : 'gap-4'}`}>
          <div
            className="relative group cursor-pointer"
            onClick={() => navigate('/app')}
            title={collapsed ? 'SIG-DESK' : undefined}
          >
            <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200" />
            <div className="relative p-1.5 rounded-xl bg-surface-container-low border border-cyan-500/30 flex items-center justify-center">
              <img src="/logo.png" alt="SIG-DESK Logo" className="w-8 h-8 object-contain drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]" />
            </div>
          </div>
          {!collapsed && (
            <div className="whitespace-nowrap">
              <div className="text-sm font-black tracking-[0.25em] text-on-surface uppercase drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">SIG-DESK</div>
              <div className="text-[9px] font-mono font-bold tracking-[0.3em] text-cyan-500/80 uppercase mt-0.5">AGENT WORKSPACE</div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className={`flex-1 overflow-y-auto overflow-x-hidden pb-8 ${collapsed ? 'px-3' : 'px-4'}`}>
        <div className="flex flex-col gap-1 py-2">
        
          <div className="mb-2">
            <SectionHeader collapsed={collapsed} title="Workspace" />
            <NavButton
              collapsed={collapsed}
              active={currentPath === '/app'}
              to="/app"
              icon={LayoutDashboard}
              label="Dashboard"
            />
            {canViewChangeTasks && (
              <NavButton
                collapsed={collapsed}
                active={currentPath === '/app/changes/my-tasks'}
                to="/app/changes/my-tasks"
                icon={ListChecks}
                label="My Tasks"
              />
            )}
            {canViewReports && (
              <NavButton
                collapsed={collapsed}
                active={currentPath.startsWith('/app/reports')}
                to="/app/reports"
                icon={BarChart3}
                label="Reports"
              />
            )}
          </div>

          {showCases && (
            <div className="mb-2">
              <SectionHeader collapsed={collapsed} title="Cases" />
              {canViewCatalog && (
                <NavButton
                  collapsed={collapsed}
                  active={currentPath.startsWith('/app/catalog')}
                  to="/app/catalog"
                  icon={FilePlus2}
                  label="New Case"
                />
              )}
              {canViewTickets && (
                <NavButton
                  collapsed={collapsed}
                  active={currentPath.startsWith('/app/tickets')}
                  to="/app/tickets"
                  icon={TicketIcon}
                  label="Incidents"
                />
              )}
              {canViewProblems && (
                <NavButton
                  collapsed={collapsed}
                  active={currentPath.startsWith('/app/problems')}
                  to="/app/problems"
                  icon={SearchCode}
                  label="Problems"
                />
              )}
              {canViewChanges && (
                <NavButton
                  collapsed={collapsed}
                  active={currentPath.startsWith('/app/changes') && currentPath !== '/app/changes/my-tasks'}
                  to="/app/changes"
                  icon={Network}
                  label="Changes"
                />
              )}
            </div>
          )}

          {showReference && (
            <div className="mb-2">
              <SectionHeader collapsed={collapsed} title="Reference" />
              {canViewKnowledge && (
                <NavButton
                  collapsed={collapsed}
                  active={currentPath.startsWith('/app/knowledge')}
                  to="/app/knowledge"
                  icon={BookOpen}
                  label="Knowledge Base"
                />
              )}
              {canViewAssets && (
                <NavButton
                  collapsed={collapsed}
                  active={currentPath.startsWith('/app/assets')}
                  to="/app/assets"
                  icon={Server}
                  label="Assets / CMDB"
                />
              )}
            </div>
          )}

          {showAdministration && (
            <div className="mb-2">
              <SectionHeader collapsed={collapsed} title="Administration" />
              {canManageUsersAndRoles && <NavButton collapsed={collapsed} active={currentPath.startsWith('/app/admin/users')} to="/app/admin/users" icon={Users} label="Users & Roles" />}
              {canAuthorCatalog && <NavButton collapsed={collapsed} active={currentPath.startsWith('/app/admin/catalog-builder')} to="/app/admin/catalog-builder" icon={Boxes} label="Entity Builder" />}
              {canViewAutomations && <NavButton collapsed={collapsed} active={currentPath.startsWith('/app/automations')} to="/app/automations" icon={Workflow} label="Automations" />}
              {canViewSla && <NavButton collapsed={collapsed} active={currentPath.startsWith('/app/settings/sla')} to="/app/settings/sla" icon={Timer} label="SLA Policies" />}
              {canManageUsersAndRoles && <>
              <NavButton
                collapsed={collapsed}
                active={currentPath.startsWith('/app/settings/chatops')}
                to="/app/settings/chatops"
                icon={MessageSquare}
                label="ChatOps"
              />
              <NavButton
                collapsed={collapsed}
                active={currentPath.startsWith('/app/settings/api-keys')}
                to="/app/settings/api-keys"
                icon={Settings}
                label="API Keys"
              />
              {/* Al final del bloque y con icono propio: es afinado del
                  asistente de IA, no gestión de identidades — estaba pegado a
                  "Users & Roles" y compartía icono con ChatOps. */}
              <NavButton
                collapsed={collapsed}
                active={currentPath.startsWith('/app/admin/assistant-feedback')}
                to="/app/admin/assistant-feedback"
                icon={Bot}
                label="Assistant Feedback"
              />
              </>}
            </div>
          )}

        </div>
      </div>

      {/* Footer Info */}
      <div className={`mt-auto bg-gradient-to-b from-transparent to-surface-container-low/80 border-t border-border ${collapsed ? 'p-3' : 'p-4'}`}>
        <button
          onClick={handleLogout}
          title={collapsed ? 'Sign out' : undefined}
          aria-label={collapsed ? 'Sign out' : undefined}
          className={`group relative flex items-center w-full rounded-xl overflow-hidden bg-on-surface/5 border border-border transition-all duration-300 hover:border-red-500/30 hover:bg-red-500/10 hover:shadow-[0_0_20px_rgba(239,68,68,0.15)] hover:-translate-y-0.5 ${
            collapsed ? 'justify-center px-0 py-3' : 'justify-between px-6 py-3'
          }`}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-red-500/0 via-red-500/0 to-red-500/0 group-hover:from-red-500/10 group-hover:via-transparent transition-all duration-500" />
          
          <div className="flex items-center gap-3 relative z-10">
            <div className="w-8 h-8 rounded-lg bg-surface-container-low border border-border flex items-center justify-center group-hover:border-red-500/30 group-hover:bg-red-500/20 transition-colors">
              <LogOut size={14} className="text-on-surface-variant group-hover:text-red-400 transition-colors" />
            </div>
            {!collapsed && (
              <span className="whitespace-nowrap text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant group-hover:text-red-400 transition-colors">
                Sign out
              </span>
            )}
          </div>
        </button>
      </div>
    </nav>
  );
}

const mockSearchResults = {
  tickets: [
    { id: 'INC-202601', label: 'Camera offline at Site #401' },
    { id: 'INC-202603', label: 'Network latency issues in Building A' },
  ],
  assets: [
    { id: 'CAM-12607', label: 'HIKVISION DS-2CD2143G0-I · Site #401' },
  ],
  knowledge: [
    { id: 'KB-1024', label: 'How to power-cycle an offline HIKVISION camera' },
  ],
};

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  const [searchFocused, setSearchFocused] = useState(false);
  // La campana solo consulta cuando ya hay permisos resueltos: pedir la
  // bandeja sin sesión útil produce un 401 que apiClient convierte en
  // cierre de sesión, y eso rebotaría al login en cada arranque.
  const { canViewTickets } = useAuth();
  const collapsed = useNavStore((state) => state.collapsed);
  const toggleNav = useNavStore((state) => state.toggle);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex overflow-hidden">
      <Sidebar collapsed={collapsed} />

      {/* Main Content — the nav is `fixed`, so the content reserves its width
          with a margin. Both sides animate together or the layout visibly
          tears while the rail slides. */}
      <main
        className={`flex-1 flex flex-col bg-surface overflow-hidden relative transition-[margin] duration-300 ease-out ${
          collapsed ? 'md:ml-20' : 'md:ml-64'
        }`}
      >
        <header className="h-20 border-b border-border/40 bg-surface-container-lowest/50 backdrop-blur-xl flex items-center px-8 justify-between sticky top-0 z-10">
          <div className="flex items-center gap-4 w-full max-w-xl">
            {/* The control lives in the header, not in the nav: it stays in
                the same place whether the rail is open or closed, and it reads
                as "fold the panel to my left". Hidden below `md` for the same
                reason the nav is — there is nothing to fold there. */}
            <button
              type="button"
              onClick={toggleNav}
              aria-expanded={!collapsed}
              aria-controls="app-nav"
              aria-label={collapsed ? 'Mostrar la navegación' : 'Ocultar la navegación'}
              title={collapsed ? 'Mostrar la navegación' : 'Ocultar la navegación'}
              data-testid="app-nav-toggle"
              className="hidden md:flex shrink-0 w-10 h-10 rounded-xl bg-surface-container-low border border-border/50 items-center justify-center text-on-surface-variant hover:text-cyan-400 hover:border-cyan-500/30 transition-colors"
            >
              {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
             <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
                <input
                  type="text"
                  placeholder="Search tickets, assets, or knowledge base... (Press '/')"
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  className="w-full bg-surface-container-low border border-border/50 text-on-surface text-sm rounded-xl pl-10 pr-4 py-2 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                />

                {/* Search results panel (mock) */}
                {searchFocused && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-surface-container-lowest/95 backdrop-blur-2xl border border-border/50 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden z-50">
                    <div className="p-2">
                      <p className="px-3 pt-2 pb-1 text-[9px] font-black uppercase tracking-[0.2em] text-cyan-500/80">Tickets</p>
                      {mockSearchResults.tickets.map((r) => (
                        <div key={r.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-on-surface/5 cursor-pointer">
                          <TicketIcon className="w-4 h-4 text-on-surface-variant shrink-0" />
                          <span className="font-mono text-[10px] text-cyan-400">{r.id}</span>
                          <span className="text-sm text-on-surface-variant truncate">{r.label}</span>
                        </div>
                      ))}
                      <p className="px-3 pt-3 pb-1 text-[9px] font-black uppercase tracking-[0.2em] text-cyan-500/80">Assets · SIGInventory</p>
                      {mockSearchResults.assets.map((r) => (
                        <div key={r.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-on-surface/5 cursor-pointer">
                          <Server className="w-4 h-4 text-on-surface-variant shrink-0" />
                          <span className="font-mono text-[10px] text-cyan-400">{r.id}</span>
                          <span className="text-sm text-on-surface-variant truncate">{r.label}</span>
                        </div>
                      ))}
                      <p className="px-3 pt-3 pb-1 text-[9px] font-black uppercase tracking-[0.2em] text-cyan-500/80">Knowledge Base</p>
                      {mockSearchResults.knowledge.map((r) => (
                        <div key={r.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-on-surface/5 cursor-pointer">
                          <BookOpen className="w-4 h-4 text-on-surface-variant shrink-0" />
                          <span className="font-mono text-[10px] text-cyan-400">{r.id}</span>
                          <span className="text-sm text-on-surface-variant truncate">{r.label}</span>
                        </div>
                      ))}
                    </div>
                    <div className="px-4 py-2 border-t border-border/40 bg-surface-container-lowest/60 text-[10px] text-on-surface-variant font-mono">
                      ↑↓ navigate · ↵ open · esc close
                    </div>
                  </div>
                )}
             </div>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/app/catalog" className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-bold shadow-[0_0_15px_rgba(34,211,238,0.3)] hover:shadow-[0_0_25px_rgba(34,211,238,0.5)] transition-all flex items-center gap-2">
               {/* Apunta a /app/catalog, que abre CUALQUIER tipo de caso
                   publicado (INC, PRB, RFC…). "Ticket" en el glosario
                   significa específicamente INC, así que el label prometía
                   menos — y otra cosa — de lo que el destino hace. */}
               <Plus className="w-4 h-4" />
               New Case
            </Link>

            {/* La campana real: contador de no leídas, bandeja del backend y
                marcado de lectura. Antes era un array estático en este mismo
                archivo — se veía idéntico con el backend caído. */}
            <NotificationBell enabled={canViewTickets} />

            <UserProfilePopover />
          </div>
        </header>
        <div className="flex-1 overflow-y-auto bg-surface relative z-0">
          {children}
        </div>
      </main>
      <RagChatbot />
    </div>
  );
}
