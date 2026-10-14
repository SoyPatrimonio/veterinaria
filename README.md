# Huellitas de Amor — Sistema de gestión veterinaria

Aplicación web para una clínica veterinaria: página pública, portal del cliente,
panel del veterinario y panel de administración, con base de datos **PostgreSQL
en Supabase** y despliegue en **Vercel**.

La base está organizada en **diez módulos** (esquemas de PostgreSQL) con 71
tablas, y **todo el acceso se decide por permisos** guardados en la propia base.

| Fase | Contenido | Estado |
|------|-----------|--------|
| 1 | Base de datos modular, autenticación, registro, login | ✅ |
| 1b | Seguridad: permisos por rol, sesiones, intentos de login, accesos, auditoría, recuperación de contraseña | ✅ |
| 2 | Clientes, mascotas y sus fichas | ✅ |
| 3 | Servicios, veterinarios, sistema de citas y agenda | ✅ |
| 4 | Historia clínica: consultas, signos vitales, diagnósticos, tratamientos, recetas, vacunas y exámenes | ✅ |
| 5 | Inventario: productos, lotes, existencias por ubicación, kardex, compras y proveedores | ✅ |
| 6 | Facturación: facturas, pagos, anulaciones y devoluciones | ✅ |
| 7–10 | Reportes, notificaciones y recordatorios programados | ✅ |

---

## 1. Requisitos

- **Node.js 18 o superior** (probado con Node 24)
- Una cuenta gratuita de **[Supabase](https://supabase.com)** (base de datos)
- Una cuenta gratuita de **[Vercel](https://vercel.com)** (publicación)

Ya no hace falta instalar MySQL ni XAMPP.

---

## 2. Poner en marcha la base de datos (Supabase)

### 2.1 Crear el proyecto

1. Entra a [supabase.com](https://supabase.com) → **New project**.
2. Ponle nombre (por ejemplo `huellitas`), elige una contraseña para la base de
   datos y **guárdala**: es la que va en la cadena de conexión.
3. Elige la región más cercana (por ejemplo `East US`) y crea el proyecto.

### 2.2 Copiar las credenciales

En el panel del proyecto:

| Dónde | Qué copiar | Para qué |
|-------|-----------|----------|
| **Project Settings → Database → Connection string → URI** | La cadena completa, en modo **Transaction pooler** (puerto `6543`) | `DATABASE_URL` |
| **Project Settings → API → Project URL** | `https://xxxx.supabase.co` | `SUPABASE_URL` |
| **Project Settings → API → service_role** | La clave larga | `SUPABASE_SERVICE_ROLE_KEY` |

> La clave `service_role` es de administrador. Va **solo** en el servidor,
> nunca en el frontend ni en un repositorio público.

### 2.3 Configurar el proyecto local

```bash
npm install                # instala las dependencias
npm run configurar         # asistente: pide los datos y comprueba que sirvan
```

El asistente pregunta por la cadena de conexión, las claves de Storage y el
token de Vercel, prueba cada una contra el servicio real y escribe el `.env`.
Si prefieres hacerlo a mano, copia `.env.example` a `.env` y rellénalo.

**Dos archivos, no uno.** El token de Vercel no va en el `.env`: va en
`.env.deploy`, en la raíz, con una sola línea `VERCEL_TOKEN=...`. La razón es
que el `.env` lo carga también la aplicación
(`backend/src/config/env.js`), así que todo lo que esté ahí acaba en el
`process.env` del proceso que atiende las peticiones. Ese token no lo usa
ninguna ruta y da control total de la cuenta de Vercel —desplegar, leer y
cambiar las variables de todos los proyectos, mover dominios—, así que se
guarda aparte. Lo lee solo `scripts/deploy.js`; el asistente ya lo escribe en
el sitio correcto y los dos archivos están en el `.gitignore`.

**`APP_URL`.** Es la dirección pública del sitio
(`https://huellitasdeamorvet.vercel.app`) y la usa el enlace del correo de
recuperación de contraseña. Sin ella, el enlace se arma con el encabezado
`Host` de la petición, y ese lo escribe quien la manda: bastaría una petición
con otro `Host` para que a alguien le llegara un correo nuestro con un enlace
que entrega su token a un sitio ajeno. En local puedes dejarla vacía; entonces
se usa el origen de la petición.

### 2.4 Cargar el esquema y los datos

```bash
npm run db:setup
```

Eso ejecuta `database/supabase/schema.sql` y `database/supabase/seed.sql`
contra Supabase, y crea el bucket de Storage donde van las fotos.

> ⚠️ `schema.sql` **borra y recrea** las tablas del proyecto. Si ya tienes datos
> reales, haz una copia antes (Supabase → Database → Backups).

Si prefieres no usar la terminal, puedes pegar el contenido de esos dos archivos
en el **SQL Editor** de Supabase, en ese orden.

### 2.5 Levantar el servidor

```bash
npm start          # o: npm run dev  (recarga automática)
```

Abre **http://localhost:3000**.

Antes de subir un cambio conviene pasar las dos comprobaciones, que no necesitan
base de datos ni conexión (ver 6.2):

```bash
npm test           # pruebas unitarias
npm run lint       # revisa el código
```

---

## 3. Publicar en Vercel

El repositorio ya trae `vercel.json` y `api/index.js`: Vercel sirve
`frontend/` como sitio estático y la API de Express como función serverless en
`/api/*`, todo bajo el mismo dominio.

### 3.1 Publicar

```bash
npm run deploy
```

Ese comando, con el `.env` ya configurado:

1. ajusta el proyecto de Vercel (preset **Other** y sin protección de acceso);
2. sube las 16 variables de entorno;
3. despliega a producción;
4. comprueba que la landing, `/api/salud`, `/api/servicios` y `/api/veterinarios`
   respondan, y te da la URL.

**No toca la base de datos.** Para recrearla desde cero —lo que **borra todo** y
vuelve a dejar los datos de ejemplo— hay que pedirlo aparte:

```bash
npm run deploy -- --recargar-base
```

### 3.2 Variables de entorno

Las sube `npm run deploy`. Si alguna vez las pones a mano
(**Project Settings → Environment Variables**), estas son las que importan:

| Variable | Valor |
|----------|-------|
| `DATABASE_URL` | La cadena del pooler de Supabase (puerto 6543) |
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | La clave `service_role` |
| `JWT_SECRET` | 32+ caracteres aleatorios |
| `NODE_ENV` | `production` |
| `CLINICA_TZ` | `America/Bogota` |

Genera el `JWT_SECRET` con:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Después de cambiarlas hay que **volver a desplegar** para que la función las tome.

### 3.3 Cuatro trampas del despliegue

Las cuatro cosas que hacen fallar esto la primera vez, y por qué:

**La zona horaria no se puede llamar `TZ`.** Vercel reserva ese nombre y no deja
crear la variable; además la define él mismo en UTC. Por eso el proyecto lee
`CLINICA_TZ` y con ella fija `process.env.TZ` al arrancar. Sin esto, la agenda
saldría corrida cinco horas.

**El preset del framework tiene que ser "Other".** Si el proyecto quedó con el
preset `express` (por ejemplo, porque nació de una plantilla), Vercel busca un
`server.js` dentro de `frontend/` y el despliegue falla con
*"No entrypoint found in output directory"*. `npm run deploy` lo pone en `null`.

**La protección de despliegue viene encendida.** Por defecto Vercel deja el sitio
detrás de su pantalla de inicio de sesión, así que ni la página ni la API son
públicas: todo devuelve un 401 con un `vercel_auth_callback`. `npm run deploy`
desactiva `ssoProtection`.

**Los tokens de proyecto no sirven para el CLI.** Un token que empieza por
`vcp_` no está asociado a un usuario, y `vercel link` o `vercel env add` fallan
con *"User not found"*. Por eso el script usa la API de Vercel para la
configuración y las variables, y solo llama al CLI para el despliegue, apoyado
en el archivo `.vercel/project.json`.

### 3.4 Comprobar que quedó bien

```
https://tu-proyecto.vercel.app/api/salud
```

Debe responder:

```json
{ "ok": true, "servicio": "huellitas-api", "hora": "…" }
```

---

## 4. Cómo abrir el sitio en desarrollo

Todas las rutas del frontend son **relativas**, así que la página se ve bien de
las tres formas:

| Forma | URL | ¿Funciona la API? |
|-------|-----|-------------------|
| Servido por Express (recomendado) | `http://localhost:3000` | Sí |
| Live Server de VS Code | `http://127.0.0.1:5500/frontend/index.html` | Sí, si el backend está encendido |
| Doble clic sobre el archivo | `file:///…/frontend/index.html` | Solo en desarrollo |

Con Live Server o doble clic, el frontend llama al backend en
`http://localhost:3000`, así que **el servidor tiene que estar corriendo igual**.
El origen `127.0.0.1:5500` ya viene permitido en `CORS_ORIGIN`.

Si Supabase no responde, el servidor arranca igual y sirve la página, pero las
rutas que consultan datos devuelven `503`.

---

## 5. Cuentas de prueba

Las crea `seed.sql`. Estas contraseñas están escritas en el repositorio, así que
sirven para entrar la primera vez y nada más: las siete cuentas nacen con
`debe_cambiar_password = 1` y el sistema pide una contraseña propia antes de
abrir ninguna otra pantalla.

| Rol | Correo | Contraseña inicial |
|-----|--------|--------------------|
| Administrador | `admin@huellitas.com` | `Admin1234` |
| Veterinaria | `valentina@huellitas.com` | `Vet12345` |
| Veterinario | `andres@huellitas.com` | `Vet12345` |
| Veterinaria | `paula@huellitas.com` | `Vet12345` |
| Veterinario | `julian@huellitas.com` | `Vet12345` |
| Cliente | `daniela@correo.com` | `Cliente123` |
| Cliente | `carlos@correo.com` | `Cliente123` |

Si tu base ya estaba cargada antes de este cambio, ejecuta
`database/supabase/migracion-seguridad.sql` en el editor SQL de Supabase: crea
las tablas del segundo factor, pone la marca en las siete cuentas y cierra las
sesiones abiertas.

### Verificación en dos pasos

La administración no puede entrar sin segundo factor. Se configura desde
**Seguridad de mi cuenta**, en la barra lateral de cualquier panel: la
aplicación de códigos (Google Authenticator, Aegis, 1Password…) recibe una
clave y a partir de ahí el ingreso pide seis cifras además de la contraseña.
Al activarlo se entregan ocho códigos de recuperación, de un solo uso, para
entrar sin el teléfono.

Para exigirlo también al personal clínico, `MFA_ROLES=admin,veterinario` en el
`.env`. Avisa antes al equipo: el bloqueo empieza en su siguiente ingreso.

---

## 6. Estructura

```
proyecto/
├── api/
│   └── index.js                    entrada de la función serverless de Vercel
├── scripts/
│   ├── configurar.js               asistente que rellena y valida el .env
│   └── deploy.js                   migración + variables + despliegue en un paso
├── vercel.json                     rutas, cabeceras, URLs limpias y carpeta estática
├── eslint.config.js                reglas del linter (ver 6.2)
│
├── backend/
│   ├── scripts/setup-db.js         carga el esquema y el seed en Supabase
│   ├── test/                       pruebas unitarias (`npm test`, ver 6.2)
│   └── src/
│       ├── config/                 env.js, database.js (pool de pg + search_path)
│       ├── controllers/            auth, seguridad, mascotas, citas, servicios,
│       │                           veterinarios, usuarios, dashboard, historia,
│       │                           inventario, facturas, notificaciones, reportes
│       ├── middleware/             auth, roles (permisos), validation, rateLimit,
│       │                           errorHandler, upload
│       ├── models/                 consultas SQL parametrizadas
│       ├── routes/                 una por recurso + index.js
│       ├── services/               auth, agenda, storage, facturacion (cuentas puras),
│       │                           notificaciones (avisos y recordatorios)
│       ├── utils/                  ApiError, jwt, fechas, esquemas (zod), consecutivos
│       ├── app.js                  middleware, CORS, helmet, estáticos
│       └── server.js               arranque y cierre ordenado
│
├── database/
│   ├── supabase/
│   │   ├── schema.sql              10 esquemas y 71 tablas + triggers, vistas y RLS  ← el vigente
│   │   └── seed.sql                sedes, permisos, equipo y datos demo
│   ├── schema.sql                  versión MySQL antigua (solo referencia)
│   └── seed.sql                    versión MySQL antigua (solo referencia)
│
├── frontend/                       lo que Vercel publica como sitio estático
│   ├── index.html                  página pública
│   ├── login.html, registro.html
│   ├── notificaciones.html         bandeja de avisos, común a los tres roles
│   ├── cliente/                    dashboard, mascotas, agendar, citas, historia,
│   │                               facturas, perfil
│   ├── veterinario/                dashboard, agenda, pacientes, historia
│   ├── admin/                      dashboard, citas, usuarios, veterinarios,
│   │                               servicios, inventario, facturación, reportes,
│   │                               seguridad
│   ├── css/                        style.css (landing) + panel.css (paneles)
│   ├── js/                         api.js, panel.js, sprite.js y un archivo por página
│   └── iconos/
│
├── uploads/                        solo desarrollo: en producción va a Storage
├── .env.example
├── .env                            local, no se sube: configuración de la aplicación
├── .env.deploy                     local, no se sube: solo el token de Vercel
└── README.md
```

> `package.json` está duplicado a propósito: el de la raíz es el que usa Vercel
> y el de `backend/` permite trabajar con `cd backend && npm install`. Si añades
> una dependencia, ponla en los dos.

### 6.1 La base de datos, por módulos

`schema.sql` no deja las tablas sueltas en `public`: crea **un esquema de
PostgreSQL por módulo**, así que el nombre completo de cada tabla dice a qué
parte del sistema pertenece (`agenda.citas`, `seguridad.permisos`,
`historia_clinica.consultas`).

```
veterinaria_db/
├── configuracion/     sedes · configuraciones · horarios_sede
├── seguridad/         roles · permisos · rol_permisos · sesiones ·
│                      tokens_recuperacion · intentos_login · accesos · auditoria
├── usuarios/          usuarios · clientes · veterinarios · empleados ·
│                      contactos_emergencia
├── mascotas/          especies · razas · mascotas · mascotas_contactos ·
│                      alergias · mascota_alergias · condiciones_medicas ·
│                      mascota_condiciones · historial_peso
├── agenda/            servicios · veterinario_servicios · horarios_veterinarios ·
│                      bloqueos_agenda · citas · cita_historial
├── historia_clinica/  historias_clinicas · consultas · signos_vitales ·
│                      catalogo_diagnosticos · consulta_diagnosticos ·
│                      tratamientos · medicamentos · prescripciones · vacunas ·
│                      lotes_vacunas · aplicaciones_vacunas · tipos_examen ·
│                      examenes · resultados_examenes · cirugias ·
│                      cirugia_personal · hospitalizaciones ·
│                      hospitalizacion_controles · documentos_clinicos
├── inventario/        categorias_productos · proveedores · productos ·
│                      ubicaciones_inventario · existencias · lotes · compras ·
│                      detalle_compras · movimientos_inventario ·
│                      transferencias_inventario · detalle_transferencias
├── facturacion/       facturas · detalle_facturas · pagos · devoluciones ·
│                      detalle_devoluciones
├── comunicacion/      notificaciones · plantillas_notificaciones · recordatorios
└── archivos/          documentos_facturacion · archivos_adjuntos
```

Los documentos clínicos viven en `historia_clinica.documentos_clinicos` porque
forman parte de la historia; `archivos/` guarda los soportes de facturación y
los adjuntos genéricos.

**Cómo funciona sin escribir el esquema en cada consulta.** La aplicación se
conecta mandando el `search_path` en el arranque de la conexión
(`config/database.js`), así que las consultas siguen escribiendo `FROM citas`
y PostgreSQL resuelve `agenda.citas`. Va como parámetro `options` de la
conexión y no como un `SET` posterior porque el pooler de Supabase trabaja en
modo transacción, donde un `SET` suelto puede no acompañar a la consulta
siguiente.

**Automatismos que trae la base:**

| Disparador | Qué hace |
|-----------|----------|
| `trg_mascota_historia` | toda mascota nueva abre su historia clínica |
| `trg_citas_historial` | cada cambio de estado de una cita deja su renglón en `cita_historial` |
| `trg_signos_peso` | el peso de una consulta se copia a la ficha y a `historial_peso` |
| `trg_movimiento_stock` | cada movimiento ajusta `productos.cantidad` y `existencias` |
| `trg_pagos_factura` | un pago recalcula el saldo y el estado de la factura |

---

### 6.2 Pruebas y linter

```bash
npm test        # pruebas unitarias
npm run lint    # revisa todo el proyecto
npm run lint:fix
```

Las pruebas usan el runner que trae Node (`node --test`), sin ninguna
dependencia extra, y no tocan la base de datos: todas prueban funciones puras o
con dependencias falsas, así que corren en menos de un segundo y sirven igual
sin conexión a Supabase.

Están cubiertas las piezas donde un error no se ve venir:

| Archivo | Qué protege |
|---|---|
| `fechas.test.js` | Que una cita no se desplace de día o de hora (todo se maneja en hora local, nunca UTC) |
| `placeholders.test.js` | La traducción de `?` a `$1, $2…`, por la que pasa **toda** consulta del sistema |
| `esquemas.test.js` | Que la validación de entradas siga rechazando lo que debe rechazar |
| `agenda.test.js` | Las reglas de reserva: nada en el pasado, fuera de la ventana ni en día cerrado |
| `errores.test.js` | Que un fallo de PostgreSQL llegue al usuario como un mensaje con sentido y no como un 500 |

El linter está configurado en `eslint.config.js` con las reglas que atrapan
errores de verdad, no las de estilo. La más importante es `no-empty` sin
`allowEmptyCatch`: un `catch` vacío se traga el fallo y deja el problema sin
rastro, así que el linter no lo deja pasar. Si de verdad hay que ignorar un
error, se escribe dentro del `catch` por qué.

## 7. API

Base: `/api`. Autenticación con **JWT** en `Authorization: Bearer <token>`.

### Autenticación
| Método | Ruta | Acceso |
|--------|------|--------|
| POST | `/auth/registro` | público (cliente; con `rol` + `codigoAcceso`, veterinario o admin) |
| POST | `/auth/login` | público |
| POST | `/auth/logout` | autenticado (cierra la sesión en la base) |
| POST | `/auth/recuperar` | público (token de un solo uso) |
| POST | `/auth/restablecer` | público (con el token anterior) |
| GET | `/auth/me` | autenticado (devuelve también sus permisos) |
| PUT | `/auth/perfil` | autenticado |
| PUT | `/auth/password` | autenticado (cierra las demás sesiones) |

### Seguridad
| Método | Ruta | Permiso |
|--------|------|---------|
| GET | `/seguridad/permisos` | cualquier sesión (los suyos) |
| GET | `/seguridad/roles` | `roles.ver` |
| GET | `/seguridad/sesiones` | `sesiones.ver` |
| DELETE | `/seguridad/sesiones/:usuarioId` | `sesiones.cerrar` |
| GET | `/seguridad/accesos` | `auditoria.ver` |
| GET | `/seguridad/intentos` | `auditoria.ver` |
| GET | `/seguridad/auditoria` | `auditoria.ver` |
| GET | `/seguridad/codigo-acceso` | `usuarios.crear` (los códigos de todos los roles) |
| POST | `/seguridad/codigo-acceso/rotar` | `usuarios.crear` + contraseña (por `rol`) |

### Mascotas
| Método | Ruta | Acceso |
|--------|------|--------|
| GET | `/mascotas` | cliente (las suyas) · clínica (todas) |
| POST | `/mascotas` | cliente · clínica (con `clienteId`) |
| GET/PUT/DELETE | `/mascotas/:id` | dueño o admin |
| POST | `/mascotas/:id/foto` | dueño o admin |

### Servicios y veterinarios
| Método | Ruta | Acceso |
|--------|------|--------|
| GET | `/servicios`, `/servicios/:id`, `/servicios/:id/veterinarios` | público |
| POST/PUT/DELETE | `/servicios`, `/servicios/:id` | admin |
| GET | `/veterinarios`, `/veterinarios/:id`, `/veterinarios/:id/horarios` | público |
| POST/PUT | `/veterinarios`, `/veterinarios/:id` | admin |
| PUT | `/veterinarios/:id/horarios` | el propio veterinario o admin |
| GET/POST/DELETE | `/veterinarios/:id/bloqueos` | el propio veterinario o admin |

### Citas
| Método | Ruta | Acceso |
|--------|------|--------|
| GET | `/citas/disponibilidad?veterinarioId=&servicioId=&fecha=` | autenticado |
| GET | `/citas` | recorte según el rol |
| POST | `/citas` | cliente o clínica |
| PATCH | `/citas/:id/estado` | cliente (solo cancelar) · clínica (todo) |
| DELETE | `/citas/:id` | atajo de cancelación |

### Historia clínica
| Método | Ruta | Permiso |
|--------|------|---------|
| GET | `/historia/mascota/:id` | dueño (`historia.ver_propia`) · clínica (`historia.ver_todas`) |
| GET | `/historia/catalogos` | `consultas.crear` o `historia.ver_todas` |
| GET | `/historia/refuerzos?dias=` | `historia.ver_todas` |
| GET | `/historia/consultas` | según el rol |
| POST | `/historia/consultas` | `consultas.crear` |
| GET | `/historia/consultas/:id` | según el rol |
| PUT | `/historia/consultas/:id` | `consultas.editar` (solo quien la registró) |
| POST | `/historia/vacunas` | `vacunas.aplicar` |
| POST | `/historia/examenes` | `examenes.gestionar` |
| PUT | `/historia/examenes/:id/resultados` | `examenes.gestionar` |

Una consulta se guarda entera —constantes, diagnósticos, tratamientos y
recetas— en una sola transacción, y si venía de una cita la deja atendida.

### Inventario
| Método | Ruta | Permiso |
|--------|------|---------|
| GET | `/inventario/productos`, `/inventario/productos/:id` | `inventario.ver` |
| POST/PUT/DELETE | `/inventario/productos`, `/inventario/productos/:id` | `inventario.gestionar` |
| POST/DELETE | `/inventario/productos/:id/foto` | `inventario.gestionar` |
| GET/POST | `/inventario/movimientos` | `inventario.ver` / `inventario.gestionar` |
| GET | `/inventario/catalogos`, `/inventario/alertas?dias=` | `inventario.ver` |
| GET | `/inventario/proveedores` | `inventario.ver` |
| POST/PUT | `/inventario/proveedores`, `/inventario/proveedores/:id` | `compras.gestionar` |
| GET/POST | `/inventario/compras`, `/inventario/compras/:id` | `compras.gestionar` |

El stock **nunca** se escribe a mano: todo pasa por `movimientos_inventario` y
lo ajusta el disparador de la base, así que el kardex y las existencias no
pueden contradecirse. Un `ajuste` fija el total que queda, no una diferencia.

### Facturación
| Método | Ruta | Permiso |
|--------|------|---------|
| GET | `/facturas` | cliente (`facturas.ver_propias`) · clínica (`facturas.ver_todas`) |
| GET | `/facturas/resumen` | `facturas.ver_todas` |
| POST | `/facturas` | `facturas.crear` |
| GET | `/facturas/:id` | dueño o clínica |
| POST | `/facturas/:id/pagos` | `pagos.registrar` |
| DELETE | `/facturas/:id/pagos/:pagoId` | `pagos.registrar` |
| POST | `/facturas/:id/anular` | `facturas.crear` (solo sin pagos) |
| POST | `/facturas/:id/devoluciones` | `devoluciones.gestionar` |

Facturar un producto lo descuenta del inventario en la misma transacción;
anular la factura lo devuelve. El estado (pendiente / parcial / pagada) lo
recalcula un disparador cada vez que se toca un pago.

### Avisos y reportes
| Método | Ruta | Permiso |
|--------|------|---------|
| GET | `/notificaciones` | `notificaciones.ver` (las propias) |
| POST | `/notificaciones` | `notificaciones.enviar` (a una persona o a un rol) |
| PATCH | `/notificaciones/:id/leida` | `notificaciones.ver` |
| POST | `/notificaciones/leer-todas` | `notificaciones.ver` |
| DELETE | `/notificaciones/:id` | `notificaciones.ver` |
| GET | `/notificaciones/recordatorios` | `notificaciones.ver` |
| POST/DELETE | `/notificaciones/recordatorios`, `/recordatorios/:id` | `recordatorios.gestionar` |
| POST | `/notificaciones/recordatorios/procesar` | `notificaciones.ver` |
| GET | `/notificaciones/plantillas` | `notificaciones.enviar` |
| GET | `/reportes?desde=&hasta=&agrupacion=dia\|mes` | `reportes.ver` |

### Administración
| Método | Ruta | Acceso |
|--------|------|--------|
| GET/POST | `/usuarios` | admin |
| PATCH | `/usuarios/:id/estado`, `/usuarios/:id/rol` | admin |
| GET | `/clientes` | veterinario o admin |
| GET | `/dashboard` | autenticado (responde según el rol) |
| GET | `/salud` | público |

---

## 8. Reglas del sistema de citas

Las cuatro prohibiciones del requisito se aplican **en el servidor**, no solo en
la interfaz:

1. **No se reservan horarios ocupados.** `agenda.service.js` calcula los huecos
   descontando las citas activas y los bloqueos del veterinario.
2. **No se reservan fechas pasadas.** Se rechaza cualquier fecha anterior a hoy,
   y para hoy se exige una anticipación mínima (`CITAS_ANTICIPACION_MIN`).
3. **No se agenda fuera del horario.** El turno debe caber dentro de una franja
   de `horarios_veterinario` y del horario de la clínica (`CLINICA_APERTURA` /
   `CLINICA_CIERRE`).
4. **Un veterinario no puede tener dos citas simultáneas.** Tres capas:
   - el cálculo de disponibilidad no ofrece el horario;
   - al confirmar, una transacción con `SELECT … FOR UPDATE` vuelve a comprobar
     el solapamiento;
   - en la base, el índice único `(veterinario_id, slot_ocupado)` lo impide
     incluso si alguien escribiera directo en la base de datos. La columna
     `slot_ocupado` es una columna generada que vale `NULL` cuando la cita se
     cancela, y en un índice único de PostgreSQL los `NULL` no chocan entre sí,
     así que el hueco vuelve a quedar libre.

Parámetros configurables en `.env`: horario de la clínica, días de atención,
anticipación mínima y cuántos días hacia adelante se abre la agenda.

### Sobre la hora

Las fechas se guardan en columnas `TIMESTAMP` **sin zona horaria**, en hora local
de la clínica. Para que servidor y base coincidan:

- `schema.sql` fija la zona de la base con `ALTER DATABASE … SET timezone`;
- `config/env.js` fija la del proceso con la variable `TZ`.

Por eso `CLINICA_TZ=America/Bogota` es obligatoria en Vercel: sus servidores
arrancan en UTC y, sin ella, "hoy" y la anticipación mínima saldrían con cinco
horas de diferencia. Al arrancar, el servidor compara su zona con la de la base
y avisa por consola si no coinciden.

---

## 9. Seguridad implementada

### Permisos: el rol agrupa, el permiso decide

Las rutas ya no preguntan «¿eres admin?» sino «¿tienes este permiso?». Los
permisos son filas de `seguridad.permisos` con código `modulo.accion`
(`citas.crear`, `auditoria.ver`…), y `seguridad.rol_permisos` dice cuáles
tiene cada rol. Con el seed actual:

| Rol | Permisos | Alcance |
|-----|---------:|---------|
| `cliente` | 15 | sus mascotas, sus citas, su historia, sus facturas |
| `veterinario` | 28 | todo lo clínico y su agenda; nada de seguridad ni facturación |
| `admin` | 54 | todo, salvo los permisos que solo tienen sentido para un cliente |

Quitarle una capacidad a un rol es **un `DELETE` en `rol_permisos`**: la ruta
empieza a responder 403 y la opción desaparece del menú, sin tocar código. El
frontend guarda los permisos de la sesión solo para decidir qué pinta; quien
manda es el servidor, que los vuelve a comprobar en cada petición.

Crear un rol nuevo (recepción, auxiliar…) es insertar en `seguridad.roles` y
elegirle permisos; el backend no necesita cambios.

### Sesiones, intentos y rastro

- **Sesiones con estado** (`seguridad.sesiones`). Del token solo se guarda el
  hash SHA-256, nunca el token. Cerrar sesión, cambiar la contraseña o que un
  administrador bloquee la cuenta **invalidan el token de inmediato**, aunque
  al JWT le queden horas de vida. Cada token lleva un `jti` aleatorio: sin él,
  dos ingresos del mismo usuario en el mismo segundo generarían un JWT idéntico
  y la segunda sesión chocaría contra el índice único.
- **Bloqueo por intentos** (`seguridad.intentos_login`): tras 5 fallos seguidos
  con el mismo correo, esa cuenta queda en espera 15 minutos. Frena la fuerza
  bruta aunque el atacante cambie de IP, que es lo que el límite por IP no cubre.
  Los dos números salen de `configuracion.configuraciones` y se cambian sin
  volver a desplegar.
- **Accesos** (`seguridad.accesos`): entradas y salidas efectivas del sistema.
- **Auditoría** (`seguridad.auditoria`): quién cambió qué, con el antes y el
  después en JSON y la IP. Lo escribe el backend, que es el único que sabe qué
  usuario hay detrás de cada petición.
- **Recuperación de contraseña** (`seguridad.tokens_recuperacion`): token de un
  solo uso con 30 minutos de vida; al usarlo se cierran todas las sesiones de
  esa cuenta. Sin servicio de correo montado, en desarrollo el token se
  devuelve en la respuesta para poder probar el flujo; en producción no.

Todo esto se ve en **Administración → Seguridad**.

### Lo demás

- Contraseñas con **bcrypt** (10 rondas). Nunca se devuelve el hash.
- **JWT** firmado con `JWT_SECRET`; en producción es obligatorio y de 32+ caracteres.
- El usuario y sus permisos se **recargan de la base en cada petición**:
  desactivar una cuenta o revocar un permiso corta el acceso al instante.
- Comprobación de **propiedad** además del permiso: un cliente con
  `citas.ver_propias` solo ve las suyas; la clínica, con `citas.ver_todas`,
  las ve todas.
- El **tipo de cuenta se elige en el registro**. La de dueño de mascota se
  crea sola; las de veterinario y administración piden el **código de acceso
  de ese rol** (`VET-…` y `ADM-…`), y cada código se comprueba solo contra el
  rol que se pidió: el de veterinario no sirve para pedir una cuenta de
  administración. El admin los ve y los cambia en Administración → Seguridad →
  Código de acceso. Se guardan cifrados en `configuracion.configuraciones` —el
  admin necesita poder volver a leerlos, así que no se pueden hashear—, cada
  fallo queda en `intentos_login` y a los ocho fallos desde una misma IP el
  registro con código deja de responder un cuarto de hora. **El código de
  administración abre el sistema entero**, así que se entrega con el mismo
  cuidado que una contraseña de administrador.
- **Consultas parametrizadas** en todas las llamadas a PostgreSQL.
- **RLS activado en todas las tablas, sin políticas.** Supabase publica una API
  REST con la clave `anon`; con RLS encendido y ninguna política, esa clave no
  puede leer ni escribir nada. Todo el acceso pasa por la API de Express, que es
  la que valida sesión, rol y propiedad.
- **Validación con zod** en cuerpo, parámetros y query.
- **Rate limiting**: 10 intentos de login por 15 min, 20 citas por hora, 300
  peticiones generales por 15 min.
- **Helmet** con CSP, **CORS** con lista de orígenes permitidos.
- **Subida de archivos** limitada a JPG/PNG/WebP, 3 MB, con nombre generado por
  el servidor (nunca el del cliente), guardada en Supabase Storage.
- Login con **mensaje y tiempo de respuesta uniformes**, para no revelar qué
  correos existen.
- **Cifrado en reposo del secreto del segundo factor** (AES-256-GCM, llave en
  `CIFRADO_CLAVE`). Es el único dato que no se puede hashear —el servidor lo
  necesita entero para recalcular el código—, así que se cifra: un volcado de
  `seguridad.mfa` ya no entrega el segundo factor de las cuentas de
  administración. Lo demás delicado sigue hasheado: contraseñas, tokens de
  sesión, de recuperación y códigos de respaldo.
- **Protección contra bots** en los formularios que se usan sin cuenta
  (registro, recuperación, avistamientos, solicitudes de adopción): campo
  trampa invisible, sello firmado por el servidor que se pide al pintar la
  página, y rechazo de clientes que se identifican como rastreadores. A quien
  ya inició sesión no se le pide nada.
- **Sin cookies de sesión.** El token viaja en `Authorization`, que el
  navegador no manda solo, así que no hay superficie de CSRF; CORS va con
  `credentials: false` para dejarlo dicho. Al cerrar sesión se manda
  `Clear-Site-Data`, por si el navegador se cierra antes de que el frontend
  limpie. Si algún día se añade una cookie, sale con `httpOnly`, `secure` y
  `sameSite: strict` por defecto (`app.js`).
- **Vigilancia de la base**: cada consulta se cronometra en un único punto
  (`config/database.js`). Las que pasan de `DB_CONSULTA_LENTA_MS` y las que
  fallan quedan en el registro con su SQL y su SQLSTATE —nunca con los
  parámetros, que llevan datos de pacientes—, y el resumen se consulta en
  `GET /api/seguridad/consultas` con el permiso `auditoria.ver`.
- **HTTPS obligatorio** en producción: redirección 308 desde HTTP en la propia
  aplicación, además del HSTS de helmet y de la redirección de Vercel.
- **Escaneo de dependencias**: `npm run auditar` (solo producción, nivel alto),
  `npm run auditar:todo` y `npm run auditar:versiones`. El primero corre solo
  antes de `npm run deploy`, así que no se publica con un fallo grave conocido.
- **Contenido del usuario escapado** al pintarlo: todo lo que entra en un
  `innerHTML` pasa por `escapar()` (`frontend/js/api.js`), y la CSP no permite
  scripts en línea, así que un nombre de mascota con etiquetas se ve como texto.

---

## 10. Qué falta (fases 4 a 10)

Las tablas de los diez módulos ya están creadas en
`database/supabase/schema.sql` —con sus disparadores, sus datos de ejemplo y
sus permisos en el catálogo—, falta la API y las pantallas:

- Consultas, signos vitales, diagnósticos, tratamientos y prescripciones
- Vacunas aplicadas y exámenes desde el panel del veterinario
- Cirugías y hospitalización con sus controles
- Inventario: existencias por ubicación, lotes, compras y transferencias
- Facturación: emisión, pagos y devoluciones
- Recordatorios automáticos y envío por correo o WhatsApp
- Sedes y parámetros editables desde el panel
- Reportes
- Blog

Los permisos de estos módulos ya existen (`consultas.crear`,
`inventario.gestionar`, `facturas.crear`…) y están asignados a los roles, así
que cada pantalla nueva solo tiene que declarar el suyo con
`requierePermiso(...)`.

---

## 11. Problemas frecuentes

| Síntoma | Causa probable |
|---------|----------------|
| Todo responde `503` | Falta `DATABASE_URL` o el proyecto de Supabase está en pausa (se pausa solo tras una semana sin uso) |
| `503` diciendo que faltan las tablas | No se ejecutó `npm run db:setup` |
| `relation "citas" does not exist` | La conexión no lleva el `search_path` de los diez esquemas. Lo manda `config/database.js`; si consultas desde otra herramienta, escribe el esquema (`agenda.citas`) o ejecuta `SET search_path TO configuracion, seguridad, usuarios, mascotas, agenda, historia_clinica, inventario, facturacion, comunicacion, archivos, public;` |
| La API devuelve `401` al entrar | Falta `JWT_SECRET` en Vercel, o cambió después de emitir el token |
| `401` "Tu sesión ya no está activa" con un token que parecía válido | La sesión se cerró en la base: cierre manual, cambio de contraseña, bloqueo de la cuenta, o se recargó la base con `npm run db:setup`. Hay que volver a iniciar sesión |
| `403` "Tu rol no tiene permiso para esta acción" | Al rol le falta ese permiso en `seguridad.rol_permisos`. Se ve en Administración → Seguridad |
| `429` al iniciar sesión | Cinco fallos seguidos con ese correo; espera 15 minutos o ajusta `seguridad.intentos_maximos` en `configuracion.configuraciones` |
| El login tarda varios segundos | Cada viaje a Supabase pesa; el login resuelve todo en dos consultas y debería responder en menos de un segundo. Si tarda más, suele ser la primera petición tras un rato de inactividad (conexión nueva al pooler) o una región de Supabase lejana |
| Las citas salen con horas corridas | Falta la variable `CLINICA_TZ` en Vercel |
| Todo pide iniciar sesión en Vercel | La protección de despliegue quedó encendida: Settings → Deployment Protection → Vercel Authentication → Disabled |
| El despliegue falla con *"No entrypoint found"* | El preset del proyecto no es **Other** |
| Una dirección funciona en local y da **404** en Vercel | Falta `"cleanUrls": true` en `vercel.json`. Express sirve `/login` por su cuenta gracias a `extensions: ['html']`; la capa estática de Vercel no lo hace sin esa opción, y entonces `/login` (sin `.html`) responde 404 solo en producción |
| La foto de la mascota no se guarda | Faltan `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`, o el bucket no es público |
| El frontend no encuentra la API en Live Server | El backend no está encendido, o falta el origen en `CORS_ORIGIN` |

---

## 12. Notas

- El módulo de **tienda** de la landing es demostrativo: todavía no hay carrito
  ni pedidos en el backend.
- Las tarjetas del tablero de **adopciones** de la landing están escritas en el
  HTML (foto y encuadre incluidos), pero cada una lleva en `data-publicacion` el
  id de su publicación en la base. `landing.js` las consulta al cargar la
  página: las que siguen disponibles cambian su enlace por el botón que abre el
  formulario de solicitud —que no pide cuenta— y las que ya tienen hogar lo
  dicen. Esas diez publicaciones se cargan con
  `database/supabase/tablero-adopciones.sql`, que hay que volver a ejecutar
  después de recargar la base. Al publicar una mascota nueva desde
  **Comunidad → Publicar en adopción** hay que añadir su tarjeta al HTML con el
  id que le tocó.
- El plan gratuito de Supabase **pausa el proyecto** tras una semana sin
  actividad; se reactiva desde el panel.
