/* Guía · naciceleste — todo corre en el navegador. Los datos llegan cifrados (AES-GCM, clave PBKDF2). */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const TZ_OFF = 6 * 3600;                       // Costa Rica = UTC-6, sin horario de verano
const H = 3600, DAY = 86400;
const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MON = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/* ---------- utilidades ---------- */
const norm = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const words = s => norm(s).replace(/[^a-z0-9ñ]+/g, ' ').trim();       // para comparar palabras
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v; else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(k));
  return el;
}
const crParts = ts => { const d = new Date((ts - TZ_OFF) * 1000); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), w: d.getUTCDay(), hh: d.getUTCHours(), mm: d.getUTCMinutes() }; };
const pad = n => String(n).padStart(2, '0');
const fmtT = ts => { const p = crParts(ts); return pad(p.hh) + ':' + pad(p.mm); };
const dayStart = ts => ts - ((ts - TZ_OFF) % DAY + DAY) % DAY;           // medianoche CR (en epoch)
function dayLabel(ts, now) {
  const diff = Math.round((dayStart(ts) - dayStart(now)) / DAY), p = crParts(ts);
  const base = `${DOW[p.w]} ${p.d} ${MON[p.m]}`;
  return diff === 0 ? 'Hoy · ' + base : diff === 1 ? 'Mañana · ' + base : diff === -1 ? 'Ayer · ' + base : base;
}
const nowTs = () => Math.floor(Date.now() / 1000);

/* ---------- intereses ---------- */
const DEFAULT_INTERESTS = [
  { id: 'rm',   emoji: '⚪', label: 'Real Madrid', w: 5, on: true, kw: ['real madrid'] },
  { id: 'boca', emoji: '💙', label: 'Boca Juniors', w: 5, on: true, kw: ['boca juniors', 'boca jrs', 'boca vs', 'vs boca', 'club atletico boca'] },
  { id: 'sapr', emoji: '💜', label: 'Saprissa', w: 5, on: true, kw: ['saprissa', 'deportivo saprissa'] },
  { id: 'sel',  emoji: '🌎', label: 'Selecciones: Costa Rica, Uruguay, Argentina, España', w: 4, on: true,
    kw: ['costa rica vs', 'vs costa rica', 'seleccion de costa rica', 'seleccion costarricense', 'uruguay vs', 'vs uruguay', 'seleccion uruguaya', 'seleccion de uruguay',
         'argentina vs', 'vs argentina', 'seleccion argentina', 'espana vs', 'vs espana', 'seleccion espanola', 'seleccion de espana'] },
  { id: 'nba',  emoji: '🏀', label: 'NBA', w: 4, on: true, kw: ['nba'] },
  { id: 'tenis', emoji: '🎾', label: 'Tenis ATP / WTA', w: 4, on: true,
    kw: ['atp', 'wta', 'tenis', 'tennis', 'roland garros', 'wimbledon', 'abierto de australia', 'australian open', 'masters 1000', 'copa davis', 'billie jean king'] },
  { id: 'f1',   emoji: '🏎️', label: 'Fórmula 1', w: 4, on: true, kw: ['formula 1', 'formula uno', 'f1', 'gran premio de'] },
  { id: 'nfl',  emoji: '🏈', label: 'NFL', w: 4, on: true, kw: ['nfl', 'super bowl'] },
  { id: 'jjoo', emoji: '🏅', label: 'Juegos Olímpicos', w: 4, on: true, kw: ['juegos olimpicos', 'olimpiadas', 'olimpic*', 'olympic*', 'jjoo', 'milano cortina', 'paralimpic*'] },
  { id: 'nata', emoji: '🏊', label: 'Natación', w: 3, on: true, kw: ['natacion', 'swimming', 'world aquatics', 'nado sincronizado'] },
  { id: 'atle', emoji: '🏃', label: 'Atletismo', w: 3, on: true, kw: ['atletismo', 'athletics', 'diamond league', 'maraton', 'marathon', 'world athletics'] },
  { id: 'nov',  emoji: '📺', label: 'Series y novelas de Colombia, Argentina y México', w: 3, on: true,
    kw: ['novela*', 'telenovela*'], eps: ['CO', 'AR', 'MX'] },   // eps: también programas con capítulos/temporadas en canales de esos países
];
const IKEY = 'guia.interests.v1';
let interests = loadInterests();
function loadInterests() {
  try { const v = JSON.parse(localStorage.getItem(IKEY)); if (Array.isArray(v) && v.length) return v; } catch (e) { }
  return JSON.parse(JSON.stringify(DEFAULT_INTERESTS));
}
const saveInterests = () => localStorage.setItem(IKEY, JSON.stringify(interests));

const reCache = new Map();
function kwRegex(kw) {                         // "a + b" = las dos; "ol*" = prefijo
  if (reCache.has(kw)) return reCache.get(kw);
  const parts = kw.split('+').map(p => p.trim()).filter(Boolean).map(p => {
    const pre = p.endsWith('*'); const w = words(p.replace(/\*$/, ''));
    if (!w) return null;
    return new RegExp('(^| )' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + (pre ? '' : '( |$)'));
  }).filter(Boolean);
  const f = parts.length ? (t => parts.every(r => r.test(t))) : (() => false);
  reCache.set(kw, f); return f;
}
const EPI_RX = /(^| )(temporada|episodio|capitulo|cap \d)/;
function scoreEvent(ev) {
  let total = 0; const hits = [];
  for (const it of interests) {
    if (!it.on) continue;
    let s = 0;
    for (const kw of it.kw || []) {
      const f = kwRegex(kw);
      if (f(ev.nt)) { s = Math.max(s, 3); break; }
      if (ev.nd && f(ev.nd)) s = Math.max(s, 1.5);
    }
    if (!s && it.eps && ev.cat === 'programa' && ev.ctry.some(c => it.eps.includes(c)) && EPI_RX.test(ev.nd)) {
      const hh = crParts(ev.s).hh; if (hh >= 18 && hh <= 23) s = 1;          // series con capítulos en horario estelar (18–23 h)
    }
    if (s) { total += s * (it.w || 1); hits.push(it); }
  }
  return { total, hits };
}

/* ---------- descifrado ---------- */
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function decryptGuide(pass) {
  const r = await fetch('data/guide.enc', { cache: 'no-cache' });
  if (!r.ok) throw new Error('No pude descargar los datos (' + r.status + ')');
  const f = await r.json();
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(f.salt), iterations: f.iter, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  let pt;
  try { pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(f.iv), additionalData: new TextEncoder().encode(f.aad) }, key, b64(f.ct)); }
  catch (e) { const err = new Error('bad-pass'); err.bad = true; throw err; }
  let stream = new Blob([pt]).stream();
  if (f.gz) stream = stream.pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

/* ---------- datos derivados ---------- */
let G, CH = [], bySlug = new Map(), progsBySlug = new Map(), events = [], mini = null;
function prepare(g) {
  G = g; CH = g.channels; bySlug = new Map(); progsBySlug = new Map(); events = [];
  for (const c of CH) if (c.slug) { if (!bySlug.has(c.slug)) bySlug.set(c.slug, []); bySlug.get(c.slug).push(c); }
  const map = new Map();
  for (const [slug, src] of Object.entries(g.sources)) {
    const list = src.p.map(p => ({ s: p[0], e: p[1], t: p[2], d: p[3], cat: p[4], slug }));
    progsBySlug.set(slug, list);
    for (const p of list) {
      const nt = words(p.t), key = nt + '|' + p.s;
      let ev = map.get(key);
      if (!ev) { ev = { id: events.length, s: p.s, e: p.e, t: p.t, d: p.d, cat: p.cat, nt, nd: words(p.d), slugs: [], chans: [], ctry: [] }; map.set(key, ev); events.push(ev); }
      if (!ev.slugs.includes(slug)) {
        ev.slugs.push(slug);
        for (const c of bySlug.get(slug) || []) { ev.chans.push(c); if (c.country && !ev.ctry.includes(c.country)) ev.ctry.push(c.country); }
        if (p.d.length > ev.d.length) { ev.d = p.d; ev.nd = words(p.d); }
      }
    }
  }
  for (const ev of events) ev.chans.sort((a, b) => a.n - b.n);
  const docs = events.map(ev => ({ id: ev.id, t: ev.t, d: ev.d, chn: ev.chans.map(c => c.n + ' ' + c.name).join(' ') }));
  mini = new MiniSearch({ fields: ['t', 'd', 'chn'], idField: 'id', processTerm: t => { const n = norm(t); return n.length ? n : null; },
    searchOptions: { boost: { t: 3, d: 1, chn: 0.35 }, prefix: true, fuzzy: 0.2 } });
  mini.addAll(docs);
  const d = new Date(g.fetched_at * 1000);
  const p = crParts(g.fetched_at);
  $('#updated').textContent = `Guía bajada el ${p.d} ${MON[p.m]} a las ${pad(p.hh)}:${pad(p.mm)} · ${Object.keys(g.sources).length} fuentes · ${events.length.toLocaleString('es')} programas`;
}
function currentOf(slug, t) {
  const l = progsBySlug.get(slug); if (!l) return -1;
  let lo = 0, hi = l.length - 1, ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (l[mid].s <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans >= 0 && l[ans].e > t ? ans : (ans + 1 < l.length ? -2 - (ans + 1) : -1);   // -2-i => hueco, el siguiente es i
}

/* ---------- pestaña 1: ahora y lo próximo ---------- */
let group = 'Todos', refOffset = 'now';
function timeOptions() {
  const now = nowTs(), sel = $('#atTime'); sel.textContent = '';
  const opts = [['now', 'Ahora'], ['+1', 'en 1 hora'], ['+2', 'en 2 horas'], ['+4', 'en 4 horas']];
  const d0 = dayStart(now);
  for (const [dd, hh, lab] of [[0, 20, 'Hoy 20:00'], [1, 12, 'Mañana 12:00'], [1, 20, 'Mañana 20:00']]) { const t = d0 + dd * DAY + hh * H; if (t > now) opts.push(['@' + t, lab]); }
  for (const [v, l] of opts) sel.append(h('option', { value: v, text: l }));
  sel.value = refOffset in Object.fromEntries(opts) ? refOffset : 'now';
}
const refTime = () => { const now = nowTs(), v = $('#atTime').value; return v === 'now' ? now : v[0] === '+' ? now + (+v) * H : +v.slice(1); };
function renderNow() {
  const T = refTime(), q = words($('#chFilter').value);
  const groups = ['Todos', ...new Set(CH.map(c => c.group).filter(Boolean))];
  const chips = $('#groupChips'); chips.textContent = '';
  for (const g of groups) chips.append(h('button', { class: 'chip' + (g === group ? ' on' : ''), type: 'button', onclick: () => { group = g; renderNow(); } }, g));
  const list = $('#nowList'); list.textContent = '';
  const nocov = [];
  let shown = 0;
  for (const c of CH) {
    if (group !== 'Todos' && c.group !== group) continue;
    if (q && !words(c.n + ' ' + c.name).includes(q)) continue;
    if (!c.slug) { nocov.push(c); continue; }
    list.append(channelCard(c, T)); shown++;
  }
  if (!shown) list.append(h('p', { class: 'empty' }, 'No hay canales con guía para este filtro.'));
  $('#nocovSum').textContent = `Sin guía disponible (${nocov.length} canales)`;
  const nl = $('#nocovList'); nl.textContent = '';
  for (const c of nocov) nl.append(h('span', null, `${c.n} ${c.name}`));
  $('#nocov').hidden = !nocov.length;
}
function channelCard(c, T) {
  const l = progsBySlug.get(c.slug) || [], ci = currentOf(c.slug, T);
  let cur = null, nextIdx;
  if (ci >= 0) { cur = l[ci]; nextIdx = ci + 1; } else if (ci <= -2) nextIdx = -2 - ci; else nextIdx = l.length;
  const nexts = []; for (let i = nextIdx; i < l.length && l[i].s < T + 24 * H; i++) nexts.push(l[i]);
  const card = h('article', { class: 'ch' + (c.cov === 'partial' ? ' approx' : '') },
    h('div', { class: 'chhead' }, h('span', { class: 'num' }, c.n), h('span', { class: 'chname', title: c.name }, c.name),
      c.cov === 'partial' ? h('span', { class: 'tilde', title: 'Guía aproximada: viene de la señal más parecida de otro país o región' }, '≈ aprox.') : null));
  if (cur) {
    card.append(h('div', { class: 'now' },
      h('div', { class: 't' }, h('span', { class: 'live' }, T - nowTs() > 60 ? 'ENTONCES' : 'AHORA'), cur.t),
      cur.d ? h('div', { class: 'd' }, cur.d) : null,
      h('div', { class: 'time' }, `${fmtT(cur.s)}–${fmtT(cur.e)}`),
      h('div', { class: 'bar-p' }, h('i', { style: `width:${Math.max(2, Math.min(100, (T - cur.s) / (cur.e - cur.s) * 100))}%` }))));
  } else card.append(h('div', { class: 'now dim' }, 'Sin datos para este momento'));
  const top = nexts.slice(0, 3);
  if (top.length) card.append(h('ul', { class: 'next' }, top.map(p => h('li', null, h('span', { class: 'time' }, fmtT(p.s)), h('span', { title: p.d || p.t }, p.t)))));
  if (nexts.length > 3) {
    card.append(h('details', { class: 'more24' }, h('summary', null, `Próximas 24 h (${nexts.length})`),
      h('ul', null, nexts.map(p => h('li', null, h('span', { class: 'time' }, (dayStart(p.s) !== dayStart(T) ? DOW[crParts(p.s).w] + ' ' : '') + fmtT(p.s)), h('span', { title: p.d }, p.t + (p.d ? ' — ' + p.d : '')))))));
  }
  return card;
}

/* ---------- tarjetas de programa (para vos y búsqueda) ---------- */
function highlight(text, terms) {
  if (!terms || !terms.length) return text;
  return text.split(/([\p{L}\p{N}]+)/u).map(tok => (tok && /[\p{L}\p{N}]/u.test(tok) && terms.some(t => norm(tok).startsWith(t))) ? h('mark', null, tok) : tok);
}
function eventCard(ev, now, opts = {}) {
  const live = ev.s <= now && ev.e > now;
  const p = crParts(ev.s);
  return h('article', { class: 'pcard' },
    h('div', { class: 'when' }, h('div', { class: 'tm' }, fmtT(ev.s)), h('div', { class: 'dy' }, `${DOW[p.w]} ${p.d} ${MON[p.m]}`), h('div', { class: 'dy' }, `hasta ${fmtT(ev.e)}`)),
    h('div', { class: 'body' },
      h('div', { class: 'pt' }, live ? h('span', { class: 'live' }, 'EN VIVO') : null, highlight(ev.t, opts.terms)),
      ev.d ? h('div', { class: 'pd' }, highlight(ev.d, opts.terms)) : null,
      h('div', { class: 'chs' }, ev.chans.map(c => h('span', { class: 'chtag' + (c.cov === 'partial' ? ' approx' : ''), title: c.name + (c.cov === 'partial' ? ' (guía aproximada)' : '') }, h('b', null, c.n), c.name))),
      opts.hits && opts.hits.length ? h('div', { class: 'tags' }, opts.hits.map(i => h('span', { class: 'itag' }, `${i.emoji || ''} ${i.label}`))) : null));
}

/* ---------- pestaña 2: para vos ---------- */
let picksLimit = 40, activeInterest = null, byTime = false;
function renderPicks() {
  const now = nowTs(), until = now + 72 * H;
  const scored = [];
  for (const ev of events) {
    if (ev.e <= now || ev.s > until) continue;
    const r = scoreEvent(ev); if (r.total > 0) scored.push({ ev, ...r });
  }
  const chips = $('#intChips'); chips.textContent = '';
  const counts = new Map(); for (const s of scored) for (const i of s.hits) counts.set(i, (counts.get(i) || 0) + 1);
  chips.append(h('button', { class: 'chip' + (!activeInterest ? ' on' : ''), type: 'button', onclick: () => { activeInterest = null; picksLimit = 40; renderPicks(); } }, `Todo (${scored.length})`));
  for (const i of interests) if (i.on) chips.append(h('button', { class: 'chip' + (activeInterest === i ? ' on' : ''), type: 'button', onclick: () => { activeInterest = activeInterest === i ? null : i; picksLimit = 40; renderPicks(); } }, `${i.emoji || ''} ${i.label.split(':')[0].split(' de ')[0]} (${counts.get(i) || 0})`));
  chips.append(h('button', { class: 'chip sortbtn', type: 'button', onclick: () => { byTime = !byTime; renderPicks(); } }, byTime ? '↕ Orden: por hora' : '↕ Orden: mejor puntaje'));
  let list = activeInterest ? scored.filter(s => s.hits.includes(activeInterest)) : scored;
  list.sort((a, b) => dayStart(Math.max(a.ev.s, now)) - dayStart(Math.max(b.ev.s, now)) || (byTime ? a.ev.s - b.ev.s : b.total - a.total || a.ev.s - b.ev.s));
  const box = $('#picks'); box.textContent = '';
  if (!list.length) box.append(h('p', { class: 'empty' }, 'Por ahora no hay nada que coincida con tus intereses en los próximos 3 días. Probá agregar más palabras clave en “Mis intereses”.'));
  let lastDay = null;
  for (const s of list.slice(0, picksLimit)) {
    const dk = dayStart(Math.max(s.ev.s, now - 1));
    if (dk !== lastDay) { box.append(h('h3', { class: 'dayh' }, dayLabel(Math.max(s.ev.s, now), now))); lastDay = dk; }
    box.append(eventCard(s.ev, now, { hits: s.hits, score: s.total }));
  }
  $('#morePicks').hidden = list.length <= picksLimit;
}
function renderEditor() {
  const box = $('#intList'); box.textContent = '';
  interests.forEach((it, idx) => {
    const upd = () => { saveInterests(); reCache.clear(); renderPicks(); };
    box.append(h('div', { class: 'irow' },
      h('div', { class: 'r1' },
        h('input', { type: 'checkbox', class: 'on', checked: it.on ? true : null, title: 'Activo', onchange: e => { it.on = e.target.checked; upd(); } }),
        h('input', { type: 'text', class: 'emo', value: it.emoji || '', maxlength: 4, 'aria-label': 'Emoji', oninput: e => { it.emoji = e.target.value; saveInterests(); } }),
        h('input', { type: 'text', value: it.label, 'aria-label': 'Nombre', oninput: e => { it.label = e.target.value; saveInterests(); } }),
        h('select', { class: 'wt', 'aria-label': 'Importancia', onchange: e => { it.w = +e.target.value; upd(); } }, [1, 2, 3, 4, 5].map(n => h('option', { value: n, selected: n === it.w ? true : null }, '★'.repeat(n)))),
        h('button', { type: 'button', class: 'btn ghost', title: 'Borrar', onclick: () => { interests.splice(idx, 1); saveInterests(); renderEditor(); renderPicks(); } }, '🗑️')),
      h('textarea', { 'aria-label': 'Palabras clave', onchange: e => { it.kw = e.target.value.split(',').map(x => x.trim()).filter(Boolean); upd(); } }, (it.kw || []).join(', ')),
      it.eps ? h('div', { class: 'hint' }, `También suma programas con capítulos o temporadas en canales de: ${it.eps.join(', ')}.`) : null));
  });
}

/* ---------- pestaña 3: buscar ---------- */
let resLimit = 40, lastRes = [], lastTerms = [];
function runSearch() {
  const q = $('#q').value.trim(), box = $('#results'); box.textContent = '';
  const info = $('#qInfo');
  if (!q) {
    lastRes = []; $('#moreRes').hidden = true;
    info.textContent = 'Escribí un programa, partido, equipo, serie o canal. Tolera errores de tipeo (probá “saprisa” o “reall madrid”).';
    const chips = h('div', { class: 'chips' });
    const sug = interests.filter(i => i.on).map(i => ({ e: i.emoji, t: (i.kw.find(k => !/[+*]/.test(k)) || i.label) })).slice(0, 10);
    for (const s of sug) chips.append(h('button', { type: 'button', class: 'chip', onclick: () => { $('#q').value = s.t; runSearch(); } }, `${s.e || ''} ${s.t}`));
    box.append(chips); return;
  }
  const now = nowTs(), past = $('#qPast').checked;
  let res = mini.search(q, { combineWith: 'AND' });
  let loose = false;
  if (!res.length) { res = mini.search(q, { combineWith: 'OR' }); loose = res.length > 0; }
  lastTerms = [...new Set(res.slice(0, 200).flatMap(r => r.queryTerms || []))];
  let rows = res.filter(r => past || events[r.id].e > now).map(r => ({ ev: events[r.id], score: r.score }));
  if ($('#qSort').value === 'time') rows.sort((a, b) => a.ev.s - b.ev.s); else rows.sort((a, b) => b.score - a.score || a.ev.s - b.ev.s);
  lastRes = rows; resLimit = 40;
  info.textContent = rows.length ? `${rows.length} resultado${rows.length === 1 ? '' : 's'}${loose ? ' (coincidencia parcial: no encontré uno con todas las palabras)' : ''}${past ? '' : ' · de ahora en adelante'}` : 'No encontré nada. Probá con menos palabras, otra ortografía o “incluir lo que ya pasó”.';
  showRes();
}
function showRes() {
  const box = $('#results'); box.textContent = ''; const now = nowTs();
  const qTerms = words($('#q').value).split(' ').filter(Boolean);
  for (const r of lastRes.slice(0, resLimit)) box.append(eventCard(r.ev, now, { terms: [...new Set([...qTerms, ...lastTerms])] }));
  $('#moreRes').hidden = lastRes.length <= resLimit;
}

/* ---------- arranque ---------- */
function showTab(name) {
  document.querySelectorAll('.tab').forEach(b => { b.classList.toggle('active', b.dataset.tab === name); b.setAttribute('aria-selected', b.dataset.tab === name); });
  document.querySelectorAll('.panel').forEach(p => p.hidden = p.id !== 'tab-' + name);
  if (name === 'foryou') renderPicks();
  if (name === 'now') renderNow();
  if (name === 'search') { runSearch(); if (matchMedia('(hover:hover)').matches) $('#q').focus(); }
  history.replaceState(null, '', '#' + name);
}
function startApp(g) {
  prepare(g);
  $('#lock').hidden = true; $('#app').hidden = false;
  timeOptions(); renderEditor();
  document.querySelectorAll('.tab').forEach(b => b.onclick = () => showTab(b.dataset.tab));
  $('#chFilter').oninput = renderNow; $('#atTime').onchange = renderNow;
  $('#editInterests').onclick = () => { renderEditor(); $('#intDlg').showModal(); };
  $('#addInt').onclick = () => { interests.push({ id: 'u' + Date.now(), emoji: '⭐', label: 'Nuevo interés', w: 3, on: true, kw: [] }); saveInterests(); renderEditor(); const t = $('#intList').lastElementChild; t && t.scrollIntoView(); };
  $('#resetInt').onclick = () => { if (confirm('¿Volver a los intereses originales?')) { interests = JSON.parse(JSON.stringify(DEFAULT_INTERESTS)); saveInterests(); reCache.clear(); renderEditor(); renderPicks(); } };
  $('#intDlg').addEventListener('close', renderPicks);
  $('#morePicks').onclick = () => { picksLimit += 40; renderPicks(); };
  $('#moreRes').onclick = () => { resLimit += 40; showRes(); };
  $('#searchForm').onsubmit = e => { e.preventDefault(); runSearch(); };
  let tm; $('#q').oninput = () => { clearTimeout(tm); tm = setTimeout(runSearch, 120); };
  $('#qPast').onchange = runSearch; $('#qSort').onchange = runSearch;
  $('#lockBtn').onclick = () => { localStorage.removeItem('guia.pass'); location.hash = ''; location.reload(); };
  setInterval(() => { if (!$('#tab-now').hidden && $('#atTime').value === 'now') renderNow(); }, 60000);
  const t = location.hash.slice(1); showTab(['now', 'foryou', 'search'].includes(t) ? t : 'now');
}
async function tryUnlock(pass, remember, silent) {
  const msg = $('#lockMsg'), btn = $('#unlockBtn');
  msg.className = 'msg'; msg.textContent = silent ? '' : 'Abriendo… (puede tardar un segundo)'; btn.disabled = true;
  try {
    const g = await decryptGuide(pass);
    if (remember) localStorage.setItem('guia.pass', pass);
    startApp(g);
  } catch (e) {
    msg.textContent = e.bad ? (silent ? '' : 'Clave incorrecta.') : 'No pude abrir la guía: ' + e.message;
    if (e.bad) localStorage.removeItem('guia.pass');
    btn.disabled = false;
  }
}
$('#unlock').addEventListener('submit', e => { e.preventDefault(); tryUnlock($('#pass').value, $('#remember').checked, false); });
const saved = localStorage.getItem('guia.pass');
if (saved) { $('#remember').checked = true; tryUnlock(saved, true, true); }
})();
