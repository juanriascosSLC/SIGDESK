import { useState } from "react";
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
} from "lucide-react";
import { ApiError, apiRequest } from "../../lib/apiClient";

type ChatSource = { type: string; id: string; score: number };
type ChatMessage = {
  from: "assistant" | "user";
  text: string;
  time: string;
  sources?: ChatSource[];
};
type ChatResponse = {
  answer: string;
  rag_available: boolean;
  sources: ChatSource[];
};

const starterMessages: ChatMessage[] = [
  {
    from: "assistant",
    text: "Hi, I'm the SIG-DESK assistant. I can look up tickets and authorized knowledge.",
    time: "Now",
  },
  { from: "assistant", text: "What do you need help with today?", time: "Now" },
];

const suggestions = [
  { icon: Ticket, label: "How do I review a ticket?", color: "text-cyan-400" },
  {
    icon: BookOpen,
    label: "Search the Knowledge Base",
    color: "text-violet-400",
  },
  {
    icon: ShieldCheck,
    label: "Look up a policy",
    color: "text-amber-400",
  },
];

export default function RagChatbot() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(starterMessages);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text || isSending) return;
    setDraft("");
    setError(null);
    setMessages((current) => [
      ...current,
      { from: "user", text, time: "Now" },
    ]);
    setIsSending(true);
    try {
      const response = await apiRequest<ChatResponse>("/ia_advisor/chat", {
        method: "POST",
        body: JSON.stringify({ message: text }),
      });
      setMessages((current) => [
        ...current,
        {
          from: "assistant",
          text: response.answer,
          time: "Now",
          sources: response.sources,
        },
      ]);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Couldn't reach the assistant.",
      );
      setMessages((current) => [
        ...current,
        {
          from: "assistant",
          text: "I couldn't process that. Please try again.",
          time: "Now",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open SIG Assistant"
        className="fixed bottom-[calc(56px+env(safe-area-inset-bottom)+1rem)] right-4 md:bottom-6 md:right-6 z-40 flex items-center gap-3 rounded-2xl border border-cyan-400/30 bg-surface-container-lowest/95 px-4 py-3 text-left shadow-[0_14px_40px_rgba(0,0,0,0.45),0_0_25px_rgba(34,211,238,0.12)] backdrop-blur-xl transition-all hover:-translate-y-1 hover:border-cyan-300/60"
      >
        <span className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
          <Bot size={20} />
        </span>
        <span>
          <span className="block text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">
            SIG Assistant
          </span>
          <span className="mt-0.5 block text-xs text-on-surface-variant">
            Ask the knowledge base
          </span>
        </span>
      </button>
    );

  return (
    <section className="fixed bottom-[calc(56px+env(safe-area-inset-bottom)+1rem)] right-4 md:bottom-6 md:right-6 z-40 flex h-[min(680px,calc(100vh-48px-56px))] md:h-[min(680px,calc(100vh-48px))] w-[min(420px,calc(100vw-32px))] flex-col overflow-hidden rounded-3xl border border-cyan-400/25 bg-surface-container-lowest/95 shadow-[0_24px_80px_rgba(0,0,0,0.55),0_0_35px_rgba(34,211,238,0.1)] backdrop-blur-2xl">
      <header className="border-b border-border/40 bg-gradient-to-br from-cyan-500/10 via-transparent to-violet-500/10 px-5 py-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
              <Bot size={22} />
            </div>
            <div>
              <h2 className="text-sm font-black text-on-surface">
                SIG Assistant
              </h2>
              <p className="mt-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> RAG
                system
              </p>
            </div>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Minimize assistant"
              className="rounded-lg p-2 text-on-surface-variant hover:bg-on-surface/5"
            >
              <Minimize2 size={15} />
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
              className="rounded-lg p-2 text-on-surface-variant hover:bg-on-surface/5"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-cyan-400/15 bg-cyan-400/5 px-3 py-2 text-[10px] text-on-surface-variant">
          <Sparkles size={13} className="text-cyan-300" /> Answers based on
          authorized internal knowledge.
        </div>
      </header>
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {messages.map((message, index) => (
          <div
            key={`${message.time}-${index}`}
            className={`flex ${message.from === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`${message.from === "user" ? "items-end" : "items-start"} flex max-w-[88%] flex-col gap-1`}
            >
              <div
                className={`rounded-2xl px-3.5 py-3 text-sm leading-relaxed ${message.from === "user" ? "rounded-br-md bg-cyan-400 text-slate-950" : "rounded-bl-md border border-border/50 bg-surface-container text-on-surface"}`}
              >
                {message.text}
              </div>
              {message.sources && message.sources.length > 0 && (
                <div className="flex flex-wrap gap-1 px-1">
                  <span className="text-[9px] uppercase text-on-surface-variant">
                    Sources:
                  </span>
                  {message.sources.map((source) => (
                    <span
                      key={`${source.type}-${source.id}`}
                      className="rounded-md border border-cyan-400/20 px-1.5 py-0.5 text-[9px] text-cyan-300"
                    >
                      {source.type}/{source.id}
                    </span>
                  ))}
                </div>
              )}
              <span className="px-1 text-[9px] text-on-surface-variant">
                {message.from === "user" ? "You" : "SIG Assistant"} ·{" "}
                {message.time}
              </span>
            </div>
          </div>
        ))}
        {messages.length === starterMessages.length && (
          <div className="space-y-2 pt-2">
            <p className="px-1 text-[9px] font-black uppercase tracking-[0.18em] text-on-surface-variant">
              Suggestions
            </p>
            {suggestions.map(({ icon: Icon, label, color }) => (
              <button
                key={label}
                type="button"
                onClick={() => setDraft(label)}
                className="flex w-full items-center gap-3 rounded-xl border border-border/40 bg-surface-container-low px-3 py-2.5 text-left text-xs text-on-surface-variant hover:border-cyan-400/30"
              >
                <Icon size={15} className={color} />
                <span className="flex-1">{label}</span>
                <ChevronRight size={14} />
              </button>
            ))}
          </div>
        )}
      </div>
      <footer className="border-t border-border/40 bg-surface-container-low/70 p-4">
        <div className="flex items-end gap-2 rounded-2xl border border-border/50 bg-surface-container px-3 py-2 focus-within:border-cyan-400/50">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            rows={1}
            placeholder="Type your question…"
            disabled={isSending}
            className="max-h-24 min-h-6 flex-1 resize-none bg-transparent py-1 text-sm text-on-surface outline-none placeholder:text-on-surface-variant"
          />
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={!draft.trim() || isSending}
            aria-label="Send question"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-cyan-400 text-slate-950 disabled:opacity-30"
          >
            {isSending ? (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950" />
            ) : (
              <Send size={15} />
            )}
          </button>
        </div>
        {error && (
          <p className="mt-2 text-center text-[10px] text-red-400">{error}</p>
        )}
        <p className="mt-2 text-center text-[9px] text-on-surface-variant">
          Answers based on authorized knowledge.
        </p>
      </footer>
    </section>
  );
}
