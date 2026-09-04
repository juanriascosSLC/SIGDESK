import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { getKnowledge, type KnowledgeArticle } from './api';

export default function ArticleDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [article, setArticle] = useState<KnowledgeArticle>();
  const [error, setError] = useState('');
  useEffect(() => { getKnowledge(id).then(setArticle).catch(() => setError('El manual no existe o no tienes permiso para verlo.')); }, [id]);
  if (error) return <div className="p-8 text-red-400">{error}</div>;
  if (!article) return <div className="p-8 text-on-surface-variant">Cargando manual…</div>;
  return <div className="p-8 max-w-4xl">
    <button onClick={() => navigate('/app/knowledge')} className="flex items-center gap-2 text-on-surface-variant hover:text-primary mb-6"><ArrowLeft className="w-4 h-4" />Volver a Knowledge Base</button>
    <div className="border-b border-border pb-6 mb-8"><p className="font-mono text-xs text-cyan-500">{article.numero_visible} · v{article.version}</p><h1 className="text-3xl font-black text-on-surface mt-2">{article.titulo}</h1><p className="text-on-surface-variant mt-2">{article.categoria} · {article.etiquetas.join(', ')}</p></div>
    <article className="whitespace-pre-wrap text-on-surface-variant leading-relaxed"><BookOpen className="inline w-4 h-4 mr-2 text-cyan-400" />{article.contenido.replace(/^---[\s\S]*?---\s*/, '')}</article>
  </div>;
}
