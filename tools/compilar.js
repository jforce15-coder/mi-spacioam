/* Compila los .jsx de Mi (en el orden de index.html) a build/*.js con el MISMO Babel y las mismas opciones que usaba
   el navegador (@babel/standalone 7.29: presets react + env y sus plugins por defecto). Así el resultado se comporta
   igual que antes, pero el teléfono ya no compila nada al abrir. Deja build/manifest.json con la huella de cada archivo. */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const Babel = require('@babel/standalone');
const raiz = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/<script type="text\/x-mi-jsx" src="([^"?]+)/g)].map(m => m[1]);
if (!srcs.length) throw new Error('index.html no tiene scripts text/x-mi-jsx');
fs.mkdirSync(path.join(raiz, 'build'), { recursive: true });
const files = [];
for (const src of srcs) {
  const code = fs.readFileSync(path.join(raiz, src), 'utf8');
  const out = Babel.transform(code, {
    filename: src,
    presets: ['react', 'env'],
    plugins: ['transform-class-properties', 'transform-object-rest-spread', 'transform-flow-strip-types'],
    compact: true, comments: false, minified: true,
  }).code;
  const nombre = src.replace(/\.jsx$/, '.js');
  fs.writeFileSync(path.join(raiz, 'build', nombre), '/* Generado desde ' + src + '. No editar. */\n' + out);
  files.push({ src, out: nombre, h: crypto.createHash('sha1').update(out).digest('hex').slice(0, 10) });
  console.log(src, '→ build/' + nombre, Math.round(out.length / 1024) + ' KB');
}
fs.writeFileSync(path.join(raiz, 'build', 'manifest.json'), JSON.stringify({ files }, null, 1) + '\n');
