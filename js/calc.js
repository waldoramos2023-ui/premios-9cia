// === Utilidades de presentación ===
// La planilla Excel es la fuente de verdad (ya trae todo calculado: antigüedad,
// fecha del próximo premio, etc.). Aquí solo formateamos/derivamos lo mínimo
// para mostrar: formato de fecha, "vencido" y los años para ordenar.

// Convierte un número de serie de Excel a fecha ISO (YYYY-MM-DD).
export function serialAISO(n) {
  if (typeof n !== 'number' || !isFinite(n)) return null;
  const d = new Date(Math.round((n - 25569) * 86400000));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// ISO (YYYY-MM-DD) -> dd-mm-aaaa para mostrar.
export function formatearISO(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return null;
  return `${d.padStart(2, '0')}-${m.padStart(2, '0')}-${y}`;
}

// ¿La fecha del próximo premio ya pasó? (premio que corresponde y aún no se otorga)
export function esVencido(iso, hoy = new Date()) {
  if (!iso) return false;
  const d = new Date(iso + 'T00:00:00Z');
  const h = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
  return d < h;
}

// Extrae los años desde el texto de antigüedad ("38 años 9 meses..."), para ordenar.
export function parseAnios(t) {
  if (!t) return 0;
  const m = String(t).match(/(\d+)\s*años?/i);
  return m ? +m[1] : 0;
}
