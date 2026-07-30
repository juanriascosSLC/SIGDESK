import { useCallback, useState } from 'react';

// In-memory undo/redo over any value (FormLayouts for the form designer,
// PageLayoutDefinition for the page designer). Not persisted across
// sessions/reloads — persistent history is out of scope for this increment.
export function useDesignerHistory<T>(initial: T) {
  const [state, setState] = useState<{
    past: T[];
    present: T;
    future: T[];
  }>({ past: [], present: initial, future: [] });

  const commit = useCallback((next: T) => {
    setState((current) => ({
      past: [...current.past, current.present].slice(-50),
      present: next,
      future: [],
    }));
  }, []);

  const undo = useCallback(() => {
    setState((current) => {
      if (current.past.length === 0) return current;
      const previous = current.past[current.past.length - 1];
      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((current) => {
      if (current.future.length === 0) return current;
      const [next, ...rest] = current.future;
      return { past: [...current.past, current.present], present: next, future: rest };
    });
  }, []);

  return {
    present: state.present,
    commit,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
