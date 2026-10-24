// Tek dosyalık derlemeyi (dist-single/index.html) claude.ai Artifact biçimine çevirir:
// <!doctype>, <html>, <head>, <body> sarmalayıcıları yayın sırasında eklendiği için çıkarılır.
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('dist-single/index.html', 'utf8');
const head = /<head>([\s\S]*?)<\/head>/i.exec(src)[1];
const body = /<body>([\s\S]*?)<\/body>/i.exec(src)[1];

const keepHead = head
  .replace(/<meta charset[^>]*>\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '');
const scripts = [...keepHead.matchAll(/<script\b[\s\S]*?<\/script>/gi)].map((m) => m[0]);
const headRest = keepHead.replace(/<script\b[\s\S]*?<\/script>/gi, '');

writeFileSync('dist-single/artifact.html', `${headRest.trim()}\n${body.trim()}\n${scripts.join('\n')}\n`);
console.log('dist-single/artifact.html yazıldı');
