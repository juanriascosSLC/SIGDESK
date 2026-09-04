import { Link } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import {
  NAV_SECTION_LABELS,
  findActiveNavItem,
  groupBySection,
  type NavItem,
} from '@/config/navigation';
import { cn } from '@/components/ui/cn';
import { Tooltip } from '@/components/ui/Tooltip';

/**
 * Rendering shared by the desktop sidebar and the tablet/mobile drawers —
 * both read the exact same permission-filtered `NavItem[]` (see
 * config/navigation.ts) and the exact same `findActiveNavItem` result, so
 * "active" and "visible" can never drift between surfaces. Only the
 * container differs: a fixed rail here, a `Drawer` panel there.
 */

export interface NavButtonProps {
  item: NavItem;
  active: boolean;
  /** Icon-only rail mode (desktop collapsed sidebar). Drawer/More never
   *  pass this — there's always room for the label there. */
  collapsed?: boolean;
  onNavigate?: () => void;
}

export function NavButton({ item, active, collapsed, onNavigate }: NavButtonProps) {
  const Icon = item.icon;
  const link = (
    <Link
      to={item.route}
      onClick={onNavigate}
      aria-label={collapsed ? item.label : undefined}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex w-full items-center rounded-xl text-left relative overflow-hidden transition-all duration-200',
        // 44px minimum touch target on every surface, not just mobile —
        // a drawer/More item is tapped exactly as often as a bottom-nav one.
        // `w-full` is explicit (not left to the wrapper Tooltip renders
        // when collapsed) so the click target's width never depends on
        // exactly how that wrapper's own flex/box layout resolves.
        'min-h-[44px]',
        collapsed ? 'justify-center px-0' : 'gap-3 px-4',
        active
          ? 'bg-gradient-to-r from-primary/15 to-transparent border border-border text-on-surface'
          : 'text-on-surface-variant hover:text-on-surface hover:bg-on-surface/[0.04] border border-transparent',
      )}
    >
      {active && <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary" aria-hidden="true" />}
      <span
        className={cn(
          'flex items-center justify-center w-8 h-8 rounded-lg shrink-0 transition-colors duration-200',
          active
            ? 'bg-primary/15 text-primary border border-primary/30'
            : 'bg-surface-container-high/50 text-on-surface-variant border border-border group-hover:bg-surface-container-high',
        )}
      >
        <Icon size={16} strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
      </span>
      {!collapsed && <span className="whitespace-nowrap text-sm font-semibold">{item.label}</span>}
    </Link>
  );
  // Collapsed rail: the label doesn't render at all, so the high-contrast
  // Tooltip (not the native `title`, which the audit flagged as
  // insufficient) is the only visual cue — shown on hover AND keyboard
  // focus via the shared Tooltip component, never a second implementation.
  return collapsed ? (
    <Tooltip content={item.label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  );
}

export function SectionHeading({ title, collapsed }: { title: string; collapsed?: boolean }) {
  if (collapsed) {
    return (
      <div className="px-2 py-1 mb-2 mt-4 first:mt-0" role="presentation">
        <span className="sr-only">{title}</span>
        <div aria-hidden="true" className="h-px w-full bg-border" />
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 px-2 py-1 mb-2 mt-4 first:mt-0">
      <p className="text-xs font-bold text-on-surface-variant">{title}</p>
      <div aria-hidden="true" className="h-px flex-1 bg-border/60" />
    </div>
  );
}

/**
 * Renders a full grouped nav list (sidebar in its expanded/collapsed form,
 * or drawer/More content) from a permission-filtered item list. `pathname`
 * decides the single active item via `findActiveNavItem` — computed once
 * and passed down, so a sidebar and a simultaneously-open More sheet always
 * agree on what's active.
 */
export function NavSectionList({
  items,
  pathname,
  collapsed = false,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const activeItem = findActiveNavItem(items, pathname);
  const groups = groupBySection(items);
  return (
    <div className="flex flex-col gap-1">
      {groups.map((group) => (
        <div key={group.section} className="mb-2">
          <SectionHeading title={NAV_SECTION_LABELS[group.section]} collapsed={collapsed} />
          <div className="flex flex-col gap-1">
            {group.items.map((item) => (
              <NavButton
                key={item.key}
                item={item}
                active={activeItem?.key === item.key}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Mobile bottom bar — up to 4 primary destinations plus a "More" button
 * for everything else. Fixed to the viewport bottom, safe-area aware, and
 * every target is >= 44x44 (WCAG 2.5.5) regardless of the compact label.
 *
 * The "More" button only renders when there's something to open — a
 * persona whose entire permitted list fits in the 4 primary slots (e.g. an
 * IT agent with just Dashboard + Tickets) gets no button and no empty
 * drawer, rather than an affordance that opens onto nothing.
 */
export function BottomNav({
  items,
  pathname,
  onOpenMore,
  moreActive,
  moreOpen,
  moreItemCount,
  moreDrawerId,
}: {
  items: NavItem[];
  pathname: string;
  onOpenMore: () => void;
  /** True when the active destination isn't one of the pinned items —
   *  "More" itself should read as the current section in that case. */
  moreActive: boolean;
  moreOpen: boolean;
  /** How many items the "More" drawer would show — 0 hides the button. */
  moreItemCount: number;
  /** Must match the `id` passed to the Drawer this button controls. */
  moreDrawerId: string;
}) {
  const activeItem = findActiveNavItem(items, pathname);
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface-container-lowest/95 backdrop-blur-2xl sm:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = !moreActive && activeItem?.key === item.key;
        return (
          <Link
            key={item.key}
            to={item.route}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 min-h-[56px] transition-colors',
              active ? 'text-primary' : 'text-on-surface-variant',
            )}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            <span className="text-[11px] font-semibold leading-none">{item.label}</span>
          </Link>
        );
      })}
      {moreItemCount > 0 && (
        <button
          type="button"
          onClick={onOpenMore}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          aria-controls={moreDrawerId}
          className={cn(
            'flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 min-h-[56px] transition-colors',
            moreActive ? 'text-primary' : 'text-on-surface-variant',
          )}
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
          <span className="text-[11px] font-semibold leading-none">More</span>
        </button>
      )}
    </nav>
  );
}
