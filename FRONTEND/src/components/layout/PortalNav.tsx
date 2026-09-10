import { Link } from 'react-router-dom';
import { PORTAL_NAV_ITEMS } from '@/config/portalNavigation';
import { findActiveNavItem } from '@/config/navigation';
import { cn } from '@/components/ui/cn';

/** Desktop/tablet top nav — the same three items EndUserLayout always
 *  rendered, now read from PORTAL_NAV_ITEMS instead of duplicated here. */
export function PortalTopNav({ pathname }: { pathname: string }) {
  const active = findActiveNavItem(PORTAL_NAV_ITEMS, pathname);
  return (
    <nav className="flex items-center gap-2" aria-label="Primary">
      {PORTAL_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = active?.key === item.key;
        return (
          <Link
            key={item.key}
            to={item.route}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex min-h-[44px] items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 font-bold text-sm',
              isActive
                ? 'bg-primary/15 text-primary border border-primary/30 dark:bg-cyan-500/20 dark:text-cyan-400 dark:shadow-[0_0_15px_rgba(34,211,238,0.2)] dark:border-cyan-500/30'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-on-surface/5 border border-transparent',
            )}
          >
            <Icon size={16} aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Mobile/tablet bottom bar (< md — see EndUserLayout for why the switch
 *  to the top nav waits for 768px instead of 640px). Always exactly the 3
 *  portal destinations —
 *  no permission filtering (every authenticated user gets all three) and
 *  no "More" (3 fits the primary-slot budget with room to spare). */
export function PortalBottomNav({ pathname }: { pathname: string }) {
  const active = findActiveNavItem(PORTAL_NAV_ITEMS, pathname);
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface-container-lowest/95 backdrop-blur-2xl md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {PORTAL_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = active?.key === item.key;
        return (
          <Link
            key={item.key}
            to={item.route}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 min-h-[56px] transition-colors',
              isActive ? 'text-primary' : 'text-on-surface-variant',
            )}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            <span className="text-[11px] font-semibold leading-none">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
