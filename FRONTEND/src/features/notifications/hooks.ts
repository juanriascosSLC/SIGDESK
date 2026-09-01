import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getNotificationPreferences,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  updateNotificationPreferences,
  type NotificationInbox,
  type NotificationPreferences,
} from './api';

export const notificationsQueryKey = ['notifications', 'inbox'] as const;
export const notificationPreferencesQueryKey = ['notifications', 'preferences'] as const;

/**
 * La bandeja del usuario autenticado.
 *
 * `enabled` deja decidir a quien la use si ya hay sesión: consultar sin
 * token produce un 401 que `apiClient` traduce en cierre de sesión, y
 * eso rebotaría al login en cada arranque.
 *
 * NO hay datos de respaldo. Si la petición falla, la campana muestra el
 * error y ofrece reintentar — un mock silencioso haría que un backend
 * caído se viera exactamente igual que uno sano y vacío.
 */
export function useNotifications(options?: { enabled?: boolean; refetchInterval?: number }) {
  return useQuery<NotificationInbox>({
    queryKey: notificationsQueryKey,
    queryFn: () => listNotifications(false, 20),
    enabled: options?.enabled ?? true,
    // El contador tiene que envejecer solo: una notificación nueva llega
    // por un evento de Kafka, no por una acción del usuario en esta
    // pestaña, así que sin refetch periódico la campana se quedaría
    // congelada hasta la siguiente navegación.
    refetchInterval: options?.refetchInterval ?? 60_000,
    refetchOnWindowFocus: true,
    // Un fallo de red se reintenta una vez; más que eso solo retrasa el
    // momento en que el usuario ve el error y puede reintentar a mano.
    retry: 1,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
    },
  });
}

export function useNotificationPreferences(options?: { enabled?: boolean }) {
  return useQuery<NotificationPreferences>({
    queryKey: notificationPreferencesQueryKey,
    queryFn: getNotificationPreferences,
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
    retry: 1,
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      canales,
      idioma,
    }: Pick<NotificationPreferences, 'canales' | 'idioma'>) =>
      updateNotificationPreferences(canales, idioma),
    onSuccess: (preferences) => {
      queryClient.setQueryData(notificationPreferencesQueryKey, preferences);
    },
  });
}
