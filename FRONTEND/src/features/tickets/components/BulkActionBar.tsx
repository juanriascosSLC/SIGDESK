import { UserPlus, Merge, CheckCircle2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface BulkActionBarProps {
  selectedCount: number;
  onClear: () => void;
  onAssign: () => void;
  onMerge: () => void;
  onResolve: () => void;
}

export function BulkActionBar({ selectedCount, onClear, onAssign, onMerge, onResolve }: BulkActionBarProps) {
  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center bg-surface-container-high/90 backdrop-blur-xl border border-border/50 rounded-2xl p-2 pr-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
        >
          <div className="flex items-center gap-3 px-4 border-r border-border/50">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-cyan-500 text-slate-950 font-black text-xs">
              {selectedCount}
            </span>
            <span className="text-sm font-bold text-on-surface">tickets selected</span>
          </div>

          <div className="flex items-center gap-2 pl-4">
            <button 
              onClick={onAssign}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold text-on-surface-variant hover:text-cyan-400 hover:bg-on-surface/5 transition-colors"
            >
              <UserPlus className="w-4 h-4" /> Assign
            </button>
            <button 
              onClick={onMerge}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold text-on-surface-variant hover:text-cyan-400 hover:bg-on-surface/5 transition-colors"
            >
              <Merge className="w-4 h-4" /> Merge
            </button>
            <button 
              onClick={onResolve}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold text-on-surface-variant hover:text-emerald-400 hover:bg-on-surface/5 transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" /> Resolve
            </button>
          </div>

          <div className="pl-4 ml-2 border-l border-border/50">
            <button 
              onClick={onClear}
              className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-on-surface/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
