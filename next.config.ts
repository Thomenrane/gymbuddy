import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Fluidité : garde en cache client l'arbre RSC des routes dynamiques
    // pendant 30 s. Rebasculer entre onglets réutilise l'arbre au lieu de
    // tout re-fetcher/re-rendre → navigation nettement plus fluide.
    staleTimes: { dynamic: 30, static: 180 },
  },
};

export default nextConfig;
