import { useEffect, useState } from "react";

/** navigator.onLine has known false positives (it only reflects whether the
 * network interface is up, not whether the server is actually reachable) —
 * but combined with treating real fetch failures as the authoritative signal
 * elsewhere, it's a reasonable fast UI hint for "should I even try." */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }
    function handleOffline() {
      setIsOnline(false);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}
