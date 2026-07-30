import { createContext } from 'react';
import type { SigtoolsUser } from './auth.service';

export interface AuthState {
  user: SigtoolsUser | null;
  accessLevel: number | null;
  roles: string[];
  permissions: string[];
  isLoading: boolean;
  isAuthenticated: boolean;
}

export interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  refresh: () => Promise<void>;
  can: (permissionKey: string) => boolean;
  isAdmin: boolean;
  displayName: string;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
