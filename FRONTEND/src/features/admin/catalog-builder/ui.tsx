import type { ReactNode } from 'react';
import { Eye } from 'lucide-react';

export function SectionHeading({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <h2 className="text-xl font-black text-on-surface">{title}</h2>
        <p className="text-sm text-on-surface-variant mt-1">{description}</p>
      </div>
    </div>
  );
}

export function FriendlyField({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-black uppercase tracking-wider text-on-surface-variant mb-2">
        {label}
      </span>
      {children}
      {help && <span className="block text-[11px] text-on-surface-variant mt-1.5">{help}</span>}
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-center gap-2 text-sm text-on-surface ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`w-9 h-5 rounded-full p-0.5 transition-colors ${
          checked ? 'bg-primary' : 'bg-surface-container-highest'
        }`}
      >
        <span
          className={`block w-4 h-4 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
      {label}
    </label>
  );
}

export function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`w-9 h-9 rounded-lg flex items-center justify-center disabled:opacity-25 ${
        danger
          ? 'text-red-400 hover:bg-red-500/10'
          : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
      }`}
    >
      {children}
    </button>
  );
}

export function EmptyMessage({ text }: { text: string }) {
  return (
    <div className="mt-6 border border-dashed border-border/60 rounded-2xl p-8 text-center">
      <Eye className="w-7 h-7 text-on-surface-variant mx-auto mb-3 opacity-60" />
      <p className="text-sm text-on-surface-variant">{text}</p>
    </div>
  );
}
