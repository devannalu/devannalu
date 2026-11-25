// Constelação de contribuições: cada dia com contribuição vira uma estrela ASCII de quatro pontas que acende
// em sequência, ligada às vizinhas. Gera as versões escura e clara em SVG animado (só CSS, sem scripts).
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
  dark: { bg: "#0a0a0a", fg: "#f2f2f2", faint: "#6b6b6b", line: "#4a4a4a", accent: "#c41e3a", border: "#262626" },
  light: { bg: "#ffffff", fg: "#0a0a0a", faint: "#8f8f8f", line: "#c4c4c4", accent: "#5e0b1e", border: "#e5e5e5" },
};
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const W = 1280, H = 380, PAD = 56, TOP = 64, BOTTOM = 80;
const CW = 6.6, CH = 10; // célula de caractere das estrelas (fonte de 10px)
const CYCLE = 14; // segundos por ciclo completo
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const f = (n) => n.toFixed(1);

// Posição estável por data: o mesmo dia cai sempre no mesmo lugar do céu.
function hash(text) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

// Estrela de quatro pontas em ASCII (astroide), como as do README: densidade cai do centro às pontas.
function sparkle(cx, cy, r) {
  const ramp = " .:-=+*%8@";
  const cells = [];
  const rx = Math.ceil(r / CW), ry = Math.ceil(r / CH);
  for (let j = -ry; j <= ry; j++) {
    for (let i = -rx; i <= rx; i++) {
      const v = 1 - (Math.sqrt(Math.abs(i * CW) / r) + Math.sqrt(Math.abs(j * CH) / r));
      if (v <= 0.03) continue;
      const d = Math.min(1, v * 2.4);
      cells.push({ x: cx + i * CW, y: cy + j * CH, ch: ramp[Math.max(1, Math.round(d * (ramp.length - 1)))], d });
    }
  }
  return cells;
}

function placeStars(span, max) {
  const step = (W - PAD * 2) / Math.max(1, span.length - 1);
  const rows = H - TOP - BOTTOM;
  const stars = [];
  span.forEach((d, i) => {
    if (!d.contributionCount) return;
    const weekday = new Date(`${d.date}T12:00:00Z`).getUTCDay();
    const x = PAD + i * step;
    const y = TOP + ((weekday + 0.5) / 7) * rows + (hash(d.date) - 0.5) * (rows / 7) * 0.9;
    stars.push({ i: stars.length, x, y, level: d.contributionCount / max, date: d.date });
  });
  return { stars, step };
}

// Dias próximos no tempo formam uma constelação; dentro dela, cada estrela se liga à vizinha mais próxima
// no céu (árvore geradora mínima), o que dá desenhos de constelação em vez de um gráfico.
function linkGroups(stars) {
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
      for (const a of linked) {
        for (const b of rest) {
          const d = Math.hypot(b.x - a.x, b.y - a.y);
          if (!best || d < best.d) best = { a, b, d };
        }
      }
      lines.push({ a: best.a, b: best.b, i: Math.max(best.a.i, best.b.i) });
      linked.push(best.b);
      rest.splice(rest.indexOf(best.b), 1);
    }
  }
  return { groups, lines };
}

function render(days, c) {
  const firstActive = days.findIndex((d) => d.contributionCount > 0);
  const span = firstActive < 0 ? [] : days.slice(Math.max(0, firstActive - 7));
  const total = span.reduce((sum, d) => sum + d.contributionCount, 0);
  const max = Math.max(1, ...span.map((d) => d.contributionCount));
  const { stars, step } = placeStars(span, max);
  const { groups, lines } = linkGroups(stars);
  const delayOf = (i) => ((i / Math.max(1, stars.length)) * CYCLE * 0.55).toFixed(2);

  let body = "";
  for (const { a, b, i } of lines) {
    const len = f(Math.hypot(b.x - a.x, b.y - a.y));
    body += `<line class="l" x1="${f(a.x)}" y1="${f(a.y)}" x2="${f(b.x)}" y2="${f(b.y)}" stroke-dasharray="${len}" stroke-dashoffset="${len}" style="--len:${len};animation-delay:${delayOf(i)}s"/>`;
  }

  for (const s of stars) {
    const strong = s.level > 0.75;
    let chars = "";
    for (const cell of sparkle(s.x, s.y, 8 + Math.sqrt(s.level) * 26)) {
      const fill = strong && cell.d > 0.55 ? c.accent : c.fg;
      chars += `<text x="${f(cell.x)}" y="${f(cell.y)}" fill="${fill}" fill-opacity="${(0.25 + cell.d * 0.75).toFixed(2)}">${esc(cell.ch)}</text>`;
    }
    const twinkle = (2.2 + hash(s.date + "t") * 2.6).toFixed(2);
    const phase = (hash(s.date + "d") * 3).toFixed(2);
    body += `<g class="s" style="animation-delay:${delayOf(s.i)}s"><g class="t" style="animation-duration:${twinkle}s;animation-delay:-${phase}s">${chars}</g></g>`;
  }

  // Nome discreto de cada constelação com 3 estrelas ou mais: mês e quantos dias.
  for (const group of groups) {
    if (group.length < 3) continue;
    const top = group.reduce((a, b) => (b.y < a.y ? b : a));
    const [first, last] = [group[0], group.at(-1)].map((s) => MONTHS[Number(s.date.slice(5, 7)) - 1]);
    const months = first === last ? first : `${first}–${last}`;
    body += `<text class="n s" x="${f(top.x)}" y="${f(Math.max(16, top.y - 36))}" style="animation-delay:${delayOf(group.at(-1).i)}s">${months} · ${group.length} dias</text>`;
  }

  // Poeira de fundo para o céu não ficar vazio.
  let dust = "";
  for (let i = 0; i < 90; i++) {
    const x = (PAD / 2 + hash(`x${i}`) * (W - PAD)).toFixed(0);
    const y = (12 + hash(`y${i}`) * (H - BOTTOM - 12)).toFixed(0);
    dust += `<text class="d" x="${x}" y="${y}" style="animation-delay:-${(hash(`d${i}`) * 4).toFixed(2)}s">.</text>`;
  }

  // Estrela cadente: cruza o céu uma vez por ciclo.
  const meteor = `<g class="meteor"><line x1="0" y1="0" x2="-90" y2="-34" stroke="url(#trail)" stroke-width="1.4"/><text x="2" y="1" fill="${c.fg}">*</text></g>`;

  let months = "";
  span.forEach((d, i) => {
    if (d.date.endsWith("-01")) months += `<text class="m" x="${f(PAD + i * step)}" y="${H - 42}">${MONTHS[Number(d.date.slice(5, 7)) - 1]}</text>`;
  });

  const label = "object (6) constelação";
  const empty = stars.length ? "" : `<text class="m" x="${W / 2}" y="${H / 2}">o céu ainda está se formando</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Constelação de contribuições: ${total} contribuições">
<style>
  text { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 10px; text-anchor: middle; dominant-baseline: middle; }
  .l { stroke: ${c.line}; stroke-width: 1; animation: draw ${CYCLE}s ease-out infinite; }
  .s { opacity: 0; animation: appear ${CYCLE}s ease-out infinite; }
  .t { transform-box: fill-box; transform-origin: center; animation: twinkle 3s ease-in-out infinite; }
  .n { fill: ${c.faint}; letter-spacing: 0.04em; }
  .d { fill: ${c.faint}; font-size: 12px; animation: blink 4s ease-in-out infinite; }
  .m { fill: ${c.faint}; font-size: 11px; }
  .lbl { text-anchor: start; font-size: 12px; }
  .meteor { opacity: 0; animation: meteor ${CYCLE}s linear infinite; animation-delay: ${(CYCLE * 0.62).toFixed(1)}s; }
  .meteor text { font-size: 14px; }
  @keyframes appear { 0% { opacity: 0 } 6%, 82% { opacity: 1 } 92%, 100% { opacity: 0 } }
  @keyframes draw { 0% { stroke-dashoffset: var(--len); opacity: 1 } 10% { stroke-dashoffset: 0 } 82% { stroke-dashoffset: 0; opacity: 1 } 92%, 100% { stroke-dashoffset: 0; opacity: 0 } }
  @keyframes twinkle { 0%, 100% { transform: scale(1) } 50% { transform: scale(0.8); opacity: 0.65 } }
  @keyframes blink { 0%, 100% { opacity: 0.8 } 50% { opacity: 0.15 } }
  @keyframes meteor { 0% { opacity: 0; transform: translate(${W * 0.5}px, 20px) } 1% { opacity: 1 } 7% { opacity: 1; transform: translate(${W * 0.8}px, 140px) } 8%, 100% { opacity: 0; transform: translate(${W * 0.8}px, 140px) } }
  @media (prefers-reduced-motion: reduce) { .s, .l, .t, .d { animation: none; opacity: 1; stroke-dashoffset: 0 } .meteor { display: none } }
</style>
<defs><linearGradient id="trail" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c.fg}" stop-opacity="0.9"/><stop offset="1" stop-color="${c.fg}" stop-opacity="0"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="${c.bg}"/>
<line x1="${PAD}" y1="${H - 58}" x2="${W - PAD}" y2="${H - 58}" stroke="${c.border}"/>
${dust}${body}${meteor}${months}${empty}
<text class="lbl" x="${PAD}" y="${H - 20}" fill="${c.accent}">${label}</text>
<text class="lbl" x="${f(PAD + label.length * 7.4 + 10)}" y="${H - 20}" fill="${c.faint}">· ${total} contribuições · uma estrela por dia</text>
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
