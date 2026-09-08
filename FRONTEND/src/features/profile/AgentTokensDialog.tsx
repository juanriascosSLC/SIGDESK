import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Copy, KeyRound, LoaderCircle, RefreshCw, ShieldAlert, Trash2, X } from 'lucide-react';
import { createAgentToken, listAgentTokens, revokeAgentToken, type AgentToken, type CreatedAgentToken } from './agentTokens.api';

interface Props {
  onClose: () => void;
}

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleString() : 'Nunca';
}

export default function AgentTokensDialog({ onClose }: Props) {
  const [tokens, setTokens] = useState<AgentToken[]>([]);
  const [name, setName] = useState('');
  const [created, setCreated] = useState<CreatedAgentToken | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listAgentTokens();
      setTokens(response.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible cargar los tokens.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const token = await createAgentToken(name.trim());
      setCreated(token);
      setName('');
      const { token: secret, ...publicToken } = token;
      void secret;
      setTokens((current) => [publicToken, ...current]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible crear el token.');
    } finally {
      setCreating(false);
    }
  };

  const copy = async () => {
    if (!created) return;
    await navigator.clipboard.writeText(created.token);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const revoke = async (token: AgentToken) => {
    if (!window.confirm(`¿Revocar el token “${token.nombre}”? El agente perderá acceso de inmediato.`)) return;
    setError(null);
    try {
      await revokeAgentToken(token.id);
      setTokens((current) => current.filter((item) => item.id !== token.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible revocar el token.');
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="agent-tokens-title">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl border border-border/50 bg-surface-container-lowest shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-border/40 p-6">
          <div>
            <h2 id="agent-tokens-title" className="flex items-center gap-2 text-xl font-black text-on-surface"><KeyRound className="w-5 h-5 text-cyan-400" /> Tokens para agentes</h2>
            <p className="mt-1 text-sm text-on-surface-variant">Permiten que un agente use la CLI con tus permisos de lectura. Guárdalos sólo en el gestor de secretos del agente.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-on-surface-variant hover:bg-on-surface/5 hover:text-on-surface" aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </header>

        <div className="space-y-6 p-6">
          {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

          {created ? (
            <section className="space-y-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5">
              <div className="flex gap-3"><CheckCircle2 className="mt-0.5 w-5 h-5 shrink-0 text-emerald-400" /><div><h3 className="font-bold text-emerald-300">Copia el token ahora</h3><p className="mt-1 text-sm text-on-surface-variant">No volverá a mostrarse. Si se pierde, revócalo y genera uno nuevo.</p></div></div>
              <div className="flex gap-2"><code className="min-w-0 flex-1 overflow-x-auto rounded-xl border border-border/50 bg-surface-container-high px-3 py-3 text-sm text-cyan-300">{created.token}</code><button onClick={() => void copy()} className="rounded-xl border border-border/50 px-3 hover:bg-surface-container" aria-label="Copiar token">{copied ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}</button></div>
              <button onClick={() => setCreated(null)} className="text-sm font-bold text-emerald-300 hover:text-emerald-200">Ya lo guardé</button>
            </section>
          ) : (
            <form onSubmit={create} className="flex flex-col gap-3 rounded-2xl border border-border/40 bg-surface-container-low p-5 sm:flex-row sm:items-end">
              <label className="flex-1 text-sm font-bold text-on-surface">Nombre para reconocer el agente<input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required placeholder="Ej. Claude para troubleshooting" className="mt-2 w-full rounded-xl border border-border/50 bg-surface-container px-3 py-2.5 font-normal text-on-surface outline-none focus:border-cyan-400" /></label>
              <button disabled={creating} className="rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-black text-slate-950 disabled:opacity-60">{creating ? 'Creando…' : 'Crear token'}</button>
            </form>
          )}

          <section className="overflow-hidden rounded-2xl border border-border/40">
            <div className="flex items-center justify-between border-b border-border/40 bg-surface-container-low px-5 py-3"><h3 className="font-bold text-on-surface">Tokens activos</h3><button onClick={() => void load()} className="rounded-lg p-2 text-on-surface-variant hover:bg-on-surface/5" aria-label="Actualizar">{loading ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}</button></div>
            {loading ? <p className="p-6 text-sm text-on-surface-variant">Cargando…</p> : tokens.length === 0 ? <p className="p-6 text-sm text-on-surface-variant">No tienes tokens activos.</p> : <div className="divide-y divide-border/20">{tokens.map((token) => <div key={token.id} className="flex items-center justify-between gap-4 p-4"><div className="min-w-0"><p className="truncate font-bold text-on-surface">{token.nombre}</p><p className="mt-1 text-xs text-on-surface-variant">{token.scopes.join(', ')} · Creado {formatDate(token.creado_en)} · Último uso {formatDate(token.ultimo_uso_en)}</p></div><button onClick={() => void revoke(token)} className="rounded-lg p-2 text-on-surface-variant hover:bg-red-500/10 hover:text-red-400" aria-label={`Revocar ${token.nombre}`}><Trash2 className="w-4 h-4" /></button></div>)}</div>}
          </section>

          <div className="flex gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-on-surface-variant"><ShieldAlert className="mt-0.5 w-5 h-5 shrink-0 text-amber-400" /><p>Un token no expira automáticamente. Revócalo de inmediato si lo pierdes, lo compartes por error o dejas de usar ese agente.</p></div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
