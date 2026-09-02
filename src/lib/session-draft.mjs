// Brouillons de séance en cours (Lot 22).
//
// Avant, l'écran séance écrivait son brouillon dans localStorage DÈS LE
// MONTAGE : ouvrir une séance et repartir suffisait à créer un brouillon
// fantôme, et au retour l'app annonçait « Séance en cours restaurée » pour une
// séance jamais commencée. Les brouillons s'accumulaient aussi indéfiniment, un
// par (template, date), sans moyen de savoir depuis un autre écran qu'une
// séance était en cours.
//
// Désormais : un seul index `gb-drafts`, écrit UNIQUEMENT après une vraie
// saisie, lisible en O(1) depuis n'importe quel écran, purgé au-delà de 24 h.
//
// Module JS pur (aucun accès localStorage, aucun React) : testé directement par
// scripts/session-draft.test.mjs. L'accès au stockage vit dans
// src/lib/session-drafts-store.ts.

export const DRAFTS_KEY = "gb-drafts";
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

/** Clé d'un brouillon — inchangée depuis le Lot 3 (compatibilité ascendante). */
export function draftKeyOf({ editId, templateId, date }) {
  return `gb-session-${editId ?? templateId ?? "vierge"}-${date}`;
}

/**
 * Progression « 5/12 séries ». Une série compte quand elle a été TOUCHÉE, pas
 * quand elle est remplie : depuis le Lot 19 les cases arrivent pré-remplies à
 * l'objectif, donc « remplie » vaudrait 12/12 dès l'ouverture.
 */
export function draftProgress(exercises) {
  let done = 0;
  let total = 0;
  for (const ex of exercises ?? []) {
    for (const s of ex.sets ?? []) {
      total += 1;
      if (s?.touched) done += 1;
    }
  }
  return { done, total };
}

/** Un brouillon vaut la peine d'être repris s'il contient une saisie. */
export function isResumable(draft) {
  return Boolean(draft) && draftProgress(draft.exercises).done > 0;
}

/** Purge des brouillons périmés (> 24 h) — un brouillon n'est jamais éternel. */
export function purgeStale(index, now, ttl = DRAFT_TTL_MS) {
  const out = {};
  for (const [key, draft] of Object.entries(index ?? {})) {
    if (draft && typeof draft.updatedAt === "number" && now - draft.updatedAt < ttl) {
      out[key] = draft;
    }
  }
  return out;
}

/** Brouillons à reprendre, du plus récemment touché au plus ancien. */
export function sortedDrafts(index) {
  return Object.values(index ?? {})
    .filter((d) => d && typeof d.updatedAt === "number")
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Prochain numéro de clé pour un exercice ajouté à la main.
 *
 * Les clés `add-N` sont PERSISTÉES dans le brouillon. Repartir de 0 après une
 * reprise recréerait `add-0` alors qu'il existe déjà : React verrait deux
 * éléments de même clé, `patchExercise` écrirait dans les deux à la fois et
 * supprimer l'un supprimerait l'autre.
 */
export function nextAddSeq(exercises) {
  let max = -1;
  for (const ex of exercises ?? []) {
    const m = /^add-(\d+)$/.exec(ex?.key ?? "");
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

/** Lien de reprise vers l'écran séance, dans l'état exact où il a été quitté. */
export function resumeHref(draft) {
  const params = new URLSearchParams();
  if (draft.editId) params.set("edit", draft.editId);
  else if (draft.templateId) params.set("template", draft.templateId);
  params.set("date", draft.date);
  return `/training/muscu?${params.toString()}`;
}
