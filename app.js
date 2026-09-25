// Roue des tâches — todo liste + roue aléatoire.
// Les tâches sont sauvegardées dans le localStorage du navigateur.

const STORAGE_KEY = "todo-wheel-tasks";
const COLORS = ["#6c4cf1", "#f1a94c", "#4cc3f1", "#f14c7a", "#4cf19a", "#f1e14c", "#a14cf1", "#4c6cf1"];

const form = document.getElementById("task-form");
const input = document.getElementById("task-input");
const list = document.getElementById("task-list");
const emptyMsg = document.getElementById("empty-msg");
const clearDoneBtn = document.getElementById("clear-done");
const canvas = document.getElementById("wheel");
const ctx = canvas.getContext("2d");
const spinBtn = document.getElementById("spin-btn");
const result = document.getElementById("result");

let tasks = loadTasks();
let rotation = 0; // angle actuel de la roue, en radians
let spinning = false;
let pickedId = null;

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

function drawWheel() {
  const items = wheelTasks();
  const size = canvas.width;
  const center = size / 2;
  const radius = center - 10;
  ctx.clearRect(0, 0, size, size);

  if (items.length === 0) {
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#e3def2";
    ctx.fill();
    ctx.fillStyle = "#7a7390";
    ctx.font = "18px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Ajoute des tâches", center, center);
    return;
  }

  const slice = (Math.PI * 2) / items.length;
  items.forEach((task, i) => {
    const start = rotation + i * slice;
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.arc(center, center, radius, start, start + slice);
    ctx.closePath();
    ctx.fillStyle = COLORS[i % COLORS.length];
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Texte au milieu de la part
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(start + slice / 2);
    ctx.textAlign = "right";
    ctx.fillStyle = "#fff";
    ctx.font = "bold 15px system-ui, sans-serif";
    const text = task.text.length > 18 ? task.text.slice(0, 17) + "…" : task.text;
    ctx.fillText(text, radius - 12, 5);
    ctx.restore();
  });

  ctx.beginPath();
  ctx.arc(center, center, 18, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
}

function spin() {
  const items = wheelTasks();
  if (spinning || items.length < 2) return;

  spinning = true;
  pickedId = null;
  result.textContent = "";
  render();

  // Tirage : chaque tâche a la même probabilité (Math.random est uniforme).
  const winnerIndex = Math.floor(Math.random() * items.length);
  const slice = (Math.PI * 2) / items.length;
  // Le pointeur est en haut (angle -π/2). On veut que le milieu de la part gagnante y arrive,
  // avec un petit décalage aléatoire pour ne pas toujours tomber pile au centre.
  const jitter = (Math.random() - 0.5) * slice * 0.8;
  const target = -Math.PI / 2 - (winnerIndex * slice + slice / 2) + jitter;
  const extraTurns = 5 + Math.floor(Math.random() * 3);
  const startRotation = rotation;
  const delta = extraTurns * Math.PI * 2 + mod(target - startRotation, Math.PI * 2);

  const duration = 4000;
  const startTime = performance.now();

  function frame(now) {
    const t = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3); // ralentit progressivement
    rotation = startRotation + delta * eased;
    drawWheel();
    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      rotation = mod(rotation, Math.PI * 2);
      spinning = false;
      pickedId = items[winnerIndex].id;
      result.textContent = `👉 À toi de jouer : ${items[winnerIndex].text}`;
      render();
    }
  }
  requestAnimationFrame(frame);
}

function mod(a, n) {
  return ((a % n) + n) % n;
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  tasks.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text, done: false });
  input.value = "";
  update();
});

clearDoneBtn.addEventListener("click", () => {
  tasks = tasks.filter((t) => !t.done);
  update();
});

spinBtn.addEventListener("click", spin);

render();
