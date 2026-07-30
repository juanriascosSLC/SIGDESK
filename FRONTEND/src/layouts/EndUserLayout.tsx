import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FolderKanban, BookOpen, Ticket as TicketIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import UserProfilePopover from '../components/layout/UserProfilePopover';

function NavItem({ to, icon: Icon, label, active }: { to: string, icon: LucideIcon, label: string, active: boolean }) {
  return (
    <Link 
      to={to} 
      className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 font-bold text-sm ${
        active 
          ? 'bg-cyan-500/20 text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.2)] border border-cyan-500/30' 
          : 'text-on-surface-variant hover:text-on-surface hover:bg-on-surface/5 border border-transparent'
      }`}
    >
      <Icon size={16} />
      {label}
    </Link>
  );
}

export default function EndUserLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const currentPath = location.pathname;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col">
      {/* Top Navigation */}
      <header className="h-16 border-b border-border/40 bg-surface-container-lowest/80 backdrop-blur-xl flex items-center px-8 justify-between sticky top-0 z-50">
        
        <div className="flex items-center gap-12">
          {/* Brand */}
          <Link to="/portal" className="flex items-center gap-3 group">
            <div className="relative p-1.5 rounded-lg bg-surface-container-low border border-cyan-500/30 flex items-center justify-center">
              <img src="/logo.png" alt="SIG-DESK Logo" className="w-5 h-5 object-contain drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]" />
            </div>
            <div>
              <div className="text-sm font-black tracking-[0.25em] text-on-surface uppercase">SIG-DESK</div>
            </div>
          </Link>

          {/* Nav Links */}
          <nav className="flex items-center gap-2">
            <NavItem active={currentPath === '/portal'} to="/portal" icon={FolderKanban} label="Service Catalog" />
            <NavItem active={currentPath.startsWith('/portal/knowledge')} to="/portal/knowledge" icon={BookOpen} label="Knowledge Base" />
            <NavItem active={currentPath.startsWith('/portal/tickets')} to="/portal/tickets" icon={TicketIcon} label="My Tickets" />
          </nav>
        </div>

        <div className="flex items-center gap-4">
           <UserProfilePopover />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 bg-surface">
        {children}
      </main>
      
      {/* Footer */}
      <footer className="py-6 text-center border-t border-border/20 bg-surface-container-lowest text-xs text-on-surface-variant font-mono">
        © 2026 SIG Systems, Inc. · IT Service Desk
      </footer>
    </div>
  );
}
