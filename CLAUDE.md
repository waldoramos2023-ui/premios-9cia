# CLAUDE.md — App Antigüedad Efectiva · 9ª Compañía "Bomba Yungay" (CBS)

Guía para trabajar en este proyecto. Léela antes de hacer cambios.

## Qué es

Sitio web estático que muestra la **antigüedad efectiva y los premios de constancia**
de los voluntarios de la 9ª Compañía del Cuerpo de Bomberos de Santiago.

- **Vista pública** (`index.html`): cualquiera consulta, busca, filtra y ordena.
- **Panel de oficiales** (`admin.html`): login + importar la planilla Excel/CSV. **No** se
  enlaza desde la vista pública; el acceso es directo por URL (`/admin`), de forma separada.

No hay paso de compilación (no build). Es HTML/CSS/JS plano servido como estático.

## Reglas críticas (no romper)

1. **El diseño visual NO se cambia.** Colores, tipografías, tabla y layout son los del
   diseño original (`bomba-yungay-html.html`). Mantener `css/styles.css` intacto salvo
   añadidos que no alteren la presentación de la tabla.
2. **El proyecto Supabase `dwzpguzymqzytgkxiumz` está COMPARTIDO con otras apps.** Sus tablas
   `usuarios/rendiciones/items_rendicion` (rendición de fondos) e `inv_*` (inventario) son de
   otras aplicaciones: **no tocarlas**. Esta app usa solo `voluntarios` y `bomba_admins`.
   Además **`inv_bomberos.voluntario_id` referencia a `voluntarios.id`**: preservar `id` (el
   upsert por `numero` lo respeta; añadir columnas nullable es seguro).
3. **La planilla Excel es la fuente de verdad de los datos** (fechas de ingreso/salida, premios,
   observaciones). La app los **muestra tal cual** y **no recalcula las fechas de premio**
   (col M/N). **Excepción:** la **Antigüedad Efectiva** (col I) **se calcula en vivo** en el
   cliente según la fecha actual, replicando la fórmula `DATEDIF`/`TODAY()` de la planilla
   (ver `js/calc.js` → `calcularAntiguedad`). Por eso avanza sola sin reimportar.
4. **Datos personales.** `Planilla Premios 9a Cia.xlsx` y cualquier `.csv/.xlsx` están en
   `.gitignore` y `.vercelignore`. Nunca versionar ni publicar datos de voluntarios.

## Arquitectura

```
index.html        Vista pública
admin.html        Panel de administración (login + importación)
escudo-9a.png     Escudo oficial (encabezado de ambas secciones)
css/styles.css    Estilos (diseño original)
js/
  config.js       URL + publishable key del proyecto Supabase
  supabase.js     Cliente Supabase (ESM vía CDN esm.sh)
  calc.js         Presentación (formato fecha, "vencido") + cálculo de antigüedad en vivo
                  (diffYMD, calcularAntiguedad)
  app.js          Vista pública: lee voluntarios, calcula antigüedad y renderiza la tabla
  admin.js        Login + importador Excel/CSV (SheetJS vía CDN)
scripts/          Generadores de SQL/seed (no se despliegan)
supabase/         SQL de configuración del proyecto (no se despliega)
vercel.json       Config de despliegue (cleanUrls, headers)
```

## Repositorio (GitHub)

- **Remoto:** `origin` → `https://github.com/waldoramos2023-ui/premios-9cia.git` (rama `main`).
- La planilla y cualquier `.xlsx/.xls/.csv` **no se versionan** (ver `.gitignore`); tampoco
  los artefactos generados (`scripts/seed.sql`, `scripts/update-premios.sql`,
  `supabase/setup-novena-cia.sql`).
- **Respaldos** (fuera del repo, no versionados): en `../_backups/` hay snapshots `.zip`
  del proyecto. La historia placeholder que vivía antes en este remoto quedó guardada en
  `premios-9cia-remoto-original.bundle` y en la rama local `respaldo-remoto-premios9cia`.

## Supabase (proyecto compartido)

- **Proyecto:** `dwzpguzymqzytgkxiumz` — URL `https://dwzpguzymqzytgkxiumz.supabase.co`.
- **Llaves:** usar **publishable key** (`sb_publishable_...`). Las llaves *legacy* (`anon`
  con formato `eyJ...`) están **deshabilitadas** en este proyecto.
- **Acceso desde aquí:** el asistente **sí** tiene acceso por MCP a este proyecto (aparece
  listado como `fondos-rendicion`, pero el `ref` coincide con `js/config.js`). Se puede aplicar
  migraciones y consultas por MCP — **siempre confirmando antes de escribir** y tocando solo
  `voluntarios`/`bomba_admins`. También sigue siendo válido entregar SQL para el **SQL Editor**
  (`supabase/setup-novena-cia.sql`).
- **Seguridad (RLS):** lectura pública; escritura solo para correos en `bomba_admins`.
- **Keep-alive (evitar pausa por inactividad):** el plan free pausa el proyecto tras ~7 días
  sin actividad (síntoma: el host deja de resolver en DNS y la vista muestra "No se pudieron
  cargar los datos"). Para evitarlo, el workflow `.github/workflows/keep-alive.yml` hace una
  consulta ligera de solo lectura a `voluntarios` **lunes y jueves**. Lee URL/llave desde
  `js/config.js` (no usa secretos). Si el proyecto igual se pausa, restaurarlo en el dashboard
  de Supabase (Restore/Resume). Como el proyecto es compartido, una pausa afecta a las tres apps.
- **Login admin:** Supabase Auth (correo + contraseña). El usuario debe existir en
  **Authentication** de este proyecto y su correo estar en `bomba_admins`.
  Admins actuales: `waldo.ramos@9.cbs.cl`, `waldo.ramos.2023@gmail.com`.

### Tabla `voluntarios` (refleja columnas de la planilla)

| Campo               | Col. planilla             | Notas                          |
|---------------------|---------------------------|--------------------------------|
| `numero`            | A · N°                    | único                          |
| `nombre`            | B · Nombre                |                                |
| `tiempo_actual`     | I · Tiempo_Actual         | Respaldo; la app la calcula en vivo |
| `fecha_ingreso`     | C · Ingreso_1             | inicio del 1.er periodo        |
| `salida_1`          | D · Salida_1              | periodos de servicio →         |
| `ingreso_2`         | E · Ingreso_2             | para calcular antigüedad       |
| `salida_2`          | F · Salida_2              | descontando bajas              |
| `ingreso_3`         | G · Ingreso_3             |                                |
| `salida_3`          | H · Salida_3              |                                |
| `fecha_prem_ant`    | K · Fecha_Prem_Ant        |                                |
| `premio_ant`        | L · Premio_Ant            | Últ. premio otorgado (años)    |
| `fecha_prox_premio` | **M · Fecha_Prox_Premio** | **Fecha del Próximo Premio**   |
| `prox_premio`       | N · Prox_Premio           | Próximo premio (años)          |
| `obs`               | O · Observaciones         |                                |
| `activo`            | —                         | si se muestra en la vista      |

> "Próximo Premio" en la app = **columna M**. "Años" = columna N. (Un intento previo de
> auto-calcular estas fechas fue descartado: usar siempre los valores de la planilla.)

## Desarrollo local

```bash
npm run dev      # http://localhost:5173 (o: npx serve, python3 -m http.server)
```

## Despliegue (Vercel)

- Proyecto Vercel: `app-antiguedad-9a` (equipo `waldo-s-projects1`).
- URL: https://app-antiguedad-9a.vercel.app
- Redesplegar tras cambios de código:

```bash
npx vercel --prod --scope waldo-s-projects1
```

> Tras desplegar, verificar con `curl` que `js/config.js` apunte al proyecto correcto, que
> la vista muestre la fecha de columna M (p. ej. ACUÑA AGUSTÍN → 13-03-2027) y que `js/app.js`
> sirva el cálculo en vivo (`calcularAntiguedad`).

> **Versión actual:** v3.1 — filtro "Premios por Vencer (2 meses)" en la vista pública
> (`esPorVencer` en `js/calc.js`: fecha del próximo premio entre hoy y hoy + 2 meses,
> inclusive), además de lo de v3.0 (escudo oficial, antigüedad efectiva dinámica,
> `/admin` separado). Pie: "Ver. 3.1 - by AsincPro · Actualizado ahora".

## Flujo para actualizar datos

1. Entrar a `/admin` e iniciar sesión.
2. Arrastrar la planilla nueva → revisar previsualización (nuevos / actualiza / errores).
3. "Guardar". La vista pública se refresca automáticamente.

## Idioma

Todo (UI, comentarios, mensajes) en **español (Latinoamérica)** con tildes correctas.
