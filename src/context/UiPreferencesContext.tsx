import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { loadSegmentedBackground, saveSegmentedBackground } from '../services/preferencesService';

interface UiPreferencesValue {
  segmentedBackground: boolean;
  setSegmentedBackground: (value: boolean) => void;
}

// Used when no provider is mounted
const DEFAULT_VALUE: UiPreferencesValue = { segmentedBackground: true, setSegmentedBackground: () => {} };

const UiPreferencesContext = createContext<UiPreferencesValue>(DEFAULT_VALUE);

export function UiPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [segmentedBackground, setState] = useState(true);

  useEffect(() => {
    loadSegmentedBackground().then(setState);
  }, []);

  const setSegmentedBackground = useCallback((next: boolean) => {
    setState(next);
    saveSegmentedBackground(next).catch(e => console.warn('Impossibile salvare la preferenza UI', e));
  }, []);

  const value = useMemo(() => ({ segmentedBackground, setSegmentedBackground }), [segmentedBackground, setSegmentedBackground]);
  return <UiPreferencesContext.Provider value={value}>{children}</UiPreferencesContext.Provider>;
}

export function useUiPreferences(): UiPreferencesValue {
  return useContext(UiPreferencesContext);
}
