// Produces dist/artifact.html: the same game, in the shape the Artifact host wants
// (no doctype/html/head/body wrapper, stylesheet inlined, title first).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const css = readFileSync('src/style.css', 'utf8');

const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>')).trim();
const importmap = html.match(/<script type="importmap">[\s\S]*?<\/script>/)[0];

mkdirSync('dist', { recursive: true });
writeFileSync('dist/artifact.html', `<title>Air Rights</title>
<style>
${css}</style>
${importmap}

${body}
`);
console.log('dist/artifact.html written');
