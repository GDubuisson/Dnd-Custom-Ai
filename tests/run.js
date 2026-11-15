// Lanceur de tests : liste les *.test.js des dossiers donnés et les passe à `run()` de node:test.
// Usage : node tests/run.js <dossier1> [dossier2 ...]
import { run } from "node:test";
import { spec } from "node:test/reporters";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function collectTestFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectTestFiles(full));
    else if (entry.endsWith(".test.js")) out.push(full);
  }
  return out;
}

const targets = process.argv.slice(2);
if (!targets.length) {
  console.error("Usage : node tests/run.js <dossier1> [dossier2 ...]");
  process.exit(1);
}

const files = targets.flatMap((target) => collectTestFiles(path.resolve(ROOT, target)));
if (!files.length) {
  console.error(`Aucun fichier *.test.js trouvé sous : ${targets.join(", ")}`);
  process.exit(1);
}

let failed = false;
const stream = run({ files, concurrency: true });
stream.on("test:fail", () => {
  failed = true;
});
stream.compose(spec).pipe(process.stdout);
stream.once("end", () => {
  process.exitCode = failed ? 1 : 0;
});
