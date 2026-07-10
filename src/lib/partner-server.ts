import { createClient } from "@/lib/supabase/server";

// Profil partenaire (mode couple, Lot 11) : singleton id=1. Sarah est un
// PROFIL de macros, pas un utilisateur — aucune 2e auth, aucune refonte RLS.
export type PartnerProfile = {
  id: number;
  name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  is_active: boolean;
  updated_at: string;
};

export async function getPartnerProfile(): Promise<PartnerProfile> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("partner_profile")
    .select("*")
    .eq("id", 1)
    .single();
  if (error) throw new Error(`getPartnerProfile: ${error.message}`);
  return data as PartnerProfile;
}
