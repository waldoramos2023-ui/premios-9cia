// === Panel de administración ===
// Login con Supabase Auth, verificación de admin (tabla bomba_admins vía RLS),
// importación de la planilla Excel/CSV con previsualización y guardado (upsert).
// La planilla es la fuente de verdad: se cargan sus columnas tal cual.
import { supabase } from './supabase.js';
import { serialAISO, formatearISO, esVencido, calcularAntiguedad } from './calc.js';
import * as XLSX from 'https://esm.sh/xlsx@0.18.5';

const $ = (id) => document.getElementById(id);
const loginView = $('login-view');
const adminView = $('admin-view');
const boot = $('boot');

let filasImportadas = [];

// ---------- UI ----------
function toast(msg, isErr = false) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isErr ? ' err' : '');
  setTimeout(() => { t.className = 'toast'; }, 3200);
}
function loginMsg(msg, ok = false) {
  $('login-msg').innerHTML = msg ? `<div class="msg ${ok ? 'msg-ok' : 'msg-error'}">${msg}</div>` : '';
}

// ---------- Sesión ----------
async function esAdmin(email) {
  const { data, error } = await supabase
    .from('bomba_admins')
    .select('email')
    .eq('email', email.toLowerCase())
    .maybeSingle();
  if (error) return false;
  return !!data;
}

async function refrescarVista() {
  boot.style.display = 'none';
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    loginView.style.display = 'block';
    adminView.style.display = 'none';
    return;
  }

  const email = session.user.email;
  if (!(await esAdmin(email))) {
    loginView.style.display = 'block';
    adminView.style.display = 'none';
    loginMsg(`La cuenta <b>${email}</b> no está autorizada para administrar. Solicita acceso al encargado.`);
    await supabase.auth.signOut();
    return;
  }

  loginView.style.display = 'none';
  adminView.style.display = 'block';
  $('who-email').textContent = email;
  await actualizarConteo();
}

async function actualizarConteo() {
  const { count } = await supabase
    .from('voluntarios')
    .select('numero', { count: 'exact', head: true });
  $('vol-count').textContent = (count ?? 0) + ' voluntarios registrados';
}

// ---------- Login ----------
$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  loginMsg('');
  $('login-btn').disabled = true;
  $('login-btn').textContent = 'Ingresando…';
  const email = $('email').value.trim();
  const password = $('password').value;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  $('login-btn').disabled = false;
  $('login-btn').textContent = 'Ingresar';
  if (error) {
    loginMsg('No se pudo iniciar sesión: ' + error.message);
    return;
  }
  await refrescarVista();
});

$('logout-btn').addEventListener('click', async () => {
  await supabase.auth.signOut();
  filasImportadas = [];
  $('import-result').style.display = 'none';
  await refrescarVista();
});

// ---------- Lectura de la planilla ----------
function normKey(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

// Mapea cada campo de la BD a los posibles nombres de columna de la planilla.
const ALIAS = {
  numero: ['n', 'no', 'num', 'numero', 'nro'],
  nombre: ['nombre', 'voluntario', 'nombres'],
  tiempo_actual: ['tiempoactual', 'antiguedad', 'antiguedadefectiva', 'tiempo'],
  fecha_ingreso: ['ingreso1', 'fechaingreso', 'ingreso'],
  salida_1: ['salida1', 'salida'],
  ingreso_2: ['ingreso2'],
  salida_2: ['salida2'],
  ingreso_3: ['ingreso3'],
  salida_3: ['salida3'],
  fecha_prem_ant: ['fechapremant', 'fechapremioanterior', 'fechapremioant'],
  premio_ant: ['premioant', 'ultimopremio', 'ultpremio', 'premioanterior'],
  fecha_prox_premio: ['fechaproxpremio', 'fechaproximopremio', 'proximopremiofecha'],
  prox_premio: ['proxpremio', 'proximopremio', 'aniosproxpremio'],
  obs: ['observaciones', 'obs', 'observacion'],
};

function mapearCabeceras(headerRow) {
  const map = {};
  headerRow.forEach((h, i) => {
    const k = normKey(h);
    for (const [campo, alias] of Object.entries(ALIAS)) {
      if (map[campo] == null && alias.includes(k)) { map[campo] = i; break; }
    }
  });
  return map;
}

// Convierte una celda de fecha (serial de Excel o texto) a ISO.
function celdaAFechaISO(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return serialAISO(v);
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

function parseEntero(v) {
  if (v == null || v === '') return null;
  const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10);
  return Number.isNaN(n) ? null : n;
}

function texto(v) {
  return v == null ? '' : String(v).trim();
}

function procesarLibro(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, blankrows: false });
  if (!rows.length) throw new Error('El archivo está vacío.');

  const map = mapearCabeceras(rows[0]);
  if (map.numero == null || map.nombre == null) {
    throw new Error('No se reconocieron las columnas. Se requiere al menos N° y Nombre.');
  }

  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((c) => c == null || c === '')) continue;

    const numero = parseEntero(r[map.numero]);
    const nombre = texto(r[map.nombre]);
    const reg = {
      numero,
      nombre,
      tiempo_actual: map.tiempo_actual != null ? texto(r[map.tiempo_actual]) : '',
      fecha_ingreso: map.fecha_ingreso != null ? celdaAFechaISO(r[map.fecha_ingreso]) : null,
      salida_1: map.salida_1 != null ? celdaAFechaISO(r[map.salida_1]) : null,
      ingreso_2: map.ingreso_2 != null ? celdaAFechaISO(r[map.ingreso_2]) : null,
      salida_2: map.salida_2 != null ? celdaAFechaISO(r[map.salida_2]) : null,
      ingreso_3: map.ingreso_3 != null ? celdaAFechaISO(r[map.ingreso_3]) : null,
      salida_3: map.salida_3 != null ? celdaAFechaISO(r[map.salida_3]) : null,
      fecha_prem_ant: map.fecha_prem_ant != null ? celdaAFechaISO(r[map.fecha_prem_ant]) : null,
      premio_ant: map.premio_ant != null ? parseEntero(r[map.premio_ant]) : null,
      fecha_prox_premio: map.fecha_prox_premio != null ? celdaAFechaISO(r[map.fecha_prox_premio]) : null,
      prox_premio: map.prox_premio != null ? parseEntero(r[map.prox_premio]) : null,
      obs: map.obs != null ? texto(r[map.obs]) : '',
    };

    let error = null;
    if (numero == null) error = 'N° inválido';
    else if (!nombre) error = 'Nombre vacío';
    reg._error = error;

    out.push(reg);
  }
  if (!out.length) throw new Error('No se encontraron filas de datos.');
  return out;
}

async function previsualizar(filas) {
  const { data: existentes } = await supabase.from('voluntarios').select('numero');
  const setExist = new Set((existentes || []).map((e) => e.numero));

  filas.forEach((f) => {
    if (f._error) f._estado = 'error';
    else f._estado = setExist.has(f.numero) ? 'update' : 'new';
  });

  filasImportadas = filas;
  renderPreview();
}

function renderPreview() {
  const nuevos = filasImportadas.filter((f) => f._estado === 'new').length;
  const upd = filasImportadas.filter((f) => f._estado === 'update').length;
  const errs = filasImportadas.filter((f) => f._estado === 'error').length;

  $('import-summary').innerHTML = `
    <div><b style="color:#1e8449">${nuevos}</b> nuevos</div>
    <div><b style="color:#2471a3">${upd}</b> actualizaciones</div>
    <div><b style="color:#C0392B">${errs}</b> con error</div>`;

  const hoy = new Date();
  const filasHtml = filasImportadas.map((f) => {
    const tag = f._estado === 'error'
      ? '<span class="row-tag tag-err">ERROR</span>'
      : f._estado === 'new'
        ? '<span class="row-tag tag-new">NUEVO</span>'
        : '<span class="row-tag tag-upd">ACTUALIZA</span>';
    const fechaProx = formatearISO(f.fecha_prox_premio);
    const venc = esVencido(f.fecha_prox_premio, hoy);
    // Mostrar la antigüedad recalculada (como en la vista pública); respaldo al texto crudo.
    const antig = calcularAntiguedad(f, hoy);
    const tiempo = antig ? antig.texto : (f.tiempo_actual || '—');
    return `<tr class="${f._estado === 'error' ? 'row-error' : f._estado === 'new' ? 'row-new' : ''}">
      <td>${tag}</td>
      <td>${f.numero ?? '—'}</td>
      <td>${f.nombre || (f._error || '—')}</td>
      <td>${tiempo}</td>
      <td style="text-align:center">${f.premio_ant ?? '—'}</td>
      <td>${fechaProx ? fechaProx + (venc ? ' ⚠️' : '') : '—'}</td>
      <td style="text-align:center">${f.prox_premio ?? '—'}</td>
      <td>${f.obs || ''}</td>
    </tr>`;
  }).join('');

  $('preview-table').innerHTML = `
    <thead><tr>
      <th>Estado</th><th>N°</th><th>Nombre</th><th>Antigüedad</th>
      <th>Últ. Premio</th><th>Próx. Premio (fecha)</th><th>Años</th><th>Obs</th>
    </tr></thead><tbody>${filasHtml}</tbody>`;

  $('save-btn').disabled = (nuevos + upd) === 0;
  $('import-result').style.display = 'block';
}

async function leerArchivo(file) {
  try {
    const buf = await file.arrayBuffer();
    const filas = procesarLibro(buf);
    await previsualizar(filas);
    toast(`Archivo leído: ${filas.length} filas`);
  } catch (err) {
    toast(err.message, true);
  }
}

// Guardar (upsert)
$('save-btn').addEventListener('click', async () => {
  const validos = filasImportadas
    .filter((f) => f._estado !== 'error')
    .map((f) => ({
      numero: f.numero,
      nombre: f.nombre,
      tiempo_actual: f.tiempo_actual || '',
      fecha_ingreso: f.fecha_ingreso,
      salida_1: f.salida_1,
      ingreso_2: f.ingreso_2,
      salida_2: f.salida_2,
      ingreso_3: f.ingreso_3,
      salida_3: f.salida_3,
      fecha_prem_ant: f.fecha_prem_ant,
      premio_ant: f.premio_ant,
      fecha_prox_premio: f.fecha_prox_premio,
      prox_premio: f.prox_premio,
      obs: f.obs || '',
      activo: true,
    }));
  if (!validos.length) return;

  $('save-btn').disabled = true;
  $('save-btn').textContent = 'Guardando…';
  const { error } = await supabase.from('voluntarios').upsert(validos, { onConflict: 'numero' });
  $('save-btn').textContent = 'Guardar cambios';
  $('save-btn').disabled = false;

  if (error) {
    toast('Error al guardar: ' + error.message, true);
    return;
  }
  toast(`✓ ${validos.length} voluntarios guardados`);
  $('import-result').style.display = 'none';
  filasImportadas = [];
  await actualizarConteo();
});

$('cancel-btn').addEventListener('click', () => {
  $('import-result').style.display = 'none';
  filasImportadas = [];
});

// Dropzone
const dz = $('dropzone');
const fileInput = $('file-input');
dz.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => { if (fileInput.files[0]) leerArchivo(fileInput.files[0]); });
dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
dz.addEventListener('dragleave', () => dz.classList.remove('over'));
dz.addEventListener('drop', (e) => {
  e.preventDefault();
  dz.classList.remove('over');
  if (e.dataTransfer.files[0]) leerArchivo(e.dataTransfer.files[0]);
});

refrescarVista();
