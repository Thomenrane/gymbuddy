"use client";

import { useEffect } from "react";

/**
 * Lot 24 : l'écran ne s'éteint plus pendant une séance.
 *
 * Entre deux séries on ne touche pas le téléphone : il se verrouille, et il
 * faut le déverrouiller à chaque saisie. `navigator.wakeLock` règle ça
 * nativement. Le verrou est relâché par le navigateur dès que l'onglet passe en
 * arrière-plan, d'où la reprise sur `visibilitychange`.
 *
 * Entièrement optionnel : API absente (iOS ancien), refus du navigateur ou
 * batterie faible → on n'insiste pas, la séance fonctionne pareil.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) {
      return;
    }
    let sentinel: WakeLockSentinel | null = null;
    let released = false;

    const acquire = async () => {
      if (released || document.visibilityState !== "visible") return;
      try {
        const lock = await navigator.wakeLock.request("screen");
        // Le démontage a pu arriver PENDANT la requête : le cleanup a alors vu
        // `sentinel` encore null et n'a rien relâché. Sans ce second contrôle,
        // le verrou est accordé après la mort de l'effet et plus personne ne
        // peut le rendre — l'écran reste allumé sur toute l'app.
        if (released) {
          void lock.release().catch(() => {});
          return;
        }
        sentinel = lock;
      } catch {
        /* refus (batterie faible, onglet caché) : sans conséquence */
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);
}
