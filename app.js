// Roue des tâches — les tâches sont des pastilles, et la roue les tire au sort.
// Les tâches sont sauvegardées dans le localStorage du navigateur.
//
// La roue est une adaptation en JavaScript simple du "Magnetic select"
// de Bencho (bencho.dev, licence MIT). Les commentaires en anglais
// viennent de l'original : ils expliquent pourquoi les nombres sont ce
// qu'ils sont.

const STORAGE_KEY = "todo-wheel-tasks";
const ADD = "__add__"; // clé de la pastille "+"

// Trois verts pour les pastilles, et le rose complémentaire pour la gagnante
// (vert ≈ 148° sur le cercle chromatique, rose ≈ 328° : 180° d'écart).
const GREENS = ["#0f5132", "#198754", "#2fbf71"];
const GREEN_INK = ["#ffffff", "#ffffff", "#06301c"];
const PINK = "#ff4fa3";

/* ══ Magnetic select ═══════════════════════════════════════
   A cluster of options set close enough together to be in
   each other's way, and a selection that behaves like a
   magnet rather than a highlight: the one you press swells
   and takes the ink, and the rest are shoved radially out of
   its way — hardest next to it, barely at all at the edges.

   THE POINT IS THE FIELD, NOT THE ITEM. The choice deforms
   its neighbourhood, so the answer to "which one is selected"
   is legible from three feet away with the shapes unreadable
   — it is the one everything else is leaning away from.

   Every number still falls out of ONE decision: how far the
   selected chip grows. The room it needs is arithmetic from
   that, the shove is that room plus an aura, the aura decays
   with real distance, and the tilt is the aura's leftovers. */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const mod = (a, n) => ((a % n) + n) % n;

/* the px numbers below were tuned on a 44px chip; ours carry
   text, so they are bigger, and every px number is scaled by
   chip / REF_CHIP to keep the same proportions */
const REF_CHIP = 44;

/* Bencho packs a 44 chip at a pitch of 45. Ours hold words, and
   a label that touches its neighbour's reads as one blob, so the
   gap is a little wider: a 44 chip at a pitch of 47. */
const CHIP_RATIO = 44 / 47;

/* ── how fast the aura falls off, in lattice steps ─────────
   2.8, from the original: the field reaches a little further,
   which if anything reads as more of a field. */
const SPREAD = 2.8;

/* the strength of the whole field and its overshoot, 0-100 */
const PULL = 55;
const BOUNCE = 55;
/* how far the cluster leans toward the cursor near it, 0-100 */
const GIVE = 50;

/* ── the springs ─────────────────────────────────────────
   Bounce is a DAMPING RATIO, not a damping value: tie it to a
   raw number and the same setting is bouncy on one chip and
   dead on another, because each chip here springs at a
   different stiffness. As a ratio it means the same thing
   everywhere — 0.9 arrives and stops, 0.42 arrives and rings. */
const ZETA = 0.9 - 0.48 * (BOUNCE / 100);

/* Read once. A preference, not a live input. */
const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- Éléments de la page ----------

const mag = document.getElementById("mag");
const spinBtn = document.getElementById("spin-btn");
const addForm = document.getElementById("add-form");
const input = document.getElementById("task-input");
const addClose = document.getElementById("add-close");
const taskSheet = document.getElementById("task-sheet");
const taskSheetText = document.getElementById("task-sheet-text");
const taskDone = document.getElementById("task-done");
const taskDelete = document.getElementById("task-delete");
const result = document.getElementById("result");
const resultText = document.getElementById("result-text");
const doneBtn = document.getElementById("done-btn");
const doneCount = document.getElementById("done-count");
const doneCountText = document.getElementById("done-count-text");
const clearDoneBtn = document.getElementById("clear-done");
const fx = document.getElementById("fx");
const fxCtx = fx.getContext("2d");

// ---------- État ----------

let tasks = loadTasks();
let chips = []; // une entrée par pastille affichée
let geo = { pitch: 80, chip: 75, hub: { x: 0, y: 0, r: 1 } };
let magnetKey = null; // la pastille qui fait l'aimant (id de tâche, ADD, ou null)
let won = false; // true quand l'aimant est la tâche tirée au sort
let spinning = false;

function loadTasks() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    // stockage indisponible (navigation privée…) : on continue sans sauvegarder
  }
}

// Seules les tâches non terminées vont sur la roue.
function wheelTasks() {
  return tasks.filter((t) => !t.done);
}

// ---------- La grille en nid d'abeille ----------

/* ── the packing ───────────────────────────────────────────
   A hex lattice, so every neighbour sits the same few pixels
   off touching.

   THE REGULARITY IS THE POINT. The arrangement is the thing
   being DEFORMED. A field distorting an irregular scatter is
   hard to read as anything but a different scatter; the same
   field opening a hole in a honeycomb is unmistakable. You
   need the regular ground to see the disturbance against.

   Points are taken from the lattice in rings outward, so each
   is the roundest blob available at that size, and the first
   is the centre.

   Bencho offers only three and seven, "the only two
   arrangements at this pitch where every chip has the same
   relationship to its neighbours". A todo list does not get to
   choose its length, so here every count is allowed; past
   seven the blob is stretched upright, because a phone is
   taller than it is wide.

   Coordinates are in lattice steps: one step = one pitch. */
function latticePoints(count) {
  if (count === 1) return [{ x: 0, y: 0, c: 1 }];
  if (count === 2) return [{ x: -0.5, y: 0, c: 0 }, { x: 0.5, y: 0, c: 1 }];
  /* three is a triangle: there is no hub, and a centre with
     two neighbours is a row */
  if (count === 3) {
    return [
      { x: 0, y: -0.578, c: 0 },
      { x: 0.5, y: 0.289, c: 1 },
      { x: -0.5, y: 0.289, c: 2 },
    ];
  }
  const pts = [];
  const R = 6;
  for (let q = -R; q <= R; q++) {
    for (let r = -R; r <= R; r++) {
      if (Math.abs(q + r) > R) continue;
      // (q - r) mod 3 colours the lattice so no two neighbours share a green
      pts.push({ x: q + r / 2, y: (r * Math.sqrt(3)) / 2, c: mod(q - r, 3) });
    }
  }
  const wx = count > 7 ? 1.35 : 1;
  const dist = (p) => Math.round(Math.hypot(p.x * wx, p.y) * 1e4);
  const angle = (p) => mod(Math.atan2(p.y, p.x) + Math.PI / 2, Math.PI * 2);
  pts.sort((a, b) => dist(a) - dist(b) || angle(a) - angle(b));
  return pts.slice(0, count);
}

// ---------- Les ressorts ----------

/* ── one spring, for everything that settles ───────────────
   Accumulate velocity toward a target, damp it, and snap when
   both the delta and the velocity fall under a threshold.

   Time is real seconds, split into small fixed substeps, so a
   dropped frame decays the same amount of energy as the two
   frames it replaced. A spring that behaves differently on a
   busy page is the hardest kind of bug to see.

   The loop parks itself the moment everything has settled:
   there is no case for a permanent requestAnimationFrame. */
function spring(v, eps) {
  return { v, vel: 0, target: v, k: 440, c: 30, m: 1, next: null, eps };
}

function aim(s, target, k, m, delay, now) {
  if (still) {
    s.v = s.target = target;
    s.vel = 0;
    s.next = null;
    return;
  }
  s.next = { target, k, m, c: 2 * Math.sqrt(k * m) * ZETA, at: now + delay };
}

let raf = 0;
let prevT = 0;
function kick() {
  if (!raf) raf = requestAnimationFrame(tick);
}

function tick(t) {
  const dt = prevT ? Math.min((t - prevT) / 1000, 0.05) : 1 / 60;
  prevT = t;
  const steps = Math.ceil(dt / (1 / 240));
  const h = dt / steps;
  let busy = false;

  for (const chip of chips) {
    for (const s of chip.springs) {
      if (s.next) {
        if (t >= s.next.at) {
          Object.assign(s, { target: s.next.target, k: s.next.k, c: s.next.c, m: s.next.m });
          s.next = null;
        } else {
          busy = true;
        }
      }
      for (let i = 0; i < steps; i++) {
        const a = (-s.k * (s.v - s.target) - s.c * s.vel) / s.m;
        s.vel += a * h;
        s.v += s.vel * h;
      }
      if (Math.abs(s.v - s.target) < s.eps && Math.abs(s.vel) < s.eps * 10) {
        s.v = s.target;
        s.vel = 0;
      } else {
        busy = true;
      }
    }
    paint(chip);
  }

  if (busy) {
    raf = requestAnimationFrame(tick);
  } else {
    raf = 0;
    prevT = 0;
  }
}

function paint(chip) {
  const { x, y, sx, sy, rot } = chip;
  chip.el.style.transform =
    `translate(${x.v.toFixed(2)}px, ${y.v.toFixed(2)}px) rotate(${rot.v.toFixed(2)}deg) ` +
    `scale(${sx.v.toFixed(4)}, ${sy.v.toFixed(4)})`;
}

// ---------- Construction de la roue ----------

function buildCluster() {
  const items = wheelTasks();
  const keys = [...items.map((t) => t.id), ADD];
  const pts = latticePoints(keys.length);

  // Où chaque pastille se trouve à l'écran avant reconstruction, pour
  // la faire glisser vers sa nouvelle place au lieu de la téléporter.
  const before = new Map();
  for (const c of chips) {
    const b = c.el.getBoundingClientRect();
    before.set(c.key, { x: b.left + b.width / 2, y: b.top + b.height / 2 });
  }

  /* the box is the cluster's own bounds plus room for the
     field to spend itself in. Derived, so moving a point in
     the table cannot push a chip off the block. */
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const MARGIN = 0.42; // in pitches: the swell, the room and the aura
  const spanX = Math.max(...xs) - minX + CHIP_RATIO + 2 * MARGIN;
  const spanY = Math.max(...ys) - minY + CHIP_RATIO + 2 * MARGIN;
  const avail = Math.min(mag.parentElement.clientWidth || 360, 460);
  const pitch = clamp(avail / spanX, 44, 104);
  const chip = pitch * CHIP_RATIO;
  const W = spanX * pitch;
  const H = spanY * pitch;

  mag.style.width = `${W}px`;
  mag.style.height = `${H}px`;
  mag.style.setProperty("--label-size", `${Math.max(9, chip * 0.15).toFixed(1)}px`);
  mag.innerHTML = "";

  const origin = mag.getBoundingClientRect();
  const addFrom = before.get(ADD);

  chips = keys.map((key, i) => {
    const p = pts[i];
    const task = items.find((t) => t.id === key);
    const cx = (p.x - minX + CHIP_RATIO / 2 + MARGIN) * pitch;
    const cy = (p.y - minY + CHIP_RATIO / 2 + MARGIN) * pitch;

    const el = document.createElement("button");
    el.type = "button";
    el.className = "mag-chip" + (key === ADD ? " add" : "");
    el.style.left = `${cx - chip / 2}px`;
    el.style.top = `${cy - chip / 2}px`;
    el.style.width = el.style.height = `${chip}px`;
    el.style.setProperty("--chip-bg", GREENS[p.c]);
    el.style.setProperty("--chip-ink", GREEN_INK[p.c]);
    el.setAttribute("aria-label", key === ADD ? "Ajouter une tâche" : task.text);

    const skin = document.createElement("span");
    skin.className = "mag-skin";
    const label = document.createElement("span");
    label.className = "mag-label";
    label.textContent = key === ADD ? "+" : task.text;
    if (key !== ADD) label.style.fontSize = `${fitLabel(task.text, chip).toFixed(1)}px`;
    skin.append(label);
    el.append(skin);
    el.addEventListener("click", () => onChip(key));
    mag.append(el);

    const c = {
      key, el, px: p.x, py: p.y, cx, cy,
      x: spring(0, 0.05), y: spring(0, 0.05),
      sx: spring(1, 0.0005), sy: spring(1, 0.0005), rot: spring(0, 0.02),
    };
    c.springs = [c.x, c.y, c.sx, c.sy, c.rot];

    /* nothing animates on first draw — a field that assembles
       itself on page load reads as a loading state rather than
       as a choice. After that, a chip that moved slides from
       where it was, and a new task grows out of the + chip. */
    const from = before.get(key) || (key !== ADD ? addFrom : null);
    if (from && !still) {
      c.x.v = from.x - (origin.left + cx);
      c.y.v = from.y - (origin.top + cy);
      if (!before.has(key)) c.sx.v = c.sy.v = 0.4;
    }
    return c;
  });

  // the cluster's middle, and the distance to the furthest
  // chip's outer edge — the radius the lean's ramp is measured in
  const hub = { x: W / 2, y: H / 2 };
  hub.r = Math.max(1, ...chips.map((c) => Math.hypot(c.cx - hub.x, c.cy - hub.y) + chip / 2));
  geo = { pitch, chip, hub };

  if (items.length === 0) {
    const hint = document.createElement("p");
    hint.className = "mag-empty";
    hint.textContent = "Ta roue est vide : touche +";
    mag.append(hint);
  }

  if (!chips.some((c) => c.key === magnetKey)) {
    magnetKey = null;
    won = false;
  }
  applyField();
}

// Taille de texte pour que le mot le plus long tienne sur une ligne
// dans la pastille, au lieu d'être coupé au milieu.
const measure = document.createElement("canvas").getContext("2d");
function fitLabel(text, chip) {
  const base = Math.max(9, chip * 0.15);
  const room = chip * 0.78; // largeur utile du disque, moins la marge intérieure
  measure.font = `700 ${base}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  const longest = Math.max(...text.split(/\s+/).map((w) => measure.measureText(w).width));
  return clamp((base * room) / Math.max(longest, 1), 8, base);
}

// ---------- Le champ magnétique ----------

function applyField() {
  const now = performance.now();
  const { pitch, chip } = geo;
  const p = PULL / 100;
  const at = chips.findIndex((c) => c.key === magnetKey);

  /* ── ONE decision, and the rest is arithmetic ────────────
     GROW is the knob. ROOM is the space the swell physically
     takes on every side — half the extra width, exactly — so
     the neighbours are never merely *near* clear of it. AURA
     is the part that is not arithmetic: the push beyond what
     the geometry demands, which is the difference between a
     cluster making room and a cluster being repelled. */
  const grow = 1.16 + 0.22 * p;
  const room = (chip * (grow - 1)) / 2;
  const aura = (3 + 9 * p) * (chip / REF_CHIP);
  const tilt = 5 * p;
  /* the neighbours give up a little size as well as ground —
     the magnet takes the mass as well as the space */
  const cower = 0.04 + 0.09 * p;

  chips.forEach((c, i) => {
    const on = i === at;
    c.el.toggleAttribute("data-on", on && !won);
    c.el.toggleAttribute("data-won", on && won);

    /* with no magnet there is no field: every chip sits on its
       own lattice point and the pushes are all zero */
    let far = 0, fall = 0, push = 0, ux = 0, uy = 0;
    if (at >= 0 && !on) {
      const dx = (c.px - chips[at].px) * pitch;
      const dy = (c.py - chips[at].py) * pitch;
      const gap = Math.hypot(dx, dy);
      /* distances divided by the pitch, so a chip one step away
         sits at far = 1 and the exponent reads a neighbourhood
         rather than a pixel count */
      far = gap / pitch;
      /* the aura, spent. exp() rather than 1/d because an
         inverse law is violent at the first neighbour and flat
         everywhere after. */
      fall = Math.exp(-(far - 1) / SPREAD);
      /* ── THE PUSH DOES NOT DECAY, and that is the fix ──────
         Decaying, two chips on the same ray out of the magnet
         CLOSED by the difference between their pushes.
         Constant, it cannot happen: nothing in the cluster ever
         compresses; gaps only open. `fall` still drives the
         stagger and the tilt, where a sense of the field
         reaching further at the front belongs. */
      push = room + aura;
      /* ── AND THE DIRECTION IS THE BEARING ──────────────────
         Straight out along the line from the magnet. */
      ux = gap ? dx / gap : 0;
      uy = gap ? dy / gap : 0;
    }

    const k = 300 + 280 * (1 - Math.min(far, 3) / 4);
    /* ── and the far ones are LATE ────────────────
       22ms a step. Fire them together and the cluster moves as
       a slab; stagger them and the shove travels outward, which
       is the difference between a layout change and a force. */
    const wait = far * 22;
    const scale = on ? grow : 1 - cower * fall;

    aim(c.x, ux * push, k, 0.9, wait, now);
    aim(c.y, uy * push, k, 0.9, wait, now);
    /* ── wide before it goes tall ────────────────
       Two springs at different stiffnesses rather than one
       scale, so the transient is anisotropic and the rest
       state is not: X leads, Y follows a beat behind. This is
       the whole of the "jelly". */
    aim(c.sx, scale, k * 1.24, 0.8, wait, now);
    aim(c.sy, scale, k * 0.86, 0.95, wait, now);
    /* shoved things tip, and only the sideways part of the
       shove tips them */
    aim(c.rot, ux * tilt * fall, k * 0.8, 1, wait, now);
    if (still) paint(c);
  });

  mag.toggleAttribute("data-landed", won && at >= 0);
  kick();
}

// ---------- La roue penche vers le doigt / la souris ----------

/* ── AND IT IS THE GROUP THAT LEANS, not the chip ──────────
   Every chip moves by one shared vector, measured from the
   cluster's own centre: the group tips toward you as one body
   and the gaps are exactly what they were. Zero at the centre
   (where the direction is undefined), full at the cluster's
   edge, gone FADE px past it. A few pixels is the whole
   specification: past about seven a chip stops acknowledging
   you and starts being something you are dragging. */
const FADE = 44;
let leanRaf = 0;
let nextLean = { x: 0, y: 0 };

function publishLean() {
  leanRaf = 0;
  mag.style.setProperty("--lx", `${nextLean.x.toFixed(2)}px`);
  mag.style.setProperty("--ly", `${nextLean.y.toFixed(2)}px`);
}

function readPointer(e) {
  const b = mag.getBoundingClientRect();
  const { x: hx, y: hy, r } = geo.hub;
  const dx = e.clientX - b.left - hx;
  const dy = e.clientY - b.top - hy;
  const d = Math.hypot(dx, dy);
  const rise = Math.min(1, d / r);
  const away = d <= r ? 1 : Math.max(0, 1 - (d - r) / FADE);
  const drawn = rise * away * (2 + (GIVE / 100) * 5);
  nextLean = drawn > 0 ? { x: (dx / (d || 1)) * drawn, y: (dy / (d || 1)) * drawn } : { x: 0, y: 0 };
  if (!leanRaf) leanRaf = requestAnimationFrame(publishLean);
}

function releaseLean() {
  nextLean = { x: 0, y: 0 };
  if (!leanRaf) leanRaf = requestAnimationFrame(publishLean);
}

if (!still) {
  document.addEventListener("pointermove", readPointer, { passive: true });
  document.addEventListener("pointerup", (e) => e.pointerType !== "mouse" && releaseLean());
  document.addEventListener("pointercancel", releaseLean);
  document.documentElement.addEventListener("pointerleave", releaseLean);
}

// ---------- Fiches et interactions ----------

function hideSheets() {
  addForm.hidden = true;
  taskSheet.hidden = true;
  result.hidden = true;
}

function clearMagnet() {
  hideSheets();
  magnetKey = null;
  won = false;
  applyField();
}

function onChip(key) {
  if (spinning) return;
  if (key === ADD) {
    if (magnetKey === ADD) return clearMagnet();
    hideSheets();
    magnetKey = ADD;
    won = false;
    addForm.hidden = false;
    input.focus();
    applyField();
    return;
  }
  // toucher la même pastille une deuxième fois la relâche
  if (magnetKey === key && !won) return clearMagnet();
  hideSheets();
  magnetKey = key;
  won = false;
  taskSheetText.textContent = tasks.find((t) => t.id === key).text;
  taskSheet.hidden = false;
  applyField();
}

function render() {
  const items = wheelTasks();
  buildCluster();
  spinBtn.disabled = spinning || items.length < 2;
  spinBtn.textContent = items.length < 2 ? "Ajoute au moins 2 tâches" : "Faire tourner";
  const done = tasks.filter((t) => t.done).length;
  doneCount.hidden = done === 0;
  doneCountText.textContent = done === 1 ? "1 tâche faite" : `${done} tâches faites`;
}

function update() {
  saveTasks();
  render();
}

function markDone(key) {
  const task = tasks.find((t) => t.id === key);
  if (task) task.done = true;
  clearMagnet();
  update();
}

addForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || spinning) return;
  tasks.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text, done: false });
  input.value = "";
  // la pastille + reste l'aimant : on peut enchaîner les ajouts
  update();
  input.focus();
});

addClose.addEventListener("click", clearMagnet);
taskDone.addEventListener("click", () => markDone(magnetKey));
taskDelete.addEventListener("click", () => {
  tasks = tasks.filter((t) => t.id !== magnetKey);
  clearMagnet();
  update();
});
doneBtn.addEventListener("click", () => markDone(magnetKey));
clearDoneBtn.addEventListener("click", () => {
  tasks = tasks.filter((t) => !t.done);
  update();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !spinning && magnetKey) clearMagnet();
});

// ---------- Le tirage ----------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function spin() {
  const items = wheelTasks();
  if (spinning || items.length < 2) return;

  hideSheets();
  spinning = true;
  won = false;
  spinBtn.disabled = true;

  // Tirage : chaque tâche a la même probabilité (Math.random est uniforme).
  const winner = items[Math.floor(Math.random() * items.length)].id;

  // L'aimant fait le tour de la roue (par angle autour du centre),
  // ralentit, et s'arrête sur la gagnante. Si elle est au centre,
  // il y saute à la fin.
  const taskChips = chips.filter((c) => c.key !== ADD);
  const hubChip = taskChips.find((c) => Math.hypot(c.px, c.py) < 1e-6);
  const angle = (c) => mod(Math.atan2(c.py, c.px) + Math.PI / 2, Math.PI * 2);
  const ring = taskChips.filter((c) => c !== hubChip).sort((a, b) => angle(a) - angle(b));
  const m = ring.length;
  const laps = Math.max(1, Math.ceil(16 / m));
  const start = Math.floor(Math.random() * m);
  const seq = [];
  const w = ring.findIndex((c) => c.key === winner);
  const hops = w >= 0 ? laps * m + mod(w - start, m) + 1 : laps * m;
  for (let j = 0; j < hops; j++) seq.push(ring[(start + j) % m].key);
  if (w < 0) seq.push(winner);

  if (!still) {
    // Des pauses de plus en plus longues : la roue ralentit.
    const weights = seq.map((_, j) => 0.12 + Math.pow(j / Math.max(1, seq.length - 1), 2.2));
    const total = weights.reduce((a, b) => a + b, 0);
    for (let j = 0; j < seq.length; j++) {
      magnetKey = seq[j];
      applyField();
      await sleep((4200 * weights[j]) / total);
    }
  }

  // La gagnante devient rose.
  magnetKey = winner;
  won = true;
  applyField();
  spinning = false;
  spinBtn.disabled = false;
  resultText.textContent = tasks.find((t) => t.id === winner).text;
  result.hidden = false;

  try {
    navigator.vibrate?.([30, 50, 80]); // Android uniquement
  } catch {}
  celebrate(chips.find((c) => c.key === winner).el);
}

spinBtn.addEventListener("click", spin);

// ---------- Confettis ----------

let particles = [];
let fxRunning = false;

function celebrate(el) {
  if (still) return;
  const dpr = window.devicePixelRatio || 1;
  fx.width = Math.round(window.innerWidth * dpr);
  fx.height = Math.round(window.innerHeight * dpr);
  fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const b = el.getBoundingClientRect();
  const x = b.left + b.width / 2;
  const y = b.top + b.height / 2;
  const colors = [PINK, PINK, "#ffc2de", ...GREENS, "#7ee2a8"];
  for (let i = 0; i < 90; i++) {
    const a = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 7;
    particles.push({
      x, y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed - 4,
      size: 5 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      color: colors[i % colors.length],
      life: 1,
    });
  }
  if (!fxRunning) {
    fxRunning = true;
    requestAnimationFrame(stepParticles);
  }
}

function stepParticles() {
  fxCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  for (const p of particles) {
    p.vy += 0.25; // gravité
    p.vx *= 0.98;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    p.life -= 0.012;
    fxCtx.save();
    fxCtx.globalAlpha = Math.max(p.life, 0);
    fxCtx.translate(p.x, p.y);
    fxCtx.rotate(p.rot);
    fxCtx.fillStyle = p.color;
    fxCtx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    fxCtx.restore();
  }
  particles = particles.filter((p) => p.life > 0 && p.y < window.innerHeight + 20);
  if (particles.length) {
    requestAnimationFrame(stepParticles);
  } else {
    fxRunning = false;
    fxCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }
}

// ---------- Démarrage ----------

let resizeRaf = 0;
window.addEventListener("resize", () => {
  if (resizeRaf || spinning) return;
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = 0;
    chips = []; // pas de glissement : on redessine simplement
    buildCluster();
  });
});

render();
