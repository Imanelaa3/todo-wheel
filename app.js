// Roue des tâches — todo liste + roue aléatoire.
// Les tâches sont sauvegardées dans le localStorage du navigateur.

const STORAGE_KEY = "todo-wheel-tasks";

// Nuances de vert de la roue, et le rose complémentaire pour la part gagnante
// (vert ≈ 148° sur le cercle chromatique, rose ≈ 328° : 180° d'écart).
const GREENS = ["#0f5132", "#198754", "#2fbf71", "#7ee2a8"];
const GREEN_TEXT = ["#ffffff", "#ffffff", "#06301c", "#06301c"];
const PINK = "#ff4fa3";
const RIM = "#0b3d26";

const SIZE = 400; // taille logique du canvas
const CENTER = SIZE / 2;
const RADIUS = CENTER - 26; // marge pour la part qui "sort" de la roue
const POP = 14; // distance de sortie de la part gagnante

const form = document.getElementById("task-form");
const input = document.getElementById("task-input");
const list = document.getElementById("task-list");
const emptyMsg = document.getElementById("empty-msg");
const clearDoneBtn = document.getElementById("clear-done");
const canvas = document.getElementById("wheel");
const ctx = canvas.getContext("2d");
const pointer = document.querySelector(".pointer");
const spinBtn = document.getElementById("spin-btn");
const result = document.getElementById("result");
const resultText = document.getElementById("result-text");
const doneBtn = document.getElementById("done-btn");
const fx = document.getElementById("fx");
const fxCtx = fx.getContext("2d");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let tasks = loadTasks();
let rotation = 0; // angle actuel de la roue, en radians
let spinning = false;
let pickedId = null;
let highlight = 0; // 0 → 1 : progression de la mise en avant de la part gagnante

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

function render() {
  // Si la tâche tirée a été cochée ou supprimée, on retire la mise en avant.
  if (pickedId && !wheelTasks().some((t) => t.id === pickedId)) {
    pickedId = null;
    highlight = 0;
    result.hidden = true;
  }

  list.innerHTML = "";
  for (const task of tasks) {
    const li = document.createElement("li");
    li.classList.toggle("done", task.done);
    li.classList.toggle("picked", task.id === pickedId);

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.done;
    checkbox.setAttribute("aria-label", "Terminée");
    checkbox.addEventListener("change", () => {
      if (spinning) {
        checkbox.checked = task.done;
        return;
      }
      task.done = checkbox.checked;
      update();
    });

    const label = document.createElement("span");
    label.textContent = task.text;

    const del = document.createElement("button");
    del.className = "icon";
    del.textContent = "✕";
    del.setAttribute("aria-label", "Supprimer");
    del.addEventListener("click", () => {
      if (spinning) return;
      tasks = tasks.filter((t) => t.id !== task.id);
      update();
    });

    li.append(checkbox, label, del);
    list.append(li);
  }
  emptyMsg.hidden = tasks.length > 0;
  clearDoneBtn.hidden = !tasks.some((t) => t.done);
  spinBtn.disabled = spinning || wheelTasks().length < 2;
  drawWheel();
}

function update() {
  saveTasks();
  render();
}

// ---------- Dessin de la roue ----------

function setupCanvas(c, width, height) {
  const dpr = window.devicePixelRatio || 1;
  c.width = Math.round(width * dpr);
  c.height = Math.round(height * dpr);
  c.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
}

// Couleur de la part i : on alterne les verts, sans que la dernière part
// ait la même couleur que la première (elles se touchent).
function sliceColorIndex(i, n) {
  if (n > 1 && i === n - 1 && i % GREENS.length === 0) return 2;
  return i % GREENS.length;
}

function mixColor(a, b, t) {
  t = Math.max(0, Math.min(1, t));
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

function drawSlice(task, i, n, slice) {
  const isWinner = task.id === pickedId;
  const p = isWinner ? highlight : 0;
  const start = rotation + i * slice;
  const mid = start + slice / 2;
  const colorIndex = sliceColorIndex(i, n);
  const offset = p * POP;

  ctx.save();
  ctx.translate(CENTER + Math.cos(mid) * offset, CENTER + Math.sin(mid) * offset);
  // Les autres parts s'estompent pendant la mise en avant.
  if (!isWinner && pickedId) ctx.globalAlpha = 1 - 0.35 * Math.min(highlight, 1);

  const r = RADIUS * (1 + 0.05 * p);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, r, start, start + slice);
  ctx.closePath();
  if (isWinner) {
    ctx.shadowColor = PINK;
    ctx.shadowBlur = 30 * Math.min(p, 1);
  }
  ctx.fillStyle = mixColor(GREENS[colorIndex], PINK, p);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Texte au milieu de la part
  ctx.rotate(mid);
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle = p > 0.5 ? "#ffffff" : GREEN_TEXT[colorIndex];
  ctx.font = `bold ${15 + 2 * Math.min(p, 1)}px system-ui, sans-serif`;
  const text = task.text.length > 18 ? task.text.slice(0, 17) + "…" : task.text;
  ctx.fillText(text, r - 16, 0);
  ctx.restore();
}

function drawWheel() {
  const items = wheelTasks();
  ctx.clearRect(0, 0, SIZE, SIZE);

  // Bord extérieur
  ctx.beginPath();
  ctx.arc(CENTER, CENTER, RADIUS + 8, 0, Math.PI * 2);
  ctx.fillStyle = RIM;
  ctx.fill();

  if (items.length === 0) {
    ctx.beginPath();
    ctx.arc(CENTER, CENTER, RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = GREENS[3];
    ctx.fill();
    ctx.fillStyle = GREEN_TEXT[3];
    ctx.font = "bold 18px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Ajoute des tâches", CENTER, CENTER);
    return;
  }

  const n = items.length;
  const slice = (Math.PI * 2) / n;
  let winner = -1;
  items.forEach((task, i) => {
    if (task.id === pickedId) winner = i;
    else drawSlice(task, i, n, slice);
  });

  // Picots sur le bord, à chaque séparation de part
  for (let i = 0; i < n; i++) {
    const a = rotation + i * slice;
    ctx.beginPath();
    ctx.arc(CENTER + Math.cos(a) * (RADIUS + 1), CENTER + Math.sin(a) * (RADIUS + 1), 4, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = RIM;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // La part gagnante est dessinée en dernier, par-dessus les autres.
  if (winner >= 0) drawSlice(items[winner], winner, n, slice);

  // Moyeu central
  ctx.beginPath();
  ctx.arc(CENTER, CENTER, 26, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = RIM;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(CENTER, CENTER, 8, 0, Math.PI * 2);
  ctx.fillStyle = pickedId ? PINK : GREENS[1];
  ctx.fill();
}

// ---------- Animation de la roue ----------

const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOutBack = (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);

function mod(a, n) {
  return ((a % n) + n) % n;
}

// Joue une animation de `duration` ms en appelant step(t) avec t de 0 à 1.
function animate(duration, step) {
  return new Promise((resolve) => {
    const startTime = performance.now();
    function frame(now) {
      const t = Math.min((now - startTime) / duration, 1);
      step(t);
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}

// Index de la part qui se trouve sous le pointeur (en haut, angle -π/2).
function sliceUnderPointer(slice) {
  return Math.floor(mod(-Math.PI / 2 - rotation, Math.PI * 2) / slice);
}

function tickPointer() {
  if (reducedMotion || !pointer.animate) return;
  pointer.animate(
    [{ transform: "rotate(-24deg)" }, { transform: "rotate(0deg)" }],
    { duration: 140, easing: "ease-out" }
  );
}

async function spin() {
  const items = wheelTasks();
  if (spinning || items.length < 2) return;

  spinning = true;
  pickedId = null;
  highlight = 0;
  result.hidden = true;
  render();

  // Tirage : chaque tâche a la même probabilité (Math.random est uniforme).
  const winnerIndex = Math.floor(Math.random() * items.length);
  const slice = (Math.PI * 2) / items.length;
  // Décalage aléatoire dans la part, pour ne pas toujours tomber pile au centre.
  const jitter = (Math.random() - 0.5) * slice * 0.6;
  const target = -Math.PI / 2 - (winnerIndex * slice + slice / 2) + jitter;
  // Petit dépassement à la fin, qui reste dans la part gagnante.
  const overshoot = slice * 0.12;

  let lastIndex = sliceUnderPointer(slice);
  const onFrame = () => {
    const index = sliceUnderPointer(slice);
    if (index !== lastIndex) {
      lastIndex = index;
      tickPointer();
    }
    drawWheel();
  };

  if (reducedMotion) {
    const from = rotation;
    const delta = Math.PI * 2 + mod(target - from, Math.PI * 2);
    await animate(1200, (t) => {
      rotation = from + delta * easeOutQuart(t);
      onFrame();
    });
  } else {
    // 1. Élan : la roue recule un peu avant de partir.
    const from = rotation;
    await animate(280, (t) => {
      rotation = from - 0.25 * easeInOut(t);
      onFrame();
    });
    // 2. Rotation rapide qui ralentit longuement.
    const launch = rotation;
    const turns = 6 + Math.floor(Math.random() * 3);
    const delta = turns * Math.PI * 2 + mod(target - launch, Math.PI * 2) + overshoot;
    const duration = 4500 + Math.random() * 1000;
    await animate(duration, (t) => {
      rotation = launch + delta * easeOutQuart(t);
      onFrame();
    });
    // 3. Petit retour en arrière pour se caler.
    const settleFrom = rotation;
    await animate(450, (t) => {
      rotation = settleFrom - overshoot * easeInOut(t);
      onFrame();
    });
  }

  rotation = mod(rotation, Math.PI * 2);
  spinning = false;
  const winner = items[winnerIndex];
  pickedId = winner.id;
  resultText.textContent = winner.text;
  result.hidden = false;
  render();

  try {
    navigator.vibrate?.([30, 50, 80]); // Android uniquement
  } catch {}

  celebrate(winnerIndex, slice);

  // 4. Mise en avant : la part devient rose et sort de la roue avec un rebond.
  await animate(reducedMotion ? 1 : 750, (t) => {
    highlight = easeOutBack(t);
    drawWheel();
  });
  highlight = 1;
  drawWheel();
}

// ---------- Confettis ----------

let particles = [];
let fxRunning = false;

function celebrate(winnerIndex, slice) {
  if (reducedMotion) return;
  setupCanvas(fx, window.innerWidth, window.innerHeight);

  // Position à l'écran de la part gagnante
  const rect = canvas.getBoundingClientRect();
  const scale = rect.width / SIZE;
  const mid = rotation + winnerIndex * slice + slice / 2;
  const x = rect.left + (CENTER + Math.cos(mid) * RADIUS * 0.7) * scale;
  const y = rect.top + (CENTER + Math.sin(mid) * RADIUS * 0.7) * scale;

  const colors = [PINK, PINK, "#ffc2de", ...GREENS];
  for (let i = 0; i < 90; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 7;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 4,
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

// ---------- Événements ----------

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || spinning) return;
  tasks.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text, done: false });
  input.value = "";
  update();
});

clearDoneBtn.addEventListener("click", () => {
  if (spinning) return;
  tasks = tasks.filter((t) => !t.done);
  update();
});

doneBtn.addEventListener("click", () => {
  const task = tasks.find((t) => t.id === pickedId);
  if (task) task.done = true;
  update();
});

spinBtn.addEventListener("click", spin);
canvas.addEventListener("click", spin);

setupCanvas(canvas, SIZE, SIZE);
render();
