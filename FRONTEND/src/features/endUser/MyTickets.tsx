import { Search, Filter } from 'lucide-react';

export default function MyTickets() {
  return (
    <div className="p-6 lg:p-8 w-full space-y-6">
      <div className="flex items-center justify-between">
         <h1 className="text-2xl font-black text-on-surface">My Tickets</h1>
      </div>

      <div className="flex gap-4 mb-6">
         <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
            <input 
              type="text" 
              placeholder="Search my tickets..." 
              className="w-full bg-surface-container border border-border/50 text-sm rounded-lg pl-10 pr-4 py-2 text-on-surface outline-none focus:border-cyan-500/50"
            />
         </div>
         <button className="bg-surface-container border border-border/50 px-4 py-2 rounded-lg text-sm font-bold text-on-surface flex items-center gap-2 hover:bg-surface-container-high transition-colors">
            <Filter className="w-4 h-4" /> Filter: All
         </button>
      </div>

      <div className="bg-surface-container-low border border-border/40 rounded-2xl overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-surface-container-high text-on-surface-variant border-b border-border/40 text-xs uppercase tracking-wider font-bold">
            <tr>
              <th className="px-6 py-4">ID</th>
              <th className="px-6 py-4">Subject</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            <tr className="hover:bg-surface-container/50 transition-colors cursor-pointer">
              <td className="px-6 py-4 font-mono text-cyan-500">INC-202611</td>
              <td className="px-6 py-4 text-on-surface font-medium">Laptop screen flickering</td>
              <td className="px-6 py-4"><span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-2 py-1 rounded uppercase tracking-wider">In Progress</span></td>
              <td className="px-6 py-4 text-on-surface-variant">2 hours ago</td>
            </tr>
            <tr className="hover:bg-surface-container/50 transition-colors cursor-pointer">
              <td className="px-6 py-4 font-mono text-cyan-500">REQ-202590</td>
              <td className="px-6 py-4 text-on-surface font-medium">Request for Adobe CC</td>
              <td className="px-6 py-4"><span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded uppercase tracking-wider">Resolved</span></td>
              <td className="px-6 py-4 text-on-surface-variant">Yesterday</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
