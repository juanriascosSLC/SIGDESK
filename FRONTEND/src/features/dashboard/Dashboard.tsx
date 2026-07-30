import { Ticket as TicketIcon, AlertTriangle, CalendarClock, Star } from 'lucide-react';

function Gauge({ value, max, label, colorClass, highlightClass }: { value: number, max: number, label: string, colorClass: string, highlightClass: string }) {
  const percentage = Math.min((value / max) * 100, 100);
  const rotation = (percentage / 100) * 180 - 90;
  
  return (
    <div className="flex flex-col items-center justify-center relative pt-4">
      <div className="relative w-48 h-24 overflow-hidden">
        <div className="absolute top-0 left-0 w-48 h-48 rounded-full border-[20px] border-surface-container" />
        <div 
          className={`absolute top-0 left-0 w-48 h-48 rounded-full border-[20px] ${colorClass} border-b-transparent border-r-transparent transition-transform duration-1000 ease-out`}
          style={{ transform: `rotate(${rotation}deg)` }}
        />
        <div 
          className="absolute bottom-0 left-1/2 w-1 h-16 bg-on-surface-variant origin-bottom transition-transform duration-1000 ease-out z-10 rounded-full"
          style={{ transform: `translateX(-50%) rotate(${rotation}deg)` }}
        />
        <div className="absolute bottom-[-6px] left-1/2 w-4 h-4 bg-surface rounded-full border-4 border-on-surface-variant -translate-x-1/2 z-20" />
      </div>
      <div className="mt-4 text-center">
        <p className={`text-3xl font-black ${highlightClass}`}>{value}</p>
        <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">{label}</p>
      </div>
    </div>
  );
}

export function Dashboard() {
  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between mb-4">
         <h1 className="text-2xl font-black text-on-surface tracking-wide">Helpdesk Dashboard</h1>
         <div className="flex gap-2">
            <select className="bg-surface-container border border-border/50 text-sm rounded-lg px-4 py-2 text-on-surface outline-none focus:border-cyan-500/50">
              <option>All Sites</option>
              <option>Site #401</option>
            </select>
            <select className="bg-surface-container border border-border/50 text-sm rounded-lg px-4 py-2 text-on-surface outline-none focus:border-cyan-500/50">
              <option>Support Groups</option>
              <option>Hardware Team</option>
            </select>
         </div>
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-surface-container-low border border-border/40 rounded-3xl p-6 flex items-center gap-4 hover:border-cyan-500/30 transition-colors">
          <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
            <TicketIcon className="w-6 h-6 text-cyan-500" />
          </div>
          <div>
            <p className="text-3xl font-black text-on-surface">728</p>
            <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Open Requests</p>
          </div>
        </div>
        <div className="bg-surface-container-low border border-border/40 rounded-3xl p-6 flex items-center gap-4 hover:border-red-500/30 transition-colors">
          <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <p className="text-3xl font-black text-red-500">396</p>
            <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Overdue</p>
          </div>
        </div>
        <div className="bg-surface-container-low border border-border/40 rounded-3xl p-6 flex items-center gap-4 hover:border-amber-500/30 transition-colors">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <CalendarClock className="w-6 h-6 text-amber-500" />
          </div>
          <div>
            <p className="text-3xl font-black text-amber-500">42</p>
            <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Due Today</p>
          </div>
        </div>
        <div className="bg-surface-container-low border border-border/40 rounded-3xl p-6 flex items-center gap-4 hover:border-emerald-500/30 transition-colors">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Star className="w-6 h-6 text-emerald-500" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-black text-emerald-500">4.6</p>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} className={`w-3 h-3 ${s <= 4 ? 'text-amber-500 fill-amber-500' : 'text-on-surface-variant'}`} />
                ))}
              </div>
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Avg CSAT</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface-container-low border border-border/40 rounded-3xl p-6">
          <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-6">Requests by Category</h3>
          <table className="w-full text-sm text-left">
            <thead className="text-on-surface-variant border-b border-border/40">
              <tr>
                <th className="pb-3 font-medium">Category</th>
                <th className="pb-3 font-medium text-center">Onhold</th>
                <th className="pb-3 font-medium text-center">Open</th>
                <th className="pb-3 font-medium text-center">Overdue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              <tr className="hover:bg-surface-container/50 transition-colors">
                <td className="py-3 text-on-surface">Desktop/Hardware</td>
                <td className="py-3 text-center text-on-surface-variant">2</td>
                <td className="py-3 text-center text-cyan-500 font-bold">1</td>
                <td className="py-3 text-center text-red-500 font-bold">5</td>
              </tr>
              <tr className="hover:bg-surface-container/50 transition-colors">
                <td className="py-3 text-on-surface">Software</td>
                <td className="py-3 text-center text-on-surface-variant">1</td>
                <td className="py-3 text-center text-cyan-500 font-bold">8</td>
                <td className="py-3 text-center text-on-surface-variant">0</td>
              </tr>
              <tr className="hover:bg-surface-container/50 transition-colors">
                <td className="py-3 text-on-surface">Others</td>
                <td className="py-3 text-center text-on-surface-variant">2</td>
                <td className="py-3 text-center text-cyan-500 font-bold">15</td>
                <td className="py-3 text-center text-red-500 font-bold">37</td>
              </tr>
              <tr className="hover:bg-surface-container/50 transition-colors">
                <td className="py-3 text-on-surface">Unassigned</td>
                <td className="py-3 text-center text-on-surface-variant">104</td>
                <td className="py-3 text-center text-cyan-500 font-bold">704</td>
                <td className="py-3 text-center text-red-500 font-bold">354</td>
              </tr>
            </tbody>
            <tfoot className="border-t border-border/40 font-bold">
              <tr>
                <td className="py-3 text-on-surface">Total</td>
                <td className="py-3 text-center text-on-surface">109</td>
                <td className="py-3 text-center text-cyan-500">728</td>
                <td className="py-3 text-center text-red-500">396</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="bg-surface-container-low border border-border/40 rounded-3xl p-6 flex flex-col items-center justify-center">
            <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-2 self-start">Unassigned / Open</h3>
            <Gauge value={704} max={1000} label="Unassigned" colorClass="border-amber-500" highlightClass="text-amber-500" />
          </div>
          <div className="bg-surface-container-low border border-border/40 rounded-3xl p-6 flex flex-col items-center justify-center relative overflow-hidden group">
            <div className="absolute inset-0 bg-red-500/5 group-hover:bg-red-500/10 transition-colors pointer-events-none" />
            <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-2 self-start">SLA Violated</h3>
            <Gauge value={396} max={500} label="Violated" colorClass="border-red-500" highlightClass="text-red-500" />
          </div>
        </div>
      </div>
    </div>
  );
}
