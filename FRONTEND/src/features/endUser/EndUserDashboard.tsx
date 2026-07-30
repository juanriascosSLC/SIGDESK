import { Search, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function EndUserDashboard() {
  const navigate = useNavigate();

  return (
    <div className="p-6 lg:p-8 w-full space-y-8">
      <div className="bg-gradient-to-r from-cyan-900/40 to-blue-900/40 border border-cyan-500/20 rounded-3xl p-8 flex items-center justify-between shadow-lg">
         <div>
            <h1 className="text-3xl font-black text-on-surface mb-2">Hello, how can we help?</h1>
            <p className="text-cyan-100/80">Search our knowledge base or browse the service catalog.</p>
         </div>
         <button 
           onClick={() => navigate('/portal/catalog/hardware')}
           className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-6 py-3 rounded-xl flex items-center gap-2 transition-colors shadow-[0_0_15px_rgba(34,211,238,0.3)]"
         >
           <Plus className="w-5 h-5" /> Report an Issue
         </button>
      </div>

      <div className="relative max-w-2xl mx-auto">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-cyan-400" />
        <input 
          type="text" 
          placeholder="Search for answers..." 
          className="w-full bg-surface-container border border-border/50 text-on-surface text-lg rounded-2xl pl-12 pr-6 py-4 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all shadow-sm"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
        <div className="bg-surface-container-low border border-border/40 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-on-surface mb-4">My Recent Tickets</h3>
          <div className="space-y-3">
             <div className="p-4 rounded-xl bg-surface-container border border-border/50 flex justify-between items-center cursor-pointer hover:border-cyan-500/50 transition-colors">
                <div>
                   <span className="text-[10px] font-mono text-cyan-500 bg-cyan-500/10 px-2 py-0.5 rounded">INC-202611</span>
                   <p className="text-sm font-bold text-on-surface mt-1">Laptop screen flickering</p>
                </div>
                <span className="text-xs font-bold text-amber-500 bg-amber-500/10 px-2 py-1 rounded">In Progress</span>
             </div>
             <div className="p-4 rounded-xl bg-surface-container border border-border/50 flex justify-between items-center cursor-pointer hover:border-cyan-500/50 transition-colors">
                <div>
                   <span className="text-[10px] font-mono text-cyan-500 bg-cyan-500/10 px-2 py-0.5 rounded">REQ-202590</span>
                   <p className="text-sm font-bold text-on-surface mt-1">Request for Adobe CC</p>
                </div>
                <span className="text-xs font-bold text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded">Resolved</span>
             </div>
          </div>
          <button onClick={() => navigate('/portal/tickets')} className="mt-4 text-xs font-bold text-cyan-500 hover:text-cyan-400">View all tickets →</button>
        </div>

        <div className="bg-surface-container-low border border-border/40 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-on-surface mb-4">Recommended Articles</h3>
          <ul className="space-y-2">
             <li><a href="#" className="text-sm text-cyan-500 hover:underline">How to connect to the corporate VPN</a></li>
             <li><a href="#" className="text-sm text-cyan-500 hover:underline">Setting up your email on iOS/Android</a></li>
             <li><a href="#" className="text-sm text-cyan-500 hover:underline">Troubleshooting printer offline issues</a></li>
          </ul>
        </div>
      </div>
    </div>
  );
}
