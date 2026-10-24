// Counts 1 → 100 one step at a time, never running ahead of real startup work.
const n = document.getElementById('n');
const fill = document.getElementById('fill');
const status = document.getElementById('status');
let shown = 1;
let target = 1;
let finished = false;

window.umbra.on('splash:progress', ({ pct, label }) => {
  target = Math.max(target, pct);
  if (label) status.textContent = label;
});

function tick() {
  if (shown < target) {
    shown += 1;
    n.textContent = shown;
    fill.style.width = `${shown}%`;
  }
  if (shown >= 100 && !finished) {
    finished = true;
    setTimeout(() => {
      document.getElementById('card').classList.add('out');
      setTimeout(() => window.umbra.splashDone(), 420);
    }, 350);
    return;
  }
  setTimeout(tick, shown < target ? 18 : 40);
}
tick();
