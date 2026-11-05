// Lager supabase/functions/varsler/index.ts av varsel.js + tools/varsler-server.js,
// så hele sendejobben ligger i én fil som kan limes inn i Supabase.
// Kjør: node tools/lag-varselfunksjon.js
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const varsel = fs.readFileSync(path.join(root, 'varsel.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'tools', 'varsler-server.js'), 'utf8');
const out = `// @ts-nocheck
// =========================================================
// Tune IL årshjul – sendejobb for varsler (Supabase Edge Function «varsler»)
// GENERERT FIL – ikke rediger her. Endre varsel.js eller tools/varsler-server.js
// og kjør: node tools/lag-varselfunksjon.js
// =========================================================

${varsel}
const ArshjulVarsel = globalThis.ArshjulVarsel;

${server}`;
const dir = path.join(root, 'supabase', 'functions', 'varsler');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'index.ts'), out);
console.log('Skrev supabase/functions/varsler/index.ts (' + out.split('\n').length + ' linjer)');
