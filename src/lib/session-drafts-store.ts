"use client";

// Accès localStorage aux brouillons de séance (Lot 22). Toute la logique pure
// vit dans session-draft.mjs ; ici on ne fait que lire/écrire l'index et
// prévenir les abonnés.
//
// Store externe plutôt qu'un état React : l'écran séance ÉCRIT le brouillon et
// l'onglet Training le LIT, sans lien de parenté entre les deux. La lecture est
// mémoïsée sur la chaîne brute pour que useSyncExternalStore reçoive une
// référence stable (sinon boucle de rendu infinie).
import { DRAFTS_KEY, purgeStale } from "@/lib/session-draft.mjs";

export type DraftSetRow = {
  reps: string;
  weight: string;
  rpe: string;
  touched?: boolean;
};

export type SessionDraft = {
  key: string;
  title: string;
  date: string;
  templateId: string | null;
  editId: string | null;
  startedAt: number;
  updatedAt: number;
  exercises: { name: string; sets: DraftSetRow[] }[];
};

export type DraftIndex = Record<string, SessionDraft>;

const EMPTY: DraftIndex = {};
const listeners = new Set<() => void>();

let lastRaw: string | null | undefined;
let lastParsed: DraftIndex = EMPTY;

function read(): DraftIndex {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(DRAFTS_KEY);
  } catch {
    return EMPTY; // stockage inaccessible : pas de brouillon, jamais d'erreur
  }
  if (raw === lastRaw) return lastParsed;
  lastRaw = raw;
  try {
    lastParsed = raw ? (JSON.parse(raw) as DraftIndex) : EMPTY;
  } catch {
    lastParsed = EMPTY; // index illisible : on repart de zéro
  }
  return lastParsed;
}

function write(next: DraftIndex) {
  try {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(next));
  } catch {
    /* stockage plein : l'état React de la séance en cours reste intact */
  }
  lastRaw = undefined; // force la relecture au prochain snapshot
  listeners.forEach((l) => l());
}

export const draftsStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  get: read,
  /** Rendu serveur : aucun brouillon, le client se resynchronise à l'hydratation. */
  getServer: () => EMPTY,
  save(draft: SessionDraft) {
    write({ ...read(), [draft.key]: draft });
  },
  remove(key: string) {
    const current = read();
    if (!(key in current)) return;
    const next = { ...current };
    delete next[key];
    write(next);
  },
  /** Ménage des brouillons > 24 h. N'écrit QUE si quelque chose disparaît. */
  purge(now: number) {
    const current = read();
    const next = purgeStale(current, now) as DraftIndex;
    if (Object.keys(next).length !== Object.keys(current).length) write(next);
  },
};
