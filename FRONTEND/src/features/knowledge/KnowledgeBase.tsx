import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Plus, Search } from 'lucide-react';
import { listKnowledge, type KnowledgeArticle } from './api';

export default function KnowledgeBase() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => {
      listKnowledge(query).then(setArticles).catch(() => setError('No fue posible cargar los manuales autorizados.'));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query]);
  return <div className="p-6 lg:p-8 w-full space-y-8">
    <div className="text-center space-y-4">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-black uppercase tracking-[0.2em]">{articles.length} manuales disponibles</div>
      <div className="flex items-center justify-center gap-4"><h1 className="text-4xl font-black text-on-surface">Knowledge Base</h1><button onClick={() => navigate('/app/knowledge/new')} className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-3 py-2 text-sm font-bold text-black hover:bg-cyan-400"><Plus className="w-4 h-4" />Nuevo manual</button></div>
      <p className="text-on-surface-variant">Manuales y procedimientos autorizados para tu audiencia.</p>
      <div className="relative max-w-2xl mx-auto"><Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-cyan-400" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar manuales..." className="w-full bg-surface-container-low border border-cyan-500/30 text-on-surface rounded-2xl pl-12 pr-6 py-4 focus:outline-none" /></div>
    </div>
    {error && <p className="text-center text-red-400">{error}</p>}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {articles.map(article => <button key={article.id} onClick={() => navigate(`/app/knowledge/${article.numero_visible}`)} className="text-left group flex gap-4 p-5 rounded-3xl bg-surface-container-low border border-border hover:border-cyan-500/30">
        <BookOpen className="w-5 h-5 text-cyan-400 mt-1" /><div className="min-w-0"><p className="font-bold text-on-surface group-hover:text-cyan-400">{article.titulo}</p><p className="text-sm text-on-surface-variant mt-1">{article.categoria} · {article.etiquetas.join(', ')}</p><p className="font-mono text-xs text-cyan-500/80 mt-3">{article.numero_visible} · v{article.version}</p></div>
      </button>)}
    </div>
    {!error && articles.length === 0 && <p className="text-center text-on-surface-variant">No hay manuales que coincidan con la búsqueda.</p>}
  </div>;
}
