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
css/styles.css    Estilos (diseño original, intacto)
js/
  config.js       URL y clave pública de Supabase
  supabase.js     Cliente Supabase (ESM vía CDN)
  calc.js         Cálculo de antigüedad y premios
  app.js          Lógica de la vista pública
  admin.js        Login + importador Excel/CSV
scripts/
  generar-seed.mjs  Generó la carga inicial desde el HTML original
vercel.json       Configuración de despliegue
```

## Base de datos (Supabase)

Tabla `voluntarios`:

| Campo          | Tipo    | Descripción                                            |
|----------------|---------|--------------------------------------------------------|
| `numero`       | int     | N° del voluntario (único)                              |
| `nombre`       | text    | Nombre                                                 |
| `fecha_ingreso`| date    | Fecha de ingreso (base del cálculo de antigüedad)      |
| `abono_dias`   | int     | Días de abono que se suman a la antigüedad (def. 0)    |
| `ultimo_premio`| int     | Último premio otorgado en años (dato de las listas)    |
| `obs`          | text    | Observaciones                                          |
| `activo`       | bool    | Si se muestra en la vista pública                      |

**Seguridad (RLS):** la lectura es pública; **solo correos en la tabla `bomba_admins`**
(autenticados) pueden insertar/editar/eliminar.

### Gestión de administradores

Los correos con permiso de edición se controlan en la tabla `bomba_admins`. Para agregar uno:

```sql
insert into public.bomba_admins (email) values ('correo@dominio.cl');
```

El usuario además debe tener cuenta en Supabase Auth (correo + contraseña) para iniciar sesión.

## Desarrollo local

```bash
npm run dev      # servidor estático en http://localhost:5173
```

(o cualquier servidor estático: `npx serve`, `python3 -m http.server`, etc.)

## Despliegue en Vercel

1. Subir este repositorio a GitHub.
2. En Vercel → **Add New Project** → importar el repo.
3. Framework preset: **Other** (sitio estático, sin build).
4. Deploy. Listo: la app queda en `https://<tu-proyecto>.vercel.app`.

> La clave de Supabase incluida (`config.js`) es la *publishable key*, pensada para
> exponerse en el navegador. El control de acceso real lo aplica RLS en la base de datos.

## Importar voluntarios (panel de oficiales)

Columnas reconocidas en el Excel/CSV (los nombres aceptan mayúsculas/acentos):

`N°` · `Nombre` · `Fecha Ingreso` (dd-mm-aaaa) · `Abono Días` (opcional) ·
`Último Premio` (opcional) · `Obs` (opcional)

La app previsualiza los cambios (nuevos / actualizaciones / errores) antes de guardar.
