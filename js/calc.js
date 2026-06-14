// === Cálculo automático de antigüedad efectiva y premios ===
// Reglas: los premios de antigüedad se otorgan cada 5 años (5, 10, 15, ...).
// - antigüedad efectiva = hoy - (fecha de ingreso - abonos)
// - próximo premio = siguiente múltiplo de 5 por sobre el último premio otorgado
// - fecha del próximo premio = fecha de ingreso efectiva + (próximo premio) años
// - vencido = la fecha del próximo premio ya pasó (corresponde pero aún no se otorga)

export const PASO_PREMIO = 5;

function parseISO(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

// Fecha de ingreso ajustada por abonos (días que se suman a la antigüedad).
function ingresoEfectivo(fechaIngreso, abonoDias) {
  const d = parseISO(fechaIngreso);
  if (!d) return null;
  d.setUTCDate(d.getUTCDate() - (abonoDias || 0));
  return d;
}

function addYears(date, years) {
  const d = new Date(date.getTime());
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d;
}

// Desglose en años, meses y días entre dos fechas.
function desglose(desde, hasta) {
  let y = hasta.getUTCFullYear() - desde.getUTCFullYear();
  let m = hasta.getUTCMonth() - desde.getUTCMonth();
  let d = hasta.getUTCDate() - desde.getUTCDate();
  if (d < 0) {
    m--;
    // días del mes anterior a 'hasta'
    const diasMesAnt = new Date(Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), 0)).getUTCDate();
    d += diasMesAnt;
  }
  if (m < 0) { y--; m += 12; }
  return { years: y, months: m, days: d };
}

export function formatearFecha(date) {
  if (!date) return null;
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const yy = date.getUTCFullYear();
  return `${dd}-${mm}-${yy}`;
}

// Recibe una fila de la BD { fecha_ingreso, abono_dias, ultimo_premio, ... }
// Devuelve los campos calculados para mostrar.
export function calcular(v, hoy = new Date()) {
  const hoyUTC = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
  const ing = ingresoEfectivo(v.fecha_ingreso, v.abono_dias);
  const ultimoPremio = v.ultimo_premio ?? null;

  if (!ing) {
    return { tiempo: null, anios: null, ultimoPremio, proxPremio: null, fechaProx: null, vencido: false };
  }

  const dg = desglose(ing, hoyUTC);
  const tiempo = `${dg.years} años ${dg.months} meses ${dg.days} días`;

  const base = ultimoPremio == null ? 0 : ultimoPremio;
  const proxPremio = base + PASO_PREMIO;
  const fechaProxDate = addYears(ing, proxPremio);
  const vencido = fechaProxDate <= hoyUTC;

  return {
    tiempo,
    anios: dg.years,
    ultimoPremio,
    proxPremio,
    fechaProx: formatearFecha(fechaProxDate),
    fechaProxDate,
    vencido,
  };
}
