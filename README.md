# App Antigüedad Efectiva · 9ª Compañía "Bomba Yungay" (CBS)

Aplicación web para consultar la **antigüedad efectiva** y los **premios de constancia**
de los voluntarios de la 9ª Compañía del Cuerpo de Bomberos de Santiago.

- **Vista pública** (`index.html`): cualquiera puede consultar la tabla, buscar, filtrar y ordenar.
- **Panel de oficiales** (`admin.html`): acceso con correo y contraseña para **importar datos**
  desde Excel/CSV. La antigüedad y el próximo premio se **calculan automáticamente**.

No requiere compilación: es un sitio estático que usa [Supabase](https://supabase.com) como
base de datos y autenticación.

## Arquitectura

```
index.html        Vista pública
admin.html        Panel de administración (login + importación)
favicon.ico, apple-touch-icon.png, icons/, manifest.webmanifest
                  Iconos de la app (pestaña, iOS y Android) y manifest PWA
css/styles.css    Estilos (diseño original, intacto)
js/
  config.js       URL y clave pública de Supabase
  supabase.js     Cliente Supabase (ESM vía CDN)
  calc.js         Cálculo de antigüedad y premios
  app.js          Lógica de la vista pública
  admin.js        Login + importador Excel/CSV
scripts/
  generar-seed.mjs  Generó la carga inicial desde el HTML original
  generar-iconos.py Regenera los iconos desde escudo-9a.png (requiere Pillow)
vercel.json       Configuración de despliegue
```

## Base de datos (Supabase)

La **planilla Excel es la fuente de verdad** (ya trae la antigüedad y las fechas
calculadas). La app muestra esos valores tal cual y se refresca al importar una
planilla nueva. Tabla `voluntarios` (refleja las columnas de la planilla):

| Campo               | Col. planilla        | Descripción                          |
|---------------------|----------------------|--------------------------------------|
| `numero`            | A · N°               | N° del voluntario (único)            |
| `nombre`            | B · Nombre           | Nombre                               |
| `tiempo_actual`     | I · Tiempo_Actual    | Antigüedad efectiva (texto)          |
| `fecha_ingreso`     | C · Ingreso_1        | Fecha de ingreso (referencia)        |
| `fecha_prem_ant`    | K · Fecha_Prem_Ant   | Fecha del premio anterior            |
| `premio_ant`        | L · Premio_Ant       | Último premio otorgado (años)        |
| `fecha_prox_premio` | **M · Fecha_Prox_Premio** | **Fecha del próximo premio**    |
| `prox_premio`       | N · Prox_Premio      | Próximo premio (años)                |
| `obs`               | O · Observaciones    | Observaciones                        |
| `activo`            | —                    | Si se muestra en la vista pública    |

**Seguridad (RLS):** la lectura es pública; **solo correos en la tabla `bomba_admins`**
(autenticados) pueden insertar/editar/eliminar.

### Gestión de administradores

Los correos con permiso de edición se controlan en la tabla `bomba_admins`. Para agregar uno:

```sql
insert into public.bomba_admins (email) values ('correo@dominio.cl');
```

El usuario además debe tener cuenta en Supabase Auth (correo + contraseña) para iniciar sesión.

## Mantenimiento: evitar que Supabase pause el proyecto

En plan gratuito, Supabase pausa los proyectos con **poca actividad**. El criterio
**no** es "7 días sin ninguna consulta", sino
[unas pocas consultas de usuario **cada día**](https://supabase.com/docs/guides/platform/free-project-pausing)
durante la semana previa. Si se pausa, el host deja de resolver en DNS y la app
muestra `No se pudieron cargar los datos: TypeError: Failed to fetch`; se restaura
desde el dashboard de Supabase con **Resume project** (no "Upgrade to Pro").

Ocurrió el **22-08-2026**, y la causa fue justamente ese malentendido: el keep-alive
corría lunes y jueves, con éxito, y aun así no alcanzaba el umbral.

Hay dos pings automáticos, y conviene mantener los dos: se cubren mutuamente.

| Dónde | Frecuencia | Qué cubre |
|---|---|---|
| `.github/workflows/keep-alive.yml` | 3 veces al día | Corre en la nube, no depende de ningún equipo encendido |
| launchd en el Mac del mantenedor | 3 veces al día | Sigue vivo si GitHub deshabilita el workflow |

> **GitHub apaga el workflow por su cuenta** tras 60 días sin commits en el repo
> (estado `disabled_inactivity`), sin aviso visible aquí. Ya pasó entre el 07-07 y
> el 09-09-2026. Conviene revisarlo cada tanto:
>
> ```bash
> gh workflow list --repo waldoramos2023-ui/premios-9cia
> gh workflow enable keep-alive.yml --repo waldoramos2023-ui/premios-9cia
> ```
>
> Modificar archivos bajo `.github/workflows/` requiere un token con scope
> `workflow` (`gh auth refresh -h github.com -s workflow`); sin él, el push se
> rechaza.

## Desarrollo local

```bash
npm run dev      # servidor estático en http://localhost:5173
```

(o cualquier servidor estático: `npx serve`, `python3 -m http.server`, etc.)

## Despliegue en Vercel

El proyecto `app-antiguedad-9a` (equipo `waldo-s-projects1`) **no está conectado a Git**:
**fusionar un PR en `main` no publica nada**. El despliegue es manual, desde un checkout
actualizado de `main`:

```bash
npx vercel --prod --scope waldo-s-projects1
```

Después de desplegar, comprobar con `curl` que el sitio responde 200 y que los archivos
nuevos se publicaron (por ejemplo `/favicon.ico` y `/manifest.webmanifest`).

Para montar el sitio desde cero en otra cuenta: en Vercel → **Add New Project** → importar el
repo, con *Framework preset* **Other** (sitio estático, sin build).

> La clave de Supabase incluida (`config.js`) es la *publishable key*, pensada para
> exponerse en el navegador. El control de acceso real lo aplica RLS en la base de datos.

## Iconos de la app

La app tiene favicon, icono de iOS (`apple-touch-icon`) y manifest PWA (`display:
standalone`, con variantes *maskable* para Android). Son un recorte del escudo con el 9,
derivado de `escudo-9a.png`: a 16-64 px el emblema completo no se lee. Para regenerarlos:

```bash
python3 scripts/generar-iconos.py    # requiere Pillow; correr desde la raíz del repo
```

Si un icono "no se ve" tras desplegar, casi siempre es caché del navegador o del sistema
(Safari, Chrome e iOS lo guardan de forma agresiva); el detalle está en `CLAUDE.md`.

## Importar voluntarios (panel de oficiales)

Columnas reconocidas en el Excel/CSV (los nombres aceptan mayúsculas/acentos):

`N°` · `Nombre` · `Fecha Ingreso` (dd-mm-aaaa) · `Abono Días` (opcional) ·
`Último Premio` (opcional) · `Obs` (opcional)

La app previsualiza los cambios (nuevos / actualizaciones / errores) antes de guardar.
