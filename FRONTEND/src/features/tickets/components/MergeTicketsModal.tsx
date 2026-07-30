import { useState } from 'react';
import { Merge, X, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTickets, useMergeTickets } from '../hooks';
import { useAuth } from '@/features/auth/useAuth';

interface MergeTicketsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTickets: string[]; // e.g., ['INC-202610', 'INC-202611']
}

export function MergeTicketsModal({ isOpen, onClose, selectedTickets }: MergeTicketsModalProps) {
  const [selectedPrimary, setSelectedPrimary] = useState<string>('');
  const { displayName: currentUserName } = useAuth();
  const { data: ticketPage } = useTickets();
  const tickets = ticketPage?.items ?? [];
  const titleFor = (id: string) => tickets.find((t) => t.id === id)?.title ?? 'Unknown ticket';
  const mergeTickets = useMergeTickets();

  const primaryTicket = selectedTickets.includes(selectedPrimary)
    ? selectedPrimary
    : selectedTickets[0] || '';

  function confirmMerge() {
    const mergedIds = selectedTickets.filter((id) => id !== primaryTicket);
    if (!primaryTicket || mergedIds.length === 0) return;
    mergeTickets.mutate(
      { primaryId: primaryTicket, mergedIds, actorName: currentUserName },
      { onSuccess: () => onClose() },
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-surface-container-lowest border border-border/50 rounded-3xl shadow-2xl z-[101] overflow-hidden flex flex-col max-h-[85vh]"
          >
            <div className="flex items-center justify-between px-6 py-5 border-b border-border/40 bg-surface-container-low/50">
               <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                    <Merge className="w-5 h-5 text-cyan-400" />
                 </div>
                 <div>
                   <h2 className="text-lg font-black text-on-surface">Merge Tickets</h2>
                   <p className="text-xs text-on-surface-variant">Combine {selectedTickets.length} tickets into one primary ticket</p>
                 </div>
               </div>
               <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-on-surface/5 hover:text-on-surface transition-colors">
                  <X className="w-5 h-5" />
               </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-6 bg-surface">
               
               <div className="space-y-4">
                  <h3 className="text-sm font-bold text-on-surface uppercase tracking-wider">Select Primary Ticket</h3>
                  <p className="text-sm text-on-surface-variant mb-4">The selected ticket will be kept open. All other selected tickets will be closed and their notes merged into the primary one.</p>
                  
                  <div className="space-y-2">
                     {selectedTickets.map((id) => (
                       <label 
                         key={id}
                         className={`flex items-start gap-4 p-4 rounded-2xl border cursor-pointer transition-all ${
                           primaryTicket === id 
                             ? 'bg-cyan-500/10 border-cyan-500/50 shadow-[0_0_20px_rgba(34,211,238,0.1)]' 
                             : 'bg-surface-container-low border-border/40 hover:border-cyan-500/30 hover:bg-surface-container/50'
                         }`}
                       >
                         <div className="mt-0.5">
                           <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                             primaryTicket === id ? 'border-cyan-400 bg-cyan-400' : 'border-slate-500'
                           }`}>
                              {primaryTicket === id && <CheckCircle2 className="w-3 h-3 text-slate-950" />}
                           </div>
                           <input 
                             type="radio" 
                             name="primaryTicket" 
                             value={id} 
                             checked={primaryTicket === id}
                             onChange={(e) => setSelectedPrimary(e.target.value)}
                             className="hidden"
                           />
                         </div>
                         <div className="flex-1">
                            <span className="text-xs font-mono text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded">{id}</span>
                            <p className="text-sm font-bold text-on-surface mt-1">
                              {titleFor(id)}
                            </p>
                         </div>
                       </label>
                     ))}
                  </div>
               </div>
               
               <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4">
                  <p className="text-sm text-amber-400 font-medium">
                    <span className="font-bold">Note:</span> This action cannot be undone. The other selected tickets will be marked resolved and linked to the primary ticket.
                  </p>
               </div>
               {mergeTickets.isError && (
                 <p className="text-sm text-red-400">{mergeTickets.error.message}</p>
               )}
            </div>

            <div className="px-6 py-4 border-t border-border/40 bg-surface-container-lowest/80 backdrop-blur flex justify-end gap-3">
               <button
                 onClick={onClose}
                 className="px-5 py-2.5 rounded-xl text-sm font-bold text-on-surface-variant hover:bg-on-surface/5 transition-colors"
               >
                 Cancel
               </button>
               <button
                 onClick={confirmMerge}
                 disabled={mergeTickets.isPending || selectedTickets.length < 2}
                 className="bg-cyan-500 text-slate-950 px-6 py-2.5 rounded-xl text-sm font-bold shadow-[0_0_15px_rgba(34,211,238,0.3)] hover:shadow-[0_0_25px_rgba(34,211,238,0.5)] transition-all disabled:opacity-50"
               >
                 {mergeTickets.isPending ? 'Merging…' : 'Merge Tickets'}
               </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
