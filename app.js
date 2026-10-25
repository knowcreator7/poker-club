"use strict";
/* ═════════════════════════════════════════════════════════════
   Покерный клуб — мини-приложение Telegram
   ═════════════════════════════════════════════════════════════ */
const tg = window.Telegram && window.Telegram.WebApp;
const $ = id => document.getElementById(id);
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const S = {
  me: null, admin: false, club: "", structure: null, scoring: null, tableSize: 9,
  tab: "home", stack: [], tours: { active: [], finished: [] }, t: null, dtab: "players",
  period: "", rsort: "points", prof: null, live: null, lastDetailId: null
};

if (tg) {
  tg.ready(); tg.expand();
  try { tg.setHeaderColor("#060d0a"); tg.setBackgroundColor("#060d0a"); tg.setBottomBarColor && tg.setBottomBarColor("#060d0a"); } catch (e) {}
  try { tg.disableVerticalSwipes && tg.disableVerticalSwipes(); } catch (e) {}
}

/* ───────────── утилиты ───────────── */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = new Intl.NumberFormat("ru-RU");
const fmt = n => nf.format(Math.round(n || 0));
const plural = (n, a, b, c) => { n = Math.abs(n) % 100; const d = n % 10; return n > 10 && n < 20 ? c : d > 1 && d < 5 ? b : d === 1 ? a : c; };
const store = {
  get(k, d = null) { try { const v = localStorage.getItem("pc_" + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("pc_" + k, JSON.stringify(v)); } catch (e) {} }
};
const fmtDate = (s, withTime = true) => {
  if (!s) return "Дата не назначена";
  const o = { weekday: "short", day: "numeric", month: "long" };
  if (withTime) Object.assign(o, { hour: "2-digit", minute: "2-digit" });
  return new Date(s).toLocaleString("ru-RU", o);
};
const monthName = m => { const [y, mo] = m.split("-"); const s = new Date(+y, +mo - 1).toLocaleString("ru-RU", { month: "long" }); return s[0].toUpperCase() + s.slice(1) + " " + y; };
const monthShort = m => new Date(+m.slice(0, 4), +m.slice(5, 7) - 1).toLocaleString("ru-RU", { month: "short" }).replace(".", "");
const PALETTE = [["#8c2a33", "#c4505a"], ["#22446e", "#4a78b0"], ["#6b4c1d", "#b08a46"], ["#4a2f6b", "#7d5aa8"], ["#1d5a45", "#3f9474"], ["#7a3f1a", "#bd6d39"], ["#5d2448", "#9a4b7d"], ["#2a4d4f", "#4f8c8e"]];
function av(p, cls = "") {
  const [a, b] = PALETTE[Math.abs(+p.tg_id || 0) % PALETTE.length];
  return `<span class="av ${cls}" style="background:linear-gradient(145deg,${b},${a})">${esc(((p.name || "?").trim()[0] || "?").toUpperCase())}</span>`;
}
const medalTxt = p => ({ 1: "♛", 2: "II", 3: "III" }[p] || p);

const I = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-6.5-5.8-6.5-11a6.5 6.5 0 0 1 13 0c0 5.2-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>',
  stack: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="6.5" rx="7" ry="2.8"/><path d="M5 6.5v4c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-4M5 10.5v4c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-4"/></svg>',
  users: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 5.2a3.5 3.5 0 0 1 0 6.6M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  rebuy: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"/></svg>',
  sound: '<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M18 6l-8 6 8 6zM6 6v12"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M6 6l8 6-8 6zM18 6v12"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24"><path d="M16 4h4v4M4 20L20 4M20 16v4h-4M15 15l5 5M4 4l5 5"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><path d="M4 8h3.5L9 5.5h6L16.5 8H20v11H4z"/><circle cx="12" cy="13.5" r="3.5"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path d="M21 3L10 14M21 3l-6.5 18-4.5-7-7-4.5z"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.1 19.8l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.2 7.1l-.1-.1A2 2 0 1 1 6.9 4.2l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  card: '<svg viewBox="0 0 24 24"><rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  megaphone: '<svg viewBox="0 0 24 24"><path d="M4 10v4h3l7 4V6L7 10z"/><path d="M17.5 9.5a3.5 3.5 0 0 1 0 5"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>'
};

/* ═════════════════ Звук ═════════════════ */
const Snd = (() => {
  let ac = null, master = null, rev = null, noiseBuf = null;
  let on = store.get("sound", true);
  function init() {
    if (ac) { if (ac.state === "suspended") ac.resume(); return; }
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master = ac.createGain(); master.gain.value = .85;
    master.connect(comp).connect(ac.destination);
    rev = ac.createConvolver();
    const len = ac.sampleRate * 2.6, ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    rev.buffer = ir;
    const wet = ac.createGain(); wet.gain.value = .32; rev.connect(wet).connect(comp);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }
  const out = (n, wet = .5) => { n.connect(master); if (wet) { const g = ac.createGain(); g.gain.value = wet; n.connect(g).connect(rev); } };
  function env(g, t, a, peak, d) { g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + d); }
  function bell(f, t, dur = 1.6, vol = .18, wet = .8) {
    const c = ac.createOscillator(), m = ac.createOscillator(), mg = ac.createGain(), g = ac.createGain();
    c.frequency.value = f; m.frequency.value = f * 3.507;
    mg.gain.setValueAtTime(f * 1.6, t); mg.gain.exponentialRampToValueAtTime(1, t + dur * .7);
    m.connect(mg).connect(c.frequency);
    env(g, t, .006, vol, dur);
    const s = ac.createOscillator(), sg = ac.createGain(); s.frequency.value = f * 2; env(sg, t, .004, vol * .25, dur * .4);
    s.connect(sg); out(sg, wet);
    c.connect(g); out(g, wet);
    [c, m, s].forEach(o => { o.start(t); o.stop(t + dur + .2); });
  }
  function noise(t, dur, freq, q, vol, type = "bandpass", sweepTo = 0) {
    const src = ac.createBufferSource(); src.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ac.createGain(); env(g, t, .002, vol, dur);
    src.connect(f).connect(g); out(g, .15);
    src.start(t, Math.random() * .5); src.stop(t + dur + .05);
  }
  function tone(f, t, dur, vol, type = "sine", to = 0, wet = .2) {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    env(g, t, .004, vol, dur); o.connect(g); out(g, wet); o.start(t); o.stop(t + dur + .05);
  }
  function chip(t) {
    const r = .85 + Math.random() * .3;
    noise(t, .035, 4200 * r, 5, .55); tone(2600 * r, t, .05, .09, "triangle", 0, .1);
    noise(t + .028 + Math.random() * .02, .028, 5600 * r, 7, .3);
  }
  const FX = {
    tap(t) { tone(1250, t, .035, .05, "sine", 0, 0); },
    chip(t) { chip(t); },
    chips(t) { for (let i = 0; i < 6; i++) chip(t + i * (.045 + Math.random() * .04)); },
    card(t) { noise(t, .16, 1200, .9, .32, "highpass", 7000); tone(180, t, .08, .06); },
    deal(t) { for (let i = 0; i < 4; i++) noise(t + i * .12, .13, 1400, .9, .26, "highpass", 7500); },
    tick(t) { tone(1650, t, .05, .1, "sine", 900, 0); noise(t, .015, 3000, 3, .12); },
    warn(t) { bell(1318.5, t, 1.2, .12); bell(1318.5, t + .28, 1.4, .12); },
    level(t) { [783.99, 987.77, 1174.66, 1567.98].forEach((f, i) => bell(f, t + i * .11, 2.2, .14)); tone(196, t, 1.8, .07, "triangle", 0, .6); },
    brk(t) { [1174.66, 987.77, 783.99, 587.33].forEach((f, i) => bell(f, t + i * .18, 2.4, .12)); },
    bust(t) { tone(150, t, .45, .4, "sine", 48, .3); noise(t, .2, 300, 1, .25, "lowpass"); for (let i = 0; i < 4; i++) chip(t + .12 + i * .05); },
    win(t) {
      [392, 493.88, 587.33, 783.99].forEach(f => {
        const o = ac.createOscillator(), fl = ac.createBiquadFilter(), g = ac.createGain();
        o.type = "sawtooth"; o.frequency.value = f; fl.type = "lowpass"; fl.frequency.setValueAtTime(400, t); fl.frequency.exponentialRampToValueAtTime(2600, t + 1.2);
        g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.05, t + .5); g.gain.exponentialRampToValueAtTime(.0001, t + 3.2);
        o.connect(fl).connect(g); out(g, .7); o.start(t); o.stop(t + 3.3);
      });
      [783.99, 987.77, 1174.66, 1567.98, 1975.53, 2349.32].forEach((f, i) => bell(f, t + .35 + i * .1, 2.4, .12));
      for (let i = 0; i < 10; i++) chip(t + .9 + i * .06);
    },
    ach(t) { [1567.98, 2093, 2637, 3136, 4186].forEach((f, i) => bell(f, t + i * .07, 1.6, .08)); },
    join(t) { FX.chips(t); bell(1567.98, t + .2, 1.4, .09); },
    error(t) { tone(220, t, .18, .12, "triangle", 160); },
    open(t) { bell(1046.5, t, 1.6, .08); bell(1567.98, t + .09, 1.8, .07); }
  };
  return {
    init,
    play(name) { if (!on || !ac || !FX[name]) return; if (ac.state === "suspended") ac.resume(); try { FX[name](ac.currentTime + .01); } catch (e) {} },
    get on() { return on; },
    toggle() { on = !on; store.set("sound", on); if (on) { init(); this.play("chip"); } return on; }
  };
})();
document.addEventListener("pointerdown", () => Snd.init(), { capture: true });

function haptic(kind = "light") {
  try {
    const h = tg && tg.HapticFeedback; if (!h) return;
    if (["success", "warning", "error"].includes(kind)) h.notificationOccurred(kind);
    else if (kind === "select") h.selectionChanged(); else h.impactOccurred(kind);
  } catch (e) {}
}

/* ═════════════════ Анимации ═════════════════ */
function countUp(el, to, f = fmt, dur = 900) {
  if (!el) return;
  if (reduced) { el.textContent = f(to); return; }
  const t0 = performance.now();
  const step = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 4); el.textContent = f(to * e); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function runCountUps(root) { root.querySelectorAll("[data-cu]").forEach(el => countUp(el, +el.dataset.cu, el.dataset.pct ? v => Math.round(v) + "%" : fmt)); }

const CHIP_COLORS = [["#b8323b", "#f1e8d4"], ["#1f3f6b", "#f1e8d4"], ["#1a1a1a", "#d8b46a"], ["#f1e8d4", "#b8323b"], ["#2a6b4f", "#f1e8d4"], ["#d8b46a", "#1d1406"]];
function drawChip(ctx, r, [base, stripe]) {
  ctx.fillStyle = base; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
  ctx.strokeStyle = stripe; ctx.lineWidth = r * .26; ctx.setLineDash([r * .42, r * .36]);
  ctx.beginPath(); ctx.arc(0, 0, r * .84, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, r * .55, 0, 7); ctx.stroke();
}
function chipRain(count = 80, dur = 3600) {
  if (reduced) return;
  const cv = document.createElement("canvas"), ctx = cv.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1);
  cv.style.cssText = "position:fixed;inset:0;z-index:85;pointer-events:none;width:100vw;height:100vh";
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; ctx.scale(dpr, dpr); document.body.appendChild(cv);
  const ps = Array.from({ length: count }, () => ({
    x: Math.random() * innerWidth, y: -30 - Math.random() * innerHeight * .8, r: 9 + Math.random() * 9,
    vy: 2.5 + Math.random() * 3.5, vx: (Math.random() - .5) * 1.6, a: Math.random() * 6, va: .06 + Math.random() * .14,
    rot: Math.random() * 6, c: CHIP_COLORS[Math.floor(Math.random() * CHIP_COLORS.length)]
  }));
  const t0 = performance.now();
  (function frame(now) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    const fade = Math.min(1, Math.max(0, (dur - (now - t0)) / 600));
    ctx.globalAlpha = fade;
    ps.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += .045; p.a += p.va;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.max(.12, Math.abs(Math.cos(p.a))));
      drawChip(ctx, p.r, p.c); ctx.restore();
    });
    if (now - t0 < dur) requestAnimationFrame(frame); else cv.remove();
  })(t0);
}
function chipBurst(el) {
  if (reduced || !el) return;
  const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  for (let i = 0; i < 9; i++) {
    const cv = document.createElement("canvas"), s = 26, dpr = 2;
    cv.width = cv.height = s * dpr; cv.style.cssText = `position:fixed;z-index:86;pointer-events:none;width:${s}px;height:${s}px;left:${cx - s / 2}px;top:${cy - s / 2}px`;
    const ctx = cv.getContext("2d"); ctx.scale(dpr, dpr); ctx.translate(s / 2, s / 2); drawChip(ctx, s / 2 - 1, CHIP_COLORS[i % CHIP_COLORS.length]);
    document.body.appendChild(cv);
    const ang = -Math.PI / 2 + (Math.random() - .5) * 2.2, dist = 70 + Math.random() * 90;
    const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist;
    cv.animate([
      { transform: "translate(0,0) scale(.4) rotateX(0)", opacity: 1 },
      { transform: `translate(${dx}px,${dy}px) scale(1) rotateX(540deg)`, opacity: 1, offset: .55 },
      { transform: `translate(${dx * 1.15}px,${dy + 150}px) scale(.8) rotateX(900deg)`, opacity: 0 }
    ], { duration: 1000 + Math.random() * 300, easing: "cubic-bezier(.2,.7,.3,1)" }).onfinish = () => cv.remove();
  }
}
document.addEventListener("pointerdown", e => {
  const b = e.target.closest(".btn,.ctl.main,.chip-btn");
  if (!b || reduced) return;
  const r = b.getBoundingClientRect(), s = Math.max(r.width, r.height), sp = document.createElement("span");
  sp.className = "ripple"; sp.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
  if (getComputedStyle(b).position === "static") b.style.position = "relative";
  b.appendChild(sp); setTimeout(() => sp.remove(), 650);
});

function toast(text) {
  const t = $("toast"); t.textContent = text; t.classList.add("on");
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove("on"), 2400);
}
function confirmBox(text) {
  return new Promise(res => tg && tg.showConfirm ? tg.showConfirm(text, ok => res(!!ok)) : res(confirm(text)));
}

/* Сегменты и подчёркивания: плавная плашка */
function pills(root = document) {
  requestAnimationFrame(() => root.querySelectorAll(".seg,.tabs").forEach(seg => {
    const on = seg.querySelector("button.on"), pill = seg.querySelector(".seg-pill,.tab-line");
    if (!pill) return;
    if (!on) { pill.style.width = "0"; return; }
    pill.style.left = on.offsetLeft + "px"; pill.style.width = on.offsetWidth + "px";
  }));
}
const seg = (items, cur, act, extra = "", quiet = false) =>
  `<div class="seg ${quiet ? "quiet" : ""}"><span class="seg-pill"></span>${items.map(([v, l]) =>
    `<button class="${v === cur ? "on" : ""}" data-act="${act}" data-v="${v}" ${extra}>${l}</button>`).join("")}</div>`;

/* ═════════════════ API ═════════════════ */
async function api(path, data) {
  const headers = { "Content-Type": "application/json", "X-Init-Data": (tg && tg.initData) || "" };
  const dev = new URLSearchParams(location.search).get("uid");
  if (dev) headers["X-Dev-Uid"] = dev;
  const LOST = "Связь с клубом прервалась. Закройте приложение и откройте снова кнопкой «Клуб»";
  let r;
  try { r = await fetch("api" + path, { method: data ? "POST" : "GET", headers, body: data ? JSON.stringify(data) : undefined }); }
  catch (e) { throw new Error(LOST); }
  const d = await r.json().catch(() => null);
  if (!d) throw new Error(LOST);
  if (!r.ok) throw new Error(d.error || "Ошибка сервера");
  return d;
}
async function safe(fn) {
  try { return await fn(); } catch (e) { toast(e.message); haptic("error"); Snd.play("error"); }
}

/* ═════════════════ Навигация ═════════════════ */
const TABS = ["home", "tours", "rating", "profile"];
function showView(id) {
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("on", v.id === "v-" + id));
  document.body.classList.toggle("has-sub", !TABS.includes(id));
  if (tg && tg.BackButton) S.stack.length ? tg.BackButton.show() : tg.BackButton.hide();
  window.scrollTo(0, 0);
}
function setTab(tab) {
  if (S.tab !== tab || S.stack.length) Snd.play("tap");
  S.tab = tab; S.stack = []; showView(tab);
  document.querySelectorAll(".tabbar [data-tab]").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
  RENDER[tab] && safe(RENDER[tab]);
}
function push(id) { S.stack.push(id); showView(id); Snd.play("card"); }
function back() {
  closeSheet();
  if (!S.stack.length) return;
  const left = S.stack.pop();
  if (left === "live") stopLive();
  const id = S.stack[S.stack.length - 1] || S.tab;
  showView(id); Snd.play("tap");
  const r = REFRESH[id]; r && safe(r);
}
if (tg && tg.BackButton) tg.BackButton.onClick(back);
const topbar = (inner = "", right = "") =>
  `<div class="topbar"><button class="icon-btn" data-act="back" aria-label="Назад">${I.back}</button><div class="grow">${inner}</div>${right}</div>`;

/* ═════════════════ Шторка ═════════════════ */
function openSheet(html) {
  $("sheetBody").innerHTML = html; $("sheet").classList.add("on"); $("sheet").setAttribute("aria-hidden", "false");
  pills($("sheetBody")); Snd.play("card");
}
function closeSheet() { $("sheet").classList.remove("on"); $("sheet").setAttribute("aria-hidden", "true"); }

/* ═════════════════ Общие блоки ═════════════════ */
const STATUS = {
  open: t => t.max_players && t.entries.length >= t.max_players ? ["", "Мест нет"] : ["", "Запись открыта"],
  running: () => ["live", "Идёт игра"],
  finished: () => ["done", "Завершён"]
};
function statusTag(t) { const [c, l] = STATUS[t.status](t); return `<span class="tag ${c}">${l}</span>`; }

function metaLine(t) {
  return `<div class="meta">
    ${t.location ? `<span>${I.pin}${esc(t.location)}</span>` : ""}
    <span>${I.stack}${fmt(t.stack)} фишек</span>
    ${t.rebuy_chips ? `<span>${I.rebuy}ребай ${fmt(t.rebuy_chips)}</span>` : ""}
    ${t.max_players ? `<span>${I.users}${t.entries.length}/${t.max_players}</span>` : ""}</div>`;
}
function joinButton(t) {
  if (t.status === "finished") return "";
  if (t.my_status === "wait") return `<span class="chip-btn wait">В очереди · ${t.position}</span>`;
  if (t.joined) return `<span class="chip-btn ok">Ты в игре ✓</span>`;
  if (t.status === "running") return "";
  const full = t.max_players && t.entries.length >= t.max_players;
  return `<button class="chip-btn" data-act="join" data-id="${t.id}">${full ? "В лист ожидания" : "Записаться"}</button>`;
}
function tcard(t, i = 0) {
  const shown = t.entries.slice(0, 5).map(e => av(e, "sm")).join("");
  return `<div class="tcard rise" style="--i:${i}" role="button" tabindex="0" data-act="open-t" data-id="${t.id}">
    <div class="hero-card"><div class="hero-suit">♠</div>
      <div class="tc-head">${statusTag(t)}<span class="tc-date">${fmtDate(t.starts_at)}</span></div>
      <div class="tc-title">${esc(t.title)}</div>${metaLine(t)}
      <div class="tc-foot"><div class="stack">${shown}</div>
        <span class="grow">${t.entries.length} ${plural(t.entries.length, "игрок", "игрока", "игроков")}${t.waitlist.length ? ` · ${t.waitlist.length} в очереди` : ""}</span>${joinButton(t)}</div>
    </div></div>`;
}
function countdownHTML(iso) {
  return `<div class="countdown" data-countdown="${esc(iso)}">
    <div><b data-u="d">0</b><span>дней</span></div><div><b data-u="h">00</b><span>часов</span></div>
    <div><b data-u="m">00</b><span>минут</span></div><div><b data-u="s">00</b><span>секунд</span></div></div>`;
}
function tickCountdowns() {
  document.querySelectorAll("[data-countdown]").forEach(el => {
    let ms = Math.max(0, new Date(el.dataset.countdown) - Date.now());
    const d = Math.floor(ms / 864e5); ms -= d * 864e5;
    const h = Math.floor(ms / 36e5); ms -= h * 36e5;
    const m = Math.floor(ms / 6e4); const s = Math.floor((ms - m * 6e4) / 1000);
    const set = (u, v) => { const b = el.querySelector(`[data-u="${u}"]`); if (b && b.textContent !== String(v)) b.textContent = v; };
    set("d", d); set("h", String(h).padStart(2, "0")); set("m", String(m).padStart(2, "0")); set("s", String(s).padStart(2, "0"));
  });
}
setInterval(tickCountdowns, 1000);

function rsvpSeg(t) {
  const cur = t.joined || t.my_status === "wait" ? "going" : t.rsvp;
  return seg([["going", "Иду"], ["maybe", "Может быть"], ["no", "Не смогу"]], cur, "rsvp", `data-id="${t.id}"`);
}
function podiumHTML(rows, valFn) {
  const top = rows.slice(0, 3), H = [100, 72, 54];
  return `<div class="podium">${[1, 0, 2].map(i => {
    const r = top[i]; if (!r) return "<span></span>";
    return `<button class="pod p${i + 1}" data-act="player" data-tg="${r.tg_id}">
      ${i === 0 ? '<div class="crown">♛</div>' : ""}${av(r, i === 0 ? "lg ring" : "")}
      <span class="pname">${esc(r.name)}</span><span class="pval">${valFn(r)}</span>
      <span class="step ${i === 0 ? "shine" : ""}" style="height:${H[i] * .5}%;animation-delay:${[.25, 0, .45][i]}s">${i + 1}</span></button>`;
  }).join("")}</div>`;
}

/* ═════════════════ Главная ═════════════════ */
function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Доброй ночи" : h < 12 ? "Доброе утро" : h < 18 ? "Добрый день" : "Добрый вечер";
}
async function renderHome(quiet = false) {
  const v = $("v-home");
  if (!v.innerHTML.trim()) v.innerHTML = `<div class="skel" style="height:40px;width:60%;margin:20px 0"></div><div class="skel" style="height:280px"></div>`;
  const [tours, prof] = await Promise.all([api("/tournaments"), api("/profile")]);
  const sig = JSON.stringify([tours, prof.stats, prof.rank, S.me.name]);
  S.tours = tours; S.prof = prof; markFab();
  if (quiet && sig === renderHome.sig) return;
  renderHome.sig = sig;
  const running = tours.active.filter(t => t.status === "running");
  const next = tours.active.find(t => t.status === "open");
  const st = prof.stats || {};
  const last = tours.finished[0];
  const lastWinner = last && last.entries.find(e => e.place === 1);
  const got = prof.achievements.filter(a => a.got);
  const today = new Date().toLocaleString("ru-RU", { weekday: "long", day: "numeric", month: "long" });

  v.innerHTML = `
    <div class="rise" style="margin:8px 0 22px">
      <div class="eyebrow">${esc(today)}</div>
      <h1 class="page" style="margin-top:10px">${greeting()},<br><span class="gold-text" style="font-style:italic">${esc(S.me.name)}</span></h1>
    </div>
    ${running.map(t => `<button class="live-banner" data-act="open-live" data-id="${t.id}">
        <span class="dot-live" style="display:flex"></span>
        <span class="grow"><b>${esc(t.title)}</b><small>Идёт игра · осталось ${t.alive} из ${t.entries.length}</small></span>
        ${I.chev}</button>`).join("")}
    ${next ? `<div class="rise" style="--i:1">
      <div class="hero-card"><div class="hero-suit">♠</div>
        <div class="tc-head"><span class="eyebrow">Ближайшая игра</span><span class="tc-date">${fmtDate(next.starts_at, false)}</span></div>
        <div class="tc-title" style="font-size:36px">${esc(next.title)}</div>${metaLine(next)}
        ${next.starts_at && new Date(next.starts_at) > Date.now() ? countdownHTML(next.starts_at) : ""}
        <div style="margin-top:16px">${rsvpSeg(next)}</div>
        ${next.my_status === "wait" ? `<p class="muted" style="font-size:13px;margin-top:10px;text-align:center">Мест нет — ты ${next.position}-й в листе ожидания. Сообщим, если освободится.</p>` : ""}
        <div class="tc-foot"><div class="stack">${next.entries.slice(0, 6).map(e => av(e, "sm")).join("")}</div>
          <span class="grow">${next.entries.length} ${plural(next.entries.length, "идёт", "идут", "идут")}${next.max_players ? ` из ${next.max_players}` : ""}</span>
          <button class="btn btn-ghost btn-sm" data-act="open-t" data-id="${next.id}">Подробнее</button></div>
      </div></div>`
      : `<div class="empty rise" style="--i:1"><div class="display">Стол пока пуст</div>Новых турниров не назначено.${S.admin ? `<button class="btn btn-gold" data-act="create">Назначить турнир</button>` : ""}</div>`}

    <div class="section rise" style="--i:2"><h3>Твой сезон</h3><button class="link" data-act="tab" data-tab="profile">Профиль</button></div>
    <div class="stats rise" style="--i:3">
      <div class="stat"><b data-cu="${st.points || 0}">0</b><span>очков</span></div>
      <div class="stat"><b>${prof.rank ? "#" + prof.rank : "—"}</b><span>место</span></div>
      <div class="stat"><b data-cu="${st.form || 0}" data-pct="1">0</b><span>форма</span></div>
    </div>

    <button class="btn btn-gold rise" style="--i:4;margin-top:14px" data-act="live">
      ${running.length ? "Открыть живую игру" : "Таймер блайндов"}</button>

    ${got.length ? `<div class="section rise" style="--i:5"><h3>Награды</h3><span class="muted" style="font-size:13px">${got.length} из ${prof.achievements.length}</span></div>
      <div class="ach-grid rise" style="--i:6">${got.slice(-4).reverse().map(achHTML).join("")}</div>` : ""}

    ${lastWinner ? `<div class="section rise" style="--i:7"><h3>Прошлая игра</h3><button class="link" data-act="open-t" data-id="${last.id}">Итоги</button></div>
      <button class="li panel rise" style="--i:8;padding:16px" data-act="open-t" data-id="${last.id}">
        ${av(lastWinner, "ring")}<span class="grow"><span class="name">${esc(lastWinner.name)}</span><small>победитель · ${esc(last.title)}</small></span>
        <span class="gold-text display" style="font-size:30px">♛</span></button>` : ""}`;
  runCountUps(v); pills(v); tickCountdowns(); checkAchievements(prof);
}

/* ═════════════════ Турниры ═════════════════ */
async function renderTours() {
  const v = $("v-tours");
  S.tours = await api("/tournaments"); markFab();
  const { active, finished } = S.tours;
  v.innerHTML = `
    <div class="topbar" style="justify-content:space-between"><h1 class="page">Турниры</h1>
      ${S.admin ? `<button class="btn btn-gold btn-sm" data-act="create">${I.plus}Новый</button>` : ""}</div>
    ${active.length ? active.map(tcard).join("") : `<div class="empty"><div class="display">Нет активных турниров</div>Следите за анонсами в боте.</div>`}
    ${finished.length ? `<div class="section"><h3>Архив</h3><span class="muted" style="font-size:13px">${finished.length}</span></div>
      <div class="list">${finished.map((t, i) => {
        const w = t.entries.find(e => e.place === 1);
        return `<button class="li rise" style="--i:${i}" data-act="open-t" data-id="${t.id}">
          ${w ? av(w, "sm") : ""}<span class="grow"><span class="name">${esc(t.title)}</span><small>${fmtDate(t.starts_at, false)} · ${t.entries.length} игр.</small></span>
          <span style="text-align:right;font-size:13px"><span class="gold-text">♛</span> ${esc(w ? w.name : "—")}</span>${I.chev}</button>`;
      }).join("")}</div>` : ""}`;
}

/* ═════════════════ Турнир ═════════════════ */
async function openDetail(id) {
  S.t = await api("/tournaments/" + id);
  if (S.lastDetailId !== +id) S.dtab = S.t.status === "finished" ? "results" : "players";
  S.lastDetailId = +id;
  push("detail"); renderDetail();
}
async function refreshDetail() { if (S.t) { S.t = await api("/tournaments/" + S.t.id); renderDetail(); } }

function renderDetail() {
  const t = S.t, v = $("v-detail"), A = S.admin, fin = t.status === "finished";
  const tabs = [
    ...(fin ? [["results", "Итоги"]] : []),
    ["players", `Игроки<span class="cnt">${t.entries.length}</span>`],
    ["predict", "Прогноз"],
    ["photos", `Фото${t.photos.length ? `<span class="cnt">${t.photos.length}</span>` : ""}`]
  ];
  if (fin && S.dStatus && S.dStatus !== "finished") S.dtab = "results";
  S.dStatus = t.status;
  if (!tabs.some(x => x[0] === S.dtab)) S.dtab = tabs[0][0];
  v.innerHTML = `${topbar("", t.starts_at && !fin ? `<button class="icon-btn" data-act="ics" aria-label="В календарь">${I.cal}</button>` : "")}
    <div class="rise">${statusTag(t)}<span class="muted" style="font-size:13px;margin-left:10px">${fmtDate(t.starts_at)}</span></div>
    <h2 class="title rise" style="--i:1;margin-top:14px">${esc(t.title)}</h2>
    <div class="rise" style="--i:2">${metaLine(t)}</div>

    ${t.status === "open" ? `<div class="rise" style="--i:3;margin-top:20px">
        ${t.starts_at && new Date(t.starts_at) > Date.now() ? countdownHTML(t.starts_at) : ""}
        <div style="margin-top:12px">${rsvpSeg(t)}</div>
        ${t.my_status === "wait" ? `<p class="muted" style="font-size:13px;margin-top:10px;text-align:center">Мест нет — ты ${t.position}-й в листе ожидания.</p>` : ""}</div>` : ""}
    ${t.status === "running" ? `<button class="btn btn-gold rise" style="--i:3;margin-top:20px" data-act="open-live" data-id="${t.id}">Открыть живую игру · ${t.alive}/${t.entries.length}</button>` : ""}

    ${A && !fin ? `<div class="row-btns rise" style="--i:4">
        <button class="btn btn-ghost" data-act="seat">${I.shuffle}Рассадка</button>
        ${t.status === "open" ? `<button class="btn btn-ghost" data-act="start-t">${I.play}Начать</button>` : `<button class="btn btn-ghost" data-act="open-live" data-id="${t.id}">${I.play}Таймер</button>`}
        <button class="btn btn-ghost" data-act="add-open">${I.plus}Игрок</button>
        <button class="btn btn-danger" data-act="delete-t">${I.trash}Удалить</button></div>` : ""}
    ${A && fin ? `<div class="row-btns rise" style="--i:4;grid-template-columns:1fr"><button class="btn btn-danger" data-act="delete-t">${I.trash}Удалить турнир</button></div>` : ""}

    <div class="tabs"><span class="tab-line"></span>${tabs.map(([k, l]) => `<button class="${k === S.dtab ? "on" : ""}" data-act="dtab" data-v="${k}">${l}</button>`).join("")}</div>
    <div id="dBody">${DTAB[S.dtab](t)}</div>`;
  pills(v); tickCountdowns();
}

const DTAB = {
  results(t) {
    const rows = [...t.entries].sort((a, b) => (a.place || 99) - (b.place || 99));
    const right = t.predictions.correct;
    return podiumHTML(rows, r => `${r.points} очк.`) + `<div class="list">${rows.map((e, i) => `
      <button class="li rise" style="--i:${i}" data-act="player" data-tg="${e.tg_id}">
        <span class="rank">${e.place}</span>${av(e, "sm")}
        <span class="grow"><span class="name">${esc(e.name)}</span>
          <small>${[e.base_points != null && e.base_points !== e.points ? `за место ${fmt(e.base_points)}` : "", e.knockouts ? `нокаутов ${e.knockouts}` : "", e.rebuys ? `ребаев ${e.rebuys}` : ""].filter(Boolean).join(" · ") || "—"}</small>
          ${["won", "lost"].includes(e.bet_status) ? (() => { const pk = t.entries.find(x => x.tg_id === e.bet_pick);
            return `<small class="${e.bet_status === "won" ? "pos" : "neg"}">${e.bet_status === "won" ? "✓" : "✗"} ставка → ${esc(pk ? pk.name : "?")}: ${fmt(e.bet_stake)} × ${e.bet_coef} ${e.bet_status === "won" ? `= +${fmt(e.bet_payout - e.bet_stake)}` : `= −${fmt(e.bet_stake)}`}</small>`; })() : ""}</span>
        <span class="val gold-text">${e.points}</span></button>`).join("")}</div>
      ${right.length ? `<p class="muted" style="font-size:13px;margin-top:14px">🔮 Угадали победителя: ${t.entries.concat([]).filter(e => right.includes(e.tg_id)).map(e => esc(e.name)).join(", ") || right.length + " чел."}</p>` : ""}
      ${S.admin ? "" : ""}`;
  },
  players(t) {
    const A = S.admin, fin = t.status === "finished";
    const seated = t.entries.some(e => e.table_no);
    const tables = new Set(t.entries.map(e => e.table_no).filter(Boolean)).size;
    const row = (e, i) => `<div class="li rise" style="--i:${i}">${av(e)}
      <span class="grow"><span class="name">${esc(e.name)}${e.tg_id === S.me.tg_id ? ' <span class="gold-text" style="font-size:12px">· ты</span>' : ""}</span>
        <small>${fin && e.place ? `${e.place} место · ${e.points} очк.` : e.place ? `выбыл · ${e.place} место` : t.status === "running" ? "в игре" : e.username ? "@" + esc(e.username) : "записан"}</small></span>
      ${seated && e.seat_no ? `<span class="seat">${tables > 1 ? `Стол ${e.table_no} · ` : ""}Место ${e.seat_no}</span>` : ""}
      ${A && !fin && t.status === "open" ? `<button class="x-btn" data-act="remove" data-tg="${e.tg_id}" aria-label="Убрать">✕</button>` : ""}</div>`;
    const list = [...t.entries].sort((a, b) => seated ? (a.table_no - b.table_no || a.seat_no - b.seat_no) : 0);
    return `${list.length ? `<div class="list">${list.map(row).join("")}</div>` : `<div class="empty">Пока никто не записался — будь первым.</div>`}
      ${t.waitlist.length ? `<div class="section"><h3>Лист ожидания</h3></div><div class="list">${t.waitlist.map((e, i) => `<div class="li">${av(e, "sm")}<span class="grow"><span class="name">${esc(e.name)}</span></span><span class="tag wait">${i + 1}</span>
        ${A ? `<button class="x-btn" data-act="remove" data-tg="${e.tg_id}" aria-label="Убрать">✕</button>` : ""}</div>`).join("")}</div>` : ""}
      ${t.maybe.length ? `<div class="section"><h3>Не определились</h3></div><div class="list">${t.maybe.map(e => `<div class="li">${av(e, "sm")}<span class="grow"><span class="name">${esc(e.name)}</span></span><span class="muted" style="font-size:13px">${e.answer === "maybe" ? "может быть" : "не сможет"}</span></div>`).join("")}</div>` : ""}`;
  },
  predict(t) {
    const P = t.predictions, total = P.total || 0, open = t.status === "open";
    if (t.entries.length < 2) return `<div class="empty">Прогнозы откроются, когда запишутся хотя бы двое.</div>`;
    const winner = t.entries.find(e => e.place === 1 && t.status === "finished");
    const head = open
      ? `<p class="muted" style="margin-bottom:14px">Кто заберёт турнир? Угадавшие попадут в рейтинг оракулов. Прогноз можно менять до старта.</p>`
      : winner ? `<div class="panel" style="margin-bottom:14px;display:flex;align-items:center;gap:12px">${av(winner, "ring")}<div><div class="eyebrow">Победитель</div><b>${esc(winner.name)}</b></div>
          <span style="margin-left:auto" class="${P.correct.includes(S.me.tg_id) ? "pos" : "muted"}">${P.mine == null ? "" : P.correct.includes(S.me.tg_id) ? "Ты угадал 🔮" : "Мимо"}</span></div>`
      : `<p class="muted" style="margin-bottom:14px">Приём прогнозов закрыт — игра уже идёт.</p>`;
    const rows = [...t.entries].sort((a, b) => (P.tally[b.tg_id] || 0) - (P.tally[a.tg_id] || 0));
    return head + `<div class="list">${rows.map((e, i) => {
      const n = P.tally[e.tg_id] || 0, pct = total ? Math.round(n / total * 100) : 0;
      return `<button class="pred ${P.mine === e.tg_id ? "mine" : ""}" ${open ? `data-act="predict" data-tg="${e.tg_id}"` : "disabled"}>
        <span class="fill" style="width:${pct}%;animation-delay:${i * 60}ms"></span>${av(e, "sm")}
        <span class="grow">${esc(e.name)}${P.mine === e.tg_id ? ' <span class="gold-text" style="font-size:12px">· твой выбор</span>' : ""}</span>
        <span class="pct">${pct}%</span></button>`;
    }).join("")}</div><p class="muted" style="font-size:12.5px;margin-top:10px">Всего прогнозов: ${total}</p>`;
  },
  photos(t) {
    const can = S.admin || t.joined || t.entries.some(e => e.tg_id === S.me.tg_id);
    return `<div class="photos">${can ? `<button class="add-photo" data-act="photo-add"><span>${I.camera}Добавить</span></button>` : ""}
      ${t.photos.map(p => `<button data-act="photo-open" data-id="${p.id}"><img loading="lazy" src="photos/${esc(p.file)}" alt="Фото с игры"></button>`).join("")}</div>
      ${!t.photos.length && !can ? `<div class="empty">Фото появятся после игры.</div>` : ""}`;
  }
};

/* ═════════════════ Создание турнира ═════════════════ */
function renderCreate(pre = {}) {
  const d = new Date(); d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7)); d.setHours(19, 0, 0, 0);
  const local = new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  $("v-create").innerHTML = `${topbar()}
    <div class="eyebrow">Новый турнир</div><h2 class="title" style="margin:10px 0 20px">Назначить игру</h2>
    <label class="field"><span>Название</span><input id="cTitle" placeholder="Пятничный турнир" maxlength="64"></label>
    <label class="field"><span>Дата и время</span><input id="cDate" type="datetime-local" value="${local}"></label>
    <label class="field"><span>Место</span><input id="cLoc" placeholder="У Саши" maxlength="100"></label>
    <div class="grid2">
      <label class="field"><span>Стартовый стек</span><input id="cStack" type="number" inputmode="numeric" value="${pre.stack || 3000}"></label>
      <label class="field"><span>Мест (0 — без лимита)</span><input id="cMax" type="number" inputmode="numeric" value="${pre.max || 0}"></label>
      <label class="field"><span>Ребай, фишек</span><input id="cRebuy" type="number" inputmode="numeric" value="${pre.rebuy ?? 3000}"></label>
      <label class="field"><span>Аддон, фишек</span><input id="cAddon" type="number" inputmode="numeric" value="0"></label>
    </div>
    <p class="muted" style="font-size:12.5px;margin:2px 2px 8px">Ребай или аддон «0» — значит, их в этом турнире нет.</p>
    <button class="btn btn-ghost btn-sm" style="width:100%;margin-bottom:6px" data-act="chips">${I.stack}Рассчитать по моим фишкам</button>
    <button class="toggle" data-act="toggle" data-key="announce"><span class="grow">Анонс всем игрокам<small>Бот пришлёт приглашение с кнопкой записи</small></span><span class="switch on" id="cAnn"></span></button>
    <button class="btn btn-gold" style="margin-top:16px" data-act="create-save">Назначить турнир</button>`;
}

/* ═════════════════ Живая игра / таймер ═════════════════ */
const lvMs = (c, i) => (c.levels[i] && c.levels[i].brk ? c.breakMin : c.minutes) * 6e4;
function clockNow(c, offset = 0) {
  let idx = c.idx, endsAt = c.ends_at, running = c.running, rem;
  const now = Date.now() + offset;
  if (running) {
    while (endsAt <= now) {
      if (idx < c.levels.length - 1) { idx++; endsAt += lvMs(c, idx); } else { running = false; break; }
    }
    rem = running ? endsAt - now : 0;
  } else rem = c.remaining ?? lvMs(c, idx);
  return { idx, rem: Math.max(0, rem), running, total: lvMs(c, idx), done: !running && rem <= 0 && idx === c.levels.length - 1 && c.started };
}
function clockCmd(c, cmd) { // зеркало серверной логики для локального таймера
  const n = clockNow(c); c.idx = n.idx;
  if (c.running) { c.ends_at = Date.now() + n.rem; if (!n.running) { c.running = false; c.remaining = 0; } }
  if (cmd === "start" && !c.running) {
    let rem = c.remaining ? c.remaining : lvMs(c, c.idx);
    if (c.remaining === 0 && c.idx === c.levels.length - 1) { c.idx = 0; rem = lvMs(c, 0); }
    c.ends_at = Date.now() + rem; c.running = true; c.started = true;
  } else if (cmd === "pause" && c.running) { c.remaining = Math.max(0, c.ends_at - Date.now()); c.running = false; }
  else if (cmd === "next" || cmd === "prev") {
    const i = c.idx + (cmd === "next" ? 1 : -1);
    if (i >= 0 && i < c.levels.length) { c.idx = i; c.remaining = lvMs(c, i); if (c.running) c.ends_at = Date.now() + c.remaining; }
  } else if (cmd === "add_minute") { if (c.running) c.ends_at += 6e4; else c.remaining = (c.remaining || lvMs(c, c.idx)) + 6e4; }
  else if (cmd === "reset") Object.assign(c, freshLocal());
  return c;
}
const freshLocal = () => ({ levels: S.structure.levels, minutes: S.structure.minutes, breakMin: S.structure.breakMin, idx: 0, running: false, ends_at: 0, remaining: null, started: false });
const fmtBl = l => l.brk ? "Перерыв" : `${fmt(l.sb)} / ${fmt(l.bb)}`;
const levelNo = (c, i) => c.levels.slice(0, i + 1).filter(l => !l.brk).length;
const keep = { lock: null };
async function keepAwake(on) {
  try {
    if (on && "wakeLock" in navigator && !keep.lock) { keep.lock = await navigator.wakeLock.request("screen"); keep.lock.addEventListener("release", () => keep.lock = null); }
    if (!on && keep.lock) { await keep.lock.release(); keep.lock = null; }
  } catch (e) {}
}

async function openLive(id) {
  if (id) {
    const t = await api("/tournaments/" + id);
    S.live = { mode: "t", t, offset: t.server_now - Date.now(), lastIdx: null, warned: -1, ticked: null, alive: t.alive };
  } else {
    S.live = { mode: "local", c: store.get("localClock") || freshLocal(), offset: 0, lastIdx: null, warned: -1, ticked: null };
  }
  push("live"); renderLive(); startPolling(); Snd.play("open");
}
function liveClock() { return S.live.mode === "t" ? S.live.t.clock : S.live.c; }
function canControl() { return S.live.mode === "local" || S.admin; }

function ringSVG() {
  const R = 136, C = 2 * Math.PI * R;
  let ticks = "";
  for (let i = 0; i < 60; i++) {
    const a = i / 60 * Math.PI * 2, r1 = i % 5 ? 150 : 146, r2 = 156;
    ticks += `<line x1="${160 + Math.sin(a) * r1}" y1="${160 - Math.cos(a) * r1}" x2="${160 + Math.sin(a) * r2}" y2="${160 - Math.cos(a) * r2}" stroke="${i % 5 ? "rgba(232,212,165,.18)" : "rgba(232,212,165,.5)"}" stroke-width="${i % 5 ? 1 : 1.6}"/>`;
  }
  return `<svg viewBox="0 0 320 320" aria-hidden="true">
    <defs><linearGradient id="gg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7e9bd"/><stop offset=".45" stop-color="#d8b46a"/><stop offset="1" stop-color="#9b7333"/></linearGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <radialGradient id="face" cx=".5" cy=".4" r=".6"><stop offset="0" stop-color="rgba(26,72,52,.55)"/><stop offset="1" stop-color="rgba(6,13,10,0)"/></radialGradient></defs>
    ${ticks}
    <circle cx="160" cy="160" r="128" fill="url(#face)"/>
    <circle cx="160" cy="160" r="${R}" fill="none" stroke="rgba(232,212,165,.08)" stroke-width="5"/>
    <circle id="lvProg" class="ring-progress" cx="160" cy="160" r="${R}" fill="none" stroke="url(#gg)" stroke-width="5" stroke-linecap="round"
      stroke-dasharray="${C}" stroke-dashoffset="0" transform="rotate(-90 160 160)" filter="url(#glow)"/>
    <circle id="lvDot" r="6" fill="#f7e9bd" filter="url(#glow)"/></svg>`;
}

function renderLive() {
  const L = S.live, v = $("v-live"), c = liveClock(), t = L.t, ctrl = canControl();
  const me = t && t.entries.find(e => e.tg_id === S.me.tg_id);
  const tables = t ? new Set(t.entries.map(e => e.table_no).filter(Boolean)).size : 0;
  if (!c) { v.innerHTML = topbar() + `<div class="empty">Таймер появится после старта турнира.</div>`; return; }
  const alive = t ? t.entries.filter(e => e.place == null) : [];
  const out = t ? t.entries.filter(e => e.place != null).sort((a, b) => a.place - b.place) : [];
  v.innerHTML = `${topbar(`<div class="eyebrow" style="text-align:center">${t ? esc(t.title) : "Таймер блайндов"}</div>`,
      `<button class="icon-btn" data-act="sound" aria-label="Звук">${Snd.on ? I.sound : I.mute}</button>`)}
    <div class="clock-wrap">${ringSVG()}
      <div class="clock-center">
        <div class="clock-level" id="lvName">Уровень 1</div>
        <div class="clock-blinds" id="lvBlinds">—</div>
        <div class="clock-ante" id="lvAnte"></div>
        <div class="clock-time" id="lvTime">00:00</div>
      </div></div>
    <div class="clock-next">
      <div><span>Далее</span><b id="lvNext">—</b></div>
      ${t ? `<div><span>Игроков</span><b style="white-space:nowrap">${alive.length}<span class="muted" style="font-size:14px">&thinsp;/&thinsp;${t.entries.length}</span></b></div>
             <div><span>Средний стек</span><b id="lvAvg">—</b></div>` : ""}
    </div>
    ${ctrl ? `<div class="controls">
        <button class="ctl" data-act="clock" data-cmd="prev" aria-label="Предыдущий уровень">${I.prev}</button>
        <button class="ctl" data-act="clock" data-cmd="reset" aria-label="Сброс">${I.undo}</button>
        <button class="ctl main" id="lvPlay" data-act="clock" data-cmd="toggle">Старт</button>
        <button class="ctl" data-act="clock" data-cmd="add_minute" aria-label="Плюс минута"><small>+1м</small></button>
        <button class="ctl" data-act="clock" data-cmd="next" aria-label="Следующий уровень">${I.next}</button></div>`
      : `<p class="muted" style="text-align:center;font-size:13px">Таймером управляет организатор. Звук сменит уровень у всех одновременно.</p>`}
    ${me && me.seat_no ? `<div class="panel" style="margin-top:16px;text-align:center"><span class="eyebrow">Твоё место</span><div class="display" style="font-size:28px;margin-top:4px">${tables > 1 ? `Стол ${me.table_no} · ` : ""}Место ${me.seat_no}</div></div>` : ""}
    ${t ? `
      <div class="section"><h3>В игре</h3>${S.admin ? `<span class="muted" style="font-size:12.5px">нажми на игрока</span>` : ""}</div>
      <div class="pgrid">${alive.map(e => `<button class="pchip" data-act="pmenu" data-tg="${e.tg_id}" id="pc-${e.tg_id}">
          ${e.knockouts ? `<span class="ko">✦${e.knockouts}</span>` : ""}${av(e)}
          <span class="pn">${esc(e.name)}</span>
          <span class="pm">${e.seat_no ? (tables > 1 ? `С${e.table_no} · ` : "") + "место " + e.seat_no : e.rebuys ? `ребаев ${e.rebuys}` : "&nbsp;"}</span></button>`).join("")}</div>
      ${out.length ? `<div class="section"><h3>Выбыли</h3>${S.admin ? `<button class="link" data-act="unbust">${"Отменить последний"}</button>` : ""}</div>
        <div class="list">${out.map(e => {
          const by = e.knocked_by && t.entries.find(x => x.tg_id === e.knocked_by);
          const pick = e.bet_pick && t.entries.find(x => x.tg_id === e.bet_pick);
          const bet = e.bet_status === "placed" ? `<span class="bet-tag">→ ${esc(pick ? pick.name : "?")} · ${fmt(e.bet_stake)} × ${e.bet_coef}</span>`
            : e.bet_status === "pending" ? (S.admin ? `<button class="chip-btn" data-act="bet-open" data-tg="${e.tg_id}">Ставка</button>` : `<span class="muted" style="font-size:12px">думает…</span>`)
            : e.bet_status === "declined" ? `<span class="muted" style="font-size:12px">без ставки</span>` : "";
          const cancel = S.admin && ["placed", "declined"].includes(e.bet_status) && t.bet_coef_now ? `<button class="x-btn" data-act="bet-cancel" data-tg="${e.tg_id}" aria-label="Отменить решение">↺</button>` : "";
          const ret = S.admin ? `<button class="x-btn" data-act="unbust-one" data-tg="${e.tg_id}" aria-label="Вернуть в игру" title="Вернуть в игру">⤺</button>` : "";
          return `<div class="li"><span class="rank">${e.place}</span>${av(e, "sm")}<span class="grow"><span class="name">${esc(e.name)}</span><small>${by ? "выбил " + esc(by.name) : "выбыл"}${e.base_points ? ` · ${fmt(e.base_points)} очк.` : ""}</small></span>${bet}${cancel}${ret}</div>`;
        }).join("")}</div>` : ""}` : `
      <button class="btn btn-ghost" style="margin-top:22px" data-act="structure">${I.list}Структура блайндов</button>`}`;
  L.lastIdx = null;
  liveTick(true);
}

function liveTick(silent = false) {
  const L = S.live; if (!L || !$("v-live").classList.contains("on")) return;
  const c = liveClock(); if (!c || !$("lvTime")) return;
  const n = clockNow(c, L.offset), l = c.levels[n.idx];
  const m = Math.floor(n.rem / 6e4), s = Math.floor(n.rem % 6e4 / 1000);
  $("lvName").textContent = l.brk ? "Перерыв" : `Уровень ${levelNo(c, n.idx)}`;
  const bl = $("lvBlinds"); bl.textContent = l.brk ? "Отдых" : fmtBl(l); bl.classList.toggle("brk", !!l.brk);
  $("lvAnte").textContent = l.brk ? `${c.breakMin} минут на перерыв` : l.ante ? `анте ${fmt(l.ante)}` : "без анте";
  const tm = $("lvTime"); tm.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  tm.classList.toggle("low", n.running && n.rem <= 6e4);
  const R = 136, C = 2 * Math.PI * R, k = n.total ? n.rem / n.total : 0;
  $("lvProg").style.strokeDashoffset = C * (1 - k);
  const a = -Math.PI / 2 + (Math.PI * 2) * k;
  $("lvDot").setAttribute("cx", 160 + Math.cos(a) * R); $("lvDot").setAttribute("cy", 160 + Math.sin(a) * R);
  const nx = c.levels.slice(n.idx + 1).find(x => !x.brk), nxBrk = c.levels[n.idx + 1] && c.levels[n.idx + 1].brk;
  $("lvNext").textContent = nxBrk ? "перерыв" : nx ? fmtBl(nx) : "финал";
  if ($("lvAvg") && L.t) { const bb = l.brk ? (c.levels.slice(0, n.idx).reverse().find(x => !x.brk) || {}).bb : l.bb; $("lvAvg").textContent = bb ? `${Math.round(L.t.avg_stack / bb)} BB` : fmt(L.t.avg_stack); }
  const pb = $("lvPlay");
  if (pb) { pb.textContent = n.running ? "Пауза" : n.done ? "Заново" : c.started ? "Дальше" : "Старт"; pb.classList.toggle("paused", !n.running && c.started && !n.done); }

  // звуки и эффекты
  if (L.lastIdx !== null && n.idx !== L.lastIdx && !silent) {
    if (n.idx > L.lastIdx) levelOverlay(c, n.idx);
    L.warned = -1; L.ticked = null;
  }
  if (L.lastIdx !== null && !silent && L.wasRunning && n.done && !L.doneShown) { L.doneShown = true; Snd.play("win"); }
  L.lastIdx = n.idx; L.wasRunning = n.running;
  if (n.running) {
    if (n.rem <= 6e4 && n.total > 6e4 && L.warned !== n.idx) { L.warned = n.idx; if (!silent) { Snd.play("warn"); haptic("warning"); } }
    const sec = Math.ceil(n.rem / 1000);
    if (sec <= 5 && sec > 0 && sec !== L.ticked) { L.ticked = sec; if (!silent) { Snd.play("tick"); haptic("select"); } }
  }
  if (L.mode === "local" && n.running && n.idx !== c.idx) { c.idx = n.idx; store.set("localClock", c); }
}
function levelOverlay(c, idx) {
  const l = c.levels[idx];
  Snd.play(l.brk ? "brk" : "level"); haptic("success");
  if (reduced) return;
  const ov = $("overlay");
  ov.innerHTML = `<div class="lvl-flash"></div><div class="lvl-card">
    <div class="eyebrow">${l.brk ? "Время отдохнуть" : `Уровень ${levelNo(c, idx)}`}</div>
    ${l.brk ? `<div class="display">Перерыв</div><p class="muted">${c.breakMin} минут</p>` : `<b>${fmtBl(l)}</b>${l.ante ? `<p class="muted">анте ${fmt(l.ante)}</p>` : ""}`}</div>`;
  clearTimeout(levelOverlay.h); levelOverlay.h = setTimeout(() => ov.innerHTML = "", 2700);
}
function winOverlay(t) {
  const w = t.entries.find(e => e.place === 1); if (!w) return;
  if (winOverlay.shown === t.id) return; winOverlay.shown = t.id;
  Snd.play("win"); haptic("success"); chipRain(110, 4200);
  const ov = $("overlay");
  ov.innerHTML = `<div class="lvl-flash win-bg"></div><div class="win-card" data-act="overlay-close">
    <div class="crown-big">♛</div><div class="eyebrow" style="margin-top:12px">Победитель турнира</div>
    <h2 class="gold-text">${esc(w.name)}</h2><p class="muted">${w.points} очков${w.knockouts ? ` · нокаутов ${w.knockouts}` : ""}</p></div>`;
  ov.style.pointerEvents = "auto";
  const close = () => { ov.innerHTML = ""; ov.style.pointerEvents = ""; ov.onclick = null; };
  ov.onclick = close; clearTimeout(winOverlay.h); winOverlay.h = setTimeout(close, 6500);
}

let pollTimer = null;
function startPolling() {
  stopPolling();
  pollTimer = setInterval(async () => {
    const onLive = $("v-live").classList.contains("on"), onDetail = $("v-detail").classList.contains("on");
    if (document.hidden) return;
    if (onLive && S.live && S.live.mode === "t") {
      try { applyLive(await api("/tournaments/" + S.live.t.id)); } catch (e) {}
    } else if (onDetail && S.t && S.t.status !== "finished") {
      try { const t = await api("/tournaments/" + S.t.id); const changed = JSON.stringify(t.entries) !== JSON.stringify(S.t.entries) || t.status !== S.t.status; S.t = t; if (changed) renderDetail(); } catch (e) {}
    }
  }, 4000);
}
function stopPolling() { clearInterval(pollTimer); pollTimer = null; }
function stopLive() { keepAwake(false); }

function applyLive(t, fromAction = false) {
  const L = S.live, prev = L.t;
  L.t = t; L.offset = t.server_now - Date.now();
  const prevOut = new Set(prev.entries.filter(e => e.place != null).map(e => e.tg_id));
  const newly = t.entries.filter(e => e.place != null && !prevOut.has(e.tg_id) && e.place !== 1);
  const structural = newly.length || prev.entries.length !== t.entries.length || prev.status !== t.status ||
    JSON.stringify(prev.entries.map(e => [e.knockouts, e.rebuys, e.seat_no, e.place, e.bet_status])) !== JSON.stringify(t.entries.map(e => [e.knockouts, e.rebuys, e.seat_no, e.place, e.bet_status]));
  const finishedNow = prev.status !== "finished" && t.status === "finished";
  const doRender = () => {
    const keepIdx = L.lastIdx, keepW = L.warned, keepT = L.ticked;
    renderLive(); L.lastIdx = keepIdx; L.warned = keepW; L.ticked = keepT;
  };
  if (newly.length && !finishedNow) {
    newly.forEach(e => { const el = $("pc-" + e.tg_id); if (el) el.classList.add("busting"); });
    if (!fromAction) { Snd.play("bust"); haptic("heavy"); }
    const e = newly[newly.length - 1]; toast(`${e.name} выбывает · ${e.place} место`);
    setTimeout(doRender, reduced ? 0 : 650);
  } else if (structural) doRender();
  if (finishedNow) { doRender(); winOverlay(t); }
  if (t.clock && t.clock.running) keepAwake(true);
}

function playerMenu(tg_id) {
  const t = S.live.t, e = t.entries.find(x => x.tg_id === tg_id); if (!e) return;
  const others = t.entries.filter(x => x.place == null && x.tg_id !== tg_id);
  const alive = t.entries.filter(x => x.place == null).length;
  openSheet(`<div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">${av(e, "lg ring")}<div><h3>${esc(e.name)}</h3>
      <span class="muted" style="font-size:13px">${e.knockouts ? `нокаутов ${e.knockouts} · ` : ""}ребаев ${e.rebuys}${t.addon_chips ? ` · аддонов ${e.addons}` : ""}</span></div></div>
    ${t.rebuy_chips || t.addon_chips ? `<div class="list" style="margin-bottom:16px">
      ${t.rebuy_chips ? `<div class="li"><span class="grow"><span class="name">Ребай</span><small>+${fmt(t.rebuy_chips)} фишек</small></span>
        <div class="stepper"><button data-act="pm-rebuy" data-tg="${tg_id}" data-d="-1" aria-label="Минус">−</button><b>${e.rebuys}</b><button data-act="pm-rebuy" data-tg="${tg_id}" data-d="1" aria-label="Плюс">+</button></div></div>` : ""}
      ${t.addon_chips ? `<div class="li"><span class="grow"><span class="name">Аддон</span><small>+${fmt(t.addon_chips)} фишек</small></span>
        <div class="stepper"><button data-act="pm-addon" data-tg="${tg_id}" data-d="-1" aria-label="Минус">−</button><b>${e.addons}</b><button data-act="pm-addon" data-tg="${tg_id}" data-d="1" aria-label="Плюс">+</button></div></div>` : ""}</div>` : ""}
    <div class="eyebrow" style="margin-bottom:10px">Выбывает на ${alive} месте · кто выбил?</div>
    <div class="list">${others.map(o => `<button class="li" data-act="bust" data-tg="${tg_id}" data-by="${o.tg_id}">${av(o, "sm")}<span class="grow"><span class="name">${esc(o.name)}</span></span><span class="seat">+нокаут</span></button>`).join("")}</div>
    <button class="btn btn-danger" style="margin-top:12px" data-act="bust" data-tg="${tg_id}" data-by="0">Выбыл без нокаута</button>`);
}

/* ═════════════════ Ставка на победителя ═════════════════ */
function betSheet(tg_id) {
  const t = S.live && S.live.t; if (!t) return;
  const e = t.entries.find(x => x.tg_id === tg_id);
  const alive = t.entries.filter(x => x.place == null);
  if (!e || e.bet_status !== "pending" || !t.bet_coef_now || alive.length < 2) return;
  const max = e.base_points || 0;
  S.bet = { tg: tg_id, pick: null, stake: Math.max(1, Math.round(max / 2)), max, coef: t.bet_coef_now };
  openSheet(`<div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">${av(e, "lg ring")}
      <div><div class="eyebrow">Выбыл на ${e.place} месте</div><h3 style="margin:4px 0 0">${esc(e.name)}</h3></div></div>
    <div class="bet-head">
      <div><span>Заработал за игру</span><b class="gold-text">${fmt(max)}</b></div>
      <div><span>Коэффициент</span><b>×${t.bet_coef_now}</b></div></div>
    <p class="muted" style="font-size:13.5px;margin:14px 0 10px">На кого <b style="color:var(--ivory)">${esc(e.name)}</b> ставит в качестве победителя?</p>
    <div class="list">${alive.map(a => `<button class="li bet-pick" data-act="bet-pick" data-tg="${a.tg_id}">${av(a, "sm")}
      <span class="grow"><span class="name">${esc(a.name)}</span><small>${a.knockouts ? `нокаутов ${a.knockouts}` : "в игре"}</small></span><span class="radio"></span></button>`).join("")}</div>
    <div class="eyebrow" style="margin:20px 0 10px">Сколько очков ставит</div>
    <div class="stake"><input id="betStake" type="range" min="1" max="${max}" step="1" value="${S.bet.stake}" aria-label="Ставка"><b id="betStakeV" class="num">0</b></div>
    <div class="quick">${[25, 50, 75, 100].map(p => `<button data-act="bet-quick" data-p="${p}">${p === 100 ? "Всё" : p + "%"}</button>`).join("")}</div>
    <div class="bet-sum"><div><span>Если угадает</span><b class="pos" id="betWin">—</b></div><div><span>Если нет</span><b class="neg" id="betLose">—</b></div></div>
    <button class="btn btn-gold" id="betGo" data-act="bet-place" disabled>Выберите победителя</button>
    <button class="btn btn-ghost" style="margin-top:10px" data-act="bet-decline">Отказаться — ${fmt(max)} очков останутся</button>
    <p class="dim" style="font-size:12px;margin-top:12px;line-height:1.5">Кэф = ${S.scoring.margin} × игроков в игре (${alive.length}). Чем позже вылет, тем меньше кэф — так поздняя ставка не выгоднее ранней.</p>`);
  updBet();
}
function updBet() {
  const B = S.bet; if (!B || !$("betStake")) return;
  B.stake = Math.max(1, Math.min(B.max, Math.round(+$("betStake").value || 1)));
  $("betStakeV").textContent = fmt(B.stake);
  const win = Math.round(B.stake * B.coef);
  $("betWin").textContent = `${fmt(B.max - B.stake + win)} очк.`;
  $("betLose").textContent = `${fmt(B.max - B.stake)} очк.`;
  document.querySelectorAll(".bet-pick").forEach(b => b.classList.toggle("on", +b.dataset.tg === B.pick));
  const go = $("betGo"); go.disabled = !B.pick;
  const pickName = B.pick && (S.live.t.entries.find(x => x.tg_id === B.pick) || {}).name;
  go.textContent = B.pick ? `Поставить ${fmt(B.stake)} на ${pickName}` : "Выберите победителя";
  const pct = (B.stake - 1) / Math.max(1, B.max - 1) * 100;
  $("betStake").style.setProperty("--p", pct + "%");
}
document.addEventListener("input", e => { if (e.target.id === "betStake") { updBet(); haptic("select"); } });

/* ═════════════════ Рейтинг ═════════════════ */
async function renderRating() {
  const v = $("v-rating");
  const d = await api("/stats?period=" + encodeURIComponent(S.period));
  S.ratingData = d;
  const years = [...new Set(d.months.map(m => m.slice(0, 4)))];
  const periods = [["", "Всё время"], ...years.map(y => [y, "Сезон " + y]), ...d.months.map(m => [m, monthName(m)])];
  const key = S.rsort;
  let rows, val, list;
  if (key === "oracle") {
    rows = d.oracles; val = r => `${r.hits} из ${r.tries}`;
  } else {
    rows = [...d.rows].sort((a, b) => (b[key] || 0) - (a[key] || 0) || b.points - a.points);
    val = r => key === "points" ? `${r.points}` : key === "knockouts" ? `✦ ${r.knockouts}` : `${r.form}%`;
  }
  list = rows.slice(3).map((r, i) => `<button class="li rise" style="--i:${i}" data-act="player" data-tg="${r.tg_id}">
      <span class="rank">${i + 4}</span>${av(r, "sm")}
      <span class="grow"><span class="name">${esc(r.name)}</span><small>${key === "oracle" ? "верных прогнозов" : `игр ${r.games} · побед ${r.wins} · топ-3 ${r.top3}`}</small></span>
      <span class="val">${val(r)}</span></button>`).join("");
  v.innerHTML = `<div class="topbar" style="justify-content:space-between"><h1 class="page">Рейтинг</h1>
      ${d.rows.length ? `<button class="btn btn-ghost btn-sm" data-act="season-card">${I.card}Карточка</button>` : ""}</div>
    <div class="chips">${periods.map(([p, l]) => `<button class="${p === S.period ? "on" : ""}" data-act="period" data-v="${p}">${esc(l)}</button>`).join("")}</div>
    ${seg([["points", "Очки"], ["knockouts", "Нокауты"], ["form", "Форма"], ["oracle", "Оракулы"]], key, "rsort", "", true)}
    ${rows.length ? podiumHTML(rows, val) + (list ? `<div class="list">${list}</div>` : "")
      : `<div class="empty" style="margin-top:18px"><div class="display">${key === "oracle" ? "Оракулов пока нет" : "Пока пусто"}</div>${key === "oracle" ? "Делайте прогнозы на победителя в карточке турнира." : "За этот период ещё не сыграно ни одного турнира."}</div>`}
    <p class="dim" style="font-size:12px;margin-top:18px;line-height:1.6">Очки: последнее место — ${S.scoring.base}, каждое место выше +${S.scoring.step}, победителю +${S.scoring.winner_bonus}, за нокаут +${S.scoring.bounty}${S.scoring.rebuy_penalty ? `, за ребай −${S.scoring.rebuy_penalty}` : ""}. Выбывший может поставить свои очки на победителя: кэф ${S.scoring.margin} × число оставшихся игроков. Форма — средний процент обыгранных соперников.</p>`;
  pills(v);
  const chip = v.querySelector(".chips .on"); chip && chip.scrollIntoView({ inline: "center", block: "nearest" });
}

/* Карточка сезона */
const UIF = '"Manrope",-apple-system,"Segoe UI",Roboto,Arial,sans-serif';
async function makeSeasonCard() {
  const d = S.ratingData, rows = d.rows.slice(0, 5);
  const label = !S.period ? "За всё время" : S.period.length === 4 ? "Сезон " + S.period : monthName(S.period);
  const sample = "АБВгдеЁЯя Итоги ♛ 0123456789";
  try { await Promise.all(['600 120px "Cormorant Garamond"', 'italic 600 120px "Cormorant Garamond"', '300 60px ' + UIF + '', '400 30px ' + UIF + '', '500 40px ' + UIF + '', '700 30px ' + UIF + ''].map(f => document.fonts.load(f, sample))); } catch (e) {}
  const W = 1080, H = 1350, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const x = cv.getContext("2d");
  let g = x.createRadialGradient(W / 2, 330, 40, W / 2, 500, 1000); g.addColorStop(0, "#17442f"); g.addColorStop(.55, "#0a1b14"); g.addColorStop(1, "#050b08");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * .035})`; x.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5); }
  const gold = x.createLinearGradient(0, 0, W, H); gold.addColorStop(0, "#f7e9bd"); gold.addColorStop(.35, "#dcb86c"); gold.addColorStop(.7, "#a77d3a"); gold.addColorStop(1, "#ecd393");
  x.strokeStyle = gold; x.lineWidth = 3; x.strokeRect(44, 44, W - 88, H - 88); x.lineWidth = 1; x.globalAlpha = .55; x.strokeRect(60, 60, W - 120, H - 120); x.globalAlpha = 1;
  x.fillStyle = gold; x.font = '600 54px "Cormorant Garamond"'; x.textAlign = "center";
  [["♠", 100, 120], ["♥", W - 100, 120], ["♦", 100, H - 90], ["♣", W - 100, H - 90]].forEach(([s, a, b]) => x.fillText(s, a, b));
  x.font = '700 26px ' + UIF + ''; x.fillStyle = "#d8b46a"; x.letterSpacing = "8px";
  x.fillText((S.club || "Покерный клуб").toUpperCase(), W / 2, 150); x.letterSpacing = "0px";
  x.fillStyle = "#efe8da"; x.font = 'italic 600 92px "Cormorant Garamond"'; x.fillText("Итоги", W / 2, 260);
  x.font = '300 40px ' + UIF + ''; x.fillStyle = "#8e9c94"; x.fillText(label, W / 2, 320);
  const c = rows[0];
  if (c) {
    x.font = '600 120px "Cormorant Garamond"'; x.fillStyle = gold; x.fillText("♛", W / 2, 490);
    x.font = '700 24px ' + UIF + ''; x.fillStyle = "#d8b46a"; x.letterSpacing = "8px"; x.fillText("ЧЕМПИОН", W / 2, 550); x.letterSpacing = "0px";
    let size = 130; x.font = `600 ${size}px "Cormorant Garamond"`;
    while (x.measureText(c.name).width > W - 220 && size > 60) { size -= 6; x.font = `600 ${size}px "Cormorant Garamond"`; }
    x.fillStyle = gold; x.fillText(c.name, W / 2, 680);
    x.font = '300 38px ' + UIF + ''; x.fillStyle = "#efe8da";
    x.fillText(`${c.points} очков · ${c.wins} ${plural(c.wins, "победа", "победы", "побед")} · ${c.games} ${plural(c.games, "игра", "игры", "игр")}`, W / 2, 750);
  }
  x.strokeStyle = gold; x.globalAlpha = .5; x.beginPath(); x.moveTo(300, 810); x.lineTo(W - 300, 810); x.stroke(); x.globalAlpha = 1;
  rows.slice(1).forEach((r, i) => {
    const y = 900 + i * 92;
    x.textAlign = "left"; x.font = '600 52px "Cormorant Garamond"'; x.fillStyle = "#d8b46a"; x.fillText(String(i + 2), 190, y);
    x.font = '500 40px ' + UIF + ''; x.fillStyle = "#efe8da";
    let nm = r.name; while (x.measureText(nm).width > 520 && nm.length > 3) nm = nm.slice(0, -2) + "…";
    x.fillText(nm, 270, y);
    x.textAlign = "right"; x.font = '300 44px ' + UIF + ''; x.fillStyle = "#f5e5b5"; x.fillText(String(r.points), W - 190, y);
  });
  x.textAlign = "center"; x.font = '400 26px ' + UIF + ''; x.fillStyle = "#5b6a62";
  x.fillText(`${d.games} ${plural(d.games, "турнир", "турнира", "турниров")} сыграно`, W / 2, H - 110);
  return cv.toDataURL("image/png");
}

/* ═════════════════ Калькулятор фишек ═════════════════ */
/* ═════════════════ Калькулятор фишек ═════════════════
   chips: [{face, value, count}] — что написано на фишке, сколько стоит в игре, сколько штук */
function chipPlan(chips, players, stack, rebuy, firstBB) {
  const ds = chips.filter(c => c.value > 0 && c.count > 0).map(c => ({ ...c }))
    .sort((a, b) => a.value - b.value);
  const N = Math.max(1, players | 0);
  if (!ds.length) return { error: "Добавьте фишки в набор" };
  const unit = ds.reduce((g, c) => gcd(g, c.value), 0);
  // нужны ли совсем мелкие фишки: те, что меньше половины малого блайнда, не раздаём
  const minUseful = firstBB ? Math.max(1, Math.floor(firstBB / 4)) : 0;
  const useful = ds.filter(c => c.value >= minUseful || c === ds.find(x => x.value >= minUseful));
  const pool = useful.length ? useful : ds;

  const maxPer = pool.map(c => Math.floor(c.count / N));
  const maxStack = pool.reduce((s, c, i) => s + maxPer[i] * c.value, 0);

  function distribute(S) {
    const u = unitOf(pool);
    if (S % u !== 0) return null;
    const k = pool.length, M = S / u;
    // желаемая раздача: мелких ~10–15 штук, основная масса стека — в крупных
    const w = pool.map((_, i) => Math.pow(2.2, i));
    const wsum = w.reduce((a, b) => a + b, 0);
    const want = pool.map((c, i) => Math.max(i < k - 1 ? 4 : 1, S * w[i] / wsum / c.value));
    // ограниченный «размен» с минимальным отклонением от желаемого (динамика по сумме)
    let dp = new Float64Array(M + 1).fill(Infinity); dp[0] = 0;
    const pick = [];
    for (let i = 0; i < k; i++) {
      const step = pool[i].value / u, nd = new Float64Array(M + 1).fill(Infinity), ch = new Int16Array(M + 1).fill(-1);
      for (let s0 = 0; s0 <= M; s0++) {
        if (dp[s0] === Infinity) continue;
        for (let n = 0; n <= maxPer[i]; n++) {
          const t = s0 + n * step; if (t > M) break;
          const c = dp[s0] + Math.abs(n - want[i]) / want[i] + n * 0.002;
          if (c < nd[t]) { nd[t] = c; ch[t] = n; }
        }
      }
      pick.push(ch); dp = nd;
    }
    if (dp[M] === Infinity) return null;
    const x = new Array(k).fill(0);
    for (let i = k - 1, t = M; i >= 0; i--) { x[i] = pick[i][t]; t -= x[i] * pool[i].value / u; }
    return x;
  }

  // стек: заданный или автоматически ~150 больших блайндов первого уровня
  let S = stack | 0, auto = false;
  if (!S) {
    auto = true;
    const target = (firstBB || 20) * 150;
    const candidates = [];
    for (let s = Math.min(maxStack, target * 2); s >= unitOf(pool); s -= unitOf(pool)) candidates.push(s);
    const nice = s => s % 1000 === 0 ? 3 : s % 500 === 0 ? 2 : s % 100 === 0 ? 1 : 0;
    candidates.sort((a, b) => (Math.abs(a - target) / target - nice(a) * 0.08) - (Math.abs(b - target) / target - nice(b) * 0.08));
    S = candidates.find(s => distribute(s)) || 0;
    if (!S) return { error: "Фишек не хватает даже на минимальный стек" };
  }
  if (S > maxStack) return { error: `На ${N} игроков фишек хватит максимум на стек ${maxStack}`, maxStack };
  const x = distribute(S);
  if (!x) return { error: `Стек ${S} не собрать этими фишками — попробуйте число, кратное ${unitOf(pool)}`, maxStack };

  // банк на ребаи
  const bank = ds.map(c => {
    const i = pool.indexOf(c);
    return { ...c, left: c.count - (i >= 0 ? x[i] * N : 0) };
  });
  const R = rebuy == null || rebuy === "" ? S : rebuy | 0;
  let rebuyPack = null, rebuysCovered = 0;
  if (R > 0) {
    const left = bank.map(b => b.left);
    const pack = () => {
      let rem = R; const take = bank.map(() => 0);
      for (let i = bank.length - 1; i >= 0; i--) {
        const n = Math.min(left[i], Math.floor(rem / bank[i].value));
        take[i] = n; rem -= n * bank[i].value;
      }
      return rem === 0 ? take : null;
    };
    const first = pack();
    if (first) rebuyPack = bank.map((b, i) => ({ face: b.face, value: b.value, n: first[i] })).filter(r => r.n);
    for (let g = 0; g < 200; g++) {
      const t = pack(); if (!t) break;
      t.forEach((n, i) => left[i] -= n); rebuysCovered++;
    }
  }
  const per = pool.map((c, i) => ({ face: c.face, value: c.value, n: x[i], sum: x[i] * c.value, total: x[i] * N, have: c.count }))
    .filter(r => r.n > 0);
  const smallest = per.length ? per[0].value : 0;
  return {
    stack: S, auto, players: N, rebuy: R, per, pieces: per.reduce((s, r) => s + r.n, 0),
    bank: bank.filter(b => b.left > 0), rebuyPack, rebuysCovered, maxStack,
    bb: firstBB ? Math.round(S / firstBB) : null,
    warn: firstBB && smallest > firstBB / 2 ? `Самая мелкая фишка в раздаче (${smallest}) больше малого блайнда первого уровня — поднимите блайнды или раздайте мельче` : ""
  };
}
function gcd(a, b) { return b ? gcd(b, a % b) : a; }
function unitOf(pool) { return pool.reduce((g, c) => gcd(g, c.value), 0) || 1; }


const CHIP_PALETTE = ["#f1e8d4", "#b8323b", "#2f5d9e", "#2a6b4f", "#1a1a1a", "#6b4aa0", "#d8b46a", "#c46a2b"];
function chipDot(i, face) {
  const c = CHIP_PALETTE[i % CHIP_PALETTE.length], light = i % CHIP_PALETTE.length === 0 || i % CHIP_PALETTE.length === 6;
  return `<span class="cdot" style="background:${c};color:${light ? "#1d1406" : "#f1e8d4"}">${esc(face)}</span>`;
}
function calcState() {
  if (!S.calc) S.calc = { players: store.get("calc_players", 5), stack: store.get("calc_stack", 0), rebuy: store.get("calc_rebuy", ""), edit: false };
  return S.calc;
}
function renderChips() {
  const C = calcState(), chips = S.chips || [];
  const firstBB = (S.structure.levels.find(l => !l.brk) || {}).bb || 20;
  const plan = chipPlan(chips, C.players, +C.stack || 0, C.rebuy === "" ? null : +C.rebuy, firstBB);
  const idx = c => chips.findIndex(x => x.face === c.face && x.value === c.value);
  const totalValue = chips.reduce((s, c) => s + c.value * c.count, 0);
  const res = plan.error ? `<div class="empty" style="margin-top:16px"><div class="display">Не получается</div>${esc(plan.error)}</div>` : `
    <div class="calc-hero rise">
      <div><span>Стек</span><b class="gold-text num">${fmt(plan.stack)}</b><small>${plan.auto ? "подобран автоматически" : "задан вручную"}${plan.bb ? ` · ${plan.bb} BB` : ""}</small></div>
      <div><span>Фишек в руке</span><b class="num">${plan.pieces}</b><small>на каждого</small></div>
    </div>
    ${plan.warn ? `<p class="neg" style="font-size:13px;margin:10px 2px 0">${esc(plan.warn)}</p>` : ""}
    <div class="section"><h3>Каждому игроку</h3><span class="muted" style="font-size:13px">${fmt(plan.stack)}</span></div>
    <div class="list">${plan.per.map(r => `<div class="li">${chipDot(idx(r), r.face)}
        <span class="grow"><span class="name">${r.value !== +r.face ? `«${esc(r.face)}» = ${fmt(r.value)}` : `Фишка ${fmt(r.value)}`}</span><small>${r.n} × ${fmt(r.value)}</small></span>
        <span class="calc-n num">${r.n}<small>шт</small></span><span class="val" style="font-size:17px;min-width:64px;text-align:right">${fmt(r.sum)}</span></div>`).join("")}</div>
    <div class="section"><h3>На ${plan.players} ${plural(plan.players, "игрока", "игроков", "игроков")}</h3></div>
    <div class="list">${chips.map((c, i) => {
      const r = plan.per.find(x => x.face === c.face && x.value === c.value), out = r ? r.total : 0;
      return `<div class="li">${chipDot(i, c.face)}<span class="grow"><span class="name">Раздать ${out} шт</span><small>есть ${c.count} · останется ${c.count - out}</small></span>
        <span class="bar-mini"><i style="width:${c.count ? Math.round(out / c.count * 100) : 0}%"></i></span></div>`;
    }).join("")}</div>
    <div class="section"><h3>Ребай</h3><span class="muted" style="font-size:13px">${plan.rebuy ? fmt(plan.rebuy) : "без ребаев"}</span></div>
    ${plan.rebuy ? (plan.rebuyPack ? `<div class="panel calc-rebuy">
        <div class="chips-row">${plan.rebuyPack.map(r => `${chipDot(idx(r), r.face)}<b>× ${r.n}</b>`).join("")}</div>
        <p class="muted" style="font-size:13px;margin-top:10px">Банка хватит на <b style="color:var(--ivory)">${plan.rebuysCovered}</b> ${plural(plan.rebuysCovered, "ребай", "ребая", "ребаев")}.</p></div>`
      : `<div class="empty">После раздачи в банке не осталось фишек на ребай ${fmt(plan.rebuy)}. Уменьшите стек или ребай.</div>`) : ""}
    ${S.admin ? `<button class="btn btn-gold" style="margin-top:18px" data-act="calc-use">${I.plus}Создать турнир с этим стеком</button>` : ""}`;
  $("v-chips").innerHTML = `${topbar()}<div class="eyebrow">Фишки</div><h2 class="title" style="margin:10px 0 18px">Калькулятор стека</h2>
    <div class="calc-players">
      <span>Игроков</span>
      <div class="stepper big"><button data-act="calc-n" data-d="-1" aria-label="Меньше">−</button><b class="num" id="calcN">${C.players}</b><button data-act="calc-n" data-d="1" aria-label="Больше">+</button></div>
    </div>
    <div class="grid2" style="margin-top:10px">
      <label class="field"><span>Стек (пусто — авто)</span><input id="calcStack" type="number" inputmode="numeric" placeholder="авто" value="${C.stack || ""}"></label>
      <label class="field"><span>Ребай (пусто = стек)</span><input id="calcRebuy" type="number" inputmode="numeric" placeholder="как стек" value="${C.rebuy}"></label>
    </div>
    <div id="calcRes">${res}</div>
    <div class="section"><h3>Мой набор</h3><button class="link" data-act="calc-edit">${C.edit ? "Готово" : "Изменить"}</button></div>
    ${C.edit ? `<div class="bl-head" style="grid-template-columns:1fr 1fr 1fr 32px"><span>На фишке</span><span>Стоит</span><span>Штук</span><span></span></div>
      ${chips.map((c, i) => `<div class="bl-row" style="grid-template-columns:1fr 1fr 1fr 32px">
        <input data-ci="${i}" data-ck="face" value="${esc(c.face)}" aria-label="Надпись на фишке">
        <input data-ci="${i}" data-ck="value" type="number" inputmode="numeric" value="${c.value}" aria-label="Стоимость">
        <input data-ci="${i}" data-ck="count" type="number" inputmode="numeric" value="${c.count}" aria-label="Количество">
        <button class="x-btn" data-act="calc-del" data-i="${i}" aria-label="Удалить">✕</button></div>`).join("")}
      <div class="row-btns" style="grid-template-columns:1fr"><button class="btn btn-ghost" data-act="calc-add">+ Номинал</button></div>
      ${S.admin ? `<button class="btn btn-gold" style="margin-top:10px" data-act="calc-save">Сохранить набор для клуба</button>` : ""}`
    : `<div class="list">${chips.map((c, i) => `<div class="li">${chipDot(i, c.face)}<span class="grow"><span class="name">${c.value !== +c.face ? `«${esc(c.face)}» стоит ${fmt(c.value)}` : `Номинал ${fmt(c.value)}`}</span></span><span class="val" style="font-size:17px">${c.count} шт</span></div>`).join("")}</div>
      <p class="dim" style="font-size:12px;margin-top:10px">Весь набор стоит ${fmt(totalValue)}. Если фишка стоит не столько, сколько на ней написано, впишите это в поле «Стоит».</p>`}`;
}
function rerenderCalc() { const y = window.scrollY; renderChips(); window.scrollTo(0, y); }
document.addEventListener("input", e => {
  const el = e.target, C = S.calc;
  if (!C || !$("v-chips").classList.contains("on")) return;
  if (el.id === "calcStack") { C.stack = el.value; store.set("calc_stack", +el.value || 0); clearTimeout(rerenderCalc.h); rerenderCalc.h = setTimeout(rerenderCalc, 450); }
  if (el.id === "calcRebuy") { C.rebuy = el.value; store.set("calc_rebuy", el.value); clearTimeout(rerenderCalc.h); rerenderCalc.h = setTimeout(rerenderCalc, 450); }
  if (el.dataset.ck) {
    const c = S.chips[+el.dataset.ci], k = el.dataset.ck;
    c[k] = k === "face" ? el.value : Math.max(0, parseInt(el.value) || 0);
  }
});

/* ═════════════════ Профиль ═════════════════ */
const achHTML = a => `<button type="button" class="ach ${a.got ? "" : "locked"}" data-ach="${esc(JSON.stringify(a))}" aria-label="${esc(a.title + ": " + a.desc)}"><div class="medal ${a.got ? "shine" : "locked"}">${a.icon}${a.times ? `<i class="ach-x">×${a.times}</i>` : ""}</div><span>${esc(a.title)}</span></button>`;

/* Подсказка к награде: наведение на ПК, нажатие на телефоне и ПК */
const AchTip = (() => {
  let tip = null, anchor = null, pinned = false, hideT = 0;
  const fine = matchMedia("(hover:hover) and (pointer:fine)").matches;
  function build(a) {
    const w = a.when;
    const pct = a.progress ? Math.round(a.progress[0] / a.progress[1] * 100) : 0;
    const whenTxt = w ? (w.month ? `${monthShort(w.month)} ${w.month.slice(0, 4)}` : w.date ? fmtDate(w.date, false) : "") : "";
    return `<div class="at-head"><div class="medal ${a.got ? "shine" : "locked"}">${a.icon}</div>
        <div class="grow"><small>${a.got ? "Награда получена" : "Награда не получена"}</small><b>${esc(a.title)}</b></div></div>
      <div class="at-row"><span class="at-k">За что</span><span>${esc(a.desc)}</span></div>
      ${a.got && w ? `<div class="at-row"><span class="at-k">Когда</span><span>${esc(whenTxt)}${w.title ? ` · ${esc(w.title)}` : ""}${a.times ? ` · ${a.times} раза` : ""}</span></div>
        ${w.tid ? `<button class="at-link" data-act="open-t" data-id="${w.tid}">Открыть турнир ${I.chev}</button>` : ""}` : ""}
      ${!a.got && a.progress ? `<div class="at-prog"><span class="track"><i style="width:${pct}%"></i></span><b>${a.progress[0]} / ${a.progress[1]}</b></div>` : ""}`;
  }
  function place() {
    if (!tip || !anchor) return;
    const r = anchor.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight, m = 10;
    let left = r.left + r.width / 2 - tw / 2;
    left = Math.max(m, Math.min(left, innerWidth - tw - m));
    let top = r.top - th - 10, below = false;
    if (top < m + (window.Telegram?.WebApp?.safeAreaInset?.top || 0)) { top = r.bottom + 10; below = true; }
    tip.style.left = left + "px"; tip.style.top = top + "px";
    tip.style.setProperty("--ax", (r.left + r.width / 2 - left) + "px");
    tip.classList.toggle("below", below);
  }
  function show(el, pin) {
    clearTimeout(hideT);
    if (anchor === el && tip) { pinned = pinned || pin; return; }
    hide(true);
    let a; try { a = JSON.parse(el.dataset.ach); } catch { return; }
    anchor = el; pinned = pin; el.classList.add("on");
    tip = document.createElement("div"); tip.className = "ach-tip"; tip.innerHTML = build(a);
    document.body.appendChild(tip); place();
    requestAnimationFrame(() => tip && tip.classList.add("on"));
    if (pin) haptic("light");
    tip.addEventListener("mouseenter", () => clearTimeout(hideT));
    tip.addEventListener("mouseleave", () => { if (!pinned) soon(); });
  }
  function hide(now) {
    clearTimeout(hideT);
    if (anchor) anchor.classList.remove("on");
    const t = tip; tip = null; anchor = null; pinned = false;
    if (t) { if (now) t.remove(); else { t.classList.remove("on"); setTimeout(() => t.remove(), 220); } }
  }
  const soon = () => { clearTimeout(hideT); hideT = setTimeout(() => hide(), 140); };
  document.addEventListener("click", e => {
    const el = e.target.closest(".ach[data-ach]");
    if (el) { e.stopPropagation(); (anchor === el && pinned) ? hide() : show(el, true); return; }
    if (tip && !e.target.closest(".ach-tip")) hide();
    else if (tip && e.target.closest(".at-link")) setTimeout(() => hide(true), 0);
  }, true);
  if (fine) {
    document.addEventListener("mouseover", e => { const el = e.target.closest?.(".ach[data-ach]"); if (el && !pinned) show(el, false); });
    document.addEventListener("mouseout", e => {
      const el = e.target.closest?.(".ach[data-ach]");
      if (el && el === anchor && !pinned && !(e.relatedTarget && el.contains(e.relatedTarget))) soon();
    });
  }
  document.addEventListener("keydown", e => { if (e.key === "Escape") hide(); });
  addEventListener("scroll", () => tip && hide(), { passive: true, capture: true });
  addEventListener("resize", () => tip && hide());
  return { hide };
})();
function profileHTML(d, own) {
  const s = d.stats || { games: 0, wins: 0, top3: 0, best: null, points: 0, knockouts: 0, form: 0 };
  const maxM = Math.max(1, ...d.monthly.map(m => m.points));
  const got = d.achievements.filter(a => a.got).length;
  return `
    <div class="prof-head rise">${av(d.player, "lg ring")}<div class="grow">
      <h2>${esc(d.player.name)}</h2>
      <div class="muted" style="font-size:13.5px;margin-top:6px">${d.rank ? `<span class="gold-text" style="font-weight:700">#${d.rank}</span> в рейтинге клуба` : "Ещё не в рейтинге"}</div>
      ${own ? `<button class="link-btn" data-act="rename">Изменить имя</button>` : ""}</div></div>
    <div class="stats rise" style="--i:1">
      <div class="stat"><b data-cu="${s.points}">0</b><span>очков</span></div>
      <div class="stat"><b data-cu="${s.games}">0</b><span>игр</span></div>
      <div class="stat"><b data-cu="${s.wins}">0</b><span>побед</span></div>
      <div class="stat"><b data-cu="${s.top3}">0</b><span>в топ-3</span></div>
      <div class="stat"><b data-cu="${s.knockouts}">0</b><span>нокаутов</span></div>
      <div class="stat"><b data-cu="${s.form}" data-pct="1">0</b><span>форма</span></div>
    </div>
    ${d.monthly.length ? `<div class="section"><h3>Очки по месяцам</h3></div>
      <div class="chart">${d.monthly.map((m, i) => `<div class="col"><span class="v">${m.points}</span>
        <div class="bar ${m.points === maxM ? "best" : ""}" style="height:${Math.max(4, m.points / maxM * 78)}%;animation-delay:${i * 60}ms"></div>
        <span class="lbl">${monthShort(m.m)}</span></div>`).join("")}</div>` : ""}
    <div class="section"><h3>Награды</h3><span class="muted" style="font-size:13px">${got} из ${d.achievements.length}</span></div>
    <div class="ach-grid">${d.achievements.map(achHTML).join("")}</div>
    ${d.nemesis || d.victim ? `<div class="section"><h3>Счёты</h3></div><div class="duo">
      <button class="panel" ${d.victim ? `data-act="player" data-tg="${d.victim.tg_id}"` : ""}><small>Любимая жертва</small><b>${d.victim ? esc(d.victim.name) : "—"}</b><span class="muted" style="font-size:12.5px">${d.victim ? `выбит ${d.victim.n} раз` : ""}</span></button>
      <button class="panel" ${d.nemesis ? `data-act="player" data-tg="${d.nemesis.tg_id}"` : ""}><small>Немезида</small><b>${d.nemesis ? esc(d.nemesis.name) : "—"}</b><span class="muted" style="font-size:12.5px">${d.nemesis ? `выбивал ${d.nemesis.n} раз` : ""}</span></button></div>` : ""}
    ${d.rivals.length ? `<div class="section"><h3>Личные встречи</h3></div><div class="list">${d.rivals.map(r => `
      <button class="li" data-act="player" data-tg="${r.tg_id}">${av(r, "sm")}<span class="grow"><span class="name">${esc(r.name)}</span>
        <div class="duel" style="margin-top:6px"><span class="track"><i style="width:${r.games ? r.ahead / r.games * 100 : 0}%"></i></span></div></span>
        <span class="val" style="font-size:17px">${r.ahead}<span class="muted">:${r.games - r.ahead}</span></span></button>`).join("")}</div>` : ""}
    ${d.predictions && d.predictions.n ? `<div class="panel" style="margin-top:12px;display:flex;align-items:center;gap:12px"><span class="display gold-text" style="font-size:30px">◎</span>
      <span class="grow">Прогнозы на победителя</span><b class="num">${d.predictions.h} из ${d.predictions.n}</b></div>` : ""}
    <div class="section"><h3>История</h3></div>
    ${d.history.length ? `<div class="list">${d.history.map(h => `<button class="li" data-act="open-t" data-id="${h.id}">
        <span class="rank" style="${h.place === 1 ? "color:var(--gold)" : ""}">${medalTxt(h.place)}</span>
        <span class="grow"><span class="name">${esc(h.title)}</span><small>${fmtDate(h.starts_at, false)} · ${h.place} из ${h.n}${h.knockouts ? ` · ✦${h.knockouts}` : ""}</small></span>
        <span style="text-align:right"><span class="val gold-text" style="font-size:19px">+${h.points}</span>${["won", "lost"].includes(h.bet_status) ? `<small class="${h.bet_status === "won" ? "pos" : "neg"}" style="display:block">ставка ${h.bet_status === "won" ? "+" + fmt(h.bet_payout - h.bet_stake) : "−" + fmt(h.bet_stake)}</small>` : ""}</span></button>`).join("")}</div>`
      : `<div class="empty">Сыгранных турниров пока нет.</div>`}`;
}
async function renderProfile() {
  const v = $("v-profile"), d = await api("/profile");
  S.prof = d; S.me = d.player;
  v.innerHTML = profileHTML(d, true) + `
    <div class="section"><h3>Настройки</h3></div>
    <div class="list">
      <button class="toggle li" data-act="sound-toggle"><span class="grow"><span class="name">Звуки</span><small>Фишки, сигналы уровней, фанфары</small></span><span class="switch ${Snd.on ? "on" : ""}" id="sndSwitch"></span></button>
      <button class="li" data-act="chips"><span class="icon-btn" style="width:34px;height:34px">${I.stack}</span><span class="grow"><span class="name">Калькулятор фишек</span><small>Стек и ребай под ваш набор</small></span>${I.chev}</button>
      <button class="li" data-act="structure">${'<span class="icon-btn" style="width:34px;height:34px">' + I.list + "</span>"}<span class="grow"><span class="name">Структура блайндов</span><small>${S.structure.minutes} мин на уровень</small></span>${I.chev}</button>
      ${S.admin ? `
      <button class="li" data-act="create"><span class="icon-btn" style="width:34px;height:34px">${I.plus}</span><span class="grow"><span class="name">Новый турнир</span></span>${I.chev}</button>
      <button class="li" data-act="settings"><span class="icon-btn" style="width:34px;height:34px">${I.gear}</span><span class="grow"><span class="name">Очки и ставки</span><small>Шкала очков, кэф ставок, размер стола</small></span>${I.chev}</button>
      <button class="li" data-act="broadcast"><span class="icon-btn" style="width:34px;height:34px">${I.megaphone}</span><span class="grow"><span class="name">Рассылка</span><small>Сообщение всем игрокам</small></span>${I.chev}</button>` : ""}
    </div>`;
  runCountUps(v); checkAchievements(d);
}
async function openPlayer(id) {
  if (+id === +S.me.tg_id) { closeSheet(); return setTab("profile"); }
  const d = await api("/profile?id=" + id);
  $("v-player").innerHTML = topbar() + profileHTML(d, false);
  closeSheet(); push("player"); runCountUps($("v-player"));
}

function checkAchievements(prof) {
  const key = "ach_" + S.me.tg_id, seen = store.get(key);
  const got = prof.achievements.filter(a => a.got).map(a => a.key);
  store.set(key, got);
  if (!seen) return;
  const fresh = prof.achievements.filter(a => a.got && !seen.includes(a.key));
  fresh.forEach((a, i) => setTimeout(() => {
    const el = document.createElement("div"); el.className = "ach-toast";
    el.innerHTML = `<div class="medal shine">${a.icon}</div><div><small>Новая награда</small><b>${esc(a.title)}</b><span class="muted" style="font-size:12.5px">${esc(a.desc)}</span></div>`;
    document.body.appendChild(el); Snd.play("ach"); haptic("success");
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("on")));
    setTimeout(() => { el.classList.remove("on"); setTimeout(() => el.remove(), 800); }, 3600);
  }, 900 + i * 4200));
}

/* ═════════════════ Настройки ═════════════════ */
function renderSettings() {
  const sc = S.scoring;
  const f = (id, label, v, step = 1) => `<label class="field"><span>${label}</span><input id="${id}" type="number" inputmode="decimal" step="${step}" value="${v}"></label>`;
  $("v-settings").innerHTML = `${topbar()}<div class="eyebrow">Правила клуба</div><h2 class="title" style="margin:10px 0 20px">Очки и ставки</h2>
    ${f("sBase", "Очки за последнее место (минимум)", sc.base)}
    ${f("sStep", "За каждое место выше, очков", sc.step)}
    <div class="grid2">${f("sWin", "Бонус победителю", sc.winner_bonus)}${f("sKo", "За нокаут", sc.bounty)}</div>
    <div class="grid2">${f("sReb", "Штраф за ребай", sc.rebuy_penalty)}${f("sMargin", "Множитель кэфа (0.5–1)", sc.margin, 0.05)}</div>
    ${f("sTable", "Игроков за одним столом", S.tableSize)}
    <p class="muted" style="font-size:12.5px;margin:4px 2px 0;line-height:1.6">Пример на 5 игроков: последний ${sc.base}, 4-й ${sc.base + sc.step}, 3-й ${sc.base + 2 * sc.step}, 2-й ${sc.base + 3 * sc.step}, победитель ${sc.base + 4 * sc.step + sc.winner_bonus} очков + нокауты.<br>
      Кэф ставки = множитель × сколько игроков ещё в игре: при 4 оставшихся ×${(sc.margin * 4).toFixed(2).replace(/\.?0+$/, "")}, при 2 — ×${(sc.margin * 2).toFixed(2).replace(/\.?0+$/, "")}.<br>Новые правила действуют для следующих турниров.</p>
    <button class="btn btn-gold" style="margin-top:18px" data-act="settings-save">Сохранить</button>`;
}
let draft = null;
function renderStructure() {
  if (!draft) draft = JSON.parse(JSON.stringify(S.structure));
  let n = 0;
  $("v-structure").innerHTML = `${topbar()}<div class="eyebrow">Таймер</div><h2 class="title" style="margin:10px 0 20px">Структура блайндов</h2>
    <div class="grid2">
      <label class="field"><span>Минут на уровень</span><input type="number" inputmode="numeric" data-sk="minutes" value="${draft.minutes}" ${S.admin ? "" : "disabled"}></label>
      <label class="field"><span>Минут на перерыв</span><input type="number" inputmode="numeric" data-sk="breakMin" value="${draft.breakMin}" ${S.admin ? "" : "disabled"}></label>
    </div>
    <div class="bl-head" style="margin-top:10px"><span>#</span><span>Малый</span><span>Большой</span><span>Анте</span><span></span></div>
    ${draft.levels.map((l, i) => {
      if (l.brk) return `<div class="bl-row"><span class="n">☕</span><span class="brk">Перерыв</span>${S.admin ? `<button class="x-btn" data-act="lv-del" data-i="${i}" aria-label="Удалить">✕</button>` : "<span></span>"}</div>`;
      n++;
      return `<div class="bl-row"><span class="n">${n}</span>${["sb", "bb", "ante"].map(k => `<input type="number" inputmode="numeric" data-li="${i}" data-k="${k}" value="${l[k] || 0}" ${S.admin ? "" : "disabled"}>`).join("")}
        ${S.admin ? `<button class="x-btn" data-act="lv-del" data-i="${i}" aria-label="Удалить">✕</button>` : "<span></span>"}</div>`;
    }).join("")}
    ${S.admin ? `<div class="row-btns"><button class="btn btn-ghost" data-act="lv-add">+ Уровень</button><button class="btn btn-ghost" data-act="lv-brk">+ Перерыв</button></div>
      <button class="btn btn-gold" style="margin-top:14px" data-act="structure-save">Сохранить для всех</button>
      <p class="muted" style="font-size:12.5px;margin-top:10px;text-align:center">Идущий турнир получит новую структуру после кнопки «Сброс» на таймере.</p>`
      : `<p class="muted" style="font-size:13px;margin-top:14px">Структуру меняет организатор клуба.</p>`}`;
}
document.addEventListener("input", e => {
  const el = e.target;
  if (!draft) return;
  if (el.dataset.k !== undefined && el.dataset.li !== undefined) draft.levels[+el.dataset.li][el.dataset.k] = Math.max(0, parseInt(el.value) || 0);
  if (el.dataset.sk) { const v = parseInt(el.value); if (v > 0) draft[el.dataset.sk] = v; }
});

/* ═════════════════ Фото ═════════════════ */
async function compress(file) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  const cv = document.createElement("canvas"); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
  cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
  URL.revokeObjectURL(img.src);
  return cv.toDataURL("image/jpeg", .85);
}
$("photoInput").addEventListener("change", async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f || !S.t) return;
  toast("Загружаю фото…");
  await safe(async () => { const data = await compress(f); S.t = await api(`/tournaments/${S.t.id}/photo`, { data }); S.dtab = "photos"; renderDetail(); Snd.play("chip"); toast("Фото добавлено"); });
});
function lightbox(p) {
  const can = S.admin || p.tg_id === S.me.tg_id;
  const el = document.createElement("div"); el.className = "lightbox";
  el.innerHTML = `<img src="photos/${esc(p.file)}" alt="Фото с игры"><div class="lb-bar">
    ${can ? `<button class="btn btn-danger btn-sm" data-lb="del">${I.trash}Удалить</button>` : ""}<button class="btn btn-ghost btn-sm" data-lb="close">Закрыть</button></div>`;
  el.addEventListener("click", async ev => {
    const b = ev.target.closest("[data-lb]");
    if (b && b.dataset.lb === "del") {
      if (!(await confirmBox("Удалить это фото?"))) return;
      await safe(async () => { S.t = await api(`/tournaments/${S.t.id}/photo_delete`, { id: p.id }); renderDetail(); });
    }
    if (!b || b.dataset.lb) el.remove();
  });
  document.body.appendChild(el);
}

/* ═════════════════ Действия ═════════════════ */
function markFab() {
  const running = S.tours.active.some(t => t.status === "running");
  document.querySelector(".tabbar .fab").classList.toggle("live", running);
}
async function afterJoin(el, t) {
  if (t.event === "joined") { chipBurst(el); Snd.play("join"); haptic("success"); toast("Ты в игре. Удачи за столом!"); }
  else if (t.event === "waitlist") { Snd.play("chip"); haptic("warning"); toast(`Мест нет — ты ${t.position}-й в листе ожидания`); }
}
const ACT = {
  tab: el => setTab(el.dataset.tab),
  back: () => back(),
  "sheet-close": () => closeSheet(),
  "overlay-close": () => { $("overlay").innerHTML = ""; },
  "open-t": el => safe(() => openDetail(el.dataset.id)),
  "open-live": (el, ev) => { ev.stopPropagation(); safe(() => openLive(el.dataset.id)); },
  live: () => safe(async () => {
    if (!S.tours.active.length) S.tours = await api("/tournaments");
    const r = S.tours.active.find(t => t.status === "running");
    await openLive(r ? r.id : null);
  }),
  join: (el, ev) => { ev.stopPropagation(); safe(async () => { const t = await api(`/tournaments/${el.dataset.id}/join`, {}); await afterJoin(el, t); REFRESH[S.stack.length ? "detail" : S.tab](); }); },
  rsvp: el => safe(async () => {
    const id = el.dataset.id, ans = el.dataset.v;
    const segEl = el.closest(".seg"); segEl.querySelectorAll("button").forEach(b => b.classList.toggle("on", b === el)); pills(segEl.parentElement);
    haptic("select");
    const t = await api(`/tournaments/${id}/rsvp`, { answer: ans });
    if (ans === "going") await afterJoin(el, t); else { Snd.play("tap"); toast(ans === "maybe" ? "Отметили: может быть" : "Жаль! В следующий раз"); }
    setTimeout(() => { const st = S.stack[S.stack.length - 1]; if (st === "detail") { S.t = t; renderDetail(); } else REFRESH[S.tab](); }, 420);
  }),
  dtab: el => { S.dtab = el.dataset.v; haptic("select"); Snd.play("tap"); renderDetail(); },
  predict: el => safe(async () => { S.t = await api(`/tournaments/${S.t.id}/predict`, { pick: +el.dataset.tg }); Snd.play("chip"); haptic("success"); toast("Прогноз принят 🔮"); renderDetail(); }),
  ics: () => { const url = new URL(`ics/${S.t.id}.ics`, location.href).href; tg && tg.openLink ? tg.openLink(url) : window.open(url); },
  create: () => { renderCreate(); closeSheet(); push("create"); },
  toggle: el => { const sw = el.querySelector(".switch"); sw.classList.toggle("on"); haptic("select"); },
  "create-save": el => safe(async () => {
    const title = $("cTitle").value.trim(); if (!title) return toast("Введите название");
    el.disabled = true;
    try {
      const r = await api("/tournaments", {
        title, starts_at: $("cDate").value ? new Date($("cDate").value).toISOString() : null, location: $("cLoc").value,
        stack: +$("cStack").value || 3000, rebuy_chips: +$("cRebuy").value || 0, addon_chips: +$("cAddon").value || 0,
        max_players: +$("cMax").value || 0, announce: $("cAnn").classList.contains("on")
      });
      Snd.play("join"); haptic("success"); toast("Турнир назначен");
      S.stack = []; S.lastDetailId = null; await openDetail(r.id);
    } finally { el.disabled = false; }
  }),
  seat: () => safe(async () => {
    if (S.t.entries.some(e => e.table_no) && !(await confirmBox("Пересадить всех заново?"))) return;
    S.t = await api(`/tournaments/${S.t.id}/seat`, {}); S.dtab = "players"; Snd.play("deal"); haptic("success"); toast("Места разыграны — игрокам пришли уведомления"); renderDetail();
  }),
  "start-t": () => safe(async () => {
    if (!(await confirmBox("Начать турнир? Запись и прогнозы закроются."))) return;
    S.t = await api(`/tournaments/${S.t.id}/start`, {}); Snd.play("open"); haptic("success"); await openLive(S.t.id);
  }),
  "delete-t": () => safe(async () => {
    if (!(await confirmBox("Удалить турнир со всеми записями и фото?"))) return;
    await api(`/tournaments/${S.t.id}/delete`, {}); toast("Турнир удалён"); back();
  }),
  remove: el => safe(async () => { S.t = await api(`/tournaments/${S.t.id}/remove_player`, { tg_id: +el.dataset.tg }); Snd.play("tap"); renderDetail(); }),
  "add-open": () => safe(async () => {
    const all = await api("/players"), inT = new Set(S.t.entries.concat(S.t.waitlist).map(e => e.tg_id));
    const list = all.filter(p => !inT.has(p.tg_id));
    openSheet(`<h3>Добавить игрока</h3><p class="muted" style="font-size:13px;margin-bottom:14px">Здесь все, кто хоть раз открывал бота.</p>
      ${list.length ? `<div class="list">${list.map(p => `<button class="li" data-act="add-pick" data-tg="${p.tg_id}">${av(p, "sm")}<span class="grow"><span class="name">${esc(p.name)}</span>${p.username ? `<small>@${esc(p.username)}</small>` : ""}</span><span class="seat">Добавить</span></button>`).join("")}</div>`
        : `<div class="empty">Все игроки уже в турнире</div>`}`);
  }),
  "add-pick": el => safe(async () => { S.t = await api(`/tournaments/${S.t.id}/add_player`, { tg_id: +el.dataset.tg }); chipBurst(el); Snd.play("chip"); el.remove(); renderDetail(); }),
  "photo-add": () => $("photoInput").click(),
  "photo-open": el => { const p = S.t.photos.find(x => x.id === +el.dataset.id); p && lightbox(p); },

  clock: el => safe(async () => {
    let cmd = el.dataset.cmd; const L = S.live, c = liveClock();
    if (cmd === "toggle") cmd = clockNow(c, L.offset).running ? "pause" : "start";
    if (cmd === "reset" && !(await confirmBox("Сбросить таймер на первый уровень?"))) return;
    haptic(cmd === "start" ? "medium" : "light"); Snd.play(cmd === "start" ? "chips" : "tap");
    if (L.mode === "local") { clockCmd(c, cmd); store.set("localClock", c); L.lastIdx = clockNow(c).idx; liveTick(true); }
    else { const t = await api(`/tournaments/${L.t.id}/clock`, { cmd }); L.t = t; L.offset = t.server_now - Date.now(); L.lastIdx = clockNow(t.clock, L.offset).idx; liveTick(true); }
    keepAwake(clockNow(liveClock(), L.offset).running);
  }),
  sound: el => { Snd.toggle(); el.innerHTML = Snd.on ? I.sound : I.mute; haptic("select"); },
  "sound-toggle": () => { Snd.toggle(); $("sndSwitch").classList.toggle("on", Snd.on); haptic("select"); },
  pmenu: el => { if (!S.admin || el.classList.contains("busting")) return; haptic("light"); playerMenu(+el.dataset.tg); },
  "pm-rebuy": el => safe(async () => { const t = await api(`/tournaments/${S.live.t.id}/rebuy`, { tg_id: +el.dataset.tg, delta: +el.dataset.d }); applyLive(t, true); Snd.play(+el.dataset.d > 0 ? "chips" : "tap"); playerMenu(+el.dataset.tg); }),
  "pm-addon": el => safe(async () => { const t = await api(`/tournaments/${S.live.t.id}/addon`, { tg_id: +el.dataset.tg, delta: +el.dataset.d }); applyLive(t, true); Snd.play(+el.dataset.d > 0 ? "chips" : "tap"); playerMenu(+el.dataset.tg); }),
  bust: el => safe(async () => {
    closeSheet(); Snd.play("bust"); haptic("heavy");
    const tg_id = +el.dataset.tg;
    const card = $("pc-" + tg_id); if (card) card.classList.add("busting");
    let t;
    try { t = await api(`/tournaments/${S.live.t.id}/bust`, { tg_id, by: +el.dataset.by }); }
    catch (err) { S.live.t = await api("/tournaments/" + S.live.t.id); renderLive(); throw err; }
    applyLive(t, true);
    const e = t.entries.find(x => x.tg_id === tg_id);
    if (t.status === "running" && e && e.bet_status === "pending") setTimeout(() => betSheet(tg_id), reduced ? 50 : 900);
  }),
  "bet-open": el => betSheet(+el.dataset.tg),
  "bet-pick": el => { S.bet.pick = +el.dataset.tg; Snd.play("chip"); haptic("select"); updBet(); },
  "bet-quick": el => { $("betStake").value = Math.max(1, Math.round(S.bet.max * +el.dataset.p / 100)); Snd.play("tap"); updBet(); },
  "bet-place": el => safe(async () => {
    const B = S.bet; el.disabled = true;
    try {
      const t = await api(`/tournaments/${S.live.t.id}/bet`, { tg_id: B.tg, pick: B.pick, stake: B.stake });
      closeSheet(); chipBurst(el); Snd.play("join"); haptic("success");
      const who = t.entries.find(x => x.tg_id === B.tg), on = t.entries.find(x => x.tg_id === B.pick);
      toast(`Ставка принята: ${who.name} → ${on.name}, ${fmt(B.stake)} × ${who.bet_coef}`);
      S.live.t = t; renderLive();
    } finally { el.disabled = false; }
  }),
  "bet-decline": () => safe(async () => {
    const t = await api(`/tournaments/${S.live.t.id}/bet_decline`, { tg_id: S.bet.tg });
    closeSheet(); Snd.play("tap"); toast("Без ставки — очки сохранены"); S.live.t = t; renderLive();
  }),
  "bet-cancel": el => safe(async () => {
    if (!(await confirmBox("Отменить решение по ставке? Новая ставка будет по текущему кэфу."))) return;
    const t = await api(`/tournaments/${S.live.t.id}/bet_cancel`, { tg_id: +el.dataset.tg });
    S.live.t = t; renderLive(); betSheet(+el.dataset.tg);
  }),
  "unbust-one": el => safe(async () => {
    const e = S.live.t.entries.find(x => x.tg_id === +el.dataset.tg);
    if (!(await confirmBox(`Вернуть ${e ? e.name : "игрока"} в игру? Его ставка и нокаут за его вылет отменятся.`))) return;
    const t = await api(`/tournaments/${S.live.t.id}/unbust`, { tg_id: +el.dataset.tg }); S.live.t = t; renderLive(); Snd.play("chip"); toast("Игрок снова в игре");
  }),
  unbust: () => safe(async () => {
    if (!(await confirmBox("Вернуть последнего выбывшего в игру?"))) return;
    const t = await api(`/tournaments/${S.live.t.id}/unbust`, {}); S.live.t = t; renderLive(); Snd.play("chip"); toast("Игрок возвращён");
  }),

  period: el => { S.period = el.dataset.v; haptic("select"); Snd.play("tap"); safe(renderRating); },
  rsort: el => { S.rsort = el.dataset.v; haptic("select"); Snd.play("tap"); safe(renderRating); },
  "season-card": () => safe(async () => {
    toast("Рисую карточку…");
    const url = await makeSeasonCard(); S.cardUrl = url;
    openSheet(`<h3>Карточка сезона</h3><p class="muted" style="font-size:13px">Перешлите её в общий чат клуба.</p>
      <img class="card-preview" src="${url}" alt="Итоги сезона">
      <button class="btn btn-gold" data-act="card-send">${I.send}Прислать мне в Telegram</button>
      ${navigator.canShare ? `<button class="btn btn-ghost" style="margin-top:10px" data-act="card-share">Поделиться</button>` : ""}`);
  }),
  "card-send": el => safe(async () => { el.disabled = true; try { await api("/card", { image: S.cardUrl }); Snd.play("open"); toast("Отправил в чат с ботом — перешлите дальше"); closeSheet(); } finally { el.disabled = false; } }),
  "card-share": () => safe(async () => {
    const blob = await (await fetch(S.cardUrl)).blob(), file = new File([blob], "season.png", { type: "image/png" });
    if (navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: "Итоги сезона" }); else toast("Поделиться отсюда нельзя — используйте отправку в Telegram");
  }),
  player: el => safe(() => openPlayer(el.dataset.tg)),
  rename: () => {
    const go = name => name && name.trim() && safe(async () => { await api("/rename", { name: name.trim() }); S.me.name = name.trim(); toast("Имя обновлено"); renderProfile(); });
    openSheet(`<h3>Как тебя подписать?</h3><p class="muted" style="font-size:13px;margin-bottom:14px">Это имя увидят все в рейтинге и турнирах.</p>
      <label class="field"><span>Имя</span><input id="rnInput" maxlength="32" value="${esc(S.me.name)}"></label>
      <button class="btn btn-gold" data-act="rename-save">Сохранить</button>`);
    ACT["rename-save"] = () => { go($("rnInput").value); closeSheet(); };
    setTimeout(() => $("rnInput") && $("rnInput").focus(), 400);
  },
  structure: () => { draft = null; renderStructure(); push("structure"); },
  "lv-del": el => { if (draft.levels.length <= 1) return; draft.levels.splice(+el.dataset.i, 1); renderStructure(); },
  "lv-add": () => { const last = [...draft.levels].reverse().find(l => !l.brk) || { sb: 10, bb: 20, ante: 0 }; draft.levels.push({ sb: last.sb * 2, bb: last.bb * 2, ante: last.ante * 2 }); renderStructure(); window.scrollTo(0, document.body.scrollHeight); },
  "lv-brk": () => { draft.levels.push({ brk: true }); renderStructure(); window.scrollTo(0, document.body.scrollHeight); },
  "structure-save": () => safe(async () => {
    const r = await api("/settings", { structure: draft }); S.structure = r.structure; draft = null;
    const lc = store.get("localClock"); if (lc && !lc.started) store.set("localClock", freshLocal());
    Snd.play("chip"); toast("Структура сохранена"); back();
  }),
  settings: () => { renderSettings(); push("settings"); },
  chips: () => { closeSheet(); calcState(); renderChips(); push("chips"); },
  "calc-n": el => { const C = calcState(); C.players = Math.max(2, Math.min(40, C.players + +el.dataset.d)); store.set("calc_players", C.players); haptic("select"); Snd.play("chip"); rerenderCalc(); },
  "calc-edit": () => { const C = calcState(); C.edit = !C.edit; renderChips(); },
  "calc-add": () => { S.chips.push({ face: "", value: 0, count: 0 }); rerenderCalc(); },
  "calc-del": el => { S.chips.splice(+el.dataset.i, 1); rerenderCalc(); },
  "calc-save": () => safe(async () => {
    const r = await api("/settings", { chips: S.chips }); S.chips = r.chips; calcState().edit = false;
    Snd.play("chips"); toast("Набор фишек сохранён"); rerenderCalc();
  }),
  "calc-use": () => {
    const C = calcState(), firstBB = (S.structure.levels.find(l => !l.brk) || {}).bb || 20;
    const p = chipPlan(S.chips, C.players, +C.stack || 0, C.rebuy === "" ? null : +C.rebuy, firstBB);
    if (p.error) return toast(p.error);
    renderCreate({ stack: p.stack, rebuy: p.rebuy, max: 0 }); push("create"); Snd.play("card");
  },
  "settings-save": () => safe(async () => {
    const r = await api("/settings", { scoring: { base: +$("sBase").value, step: +$("sStep").value, winner_bonus: +$("sWin").value, bounty: +$("sKo").value, rebuy_penalty: +$("sReb").value, margin: +$("sMargin").value }, table_size: +$("sTable").value });
    S.scoring = r.scoring; S.tableSize = r.table_size; Snd.play("chip"); toast("Сохранено"); back();
  }),
  broadcast: () => {
    $("v-broadcast").innerHTML = `${topbar()}<div class="eyebrow">Всем игрокам</div><h2 class="title" style="margin:10px 0 20px">Рассылка</h2>
      <label class="field"><span>Сообщение</span><textarea id="bcText" placeholder="В пятницу играем в 19:00, не опаздываем!"></textarea></label>
      <button class="btn btn-gold" data-act="broadcast-send">${I.send}Отправить</button>`;
    push("broadcast");
  },
  "broadcast-send": el => safe(async () => {
    const text = $("bcText").value.trim(); if (!text) return toast("Напишите сообщение");
    el.disabled = true;
    try { const r = await api("/broadcast", { text }); Snd.play("open"); toast(`Отправляю ${r.sent} игрокам`); back(); } finally { el.disabled = false; }
  })
};
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]");
  if (el && ACT[el.dataset.act] && !el.disabled) ACT[el.dataset.act](el, e);
});
document.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches('[role="button"][data-act]')) { e.preventDefault(); e.target.click(); }
});

const RENDER = { home: renderHome, tours: renderTours, rating: renderRating, profile: renderProfile };
const REFRESH = { home: renderHome, tours: renderTours, rating: renderRating, profile: renderProfile, detail: refreshDetail,
  live: async () => { if (S.live && S.live.mode === "t") applyLive(await api("/tournaments/" + S.live.t.id)); } };

setInterval(() => liveTick(false), 200);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  const L = S.live;
  if (L && $("v-live").classList.contains("on")) { L.lastIdx = null; liveTick(true); if (clockNow(liveClock(), L.offset).running) keepAwake(true); }
});

/* ═════════════════ Старт ═════════════════ */
(async function boot() {
  const u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
  $("splashName").textContent = u && u.first_name ? `Добро пожаловать, ${u.first_name}` : "Добро пожаловать";
  const minShow = new Promise(r => setTimeout(r, reduced ? 200 : 2300));
  const hide = () => $("splash").classList.add("hide");
  $("splash").addEventListener("click", () => { Snd.init(); Snd.play("deal"); hide(); });
  try {
    const me = await api("/me");
    Object.assign(S, { me: me.player, admin: me.admin, club: me.club, structure: me.structure, scoring: me.scoring, tableSize: me.table_size, chips: me.chips || [] });
    $("splashClub").textContent = me.club;
    $("splashName").textContent = `Добро пожаловать, ${me.player.name}`;
    await renderHome();
    startPolling();
  } catch (e) {
    $("v-home").innerHTML = `<div class="empty" style="margin-top:60px"><div class="display">Не удалось войти</div>${esc(e.message)}<br><br>Откройте приложение кнопкой «♠️ Открыть клуб» в чате с ботом.</div>`;
  }
  await minShow; hide();
  setInterval(() => { if (!document.hidden && S.tab === "home" && !S.stack.length && S.me) safe(() => renderHome(true)); }, 30000);
})();
