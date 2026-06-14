// === Vista pública: lee voluntarios desde Supabase y renderiza la tabla ===
// La presentación es idéntica al diseño original; sólo cambia el origen de datos
// (Supabase) y que la antigüedad / premios se calculan en vivo.
import { supabase } from './supabase.js';
import { calcular } from './calc.js';

let REGISTROS = [];   // datos calculados, listos para mostrar
let selected = null;

function parseFechaProx(s) {
  if (!s) return null;
  const [d, m, y] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

async function cargar() {
  const { data, error } = await supabase
    .from('voluntarios')
    .select('numero, nombre, fecha_ingreso, abono_dias, ultimo_premio, obs')
    .eq('activo', true)
    .order('numero', { ascending: true });

  const status = document.getElementById('status');
  if (error) {
    status.className = 'error-box';
    status.textContent = 'No se pudieron cargar los datos: ' + error.message;
    return;
  }

  const hoy = new Date();
  REGISTROS = data.map((v) => {
    const c = calcular(v, hoy);
    return {
      n: v.numero,
      nombre: v.nombre,
      tiempo: c.tiempo || '—',
      ultimoPremio: c.ultimoPremio,
      fechaProx: c.fechaProx,
      proxPremio: c.proxPremio,
      vencido: c.vencido,
      anios: c.anios ?? 0,
      obs: v.obs || '',
    };
  });

  status.style.display = 'none';
  renderStats();
  render();
}

function renderStats() {
  const total = REGISTROS.length;
  const vencidos = REGISTROS.filter((b) => b.vencido).length;
  const now = new Date();
  const oy = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
  const proxYear = REGISTROS.filter((b) => {
    const d = parseFechaProx(b.fechaProx);
    return d && d >= now && d <= oy;
  }).length;

  document.getElementById('stats').innerHTML = [
    { l: 'Total Voluntarios', v: total, c: 'var(--granate)' },
    { l: 'Premios Vencidos', v: vencidos, c: '#C0392B' },
    { l: 'Premios próx. 12 meses', v: proxYear, c: 'var(--gold)' },
  ].map((s) => `<div class="stat-card" style="border-left:4px solid ${s.c}"><div class="val" style="color:${s.c}">${s.v}</div><div class="lbl">${s.l}</div></div>`).join('');
}

function render() {
  const q = document.getElementById('search').value.toLowerCase();
  const f = document.getElementById('filter').value;
  const s = document.getElementById('sortBy').value;

  let list = REGISTROS.filter((b) => {
    if (!b.nombre.toLowerCase().includes(q)) return false;
    if (f === 'vencidos') return b.vencido;
    if (f === 'sinPremio') return b.ultimoPremio === null;
    if (f === 'conObs') return b.obs && b.obs.length > 0;
    return true;
  });

  list.sort((a, b) => {
    if (s === 'nombre') return a.nombre.localeCompare(b.nombre);
    if (s === 'antiguedad') return b.anios - a.anios;
    return a.n - b.n;
  });

  document.getElementById('count').textContent =
    list.length + ' voluntario' + (list.length !== 1 ? 's' : '') + ' encontrado' + (list.length !== 1 ? 's' : '');

  document.getElementById('tbody').innerHTML = list.map((b) => {
    const v = b.vencido;
    const sel = selected === b.n;
    return `<tr class="${sel ? 'selected' : ''}" data-n="${b.n}"><td>${b.n}</td><td style="font-weight:600">${b.nombre}</td><td style="font-size:12px;color:#555">${b.tiempo}</td><td style="text-align:center">${b.ultimoPremio !== null ? `<span class="badge-premio">${b.ultimoPremio}</span>` : `<span class="empty">—</span>`}</td><td>${b.fechaProx ? `<div class="fecha-cell"><span style="font-size:12px">${b.fechaProx}</span>${v ? '<span class="badge-vencido">VENCIDO</span>' : ''}</div>` : `<span class="empty">—</span>`}</td><td style="text-align:center">${b.proxPremio != null ? `<span class="badge-prox">${b.proxPremio}</span>` : `<span class="empty">—</span>`}</td><td class="${b.obs ? 'obs' : 'obs-empty'}">${b.obs || '—'}</td></tr>`;
  }).join('');

  document.querySelectorAll('#tbody tr').forEach((tr) => {
    tr.addEventListener('click', () => {
      const n = Number(tr.dataset.n);
      selected = selected === n ? null : n;
      render();
    });
  });
}

document.getElementById('search').addEventListener('input', render);
document.getElementById('filter').addEventListener('change', render);
document.getElementById('sortBy').addEventListener('change', render);

cargar();
