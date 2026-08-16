/**
 * session.service.ts
 * SIG-DESK's OWN session — `POST /v1/session` on organization_service,
 * behind Kong (ADR-0017 decisión 3).
 *
 * Separate from auth.service.ts on purpose: that module authenticates
 * against SIGTools (identity), this one authorizes against organization_service
 * (role/permissions) once SIGTools has already confirmed who the person is.
 * Correlated by email — never a username or internal SIGTools id (ADR-0017
 * decisión 3; see Docs/howto/bootstrap-primer-admin.md, "El email exacto").
 *
 * A rejection here (404 USUARIO_NO_ENCONTRADO for an identity SIGTools
 * confirmed but organization_service hasn't provisioned yet, or any other
 * failure) is a normal, expected state — not an auth failure to propagate.
 * organization_service still records the access attempt in
 * `identidades_conocidas` even when this throws (EmitirSesionUseCase,
 * TODO-087), so `GET /admin/users` can list the person before an admin
 * assigns them a role. The caller (AuthProvider.refresh) is responsible for
 * degrading to "known identity, no role" instead of surfacing this as a
 * login error.
 */
import { apiRequest } from '@/lib/apiClient';

/** sesionDTO — POST /v1/session response shape
 *  (organization_service adapters/in/dto.go). */
export interface SesionDTO {
  access_token: string;
  expires_in: number;
  role_id: string | null;
  permissions: string[] | null;
}

export const sessionService = {
  /** Exchanges a SIGTools-confirmed email for SIG-DESK's own short-lived JWT. */
  emitir: (email: string): Promise<SesionDTO> =>
    apiRequest<SesionDTO>('/v1/session', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
};
