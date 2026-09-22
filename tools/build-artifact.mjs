// Produces dist/artifact.html: the whole game as ONE file.
//
// The modules used to be published alongside the page, which meant a browser
// could keep serving yesterday's src/world.js after a republish and quietly run
// a mix of two builds. Bundling removes that failure mode entirely — there is
// one file, the platform versions it, and there is nothing else to go stale.
// three.js stays external so it still comes from the CDN via the import map.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import * as esbuild from 'esbuild';

const html = readFileSync('index.html', 'utf8');
const css = readFileSync('src/style.css', 'utf8');

let stamp;
try {
  stamp = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
} catch {
  stamp = 'dev';
}
const built = new Date().toISOString().slice(0, 16).replace('T', ' ');
const version = `${stamp} · ${built}`;

const result = await esbuild.build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  external: ['three', 'three/addons/*'],
  write: false,
  legalComments: 'none',
  define: { __BUILD__: JSON.stringify(version) },
});
const js = result.outputFiles[0].text;

// Take the page body, minus the module script tag the bundle replaces.
let body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>')).trim();
body = body.replace(/<script type="module" src="[^"]*"><\/script>/, '');
const importmap = html.match(/<script type="importmap">[\s\S]*?<\/script>/)[0];

mkdirSync('dist', { recursive: true });
writeFileSync('dist/artifact.html', `<title>Air Rights</title>
<style>
${css}</style>
${importmap}

${body}

<script type="module">
${js}</script>
`);
console.log(`dist/artifact.html — one file, ${(js.length / 1024).toFixed(0)}KB of script, build ${version}`);
