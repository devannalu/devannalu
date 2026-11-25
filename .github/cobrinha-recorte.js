// Recorta a cobrinha gerada pelo snk:
// - tira a margem em volta do gráfico, para ela não andar por fora do quadro;
// - começa na primeira semana com contribuição, sem os meses vazios antes dela;
// - redistribui a barra de progresso na largura que sobrou.
// A saída do snk pertence ao root do container, então a versão recortada vai para outra pasta.
const fs = require("fs");

const [from, to] = process.argv.slice(2);
fs.mkdirSync(to, { recursive: true });

for (const file of fs.readdirSync(from)) {
  let svg = fs.readFileSync(`${from}/${file}`, "utf8");
  const [, x, y, w, h] = svg.match(/viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/).map(Number);
  const gridWidth = w + 2 * x;
  const filled = [...svg.matchAll(/<rect class="c c\d+" x="([\d.]+)"/g)].map((m) => Number(m[1]));
  // Uma coluna de folga antes da primeira contribuição.
  const start = filled.length ? Math.max(0, Math.min(...filled) - 18) : 0;
  const width = gridWidth - start + 4;
  const height = h + y + 2;

  svg = svg.replace(
    /viewBox="[^"]+" width="[\d.]+" height="[\d.]+"/,
    `viewBox="${start - 2} -2 ${width} ${height}" width="${width}" height="${height}"`,
  );
  const ratio = (gridWidth - start) / gridWidth;
  svg = svg.replace(/<rect class="u (u\d+)" height="([\d.]+)" width="([\d.]+)" x="([\d.]+)"/g, (_, cls, bh, bw, bx) =>
    `<rect class="u ${cls}" height="${bh}" width="${(bw * ratio).toFixed(1)}" x="${(start + bx * ratio).toFixed(1)}"`,
  );
  fs.writeFileSync(`${to}/${file}`, svg);
  console.log(file, { start, width, height });
}
