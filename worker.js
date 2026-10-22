/**
 * Покерный клуб — сервер в Cloudflare Workers (бот + API + напоминания).
 * Приложение (index.html, app.css, app.js) лежит на GitHub и отдаётся отсюда же.
 *
 * Нужно в настройках Worker:
 *   D1 база      — привязка DB
 *   BOT_TOKEN    — секрет (токен бота)
 *   ADMIN_IDS    — переменная, id админов через запятую
 *   CLUB_NAME    — переменная, название клуба
 *   TZ_OFFSET_HOURS — переменная, часовой пояс (например 4)
 *   GITHUB_RAW   — переменная, https://raw.githubusercontent.com/<user>/<repo>/main
 *   (ссылка на приложение = адрес этого Worker; кнопку «Клуб» и вебхук ставит /setup)
 *   Cron trigger — каждые 5 минут (напоминания)
 * После первой загрузки откройте https://<worker>/setup один раз.
 */

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS players(tg_id INTEGER PRIMARY KEY, name TEXT NOT NULL, username TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT)`,
  `CREATE TABLE IF NOT EXISTS tournaments(id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, starts_at TEXT, location TEXT DEFAULT '', stack INTEGER DEFAULT 3000, rebuy_chips INTEGER DEFAULT 0, addon_chips INTEGER DEFAULT 0, max_players INTEGER DEFAULT 0, status TEXT DEFAULT 'open', clock TEXT, reminded_day INTEGER DEFAULT 0, reminded_hour INTEGER DEFAULT 0, finished_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS entries(tournament_id INTEGER, tg_id INTEGER, status TEXT DEFAULT 'in', joined_at TEXT DEFAULT CURRENT_TIMESTAMP, rebuys INTEGER DEFAULT 0, addons INTEGER DEFAULT 0, knockouts INTEGER DEFAULT 0, knocked_by INTEGER, place INTEGER, points INTEGER DEFAULT 0, table_no INTEGER, seat_no INTEGER, busted_at TEXT, base_points INTEGER, bet_status TEXT DEFAULT 'none', bet_pick INTEGER, bet_stake INTEGER DEFAULT 0, bet_coef REAL DEFAULT 0, bet_payout INTEGER DEFAULT 0, PRIMARY KEY (tournament_id, tg_id))`,
  `CREATE TABLE IF NOT EXISTS rsvp(tournament_id INTEGER, tg_id INTEGER, answer TEXT, PRIMARY KEY (tournament_id, tg_id))`,
  `CREATE TABLE IF NOT EXISTS predictions(tournament_id INTEGER, tg_id INTEGER, pick_id INTEGER, correct INTEGER, PRIMARY KEY (tournament_id, tg_id))`,
  `CREATE TABLE IF NOT EXISTS photos(id INTEGER PRIMARY KEY AUTOINCREMENT, tournament_id INTEGER, tg_id INTEGER, file TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
];

const DEFAULT_SETTINGS = {
  structure: {
    minutes: 15, breakMin: 10,
    levels: [
      { sb: 10, bb: 20, ante: 0 }, { sb: 15, bb: 30, ante: 0 }, { sb: 25, bb: 50, ante: 0 }, { sb: 50, bb: 100, ante: 0 },
      { brk: true },
      { sb: 75, bb: 150, ante: 0 }, { sb: 100, bb: 200, ante: 25 }, { sb: 150, bb: 300, ante: 25 }, { sb: 200, bb: 400, ante: 50 },
      { brk: true },
      { sb: 300, bb: 600, ante: 75 }, { sb: 400, bb: 800, ante: 100 }, { sb: 500, bb: 1000, ante: 100 },
      { sb: 700, bb: 1400, ante: 200 }, { sb: 1000, bb: 2000, ante: 300 }, { sb: 1500, bb: 3000, ante: 400 },
    ],
  },
  scoring: { base: 100, step: 50, winner_bonus: 100, bounty: 25, rebuy_penalty: 0, margin: 0.9 },
  table_size: 9,
  chips: [
    { face: "1", value: 500, count: 125 }, { face: "5", value: 5, count: 125 }, { face: "25", value: 25, count: 125 },
    { face: "50", value: 50, count: 75 }, { face: "100", value: 100, count: 50 },
  ],
};

class ApiError extends Error {}

/* ───────────── база ───────────── */
function mkDb(env) {
  const norm = a => a.map(v => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v));
  const prep = (sql, args = []) => env.DB.prepare(sql).bind(...norm(args));
  return {
    async q(sql, args = [], one = false) {
      const r = await prep(sql, args).all();
      const rows = r.results || [];
      return one ? (rows[0] || null) : rows;
    },
    async x(sql, args = []) {
      const r = await prep(sql, args).run();
      return r.meta && r.meta.last_row_id;
    },
    async tx(list) {
      if (list.length) await env.DB.batch(list.map(([s, a]) => prep(s, a)));
    },
  };
}

async function getSetting(db, key) {
  const def = JSON.parse(JSON.stringify(DEFAULT_SETTINGS[key]));
  const row = await db.q("SELECT value FROM settings WHERE key=?", [key], true);
  if (row) {
    try {
      const val = JSON.parse(row.value);
      if (key === "scoring" && !("base" in val)) return def;
      if (def && typeof def === "object" && !Array.isArray(def) && val && typeof val === "object" && !Array.isArray(val)) return Object.assign(def, val);
      return val;
    } catch (e) { /* ignore */ }
  }
  return def;
}
const setSetting = (db, key, value) =>
  db.x("INSERT INTO settings(key, value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [key, JSON.stringify(value)]);

function placePoints(sc, n, place, knockouts = 0, rebuys = 0) {
  const pts = sc.base + sc.step * (n - place) + (place === 1 ? sc.winner_bonus : 0) + sc.bounty * knockouts - sc.rebuy_penalty * rebuys;
  return Math.max(sc.base, Math.trunc(pts));
}

/* ───────────── утилиты ───────────── */
function needAdmin(ctx) { if (!ctx.admin) throw new ApiError("Только для админа"); }
function toInt(v, def = 0, lo = 0, hi = 1e15) {
  const n = typeof v === "number" ? Math.trunc(v) : (/^\s*-?\d+\s*$/.test(String(v ?? "")) ? parseInt(v, 10) : NaN);
  if (!Number.isFinite(n)) return def;
  return Math.max(lo, Math.min(hi, n));
}
const nowMs = () => Date.now();
const utcIso = () => new Date().toISOString();
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const numFmt = v => String(Number(v));
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const uniq = a => [...new Set(a)];

/* ───────────── игроки ───────────── */
async function ensurePlayer(db, user) {
  const uid = Number(user.id);
  let p = await db.q("SELECT * FROM players WHERE tg_id=?", [uid], true);
  if (!p) {
    const name = String(user.first_name || "Игрок").trim().slice(0, 32) || "Игрок";
    await db.x("INSERT INTO players(tg_id, name, username) VALUES(?,?,?)", [uid, name, user.username || null]);
    p = await db.q("SELECT * FROM players WHERE tg_id=?", [uid], true);
  } else if (user.username && user.username !== p.username) {
    await db.x("UPDATE players SET username=? WHERE tg_id=?", [user.username, uid]);
  }
  return p;
}

async function me(db, ctx, club) {
  const p = await ensurePlayer(db, ctx.user);
  return {
    player: p, admin: ctx.admin, club,
    structure: await getSetting(db, "structure"), scoring: await getSetting(db, "scoring"),
    table_size: await getSetting(db, "table_size"), chips: await getSetting(db, "chips"),
  };
}

async function rename(db, ctx, b) {
  const name = String(b.name ?? "").trim().slice(0, 32);
  if (!name) throw new ApiError("Имя не может быть пустым");
  await db.x("UPDATE players SET name=? WHERE tg_id=?", [name, ctx.uid]);
  return { ok: true };
}

async function players(db, ctx) {
  needAdmin(ctx);
  return db.q("SELECT tg_id, name, username FROM players ORDER BY name COLLATE NOCASE");
}

/* ───────────── настройки ───────────── */
async function saveSettings(db, ctx, b) {
  needAdmin(ctx);
  if (b.structure) {
    const s = b.structure, levels = [];
    for (const l of (s.levels || []).slice(0, 60)) {
      if (l && l.brk) levels.push({ brk: true });
      else levels.push({ sb: toInt(l && l.sb), bb: toInt(l && l.bb), ante: toInt(l && l.ante) });
    }
    if (!levels.some(l => !l.brk)) throw new ApiError("Нужен хотя бы один уровень");
    await setSetting(db, "structure", { minutes: toInt(s.minutes, 15, 1, 180), breakMin: toInt(s.breakMin, 10, 1, 120), levels });
  }
  if (b.scoring) {
    const s = b.scoring, cur = await getSetting(db, "scoring");
    let margin = parseFloat(s.margin ?? cur.margin);
    if (!Number.isFinite(margin)) margin = cur.margin;
    await setSetting(db, "scoring", {
      base: toInt(s.base, cur.base, 1, 100000), step: toInt(s.step, cur.step, 0, 100000),
      winner_bonus: toInt(s.winner_bonus, cur.winner_bonus, 0, 100000), bounty: toInt(s.bounty, cur.bounty, 0, 100000),
      rebuy_penalty: toInt(s.rebuy_penalty, cur.rebuy_penalty, 0, 100000),
      margin: Math.max(0.5, Math.min(1.0, Math.round(margin * 100) / 100)),
    });
  }
  if ("table_size" in b) await setSetting(db, "table_size", toInt(b.table_size, 9, 2, 12));
  if ("chips" in b) {
    const chips = [];
    for (const c of (b.chips || []).slice(0, 12)) {
      const face = String(c.face ?? "").trim().slice(0, 8);
      const value = toInt(c.value, 0, 0, 1e7), count = toInt(c.count, 0, 0, 100000);
      if (face && value) chips.push({ face, value, count });
    }
    await setSetting(db, "chips", chips);
  }
  return {
    structure: await getSetting(db, "structure"), scoring: await getSetting(db, "scoring"),
    table_size: await getSetting(db, "table_size"), chips: await getSetting(db, "chips"),
  };
}

/* ───────────── общий таймер ───────────── */
const levelMs = (c, i) => (c.levels[i].brk ? c.breakMin : c.minutes) * 60000;
async function freshClock(db) {
  const s = await getSetting(db, "structure");
  return { levels: s.levels, minutes: s.minutes, breakMin: s.breakMin, idx: 0, running: false, ends_at: 0, remaining: null, started: false };
}
function normalizeClock(c) {
  if (!c) return c;
  if (c.running) {
    const t = nowMs();
    while (c.ends_at <= t) {
      if (c.idx < c.levels.length - 1) { c.idx += 1; c.ends_at += levelMs(c, c.idx); }
      else { c.running = false; c.remaining = 0; break; }
    }
  }
  return c;
}
const loadClock = t => normalizeClock(t.clock ? JSON.parse(t.clock) : null);
async function clockAction(db, c, action) {
  if (action === "start") {
    if (!c.running) {
      let rem = (c.remaining !== null && c.remaining !== 0 && c.remaining !== undefined) ? c.remaining : levelMs(c, c.idx);
      if (c.remaining === 0 && c.idx === c.levels.length - 1) { c.idx = 0; rem = levelMs(c, 0); }
      c.ends_at = nowMs() + rem; c.running = true; c.started = true;
    }
  } else if (action === "pause") {
    if (c.running) { c.remaining = Math.max(0, c.ends_at - nowMs()); c.running = false; }
  } else if (action === "next" || action === "prev") {
    const i = c.idx + (action === "next" ? 1 : -1);
    if (i >= 0 && i < c.levels.length) {
      c.idx = i; c.remaining = levelMs(c, i);
      if (c.running) c.ends_at = nowMs() + c.remaining;
    }
  } else if (action === "add_minute") {
    if (c.running) c.ends_at += 60000;
    else c.remaining = (c.remaining || levelMs(c, c.idx)) + 60000;
  } else if (action === "reset") {
    const f = await freshClock(db);
    for (const k of Object.keys(c)) delete c[k];
    Object.assign(c, f);
  } else if (action === "sync") {
    const s = await getSetting(db, "structure");
    c.levels = s.levels; c.minutes = s.minutes; c.breakMin = s.breakMin;
    c.idx = Math.min(c.idx, c.levels.length - 1);
  } else throw new ApiError("Неизвестная команда таймера");
  return c;
}

/* ───────────── турниры ───────────── */
async function betCoef(db, alive) {
  const sc = await getSetting(db, "scoring");
  return Math.round(Math.max(1.1, sc.margin * alive) * 100) / 100;
}
async function getT(db, tid) {
  const t = await db.q("SELECT * FROM tournaments WHERE id=?", [tid], true);
  if (!t) throw new ApiError("Турнир не найден");
  return t;
}

async function fullT(db, t, uid, light = false) {
  const tid = t.id;
  const ents = await db.q(
    `SELECT e.*, p.name, p.username FROM entries e JOIN players p ON p.tg_id = e.tg_id
     WHERE e.tournament_id=? ORDER BY e.status, COALESCE(e.place, 0), e.joined_at`, [tid]);
  const ins = ents.filter(e => e.status === "in"), wait = ents.filter(e => e.status === "wait");
  const alive = ins.filter(e => e.place === null);
  const out = { ...t };
  delete out.clock;
  const mine = ents.find(e => e.tg_id === uid);
  Object.assign(out, {
    entries: ins, waitlist: wait, alive: alive.length,
    my_status: mine ? mine.status : null,
    joined: ents.some(e => e.tg_id === uid && e.status === "in"),
    chips_total: ins.reduce((a, e) => a + t.stack + e.rebuys * t.rebuy_chips + e.addons * t.addon_chips, 0),
  });
  out.avg_stack = alive.length ? Math.round(out.chips_total / alive.length) : 0;
  out.bet_coef_now = t.status === "running" && alive.length >= 2 ? await betCoef(db, alive.length) : null;
  const pos = wait.findIndex(e => e.tg_id === uid);
  out.position = pos >= 0 ? pos + 1 : null;
  if (light) return out;
  const r = await db.q("SELECT answer FROM rsvp WHERE tournament_id=? AND tg_id=?", [tid, uid], true);
  out.rsvp = out.joined ? "going" : (r ? r.answer : null);
  out.maybe = await db.q(`SELECT p.tg_id, p.name, r.answer FROM rsvp r JOIN players p ON p.tg_id=r.tg_id
                          WHERE r.tournament_id=? ORDER BY r.answer, p.name`, [tid]);
  const preds = await db.q("SELECT tg_id, pick_id, correct FROM predictions WHERE tournament_id=?", [tid]);
  const tally = {};
  for (const pr of preds) tally[pr.pick_id] = (tally[pr.pick_id] || 0) + 1;
  const myPred = preds.find(pr => pr.tg_id === uid);
  out.predictions = { total: preds.length, tally, mine: myPred ? myPred.pick_id : null, correct: preds.filter(pr => pr.correct).map(pr => pr.tg_id) };
  out.photos = await db.q("SELECT id, tg_id, file FROM photos WHERE tournament_id=? ORDER BY id DESC", [tid]);
  out.clock = loadClock(t);
  out.server_now = nowMs();
  return out;
}

async function tournaments(db, ctx) {
  const active = await db.q("SELECT * FROM tournaments WHERE status!='finished' ORDER BY status='open', starts_at");
  const done = await db.q("SELECT * FROM tournaments WHERE status='finished' ORDER BY starts_at DESC, id DESC LIMIT 30");
  const a = [], f = [];
  for (const t of active) a.push(await fullT(db, t, ctx.uid, true));
  for (const t of done) f.push(await fullT(db, t, ctx.uid, true));
  return { active: a, finished: f };
}

function fmtWhen(iso, env) {
  if (!iso) return "";
  const d0 = new Date(String(iso));
  if (isNaN(d0)) return "";
  const tz = String(env.TZ_OFFSET_HOURS ?? "");
  const off = /^-?\d+$/.test(tz) ? parseInt(tz, 10) : 3;
  const d = new Date(d0.getTime() + off * 3600000);
  const days = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
  const months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const hh = String(d.getUTCHours()).padStart(2, "0"), mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${days[d.getUTCDay()]}, ${d.getUTCDate()} ${months[d.getUTCMonth()]}, ${hh}:${mm}`;
}

async function createTournament(db, ctx, b, env) {
  needAdmin(ctx);
  const title = String(b.title ?? "").trim().slice(0, 64);
  if (!title) throw new ApiError("Укажите название");
  const tid = await db.x(
    `INSERT INTO tournaments(title, starts_at, location, stack, rebuy_chips, addon_chips, max_players) VALUES(?,?,?,?,?,?,?)`,
    [title, b.starts_at || null, String(b.location ?? "").trim().slice(0, 100), toInt(b.stack, 3000, 1),
      toInt(b.rebuy_chips), toInt(b.addon_chips), toInt(b.max_players, 0, 0, 200)]);
  const res = { id: tid };
  if (b.announce) {
    const when = fmtWhen(b.starts_at, env);
    const text = `♠️ <b>Новый турнир — ${esc(title)}</b>\n\n`
      + (when ? `🗓 ${when}\n` : "")
      + (b.location ? `📍 ${esc(b.location)}\n` : "")
      + `🎲 Стек ${toInt(b.stack, 3000)} фишек`
      + (toInt(b.max_players) ? `\n👥 Мест: ${toInt(b.max_players)}` : "")
      + "\n\nЗаписывайтесь в приложении 👇";
    res._notify = [[(await db.q("SELECT tg_id FROM players")).map(p => p.tg_id), text]];
  }
  return res;
}

const countIn = async (db, tid) => (await db.q("SELECT COUNT(*) AS n FROM entries WHERE tournament_id=? AND status='in'", [tid], true)).n;

async function promote(db, t) {
  const notes = [];
  while (!t.max_players || (await countIn(db, t.id)) < t.max_players) {
    const w = await db.q("SELECT tg_id FROM entries WHERE tournament_id=? AND status='wait' ORDER BY joined_at LIMIT 1", [t.id], true);
    if (!w) break;
    await db.x("UPDATE entries SET status='in' WHERE tournament_id=? AND tg_id=?", [t.id, w.tg_id]);
    notes.push([[w.tg_id], `🎉 Освободилось место — ты в игре: <b>${esc(t.title)}</b>!`]);
  }
  return notes;
}

async function join(db, t, uid) {
  if (t.status === "finished") throw new ApiError("Турнир уже завершён");
  if (await db.q("SELECT 1 AS o FROM entries WHERE tournament_id=? AND tg_id=?", [t.id, uid], true)) return "already";
  const full = t.max_players && (await countIn(db, t.id)) >= t.max_players;
  const status = full ? "wait" : "in";
  await db.tx([
    ["INSERT INTO entries(tournament_id, tg_id, status, joined_at) VALUES(?,?,?,?)", [t.id, uid, status, utcIso()]],
    ["DELETE FROM rsvp WHERE tournament_id=? AND tg_id=?", [t.id, uid]],
  ]);
  return status;
}

async function leave(db, t, uid) {
  const e = await db.q("SELECT * FROM entries WHERE tournament_id=? AND tg_id=?", [t.id, uid], true);
  if (!e) return [];
  if (t.status !== "open" && e.status === "in") throw new ApiError("Турнир уже идёт");
  await db.tx([
    ["DELETE FROM entries WHERE tournament_id=? AND tg_id=?", [t.id, uid]],
    ["DELETE FROM predictions WHERE tournament_id=? AND (tg_id=? OR pick_id=?)", [t.id, uid, uid]],
  ]);
  return e.status === "in" ? promote(db, t) : [];
}

const aliveOf = (db, tid) => db.q("SELECT * FROM entries WHERE tournament_id=? AND status='in' AND place IS NULL", [tid]);

async function finish(db, t) {
  const tid = t.id;
  const sc = await getSetting(db, "scoring");
  const ents = await db.q("SELECT * FROM entries WHERE tournament_id=? AND status='in'", [tid]);
  const n = ents.length;
  const w1 = ents.find(e => e.place === null), w2 = ents.find(e => e.place === 1);
  const winner = (w1 && w1.tg_id) || (w2 && w2.tg_id) || null;
  const stmts = [];
  for (const e of ents) {
    const place = e.place || 1;
    const base = (e.base_points && e.place) ? e.base_points : placePoints(sc, n, place, e.knockouts, e.rebuys);
    let status = e.bet_status, payout = 0;
    if (status === "placed") {
      if (e.bet_pick === winner) { status = "won"; payout = Math.round(e.bet_stake * e.bet_coef); }
      else status = "lost";
    } else if (status === "pending") status = "expired";
    const stake = (status === "won" || status === "lost") ? e.bet_stake : 0;
    const points = Math.max(0, base - stake + payout);
    stmts.push(["UPDATE entries SET place=?, base_points=?, points=?, bet_status=?, bet_payout=? WHERE tournament_id=? AND tg_id=?",
      [place, base, points, status, payout, tid, e.tg_id]]);
  }
  stmts.push(["UPDATE predictions SET correct = (pick_id = ?) WHERE tournament_id=?", [winner, tid]]);
  stmts.push(["DELETE FROM entries WHERE tournament_id=? AND status='wait'", [tid]]);
  const c = loadClock(t);
  if (c && c.running) { c.remaining = Math.max(0, c.ends_at - nowMs()); c.running = false; }
  stmts.push(["UPDATE tournaments SET status='finished', finished_at=?, clock=? WHERE id=?", [utcIso(), c ? JSON.stringify(c) : null, tid]]);
  await db.tx(stmts);

  const res = await db.q(`SELECT e.*, p.name FROM entries e JOIN players p ON p.tg_id=e.tg_id WHERE e.tournament_id=? ORDER BY e.place`, [tid]);
  const names = Object.fromEntries(res.map(e => [e.tg_id, e.name]));
  const medals = { 1: "🥇", 2: "🥈", 3: "🥉" };
  const lines = res.map(e => `${medals[e.place] || e.place + "."} ${esc(e.name)} — ${e.points} очк.` + (e.knockouts ? `  🎯${e.knockouts}` : ""));
  const bets = res.filter(e => e.bet_status === "won" || e.bet_status === "lost");
  const betLines = bets.map(e => `${e.bet_status === "won" ? "✅" : "❌"} ${esc(e.name)} → ${esc(names[e.bet_pick] || "?")}: ${e.bet_stake} × ${numFmt(e.bet_coef)}`
    + (e.bet_status === "won" ? ` = +${e.bet_payout - e.bet_stake}` : ` = −${e.bet_stake}`));
  const right = await db.q(`SELECT p.name FROM predictions pr JOIN players p ON p.tg_id=pr.tg_id WHERE pr.tournament_id=? AND pr.correct=1`, [tid]);
  const text = `🏆 <b>Итоги: ${esc(t.title)}</b>\n\n` + lines.join("\n")
    + (betLines.length ? "\n\n🎲 <b>Ставки на победителя</b>\n" + betLines.join("\n") : "")
    + (right.length ? `\n\n🔮 Угадали в прогнозе: ${right.map(r => esc(r.name)).join(", ")}` : "");
  const predUsers = (await db.q("SELECT tg_id FROM predictions WHERE tournament_id=?", [tid])).map(p => p.tg_id);
  return [[uniq(res.map(e => e.tg_id).concat(predUsers)), text]];
}

function b64ToBytes(data) {
  let s = String(data || "");
  if (s.includes(",")) s = s.split(",", 2)[1];
  if (!/^[A-Za-z0-9+/=\s]+$/.test(s)) throw new Error("bad");
  const bin = atob(s.replace(/\s/g, ""));
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

async function tournamentAction(db, ctx, tid, action, b, env) {
  const uid = ctx.uid;
  const t = await getT(db, tid);
  await ensurePlayer(db, ctx.user);
  let notify = [], event = null;

  if (action === "join") {
    const st = await join(db, t, uid);
    event = { wait: "waitlist", in: "joined" }[st] || null;
  } else if (action === "leave") {
    notify = notify.concat(await leave(db, t, uid));
  } else if (action === "rsvp") {
    const ans = b.answer;
    if (ans === "going") {
      const st = await join(db, t, uid);
      event = { wait: "waitlist", in: "joined" }[st] || null;
    } else if (ans === "maybe" || ans === "no") {
      notify = notify.concat(await leave(db, t, uid));
      await db.x("INSERT INTO rsvp(tournament_id, tg_id, answer) VALUES(?,?,?) ON CONFLICT(tournament_id, tg_id) DO UPDATE SET answer=excluded.answer", [tid, uid, ans]);
    } else throw new ApiError("Неверный ответ");
  } else if (action === "predict") {
    if (t.status !== "open") throw new ApiError("Прогнозы принимаются до старта");
    const pick = toInt(b.pick);
    if (!(await db.q("SELECT 1 AS o FROM entries WHERE tournament_id=? AND tg_id=? AND status='in'", [tid, pick], true))) throw new ApiError("Этот игрок не записан");
    await db.x("INSERT INTO predictions(tournament_id, tg_id, pick_id) VALUES(?,?,?) ON CONFLICT(tournament_id, tg_id) DO UPDATE SET pick_id=excluded.pick_id", [tid, uid, pick]);
  } else if (action === "photo") {
    if (!(ctx.admin || (await db.q("SELECT 1 AS o FROM entries WHERE tournament_id=? AND tg_id=?", [tid, uid], true)))) throw new ApiError("Фото могут добавлять участники");
    let raw;
    try { raw = b64ToBytes(b.data); } catch (e) { throw new ApiError("Не удалось прочитать фото"); }
    if (raw.length > 4 * 1024 * 1024 || raw[0] !== 0xff || raw[1] !== 0xd8 || raw[2] !== 0xff) throw new ApiError("Нужен JPEG до 4 МБ");
    const fileId = await storePhoto(env, uid, raw);
    await db.x("INSERT INTO photos(tournament_id, tg_id, file) VALUES(?,?,?)", [tid, uid, fileId]);
  } else if (action === "photo_delete") {
    const ph = await db.q("SELECT * FROM photos WHERE id=? AND tournament_id=?", [toInt(b.id), tid], true);
    if (!ph) throw new ApiError("Фото не найдено");
    if (ph.tg_id !== uid && !ctx.admin) throw new ApiError("Можно удалить только своё фото");
    await db.x("DELETE FROM photos WHERE id=?", [ph.id]);
  } else {
    needAdmin(ctx);
    const target = toInt(b.tg_id);

    if (action === "add_player") {
      await join(db, t, target);
    } else if (action === "remove_player") {
      const e = await db.q("SELECT * FROM entries WHERE tournament_id=? AND tg_id=?", [tid, target], true);
      if (e && e.place !== null && t.status === "running") throw new ApiError("Сначала отмените вылет этого игрока");
      await db.tx([
        ["DELETE FROM entries WHERE tournament_id=? AND tg_id=?", [tid, target]],
        ["DELETE FROM predictions WHERE tournament_id=? AND (tg_id=? OR pick_id=?)", [tid, target, target]],
      ]);
      if (e && e.status === "in" && t.status !== "finished") notify = notify.concat(await promote(db, t));
    } else if (action === "rebuy" || action === "addon") {
      if (t.status === "finished") throw new ApiError("Турнир уже завершён");
      const col = action === "rebuy" ? "rebuys" : "addons";
      const delta = toInt(b.delta, 1, -1, 1) >= 0 ? 1 : -1;
      await db.x(`UPDATE entries SET ${col} = MAX(0, ${col} + ?) WHERE tournament_id=? AND tg_id=?`, [delta, tid, target]);
    } else if (action === "seat") {
      const alive = await aliveOf(db, tid);
      if (alive.length < 2) throw new ApiError("Нужно минимум 2 игрока");
      const size = await getSetting(db, "table_size");
      shuffle(alive);
      const nTables = Math.ceil(alive.length / size);
      const seated = {};
      alive.forEach((e, i) => { const tb = i % nTables + 1; (seated[tb] = seated[tb] || []).push(e.tg_id); });
      const stmts = [];
      for (const [tb, ids] of Object.entries(seated)) ids.forEach((pid, k) => stmts.push(["UPDATE entries SET table_no=?, seat_no=? WHERE tournament_id=? AND tg_id=?", [Number(tb), k + 1, tid, pid]]));
      await db.tx(stmts);
      for (const [tb, ids] of Object.entries(seated)) ids.forEach((pid, k) => {
        const where = nTables > 1 ? `стол ${tb}, место ${k + 1}` : `место ${k + 1}`;
        notify.push([[pid], `🪑 <b>${esc(t.title)}</b>: твоё ${where}`]);
      });
      event = "seated";
    } else if (action === "start") {
      if (t.status !== "open") throw new ApiError("Турнир уже начат");
      if ((await countIn(db, tid)) < 2) throw new ApiError("Нужно минимум 2 игрока");
      await db.x("UPDATE tournaments SET status='running', clock=? WHERE id=?", [JSON.stringify(await freshClock(db)), tid]);
      const ins = (await aliveOf(db, tid)).map(e => e.tg_id);
      notify.push([ins, `🃏 <b>${esc(t.title)}</b> начинается! Таймер и блайнды — в приложении.`]);
      event = "started";
    } else if (action === "bust") {
      if (t.status !== "running") throw new ApiError("Турнир не идёт");
      const alive = await aliveOf(db, tid);
      const ids = new Set(alive.map(e => e.tg_id));
      if (!ids.has(target)) throw new ApiError("Игрок уже выбыл");
      let by = toInt(b.by) || null;
      if (by && (!ids.has(by) || by === target)) by = null;
      const place = alive.length;
      const meE = alive.find(e => e.tg_id === target);
      const nAll = await countIn(db, tid);
      const base = placePoints(await getSetting(db, "scoring"), nAll, place, meE.knockouts, meE.rebuys);
      const betState = place - 1 >= 2 ? "pending" : "expired";
      const stmts = [["UPDATE entries SET place=?, knocked_by=?, busted_at=?, base_points=?, bet_status=?, bet_pick=NULL, bet_stake=0, bet_coef=0, bet_payout=0 WHERE tournament_id=? AND tg_id=?",
        [place, by, utcIso(), base, betState, tid, target]]];
      if (by) stmts.push(["UPDATE entries SET knockouts = knockouts + 1 WHERE tournament_id=? AND tg_id=?", [tid, by]]);
      await db.tx(stmts);
      event = "bust";
      if (place === 2) { notify = notify.concat(await finish(db, await getT(db, tid))); event = "finished"; }
    } else if (action === "unbust") {
      if (t.status !== "running") throw new ApiError("Турнир не идёт");
      let last;
      if (target) {
        last = await db.q("SELECT * FROM entries WHERE tournament_id=? AND tg_id=? AND status='in' AND place IS NOT NULL", [tid, target], true);
        if (!last) throw new ApiError("Этот игрок и так в игре");
      } else {
        last = await db.q("SELECT * FROM entries WHERE tournament_id=? AND status='in' AND place IS NOT NULL ORDER BY place LIMIT 1", [tid], true);
        if (!last) throw new ApiError("Никто ещё не выбыл");
      }
      const p0 = last.place;
      const stmts = [["UPDATE entries SET place=NULL, knocked_by=NULL, busted_at=NULL, base_points=NULL, bet_status='none', bet_pick=NULL, bet_stake=0, bet_coef=0, bet_payout=0 WHERE tournament_id=? AND tg_id=?", [tid, last.tg_id]]];
      if (last.knocked_by) stmts.push(["UPDATE entries SET knockouts = MAX(0, knockouts - 1) WHERE tournament_id=? AND tg_id=?", [tid, last.knocked_by]]);
      await db.tx(stmts);
      const sc = await getSetting(db, "scoring"), nAll = await countIn(db, tid);
      const later = await db.q("SELECT * FROM entries WHERE tournament_id=? AND status='in' AND place IS NOT NULL AND place < ?", [tid, p0]);
      const up = later.map(e => { const np = e.place + 1; return ["UPDATE entries SET place=?, base_points=? WHERE tournament_id=? AND tg_id=?", [np, placePoints(sc, nAll, np, e.knockouts, e.rebuys), tid, e.tg_id]]; });
      await db.tx(up);
      event = "unbust";
    } else if (action === "bet" || action === "bet_decline" || action === "bet_cancel") {
      if (t.status !== "running") throw new ApiError("Ставки принимаются только во время игры");
      const e = await db.q("SELECT * FROM entries WHERE tournament_id=? AND tg_id=? AND status='in'", [tid, target], true);
      if (!e || e.place === null) throw new ApiError("Ставить может только выбывший игрок");
      const alive = await aliveOf(db, tid);
      if (action === "bet_cancel") {
        if (!["placed", "declined"].includes(e.bet_status)) throw new ApiError("Ставки нет");
        if (alive.length < 2) throw new ApiError("Победитель уже ясен — ставки закрыты");
        await db.x("UPDATE entries SET bet_status='pending', bet_pick=NULL, bet_stake=0, bet_coef=0 WHERE tournament_id=? AND tg_id=?", [tid, target]);
      } else if (action === "bet_decline") {
        if (e.bet_status !== "pending") throw new ApiError("Решение по ставке уже принято");
        await db.x("UPDATE entries SET bet_status='declined' WHERE tournament_id=? AND tg_id=?", [tid, target]);
        event = "bet_declined";
      } else {
        if (e.bet_status !== "pending") throw new ApiError("Решение по ставке уже принято — сначала отмените его");
        if (alive.length < 2) throw new ApiError("Победитель уже ясен — ставки закрыты");
        const pick = toInt(b.pick);
        if (!alive.some(a => a.tg_id === pick)) throw new ApiError("Ставить можно только на того, кто ещё в игре");
        const stake = toInt(b.stake);
        if (stake < 1 || stake > (e.base_points || 0)) throw new ApiError(`Ставка — от 1 до ${e.base_points} очков`);
        const coef = await betCoef(db, alive.length);
        await db.x("UPDATE entries SET bet_status='placed', bet_pick=?, bet_stake=?, bet_coef=? WHERE tournament_id=? AND tg_id=?", [pick, stake, coef, tid, target]);
        event = "bet_placed";
      }
    } else if (action === "clock") {
      const c = loadClock(t) || await freshClock(db);
      await clockAction(db, c, String(b.cmd));
      await db.x("UPDATE tournaments SET clock=? WHERE id=?", [JSON.stringify(c), tid]);
    } else if (action === "delete") {
      await db.tx(["entries", "rsvp", "predictions", "photos"].map(tbl => [`DELETE FROM ${tbl} WHERE tournament_id=?`, [tid]])
        .concat([["DELETE FROM tournaments WHERE id=?", [tid]]]));
      return { deleted: true };
    } else throw new ApiError("Неизвестное действие");
  }

  const out = await fullT(db, await getT(db, tid), uid);
  out.event = event;
  if (notify.length) out._notify = notify;
  return out;
}

/* ───────────── рейтинг и статистика ───────────── */
function periodWhere(period) {
  if (period && (period.length === 4 || period.length === 7) && /^\d{4}/.test(period)) return [`AND substr(t.starts_at, 1, ${period.length}) = ?`, [period]];
  return ["", []];
}
const RATING_SQL = w => `
SELECT p.tg_id, p.name, COUNT(*) AS games, SUM(e.place = 1) AS wins, SUM(e.place <= 3) AS top3, MIN(e.place) AS best,
       SUM(e.points) AS points, SUM(e.knockouts) AS knockouts, SUM(e.rebuys) AS rebuys,
       SUM(e.bet_status = 'won') AS bets_won,
       SUM(CASE WHEN e.bet_status IN ('won','lost') THEN e.bet_payout - e.bet_stake ELSE 0 END) AS bet_profit,
       AVG(CASE WHEN cnt.n > 1 THEN 1.0 - (e.place - 1.0) / (cnt.n - 1) ELSE 1 END) AS form
FROM entries e
JOIN players p ON p.tg_id = e.tg_id
JOIN tournaments t ON t.id = e.tournament_id AND t.status = 'finished'
JOIN (SELECT tournament_id, COUNT(*) AS n FROM entries WHERE status='in' GROUP BY tournament_id) cnt ON cnt.tournament_id = e.tournament_id
WHERE e.status = 'in' AND e.place IS NOT NULL ${w}
GROUP BY p.tg_id
ORDER BY points DESC, wins DESC, form DESC`;

async function ratingRows(db, period = "") {
  const [w, a] = periodWhere(period);
  const rows = await db.q(RATING_SQL(w), a);
  for (const r of rows) r.form = Math.round((r.form || 0) * 100);
  return rows;
}

async function stats(db, ctx, period) {
  const rows = await ratingRows(db, period);
  const months = (await db.q(`SELECT DISTINCT substr(starts_at,1,7) AS m FROM tournaments WHERE status='finished' AND starts_at IS NOT NULL ORDER BY m DESC`)).map(r => r.m);
  const [w, a] = periodWhere(period);
  const oracles = await db.q(`SELECT p.tg_id, p.name, SUM(pr.correct) AS hits, COUNT(*) AS tries
    FROM predictions pr JOIN players p ON p.tg_id = pr.tg_id JOIN tournaments t ON t.id = pr.tournament_id AND t.status='finished'
    WHERE 1=1 ${w} GROUP BY p.tg_id HAVING hits > 0 ORDER BY hits DESC, tries ASC LIMIT 10`, a);
  const games = (await db.q(`SELECT COUNT(*) AS n FROM tournaments t WHERE status='finished' ${w}`, a, true)).n;
  return { rows, months, oracles, games };
}

const ACHIEVEMENTS = [
  ["debut", "♠", "Дебют", "Сыграть первый турнир"], ["first_win", "♛", "Первая корона", "Выиграть турнир"],
  ["hat_trick", "♛", "Хет-трик", "Три победы"], ["dynasty", "♛", "Династия", "Десять побед"],
  ["steady", "♦", "Стабильность", "Три турнира подряд в топ-3"], ["regular", "♣", "Завсегдатай", "Десять турниров"],
  ["legend", "★", "Легенда клуба", "Двадцать пять турниров"], ["hunter", "✦", "Охотник", "Три нокаута за один турнир"],
  ["collector", "✦", "Коллекционер", "Двадцать нокаутов всего"], ["comeback", "♥", "Камбэк", "Победа после двух и более ребаев"],
  ["iron", "◆", "Железный", "Победа без единого ребая"], ["bubble", "○", "Король пузыря", "Трижды финишировать четвёртым"],
  ["oracle", "◎", "Оракул", "Три верных прогноза на победителя"], ["bookie", "◈", "Букмекер", "Выиграть ставку с кэфом от ×3"],
  ["allin", "⬢", "Ва-банк", "Поставить все очки за игру и выиграть"], ["champion", "♚", "Чемпион месяца", "Стать первым в рейтинге месяца"],
];

async function achievements(db, uid, history) {
  const got = new Set();
  const wins = history.filter(h => h.place === 1).length;
  const kos = history.reduce((a, h) => a + h.knockouts, 0);
  if (history.length) got.add("debut");
  if (wins >= 1) got.add("first_win");
  if (wins >= 3) got.add("hat_trick");
  if (wins >= 10) got.add("dynasty");
  if (history.length >= 10) got.add("regular");
  if (history.length >= 25) got.add("legend");
  if (kos >= 20) got.add("collector");
  let streak = 0;
  for (const h of history) {
    streak = h.place <= 3 ? streak + 1 : 0;
    if (streak >= 3) got.add("steady");
    if (h.knockouts >= 3) got.add("hunter");
    if (h.place === 1 && h.rebuys >= 2) got.add("comeback");
    if (h.place === 1 && h.rebuys === 0 && h.n >= 3) got.add("iron");
  }
  for (const h of history) {
    if (h.bet_status === "won" && (h.bet_coef || 0) >= 3) got.add("bookie");
    if (h.bet_status === "won" && h.bet_stake && h.bet_stake >= (h.base_points || 0)) got.add("allin");
  }
  if (history.filter(h => h.place === 4).length >= 3) got.add("bubble");
  const hits = (await db.q("SELECT COUNT(*) AS n FROM predictions WHERE tg_id=? AND correct=1", [uid], true)).n;
  if (hits >= 3) got.add("oracle");
  const thisMonth = new Date().toISOString().slice(0, 7);
  const months = new Set(history.filter(h => h.starts_at).map(h => h.starts_at.slice(0, 7)));
  for (const m of months) {
    if (m && m < thisMonth) {
      const top = await ratingRows(db, m);
      if (top.length && top[0].tg_id === uid) { got.add("champion"); break; }
    }
  }
  return ACHIEVEMENTS.map(([key, icon, title, desc]) => ({ key, icon, title, desc, got: got.has(key) }));
}

async function profile(db, ctx, pid) {
  const uid = pid || ctx.uid;
  const p = await db.q("SELECT * FROM players WHERE tg_id=?", [uid], true);
  if (!p) throw new ApiError("Игрок не найден");
  const all = await ratingRows(db);
  const s = all.find(r => r.tg_id === uid) || null;
  const ri = all.findIndex(r => r.tg_id === uid);
  const history = await db.q(
    `SELECT t.id, t.title, t.starts_at, e.place, e.points, e.knockouts, e.rebuys, e.addons,
            e.base_points, e.bet_status, e.bet_stake, e.bet_coef, e.bet_payout, e.bet_pick,
            (SELECT COUNT(*) FROM entries WHERE tournament_id=t.id AND status='in') AS n
     FROM entries e JOIN tournaments t ON t.id = e.tournament_id
     WHERE e.tg_id=? AND e.status='in' AND t.status='finished'
     ORDER BY t.starts_at, t.id`, [uid]);
  const byMonth = {};
  for (const h of history) { const m = (h.starts_at || "").slice(0, 7); if (m) byMonth[m] = (byMonth[m] || 0) + h.points; }
  const monthly = Object.keys(byMonth).sort().slice(-12).map(m => ({ m, points: byMonth[m] }));
  const rivals = await db.q(
    `SELECT p.tg_id, p.name, COUNT(*) AS games, SUM(me.place < op.place) AS ahead
     FROM entries me
     JOIN entries op ON op.tournament_id = me.tournament_id AND op.tg_id != me.tg_id AND op.status='in'
     JOIN tournaments t ON t.id = me.tournament_id AND t.status='finished'
     JOIN players p ON p.tg_id = op.tg_id
     WHERE me.tg_id = ? AND me.status='in'
     GROUP BY op.tg_id ORDER BY games DESC, p.name LIMIT 12`, [uid]);
  const nemesis = await db.q(`SELECT p.tg_id, p.name, COUNT(*) AS n FROM entries e JOIN players p ON p.tg_id = e.knocked_by
     JOIN tournaments t ON t.id=e.tournament_id AND t.status='finished' WHERE e.tg_id=? GROUP BY e.knocked_by ORDER BY n DESC LIMIT 1`, [uid], true);
  const victim = await db.q(`SELECT p.tg_id, p.name, COUNT(*) AS n FROM entries e JOIN players p ON p.tg_id = e.tg_id
     JOIN tournaments t ON t.id=e.tournament_id AND t.status='finished' WHERE e.knocked_by=? GROUP BY e.tg_id ORDER BY n DESC LIMIT 1`, [uid], true);
  const hits = await db.q(`SELECT COALESCE(SUM(correct),0) AS h, COUNT(*) AS n FROM predictions pr
     JOIN tournaments t ON t.id=pr.tournament_id AND t.status='finished' WHERE pr.tg_id=?`, [uid], true);
  return {
    player: p, stats: s, rank: ri >= 0 ? ri + 1 : null, history: history.slice().reverse().slice(0, 40),
    monthly, rivals, nemesis, victim, predictions: hits, achievements: await achievements(db, uid, history),
  };
}

/* ───────────── календарь ───────────── */
async function ics(db, tid, minutes = 240) {
  const t = await getT(db, tid);
  if (!t.starts_at) throw new ApiError("У турнира нет даты");
  const start = new Date(t.starts_at), end = new Date(start.getTime() + minutes * 60000);
  const f = d => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const clean = s => String(s ?? "").replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, " ");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//poker-club//RU", "BEGIN:VEVENT",
    `UID:poker-${tid}@club`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(start)}`, `DTEND:${f(end)}`,
    `SUMMARY:♠ ${clean(t.title)}`, `LOCATION:${clean(t.location)}`, `DESCRIPTION:Стартовый стек ${t.stack} фишек`,
    "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", "DESCRIPTION:Покер через 2 часа", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
}

/* ───────────── напоминания ───────────── */
async function dueReminders(db) {
  const out = [], now = Date.now();
  for (const t of await db.q("SELECT * FROM tournaments WHERE status='open' AND starts_at IS NOT NULL")) {
    const starts = new Date(t.starts_at).getTime();
    if (!Number.isFinite(starts)) continue;
    const left = (starts - now) / 1000;
    const entrants = (await db.q("SELECT tg_id FROM entries WHERE tournament_id=? AND status='in'", [t.id])).map(e => e.tg_id);
    const waiting = (await db.q("SELECT tg_id FROM entries WHERE tournament_id=? AND status='wait'", [t.id])).map(e => e.tg_id);
    const title = esc(t.title);
    if (left > 0 && left <= 3600 && !t.reminded_hour) {
      await db.x("UPDATE tournaments SET reminded_hour=1, reminded_day=1 WHERE id=?", [t.id]);
      const mins = Math.max(1, Math.round(left / 60));
      out.push([entrants, `⏰ <b>${title}</b> через ${mins} мин.\n📍 ${esc(t.location || "место уточняйте")}`]);
    } else if (left > 3600 && left <= 86400 && !t.reminded_day) {
      await db.x("UPDATE tournaments SET reminded_day=1 WHERE id=?", [t.id]);
      const hours = Math.round(left / 3600);
      out.push([entrants, `♠️ Завтра покер: <b>${title}</b> через ${hours} ч. Ты в списке!`]);
      if (waiting.length) out.push([waiting, `⏳ <b>${title}</b> через ${hours} ч. Ты в листе ожидания — сообщим, если место освободится.`]);
      const maybe = (await db.q("SELECT tg_id FROM rsvp WHERE tournament_id=? AND answer='maybe'", [t.id])).map(r => r.tg_id);
      if (maybe.length) out.push([maybe, `🤔 Ты отметил «может быть» на <b>${title}</b>. Через ${hours} ч — определяйся 👇`]);
    }
  }
  return out;
}

/* ───────────── Telegram ───────────── */
async function tgApi(env, method, payload) {
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  return r.json().catch(() => ({ ok: false }));
}
const openKb = (url, text = "♠️ Открыть клуб") => ({ inline_keyboard: [[{ text, web_app: { url } }]] });

async function sendMany(env, url, uids, text, withButton = true) {
  let sent = 0;
  for (const uid of uniq(uids)) {
    const p = { chat_id: uid, text, parse_mode: "HTML", disable_web_page_preview: true };
    if (withButton && url) p.reply_markup = openKb(url);
    const r = await tgApi(env, "sendMessage", p);
    if (r.ok) sent++;
    await new Promise(res => setTimeout(res, 40));
  }
  return sent;
}

async function storePhoto(env, uid, bytes) {
  const fd = new FormData();
  fd.append("chat_id", String(uid));
  fd.append("disable_notification", "true");
  fd.append("photo", new Blob([bytes], { type: "image/jpeg" }), "photo.jpg");
  const r = await (await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendPhoto`, { method: "POST", body: fd })).json();
  if (!r.ok) throw new ApiError("Не удалось сохранить фото. Напишите боту /start и попробуйте снова");
  const sizes = r.result.photo || [];
  const fileId = sizes[sizes.length - 1].file_id;
  await tgApi(env, "deleteMessage", { chat_id: uid, message_id: r.result.message_id });
  return fileId;
}

async function checkInitData(initData, token) {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const check = [...params.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join("\n");
  const enc = new TextEncoder();
  const k1 = await crypto.subtle.importKey("raw", enc.encode("WebAppData"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const secret = await crypto.subtle.sign("HMAC", k1, enc.encode(token));
  const k2 = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k2, enc.encode(check)));
  const hex = [...sig].map(x => x.toString(16).padStart(2, "0")).join("");
  if (hex !== hash) return null;
  if (Date.now() / 1000 - parseInt(params.get("auth_date") || "0", 10) > 7 * 86400) return null;
  try { return JSON.parse(params.get("user") || "{}"); } catch (e) { return null; }
}

async function hookSecret(env) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("hook:" + env.BOT_TOKEN));
  return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

async function onUpdate(env, upd, appUrl) {
  const m = upd.message;
  if (!m || !m.from || m.chat.type !== "private") return;
  const db = mkDb(env);
  const club = env.CLUB_NAME || "Домашний покерный клуб";
  if (/^\/start\b/.test(m.text || "")) {
    await ensurePlayer(db, m.from);
    await tgApi(env, "sendMessage", { chat_id: m.chat.id, text: `♠️ <b>${esc(club)}</b>`, parse_mode: "HTML", reply_markup: { remove_keyboard: true } });
    await tgApi(env, "sendMessage", { chat_id: m.chat.id, text: "Турниры, рейтинг, таймер блайндов и всё остальное — в приложении 👇", reply_markup: openKb(appUrl) });
  } else {
    await tgApi(env, "sendMessage", { chat_id: m.chat.id, text: "Всё управление — в приложении 👇", reply_markup: openKb(appUrl) });
  }
}

/* ───────────── HTTP ───────────── */
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

const TYPES = { html: "text/html; charset=utf-8", css: "text/css; charset=utf-8", js: "application/javascript; charset=utf-8" };
async function serveStatic(env, ctx, name) {
  const ext = name.split(".").pop();
  if (!TYPES[ext] || !/^[\w.-]+$/.test(name)) return new Response("Not found", { status: 404 });
  const src = `${String(env.GITHUB_RAW || "").replace(/\/$/, "")}/${name}`;
  const cache = caches.default, key = new Request("https://static.cache/" + name);
  let r = await cache.match(key);
  if (!r) {
    const up = await fetch(src, { cf: { cacheTtl: 60 } });
    if (!up.ok) return new Response("Не удалось загрузить приложение с GitHub", { status: 502 });
    r = new Response(await up.text(), { headers: { "Content-Type": TYPES[ext], "Cache-Control": "public, max-age=60" } });
    ctx.waitUntil(cache.put(key, r.clone()));
  }
  return new Response(r.body, { headers: { "Content-Type": TYPES[ext], "Cache-Control": ext === "html" ? "no-cache" : "public, max-age=300" } });
}

async function servePhoto(env, ctx, fid) {
  const db = mkDb(env);
  if (!(await db.q("SELECT 1 AS o FROM photos WHERE file=?", [fid], true))) return new Response("Not found", { status: 404 });
  const cache = caches.default, key = new Request("https://photo.cache/" + fid);
  let r = await cache.match(key);
  if (r) return r;
  const info = await tgApi(env, "getFile", { file_id: fid });
  if (!info.ok) return new Response("Not found", { status: 404 });
  const up = await fetch(`https://api.telegram.org/file/bot${env.BOT_TOKEN}/${info.result.file_path}`);
  if (!up.ok) return new Response("Not found", { status: 404 });
  r = new Response(up.body, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=31536000" } });
  ctx.waitUntil(cache.put(key, r.clone()));
  return r;
}

async function setup(env, origin) {
  const db = mkDb(env);
  for (const s of SCHEMA) await env.DB.prepare(s).run();
  const appUrl = origin + "/";
  const hook = await tgApi(env, "setWebhook", { url: `${origin}/tg`, secret_token: await hookSecret(env), drop_pending_updates: false, allowed_updates: ["message"] });
  const menu = await tgApi(env, "setChatMenuButton", { menu_button: { type: "web_app", text: "Клуб", web_app: { url: appUrl } } });
  await setSetting(db, "app_url", appUrl);
  const counts = {};
  for (const tbl of ["players", "tournaments", "entries"]) counts[tbl] = (await db.q(`SELECT COUNT(*) AS n FROM ${tbl}`, [], true)).n;
  return json({ ok: true, webhook: hook, menu, app: appUrl, data: counts });
}

async function handleApi(request, env, ctx, url) {
  const auth = request.headers.get("X-Init-Data") || url.searchParams.get("_auth") || "";
  const user = await checkInitData(auth, env.BOT_TOKEN);
  if (!user || !("id" in user)) return json({ error: "Откройте приложение через Telegram" }, 401);
  const uid = Number(user.id);
  const admins = String(env.ADMIN_IDS || "").split(",").map(s => s.trim()).filter(Boolean).map(Number);
  const c = { uid, user, admin: admins.includes(uid) };
  const db = mkDb(env);
  const club = env.CLUB_NAME || "Домашний покерный клуб";
  const appUrl = url.origin + "/";
  const path = url.pathname.replace(/^\/api/, "");
  let body = {};
  if (request.method === "POST") { try { body = JSON.parse(await request.text() || "{}") || {}; } catch (e) { body = {}; } }
  const done = data => {
    if (data && typeof data === "object" && data._notify) {
      const list = data._notify; delete data._notify;
      ctx.waitUntil((async () => { for (const [uids, text] of list) await sendMany(env, appUrl, uids, text); })());
    }
    return json(data);
  };
  try {
    let m;
    if (path === "/me") return done(await me(db, c, club));
    if (path === "/rename" && request.method === "POST") return done(await rename(db, c, body));
    if (path === "/settings" && request.method === "POST") return done(await saveSettings(db, c, body));
    if (path === "/players") return json(await players(db, c));
    if (path === "/tournaments" && request.method === "GET") return done(await tournaments(db, c));
    if (path === "/tournaments" && request.method === "POST") return done(await createTournament(db, c, body, env));
    if ((m = path.match(/^\/tournaments\/(\d+)$/))) return done(await fullT(db, await getT(db, Number(m[1])), uid));
    if ((m = path.match(/^\/tournaments\/(\d+)\/([a-z_]+)$/)) && request.method === "POST") return done(await tournamentAction(db, c, Number(m[1]), m[2], body, env));
    if (path === "/stats") return done(await stats(db, c, url.searchParams.get("period") || ""));
    if (path === "/profile") return done(await profile(db, c, toInt(url.searchParams.get("id"))));
    if (path === "/broadcast" && request.method === "POST") {
      needAdmin(c);
      const text = String(body.text ?? "").trim();
      if (!text) throw new ApiError("Пустое сообщение");
      const uids = (await db.q("SELECT tg_id FROM players")).map(p => p.tg_id);
      ctx.waitUntil(sendMany(env, appUrl, uids, "📢 " + esc(text)));
      return json({ sent: uids.length });
    }
    if (path === "/card" && request.method === "POST") {
      let raw;
      try { raw = b64ToBytes(body.image); } catch (e) { throw new ApiError("Не удалось прочитать картинку"); }
      if (raw.length > 6 * 1024 * 1024) throw new ApiError("Слишком большая картинка");
      const fd = new FormData();
      fd.append("chat_id", String(uid));
      fd.append("caption", "Готово — перешлите в общий чат ♠️");
      fd.append("photo", new Blob([raw], { type: "image/png" }), "season.png");
      await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendPhoto`, { method: "POST", body: fd });
      return json({ ok: true });
    }
    return json({ error: "Не найдено" }, 404);
  } catch (e) {
    if (e instanceof ApiError) return json({ error: e.message }, 400);
    console.error(e && e.stack || e);
    return json({ error: "Ошибка сервера" }, 500);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname;
    if (!env.BOT_TOKEN) return new Response("Не задан BOT_TOKEN в настройках Worker", { status: 500 });
    if (!env.DB) return new Response("Не привязана база D1 (переменная DB)", { status: 500 });
    if (p.startsWith("/api/")) return handleApi(request, env, ctx, url);
    if (p === "/tg" && request.method === "POST") {
      if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== await hookSecret(env)) return new Response("forbidden", { status: 403 });
      const upd = await request.json().catch(() => null);
      if (upd) ctx.waitUntil(onUpdate(env, upd, url.origin + "/").catch(e => console.error(e)));
      return new Response("ok");
    }
    if (p === "/setup") return setup(env, url.origin);
    let m;
    if ((m = p.match(/^\/photos\/([\w-]+)$/))) return servePhoto(env, ctx, m[1]);
    if ((m = p.match(/^\/ics\/(\d+)\.ics$/))) {
      try {
        const text = await ics(mkDb(env), Number(m[1]));
        return new Response(text, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": "attachment; filename=poker.ics" } });
      } catch (e) { return new Response("Not found", { status: 404 }); }
    }
    if (p === "/" || p === "/index.html") return serveStatic(env, ctx, "index.html");
    if ((m = p.match(/^\/static\/([\w.-]+)$/))) return serveStatic(env, ctx, m[1]);
    return new Response("Not found", { status: 404 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      const db = mkDb(env);
      const list = await dueReminders(db);
      const row = await db.q("SELECT value FROM settings WHERE key='app_url'", [], true);
      const appUrl = row ? JSON.parse(row.value) : "";
      for (const [uids, text] of list) await sendMany(env, appUrl, uids, text);
    })());
  },
};
