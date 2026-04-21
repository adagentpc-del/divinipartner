import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type DemoModeContextValue = {
  demoMode: boolean;
  setDemoMode: (v: boolean) => void;
  toggle: () => void;
};

const STORAGE_KEY = "a3:demoMode";
const DemoModeContext = createContext<DemoModeContextValue | null>(null);

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [demoMode, setDemoModeState] = useState<boolean>(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "1") setDemoModeState(true);
    } catch {}
  }, []);

  const setDemoMode = (v: boolean) => {
    setDemoModeState(v);
    try { localStorage.setItem(STORAGE_KEY, v ? "1" : "0"); } catch {}
  };
  const toggle = () => setDemoMode(!demoMode);

  return (
    <DemoModeContext.Provider value={{ demoMode, setDemoMode, toggle }}>
      {children}
    </DemoModeContext.Provider>
  );
}

export function useDemoMode(): DemoModeContextValue {
  const ctx = useContext(DemoModeContext);
  if (!ctx) return { demoMode: false, setDemoMode: () => {}, toggle: () => {} };
  return ctx;
}

/** Hide internal-only fields when demo mode is active. */
export function useDemoSafe<T>(value: T, demoFallback: T): T {
  const { demoMode } = useDemoMode();
  return demoMode ? demoFallback : value;
}
