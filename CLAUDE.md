# CLAUDE.md — App Antigüedad Efectiva · 9ª Compañía "Bomba Yungay" (CBS)

Guía para trabajar en este proyecto. Léela antes de hacer cambios.

## Qué es

Sitio web estático que muestra la **antigüedad efectiva y los premios de constancia**
de los voluntarios de la 9ª Compañía del Cuerpo de Bomberos de Santiago.

- **Vista pública** (`index.html`): cualquiera consulta, busca, filtra y ordena.
- **Panel de oficiales** (`admin.html`): login + importar la planilla Excel/CSV.

No hay paso de compilación (no build). Es HTML/CSS/JS plano servido como estático.

## Reglas críticas (no romper)

1. **El diseño visual NO se cambia.** Colores, tipografías, tabla y layout son los del
   diseño original (`bomba-yungay-html.html`). Mantener `css/styles.css` intacto salvo
   añadidos que no alteren la presentación de la tabla.
2. **NO mezclar con otros proyectos Supabase.** Esta app vive en su proyecto **dedicado y
   aislado** `dwzpguzymqzytgkxiumz` ("Novena Cia CBS"). No usar ni tocar el proyecto
   `frfqystvfskqxmvypljs` (es de otra app, "AsincPro Gastos").
3. **La planilla Excel es la fuente de verdad.** La app **muestra** los valores tal cual;
   **no recalcula** antigüedad ni fechas. Si algo se ve "mal", casi siempre es la planilla
   o un despliegue desactualizado, no un cálculo.
4. **Datos personales.** `Planilla Premios 9a Cia.xlsx` y cualquier `.csv/.xlsx` están en
   `.gitignore` y `.vercelignore`. Nunca versionar ni publicar datos de voluntarios.

## Arquitectura

```
index.html        Vista pública
admin.html        Panel de administración (login + importación)
css/styles.css    Estilos (diseño original)
js/
  config.js       URL + publishable key del proyecto Supabase dedicado
  supabase.js     Cliente Supabase (ESM vía CDN esm.sh)
  calc.js         Utilidades de presentación (formato fecha, "vencido", parse años)
  app.js          Vista pública: lee voluntarios y renderiza la tabla
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

## Supabase (proyecto dedicado)

- **Proyecto:** `dwzpguzymqzytgkxiumz` — URL `https://dwzpguzymqzytgkxiumz.supabase.co`.
- **Llaves:** usar **publishable key** (`sb_publishable_...`). Las llaves *legacy* (`anon`
  con formato `eyJ...`) están **deshabilitadas** en este proyecto.
- **Acceso desde aquí:** el asistente **no** tiene acceso por MCP a este proyecto. Los
  cambios de base de datos se entregan como SQL para pegar en **Supabase → SQL Editor**
  (ver `supabase/setup-novena-cia.sql`).
- **Seguridad (RLS):** lectura pública; escritura solo para correos en `bomba_admins`.
- **Login admin:** Supabase Auth (correo + contraseña). El usuario debe existir en
  **Authentication** de este proyecto y su correo estar en `bomba_admins`.
  Admins actuales: `waldo.ramos@9.cbs.cl`, `waldo.ramos.2023@gmail.com`.

### Tabla `voluntarios` (refleja columnas de la planilla)

| Campo               | Col. planilla             | Notas                          |
|---------------------|---------------------------|--------------------------------|
| `numero`            | A · N°                    | único                          |
| `nombre`            | B · Nombre                |                                |
| `tiempo_actual`     | I · Tiempo_Actual         | Antigüedad efectiva (texto)    |
| `fecha_ingreso`     | C · Ingreso_1             | referencia                     |
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

> Tras desplegar, verificar con `curl` que `js/config.js` apunte al proyecto correcto y que
> la vista muestre la fecha de columna M (p. ej. ACUÑA AGUSTÍN → 13-03-2027).

## Flujo para actualizar datos

1. Entrar a `/admin` e iniciar sesión.
2. Arrastrar la planilla nueva → revisar previsualización (nuevos / actualiza / errores).
3. "Guardar". La vista pública se refresca automáticamente.

## Idioma

Todo (UI, comentarios, mensajes) en **español (Latinoamérica)** con tildes correctas.
