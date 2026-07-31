/**
 * LayoutDesigner – manage versioned layout drafts for a catalog entity.
 *
 * Responsibilities:
 * - Load the existing draft (GET /catalog/layouts/:entityKey/draft) or
 *   surface a "no draft" state that allows creating one.
 * - Delegate visual editing to PageDesigner, which already handles undo/redo,
 *   drag-and-drop and the properties panel.
 * - Offer Save draft (PUT) and Publish draft (POST /publish) actions.
 * - Show the list of existing versions and allow activating a prior one.
 *
 * This component is intentionally narrow: business logic lives in the backend
 * (advisory lock, immutability, state machine). The UI only orchestrates HTTP
 * calls and shows status feedback.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Play, Plus, RotateCcw } from 'lucide-react';
import {
  createLayoutDraft,
  getLayoutDraft,
  listLayoutVersions,
  publishLayoutDraft,
  updateLayoutDraft,
  activateLayoutVersion,
  type CatalogLayoutVersion,
} from '@/features/catalog/api';

export interface LayoutDesignerProps {
  entityKey: string;
}

type DraftDoc = Record<string, unknown>;

function StatusBadge({ status }: { status: CatalogLayoutVersion['status'] }) {
  const CLASS: Record<string, string> = {
    draft: 'bg-blue-100 text-blue-800',
    published: 'bg-green-100 text-green-800',
    deprecated: 'bg-amber-100 text-amber-800',
    archived: 'bg-gray-100 text-gray-500',
  };
  const LABEL: Record<string, string> = {
    draft: 'Borrador',
    published: 'Publicado',
    deprecated: 'Obsoleto',
    archived: 'Archivado',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CLASS[status] ?? ''}`}>
      {LABEL[status] ?? status}
    </span>
  );
}

export function LayoutDesigner({ entityKey }: LayoutDesignerProps) {
  const queryClient = useQueryClient();
  const [showVersions, setShowVersions] = useState(false);
  const [editDoc, setEditDoc] = useState<DraftDoc | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const draftKey = ['layout-draft', entityKey];
  const versionsKey = ['layout-versions', entityKey];

  const draft = useQuery({
    queryKey: draftKey,
    queryFn: () => getLayoutDraft(entityKey),
    retry: false,
  });

  const versions = useQuery({
    queryKey: versionsKey,
    queryFn: () => listLayoutVersions(entityKey),
    enabled: showVersions,
  });

  const createDraft = useMutation({
    mutationFn: (doc: DraftDoc) => createLayoutDraft(entityKey, doc),
    onSuccess: (created) => {
      queryClient.setQueryData(draftKey, created);
      setEditDoc(structuredClone(created.document));
      setNotice('Borrador creado correctamente.');
    },
  });

  const saveDraft = useMutation({
    mutationFn: (doc: DraftDoc) => updateLayoutDraft(entityKey, doc),
    onSuccess: (updated) => {
      queryClient.setQueryData(draftKey, updated);
      setNotice('Borrador guardado.');
    },
  });

  const publishDraft = useMutation({
    mutationFn: () => publishLayoutDraft(entityKey),
    onSuccess: (published) => {
      queryClient.removeQueries({ queryKey: draftKey });
      void queryClient.invalidateQueries({ queryKey: versionsKey });
      setEditDoc(null);
      setNotice(`Versión ${published.version} publicada.`);
    },
  });

  const activate = useMutation({
    mutationFn: (version: number) => activateLayoutVersion(entityKey, version),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: versionsKey });
      setNotice('Versión activada.');
    },
  });

  // Initialize edit buffer from loaded draft
  if (draft.data && editDoc === null) {
    setEditDoc(structuredClone(draft.data.document));
  }

  const hasDraft = !draft.isError && draft.data;
  const isPending =
    createDraft.isPending || saveDraft.isPending || publishDraft.isPending || activate.isPending;

  return (
    <div className="space-y-6">
      {notice && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 flex items-center justify-between">
          {notice}
          <button onClick={() => setNotice(null)} className="ml-4 text-green-600 hover:text-green-800">×</button>
        </div>
      )}

      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-on-surface">
            Layout versionado — <code className="text-sm font-mono">{entityKey}</code>
          </h2>
          {hasDraft && (
            <>
              <StatusBadge status="draft" />
              <span className="text-xs text-on-surface-variant">
                v{draft.data?.version ?? 0}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-on-surface hover:bg-surface-container"
            onClick={() => setShowVersions((v) => !v)}
          >
            <History className="h-3.5 w-3.5" />
            {showVersions ? 'Ocultar historial' : 'Ver versiones'}
          </button>
          {!hasDraft && (
            <button
              type="button"
              disabled={createDraft.isPending}
              className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs text-on-primary hover:bg-primary/90 disabled:opacity-50"
              onClick={() => createDraft.mutate({})}
            >
              <Plus className="h-3.5 w-3.5" />
              Nuevo borrador
            </button>
          )}
          {hasDraft && (
            <>
              <button
                type="button"
                disabled={isPending || !editDoc}
                className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-on-surface hover:bg-surface-container disabled:opacity-50"
                onClick={() => editDoc && saveDraft.mutate(editDoc)}
              >
                Guardar borrador
              </button>
              <button
                type="button"
                disabled={isPending}
                className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs text-white hover:bg-green-700 disabled:opacity-50"
                onClick={() => publishDraft.mutate()}
              >
                <Play className="h-3.5 w-3.5" />
                Publicar
              </button>
            </>
          )}
        </div>
      </div>

      {/* Errors */}
      {createDraft.isError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          Error al crear borrador: {String(createDraft.error)}
        </div>
      )}
      {publishDraft.isError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          Error al publicar: {String(publishDraft.error)}
        </div>
      )}

      {/* Draft JSON editor – simple textarea until PageDesigner is wired */}
      {hasDraft && editDoc !== null && (
        <div className="rounded-xl border border-border bg-surface-container-low p-4 space-y-3">
          <p className="text-xs font-medium text-on-surface-variant">Documento del layout (JSON)</p>
          <textarea
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
            rows={16}
            value={JSON.stringify(editDoc, null, 2)}
            onChange={(e) => {
              try {
                setEditDoc(JSON.parse(e.target.value) as DraftDoc);
              } catch {
                // ignore parse errors while typing
              }
            }}
          />
          <p className="text-xs text-on-surface-variant">
            El diseñador visual completo (drag-and-drop) se integra en la siguiente iteración.
          </p>
        </div>
      )}

      {!hasDraft && !draft.isLoading && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/60 bg-surface-container-low/50 py-12 text-center">
          <RotateCcw className="h-8 w-8 text-on-surface-variant/50" />
          <p className="text-sm text-on-surface-variant">No hay borrador activo.</p>
          <p className="text-xs text-on-surface-variant/70">Crea uno para empezar a diseñar el layout.</p>
        </div>
      )}

      {/* Version history */}
      {showVersions && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-on-surface">Historial de versiones</p>
          {versions.isLoading && (
            <p className="text-xs text-on-surface-variant">Cargando…</p>
          )}
          {versions.data?.items.map((v) => (
            <div
              key={v.id}
              className="flex items-center justify-between rounded-lg border border-border bg-surface-container-low px-4 py-2.5"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-on-surface-variant">v{v.version}</span>
                <StatusBadge status={v.status} />
                {v.isActive && (
                  <span className="text-xs text-green-700 font-medium">• activo</span>
                )}
                <span className="text-xs text-on-surface-variant">
                  {v.publishedAt ? new Date(v.publishedAt).toLocaleDateString('es-CO') : '—'}
                </span>
              </div>
              {v.status === 'published' && !v.isActive && (
                <button
                  type="button"
                  disabled={activate.isPending}
                  className="rounded px-2 py-1 text-xs border border-border text-on-surface hover:bg-surface-container disabled:opacity-50"
                  onClick={() => activate.mutate(v.version)}
                >
                  Activar
                </button>
              )}
            </div>
          ))}
          {versions.data?.items.length === 0 && (
            <p className="text-xs text-on-surface-variant">Sin versiones publicadas.</p>
          )}
        </div>
      )}
    </div>
  );
}
