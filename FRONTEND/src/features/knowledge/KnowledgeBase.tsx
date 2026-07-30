import { useNavigate } from 'react-router-dom';
import {
  Search,
  BookOpen,
  Monitor,
  Network,
  UserPlus,
  HardDrive,
  Eye,
  ThumbsUp,
  Clock,
  TrendingUp,
  Sparkles
} from 'lucide-react';

const categories = [
  { id: 'hardware', title: 'Hardware & Cameras', desc: 'Troubleshooting guides for cameras, NVRs, switches and field equipment.', icon: HardDrive, count: 24 },
  { id: 'software', title: 'Software & Access', desc: 'Platform how-tos, account access, licensing and password resets.', icon: Monitor, count: 18 },
  { id: 'network', title: 'Network & Infrastructure', desc: 'Connectivity issues, VPN setup, bandwidth and site networking.', icon: Network, count: 15 },
  { id: 'onboarding', title: 'Onboarding & HR', desc: 'New employee setup, equipment requests and standard procedures.', icon: UserPlus, count: 9 },
];

const popularArticles = [
  { id: 'KB-1024', title: 'How to power-cycle an offline HIKVISION camera remotely', category: 'Hardware & Cameras', views: 1847, helpful: 132, updated: '2 days ago' },
  { id: 'KB-1007', title: 'Requesting access to SIGInstallations (step by step)', category: 'Software & Access', views: 1290, helpful: 98, updated: '1 week ago' },
  { id: 'KB-1031', title: 'Diagnosing network latency at customer sites', category: 'Network & Infrastructure', views: 964, helpful: 87, updated: '3 days ago' },
  { id: 'KB-1002', title: 'VPN configuration for field technicians', category: 'Network & Infrastructure', views: 858, helpful: 76, updated: '2 weeks ago' },
  { id: 'KB-1019', title: 'RMA process for faulty equipment', category: 'Hardware & Cameras', views: 743, helpful: 64, updated: '5 days ago' },
];

const recentArticles = [
  { id: 'KB-1042', title: 'Clearing NVR storage alerts before retention drops', category: 'Hardware & Cameras', author: 'Laura Kim', updated: 'Today' },
  { id: 'KB-1041', title: 'New badge portal: unlocking accounts after failed logins', category: 'Software & Access', author: 'IT Admin', updated: 'Yesterday' },
  { id: 'KB-1040', title: 'Standard checklist for new site network deployment', category: 'Network & Infrastructure', author: 'Mike Ross', updated: '2 days ago' },
  { id: 'KB-1039', title: 'Day-one equipment setup for new hires', category: 'Onboarding & HR', author: 'Jane Smith', updated: '4 days ago' },
];

export default function KnowledgeBase() {
  const navigate = useNavigate();

  return (
    <div className="p-6 lg:p-8 w-full space-y-10">
      {/* Hero */}
      <div className="text-center space-y-4 mb-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-black uppercase tracking-[0.2em]">
          <Sparkles className="w-3 h-3" />
          66 articles · Updated daily
        </div>
        <h1 className="text-4xl font-black text-on-surface tracking-tight">Knowledge Base</h1>
        <p className="text-on-surface-variant max-w-xl mx-auto">Find answers, guides and standard procedures before opening a ticket.</p>
        <div className="relative max-w-2xl mx-auto mt-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-cyan-400" />
          <input
            type="text"
            placeholder="Search articles... E.g. camera offline, VPN setup"
            className="w-full bg-surface-container-low border border-cyan-500/30 text-on-surface text-lg rounded-2xl pl-12 pr-6 py-4 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all shadow-[0_0_30px_rgba(34,211,238,0.1)]"
          />
        </div>
      </div>

      {/* Categories */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {categories.map((cat) => (
          <div
            key={cat.id}
            onClick={() => navigate('/app/knowledge/KB-1024')}
            className="group bg-surface-container-low border border-border rounded-3xl p-6 hover:border-cyan-500/30 hover:bg-on-surface/[0.03] transition-all cursor-pointer relative overflow-hidden"
          >
            <div className="absolute right-0 top-0 w-24 h-24 bg-cyan-500/10 rounded-bl-full opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center mb-5">
              <cat.icon className="w-6 h-6 text-cyan-400" />
            </div>
            <h3 className="text-base font-bold text-on-surface mb-1">{cat.title}</h3>
            <p className="text-xs text-on-surface-variant mb-4 leading-relaxed">{cat.desc}</p>
            <span className="text-[10px] font-black uppercase tracking-[0.15em] text-cyan-500/80">{cat.count} articles</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Popular Articles */}
        <div className="bg-surface-container-low border border-border/40 rounded-3xl p-6">
          <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-5 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-amber-400" />
            Popular Articles
          </h3>
          <div className="space-y-1">
            {popularArticles.map((a) => (
              <div
                key={a.id}
                onClick={() => navigate(`/app/knowledge/${a.id}`)}
                className="group flex items-start gap-4 p-3 rounded-2xl hover:bg-surface-container transition-colors cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-surface-container border border-border/40 flex items-center justify-center shrink-0 group-hover:border-cyan-500/30 group-hover:text-cyan-400 text-on-surface-variant transition-colors">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-on-surface truncate group-hover:text-cyan-400 transition-colors">{a.title}</p>
                  <div className="flex items-center gap-4 mt-1 text-[11px] text-on-surface-variant">
                    <span className="font-mono text-cyan-500/80">{a.id}</span>
                    <span>{a.category}</span>
                    <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {a.views.toLocaleString()}</span>
                    <span className="flex items-center gap-1"><ThumbsUp className="w-3 h-3" /> {a.helpful}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recently Updated */}
        <div className="bg-surface-container-low border border-border/40 rounded-3xl p-6">
          <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-5 flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-400" />
            Recently Updated
          </h3>
          <div className="space-y-1">
            {recentArticles.map((a) => (
              <div
                key={a.id}
                onClick={() => navigate(`/app/knowledge/${a.id}`)}
                className="group flex items-start gap-4 p-3 rounded-2xl hover:bg-surface-container transition-colors cursor-pointer"
              >
                <div className="w-9 h-9 rounded-full bg-surface-container-high border border-border/50 flex items-center justify-center shrink-0 text-[10px] font-bold text-on-surface">
                  {a.author.split(' ').map(w => w[0]).join('')}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-on-surface truncate group-hover:text-cyan-400 transition-colors">{a.title}</p>
                  <div className="flex items-center gap-4 mt-1 text-[11px] text-on-surface-variant">
                    <span className="font-mono text-cyan-500/80">{a.id}</span>
                    <span>{a.category}</span>
                    <span>by {a.author}</span>
                  </div>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5 shrink-0">
                  {a.updated}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
