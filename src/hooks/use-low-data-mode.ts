import { useEffect, useState } from "react";
import {
  LOW_DATA_EVENT,
  LOW_DATA_STORAGE_KEY,
  parseLowDataPreference,
  readLowDataPreference,
  readSaveDataHint,
  resolveLowDataEnabled,
  subscribeToSaveData,
  writeLowDataPreference,
  type LowDataPreference,
} from "@/lib/offline/low-data";

/** Product photos wait until tap when enabled. Logos, auth, and MFA images
 * are not gated. Preference lives in localStorage; public-shop HTML may still
 * include image URLs before hydrate. */
export function useLowDataMode() {
  const [preference, setPreferenceState] = useState<LowDataPreference>("auto");
  const [saveData, setSaveData] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPreferenceState(readLowDataPreference());
    setSaveData(readSaveDataHint());
    setHydrated(true);

    function refreshPreference() {
      setPreferenceState(readLowDataPreference());
    }
    function refreshSaveData() {
      setSaveData(readSaveDataHint());
    }
    function onStorage(event: StorageEvent) {
      if (event.key === LOW_DATA_STORAGE_KEY || event.key === null) refreshPreference();
    }

    window.addEventListener(LOW_DATA_EVENT, refreshPreference);
    window.addEventListener("storage", onStorage);
    const unsubscribeSaveData = subscribeToSaveData(refreshSaveData);
    return () => {
      window.removeEventListener(LOW_DATA_EVENT, refreshPreference);
      window.removeEventListener("storage", onStorage);
      unsubscribeSaveData();
    };
  }, []);

  function setPreference(value: LowDataPreference) {
    const next = parseLowDataPreference(value);
    setPreferenceState(next);
    writeLowDataPreference(next);
  }

  return {
    preference,
    setPreference,
    saveData,
    enabled: hydrated && resolveLowDataEnabled(preference, saveData),
  };
}
