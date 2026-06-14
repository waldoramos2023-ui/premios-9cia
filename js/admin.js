// === Panel de administración ===
// Login con Supabase Auth, verificación de admin (tabla bomba_admins vía RLS),
// importación de Excel/CSV con previsualización y guardado (upsert) en la BD.
import { supabase } from './supabase.js';
import { calcular } from './calc.js';
import * as XLSX from 'https://esm.sh/xlsx@0.18.5';

const $ = (id) => document.getElementById(id);
const loginView = $('login-view');
const adminView = $('admin-view');
const boot = $('boot');

let filasImportadas = []; // { numero, nombre, fecha_ingreso, abono_dias, ultimo_premio, obs, _estado, _error }

// ---------- Utilidades de UI ----------
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
    // Sesión válida pero sin permiso de admin
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

// ---------- Importación de archivo ----------
function normKey(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

const ALIAS = {
  numero: ['n', 'no', 'num', 'numero', 'nro'],
  nombre: ['nombre', 'voluntario', 'nombres'],
  fecha_ingreso: ['fechaingreso', 'fechadeingreso', 'ingreso', 'fecha'],
  abono_dias: ['abonodias', 'abono', 'abonos', 'diasabono'],
  ultimo_premio: ['ultimopremio', 'premio', 'ultpremio', 'ultimopremioaos'],
  obs: ['obs', 'observacion', 'observaciones'],
};

function mapearCabeceras(headerRow) {
  const map = {};
  headerRow.forEach((h, i) => {
    const k = normKey(h);
    for (const [campo, alias] of Object.entries(ALIAS)) {
      if (alias.includes(k)) { map[campo] = i; break; }
    }
  });
  return map;
}

function serialAFecha(n) {
  // Excel: día 0 = 1899-12-30 (UTC)
  const ms = Math.round((n - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function parseFecha(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return serialAFecha(v);
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

function procesarLibro(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, blankrows: false });
  if (!rows.length) throw new Error('El archivo está vacío.');

  const map = mapearCabeceras(rows[0]);
  if (map.numero == null || map.nombre == null || map.fecha_ingreso == null) {
    throw new Error('Faltan columnas obligatorias. Se requieren al menos: N°, Nombre y Fecha Ingreso.');
  }

  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((c) => c == null || c === '')) continue;
    const numero = parseEntero(r[map.numero]);
    const nombre = r[map.nombre] != null ? String(r[map.nombre]).trim() : '';
    const fecha_ingreso = parseFecha(r[map.fecha_ingreso]);
    const abono_dias = map.abono_dias != null ? (parseEntero(r[map.abono_dias]) ?? 0) : 0;
    const ultimo_premio = map.ultimo_premio != null ? parseEntero(r[map.ultimo_premio]) : null;
    const obs = map.obs != null && r[map.obs] != null ? String(r[map.obs]).trim() : '';

    let error = null;
    if (numero == null) error = 'N° inválido';
    else if (!nombre) error = 'Nombre vacío';
    else if (!fecha_ingreso) error = 'Fecha de ingreso inválida';

    out.push({ numero, nombre, fecha_ingreso, abono_dias, ultimo_premio, obs, _error: error });
  }
  if (!out.length) throw new Error('No se encontraron filas de datos.');
  return out;
}

async function previsualizar(filas) {
  // Marcar nuevos vs actualizaciones
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
    const c = f._error ? null : calcular(f, hoy);
    const tag = f._estado === 'error'
      ? '<span class="row-tag tag-err">ERROR</span>'
      : f._estado === 'new'
        ? '<span class="row-tag tag-new">NUEVO</span>'
        : '<span class="row-tag tag-upd">ACTUALIZA</span>';
    return `<tr class="${f._estado === 'error' ? 'row-error' : f._estado === 'new' ? 'row-new' : ''}">
      <td>${tag}</td>
      <td>${f.numero ?? '—'}</td>
      <td>${f.nombre || '—'}</td>
      <td>${f.fecha_ingreso || '<span style="color:#C0392B">—</span>'}</td>
      <td>${c ? c.tiempo : (f._error || '—')}</td>
      <td style="text-align:center">${f.ultimo_premio ?? '—'}</td>
      <td>${c ? c.fechaProx + (c.vencido ? ' ⚠️' : '') : '—'}</td>
      <td>${f.obs || ''}</td>
    </tr>`;
  }).join('');

  $('preview-table').innerHTML = `
    <thead><tr>
      <th>Estado</th><th>N°</th><th>Nombre</th><th>Fecha Ingreso</th>
      <th>Antigüedad (calc.)</th><th>Últ. Premio</th><th>Próx. Premio (calc.)</th><th>Obs</th>
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
      fecha_ingreso: f.fecha_ingreso,
      abono_dias: f.abono_dias ?? 0,
      ultimo_premio: f.ultimo_premio,
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

// Plantilla CSV
$('tpl-link').addEventListener('click', (e) => {
  e.preventDefault();
  const csv = 'N°,Nombre,Fecha Ingreso,Abono Días,Último Premio,Obs\n105,EJEMPLO JUAN,15-03-2020,0,,\n';
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'plantilla-voluntarios.csv';
  a.click();
});

// Mantener vista sincronizada con el estado de autenticación
supabase.auth.onAuthStateChange(() => { /* refresco manual desde acciones */ });
refrescarVista();
