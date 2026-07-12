// Applique un fichier de migration SQL via l'API Management de Supabase —
// fiable et autonome (pas de MCP, pas de copier-coller). DDL inclus.
//
// Auth : SUPABASE_ACCESS_TOKEN (Personal Access Token Supabase) dans l'env.
// Projet : déduit de NEXT_PUBLIC_SUPABASE_URL, ou SUPABASE_PROJECT_REF.
//
// Usage :
//   node scripts/db-migrate.mjs supabase/migrations/XXXX.sql [autres.sql...]
//   node scripts/db-migrate.mjs --all      # toutes les migrations, dans l'ordre
import fs from "node:fs";
import path from "node:path";

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) {
  console.error("SUPABASE_ACCESS_TOKEN manquant (Personal Access Token Supabase).");
  process.exit(2);
}
const ref =
  process.env.SUPABASE_PROJECT_REF ||
  (process.env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1];
if (!ref) {
  console.error("Projet introuvable (SUPABASE_PROJECT_REF ou NEXT_PUBLIC_SUPABASE_URL requis).");
  process.exit(2);
}

const args = process.argv.slice(2);
let files;
if (args[0] === "--all") {
  const dir = "supabase/migrations";
  files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().map((f) => path.join(dir, f));
} else if (args.length) {
  files = args;
} else {
  console.error("Aucun fichier de migration fourni (chemins, ou --all).");
  process.exit(2);
}

async function runSql(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

let failed = 0;
for (const file of files) {
  const sql = fs.readFileSync(file, "utf8");
  process.stdout.write(`→ ${file} … `);
  const r = await runSql(sql);
  if (r.ok) {
    console.log(`OK (${r.status})`);
  } else {
    // 409 / "already exists" → migration déjà appliquée : on tolère.
    if (/already exists|duplicate/i.test(r.text)) {
      console.log(`déjà appliquée (${r.status})`);
    } else {
      console.log(`ÉCHEC (${r.status})`);
      console.error(`   ${r.text.slice(0, 400)}`);
      failed += 1;
    }
  }
}
console.log(failed ? `\n${failed} migration(s) en échec.` : "\nToutes les migrations sont appliquées.");
process.exit(failed ? 1 : 0);
