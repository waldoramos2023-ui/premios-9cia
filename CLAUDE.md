# CLAUDE.md — App Antigüedad Efectiva · 9ª Compañía "Bomba Yungay" (CBS)

Guía para trabajar en este proyecto. Léela antes de hacer cambios.

## Qué es

Sitio web estático que muestra la **antigüedad efectiva y los premios de constancia**
de los voluntarios de la 9ª Compañía del Cuerpo de Bomberos de Santiago.

- **Vista pública** (`index.html`): cualquiera consulta, busca, filtra y ordena. Filtros:
  Todos / Premios Vencidos / **Premios por Vencer (2 meses)** — próximo premio entre hoy y
  hoy + 2 meses inclusive, ver `esPorVencer` en `js/calc.js` — / Sin Premio Aún / Con Observaciones.
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
favicon.ico       Icono de la pestaña (16/32/48 px)
apple-touch-icon.png  Icono de iOS (180x180, opaco)
manifest.webmanifest  Manifest PWA (standalone, theme_color #671512)
icons/            Iconos PWA 192/512, "any" y "maskable"
css/styles.css    Estilos (diseño original)
js/
  config.js       URL + publishable key del proyecto Supabase
  supabase.js     Cliente Supabase (ESM vía CDN esm.sh)
  calc.js         Presentación (formato fecha, "vencido") + cálculo de antigüedad en vivo
                  (diffYMD, calcularAntiguedad)
  app.js          Vista pública: lee voluntarios, calcula antigüedad y renderiza la tabla
  admin.js        Login + importador Excel/CSV (SheetJS vía CDN)
scripts/          Generadores de SQL/seed e iconos (no se despliegan)
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
- **Acceso desde aquí:** por MCP la **lectura funciona** — `get_project` y `query_logs`
  verificados el 09-09-2026 con datos reales, y sirven para diagnosticar. La **escritura no es
  confiable**: desde la carpeta local de trabajo falla con
  `NotFoundException: Project not found`, porque el conector está autorizado para la
  organización *AsincPro* y este proyecto vive en *Novena Cia CBS*. No asumas que puedes migrar
  por MCP sin comprobarlo antes; el camino seguro es el **SQL Editor** del dashboard
  (`supabase/setup-novena-cia.sql`), tocando solo `voluntarios`/`bomba_admins` y confirmando
  antes de escribir.
- **Seguridad (RLS):** lectura pública; escritura solo para correos en `bomba_admins`.
- **Keep-alive (evitar pausa por inactividad):** el plan free pausa los proyectos con **poca
  actividad**. El criterio **no** es "~7 días sin actividad", sino **unas pocas consultas de
  usuario cada día** durante la semana previa
  ([docs](https://supabase.com/docs/guides/platform/free-project-pausing)). Comprobado a la
  mala: el **22-08-2026 el proyecto se pausó igual**, pese a que este workflow había corrido
  con éxito el 13, 17 y 20 de agosto bajo el esquema viejo de lunes y jueves. Desde el
  **09-09-2026** el workflow corre **3 veces al día con 3 consultas** por ejecución (~9
  diarias), verificado ese mismo día con una corrida manual: 3/3 HTTP 200. Sumado al ping del
  Mac, el proyecto recibe ~18 consultas diarias.
  Lee URL/llave desde `js/config.js` (no usa secretos). Síntoma de pausa: el host
  deja de resolver en DNS y la vista muestra "No se pudieron cargar los datos"; si ocurre,
  restaurar en el dashboard de Supabase (Restore/Resume). Como el proyecto es compartido, una
  pausa afecta a las tres apps.
- **GitHub apaga este workflow por su cuenta.** Tras **60 días sin commits** en el repo,
  Actions lo deja en `disabled_inactivity`. Ya pasó una vez, entre el 07-07 y el 09-09-2026:
  dejó de correr sin aviso visible. Verificar y reactivar con:
  `gh workflow list --repo waldoramos2023-ui/premios-9cia` y
  `gh workflow enable keep-alive.yml --repo waldoramos2023-ui/premios-9cia`. El commit del
  09-09-2026 reinició el contador, así que el próximo riesgo aparece hacia **noviembre de 2026**.
- **Para editar archivos bajo `.github/workflows/` hace falta un token con scope `workflow`.**
  Sin él, el push se rechaza con *"refusing to allow an OAuth App to create or update
  workflow"*. Se agrega con `gh auth refresh -h github.com -s workflow` (ese endpoint puede
  devolver un HTTP 502 transitorio: reintentar). Alternativa sin tocar el token: editar el
  archivo desde la web de GitHub.
- **Hay un segundo keep-alive**, en el Mac de Waldo (launchd, 3 veces al día). Se cubren
  mutuamente: Actions sigue vivo con el Mac apagado, y launchd sigue vivo si Actions se
  deshabilita. Está documentado en el `CLAUDE.md` de la carpeta local de trabajo, que es un
  archivo **distinto** de éste.
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
- **El despliegue es manual: Vercel NO está conectado a Git.** Fusionar un PR en `main` no
  publica nada (no hay previews ni deploy automático). Redesplegar tras cambios de código,
  desde un checkout actualizado de `main`:

```bash
npx vercel --prod --scope waldo-s-projects1
```

- Un agente de IA no puede correr ese comando (el modo automático bloquea el
  *Production Deploy*): lo ejecuta el mantenedor en su terminal.
- En un clon nuevo, `vercel link` descarga un `.env.local` con variables del proyecto y
  edita `.gitignore`: borrar el archivo (sin leerlo) y revertir `.gitignore` antes de
  desplegar o hacer commit.

> Tras desplegar, verificar con `curl` que `js/config.js` apunte al proyecto correcto, que
> la vista muestre la fecha de columna M (p. ej. ACUÑA AGUSTÍN → 13-03-2027) y que `js/app.js`
> sirva el cálculo en vivo (`calcularAntiguedad`). Si se tocaron los iconos, comprobar también
> que `/favicon.ico`, `/apple-touch-icon.png`, `/icons/*.png` respondan 200 y que
> `/manifest.webmanifest` se sirva como `application/manifest+json`.

> **Versión actual:** v3.1 — filtro "Premios por Vencer (2 meses)" en la vista pública
> (`esPorVencer` en `js/calc.js`: fecha del próximo premio entre hoy y hoy + 2 meses,
> inclusive), además de lo de v3.0 (escudo oficial, antigüedad efectiva dinámica,
> `/admin` separado). Pie: "Ver. 3.1 - by AsincPro · Actualizado ahora" — **el
> "Actualizado ahora" es texto fijo en `index.html`, no un dato real**: la antigüedad sí se
> calcula al día de hoy en el navegador, pero la fecha del próximo premio y el resto vienen
> de la última importación de la planilla.

## Iconos de la app (favicon, iOS y Android)

Publicados el 20-09-2026 (PR #3). Se derivan de `escudo-9a.png` con
`scripts/generar-iconos.py` (requiere Pillow; correr desde la raíz del repo:
`python3 scripts/generar-iconos.py`). Vercel no publica `scripts/`.

| Archivo | Uso |
|---|---|
| `favicon.ico` | 16, 32 y 48 px (pestaña) |
| `apple-touch-icon.png` | 180×180 **opaco** (iOS pinta de negro lo transparente) |
| `icons/icon-192.png`, `icons/icon-512.png` | Android/PWA, propósito `any` |
| `icons/icon-maskable-192.png`, `icons/icon-maskable-512.png` | Android, logo al 72 % del lienzo, fondo a sangre completa |
| `manifest.webmanifest` | `display: standalone`, `theme_color: #671512`, `background_color: #FEFEFE` |

Decisiones (y cómo cambiarlas, todas en constantes del script):

- **Recorte del escudo con el 9, no el logo completo** (`ESCUDO`): a 16-64 px el sol, los
  laureles y el listón se disuelven.
- **Maskable al 72 %** (`FRACCION_MASKABLE`): con máscara circular el escudo queda completo,
  pero sus hombros llegan a radio 0,48 del lienzo (dentro del círculo, fuera de la zona
  segura estricta de 0,40); 0,60 la respeta.
- **`theme_color` `#671512`** es el rojo medido en el logo; el `--granate` del sitio es
  `#6B1D3A` (más vino), así que la barra móvil no coincide exacto con el encabezado.
- **Fondo `#FEFEFE`**: el original es RGB opaco con fondo `(254,254,254)`.
- **iOS `status-bar-style: default`**: `black-translucent` metería el encabezado bajo el reloj.

Si "no se ve el icono" casi siempre es **caché**: Safari de escritorio muestra una letra gris
hasta volver a pedir el favicon (Cmd+Q y reabrir, o abrir `/favicon.ico` y recargar); Chrome
cachea de forma agresiva (incógnito o Cmd+Shift+R); en iOS hay que borrar el acceso directo
(y, si hace falta, los datos del sitio) y volver a agregarlo; en Android, reinstalar. Antes
de nada, confirmar que producción esté desplegada.

## Flujo para actualizar datos

1. Entrar a `/admin` e iniciar sesión.
2. Arrastrar la planilla nueva → revisar previsualización (nuevos / actualiza / errores).
3. "Guardar". La vista pública se refresca automáticamente.

## Idioma

Todo (UI, comentarios, mensajes) en **español (Latinoamérica)** con tildes correctas.
