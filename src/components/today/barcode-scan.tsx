"use client";

import { useEffect, useRef, useState } from "react";
import { Barcode, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { addScannedIngredient, logFreeMeal } from "@/app/(tabs)/today-actions";
import {
  isValidBarcode,
  macrosForGrams,
  type OffProduct,
} from "@/lib/off-product.mjs";
import type { Slot } from "@/lib/today";

// Scan code-barres (Lot 16). Objectif premier : alimenter la référence
// ingrédients (nutrition_ref) avec les valeurs étiquette exactes, pour que
// Claude (MCP) compose/vérifie les recettes. Secondaire : logger une portion
// pesée du produit dans le slot courant.
//
// Caméra : BarcodeDetector natif quand dispo (Chrome/Android), sinon repli
// dynamique sur @zxing/browser (Safari/iOS) — chargé uniquement si besoin.
// La saisie manuelle du code reste toujours possible (desktop, caméra
// refusée, e2e).

type Detector = {
  detect(video: HTMLVideoElement): Promise<{ rawValue: string }[]>;
};
type DetectorCtor = new (opts?: { formats?: string[] }) => Detector;
type ZxingControls = { stop(): void };

const inputCls =
  "h-12 w-full rounded-md border border-border bg-surface px-3 text-base outline-none placeholder:text-muted focus:border-muted";

export function BarcodeScan({
  date,
  slot,
  onBack,
  onDone,
}: {
  date: string;
  slot: Slot;
  onBack: () => void;
  onDone: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  // Verrou : un seul lookup même si la caméra détecte plusieurs frames.
  const lockRef = useRef(false);

  const [manual, setManual] = useState("");
  const [camera, setCamera] = useState<"starting" | "on" | "off">("starting");
  const [ean, setEan] = useState<string | null>(null);
  const [product, setProduct] = useState<Extract<OffProduct, { found: true }> | null>(null);
  const [grams, setGrams] = useState("100");
  const [error, setError] = useState("");
  const [added, setAdded] = useState<{ item: string; verified: boolean } | null>(null);
  const [pending, setPending] = useState(false);

  function stopCamera() {
    stopRef.current?.();
    stopRef.current = null;
  }

  async function lookup(code: string) {
    const c = code.trim();
    if (lockRef.current) return;
    if (!isValidBarcode(c)) {
      setError("Code-barres invalide (8 à 14 chiffres).");
      return;
    }
    lockRef.current = true;
    stopCamera();
    setError("");
    setPending(true);
    try {
      const res = await fetch(`/api/barcode/${c}`);
      const data = (await res.json().catch(() => null)) as
        | OffProduct
        | { error: string }
        | null;
      if (!res.ok || !data || "error" in data) {
        setError((data && "error" in data && data.error) || `Erreur (HTTP ${res.status}).`);
        lockRef.current = false;
        return;
      }
      if (!data.found) {
        setError("Produit introuvable dans Open Food Facts — utilise le log libre.");
        lockRef.current = false;
        return;
      }
      setEan(c);
      setProduct(data);
    } catch {
      setError("Réseau indisponible — réessaie.");
      lockRef.current = false;
    } finally {
      setPending(false);
    }
  }

  // Démarrage caméra + détection. Se relance quand on revient au mode scan.
  useEffect(() => {
    if (product) return; // fiche affichée : caméra coupée
    let cancelled = false;
    const video = videoRef.current;
    (async () => {
      if (!video || !navigator.mediaDevices?.getUserMedia) {
        setCamera("off");
        return;
      }
      try {
        const Ctor = (window as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
        if (Ctor) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
          });
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          video.srcObject = stream;
          await video.play();
          const detector = new Ctor({
            formats: ["ean_13", "ean_8", "upc_a", "upc_e"],
          });
          const timer = setInterval(async () => {
            try {
              const codes = await detector.detect(video);
              if (codes[0]?.rawValue) lookup(codes[0].rawValue);
            } catch {
              /* frame non décodable : on continue */
            }
          }, 350);
          stopRef.current = () => {
            clearInterval(timer);
            stream.getTracks().forEach((t) => t.stop());
          };
        } else {
          // Safari/iOS : pas de BarcodeDetector → zxing, chargé à la demande.
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          const reader = new BrowserMultiFormatReader();
          const controls: ZxingControls = await reader.decodeFromVideoDevice(
            undefined,
            video,
            (result) => {
              if (result) lookup(result.getText());
            }
          );
          if (cancelled) {
            controls.stop();
            return;
          }
          stopRef.current = () => controls.stop();
        }
        if (!cancelled) setCamera("on");
      } catch {
        if (!cancelled) setCamera("off"); // refusée/indispo → saisie manuelle
      }
    })();
    return () => {
      cancelled = true;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  function rescan() {
    lockRef.current = false;
    setProduct(null);
    setEan(null);
    setAdded(null);
    setError("");
    setManual("");
    setCamera("starting");
  }

  function addToRefs() {
    if (!product || !ean) return;
    setError("");
    setPending(true);
    addScannedIngredient({
      ean,
      name: product.name ?? "",
      brand: product.brand,
      per100g: product.per100g,
    })
      .then((res) => {
        if ("error" in res) setError(res.error);
        else setAdded({ item: res.item, verified: res.verified });
      })
      .finally(() => setPending(false));
  }

  function logPortion() {
    if (!product || !ean) return;
    const g = Number(grams.replace(",", "."));
    if (!Number.isFinite(g) || g <= 0 || g > 5000) {
      setError("Quantité invalide (en grammes).");
      return;
    }
    setError("");
    setPending(true);
    const macros = macrosForGrams(product.per100g, g);
    const label = `${product.name ?? "Produit scanné"}${
      product.brand ? ` (${product.brand})` : ""
    } — ${g} g`;
    logFreeMeal({
      date,
      slot,
      label,
      ...macros,
      // Fiche incomplète : macros partielles comptées à 0 → estimation.
      is_estimate: product.missing.length > 0,
    })
      .then((res) => {
        if ("error" in res) setError(res.error);
        else onDone();
      })
      .finally(() => setPending(false));
  }

  // ---------- Fiche produit ----------
  if (product) {
    const g = Number(grams.replace(",", ".")) || 0;
    const macros = macrosForGrams(product.per100g, g);
    const per = product.per100g;
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-border bg-surface p-3">
          <p className="font-semibold">
            {product.name ?? "Produit sans nom"}
            {product.brand && (
              <span className="font-normal text-muted"> · {product.brand}</span>
            )}
          </p>
          <p className="mt-1 text-sm text-muted">
            {per.kcal ?? "?"} kcal ·{" "}
            <span className="text-macro-p">{per.protein_g ?? "?"} P</span> ·{" "}
            {per.carbs_g ?? "?"} G · {per.fat_g ?? "?"} L
            <span className="text-faint"> / 100 g</span>
            {product.quantity && <span className="text-faint"> · {product.quantity}</span>}
          </p>
          {product.missing.length > 0 && (
            <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted">
              <WarningCircle size={16} className="mt-px shrink-0" aria-hidden />
              Fiche incomplète ({product.missing.length} macro
              {product.missing.length > 1 ? "s" : ""} absente
              {product.missing.length > 1 ? "s" : ""}) — l&apos;ingrédient sera
              marqué « à vérifier ».
            </p>
          )}
        </div>

        {added ? (
          <p className="flex items-start gap-1.5 rounded-md border border-border bg-surface p-3 text-sm">
            <CheckCircle size={18} className="mt-px shrink-0 text-primary" aria-hidden />
            <span>
              <span className="font-medium">« {added.item} »</span> ajouté à la
              référence ingrédients — Claude peut maintenant l&apos;utiliser
              pour composer et vérifier des recettes.
              {!added.verified && " (fiche incomplète : marqué « à vérifier »)"}
            </span>
          </p>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={addToRefs}
            className="h-12 w-full rounded-md bg-primary font-semibold text-on-primary disabled:opacity-50"
          >
            Ajouter à la référence ingrédients
          </button>
        )}

        <div className="rounded-md border border-border p-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Ou logger une portion pesée</span>
            <span className="flex items-center gap-2">
              <input
                inputMode="decimal"
                aria-label="Quantité en grammes"
                value={grams}
                onChange={(e) => setGrams(e.target.value)}
                className={`${inputCls} flex-1`}
              />
              <span className="text-sm text-muted">g</span>
            </span>
          </label>
          <p className="mt-1.5 text-sm text-muted">
            → {macros.kcal} kcal ·{" "}
            <span className="text-macro-p">{macros.protein_g} P</span> ·{" "}
            {macros.carbs_g} G · {macros.fat_g} L
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={logPortion}
            className="mt-2 h-11 w-full rounded-md border border-border bg-surface text-sm font-medium disabled:opacity-50"
          >
            Logger dans {slot === "extra" ? "Extra" : "ce repas"}
          </button>
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onBack}
            className="h-12 flex-1 rounded-md border border-border bg-surface font-medium"
          >
            Retour
          </button>
          <button
            type="button"
            onClick={rescan}
            className="h-12 flex-1 rounded-md border border-border bg-surface font-medium"
          >
            Scanner un autre
          </button>
        </div>
      </div>
    );
  }

  // ---------- Mode scan ----------
  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-md border border-border bg-black">
        {/* muted + playsInline : requis pour l'autoplay caméra sur mobile */}
        <video ref={videoRef} muted playsInline className="h-56 w-full object-cover" />
        {camera !== "on" && (
          <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white/80">
            {camera === "starting"
              ? "Démarrage de la caméra…"
              : "Caméra indisponible — saisis le code à la main."}
          </p>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          lookup(manual);
        }}
        className="flex gap-2"
      >
        <label className="flex h-12 flex-1 items-center gap-2 rounded-md border border-border bg-surface px-3 focus-within:border-muted">
          <Barcode size={18} className="shrink-0 text-muted" aria-hidden />
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Ou saisis le code-barres…"
            aria-label="Code-barres"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            className="w-full bg-transparent text-base outline-none placeholder:text-muted"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="h-12 rounded-md bg-primary px-4 font-semibold text-on-primary disabled:opacity-50"
        >
          {pending ? "…" : "OK"}
        </button>
      </form>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <p className="text-xs text-muted">
        Le produit scanné rejoint la référence ingrédients (valeurs étiquette
        Open Food Facts) : Claude s&apos;en sert pour composer et vérifier les
        recettes.
      </p>

      <button
        type="button"
        onClick={onBack}
        className="h-12 w-full rounded-md border border-border bg-surface font-medium"
      >
        Retour
      </button>
    </div>
  );
}
