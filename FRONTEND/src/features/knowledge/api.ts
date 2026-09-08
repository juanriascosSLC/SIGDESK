import { apiRequest } from '@/lib/apiClient';

export type KnowledgeArticle = {
  id: number; article_id: number; numero_visible: string; version: number;
  titulo: string; categoria: string; etiquetas: string[]; audiencia: string;
  contenido: string; estado: string; actualizado_en: string;
};

export async function listKnowledge(search = ''): Promise<KnowledgeArticle[]> {
  const response = await apiRequest<{ items: KnowledgeArticle[] }>(`/knowledge/articles?q=${encodeURIComponent(search)}`);
  return response.items ?? [];
}
export function getKnowledge(numero: string): Promise<KnowledgeArticle> { return apiRequest<KnowledgeArticle>(`/knowledge/articles/${encodeURIComponent(numero)}`); }
export function createDraft(article: Pick<KnowledgeArticle, 'titulo' | 'categoria' | 'etiquetas' | 'audiencia' | 'contenido'>): Promise<KnowledgeArticle> { return apiRequest<KnowledgeArticle>('/knowledge/articles', { method: 'POST', body: JSON.stringify(article) }); }
export function updateDraft(id: number, article: Pick<KnowledgeArticle, 'titulo' | 'categoria' | 'etiquetas' | 'audiencia' | 'contenido'>): Promise<KnowledgeArticle> { return apiRequest<KnowledgeArticle>(`/knowledge/articles/${id}`, { method: 'PATCH', body: JSON.stringify(article) }); }
export function publishDraft(id: number): Promise<KnowledgeArticle> { return apiRequest<KnowledgeArticle>(`/knowledge/articles/${id}/publish`, { method: 'POST' }); }
