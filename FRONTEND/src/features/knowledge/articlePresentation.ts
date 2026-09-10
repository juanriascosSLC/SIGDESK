export type KnowledgeCollection = 'all' | 'guide' | 'manual' | 'article';

export type KnowledgeMetadata = {
  category?: string;
  body: string;
};

const collectionLabels: Record<Exclude<KnowledgeCollection, 'all'>, string> = {
  guide: 'Guides', manual: 'Manuals', article: 'Articles',
};

/** Reads presentation metadata from the immutable Markdown source of truth. */
export function readKnowledgeMetadata(content: string): KnowledgeMetadata {
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/);
  if (!match) return { body: content.trim() };
  const fields = new Map<string, string>();
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([a-zA-Z_]+):\s*["']?(.+?)["']?\s*$/);
    if (field) fields.set(field[1].toLowerCase(), field[2].trim());
  }
  return { category: fields.get('categoria'), body: content.slice(match[0].length).trim() };
}

function normalized(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Collections are navigation aids, not separate Knowledge Base entities. */
export function knowledgeCollection(title: string, content: string): Exclude<KnowledgeCollection, 'all'> {
  const metadata = readKnowledgeMetadata(content);
  const category = normalized(metadata.category ?? '');
  const document = normalized(`${title}\n${metadata.body}`);
  if (['guia', 'guide'].includes(category) || /^(guia|como |configuracion|troubleshooting)\b/.test(normalized(title))) return 'guide';
  if (['manual', 'autoservicio', 'uso de sig-desk', 'operaciones'].includes(category) || /\b(sop|standard operating procedure|procedimiento|manual)\b/.test(document)) return 'manual';
  return 'article';
}

export function knowledgeCollectionLabel(collection: Exclude<KnowledgeCollection, 'all'>) {
  return collectionLabels[collection];
}

export function knowledgeExcerpt(content: string) {
  return readKnowledgeMetadata(content).body.replace(/^#{1,6}\s+/gm, '').replace(/\s+/g, ' ').trim();
}
