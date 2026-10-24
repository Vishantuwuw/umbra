// Obfuscate Umbra's JavaScript in place before packaging, to make the shipped
// app hard to read or tamper with. Run in CI (the build job) against a
// throwaway checkout; the committed source in the repo stays readable.
//
//   node build/obfuscate.js
//
// Global names are NOT renamed: the renderer loads account.js and app.js as
// separate <script> tags that share top-level identifiers (S, renderAuth, ...),
// and the preload exposes a fixed "umbra" API, so renaming globals or object
// keys would break those links. Everything local to a file is still mangled,
// strings are moved into a rotated/shuffled base64 array, and control flow is
// flattened.
const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const SRC = path.join(__dirname, '..', 'src');

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : p;
  });

const options = {
  compact: true,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,          // renderer scripts share top-level names
  transformObjectKeys: false,    // keep exposed API / IPC channel keys intact
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  splitStrings: true,
  splitStringsChunkLength: 8,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  numbersToExpressions: true,
  simplify: true,
  selfDefending: false,          // fragile across Electron contexts
  deadCodeInjection: false,      // keep the bundle small
};

const files = walk(SRC).filter((f) => f.endsWith('.js'));
let bytesIn = 0;
let bytesOut = 0;
for (const file of files) {
  const code = fs.readFileSync(file, 'utf8');
  const out = JavaScriptObfuscator.obfuscate(code, options).getObfuscatedCode();
  fs.writeFileSync(file, out);
  bytesIn += code.length;
  bytesOut += out.length;
  console.log(`obfuscated ${path.relative(SRC, file)}`);
}
console.log(`\n${files.length} files, ${bytesIn} -> ${bytesOut} bytes`);
