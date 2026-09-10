import { Paperclip, Trash2, UploadCloud } from 'lucide-react';
import type { DragEvent } from 'react';
import type { FormPageContext } from './context';

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FormAttachmentsWidget({ context }: { context: FormPageContext }) {
  const { attachments } = context;

  function addDropped(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!context.preview) attachments.onAddFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <section className="rounded-2xl border border-border/50 bg-surface-container p-5" data-testid="form-attachments-widget">
      <div className="mb-3 flex items-center gap-2">
        <Paperclip className="h-4 w-4 text-primary" />
        <h3 className="font-black text-on-surface">Attachments</h3>
        <span className="ml-auto text-xs text-on-surface-variant">{attachments.items.length}/{attachments.maxFiles}</span>
      </div>
      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={addDropped}
        className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-5 text-center"
      >
        <UploadCloud className="mx-auto mb-2 h-6 w-6 text-primary" />
        <p className="text-sm font-semibold text-on-surface">Drag files here</p>
        <p className="mt-1 text-xs text-on-surface-variant">Maximum {formatBytes(attachments.maxBytesPerFile)} per file</p>
        <label className="mt-3 inline-flex cursor-pointer rounded-lg border border-primary/40 px-3 py-2 text-xs font-bold text-primary">
          Choose files
          <input
            type="file"
            multiple
            className="sr-only"
            disabled={context.preview}
            onChange={(event) => {
              attachments.onAddFiles(Array.from(event.target.files ?? []));
              event.currentTarget.value = '';
            }}
          />
        </label>
      </div>
      {attachments.errorMessage && <p role="alert" className="mt-2 text-xs text-red-300">{attachments.errorMessage}</p>}
      {attachments.items.length > 0 && (
        <ul className="mt-3 space-y-2">
          {attachments.items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 rounded-lg bg-surface-container-high px-3 py-2">
              <Paperclip className="h-4 w-4 shrink-0 text-on-surface-variant" />
              <span className="min-w-0 flex-1 truncate text-sm text-on-surface">{item.name}</span>
              <span className="text-xs text-on-surface-variant">{formatBytes(item.size)}</span>
              <button
                type="button"
                aria-label={`Remove ${item.name}`}
                disabled={context.preview || attachments.canRemove === false}
                onClick={() => attachments.onRemove(item.id)}
                className="rounded-md p-1 text-on-surface-variant hover:text-red-300 disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
