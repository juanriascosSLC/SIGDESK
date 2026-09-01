import { useState } from 'react';
import {
  Bot,
  BookOpen,
  ChevronRight,
  Minimize2,
  Send,
  ShieldCheck,
  Sparkles,
  Ticket,
  X,
} from 'lucide-react';

type ChatMessage = { from: 'assistant' | 'user'; text: string; time: string };

const starterMessages: ChatMessage[] = [
  {
    from: 'assistant',
    text: 'Hola, soy el asistente de SIG-DESK. Puedo ayudarte a encontrar soluciones en la base de conocimiento y consultar el contexto de tus tickets.',
    time: 'Ahora',
  },
  {
    from: 'assistant',
    text: '¿Qué necesitas resolver hoy?',
    time: 'Ahora',
  },
];

const suggestions = [
  { icon: Ticket, label: '¿Cómo reviso un ticket?', color: 'text-cyan-400' },
  { icon: BookOpen, label: 'Buscar en Knowledge Base', color: 'text-violet-400' },
  { icon: ShieldCheck, label: 'Consultar una política', color: 'text-amber-400' },
];

/** Visual shell for the future RAG assistant. It intentionally uses local
 * mock content until the retrieval/session contract is finalized. */
export default function RagChatbot() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState(starterMessages);

  const sendMockMessage = () => {
    const text = draft.trim();
    if (!text) return;
    setMessages((current) => [
      ...current,
      { from: 'user', text, time: 'Ahora' },
      { from: 'assistant', text: 'Estoy preparando una respuesta con el contexto relevante de SIG-DESK…', time: 'Ahora' },
    ]);
    setDraft('');
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir asistente RAG"
        className="fixed bottom-6 right-6 z-40 flex items-center gap-3 rounded-2xl border border-cyan-400/30 bg-surface-container-lowest/95 px-4 py-3 text-left shadow-[0_14px_40px_rgba(0,0,0,0.45),0_0_25px_rgba(34,211,238,0.12)] backdrop-blur-xl transition-all hover:-translate-y-1 hover:border-cyan-300/60"
      >
        <span className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
          <Bot size={20} />
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-surface-container-lowest bg-emerald-400" />
        </span>
        <span>
          <span className="block text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">SIG Assistant</span>
          <span className="mt-0.5 block text-xs text-on-surface-variant">Pregúntale a la base de conocimiento</span>
        </span>
      </button>
    );
  }

  return (
    <section className="fixed bottom-6 right-6 z-40 flex h-[min(680px,calc(100vh-48px))] w-[min(420px,calc(100vw-32px))] flex-col overflow-hidden rounded-3xl border border-cyan-400/25 bg-surface-container-lowest/95 shadow-[0_24px_80px_rgba(0,0,0,0.55),0_0_35px_rgba(34,211,238,0.1)] backdrop-blur-2xl">
      <header className="relative border-b border-border/40 bg-gradient-to-br from-cyan-500/10 via-transparent to-violet-500/10 px-5 py-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.16)]"><Bot size={22} /><span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-surface-container-lowest bg-emerald-400" /></div>
            <div><h2 className="text-sm font-black tracking-wide text-on-surface">SIG Assistant</h2><p className="mt-0.5 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> RAG system · preview</p></div>
          </div>
          <div className="flex items-center gap-1"><button type="button" onClick={() => setOpen(false)} aria-label="Minimizar asistente" className="rounded-lg p-2 text-on-surface-variant hover:bg-on-surface/5 hover:text-on-surface"><Minimize2 size={15} /></button><button type="button" onClick={() => setOpen(false)} aria-label="Cerrar asistente" className="rounded-lg p-2 text-on-surface-variant hover:bg-on-surface/5 hover:text-on-surface"><X size={16} /></button></div>
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-cyan-400/15 bg-cyan-400/5 px-3 py-2 text-[10px] text-on-surface-variant"><Sparkles size={13} className="text-cyan-300" /><span>Respuestas basadas en conocimiento interno y contexto autorizado.</span></div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {messages.map((message, index) => (
          <div key={`${message.time}-${index}`} className={`flex ${message.from === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[88%] ${message.from === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
              <div className={`rounded-2xl px-3.5 py-3 text-sm leading-relaxed ${message.from === 'user' ? 'rounded-br-md bg-cyan-400 text-slate-950' : 'rounded-bl-md border border-border/50 bg-surface-container text-on-surface'}`}>{message.text}</div>
              <span className="px-1 text-[9px] font-mono text-on-surface-variant">{message.from === 'user' ? 'Tú' : 'SIG Assistant'} · {message.time}</span>
            </div>
          </div>
        ))}
        {messages.length === starterMessages.length && <div className="space-y-2 pt-2"><p className="px-1 text-[9px] font-black uppercase tracking-[0.18em] text-on-surface-variant">Sugerencias</p>{suggestions.map(({ icon: Icon, label, color }) => <button key={label} type="button" onClick={() => setDraft(label)} className="flex w-full items-center gap-3 rounded-xl border border-border/40 bg-surface-container-low px-3 py-2.5 text-left text-xs text-on-surface-variant transition-colors hover:border-cyan-400/30 hover:text-on-surface"><Icon size={15} className={color} /><span className="flex-1">{label}</span><ChevronRight size={14} /></button>)}</div>}
      </div>

      <footer className="border-t border-border/40 bg-surface-container-low/70 p-4"><div className="flex items-end gap-2 rounded-2xl border border-border/50 bg-surface-container px-3 py-2 focus-within:border-cyan-400/50"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMockMessage(); } }} rows={1} placeholder="Escribe tu consulta…" className="max-h-24 min-h-6 flex-1 resize-none bg-transparent py-1 text-sm text-on-surface outline-none placeholder:text-on-surface-variant" /><button type="button" onClick={sendMockMessage} disabled={!draft.trim()} aria-label="Enviar consulta" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-cyan-400 text-slate-950 transition-opacity hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-30"><Send size={15} /></button></div><p className="mt-2 text-center text-[9px] text-on-surface-variant">Las respuestas del asistente son una vista previa.</p></footer>
    </section>
  );
}
