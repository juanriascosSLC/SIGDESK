import React from 'react';
import { SearchX, Inbox, FileQuestion } from 'lucide-react';

interface EmptyStateProps {
  type?: 'search' | 'inbox' | 'general';
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ type = 'general', title, description, action }: EmptyStateProps) {
  const Icon = type === 'search' ? SearchX : type === 'inbox' ? Inbox : FileQuestion;
  
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center h-full min-h-[300px]">
      <div className="w-20 h-20 bg-surface-container-high rounded-3xl border border-border/50 flex items-center justify-center mb-6 shadow-inner relative group">
         <div className="absolute inset-0 bg-cyan-500/5 group-hover:bg-cyan-500/10 transition-colors rounded-3xl" />
         <Icon className="w-10 h-10 text-on-surface-variant group-hover:text-cyan-400 transition-colors drop-shadow-md" />
      </div>
      <h3 className="text-xl font-black text-on-surface mb-2 tracking-wide">{title}</h3>
      <p className="text-sm text-on-surface-variant max-w-sm mx-auto mb-6 leading-relaxed">
        {description}
      </p>
      {action && <div>{action}</div>}
    </div>
  );
}
