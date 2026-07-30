import {
  BarChart3,
  Timer,
  TrendingUp,
  Star,
  Download,
  ChevronRight,
  Users
} from 'lucide-react';

const reportCards = [
  { title: 'Agent Performance', desc: 'Tickets resolved, first response time and workload per agent.', icon: Users, accent: 'cyan', updated: 'Live' },
  { title: 'SLA Compliance', desc: 'Breaches and at-risk tickets by policy over the last 30 days.', icon: Timer, accent: 'red', updated: 'Hourly' },
  { title: 'Ticket Volume Trends', desc: 'Incoming vs resolved volume, split by category and site.', icon: TrendingUp, accent: 'amber', updated: 'Daily' },
  { title: 'CSAT Surveys', desc: 'Post-resolution satisfaction scores and comments.', icon: Star, accent: 'emerald', updated: 'Weekly' },
];

const topAgents = [
  { name: 'Laura Kim', initials: 'LK', resolved: 148, avgResponse: '18 min', csat: 4.9, trend: [40, 55, 45, 70, 65, 80, 75] },
  { name: 'IT Admin', initials: 'IT', resolved: 121, avgResponse: '26 min', csat: 4.7, trend: [60, 50, 65, 55, 70, 60, 72] },
  { name: 'Mike Ross', initials: 'MR', resolved: 96, avgResponse: '31 min', csat: 4.5, trend: [30, 45, 40, 50, 48, 55, 60] },
  { name: 'Jane Smith', initials: 'JS', resolved: 74, avgResponse: '42 min', csat: 4.3, trend: [25, 30, 35, 28, 40, 45, 42] },
];

const accentClasses: Record<string, { bg: string; border: string; text: string }> = {
  cyan: { bg: 'bg-cyan-500/20', border: 'border-cyan-500/30', text: 'text-cyan-400' },
  red: { bg: 'bg-red-500/20', border: 'border-red-500/30', text: 'text-red-400' },
  amber: { bg: 'bg-amber-500/20', border: 'border-amber-500/30', text: 'text-amber-400' },
  emerald: { bg: 'bg-emerald-500/20', border: 'border-emerald-500/30', text: 'text-emerald-400' },
};

function Sparkline({ points, colorClass }: { points: number[]; colorClass: string }) {
  return (
    <div className="flex items-end gap-[3px] h-8">
      {points.map((p, i) => (
        <div key={i} className={`w-1.5 rounded-t-sm ${colorClass}`} style={{ height: `${p}%` }} />
      ))}
    </div>
  );
}

export default function Reports() {
  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-on-surface tracking-wide flex items-center gap-3">
            <BarChart3 className="w-6 h-6 text-cyan-400" />
            Reports &amp; Analytics
          </h1>
          <p className="text-sm text-on-surface-variant mt-1">Prebuilt reports across your service desk operation.</p>
        </div>
        <div className="flex gap-2">
          <select className="bg-surface-container border border-border/50 text-sm rounded-lg px-4 py-2 text-on-surface outline-none focus:border-primary/50">
            <option>Last 30 Days</option>
            <option>Last 7 Days</option>
            <option>This Quarter</option>
          </select>
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-container border border-border/50 text-sm font-bold text-on-surface hover:bg-surface-container-high transition-colors">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Report Gallery */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {reportCards.map((r) => {
          const a = accentClasses[r.accent];
          return (
            <div key={r.title} className="group bg-surface-container-low border border-border rounded-3xl p-6 hover:border-cyan-500/30 hover:bg-on-surface/[0.03] transition-all cursor-pointer">
              <div className="flex items-start justify-between mb-5">
                <div className={`w-12 h-12 rounded-2xl ${a.bg} border ${a.border} flex items-center justify-center`}>
                  <r.icon className={`w-6 h-6 ${a.text}`} />
                </div>
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-on-surface-variant">{r.updated}</span>
              </div>
              <h3 className="text-base font-bold text-on-surface mb-1 flex items-center gap-1">
                {r.title}
                <ChevronRight className="w-4 h-4 text-on-surface-variant group-hover:text-cyan-400 group-hover:translate-x-1 transition-all" />
              </h3>
              <p className="text-xs text-on-surface-variant leading-relaxed">{r.desc}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* SLA Compliance featured */}
        <div className="bg-surface-container-low border border-border/40 rounded-3xl p-6 flex flex-col items-center justify-center">
          <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-6 self-start">SLA Compliance (30d)</h3>
          <div
            className="w-40 h-40 rounded-full relative"
            style={{ background: 'conic-gradient(#34d399 0% 87%, #ef4444 87% 100%)' }}
          >
            <div className="absolute inset-3 bg-surface-container-low rounded-full flex flex-col items-center justify-center shadow-inner">
              <span className="text-3xl font-black text-emerald-400">87%</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Met</span>
            </div>
          </div>
          <div className="flex gap-6 mt-6 text-xs">
            <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-400" /> Met · 634</span>
            <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500" /> Breached · 94</span>
          </div>
        </div>

        {/* Ticket volume trend */}
        <div className="bg-surface-container-low border border-border/40 rounded-3xl p-6">
          <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-6">Incoming vs Resolved</h3>
          <div className="h-40 flex items-end justify-between gap-3 px-2">
            {[
              { in: 65, out: 50 }, { in: 80, out: 70 }, { in: 55, out: 60 },
              { in: 90, out: 75 }, { in: 70, out: 80 }, { in: 60, out: 65 },
            ].map((d, i) => (
              <div key={i} className="flex items-end gap-1 w-full h-full">
                <div className="w-full bg-cyan-500/70 rounded-t-sm" style={{ height: `${d.in}%` }} />
                <div className="w-full bg-emerald-500/60 rounded-t-sm" style={{ height: `${d.out}%` }} />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs text-on-surface-variant mt-3 px-2">
            {['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'].map((m) => <span key={m}>{m}</span>)}
          </div>
          <div className="flex gap-6 mt-4 text-xs">
            <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-cyan-500/70" /> Incoming</span>
            <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-emerald-500/60" /> Resolved</span>
          </div>
        </div>

        {/* CSAT */}
        <div className="bg-surface-container-low border border-border/40 rounded-3xl p-6 flex flex-col">
          <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-6">Customer Satisfaction</h3>
          <div className="flex items-center gap-4 mb-6">
            <span className="text-5xl font-black text-amber-400">4.6</span>
            <div>
              <div className="flex gap-0.5 mb-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} className={`w-4 h-4 ${s <= 4 ? 'text-amber-400 fill-amber-400' : 'text-on-surface-variant'}`} />
                ))}
              </div>
              <span className="text-xs text-on-surface-variant">312 responses this month</span>
            </div>
          </div>
          <div className="space-y-2 text-xs">
            {[
              { label: '5 stars', pct: 68, color: 'bg-emerald-400' },
              { label: '4 stars', pct: 21, color: 'bg-cyan-400' },
              { label: '3 stars', pct: 7, color: 'bg-amber-400' },
              { label: '1–2 stars', pct: 4, color: 'bg-red-500' },
            ].map((row) => (
              <div key={row.label} className="flex items-center gap-3">
                <span className="w-14 text-on-surface-variant">{row.label}</span>
                <div className="flex-1 h-2 rounded-full bg-surface-container overflow-hidden">
                  <div className={`h-full rounded-full ${row.color}`} style={{ width: `${row.pct}%` }} />
                </div>
                <span className="w-8 text-right font-bold text-on-surface">{row.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Agents */}
      <div className="bg-surface-container-low border border-border/40 rounded-3xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border/40">
          <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider">Top Agents (Last 30 Days)</h3>
        </div>
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-surface-container/50 border-b border-border/40 text-on-surface-variant font-bold text-xs uppercase tracking-wider">
            <tr>
              <th className="px-6 py-3">Agent</th>
              <th className="px-6 py-3 text-center">Resolved</th>
              <th className="px-6 py-3 text-center">Avg First Response</th>
              <th className="px-6 py-3 text-center">CSAT</th>
              <th className="px-6 py-3">Weekly Trend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {topAgents.map((a) => (
              <tr key={a.name} className="bg-surface-container hover:bg-surface-container-highest transition-colors text-on-surface">
                <td className="px-6 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-surface-container-high border border-border/50 flex items-center justify-center text-[10px] font-bold">
                      {a.initials}
                    </div>
                    <span className="font-medium">{a.name}</span>
                  </div>
                </td>
                <td className="px-6 py-3 text-center font-bold text-cyan-400">{a.resolved}</td>
                <td className="px-6 py-3 text-center font-mono text-xs text-on-surface-variant">{a.avgResponse}</td>
                <td className="px-6 py-3 text-center">
                  <span className="inline-flex items-center gap-1 font-bold text-amber-400">
                    <Star className="w-3 h-3 fill-amber-400" />
                    {a.csat}
                  </span>
                </td>
                <td className="px-6 py-3">
                  <Sparkline points={a.trend} colorClass="bg-cyan-500/70" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
