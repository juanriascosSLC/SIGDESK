import { apiRequest } from '@/lib/apiClient';

export interface AgentToken {
  id: string;
  usuario_id: string;
  nombre: string;
  scopes: string[];
  creado_en: string;
  ultimo_uso_en?: string;
  revocado_en?: string;
}

export interface CreatedAgentToken extends AgentToken {
  token: string;
}

export function listAgentTokens(): Promise<{ items: AgentToken[] }> {
  return apiRequest<{ items: AgentToken[] }>('/v1/agent-tokens');
}

export function createAgentToken(nombre: string): Promise<CreatedAgentToken> {
  return apiRequest<CreatedAgentToken>('/v1/agent-tokens', {
    method: 'POST',
    body: JSON.stringify({ nombre }),
  });
}

export function revokeAgentToken(id: string): Promise<void> {
  return apiRequest<void>(`/v1/agent-tokens/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
