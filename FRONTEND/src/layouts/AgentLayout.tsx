import React, { useState } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Ticket as TicketIcon,
  FolderKanban,
  LogOut,
  ShieldCheck,
  Search,
  Plus,
  Settings,
  MessageSquare,
  Network,
  Workflow,
  Bell,
  BarChart3,
  SearchCode,
  Timer,
  AlertTriangle,
  UserCheck,
  CheckCircle2,
  BookOpen,
  Server,
  CalendarClock,
  Users
} from 'lucide-react';
import UserProfilePopover from '../components/layout/UserProfilePopover';
import { useAuth } from '../features/auth/useAuth';
import { PERMISSIONS } from '../features/auth/permissions';

// --- Components from App.tsx Sidebar ---

interface NavButtonProps {
  active: boolean;
  to: string;
  icon: React.ElementType;
  label: string;
  isAmber?: boolean;
}

function NavButton({ active, to, icon: Icon, label, isAmber }: NavButtonProps) {
  const activeBg = isAmber ? 'from-amber-500/20' : 'from-cyan-500/20';
  const activeText = isAmber ? 'text-amber-400' : 'text-cyan-400';
  const activeShadow = isAmber ? 'shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'shadow-[0_0_15px_rgba(34,211,238,0.3)]';
  const lineShadow = isAmber ? 'shadow-[0_0_10px_#f59e0b]' : 'shadow-[0_0_10px_#22d3ee]';
  const lineBg = isAmber ? 'bg-amber-400' : 'bg-cyan-400';
  const hoverText = isAmber ? 'group-hover:text-amber-400/80' : 'group-hover:text-cyan-400/80';
  const hoverShadow = isAmber ? 'group-hover:shadow-[0_0_10px_rgba(245,158,11,0.1)]' : 'group-hover:shadow-[0_0_10px_rgba(34,211,238,0.1)]';
  const iconBg = isAmber ? 'bg-amber-500/20' : 'bg-cyan-500/20';
  const iconBorder = isAmber ? 'border-amber-500/30' : 'border-cyan-500/30';

  return (
    <Link
      to={to}
      className={`group flex items-center gap-4 px-4 py-2.5 rounded-xl transition-all duration-300 text-left relative overflow-hidden ${
        active 
          ? `bg-gradient-to-r ${activeBg} to-transparent border border-border` 
          : 'text-on-surface-variant hover:text-on-surface hover:bg-on-surface/[0.03] hover:translate-x-1 border border-transparent'
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

      <span className={`text-[10px] font-black uppercase tracking-[0.15em] transition-colors duration-300 ${
        active ? 'text-on-surface drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]' : ''
      }`}>
        {label}
      </span>
    </Link>
  );
}

function SectionHeader({ title, isAmber }: { title: string; isAmber?: boolean }) {
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

function Sidebar() {
  const location = useLocation();
  const currentPath = location.pathname;
  const { logout, isAdmin, can } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <nav className="fixed left-0 top-0 hidden h-screen w-64 flex-col bg-surface-container-lowest/95 backdrop-blur-2xl md:flex border-r border-border shadow-[4px_0_24px_rgba(0,0,0,0.3)] z-50">
      
      {/* Brand Header */}
      <div className="px-6 py-8 relative mt-4">
        {/* Subtle glow behind logo */}
        <div className="absolute top-10 left-10 w-20 h-20 bg-cyan-500/20 rounded-full blur-[40px] pointer-events-none" />
        
        <div className="flex items-center gap-4 mb-2 relative z-10">
          <div className="relative group cursor-pointer" onClick={() => navigate('/app')}>
            <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200" />
            <div className="relative p-1.5 rounded-xl bg-surface-container-low border border-cyan-500/30 flex items-center justify-center">
              <img src="/logo.png" alt="SIG-DESK Logo" className="w-8 h-8 object-contain drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]" />
            </div>
          </div>
          <div>
            <div className="text-sm font-black tracking-[0.25em] text-on-surface uppercase drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">SIG-DESK</div>
            <div className="text-[9px] font-mono font-bold tracking-[0.3em] text-cyan-500/80 uppercase mt-0.5">AGENT WORKSPACE</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 px-4 overflow-y-auto overflow-x-hidden pb-8">
        <div className="flex flex-col gap-1 py-2">
        
          <div className="mb-2">
            <SectionHeader title="Service Desk (ITSM)" />
            <NavButton
              active={currentPath === '/app'}
              to="/app"
              icon={LayoutDashboard}
              label="Dashboard"
            />
            {can(PERMISSIONS.ticketsView) && (
              <NavButton
                active={currentPath.startsWith('/app/tickets')}
                to="/app/tickets"
                icon={TicketIcon}
                label="Tickets & Issues"
              />
            )}
            <NavButton
              active={currentPath.startsWith('/app/reports')}
              to="/app/reports"
              icon={BarChart3}
              label="Reports"
            />
          </div>

          <div className="mb-2">
            <SectionHeader title="Change & Config (ITIL)" />
            {can(PERMISSIONS.changesView) && (
              <NavButton
                active={currentPath.startsWith('/app/changes')}
                to="/app/changes"
                icon={Network}
                label="Change Mgmt"
              />
            )}
            {can(PERMISSIONS.problemsView) && (
              <NavButton
                active={currentPath.startsWith('/app/problems')}
                to="/app/problems"
                icon={SearchCode}
                label="Problem Mgmt"
              />
            )}
          </div>

          <div className="mb-2">
            <SectionHeader title="Self Service" />
            <NavButton
              active={currentPath.startsWith('/app/catalog')}
              to="/app/catalog"
              icon={FolderKanban}
              label="Service Catalog"
            />
            <NavButton
              active={currentPath.startsWith('/app/knowledge')}
              to="/app/knowledge"
              icon={ShieldCheck}
              label="Knowledge Base"
            />
          </div>

          {isAdmin && (
            <div className="mb-2">
              <SectionHeader title="Administration" />
              <NavButton
                active={currentPath.startsWith('/app/admin/users')}
                to="/app/admin/users"
                icon={Users}
                label="Users & Roles"
              />
              <NavButton
                active={currentPath.startsWith('/app/admin/catalog-builder')}
                to="/app/admin/catalog-builder"
                icon={FolderKanban}
                label="Catalog Builder"
              />
              <NavButton
                active={currentPath.startsWith('/app/automations')}
                to="/app/automations"
                icon={Workflow}
                label="Automations"
              />
              <NavButton
                active={currentPath.startsWith('/app/settings/sla')}
                to="/app/settings/sla"
                icon={Timer}
                label="SLA Policies"
              />
              <NavButton
                active={currentPath.startsWith('/app/settings/chatops')}
                to="/app/settings/chatops"
                icon={MessageSquare}
                label="ChatOps"
              />
              <NavButton
                active={currentPath.startsWith('/app/settings/api-keys')}
                to="/app/settings/api-keys"
                icon={Settings}
                label="API Keys"
              />
            </div>
          )}

        </div>
      </div>

      {/* Footer Info */}
      <div className="mt-auto p-4 bg-gradient-to-b from-transparent to-surface-container-low/80 border-t border-border">
        <button
          onClick={handleLogout}
          className="group relative flex items-center justify-between px-6 py-3 w-full rounded-xl overflow-hidden bg-on-surface/5 border border-border transition-all duration-300 hover:border-red-500/30 hover:bg-red-500/10 hover:shadow-[0_0_20px_rgba(239,68,68,0.15)] hover:-translate-y-0.5"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-red-500/0 via-red-500/0 to-red-500/0 group-hover:from-red-500/10 group-hover:via-transparent transition-all duration-500" />
          
          <div className="flex items-center gap-3 relative z-10">
            <div className="w-8 h-8 rounded-lg bg-surface-container-low border border-border flex items-center justify-center group-hover:border-red-500/30 group-hover:bg-red-500/20 transition-colors">
              <LogOut size={14} className="text-on-surface-variant group-hover:text-red-400 transition-colors" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant group-hover:text-red-400 transition-colors">
              Sign out
            </span>
          </div>
        </button>
      </div>
    </nav>
  );
}

const mockNotifications = [
  { icon: AlertTriangle, iconClass: 'bg-red-500/10 border-red-500/20 text-red-400', title: 'SLA breach warning', desc: 'INC-202601 response SLA at 75% consumed.', time: '5 min ago', unread: true },
  { icon: UserCheck, iconClass: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400', title: 'Ticket assigned to you', desc: 'INC-202605 · VPN disconnects every 15 minutes.', time: '32 min ago', unread: true },
  { icon: CalendarClock, iconClass: 'bg-amber-500/10 border-amber-500/20 text-amber-400', title: 'CAB approval pending', desc: 'CHG-002 awaits your vote before Friday\'s window.', time: '1 hour ago', unread: true },
  { icon: MessageSquare, iconClass: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400', title: 'Laura Kim mentioned you', desc: '"@JD can you confirm the switch port logs?"', time: '2 hours ago', unread: false },
  { icon: CheckCircle2, iconClass: 'bg-surface-container border-border/50 text-on-surface-variant', title: 'Ticket resolved', desc: 'INC-202610 · Access control panel back online.', time: 'Yesterday', unread: false },
];

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
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex overflow-hidden">
      <Sidebar />

      {/* Main Content */}
      <main className="flex-1 flex flex-col bg-surface overflow-hidden md:ml-64 relative">
        <header className="h-20 border-b border-border/40 bg-surface-container-lowest/50 backdrop-blur-xl flex items-center px-8 justify-between sticky top-0 z-10">
          <div className="flex items-center gap-4 w-full max-w-xl">
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
               <Plus className="w-4 h-4" />
               New Ticket
            </Link>

            {/* Notifications bell */}
            <div className="relative">
              <button
                onClick={() => setNotificationsOpen(o => !o)}
                className="relative w-10 h-10 rounded-full bg-surface-container-low border border-border/50 flex items-center justify-center text-on-surface-variant hover:text-cyan-400 hover:border-cyan-500/30 transition-colors"
              >
                <Bell className="w-4 h-4" />
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-[#ffffff] text-[10px] font-black flex items-center justify-center border-2 border-surface shadow-[0_0_10px_rgba(239,68,68,0.5)]">
                  3
                </span>
              </button>

              {notificationsOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setNotificationsOpen(false)} />
                  <div className="absolute right-0 top-12 w-96 bg-surface-container-lowest/95 backdrop-blur-2xl border border-border/50 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden z-50">
                    <div className="flex items-center justify-between px-5 py-3 border-b border-border/40">
                      <h4 className="text-xs font-black uppercase tracking-[0.15em] text-on-surface">Notifications</h4>
                      <button className="text-[10px] font-bold text-cyan-400 hover:text-cyan-300 transition-colors">Mark all as read</button>
                    </div>
                    <div className="max-h-96 overflow-y-auto divide-y divide-border/20">
                      {mockNotifications.map((n, i) => (
                        <div key={i} className="flex items-start gap-3 px-5 py-4 hover:bg-on-surface/[0.04] cursor-pointer transition-colors">
                          <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${n.iconClass}`}>
                            <n.icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-on-surface leading-snug">{n.title}</p>
                            <p className="text-xs text-on-surface-variant truncate mt-0.5">{n.desc}</p>
                            <p className="text-[10px] font-mono text-on-surface-variant mt-1">{n.time}</p>
                          </div>
                          {n.unread && <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee] shrink-0 mt-1.5" />}
                        </div>
                      ))}
                    </div>
                    <button className="w-full py-3 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant hover:text-cyan-400 border-t border-border/40 transition-colors">
                      View all notifications
                    </button>
                  </div>
                </>
              )}
            </div>

            <UserProfilePopover />
          </div>
        </header>
        <div className="flex-1 overflow-y-auto bg-surface relative z-0">
          {children}
        </div>
      </main>
    </div>
  );
}
