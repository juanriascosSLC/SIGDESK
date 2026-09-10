import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createDraft, publishArticleVersion } from './api';

/**
 * Creates a knowledge article draft, and optionally publishes the version it
 * just created.
 *
 * Contract notes (see ./api.ts — every one of these was wrong before):
 *  - `POST /knowledge/articulos` accepts exactly titulo, contenido and
 *    audiencia. The Categoría and Etiquetas inputs this form used to collect
 *    were sent to a service that has no such fields and no such route: the
 *    values were silently discarded. Collecting input that goes nowhere is
 *    the same class of lie as fabricated data, so the inputs are gone rather
 *    than kept as decoration.
 *  - Publishing addresses an immutable VERSION
 *    (`/knowledge/articulos/{id}/versiones/{version}/publicar`), so it needs
 *    both ids from the create response — not the single `draft.id` this form
 *    used to pass, which never existed in the payload.
 *  - There is NO update route, so this screen creates only. It deliberately
 *    offers no "edit this draft" affordance; adding one would need a backend
 *    endpoint first.
 */
export default function KnowledgeEditor() {
  const navigate = useNavigate();
  const [titulo, setTitulo] = useState('');
  const [audiencia, setAudiencia] = useState('general');
  const [contenido, setContenido] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const guardar = async (publicar: boolean) => {
    setSaving(true);
    setMessage('');
    try {
      const draft = await createDraft({ titulo, contenido, audiencia });
      if (publicar) {
        await publishArticleVersion(draft.articulo_id, draft.version);
      }
      setMessage(
        publicar
          ? `${draft.numero_visible} v${draft.version} publicado.`
          : `Borrador ${draft.numero_visible} v${draft.version} guardado.`,
      );
    } catch {
      setMessage('No tienes permiso o faltan campos obligatorios.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl space-y-4">
      <h1 className="text-3xl font-black text-on-surface">Nuevo manual</h1>
      <input
        value={titulo}
        onChange={(event) => setTitulo(event.target.value)}
        placeholder="Título"
        aria-label="Título"
        className="w-full p-3 rounded-xl bg-surface-container-low border border-border"
      />
      <select
        value={audiencia}
        onChange={(event) => setAudiencia(event.target.value)}
        aria-label="Audiencia"
        className="p-3 rounded-xl bg-surface-container-low border border-border"
      >
        <option value="general">General</option>
        <option value="interno_it">Interno IT</option>
        <option value="restringido">Restringido</option>
      </select>
      <textarea
        value={contenido}
        onChange={(event) => setContenido(event.target.value)}
        placeholder="Contenido Markdown"
        aria-label="Contenido Markdown"
        rows={18}
        className="w-full p-3 rounded-xl bg-surface-container-low border border-border font-mono"
      />
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => void guardar(false)}
          disabled={saving}
          className="px-4 py-2 rounded-xl bg-surface-container border border-border disabled:opacity-50"
        >
          Guardar borrador
        </button>
        <button
          type="button"
          onClick={() => void guardar(true)}
          disabled={saving}
          className="px-4 py-2 rounded-xl bg-cyan-500 text-black font-bold disabled:opacity-50"
        >
          Publicar
        </button>
        <button type="button" onClick={() => navigate('/app/knowledge')} className="px-4 py-2">
          Cancelar
        </button>
      </div>
      {message && <p className="text-on-surface-variant">{message}</p>}
    </div>
  );
}
