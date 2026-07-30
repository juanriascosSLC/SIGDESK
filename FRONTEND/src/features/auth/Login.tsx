import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { User, Lock, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from './useAuth';

/**
 * Sign-in against SIGTools — the same credentials and the same session as
 * SIGInstallations and SIGInventory. Authentication is Active Directory, so
 * the username is the domain account without the @sig.com suffix.
 */
export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const cameFrom = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(username.trim(), password);
      // Land back where the guard interrupted, otherwise the agent workspace.
      navigate(cameFrom && cameFrom !== '/login' ? cameFrom : '/app', { replace: true });
    } catch (submitError) {
      // Show the server's own message: it distinguishes bad credentials from
      // "your AD account exists but has no SIG Tools account", which tells the
      // user whether to retype the password or call IT.
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'No se pudo iniciar sesión. Inténtalo de nuevo.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface-container-lowest flex flex-col justify-center relative overflow-hidden font-sans">
      {/* Background glow effects */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-500/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex flex-col items-center justify-center mb-8 relative group">
          <div className="relative mb-4">
            <div className="absolute -inset-2 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200" />
            <div className="relative p-3 rounded-2xl bg-surface-container-low border border-cyan-500/30 flex items-center justify-center shadow-xl">
              <img src="/logo.png" alt="SIG-DESK Logo" className="w-14 h-14 object-contain drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]" />
            </div>
          </div>
          <div className="text-center mt-2">
            <h1 className="text-3xl font-black tracking-[0.25em] text-on-surface uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">SIG-DESK</h1>
            <div className="text-[10px] font-mono font-bold tracking-[0.4em] text-cyan-500/80 uppercase mt-2">Service Management</div>
          </div>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-surface-container-low/80 backdrop-blur-xl py-8 px-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)] sm:rounded-3xl sm:px-10 border border-border">

          <div className="text-center mb-6">
            <p className="text-sm text-on-surface-variant">
              Ingresa con tu <span className="font-bold text-on-surface">cuenta de dominio SIG</span>
            </p>
            <p className="text-xs text-on-surface-variant/70 mt-1">
              La misma que usas en SIGInstallations y SIGInventory
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="username" className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">
                Usuario
              </label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-on-surface-variant" />
                </div>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  required
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="appearance-none block w-full pl-10 pr-3 py-3 border border-border rounded-xl bg-surface-container-lowest/50 text-on-surface placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm transition-all"
                  placeholder="tu.usuario (sin @sig.com)"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">
                Contraseña
              </label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-on-surface-variant" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="appearance-none block w-full pl-10 pr-3 py-3 border border-border rounded-xl bg-surface-container-lowest/50 text-on-surface placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/25"
              >
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-300 leading-snug">{error}</p>
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-[0_0_15px_rgba(34,211,238,0.3)] text-sm font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 hover:shadow-[0_0_25px_rgba(34,211,238,0.5)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 focus:ring-offset-slate-900 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Ingresando…
                  </>
                ) : (
                  <>
                    Iniciar sesión <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          <p className="mt-6 text-center text-xs text-on-surface-variant/70 leading-relaxed">
            ¿Olvidaste tu contraseña? Es la de tu cuenta de dominio:
            <br />
            restablécela con el equipo de IT.
          </p>
        </div>
      </div>
    </div>
  );
}
