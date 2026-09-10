import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import UserProfilePopover from '../components/layout/UserProfilePopover';
import RagChatbot from '../features/assistant/RagChatbot';
import { PortalTopNav, PortalBottomNav } from '../components/layout/PortalNav';

export default function EndUserLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const pathname = location.pathname;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col">
      {/* Top bar — brand and profile control show at every width. The
          inline nav links (desktop/tablet only) and the mobile bottom bar
          below both read from the same PORTAL_NAV_ITEMS config, so a label
          or route never has to be kept in sync between two places. */}
      <header className="h-16 border-b border-border/40 bg-surface-container-lowest/80 backdrop-blur-xl flex items-center px-4 sm:px-8 justify-between sticky top-0 z-50 gap-3">
        <div className="flex items-center gap-4 sm:gap-12 min-w-0">
          <Link to="/portal" className="flex items-center gap-3 group shrink-0" aria-label="SIG-DESK Home">
            <div className="relative p-1.5 rounded-lg bg-surface-container-low border border-cyan-500/30 flex items-center justify-center">
              <img src="/logo.png" alt="" className="w-5 h-5 object-contain drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]" />
            </div>
            <div className="hidden md:block">
              <div className="text-sm font-black tracking-[0.25em] text-on-surface uppercase">SIG-DESK</div>
            </div>
          </Link>

          {/* >= md only. The inline row (brand + 3 full labels + profile,
              with their gaps/padding) needs real room — 640-767px isn't
              enough of it (measured: ~688px minimum for the row as built),
              so the switch to the top nav waits for `md` (768px) instead
              of `sm` (640px). Below `md`, the bottom bar covers the same
              three destinations with room for a readable label each. */}
          <div className="hidden md:block">
            <PortalTopNav pathname={pathname} />
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <UserProfilePopover />
        </div>
      </header>

      {/* Main Content — bottom padding clears the mobile/tablet bottom bar
          (+ safe area) below `md`; no bottom bar exists at `md` and up, so
          no padding is needed there either. */}
      <main className="flex-1 bg-surface pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </main>

      {/* Footer — hidden below `md` so it doesn't sit between the content
          and the fixed bottom bar, competing for the same strip. */}
      <footer className="hidden md:block py-6 text-center border-t border-border/20 bg-surface-container-lowest text-xs text-on-surface-variant font-mono">
        © 2026 SIG Systems, Inc. · IT Service Desk
      </footer>

      <PortalBottomNav pathname={pathname} />
      <RagChatbot />
    </div>
  );
}
