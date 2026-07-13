import { NextResponse } from "next/server";
import { isValidBarcode, mapOffProduct } from "@/lib/off-product.mjs";

// Lookup produit par code-barres via Open Food Facts (base ouverte, ODbL).
// Auth : la route passe par le proxy (session Supabase requise, comme les
// pages) — pas d'auth propre ici. On ne renvoie jamais la fiche brute :
// mapOffProduct réduit aux champs utiles (nom, marque, macros /100 g).
const OFF_FIELDS = "product_name,brands,quantity,nutriments";
const OFF_UA = "GymBuddy/1.0 (PWA perso; contact: thomenrane@gmail.com)";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ean: string }> }
) {
  const { ean } = await params;
  if (!isValidBarcode(ean))
    return NextResponse.json(
      { error: "Code-barres invalide (8 à 14 chiffres)." },
      { status: 400 }
    );

  let raw: unknown = null;
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${ean}.json?fields=${OFF_FIELDS}`,
      {
        // OFF demande un User-Agent identifiant l'app pour les appels serveur.
        headers: { "User-Agent": OFF_UA },
        // Les fiches produit bougent peu → cache Next 24 h (partagé entre
        // utilisateurs de la même instance, et re-scan instantané).
        next: { revalidate: 86400 },
        signal: AbortSignal.timeout(8000),
      }
    );
    // Produit inconnu : OFF renvoie 404 (body status 0) → found:false, pas
    // une erreur — l'UI propose le log libre.
    if (res.ok || res.status === 404) raw = await res.json().catch(() => null);
    else
      return NextResponse.json(
        { error: `Open Food Facts indisponible (HTTP ${res.status}).` },
        { status: 502 }
      );
  } catch {
    return NextResponse.json(
      { error: "Open Food Facts injoignable — réessaie ou utilise le log libre." },
      { status: 502 }
    );
  }

  return NextResponse.json(mapOffProduct(raw));
}
