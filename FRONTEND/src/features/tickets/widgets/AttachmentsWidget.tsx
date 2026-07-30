import { useRef } from 'react';
import { Download, FileText, Image as ImageIcon, Paperclip, UploadCloud } from 'lucide-react';
import { attachmentDownloadUrl } from '../api';
import type { TicketPageContext } from './context';

export function AttachmentsWidget({ context }: { context: TicketPageContext }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { items, onUpload, uploadPending, uploadError } = context.attachments;

  return (
    <div className="bg-surface-container-low border border-border/40 rounded-3xl p-6">
      <div className="flex items-center justify-between mb-4 border-b border-border/40 pb-2">
        <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-cyan-400" />
          Attachments
          <span className="px-1.5 py-0.5 rounded-md bg-surface-container-high text-[10px] font-black text-on-surface-variant">
            {items.length}
          </span>
        </h3>
      </div>
      {items.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-4">
          {items.map((attachment) => {
            const isImage = attachment.contentType.startsWith('image/');
            return (
              <div
                key={attachment.id}
                className="flex items-center gap-3 p-3 rounded-2xl bg-surface-container border border-border/40 hover:border-cyan-500/30 transition-colors group"
              >
                <div
                  className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                    isImage
                      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                      : 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20'
                  }`}
                >
                  {isImage ? <ImageIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-on-surface truncate" title={attachment.fileName}>
                    {attachment.fileName}
                  </p>
                  <p className="text-[10px] text-on-surface-variant">
                    {Math.ceil(attachment.sizeBytes / 1024)} KB · {attachment.uploaderName}
                  </p>
                </div>
                <a
                  href={attachmentDownloadUrl(attachment.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 rounded-lg text-on-surface-variant opacity-0 group-hover:opacity-100 hover:text-cyan-400 hover:bg-on-surface/5 transition-all shrink-0"
                >
                  <Download className="w-4 h-4" />
                </a>
              </div>
            );
          })}
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(event) => onUpload(event.target.files)}
      />
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          onUpload(event.dataTransfer.files);
        }}
        className="flex items-center justify-center gap-3 p-4 rounded-2xl border-2 border-dashed border-border/50 text-on-surface-variant hover:border-cyan-500/30 hover:text-cyan-400 transition-colors cursor-pointer"
      >
        <UploadCloud className="w-4 h-4" />
        <span className="text-xs font-bold">
          {uploadPending ? (
            'Uploading…'
          ) : (
            <>
              Drop files here or <span className="text-cyan-400 underline underline-offset-2">browse</span>
            </>
          )}
        </span>
      </div>
      {uploadError && <p className="mt-2 text-sm text-red-400">{uploadError}</p>}
    </div>
  );
}
