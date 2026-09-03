import { useRef } from 'react';
import { cn } from './cn';

export interface TabItem {
  key: string;
  label: string;
  count?: number;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (key: string) => void;
  'aria-label': string;
}

/** Roving-tabindex tab list per the WAI-ARIA Tabs pattern: only the active
 *  tab is in the Tab order; Arrow Left/Right move between tabs and Home/End
 *  jump to the ends, matching what screen reader users expect from a
 *  `role="tablist"`. Each `TabItem.key` is expected to match the `id` of
 *  the panel it controls via `aria-controls`/`aria-labelledby` at the call
 *  site — this component only renders the tab strip. */
export function Tabs({ items, value, onChange, 'aria-label': ariaLabel }: TabsProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKeyDown(event: React.KeyboardEvent, index: number) {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % items.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + items.length) % items.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = items.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    onChange(items[nextIndex].key);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <div role="tablist" aria-label={ariaLabel} className="flex items-center gap-1 border-b border-border/60 overflow-x-auto">
      {items.map((item, index) => {
        const selected = item.key === value;
        return (
          <button
            key={item.key}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            role="tab"
            id={`tab-${item.key}`}
            aria-selected={selected}
            aria-controls={`panel-${item.key}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.key)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={cn(
              'relative shrink-0 whitespace-nowrap px-4 py-2.5 text-sm font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset rounded-t-lg',
              selected ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface',
            )}
          >
            {item.label}
            {typeof item.count === 'number' && (
              <span className={cn('ml-1.5 text-xs', selected ? 'text-primary/70' : 'text-on-surface-variant/70')}>
                {item.count}
              </span>
            )}
            {selected && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
