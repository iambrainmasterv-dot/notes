import { createContext, useContext, useMemo, type ReactNode } from 'react';

type Ctx = {
  supported: boolean;
  /** Call after changing pin state in localStorage so Android reschedules notifications. */
  notifyPinsChanged: () => void;
};

const AndroidPinContext = createContext<Ctx | null>(null);

export function AndroidPinProvider({
  enabled,
  onPinsChanged,
  children,
}: {
  enabled: boolean;
  onPinsChanged: () => void;
  children: ReactNode;
}) {
  const value = useMemo<Ctx>(
    () => ({
      supported: enabled,
      notifyPinsChanged: onPinsChanged,
    }),
    [enabled, onPinsChanged],
  );

  return <AndroidPinContext.Provider value={value}>{children}</AndroidPinContext.Provider>;
}

export function useAndroidPinSupported(): boolean {
  return useContext(AndroidPinContext)?.supported ?? false;
}

export function useAndroidPinControls(): { supported: boolean; notifyPinsChanged: () => void } {
  const ctx = useContext(AndroidPinContext);
  return {
    supported: ctx?.supported ?? false,
    notifyPinsChanged: ctx?.notifyPinsChanged ?? (() => {}),
  };
}
