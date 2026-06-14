// Genera el SQL de carga inicial de voluntarios a partir de los datos del HTML original.
// La fecha de ingreso se deriva: fecha_ingreso = 03-06-2026 (última actualización) - antigüedad efectiva.
// Así el cálculo automático parte desde la antigüedad real registrada.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '..', 'bomba-yungay-html.html'), 'utf8');

// Extraer el arreglo DATA del HTML original
const m = html.match(/const DATA=(\[.*?\]);function parseDate/s);
if (!m) throw new Error('No se encontró el arreglo DATA');
const DATA = new Function('return ' + m[1])();

// Fecha base = última actualización declarada en el footer
const BASE = { y: 2026, mo: 6, d: 3 };

function parseTiempo(t) {
  if (!t) return null;
  const ya = t.match(/(\d+)\s*años?/);
  const me = t.match(/(\d+)\s*meses?/);
  const di = t.match(/(\d+)\s*d[ií]as?/);
  return {
    years: ya ? +ya[1] : 0,
    months: me ? +me[1] : 0,
    days: di ? +di[1] : 0,
  };
}

function fechaIngreso(t) {
  const p = parseTiempo(t);
  if (!p) return null;
  const d = new Date(Date.UTC(BASE.y, BASE.mo - 1, BASE.d));
  d.setUTCFullYear(d.getUTCFullYear() - p.years);
  d.setUTCMonth(d.getUTCMonth() - p.months);
  d.setUTCDate(d.getUTCDate() - p.days);
  return d.toISOString().slice(0, 10);
}

const esc = (s) => String(s).replace(/'/g, "''");

const rows = DATA.map((v) => {
  const fi = fechaIngreso(v.tiempo);
  const fiSql = fi ? `'${fi}'` : 'null';
  const up = v.ultimoPremio == null ? 'null' : v.ultimoPremio;
  return `(${v.n}, '${esc(v.nombre)}', ${fiSql}, 0, ${up}, '${esc(v.obs || '')}')`;
});

const sql =
  `insert into public.voluntarios (numero, nombre, fecha_ingreso, abono_dias, ultimo_premio, obs) values\n` +
  rows.join(',\n') +
  `\non conflict (numero) do update set\n` +
  `  nombre = excluded.nombre,\n` +
  `  fecha_ingreso = excluded.fecha_ingreso,\n` +
  `  ultimo_premio = excluded.ultimo_premio,\n` +
  `  obs = excluded.obs;`;

console.log(sql);
