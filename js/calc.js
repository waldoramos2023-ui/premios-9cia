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
// Respaldo: solo se usa si no hay fechas para calcular en vivo.
export function parseAnios(t) {
  if (!t) return 0;
  const m = String(t).match(/(\d+)\s*años?/i);
  return m ? +m[1] : 0;
}

// === Antigüedad efectiva (cálculo en vivo) ===
// Replica la fórmula de la planilla (DATEDIF con TODAY()), pero usando la fecha actual,
// para que la antigüedad avance sola sin reimportar. Dos casos, como en el Excel:
//   - Servicio continuo (sin salida_1): DATEDIF(ingreso_1, hoy).
//   - Con bajas/reingresos: suma los días de los periodos cerrados y ancla esa duración
//     restándola a la fecha del último ingreso abierto, luego DATEDIF hasta hoy.

const MS_DIA = 86400000;

// ISO (YYYY-MM-DD) -> Date en UTC a medianoche. null si no es una fecha válida.
function isoAFecha(iso) {
  if (!iso) return null;
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

// Diferencia calendario (años, meses, días) entre dos fechas UTC, estilo DATEDIF y/ym/md.
export function diffYMD(desde, hasta) {
  let y = hasta.getUTCFullYear() - desde.getUTCFullYear();
  let m = hasta.getUTCMonth() - desde.getUTCMonth();
  let d = hasta.getUTCDate() - desde.getUTCDate();
  if (d < 0) {
    m--;
    // días del mes anterior al "hasta"
    const diasMesPrev = new Date(Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), 0)).getUTCDate();
    d += diasMesPrev;
  }
  if (m < 0) { y--; m += 12; }
  return { y, m, d };
}

function formatearYMD({ y, m, d }) {
  return `${y} años, ${m} ${m === 1 ? 'mes' : 'meses'}, ${d} ${d === 1 ? 'día' : 'días'}`;
}

// Calcula la antigüedad efectiva de un voluntario a partir de sus periodos de servicio.
// `v` trae fecha_ingreso (Ingreso_1) y, opcionalmente, salida_1, ingreso_2, salida_2,
// ingreso_3, salida_3 en ISO. Devuelve { anios, texto } o null si no hay fecha de ingreso.
export function calcularAntiguedad(v, hoy = new Date()) {
  const ing1 = isoAFecha(v.fecha_ingreso);
  if (!ing1) return null;

  const h = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));

  const sal1 = isoAFecha(v.salida_1);
  // Servicio continuo: no hubo salida del primer periodo.
  if (!sal1) {
    const ymd = diffYMD(ing1, h);
    return { anios: ymd.y, texto: formatearYMD(ymd) };
  }

  // Con bajas: sumar días de los periodos cerrados y hallar el último ingreso abierto.
  const periodos = [
    [ing1, sal1],
    [isoAFecha(v.ingreso_2), isoAFecha(v.salida_2)],
    [isoAFecha(v.ingreso_3), isoAFecha(v.salida_3)],
  ];

  let diasCerrados = 0;
  let ultimoIngresoAbierto = null;
  for (const [ing, sal] of periodos) {
    if (!ing) continue;
    if (sal) diasCerrados += Math.round((sal - ing) / MS_DIA);
    else { ultimoIngresoAbierto = ing; break; }
  }

  // Si todos los periodos están cerrados (voluntario sin servicio activo), medir hasta la
  // última salida; si hay uno abierto, anclar la duración previa a su fecha de ingreso.
  const ancla = ultimoIngresoAbierto
    ? new Date(ultimoIngresoAbierto.getTime() - diasCerrados * MS_DIA)
    : new Date(h.getTime() - diasCerrados * MS_DIA);

  const ymd = diffYMD(ancla, h);
  return { anios: ymd.y, texto: formatearYMD(ymd) };
}
