// Constelação de contribuições: cada dia com contribuição vira uma estrela ASCII que acende em sequência,
// ligada às vizinhas no tempo. Gera as versões escura e clara em SVG animado (só CSS, sem scripts).
// Uso: GITHUB_TOKEN=... node constelacao.js <usuario> <pasta-de-saida> [dados.json]
const fs = require("fs");

const [user, outDir, localData] = process.argv.slice(2);

const query = `query($login: String!) { user(login: $login) { contributionsCollection { contributionCalendar {
  totalContributions weeks { contributionDays { date contributionCount } } } } } }`;

async function loadDays() {
  if (localData) return JSON.parse(fs.readFileSync(localData, "utf8"));
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${process.env.GITHUB_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { login: user } }),
  });
  const json = await res.json();
  if (!json.data?.user) throw new Error(`GitHub GraphQL: ${JSON.stringify(json.errors ?? json)}`);
  return json.data.user.contributionsCollection.contributionCalendar.weeks.flatMap((w) => w.contributionDays);
}

const THEMES = {
  dark: { bg: "#0a0a0a", fg: "#f2f2f2", muted: "#a1a1a1", faint: "#6b6b6b", line: "#3a3a3a", accent: "#c41e3a", border: "#262626" },
  light: { bg: "#ffffff", fg: "#0a0a0a", muted: "#5c5c5c", faint: "#8f8f8f", line: "#cfcfcf", accent: "#5e0b1e", border: "#e5e5e5" },
};
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const W = 1280, H = 300, PAD = 56, TOP = 46, BOTTOM = 64;
const CYCLE = 14; // segundos por ciclo completo
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Posição estável por data: o mesmo dia cai sempre no mesmo lugar do céu.
function hash(text) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

function render(days, c) {
  const firstActive = days.findIndex((d) => d.contributionCount > 0);
  const span = firstActive < 0 ? [] : days.slice(Math.max(0, firstActive - 7));
  const total = span.reduce((sum, d) => sum + d.contributionCount, 0);
  const max = Math.max(1, ...span.map((d) => d.contributionCount));
  const step = (W - PAD * 2) / Math.max(1, span.length - 1);
  const rows = H - TOP - BOTTOM;

  const stars = [];
  span.forEach((d, i) => {
    if (!d.contributionCount) return;
    const weekday = new Date(`${d.date}T12:00:00Z`).getUTCDay();
    const x = PAD + i * step;
    const y = TOP + ((weekday + 0.5) / 7) * rows + (hash(d.date) - 0.5) * (rows / 7) * 0.9;
    stars.push({ x, y, level: d.contributionCount / max, count: d.contributionCount, date: d.date });
  });

  // Constelações: dias próximos no tempo formam um grupo; dentro dele, cada estrela se liga à vizinha
  // mais próxima no céu (árvore geradora mínima), o que dá desenhos de constelação, não um gráfico.
  stars.forEach((s, i) => (s.i = i));
  const groups = [];
  for (const s of stars) {
    const last = groups.at(-1)?.at(-1);
    if (last && (new Date(s.date) - new Date(last.date)) / 86400000 <= 6) groups.at(-1).push(s);
    else groups.push([s]);
  }
  const lines = [];
  for (const group of groups) {
    const linked = [group[0]];
    const rest = group.slice(1);
    while (rest.length) {
      let best = null;
      for (const a of linked) for (const b of rest) {
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        if (!best || d < best.d) best = { a, b, d };
      }
      lines.push({ a: best.a, b: best.b, i: Math.max(best.a.i, best.b.i) });
      linked.push(best.b);
      rest.splice(rest.indexOf(best.b), 1);
    }
  }

  const delayOf = (i) => ((i / Math.max(1, stars.length)) * CYCLE * 0.55).toFixed(2);
  const glyph = (lvl) => (lvl > 0.75 ? "@" : lvl > 0.45 ? "%" : lvl > 0.2 ? "*" : "+");

  let body = "";
  for (const { a, b, i } of lines) {
    const len = Math.hypot(b.x - a.x, b.y - a.y).toFixed(1);
    body += `<line class="l" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke-dasharray="${len}" stroke-dashoffset="${len}" style="--len:${len};animation-delay:${delayOf(i)}s"/>`;
  }
  stars.forEach((s, i) => {
    const strong = s.level > 0.75;
    const bright = s.level > 0.35;
    const size = (14 + s.level * 12).toFixed(1);
    const reach = (bright ? 15 + s.level * 8 : 0).toFixed(1);
    // Estrelas fortes ganham raios em ASCII, como as do portfólio.
    const rays = bright
      ? `<text x="${(s.x - reach).toFixed(1)}" y="${s.y.toFixed(1)}" class="r">-</text><text x="${(s.x + +reach).toFixed(1)}" y="${s.y.toFixed(1)}" class="r">-</text>` +
        `<text x="${s.x.toFixed(1)}" y="${(s.y - reach).toFixed(1)}" class="r">:</text><text x="${s.x.toFixed(1)}" y="${(s.y + +reach).toFixed(1)}" class="r">:</text>`
      : "";
    const twinkle = (2 + hash(s.date + "t") * 2.5).toFixed(2);
    body += `<g class="s" style="animation-delay:${delayOf(i)}s"><g class="t" style="animation-duration:${twinkle}s;animation-delay:-${(hash(s.date + "d") * 3).toFixed(2)}s">${rays}<text x="${s.x.toFixed(1)}" y="${s.y.toFixed(1)}" fill="${strong ? c.accent : c.fg}" fill-opacity="${(0.55 + s.level * 0.45).toFixed(2)}" style="font-size:${size}px">${glyph(s.level)}</text></g></g>`;
  });

  // Poeira de fundo, fixa, para o céu não ficar vazio.
  let dust = "";
  for (let i = 0; i < 60; i++) {
    const x = (PAD / 2 + hash(`x${i}`) * (W - PAD)).toFixed(0), y = (TOP / 2 + hash(`y${i}`) * (H - BOTTOM - TOP / 2)).toFixed(0);
    dust += `<text class="d" x="${x}" y="${y}" style="animation-delay:-${(hash(`d${i}`) * 4).toFixed(2)}s">.</text>`;
  }

  // Meses no rodapé, na posição do primeiro dia de cada um.
  let months = "";
  span.forEach((d, i) => {
    if (d.date.endsWith("-01")) months += `<text class="m" x="${(PAD + i * step).toFixed(1)}" y="${H - 38}">${MONTHS[Number(d.date.slice(5, 7)) - 1]}</text>`;
  });

  const empty = stars.length ? "" : `<text class="m" x="${W / 2}" y="${H / 2}">o céu ainda está se formando</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Constelação de contribuições: ${total} contribuições">
<style>
  text { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; text-anchor: middle; dominant-baseline: middle; }
  .l { stroke: ${c.line}; stroke-width: 1; animation: draw ${CYCLE}s ease-out infinite; }
  .s { opacity: 0; animation: appear ${CYCLE}s ease-out infinite; }
  .t { transform-box: fill-box; transform-origin: center; animation: twinkle 3s ease-in-out infinite; }
  .r { fill: ${c.faint}; font-size: 10px; }
  .d { fill: ${c.faint}; animation: blink 4s ease-in-out infinite; }
  .m { fill: ${c.faint}; font-size: 11px; }
  .lbl { text-anchor: start; font-size: 12px; }
  @keyframes appear { 0% { opacity: 0 } 6%, 82% { opacity: 1 } 92%, 100% { opacity: 0 } }
  @keyframes draw { 0% { stroke-dashoffset: var(--len); opacity: 1 } 10% { stroke-dashoffset: 0 } 82% { stroke-dashoffset: 0; opacity: 1 } 92%, 100% { stroke-dashoffset: 0; opacity: 0 } }
  @keyframes twinkle { 0%, 100% { transform: scale(1) } 50% { transform: scale(0.78); opacity: 0.6 } }
  @keyframes blink { 0%, 100% { opacity: 0.8 } 50% { opacity: 0.15 } }
  @media (prefers-reduced-motion: reduce) { .s, .l, .t, .d { animation: none; opacity: 1; stroke-dashoffset: 0 } }
</style>
<rect width="${W}" height="${H}" fill="${c.bg}"/>
<line x1="${PAD}" y1="${H - 54}" x2="${W - PAD}" y2="${H - 54}" stroke="${c.border}"/>
${dust}${body}${months}${empty}
<text class="lbl" x="${PAD}" y="${H - 18}" fill="${c.accent}">object (6) constelação</text>
<text class="lbl" x="${PAD + 170}" y="${H - 18}" fill="${c.faint}">· ${total} contribuições · uma estrela por dia</text>
</svg>`;
}

(async () => {
  const days = await loadDays();
  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, colors] of Object.entries(THEMES)) {
    fs.writeFileSync(`${outDir}/constelacao-${name}.svg`, render(days, colors));
  }
  console.log(`${days.filter((d) => d.contributionCount).length} dias com contribuição`);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
