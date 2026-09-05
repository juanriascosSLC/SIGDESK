/**
 * Shared mock-data query primitive for frontend-only, placeholder features
 * (Services — services-department-frontend.md — is the first consumer;
 * the next department-scoped placeholder reuses this instead of hand-
 * rolling its own setTimeout, per Eng Review decision 2A/6). Simulates the
 * latency/rejection shape of a real network call so LoadingState/ErrorState
 * paths are actually exercisable, including from Playwright — by using
 * deterministic sentinel ids in the mock dataset (see
 * features/services/mockData.ts) rather than random failure injection,
 * which a fixed-seed E2E run can't assert against reliably.
 */
export interface MockQueryOptions {
  /** Artificial latency before resolving/rejecting. Defaults to a small,
   *  visible-but-not-annoying delay so LoadingState actually has a moment
   *  to render before Playwright's default assertion timeout. */
  delayMs?: number;
}

const DEFAULT_DELAY_MS = 350;

export function mockQuery<T>(data: T, options: MockQueryOptions = {}): Promise<T> {
  const { delayMs = DEFAULT_DELAY_MS } = options;
  return new Promise((resolve) => {
    setTimeout(() => resolve(data), delayMs);
  });
}

export function mockQueryError(message: string, options: MockQueryOptions = {}): Promise<never> {
  const { delayMs = DEFAULT_DELAY_MS } = options;
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), delayMs);
  });
}
