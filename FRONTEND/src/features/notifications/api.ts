import { apiRequest } from '@/lib/apiClient';

/**
 * Cliente de notification_service (Fase 4 del ROADMAP del backend).
 *
 * Detrás de Kong con rutas desnudas, igual que el resto de la API:
 * `/notifications`, `/notification-preferences/me` (kong.yml,
 * `strip_path: false`). No hay prefijo `/v1`.
 */

/** Los tres tipos de registro a los que una notificación puede apuntar. */
export type NotificationEntityKey = 'INC' | 'PRB' | 'RFC';

export type NotificationEstado = 'pending' | 'sent' | 'failed' | 'read';

export interface Notification {
  id: string;
  tipoEvento: string;
  /** Ausente en notificaciones que no cuelgan de un registro. */
  entityKey?: NotificationEntityKey | string;
  entityId?: string;
  /** Ruta del frontend hacia el registro, calculada por el backend. */
  enlace?: string;
  canal: string;
  estado: NotificationEstado;
  idioma: string;
  titulo: string;
  cuerpo: string;
  datos?: Record<string, string>;
  leida: boolean;
  creadaEn: string;
  leidaEn?: string;
}

export interface NotificationInbox {
  items: Notification[];
  /** Contador REAL de no leídas, calculado por el backend sobre toda la
   *  bandeja — no `items.filter(...)`, que solo vería la página cargada. */
  noLeidas: number;
}

export interface NotificationPreferences {
  usuarioId: string;
  canales: Record<string, boolean>;
  idioma: string;
  /** Canales con entrega real en este despliegue. El backend lo declara para
   *  que la UI no ofrezca transportes sin proveedor configurado. */
  canalesOperativos: string[];
}

export function listNotifications(soloNoLeidas = false, limit = 20): Promise<NotificationInbox> {
  const params = new URLSearchParams();
  if (soloNoLeidas) params.set('status', 'unread');
  params.set('limit', String(limit));
  return apiRequest<NotificationInbox>(`/notifications?${params.toString()}`);
}

export function markNotificationRead(id: string): Promise<Notification> {
  return apiRequest<Notification>(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' });
}

export function markAllNotificationsRead(): Promise<{ actualizadas: number; noLeidas: number }> {
  return apiRequest<{ actualizadas: number; noLeidas: number }>('/notifications/read-all', {
    method: 'POST',
  });
}

export function getNotificationPreferences(): Promise<NotificationPreferences> {
  return apiRequest<NotificationPreferences>('/notification-preferences/me');
}

export function updateNotificationPreferences(
  canales: Record<string, boolean>,
  idioma: string,
): Promise<NotificationPreferences> {
  return apiRequest<NotificationPreferences>('/notification-preferences/me', {
    method: 'PUT',
    body: JSON.stringify({ canales, idioma }),
  });
}

/**
 * Ruta del frontend a la que debe navegar una notificación.
 *
 * Se prefiere `enlace`, que calcula el backend. El cálculo local es el
 * respaldo para una notificación guardada antes de que `enlace` existiera
 * — no una fuente alternativa de verdad. Devuelve `null` cuando no hay
 * registro al que ir, y entonces la notificación no es clicable: mandar a
 * alguien a una pantalla vacía es peor que no ofrecer el enlace.
 */
export function notificationRoute(notification: Notification): string | null {
  if (notification.enlace) return notification.enlace;
  if (!notification.entityId) return null;
  switch (notification.entityKey) {
    case 'INC':
      return `/app/tickets/${notification.entityId}`;
    case 'PRB':
      return `/app/problems/${notification.entityId}`;
    case 'RFC':
      return `/app/changes/${notification.entityId}`;
    default:
      return null;
  }
}
