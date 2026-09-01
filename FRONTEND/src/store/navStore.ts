import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface NavState {
  /** True while the agent workspace navigation is collapsed to an icon rail. */
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (collapsed: boolean) => void;
}

// Persisted like the theme: collapsing the navigation is a workstation
// preference, not session state — an agent who works on a laptop should not
// have to re-collapse it on every reload. `persist` already tolerates a
// storage that throws (private windows, blocked site data) and falls back to
// the default.
export const useNavStore = create<NavState>()(
  persist(
    (set) => ({
      collapsed: false,
      toggle: () => set((state) => ({ collapsed: !state.collapsed })),
      setCollapsed: (collapsed) => set({ collapsed }),
    }),
    { name: 'nav-storage' },
  ),
);
