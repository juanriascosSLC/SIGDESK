import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronRight,
  ThumbsUp,
  ThumbsDown,
  Eye,
  Link2,
  BookOpen,
  AlertTriangle,
  Clock,
  Printer,
  Share2
} from 'lucide-react';

const relatedArticles = [
  { id: 'KB-1019', title: 'RMA process for faulty equipment' },
  { id: 'KB-1031', title: 'Diagnosing network latency at customer sites' },
  { id: 'KB-1042', title: 'Clearing NVR storage alerts before retention drops' },
];

const tocItems = [
  { label: 'Before you start', anchor: '#before' },
  { label: 'Step-by-step procedure', anchor: '#steps' },
  { label: 'Verifying the camera is back online', anchor: '#verify' },
  { label: 'If the camera stays offline', anchor: '#escalate' },
];

export default function ArticleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  return (
    <div className="flex h-[calc(100vh-80px)] overflow-hidden">
      {/* Article Body */}
      <div className="flex-1 overflow-y-auto p-8 border-r border-border/40">
        <button onClick={() => navigate('/app/knowledge')} className="flex items-center gap-2 text-on-surface-variant hover:text-primary mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Knowledge Base
        </button>

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-on-surface-variant mb-4">
          <Link to="/knowledge" className="hover:text-cyan-400 transition-colors">Knowledge Base</Link>
          <ChevronRight className="w-3 h-3" />
          <span>Hardware &amp; Cameras</span>
          <ChevronRight className="w-3 h-3" />
          <span className="font-mono text-cyan-500/80">{id}</span>
        </div>

        <h1 className="text-3xl font-black text-on-surface mb-4 max-w-3xl">
          How to power-cycle an offline HIKVISION camera remotely
        </h1>

        <div className="flex flex-wrap items-center gap-4 text-xs text-on-surface-variant mb-8 pb-6 border-b border-border/40">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-surface-container-high border border-border/50 flex items-center justify-center text-[10px] font-bold text-on-surface">LK</div>
            <span>Laura Kim · Field Ops</span>
          </div>
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Updated 2 days ago</span>
          <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> 1,847 views</span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-primary font-bold">
            <Link2 className="w-3 h-3" />
            Linked to 12 tickets
          </span>
        </div>

        <div className="max-w-3xl space-y-8 text-on-surface leading-relaxed">
          <section id="before">
            <h2 className="text-lg font-bold text-on-surface mb-3">Before you start</h2>
            <p className="text-on-surface-variant text-sm">
              This procedure applies to HIKVISION DS-2CD series cameras connected to a managed PoE switch.
              You will need access to the switch management console and the site's asset ID from SIGInventory.
            </p>
            <div className="mt-4 flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-200/90">
                Power-cycling a camera during an active recording will create a small gap in footage.
                Notify the site contact before proceeding if the camera covers a critical area.
              </p>
            </div>
          </section>

          <section id="steps">
            <h2 className="text-lg font-bold text-on-surface mb-3">Step-by-step procedure</h2>
            <ol className="space-y-4">
              {[
                'Locate the camera’s asset record and note the switch name and PoE port number.',
                'Open the switch management console and navigate to the PoE port configuration.',
                'Disable PoE power on the port and wait 10 seconds.',
                'Re-enable PoE power and wait for the camera to boot (60–90 seconds).',
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-4">
                  <span className="w-7 h-7 rounded-full bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 text-xs font-black flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-sm text-on-surface-variant pt-1">{step}</span>
                </li>
              ))}
            </ol>
            <div className="mt-5 p-4 rounded-2xl bg-surface-container-lowest border border-border/40 font-mono text-xs text-cyan-300 overflow-x-auto">
              <span className="text-on-surface-variant"># Example: cycling PoE on port 12 via CLI</span><br />
              switch(config)# interface gi1/0/12<br />
              switch(config-if)# power inline never<br />
              switch(config-if)# power inline auto
            </div>
          </section>

          <section id="verify">
            <h2 className="text-lg font-bold text-on-surface mb-3">Verifying the camera is back online</h2>
            <p className="text-on-surface-variant text-sm">
              After the boot cycle, confirm the camera responds to ping and that the video stream is visible in the VMS.
              The asset status in SIGInventory should flip back to <span className="text-emerald-400 font-bold">Online</span> within 5 minutes.
            </p>
          </section>

          <section id="escalate">
            <h2 className="text-lg font-bold text-on-surface mb-3">If the camera stays offline</h2>
            <p className="text-on-surface-variant text-sm">
              Open a Hardware ticket from the Service Catalog and attach the switch port logs.
              If the asset is flagged End of Life (EOL), follow the RMA process instead of scheduling a site visit.
            </p>
          </section>
        </div>

        {/* Was this helpful */}
        <div className="max-w-3xl mt-12 p-6 rounded-3xl bg-surface-container-low border border-border/40 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-sm font-bold text-on-surface">Was this article helpful?</span>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-bold hover:bg-emerald-500/20 transition-colors">
              <ThumbsUp className="w-4 h-4" /> Yes · 47
            </button>
            <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-container border border-border/50 text-on-surface-variant text-sm font-bold hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 transition-colors">
              <ThumbsDown className="w-4 h-4" /> No · 3
            </button>
          </div>
        </div>
      </div>

      {/* Right Sidebar */}
      <div className="w-80 bg-surface-container-lowest overflow-y-auto hidden lg:block">
        <div className="p-6 space-y-8">
          <div>
            <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3">On this page</h4>
            <ul className="space-y-1 text-sm">
              {tocItems.map((item, i) => (
                <li key={item.anchor}>
                  <a
                    href={item.anchor}
                    className={`block px-3 py-2 rounded-xl transition-colors ${
                      i === 0
                        ? 'bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-medium'
                        : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                    }`}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3">Related Articles</h4>
            <div className="space-y-2">
              {relatedArticles.map((a) => (
                <div
                  key={a.id}
                  onClick={() => navigate(`/app/knowledge/${a.id}`)}
                  className="group flex items-start gap-3 p-3 rounded-2xl bg-surface-container-low border border-border/40 hover:border-cyan-500/30 cursor-pointer transition-colors"
                >
                  <BookOpen className="w-4 h-4 text-on-surface-variant group-hover:text-cyan-400 shrink-0 mt-0.5 transition-colors" />
                  <div className="min-w-0">
                    <p className="text-sm text-on-surface group-hover:text-cyan-400 transition-colors leading-snug">{a.title}</p>
                    <span className="text-[10px] font-mono text-cyan-500/60">{a.id}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-surface-container border border-border/50 text-xs font-bold text-on-surface hover:bg-surface-container-high transition-colors">
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
            <button className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-surface-container border border-border/50 text-xs font-bold text-on-surface hover:bg-surface-container-high transition-colors">
              <Share2 className="w-3.5 h-3.5" /> Share
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
