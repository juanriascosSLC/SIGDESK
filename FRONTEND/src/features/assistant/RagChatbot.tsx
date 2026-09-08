import { useEffect, useState, type ReactNode } from "react";
import {
  Bot,
  BookOpen,
  ChevronRight,
  Minimize2,
  Send,
  ShieldCheck,
  Sparkles,
  Ticket,
  ThumbsDown,
  ThumbsUp,
  RotateCcw,
  X,
} from "lucide-react";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { ApiError, apiRequest } from "../../lib/apiClient";
import { answerLatestTicketForSite, answerTicketByCode, answerTicketFollowUp, answerTicketsByStatus } from './site-ticket-lookup';

type ChatSource = { type: string; id: string; score: number; citation?: string };
type ChatMessage = {
  from: "assistant" | "user";
  text: string;
  time: string;
  sources?: ChatSource[];
  question?: string;
  feedback?: "useful" | "not_useful";
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

const FOCUSED_TICKET_STORAGE_KEY = "sig-desk.assistant.focused-ticket";
const SESSION_STORAGE_KEY = "sig-desk.assistant.session.v1";
const compact = (items: ChatMessage[]) => items.slice(-20);

function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index} className="font-bold text-on-surface">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

/** Renders the small, safe Markdown subset returned by the assistant. */
function AssistantMessageContent({ text }: { text: string }) {
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/\s+(#{1,3}\s+)/g, "\n$1")
    .replace(/\s+(-{3,}|\*{3,}|_{3,})\s+/g, "\n$1\n");
  const lines = normalized.split("\n");
  const blocks: ReactNode[] = [];
  let listItems: { text: string; ordered: boolean }[] = [];

  const flushList = () => {
    if (!listItems.length) return;
    const ordered = listItems[0].ordered;
    const Tag = ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={`list-${blocks.length}`} className={`my-2 space-y-1 pl-5 ${ordered ? "list-decimal" : "list-disc"}`}>
        {listItems.map((item, index) => <li key={index}>{renderInline(item.text)}</li>)}
      </Tag>,
    );
    listItems = [];
  };

  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    const listMatch = line.match(/^([-*+])\s+(.+)$/);
    const orderedMatch = line.match(/^\d+[.)]\s+(.+)$/);
    if (listMatch || orderedMatch) {
      listItems.push({ text: listMatch?.[2] ?? orderedMatch![1], ordered: Boolean(orderedMatch) });
      continue;
    }
    flushList();
    if (!line) continue;
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      blocks.push(<hr key={`rule-${index}`} className="my-3 border-border/60" />);
      continue;
    }
    const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      blocks.push(<p key={`heading-${index}`} className="mt-3 text-sm font-bold text-on-surface">{renderInline(headingMatch[1])}</p>);
      continue;
    }
    blocks.push(<p key={`paragraph-${index}`} className="mb-2 last:mb-0">{renderInline(line)}</p>);
  }
  flushList();
  return <div className="break-words">{blocks}</div>;
}

export default function RagChatbot() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY) ?? "null");
      return Array.isArray(saved?.messages) && saved.messages.length ? saved.messages.slice(-20) : starterMessages;
    } catch { return starterMessages; }
  });
  const [focusedTicketId, setFocusedTicketId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(FOCUSED_TICKET_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The message whose 👎 is awaiting an optional comment, or null. Holding
   *  the object (not an index) keeps `submitFeedback`'s `item === message`
   *  identity check valid while the dialog is open — appending new messages
   *  rebuilds the array but preserves each existing item's reference. */
  const [pendingFeedback, setPendingFeedback] = useState<ChatMessage | null>(null);

  useEffect(() => {
    try { sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ messages: compact(messages), focusedTicketId })); } catch { /* optional */ }
  }, [messages, focusedTicketId]);

  const rememberTicket = (ticketId: string | null) => {
    setFocusedTicketId(ticketId);
    try {
      if (ticketId) sessionStorage.setItem(FOCUSED_TICKET_STORAGE_KEY, ticketId);
      else sessionStorage.removeItem(FOCUSED_TICKET_STORAGE_KEY);
    } catch {
      // Session storage is optional; in-memory context still works.
    }
  };

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text || isSending) return;
    setDraft("");
    setError(null);
    const priorHistory = messages.slice(-6).map((item) => ({ role: item.from === "user" ? "user" : "assistant", content: item.text }));
    setMessages((current) => [
      ...current,
      { from: "user", text, time: "Now" },
    ]);
    setIsSending(true);
    try {
      const exactTicketAnswer = await answerTicketByCode(text);
      if (exactTicketAnswer) {
        rememberTicket(exactTicketAnswer.focusedTicketId ?? null);
        setMessages((current) => [
          ...current,
          {
            from: "assistant",
            question: text,
            text: exactTicketAnswer.answer,
            time: "Now",
            sources: exactTicketAnswer.sources,
          },
        ]);
        return;
      }
      if (focusedTicketId) {
        const followUpAnswer = await answerTicketFollowUp(text, focusedTicketId);
        if (followUpAnswer) {
          rememberTicket(followUpAnswer.focusedTicketId ?? focusedTicketId);
          setMessages((current) => [
            ...current,
            {
              from: "assistant",
              question: text,
              text: followUpAnswer.answer,
              time: "Now",
              sources: followUpAnswer.sources,
            },
          ]);
          return;
        }
      }
      const siteTicketAnswer = await answerLatestTicketForSite(text);
      if (siteTicketAnswer) {
        setMessages((current) => [
          ...current,
          {
            from: "assistant",
            question: text,
            text: siteTicketAnswer.answer,
            time: "Now",
            sources: siteTicketAnswer.sources,
          },
        ]);
        return;
      }
      const statusTicketAnswer = await answerTicketsByStatus(text);
      if (statusTicketAnswer) {
        setMessages((current) => [
          ...current,
          {
            from: "assistant",
            question: text,
            text: statusTicketAnswer.answer,
            time: "Now",
            sources: statusTicketAnswer.sources,
          },
        ]);
        return;
      }
      const response = await apiRequest<ChatResponse>("/ia_advisor/chat", {
        method: "POST",
        body: JSON.stringify({ message: text, history: priorHistory }),
      });
      setMessages((current) => [
        ...current,
        {
          from: "assistant",
          question: text,
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

  const clearConversation = () => {
    setMessages(starterMessages); rememberTicket(null); setError(null);
    try { sessionStorage.removeItem(SESSION_STORAGE_KEY); } catch { /* optional */ }
  };
  /** Posts the feedback exactly as main shipped it: `comment` is the free
   *  text or `""`, and the thumb only latches once the POST succeeded. */
  const submitFeedback = async (message: ChatMessage, rating: "useful" | "not_useful", comment: string) => {
    try {
      await apiRequest("/ia_advisor/feedback", { method: "POST", body: JSON.stringify({ rating, comment, question: message.question, answer: message.text, sources: message.sources ?? [] }) });
      setMessages((current) => current.map((item) => item === message ? { ...item, feedback: rating } : item));
    } catch { setError("Could not record your feedback."); }
  };

  /** 👍 posts straight away with no comment; 👎 opens the reason dialog that
   *  replaced `window.prompt(...)` (banned by beta-ux-honesty.spec.ts — a
   *  native dialog is unstyleable, untestable and untranslatable). The
   *  comment stays OPTIONAL, so confirming an empty textarea reproduces the
   *  old "dismiss the prompt, send the rating anyway" path. Cancel/Escape
   *  sends nothing instead of silently recording the rating: `onClose` is
   *  also Escape and the backdrop, and submitting on those would be a lying
   *  control. Nothing is lost — `feedback` only latches on success, so the
   *  thumbs stay live and the rating can be given again. */
  const requestFeedback = (message: ChatMessage, rating: "useful" | "not_useful") => {
    if (!message.question || message.feedback) return;
    if (rating === "not_useful") {
      setPendingFeedback(message);
      return;
    }
    void submitFeedback(message, "useful", "");
  };

  // Merge of two intentional changes: main reshaped this trigger into a
  // compact 56px FAB with a hover tooltip (replacing the old inline two-line
  // label), while this branch moved it clear of the mobile bottom nav. Both
  // are kept — the shape/tooltip from main, the responsive offset from here,
  // which agent-nav-responsive.spec.ts ("never overlaps the bottom nav")
  // asserts by measuring bounding boxes. The aria-label stays English to
  // match that spec and requester-nav-responsive.spec.ts.
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open SIG Assistant"
        title="SIG Assistant"
        className="group fixed bottom-[calc(56px+env(safe-area-inset-bottom)+1rem)] right-4 md:bottom-6 md:right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full border border-cyan-400/30 bg-surface-container-lowest/95 text-cyan-300 shadow-[0_14px_40px_rgba(0,0,0,0.45),0_0_25px_rgba(34,211,238,0.12)] backdrop-blur-xl transition-all hover:-translate-y-1 hover:border-cyan-300/60 hover:bg-cyan-400/10"
      >
        <Bot size={22} />
        <span className="pointer-events-none absolute right-full mr-3 whitespace-nowrap rounded-lg border border-cyan-400/20 bg-surface-container-lowest/95 px-3 py-1.5 text-xs text-on-surface opacity-0 shadow-lg backdrop-blur-xl transition-opacity group-hover:opacity-100">
          SIG Assistant
        </span>
      </button>
    );

  return (
    <>
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
            <button type="button" onClick={clearConversation} aria-label="New conversation" title="New conversation" className="rounded-lg p-2 text-on-surface-variant hover:bg-on-surface/5">
              <RotateCcw size={15} />
            </button>
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
                {message.from === "assistant" ? <AssistantMessageContent text={message.text} /> : message.text}
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
              {message.from === "assistant" && message.question && (
                <div className="flex items-center gap-1 px-1 text-[10px] text-on-surface-variant">
                  <span>¿Te sirvió?</span>
                  <button type="button" onClick={() => requestFeedback(message, "useful")} disabled={Boolean(message.feedback)} className={message.feedback === "useful" ? "text-emerald-400" : "hover:text-emerald-400"} aria-label="Helpful answer"><ThumbsUp size={12} /></button>
                  <button type="button" onClick={() => requestFeedback(message, "not_useful")} disabled={Boolean(message.feedback)} className={message.feedback === "not_useful" ? "text-red-400" : "hover:text-red-400"} aria-label="Unhelpful answer"><ThumbsDown size={12} /></button>
                  {message.feedback && <span>Gracias</span>}
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
    <ConfirmDialog
      open={pendingFeedback !== null}
      onClose={() => setPendingFeedback(null)}
      onConfirm={(reason) => {
        const target = pendingFeedback;
        setPendingFeedback(null);
        if (target) void submitFeedback(target, "not_useful", reason ?? "");
      }}
      title="Improve this answer"
      description="Your note goes to the team reviewing the assistant. Optional — you can send the rating on its own."
      confirmLabel="Send feedback"
      reasonLabel="What was missing, or how would you improve this answer?"
      reasonPlaceholder="Leave blank to send just the rating."
      reasonRequired={false}
    />
    </>
  );
}
