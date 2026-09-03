"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  CircleNotch,
  Info,
  NotePencil,
  Plus,
  Question,
  Timer,
  X,
} from "@phosphor-icons/react";
import { Sheet } from "@/components/ui/sheet";
import {
  getExercisePrefill,
  saveWorkout,
  saveWorkoutDraft,
  deleteWorkoutDraft,
  acceptTargetSuggestion,
  declineTargetSuggestion,
  type DraftExercise,
} from "@/app/(tabs)/training/training-actions";
import { PROGRESSION_HINT } from "@/lib/training";
import { stepValue } from "@/lib/session-controls.mjs";
import { formatSuggestion } from "@/lib/progression.mjs";
import { useWakeLock } from "@/lib/use-wake-lock";
import { RestTimer } from "./rest-timer";

export type EditorExercise = {
  key: string;
  exerciseId?: string;
  name: string;
  note?: string | null;
  repRange?: string | null;
  rpe?: number | null;
  rest?: number | null;
  refSummary?: string | null;
  refDate?: string | null;
  // Lot 14 : cible de poids posée par Claude (indicatif, distinct du dernier fait).
  targetWeight?: number | null;
  targetNote?: string | null;
  // Lot 19 : objectif assemblé (« 4×6 @ 67.5 kg »). Les cases sont pré-remplies
  // avec, donc il ne s'affiche PAS dans le flux : il vit derrière le ⓘ, pour
  // qu'on puisse le retrouver après avoir tapé dans les cases.
  targetLabel?: string | null;
  // Lot 29 : proposition de progression, calculée à la LECTURE (deux dernières
  // séances réussies). Poids signés — sur un exercice assisté, `to` est plus
  // GRAND que `from` (-14 → -12 : moins d'aide).
  suggestion?: { from: number; to: number; step: number } | null;
  assist: boolean; // poids saisis en assistance (stockés négatifs)
  // Lot 18 : note libre pour CET exercice ce jour-là ("assistance -14 pour
  // tenir propre") — facultative, jamais bloquante. Distincte de `note`
  // (convention catalogue) et de la note de séance globale.
  sessionNote?: string;
  // `touched` (Lot 22) : la série a été saisie à la main. Depuis le Lot 19 les
  // cases arrivent pré-remplies, donc « remplie » ne veut plus dire « faite ».
  sets: { reps: string; weight: string; rpe: string; touched?: boolean }[];
};

type CatalogItem = { id: string; name: string; note: string | null };

const inputCls =
  "h-11 w-full rounded-md border border-border bg-surface-raised px-2.5 text-center text-base outline-none focus:border-muted";

const RPE_COL_KEY = "gb-rpe-col";

/** Ligne des boutons ± sous la case en cours de saisie (Lot 24). */
const stepRowCls = "mt-1 flex gap-1.5";

/**
 * Préférence « colonne RPE visible », lue dans localStorage sans setState dans
 * un effet : le rendu serveur part toujours de `false`, le client se
 * resynchronise à l'hydratation. Store minimal partagé par useSyncExternalStore.
 */
const rpeColStore = {
  listeners: new Set<() => void>(),
  subscribe(listener: () => void) {
    rpeColStore.listeners.add(listener);
    return () => {
      rpeColStore.listeners.delete(listener);
    };
  },
  get() {
    try {
      return localStorage.getItem(RPE_COL_KEY) === "1";
    } catch {
      return false; // stockage inaccessible : colonne masquée, défaut
    }
  },
  set(value: boolean) {
    try {
      localStorage.setItem(RPE_COL_KEY, value ? "1" : "0");
    } catch {
      /* préférence non mémorisée : sans conséquence sur la séance */
    }
    rpeColStore.listeners.forEach((l) => l());
  },
};

/** « 2026-08-28 » → « 28/08 » : la date longue mangeait la ligne de contexte. */
const shortDate = (iso: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : iso;

export function SessionEditor({
  title,
  date,
  templateId,
  editId,
  draftId = null,
  draftStartedAt = null,
  initialExercises,
  catalog,
  initialMeta,
}: {
  title: string;
  date: string;
  templateId: string | null;
  editId: string | null;
  /** Lot 27 : brouillon repris depuis la base (ligne « En cours »). */
  draftId?: string | null;
  /** Heure de début du brouillon repris — sinon la durée pré-remplie à
   *  « Terminer » repartirait de zéro à chaque reprise. */
  draftStartedAt?: number | null;
  initialExercises: EditorExercise[];
  catalog: CatalogItem[];
  initialMeta?: { duration: string; intensity: number | null; notes: string };
}) {
  const resumed = draftId != null;
  const router = useRouter();
  const [exercises, setExercises] = useState(initialExercises);
  const [helpOpen, setHelpOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  // Champs note dépliés manuellement (en plus de ceux qui ont déjà une note).
  const [noteOpen, setNoteOpen] = useState<Record<string, boolean>>({});
  // Lot 19 : détail d'un exercice (objectif, fourchette, notes) déplié à la
  // demande — le flux ne garde qu'UNE ligne de contexte, « Dernière ».
  const [infoOpen, setInfoOpen] = useState<Record<string, boolean>>({});
  // Lot 29 : propositions déjà tranchées dans CETTE session d'écran. Le serveur
  // a la vérité, mais l'attendre laisserait la pastille affichée après le tap.
  const [decided, setDecided] = useState<Record<string, boolean>>({});
  // Colonne RPE masquée par défaut : un tiers de la largeur pour un champ
  // rarement rempli. Préférence globale, mémorisée localement.
  const rpeCol = useSyncExternalStore(rpeColStore.subscribe, rpeColStore.get, () => false);
  // Exercice en cours de chargement dans la sheet « Ajouter » (Lot 20).
  const [pendingId, setPendingId] = useState<string | null>(null);
  // Jeton d'annulation : la sheet reste fermable pendant la lecture du contexte
  // (scrim et ✕ ne sont pas désactivés). Sans lui, fermer puis se raviser
  // ajoutait quand même l'exercice ~200 ms plus tard, tout en bas de la séance.
  const pickToken = useRef(0);
  // Compteur d'ajouts : donne une clé React unique sans horloge (une clé
  // dérivée de Date.now() est impure et casserait un rendu concurrent).
  const [addSeq, setAddSeq] = useState(0);
  // Lot 24 : repos en cours (échéance absolue) et case actuellement saisie,
  // au-dessus de laquelle s'affichent les boutons ±.
  const [rest, setRest] = useState<{ endsAt: number; total: number } | null>(null);
  const [focused, setFocused] = useState<{
    key: string;
    index: number;
    field: "reps" | "weight";
  } | null>(null);
  const startedAt = useRef(draftStartedAt ?? Date.now());
  // Une séance déjà notée en RPE (édition) affiche la colonne quoi qu'il arrive :
  // on ne masque jamais une donnée saisie.
  const rpeVisible =
    rpeCol || exercises.some((ex) => ex.sets.some((s) => s.rpe.trim() !== ""));
  // L'écran reste allumé tant que la séance est ouverte (Lot 24).
  useWakeLock(true);
  const gridCls = rpeVisible
    ? "grid grid-cols-[1.5rem_1fr_1fr_3.25rem_2rem] items-center gap-1.5"
    : "grid grid-cols-[1.5rem_1fr_1fr_2rem] items-center gap-1.5";

  // Lot 27 : la séance en cours vit EN BASE, plus dans le localStorage.
  //
  // L'ancienne persistance n'écrivait que si le PO MODIFIAIT une case
  // (drapeau `dirty`). Or depuis le Lot 19 les cases arrivent pré-remplies à
  // l'objectif : une séance faite exactement comme prévu ne touchait rien, donc
  // rien n'était écrit, donc il n'y avait rien à reprendre. Le déclencheur est
  // maintenant l'OUVERTURE elle-même — choisir un template et arriver ici est
  // déjà un acte volontaire —, et la ligne « En cours » de l'onglet Training
  // porte un bouton pour l'abandonner d'un tap.
  //
  // Une ÉDITION de séance passée (editId) n'ouvre aucun brouillon : elle a déjà
  // sa ligne dans `workouts`.
  const draftIdRef = useRef<string | null>(draftId);
  const savingRef = useRef(false);
  // Séance en cours d'enregistrement : plus aucune écriture de brouillon, sinon
  // un autosave en vol recréerait la ligne « En cours » juste après que
  // saveWorkout l'a supprimée.
  const finishingRef = useRef(false);
  const pendingRef = useRef(false);

  useEffect(() => {
    if (editId) return;
    let cancelled = false;

    const flush = async () => {
      if (cancelled || finishingRef.current) return;
      // Une seule écriture en vol : sans ce verrou, deux frappes rapprochées
      // partent en parallèle sans brouillon connu et créent DEUX lignes
      // « En cours » pour la même séance.
      if (savingRef.current) {
        pendingRef.current = true;
        return;
      }
      savingRef.current = true;
      try {
        const res = await saveWorkoutDraft({
          id: draftIdRef.current,
          date,
          type: "muscu",
          templateId,
          title,
          payload: { exercises, startedAt: startedAt.current },
        });
        if (cancelled) return;
        if ("ok" in res) draftIdRef.current = res.id;
        // Brouillon disparu (terminé ou abandonné ailleurs) : on ne le
        // ressuscite pas dans le dos du PO, on cesse simplement d'écrire.
        else if (/introuvable/i.test(res.error)) draftIdRef.current = null;
      } finally {
        savingRef.current = false;
        if (pendingRef.current && !cancelled) {
          pendingRef.current = false;
          void flush();
        }
      }
    };

    // Débounce : une séance, c'est des dizaines de frappes ; on n'écrit pas à
    // chaque caractère.
    const id = setTimeout(flush, 1200);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [exercises, date, templateId, title, editId]);

  /** Proposition encore à trancher pour cet exercice. */
  function pendingSuggestion(ex: EditorExercise) {
    return decided[ex.key] ? null : (ex.suggestion ?? null);
  }

  async function decideSuggestion(ex: EditorExercise, accept: boolean) {
    const s = ex.suggestion;
    if (!s) return;
    // Optimiste : la pastille disparaît au tap. En cas d'échec serveur on la
    // remet, plutôt que de laisser croire que la cible a bougé.
    setDecided((prev) => ({ ...prev, [ex.key]: true }));
    const res = accept
      ? await acceptTargetSuggestion({ exercise_name: ex.name, to: s.to })
      : ex.exerciseId
        ? await declineTargetSuggestion({ exercise_id: ex.exerciseId, to: s.to })
        : { ok: true as const };
    if ("error" in res) setDecided((prev) => ({ ...prev, [ex.key]: false }));
  }

  /** « Réinitialiser » : on jette le brouillon et on repart du pré-rempli.
   *  (À l'ENREGISTREMENT, c'est saveWorkout qui l'efface, dans le même
   *  aller-retour — voir son commentaire.) */
  async function resetDraft() {
    const id = draftIdRef.current;
    draftIdRef.current = null;
    if (id) await deleteWorkoutDraft(id);
    setFocused(null);
    setExercises(initialExercises);
    // Sans ça, la durée pré-remplie à « Terminer » compte depuis le brouillon
    // jeté — potentiellement plusieurs heures avant la séance réelle.
    startedAt.current = Date.now();
    setAddSeq(0);
    setRest(null);
  }

  /** Toute modification passe par ici. Depuis le Lot 27 elle ne conditionne
   *  plus l'existence du brouillon (il naît à l'ouverture) : elle en déclenche
   *  seulement l'écriture. */
  function mutate(next: (prev: EditorExercise[]) => EditorExercise[]) {
    setExercises(next);
  }

  function patchExercise(key: string, patch: Partial<EditorExercise>) {
    mutate((prev) => prev.map((ex) => (ex.key === key ? { ...ex, ...patch } : ex)));
  }

  /** Saisie d'une case : la série est marquée « touchée » (progression). */
  function patchSet(
    ex: EditorExercise,
    index: number,
    field: "reps" | "weight" | "rpe",
    value: string
  ) {
    patchExercise(ex.key, {
      sets: ex.sets.map((s, j) =>
        j === index ? { ...s, [field]: value, touched: true } : s
      ),
    });
  }

  /**
   * Lot 20 : un exercice ajouté en cours de séance arrive avec les mêmes
   * informations qu'un exercice de template (objectif dans les cases, ligne
   * « Dernière », consignes derrière le ⓘ). Un exercice créé à la volée — ou
   * dont la lecture échoue — garde l'ancien comportement : 3 séries vides,
   * aucun chiffre inventé.
   */
  async function pickExercise(item: { id?: string; name: string; note: string | null }) {
    setAddSeq(addSeq + 1);
    const blank: EditorExercise = {
      key: `add-${addSeq}`,
      exerciseId: item.id,
      name: item.name,
      note: item.note,
      assist: false,
      sets: [
        { reps: "", weight: "", rpe: "" },
        { reps: "", weight: "", rpe: "" },
        { reps: "", weight: "", rpe: "" },
      ],
    };
    if (!item.id) {
      mutate((prev) => [...prev, blank]);
      setAddOpen(false);
      return;
    }
    setPendingId(item.id);
    const token = ++pickToken.current;
    const prefill = await getExercisePrefill(item.id).catch(() => null);
    if (token !== pickToken.current) return; // sheet fermée entre-temps
    mutate((prev) => [...prev, prefill ? { ...prefill, key: blank.key } : blank]);
    setPendingId(null);
    setAddOpen(false);
  }

  /** Boutons ± : ajuste la case saisie sans repasser par le clavier. */
  function stepFocused(delta: number) {
    if (!focused) return;
    const ex = exercises.find((e) => e.key === focused.key);
    if (!ex) return;
    patchSet(ex, focused.index, focused.field, stepValue(ex.sets[focused.index]?.[focused.field], delta));
  }

  function move(key: string, delta: -1 | 1) {
    mutate((prev) => {
      const i = prev.findIndex((e) => e.key === key);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  return (
    // Le chrono est une barre fixe à 64 px du bas : sans marge supplémentaire
    // il recouvre le dernier élément de la page, c'est-à-dire « Terminer la
    // séance ».
    <main className={`space-y-4 ${rest ? "pb-20" : ""}`}>
      <div className="flex items-center justify-between">
        <Link
          href={`/training/day/${date}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted"
        >
          <ArrowLeft size={16} aria-hidden />
          {date}
        </Link>
        {resumed && (
          <button
            type="button"
            onClick={() => void resetDraft()}
            className="text-sm text-muted underline underline-offset-2"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {/* Les deux rappels dépliables (double progression + échelle RPE)
          occupaient ~90 px en tête de CHAQUE séance : ils vivent maintenant
          derrière ce « ? ». */}
      <div className="flex items-start justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <button
          type="button"
          aria-label="Aide : double progression, RPE, affichage"
          onClick={() => setHelpOpen(true)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border text-muted active:bg-surface-raised"
        >
          <Question size={18} />
        </button>
      </div>
      {resumed && (
        <p className="text-sm text-accent">Séance en cours restaurée.</p>
      )}

      <div className="space-y-4">
        {exercises.map((ex, exIndex) => (
          <section key={ex.key} className="rounded-lg border border-border bg-surface p-3">
            {/* Lot 19 : UNE seule ligne de contexte dans le flux (« Dernière »).
                L'objectif est dans les cases, pré-rempli ; la fourchette, le
                RPE cible, le repos et les notes longues de Claude vivent
                derrière le ⓘ — sur le screenshot du PO elles prenaient jusqu'à
                9 lignes de texte pour 3 lignes de saisie. */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-1.5">
                  <h2 className="truncate font-semibold leading-tight">{ex.name}</h2>
                  {pendingSuggestion(ex) && (
                    <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-on-primary">
                      Nouveau
                    </span>
                  )}
                  {(hasDetail(ex) || pendingSuggestion(ex)) && (
                    <button
                      type="button"
                      aria-label={`${ex.name} : objectif et consignes`}
                      aria-expanded={Boolean(infoOpen[ex.key])}
                      onClick={() =>
                        setInfoOpen((prev) => ({ ...prev, [ex.key]: !prev[ex.key] }))
                      }
                      className="-m-2.5 shrink-0 p-2.5 text-muted active:text-foreground"
                    >
                      <Info size={16} />
                    </button>
                  )}
                </div>
                {ex.refSummary && (
                  <p className="mt-0.5 text-xs text-muted">
                    Dernière : <span className="text-foreground">{ex.refSummary}</span>
                    {ex.refDate && <span className="text-faint"> · {shortDate(ex.refDate)}</span>}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <IconBtn label="Monter" disabled={exIndex === 0} onClick={() => move(ex.key, -1)}>
                  <ArrowUp size={16} />
                </IconBtn>
                <IconBtn
                  label="Descendre"
                  disabled={exIndex === exercises.length - 1}
                  onClick={() => move(ex.key, 1)}
                >
                  <ArrowDown size={16} />
                </IconBtn>
                <IconBtn
                  label={`Retirer ${ex.name}`}
                  onClick={() => {
                    setFocused(null);
                    mutate((prev) => prev.filter((e) => e.key !== ex.key));
                  }}
                >
                  <X size={16} />
                </IconBtn>
              </div>
            </div>

            {infoOpen[ex.key] && (
                <ExerciseDetail
                  ex={ex}
                  suggestion={pendingSuggestion(ex)}
                  onDecide={(accept) => void decideSuggestion(ex, accept)}
                />
              )}

            <div className="mt-2 space-y-1.5">
              <div className={`${gridCls} text-xs text-faint`}>
                <span />
                <span className="text-center">reps</span>
                <span className="text-center">
                  {ex.assist ? "assist. (kg)" : "poids (kg)"}
                </span>
                {rpeVisible && <span className="text-center">RPE</span>}
                <span />
              </div>
              {ex.sets.map((set, i) => (
                <div key={i} className={gridCls}>
                  <span className="text-center text-sm text-muted">{i + 1}</span>
                  <input
                    aria-label={`${ex.name} série ${i + 1} reps`}
                    inputMode="numeric"
                    value={set.reps}
                    onFocus={() => setFocused({ key: ex.key, index: i, field: "reps" })}
                    onChange={(e) => patchSet(ex, i, "reps", e.target.value)}
                    className={inputCls}
                  />
                  <input
                    aria-label={`${ex.name} série ${i + 1} poids`}
                    inputMode="decimal"
                    placeholder="PDC"
                    value={set.weight}
                    onFocus={() => setFocused({ key: ex.key, index: i, field: "weight" })}
                    onChange={(e) => patchSet(ex, i, "weight", e.target.value)}
                    className={inputCls}
                  />
                  {/* RPE ressenti optionnel : placeholder = RPE cible s'il existe.
                      Jamais requis, ne bloque pas la validation s'il est vide.
                      Colonne masquée par défaut depuis le Lot 19 (préférence
                      dans la sheet « ? ») — la valeur saisie reste intacte. */}
                  {rpeVisible && (
                    <input
                      aria-label={`${ex.name} série ${i + 1} RPE ressenti (optionnel)`}
                      inputMode="decimal"
                      placeholder={ex.rpe ? String(ex.rpe) : "–"}
                      value={set.rpe}
                      onChange={(e) => patchSet(ex, i, "rpe", e.target.value)}
                      className={`${inputCls} px-1 text-sm text-muted`}
                    />
                  )}
                  <IconBtn
                    label={`Supprimer la série ${i + 1}`}
                    onClick={() => {
                      // Les index glissent : garder `focused` ferait porter les
                      // boutons ± sur la série qui prend la place.
                      setFocused(null);
                      patchExercise(ex.key, {
                        sets: ex.sets.filter((_, j) => j !== i),
                      });
                    }}
                  >
                    <X size={16} />
                  </IconBtn>
                  {/* Lot 24 : ajustement au pouce de la case saisie — taper
                      « 67.5 » au clavier numérique avec les mains moites est le
                      vrai frein en salle. N'apparaît que sous la case
                      concernée, donc la densité gagnée au Lot 19 reste intacte.

                      La ligne NE SE REPLIE PAS au blur, et ce n'est pas un
                      oubli : se replier ferait remonter de ~40 px tout ce qui
                      est en dessous ENTRE le pointerdown et le pointerup, et le
                      tap suivant (⏱, « + Série », assistance, note, ✕)
                      atterrirait à côté. Constaté en pilotant l'app pour de
                      vrai. Elle suit donc la dernière case saisie et ne bouge
                      qu'au focus suivant — moment où le doigt est déjà sur sa
                      cible, une case. Effet de bord utile : on peut corriger la
                      dernière valeur sans rouvrir le clavier. */}
                  {focused?.key === ex.key && focused.index === i && (
                    <div className={`col-span-full ${stepRowCls}`}>
                      {(focused.field === "reps"
                        ? [-1, 1]
                        : [-2.5, 2.5]
                      ).map((delta) => (
                        <button
                          key={delta}
                          type="button"
                          aria-label={`${delta > 0 ? "Augmenter" : "Diminuer"} ${
                            focused.field === "reps" ? "les reps" : "le poids"
                          } de ${Math.abs(delta)}`}
                          // Garde le focus dans la case : sans ça, le blur
                          // ferme cette ligne avant que le clic n'arrive.
                          onPointerDown={(e) => e.preventDefault()}
                          onClick={() => stepFocused(delta)}
                          className="h-11 flex-1 rounded-md border border-border bg-surface-raised text-sm font-medium text-muted active:bg-surface"
                        >
                          {delta > 0 ? "+" : "−"}
                          {String(Math.abs(delta)).replace(".", ",")}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const last = ex.sets.at(-1);
                  patchExercise(ex.key, {
                    // reprend reps/poids de la dernière série ; RPE remis à zéro
                    // (ressenti frais à chaque série).
                    sets: [
                      ...ex.sets,
                      last
                        ? { reps: last.reps, weight: last.weight, rpe: "" }
                        : { reps: "", weight: "", rpe: "" },
                    ],
                  });
                }}
                className="flex h-9 flex-1 items-center justify-center gap-1 rounded-md border border-dashed border-border text-sm text-muted active:bg-surface-raised"
              >
                <Plus size={14} /> Série
              </button>
              <button
                type="button"
                aria-pressed={ex.assist}
                onClick={() => patchExercise(ex.key, { assist: !ex.assist })}
                className={`h-9 rounded-md border px-3 text-sm font-medium ${
                  ex.assist
                    ? "border-primary bg-primary text-on-primary"
                    : "border-border text-muted"
                }`}
              >
                assistance
              </button>
              {/* Lot 24 : `rest_seconds` du template n'était qu'un texte
                  affiché. Le bouton lance enfin le compte à rebours. */}
              {ex.rest != null && ex.rest > 0 && (
                <IconBtn
                  label={`Lancer le repos de ${ex.rest}s`}
                  onClick={() =>
                    setRest({ endsAt: Date.now() + ex.rest! * 1000, total: ex.rest! })
                  }
                >
                  <Timer size={16} />
                </IconBtn>
              )}
              <IconBtn
                label={`${ex.name} : note d'exercice (optionnel)`}
                onClick={() =>
                  setNoteOpen((prev) => ({ ...prev, [ex.key]: !prev[ex.key] }))
                }
              >
                <NotePencil size={16} />
              </IconBtn>
            </div>

            {/* Lot 18 : contexte qualitatif du mouvement ce jour-là — jamais
                requis, ne bloque jamais la validation. Distinct de la note de
                séance globale (sheet « Terminer »). */}
            {(noteOpen[ex.key] || (ex.sessionNote ?? "") !== "") && (
              <input
                aria-label={`${ex.name} note d'exercice (optionnel)`}
                placeholder="Note exercice (optionnel) — ex. assistance -14 pour tenir propre"
                value={ex.sessionNote ?? ""}
                onChange={(e) =>
                  patchExercise(ex.key, { sessionNote: e.target.value })
                }
                className="mt-2 h-11 w-full rounded-md border border-border bg-surface-raised px-2.5 text-sm outline-none placeholder:text-faint focus:border-muted"
              />
            )}
          </section>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setAddOpen(true)}
        className="flex h-12 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border font-medium text-muted active:bg-surface"
      >
        <Plus size={18} /> Ajouter un exercice
      </button>

      <button
        type="button"
        onClick={() => setFinishOpen(true)}
        disabled={exercises.length === 0}
        className="h-13 w-full rounded-md bg-primary py-3.5 font-semibold text-on-primary disabled:opacity-50"
      >
        Terminer la séance
      </button>

      {rest && (
        <RestTimer
          key={rest.endsAt}
          endsAt={rest.endsAt}
          total={rest.total}
          onDone={() => setRest(null)}
          onCancel={() => setRest(null)}
        />
      )}

      {helpOpen && (
        <HelpSheet
          onClose={() => setHelpOpen(false)}
          rpeCol={rpeCol}
          onToggleRpeCol={() => rpeColStore.set(!rpeCol)}
        />
      )}

      {addOpen && (
        <AddExerciseSheet
          catalog={catalog}
          pendingId={pendingId}
          onClose={() => {
            pickToken.current += 1; // annule un ajout encore en vol
            setPendingId(null);
            setAddOpen(false);
          }}
          onPick={pickExercise}
        />
      )}

      {finishOpen && (
        <FinishSheet
          onClose={() => setFinishOpen(false)}
          initialMeta={initialMeta}
          startedAt={startedAt.current}
          isEdit={Boolean(editId)}
          onSave={async (meta) => {
            const payload: DraftExercise[] = exercises.map((ex) => ({
              exerciseId: ex.exerciseId,
              name: ex.name,
              note: ex.sessionNote?.trim() || null,
              sets: ex.sets.map((s) => {
                // Pas de « || null » ici : 0 rep est une valeur légitime, et le
                // bouton « − » du Lot 24 clampe justement à 0. L'avaler
                // enregistrait une série faite à 0 rep comme une case vide.
                const repsRaw = s.reps.trim() === "" ? null : Number(s.reps.replace(",", "."));
                const reps =
                  repsRaw == null || Number.isNaN(repsRaw) ? null : Math.round(repsRaw);
                const raw = s.weight.trim() === "" ? null : Number(s.weight.replace(",", "."));
                const weight =
                  raw == null || Number.isNaN(raw)
                    ? null
                    : ex.assist
                      ? -Math.abs(raw)
                      : raw;
                // RPE optionnel : hors [1,10] ou illisible → null (jamais bloquant).
                const rpeRaw = s.rpe.trim() === "" ? null : Number(s.rpe.replace(",", "."));
                const rpe =
                  rpeRaw == null || Number.isNaN(rpeRaw) || rpeRaw < 1 || rpeRaw > 10
                    ? null
                    : rpeRaw;
                return { reps, weight_kg: weight, rpe };
              }),
            }));
            finishingRef.current = true;
            const res = await saveWorkout({
              id: editId ?? undefined,
              draftId: draftIdRef.current,
              date,
              type: "muscu",
              templateId,
              duration_min: meta.duration,
              perceived_intensity: meta.intensity,
              notes: meta.notes,
              exercises: payload,
            });
            if ("error" in res) {
              // Échec : le brouillon existe toujours, on réarme l'autosave —
              // sinon la suite de la séance ne serait plus enregistrée nulle part.
              finishingRef.current = false;
              return res.error;
            }
            draftIdRef.current = null;
            router.push(`/training/${res.id}`);
            return null;
          }}
        />
      )}
    </main>
  );
}

/** Y a-t-il quoi que ce soit à montrer derrière le ⓘ de cet exercice ? */
function hasDetail(ex: EditorExercise): boolean {
  return Boolean(
    ex.targetLabel ||
      ex.targetWeight != null ||
      ex.targetNote ||
      ex.repRange ||
      ex.rpe ||
      ex.rest ||
      ex.note
  );
}

/**
 * Détail replié d'un exercice : l'objectif (que les cases pré-remplies
 * portent déjà, mais qu'on ne retrouverait plus une fois modifiées), les
 * consignes du template et les notes longues — celles de Claude comme celles
 * du catalogue.
 */
function ExerciseDetail({
  ex,
  suggestion,
  onDecide,
}: {
  ex: EditorExercise;
  suggestion?: { from: number; to: number; step: number } | null;
  onDecide?: (accept: boolean) => void;
}) {
  const consignes = [
    ex.repRange && `${ex.repRange} reps`,
    ex.rpe && `RPE ${ex.rpe}`,
    ex.rest && `repos ${ex.rest}s`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mt-2 space-y-1 rounded-md bg-surface-raised px-2.5 py-2 text-xs leading-relaxed">
      {ex.targetLabel && (
        <p className="font-medium text-primary">Objectif : {ex.targetLabel}</p>
      )}
      {/* La cible chiffrée apparaît à part quand l'objectif ne la porte pas :
          soit il n'y a pas d'objectif du tout (édition), soit le signe est
          inconnu faute d'historique chargé — auquel cas la case poids reste
          vide et c'est au PO de trancher charge ou assistance. */}
      {ex.targetWeight != null && !(ex.targetLabel ?? "").includes("@") && (
        <p className="font-medium text-primary">
          Poids cible : {ex.targetWeight} kg
          {!ex.targetLabel ? "" : " — à saisir : charge ajoutée ou assistance ?"}
        </p>
      )}
      {consignes && <p className="text-muted">Cible : {consignes}</p>}
      {/* Lot 29 : la proposition de progression se tranche ICI, à côté de
          l'objectif qu'elle remplacerait — pas dans un écran à part. Rien n'est
          écrit tant que le ✓ n'a pas été touché. */}
      {suggestion && (
        <div className="flex items-center gap-2 rounded-md border border-accent bg-surface px-2 py-1.5">
          <p className="min-w-0 flex-1 font-medium text-accent">
            Proposition : {formatSuggestion(suggestion)}
            <span className="block font-normal text-muted">
              objectif atteint 2 séances d&apos;affilée
            </span>
          </p>
          <button
            type="button"
            aria-label={`Accepter la progression pour ${ex.name}`}
            onClick={() => onDecide?.(true)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary text-on-primary"
          >
            <Check size={18} weight="bold" />
          </button>
          <button
            type="button"
            aria-label={`Refuser la progression pour ${ex.name}`}
            onClick={() => onDecide?.(false)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border text-muted active:bg-surface-raised"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {ex.targetNote && <p className="text-muted">{ex.targetNote}</p>}
      {ex.note && <p className="text-faint">{ex.note}</p>}
    </div>
  );
}

function HelpSheet({
  onClose,
  rpeCol,
  onToggleRpeCol,
}: {
  onClose: () => void;
  rpeCol: boolean;
  onToggleRpeCol: () => void;
}) {
  return (
    <Sheet open onClose={onClose} title="Aide">
      <div className="space-y-4 text-sm leading-relaxed text-muted">
        <section>
          <h3 className="mb-1 font-medium text-foreground">Double progression</h3>
          <p>{PROGRESSION_HINT}</p>
        </section>
        <section>
          <h3 className="mb-1 font-medium text-foreground">
            Échelle RPE (effort perçu, optionnel)
          </h3>
          <p>
            RPE = reps en réserve. 10 = échec · 9 = 1 rep en réserve · 8 = 2 en
            réserve (cible du programme) · 7 = 3-4 en réserve. À noter par série
            si tu veux — jamais obligatoire.
          </p>
        </section>
        <button
          type="button"
          role="switch"
          aria-checked={rpeCol}
          onClick={onToggleRpeCol}
          className="flex w-full items-center justify-between rounded-md border border-border bg-surface px-3 py-3 text-left"
        >
          <span className="font-medium text-foreground">
            Afficher la colonne RPE
          </span>
          <span
            aria-hidden
            className={`h-6 w-10 shrink-0 rounded-full border p-0.5 transition-colors ${
              rpeCol ? "border-primary bg-primary" : "border-border bg-surface-raised"
            }`}
          >
            <span
              className={`block h-4 w-4 rounded-full transition-transform ${
                rpeCol ? "translate-x-4 bg-on-primary" : "bg-muted"
              }`}
            />
          </span>
        </button>
      </div>
    </Sheet>
  );
}

function IconBtn({
  label,
  onClick,
  disabled = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted active:bg-surface-raised disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/** « Développé décliné » trouvable en tapant « decline » (sans accents). */
const searchKey = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function AddExerciseSheet({
  catalog,
  onClose,
  onPick,
  pendingId = null,
}: {
  catalog: CatalogItem[];
  onClose: () => void;
  onPick: (item: { id?: string; name: string; note: string | null }) => void;
  /** Exercice dont le pré-remplissage est en cours de lecture (Lot 20). */
  pendingId?: string | null;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = searchKey(query.trim());
    return q ? catalog.filter((c) => searchKey(c.name).includes(q)) : catalog;
  }, [catalog, query]);
  const exactMatch = catalog.some(
    (c) => searchKey(c.name) === searchKey(query.trim())
  );

  return (
    <Sheet open onClose={onClose} title="Ajouter un exercice">
      <div className="space-y-3">
        <input
          autoFocus
          placeholder="Rechercher ou créer…"
          aria-label="Rechercher un exercice"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-12 w-full rounded-md border border-border bg-surface px-3 text-base outline-none placeholder:text-muted focus:border-muted"
        />
        <ul
          aria-busy={pendingId != null}
          className="divide-y divide-border rounded-md border border-border"
        >
          {filtered.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                disabled={pendingId != null}
                onClick={() => onPick(c)}
                className="flex w-full items-baseline justify-between px-3 py-3 text-left active:bg-surface disabled:opacity-50"
              >
                <span>{c.name}</span>
                {pendingId === c.id ? (
                  <CircleNotch
                    size={16}
                    aria-label="Chargement de l'objectif"
                    className="ml-2 shrink-0 animate-spin text-muted"
                  />
                ) : (
                  c.note && (
                    <span className="ml-2 shrink-0 text-xs text-faint">{c.note}</span>
                  )
                )}
              </button>
            </li>
          ))}
          {query.trim() && !exactMatch && (
            <li>
              <button
                type="button"
                onClick={() => onPick({ name: query.trim(), note: null })}
                className="flex w-full items-center gap-1.5 px-3 py-3 text-left font-medium active:bg-surface"
              >
                <Plus size={16} aria-hidden />
                Créer «{query.trim()}»
              </button>
            </li>
          )}
        </ul>
      </div>
    </Sheet>
  );
}

function FinishSheet({
  onClose,
  onSave,
  startedAt,
  isEdit,
  initialMeta,
}: {
  onClose: () => void;
  onSave: (meta: {
    duration: number | null;
    intensity: number | null;
    notes: string;
  }) => Promise<string | null>;
  startedAt: number;
  isEdit: boolean;
  initialMeta?: { duration: string; intensity: number | null; notes: string };
}) {
  const elapsed = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
  const [duration, setDuration] = useState(
    initialMeta?.duration ?? (isEdit ? "" : String(elapsed))
  );
  const [intensity, setIntensity] = useState<number | null>(
    initialMeta?.intensity ?? null
  );
  const [notes, setNotes] = useState(initialMeta?.notes ?? "");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <Sheet open onClose={onClose} title={isEdit ? "Enregistrer les modifications" : "Terminer la séance"}>
      <div className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Durée (min)</span>
          <input
            inputMode="numeric"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="h-12 w-full rounded-md border border-border bg-surface px-3 text-base outline-none focus:border-muted"
          />
        </label>
        <div>
          <span className="mb-1 block text-sm text-muted">Intensité perçue</span>
          <div className="grid grid-cols-10 gap-1">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={intensity === n}
                onClick={() => setIntensity(n)}
                className={`h-10 rounded-md border text-sm font-medium ${
                  intensity === n
                    ? "border-primary bg-primary text-on-primary"
                    : "border-border bg-surface"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <input
          placeholder="Notes (optionnel)"
          aria-label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="h-12 w-full rounded-md border border-border bg-surface px-3 text-base outline-none placeholder:text-muted focus:border-muted"
        />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError("");
              const err = await onSave({
                duration: duration.trim() === "" ? null : Math.round(Number(duration)) || null,
                intensity,
                notes,
              });
              if (err) setError(err);
            })
          }
          className="h-12 w-full rounded-md bg-primary font-semibold text-on-primary disabled:opacity-50"
        >
          {pending ? "Sauvegarde…" : "Enregistrer"}
        </button>
      </div>
    </Sheet>
  );
}
