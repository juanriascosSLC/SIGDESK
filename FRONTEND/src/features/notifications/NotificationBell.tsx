import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Bell, BellOff, Loader2, Mail, RefreshCw, Settings2 } from 'lucide-react';
import { notificationRoute, type Notification } from './api';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationPreferences,
  useNotifications,
  useUpdateNotificationPreferences,
} from './hooks';

/**
 * La campana de notificaciones.
 *
 * Cuatro estados explícitos —cargando, error, vacío, con datos— porque
 * los tres primeros son indistinguibles entre sí si se colapsan en "no
 * hay nada": un backend caído se vería igual que una bandeja limpia, y
 * nadie reportaría el fallo.
 */
export function NotificationBell({ enabled = true }: { enabled?: boolean }) {
  const [abierta, setAbierta] = useState(false);
  const [mostrandoPreferencias, setMostrandoPreferencias] = useState(false);
  const navigate = useNavigate();

  const bandeja = useNotifications({ enabled });
  const marcarLeida = useMarkNotificationRead();
  const marcarTodas = useMarkAllNotificationsRead();
  const preferencias = useNotificationPreferences({
    enabled: enabled && abierta && mostrandoPreferencias,
  });
  const actualizarPreferencias = useUpdateNotificationPreferences();

  // El contador viene del backend, calculado sobre TODA la bandeja. Un
  // `items.filter(...)` solo contaría la página cargada y mostraría menos
  // de las que hay.
  const noLeidas = bandeja.data?.noLeidas ?? 0;

  function abrir() {
    const siguiente = !abierta;
    setAbierta(siguiente);
    // Abrirla consulta al backend: es el momento en que al usuario le
    // importa que el dato esté fresco.
    if (siguiente) void bandeja.refetch();
    if (!siguiente) setMostrandoPreferencias(false);
  }

  function alternarCorreo() {
    const actuales = preferencias.data;
    if (!actuales || !actuales.canalesOperativos.includes('email')) return;
    actualizarPreferencias.mutate({
      canales: { ...actuales.canales, email: !actuales.canales.email },
      idioma: actuales.idioma,
    });
  }

  function alHacerClic(notificacion: Notification) {
    if (!notificacion.leida) marcarLeida.mutate(notificacion.id);
    const ruta = notificationRoute(notificacion);
    if (ruta) {
      setAbierta(false);
      navigate(ruta);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={abrir}
        aria-label={noLeidas > 0 ? `Notifications (${noLeidas} unread)` : 'Notifications'}
        aria-expanded={abierta}
        data-testid="notification-bell"
        className="relative w-10 h-10 rounded-full bg-surface-container-low border border-border/50 flex items-center justify-center text-on-surface-variant hover:text-primary hover:border-primary/40 transition-colors"
      >
        <Bell className="w-4 h-4" />
        {noLeidas > 0 && (
          <span
            data-testid="notification-bell-count"
            className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-status-danger-fg text-white text-[10px] font-black flex items-center justify-center border-2 border-surface shadow-[0_0_10px_rgba(239,68,68,0.5)]"
          >
            {noLeidas > 99 ? '99+' : noLeidas}
          </span>
        )}
      </button>

      {abierta && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAbierta(false)} />
          <div
            data-testid="notification-panel"
            className="absolute right-0 top-12 w-96 bg-surface-container-lowest/95 backdrop-blur-2xl border border-border/50 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden z-50"
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-border/40">
              <h4 className="text-xs font-black uppercase tracking-[0.15em] text-on-surface">
                Notifications
              </h4>
              <div className="flex items-center gap-3">
              {!mostrandoPreferencias && (
              <button
                onClick={() => marcarTodas.mutate()}
                disabled={noLeidas === 0 || marcarTodas.isPending}
                data-testid="notification-mark-all"
                className="text-[10px] font-bold text-primary hover:text-primary/80 transition-colors disabled:opacity-40 disabled:hover:text-primary"
              >
                {marcarTodas.isPending ? 'Marking…' : 'Mark all as read'}
              </button>
              )}
              <button
                type="button"
                onClick={() => setMostrandoPreferencias((value) => !value)}
                aria-label={mostrandoPreferencias ? 'Back to notifications' : 'Configure notifications'}
                data-testid="notification-preferences-button"
                className="text-on-surface-variant hover:text-primary transition-colors"
              >
                <Settings2 className="h-4 w-4" />
              </button>
              </div>
            </div>

            {mostrandoPreferencias ? (
              <NotificationPreferencesPanel
                loading={preferencias.isPending}
                error={preferencias.error instanceof Error ? preferencias.error : null}
                emailOperational={preferencias.data?.canalesOperativos.includes('email') ?? false}
                emailEnabled={preferencias.data?.canales.email ?? false}
                saving={actualizarPreferencias.isPending}
                saveError={actualizarPreferencias.error instanceof Error ? actualizarPreferencias.error : null}
                onToggleEmail={alternarCorreo}
                onRetry={() => void preferencias.refetch()}
              />
            ) : (
            <div className="max-h-96 overflow-y-auto divide-y divide-border/20">
              {bandeja.isPending && (
                <div
                  data-testid="notification-loading"
                  className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-on-surface-variant"
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading notifications…
                </div>
              )}

              {bandeja.isError && (
                <div data-testid="notification-error" className="px-5 py-8 text-center">
                  <AlertTriangle className="w-6 h-6 text-status-warning-icon mx-auto mb-3" />
                  <p className="text-sm text-on-surface">Could not load your notifications.</p>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    {bandeja.error instanceof Error ? bandeja.error.message : 'Unknown error'}
                  </p>
                  <button
                    onClick={() => void bandeja.refetch()}
                    data-testid="notification-retry"
                    className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border/50 px-4 py-2 text-xs font-bold text-on-surface hover:border-primary/40 hover:text-primary transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Retry
                  </button>
                </div>
              )}

              {bandeja.isSuccess && bandeja.data.items.length === 0 && (
                <div
                  data-testid="notification-empty"
                  className="px-5 py-10 text-center text-sm text-on-surface-variant"
                >
                  <BellOff className="w-6 h-6 mx-auto mb-3 opacity-60" />
                  You have no notifications.
                </div>
              )}

              {bandeja.isSuccess &&
                bandeja.data.items.map((notificacion) => (
                  <NotificationRow
                    key={notificacion.id}
                    notificacion={notificacion}
                    onClick={() => alHacerClic(notificacion)}
                  />
                ))}
            </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function NotificationPreferencesPanel({
  loading,
  error,
  emailOperational,
  emailEnabled,
  saving,
  saveError,
  onToggleEmail,
  onRetry,
}: {
  loading: boolean;
  error: Error | null;
  emailOperational: boolean;
  emailEnabled: boolean;
  saving: boolean;
  saveError: Error | null;
  onToggleEmail: () => void;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-on-surface-variant">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading preferences…
      </div>
    );
  }
  if (error) {
    return (
      <div className="px-5 py-8 text-center">
        <AlertTriangle className="mx-auto mb-3 h-6 w-6 text-status-warning-icon" />
        <p className="text-sm text-on-surface">Could not load your preferences.</p>
        <button type="button" onClick={onRetry} className="mt-3 text-xs font-bold text-primary">
          Retry
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-4 px-5 py-5" data-testid="notification-preferences-panel">
      <div>
        <p className="text-sm font-bold text-on-surface">Delivery channels</p>
        <p className="mt-1 text-xs text-on-surface-variant">
          In-app SIG-DESK notifications always remain active.
        </p>
      </div>
      <div className="flex items-center justify-between rounded-xl border border-border/40 bg-surface-container-low px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Mail className="h-4 w-4 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-bold text-on-surface">Email</p>
            <p className="text-[11px] text-on-surface-variant">
              {emailOperational
                ? 'Also receive notifications at your profile email address.'
                : 'Administrator has not configured Microsoft Graph yet.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={emailEnabled}
          disabled={!emailOperational || saving}
          onClick={onToggleEmail}
          data-testid="notification-email-toggle"
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            emailEnabled ? 'bg-primary' : 'bg-on-surface/20'
          }`}
        >
          <span
            className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${
              emailEnabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
      {saveError && (
        <p className="text-xs text-status-danger-fg" role="alert">
          Could not save changes. Please try again.
        </p>
      )}
    </div>
  );
}

function NotificationRow({
  notificacion,
  onClick,
}: {
  notificacion: Notification;
  onClick: () => void;
}) {
  const navegable = notificationRoute(notificacion) !== null;
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`notification-item-${notificacion.id}`}
      className={`flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-on-surface/[0.04] ${
        navegable ? 'cursor-pointer' : 'cursor-default'
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-on-surface leading-snug">{notificacion.titulo}</p>
        {notificacion.cuerpo && (
          <p className="text-xs text-on-surface-variant mt-0.5">{notificacion.cuerpo}</p>
        )}
        <p className="text-[10px] font-mono text-on-surface-variant mt-1">
          {new Date(notificacion.creadaEn).toLocaleString()}
        </p>
      </div>
      {!notificacion.leida && (
        <span
          aria-label="Unread"
          data-testid="notification-unread-dot"
          className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee] shrink-0 mt-1.5"
        />
      )}
    </button>
  );
}
