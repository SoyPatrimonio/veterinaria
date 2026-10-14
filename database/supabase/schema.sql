-- =====================================================================
--  Huellitas de Amor — Esquema de base de datos  (veterinaria_db)
--  Motor: PostgreSQL 15+ (Supabase)
--
--  Ejecutar:  npm run db:setup
--  o pegarlo completo en el SQL Editor de Supabase.
--
--  La base está dividida en esquemas, uno por módulo:
--
--    configuracion    sedes, parámetros y horarios de la clínica
--    seguridad        roles, permisos, sesiones y pistas de auditoría
--    usuarios         cuentas y sus fichas (cliente, veterinario, empleado)
--    mascotas         pacientes y sus antecedentes
--    agenda           servicios, horarios y citas
--    historia_clinica consultas, tratamientos, vacunas, cirugías…
--    inventario       productos, existencias, compras y movimientos
--    facturacion      facturas, pagos y devoluciones
--    comunicacion     notificaciones y recordatorios
--    archivos         documentos y adjuntos
--    urgencias        triage, atención inmediata y salas
--    farmacia         recetas electrónicas, dispensación e interacciones
--    laboratorio      órdenes, muestras, resultados y validación
--    imagenes         radiografías, ecografías e informes
--    nutricion        evaluación nutricional y planes alimenticios
--    telemedicina     videoconsultas, chat y consentimientos
--    comunidad        identidad digital, mascotas perdidas y adopciones
--    tienda           catálogo en línea, pedidos y domicilios
--    fidelizacion     planes de salud, puntos y recompensas
--    soporte          PQRS, tickets y encuestas
--    personal         turnos, asistencia, ausencias y comisiones
--    equipos          equipos médicos y su mantenimiento
--    bioseguridad     protocolos, residuos e incidentes
--    integraciones    DIAN, pasarelas de pago y WhatsApp
--    alertas          reglas y alertas críticas del sistema
--    ia               asistente interno: resúmenes y sugerencias
--    prevencion       medicina preventiva, etapas de vida y crónicos
--    banco_sangre     donantes, unidades de sangre y transfusiones
--    banco_tejidos    donantes de tejido, muestras y su conservación
--    odontologia      odontogramas, limpiezas y procedimientos dentales
--    cardiologia      evaluación cardíaca, ECG y ecocardiografía
--    dermatologia     lesiones, pruebas y seguimiento con fotografías
--    oftalmologia     evaluación ocular, pruebas y tratamientos por ojo
--    rehabilitacion   fisioterapia, terapias y manejo del dolor
--    anestesia        protocolos, monitorización y recuperación
--    comportamiento   evaluación conductual, planes y evolución
--    genetica         perfiles, pruebas y antecedentes genéticos
--    reproduccion     ciclos, gestación, partos, camadas y neonatos
--    calidad          riesgo clínico, seguridad del paciente,
--                     control de infecciones y trazabilidad
--    interconsulta    segunda opinión y referencias a otras instituciones
--    atencion         colas, experiencia del cliente y agenda inteligente
--    dispositivos     monitoreo remoto del paciente e IoT clínico
--    gestion_residuos gestores, manifiestos y trazabilidad de residuos
--    contratos        contratos y gestión documental de proveedores
--    sucursales       configuración, metas e indicadores por sede
--    finanzas         cuentas por cobrar y pagar, gastos y comisiones
--    centro_operaciones  tablero en vivo de toda la clínica
--    automatizacion   motor de reglas y workflows
--    documentos       versiones, firmas y vencimientos de documentos
--    continuidad      planes de contingencia y recuperación
--
--  El backend se conecta con search_path apuntando a todos ellos, así que
--  las consultas pueden nombrar las tablas sin prefijo. Por eso los nombres
--  de tabla no se repiten entre esquemas.
--
--  Es idempotente: borra los esquemas del proyecto y los vuelve a crear.
-- =====================================================================

-- ---------------------------------------------------------------------
--  Zona horaria
--  Todas las fechas se guardan como TIMESTAMP sin zona, en hora local de
--  la clínica. Fijar la zona de la base evita que NOW() y las fechas
--  guardadas queden desfasadas cinco horas respecto a UTC.
-- ---------------------------------------------------------------------
DO $huellitas$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'America/Bogota');
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Sin permiso para fijar la zona horaria de la base; se usará la de la sesión.';
END
$huellitas$;

SET TIME ZONE 'America/Bogota';

-- ---------------------------------------------------------------------
--  Limpieza previa
--
--  Primero los esquemas de módulos (si ya existían) y después las tablas
--  sueltas que dejó la versión anterior en public, para que una base ya
--  cargada quede limpia sin tocar lo que Supabase pone en public.
-- ---------------------------------------------------------------------
DROP SCHEMA IF EXISTS
  continuidad, documentos, automatizacion, centro_operaciones, finanzas,
  sucursales, contratos, gestion_residuos, dispositivos, atencion,
  interconsulta, calidad, reproduccion, genetica, comportamiento, anestesia,
  rehabilitacion, oftalmologia, dermatologia, cardiologia, odontologia,
  banco_tejidos, banco_sangre, prevencion,
  ia, alertas, integraciones, bioseguridad, equipos, personal, soporte,
  fidelizacion, tienda, comunidad, telemedicina, nutricion, imagenes,
  laboratorio, farmacia, urgencias,
  archivos, comunicacion, facturacion, inventario, historia_clinica,
  agenda, mascotas, usuarios, seguridad, configuracion
CASCADE;

DROP VIEW IF EXISTS public.v_citas_detalle CASCADE;

DROP TABLE IF EXISTS
  public.notificaciones, public.pagos, public.detalle_factura, public.facturas,
  public.movimientos_inventario, public.productos, public.proveedores,
  public.categorias_productos, public.documentos, public.examenes, public.cirugias,
  public.alergias, public.mascota_vacunas, public.vacunas,
  public.tratamiento_medicamentos, public.tratamientos, public.medicamentos,
  public.diagnosticos, public.consultas, public.historias_clinicas,
  public.citas, public.servicio_veterinario, public.servicios,
  public.mascotas, public.razas, public.especies,
  public.bloqueos_veterinario, public.horarios_veterinario, public.veterinarios,
  public.clientes, public.usuarios, public.roles
CASCADE;

DROP FUNCTION IF EXISTS public.trg_set_actualizado_en() CASCADE;
DROP FUNCTION IF EXISTS public.trg_abrir_historia_clinica() CASCADE;
DROP FUNCTION IF EXISTS public.trg_ajustar_stock() CASCADE;

-- ---------------------------------------------------------------------
--  Esquemas
-- ---------------------------------------------------------------------
CREATE SCHEMA configuracion;
CREATE SCHEMA seguridad;
CREATE SCHEMA usuarios;
CREATE SCHEMA mascotas;
CREATE SCHEMA agenda;
CREATE SCHEMA historia_clinica;
CREATE SCHEMA inventario;
CREATE SCHEMA facturacion;
CREATE SCHEMA comunicacion;
CREATE SCHEMA archivos;
CREATE SCHEMA urgencias;
CREATE SCHEMA farmacia;
CREATE SCHEMA laboratorio;
CREATE SCHEMA imagenes;
CREATE SCHEMA nutricion;
CREATE SCHEMA telemedicina;
CREATE SCHEMA comunidad;
CREATE SCHEMA tienda;
CREATE SCHEMA fidelizacion;
CREATE SCHEMA soporte;
CREATE SCHEMA personal;
CREATE SCHEMA equipos;
CREATE SCHEMA bioseguridad;
CREATE SCHEMA integraciones;
CREATE SCHEMA alertas;
CREATE SCHEMA ia;
CREATE SCHEMA prevencion;
CREATE SCHEMA banco_sangre;
CREATE SCHEMA banco_tejidos;
CREATE SCHEMA odontologia;
CREATE SCHEMA cardiologia;
CREATE SCHEMA dermatologia;
CREATE SCHEMA oftalmologia;
CREATE SCHEMA rehabilitacion;
CREATE SCHEMA anestesia;
CREATE SCHEMA comportamiento;
CREATE SCHEMA genetica;
CREATE SCHEMA reproduccion;
CREATE SCHEMA calidad;
CREATE SCHEMA interconsulta;
CREATE SCHEMA atencion;
CREATE SCHEMA dispositivos;
CREATE SCHEMA gestion_residuos;
CREATE SCHEMA contratos;
CREATE SCHEMA sucursales;
CREATE SCHEMA finanzas;
CREATE SCHEMA centro_operaciones;
CREATE SCHEMA automatizacion;
CREATE SCHEMA documentos;
CREATE SCHEMA continuidad;

COMMENT ON SCHEMA configuracion    IS 'Sedes, parámetros y horarios de la clínica';
COMMENT ON SCHEMA seguridad        IS 'Roles, permisos, sesiones y auditoría';
COMMENT ON SCHEMA usuarios         IS 'Cuentas de acceso y sus fichas';
COMMENT ON SCHEMA mascotas         IS 'Pacientes y sus antecedentes';
COMMENT ON SCHEMA agenda           IS 'Servicios, horarios y citas';
COMMENT ON SCHEMA historia_clinica IS 'Historia clínica de cada paciente';
COMMENT ON SCHEMA inventario       IS 'Productos, existencias y compras';
COMMENT ON SCHEMA facturacion      IS 'Facturas, pagos y devoluciones';
COMMENT ON SCHEMA comunicacion     IS 'Notificaciones y recordatorios';
COMMENT ON SCHEMA archivos         IS 'Documentos y archivos adjuntos';
COMMENT ON SCHEMA urgencias        IS 'Triage, atención inmediata y salas de urgencias';
COMMENT ON SCHEMA farmacia         IS 'Recetas electrónicas, dispensación e interacciones';
COMMENT ON SCHEMA laboratorio      IS 'Órdenes, muestras, resultados y validación';
COMMENT ON SCHEMA imagenes         IS 'Estudios de imagen e informes radiológicos';
COMMENT ON SCHEMA nutricion        IS 'Evaluación nutricional y planes alimenticios';
COMMENT ON SCHEMA telemedicina     IS 'Videoconsultas, chat y consentimientos remotos';
COMMENT ON SCHEMA comunidad        IS 'Identidad digital, mascotas perdidas y adopciones';
COMMENT ON SCHEMA tienda           IS 'Catálogo en línea, pedidos y domicilios';
COMMENT ON SCHEMA fidelizacion     IS 'Planes de salud, puntos y recompensas';
COMMENT ON SCHEMA soporte          IS 'PQRS, tickets y encuestas de satisfacción';
COMMENT ON SCHEMA personal         IS 'Turnos, asistencia, ausencias y comisiones';
COMMENT ON SCHEMA equipos          IS 'Equipos médicos, mantenimiento y calibración';
COMMENT ON SCHEMA bioseguridad     IS 'Protocolos, residuos e incidentes';
COMMENT ON SCHEMA integraciones    IS 'DIAN, pasarelas de pago y mensajería';
COMMENT ON SCHEMA alertas          IS 'Reglas y alertas críticas del sistema';
COMMENT ON SCHEMA ia               IS 'Asistente interno: resúmenes y sugerencias';
COMMENT ON SCHEMA prevencion       IS 'Medicina preventiva, etapas de vida y pacientes crónicos';
COMMENT ON SCHEMA banco_sangre     IS 'Donantes, unidades de sangre, transfusiones y su stock';
COMMENT ON SCHEMA banco_tejidos    IS 'Donantes de tejido, muestras y conservación';
COMMENT ON SCHEMA odontologia      IS 'Odontogramas, limpiezas y procedimientos dentales';
COMMENT ON SCHEMA cardiologia      IS 'Evaluación cardíaca, ECG, ecocardiografía y seguimiento';
COMMENT ON SCHEMA dermatologia     IS 'Lesiones, pruebas y seguimiento dermatológico';
COMMENT ON SCHEMA oftalmologia     IS 'Evaluación ocular, pruebas y tratamientos por ojo';
COMMENT ON SCHEMA rehabilitacion   IS 'Fisioterapia, terapias y manejo del dolor';
COMMENT ON SCHEMA anestesia        IS 'Protocolos, monitorización y recuperación anestésica';
COMMENT ON SCHEMA comportamiento   IS 'Evaluación conductual, planes y evolución';
COMMENT ON SCHEMA genetica         IS 'Perfiles, pruebas y antecedentes genéticos';
COMMENT ON SCHEMA reproduccion     IS 'Ciclos, gestación, partos, camadas y neonatología';
COMMENT ON SCHEMA calidad          IS 'Riesgo clínico, seguridad del paciente, infecciones y trazabilidad';
COMMENT ON SCHEMA interconsulta    IS 'Segunda opinión y referencias a otras instituciones';
COMMENT ON SCHEMA atencion         IS 'Colas, experiencia del cliente y agenda inteligente';
COMMENT ON SCHEMA dispositivos     IS 'Monitoreo remoto del paciente e IoT clínico';
COMMENT ON SCHEMA gestion_residuos IS 'Gestores, manifiestos y trazabilidad de residuos';
COMMENT ON SCHEMA contratos        IS 'Contratos y gestión documental de proveedores';
COMMENT ON SCHEMA sucursales       IS 'Configuración, metas e indicadores por sede';
COMMENT ON SCHEMA finanzas         IS 'Cuentas por cobrar y pagar, gastos, presupuestos y comisiones';
COMMENT ON SCHEMA centro_operaciones IS 'Tablero en vivo de toda la clínica';
COMMENT ON SCHEMA automatizacion   IS 'Motor de reglas y motor de workflows';
COMMENT ON SCHEMA documentos       IS 'Versiones, firmas, permisos y vencimientos de documentos';
COMMENT ON SCHEMA continuidad      IS 'Planes de contingencia, incidentes y recuperación';

-- Con esto las consultas del backend pueden escribir `FROM citas` en vez de
-- `FROM agenda.citas`. El rol de Supabase trae su propio search_path, que pesa
-- más que el de la base, así que la aplicación además lo manda en la conexión.
SET search_path TO configuracion, seguridad, usuarios, mascotas, agenda,
                   historia_clinica, inventario, facturacion, comunicacion,
                   archivos, urgencias, farmacia, laboratorio, imagenes,
                   nutricion, telemedicina, comunidad, tienda, fidelizacion,
                   soporte, personal, equipos, bioseguridad, integraciones,
                   alertas, ia, prevencion, banco_sangre, banco_tejidos,
                   odontologia, cardiologia, dermatologia, oftalmologia,
                   rehabilitacion, anestesia, comportamiento, genetica,
                   reproduccion, calidad, interconsulta, atencion, dispositivos,
                   gestion_residuos, contratos, sucursales, finanzas,
                   centro_operaciones, automatizacion, documentos, continuidad,
                   public, extensions;

DO $huellitas$
DECLARE
  ruta CONSTANT text :=
    'configuracion, seguridad, usuarios, mascotas, agenda, historia_clinica, '
    'inventario, facturacion, comunicacion, archivos, urgencias, farmacia, '
    'laboratorio, imagenes, nutricion, telemedicina, comunidad, tienda, '
    'fidelizacion, soporte, personal, equipos, bioseguridad, integraciones, '
    'alertas, ia, prevencion, banco_sangre, banco_tejidos, odontologia, '
    'cardiologia, dermatologia, oftalmologia, rehabilitacion, anestesia, '
    'comportamiento, genetica, reproduccion, calidad, interconsulta, '
    'atencion, dispositivos, gestion_residuos, contratos, sucursales, '
    'finanzas, centro_operaciones, automatizacion, documentos, continuidad, '
    'public, extensions';
BEGIN
  EXECUTE format('ALTER DATABASE %I SET search_path TO %s', current_database(), ruta);
  EXECUTE format('ALTER ROLE %I IN DATABASE %I SET search_path TO %s',
                 current_user, current_database(), ruta);
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Sin permiso para fijar el search_path; la aplicación lo envía en la conexión.';
END
$huellitas$;

-- Función común de los disparadores de fecha de modificación.
CREATE FUNCTION public.trg_set_actualizado_en() RETURNS trigger AS $$
BEGIN
  NEW.actualizado_en := LOCALTIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- La lista de esquemas del proyecto en un solo sitio. La usan el bloque de RLS
-- del final de este archivo y el TRUNCATE de seed.sql; tenerla escrita una vez
-- evita que al añadir un módulo se quede alguno de los dos sin actualizar y una
-- tabla nueva acabe expuesta a la API pública de Supabase.
CREATE OR REPLACE FUNCTION public.huellitas_esquemas() RETURNS text[] AS $$
  SELECT ARRAY[
    'configuracion','seguridad','usuarios','mascotas','agenda','historia_clinica',
    'inventario','facturacion','comunicacion','archivos','urgencias','farmacia',
    'laboratorio','imagenes','nutricion','telemedicina','comunidad','tienda',
    'fidelizacion','soporte','personal','equipos','bioseguridad','integraciones',
    'alertas','ia',
    'prevencion','banco_sangre','banco_tejidos','odontologia','cardiologia',
    'dermatologia','oftalmologia','rehabilitacion','anestesia','comportamiento',
    'genetica','reproduccion','calidad','interconsulta','atencion','dispositivos',
    'gestion_residuos','contratos','sucursales','finanzas','centro_operaciones',
    'automatizacion','documentos','continuidad'
  ];
$$ LANGUAGE sql IMMUTABLE;


-- =====================================================================
--  MÓDULO 1 · CONFIGURACION
-- =====================================================================

-- Sedes de la clínica. Todo lo operativo (citas, inventario, facturas)
-- cuelga de una sede para que el día de mañana haya más de una.
CREATE TABLE configuracion.sedes (
  id             SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre         VARCHAR(120) NOT NULL,
  codigo         VARCHAR(20)  NOT NULL,
  direccion      VARCHAR(180) NULL,
  ciudad         VARCHAR(80)  NULL,
  telefono       VARCHAR(30)  NULL,
  email          VARCHAR(160) NULL,
  principal      SMALLINT NOT NULL DEFAULT 0,
  activo         SMALLINT NOT NULL DEFAULT 1,
  creado_en      TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  actualizado_en TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_sedes_codigo   UNIQUE (codigo),
  CONSTRAINT chk_sedes_activo    CHECK (activo IN (0,1)),
  CONSTRAINT chk_sedes_principal CHECK (principal IN (0,1))
);

CREATE TRIGGER trg_sedes_actualizado BEFORE UPDATE ON configuracion.sedes
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_actualizado_en();

-- Parámetros que hoy viven en el .env y que la administración puede cambiar
-- sin volver a desplegar (anticipación mínima, IVA, textos…).
CREATE TABLE configuracion.configuraciones (
  id             SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id        SMALLINT NULL,          -- NULL = vale para toda la clínica
  clave          VARCHAR(60)  NOT NULL,
  valor          VARCHAR(255) NOT NULL,
  tipo           VARCHAR(10)  NOT NULL DEFAULT 'texto',
  descripcion    VARCHAR(200) NULL,
  editable       SMALLINT NOT NULL DEFAULT 1,
  actualizado_en TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  -- NULLS NOT DISTINCT: sin esto podrían repetirse las claves globales,
  -- porque en un UNIQUE normal dos NULL no se consideran iguales.
  CONSTRAINT uq_configuraciones UNIQUE NULLS NOT DISTINCT (sede_id, clave),
  CONSTRAINT chk_configuraciones_tipo CHECK (tipo IN ('texto','numero','booleano','json','hora')),
  CONSTRAINT chk_configuraciones_editable CHECK (editable IN (0,1)),
  CONSTRAINT fk_configuraciones_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE CASCADE
);

CREATE TRIGGER trg_configuraciones_actualizado BEFORE UPDATE ON configuracion.configuraciones
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_actualizado_en();

-- Horario de atención de cada sede. Fuera de él no se agenda nada.
CREATE TABLE configuracion.horarios_sede (
  id            SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id       SMALLINT NOT NULL,
  dia_semana    SMALLINT NOT NULL,       -- 0=domingo … 6=sábado
  hora_apertura TIME(0) NULL,
  hora_cierre   TIME(0) NULL,
  cerrado       SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT uq_horarios_sede UNIQUE (sede_id, dia_semana),
  CONSTRAINT chk_horarios_sede_dia CHECK (dia_semana BETWEEN 0 AND 6),
  CONSTRAINT chk_horarios_sede_cerrado CHECK (cerrado IN (0,1)),
  CONSTRAINT chk_horarios_sede_rango CHECK (
    cerrado = 1 OR (hora_apertura IS NOT NULL AND hora_cierre IS NOT NULL AND hora_cierre > hora_apertura)),
  CONSTRAINT fk_horarios_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE CASCADE
);


-- =====================================================================
--  MÓDULO 2 · SEGURIDAD
-- =====================================================================

CREATE TABLE seguridad.roles (
  id          SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre      VARCHAR(30)  NOT NULL,     -- cliente | veterinario | admin
  descripcion VARCHAR(150) NULL,
  sistema     SMALLINT NOT NULL DEFAULT 1,   -- 1 = no se puede borrar
  CONSTRAINT uq_roles_nombre UNIQUE (nombre),
  CONSTRAINT chk_roles_sistema CHECK (sistema IN (0,1))
);

-- Catálogo de permisos. El código es `modulo.accion` y es lo que comprueba
-- el middleware del backend; el rol solo agrupa permisos.
CREATE TABLE seguridad.permisos (
  id          SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  codigo      VARCHAR(60)  NOT NULL,
  modulo      VARCHAR(30)  NOT NULL,
  nombre      VARCHAR(120) NOT NULL,
  descripcion VARCHAR(200) NULL,
  CONSTRAINT uq_permisos_codigo UNIQUE (codigo)
);
CREATE INDEX idx_permisos_modulo ON seguridad.permisos (modulo);

CREATE TABLE seguridad.rol_permisos (
  rol_id     SMALLINT NOT NULL,
  permiso_id SMALLINT NOT NULL,
  PRIMARY KEY (rol_id, permiso_id),
  CONSTRAINT fk_rol_permisos_rol FOREIGN KEY (rol_id)
    REFERENCES seguridad.roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_rol_permisos_permiso FOREIGN KEY (permiso_id)
    REFERENCES seguridad.permisos(id) ON DELETE CASCADE
);


-- =====================================================================
--  MÓDULO 3 · USUARIOS
--  (va antes que el resto de seguridad porque las sesiones y la auditoría
--   apuntan a usuarios.usuarios)
-- =====================================================================

CREATE TABLE usuarios.usuarios (
  id                     INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  rol_id                 SMALLINT NOT NULL,
  sede_id                SMALLINT NULL,
  nombre                 VARCHAR(120) NOT NULL,
  email                  VARCHAR(160) NOT NULL,
  telefono               VARCHAR(30)  NULL,
  password_hash          VARCHAR(255) NOT NULL,
  estado                 VARCHAR(10) NOT NULL DEFAULT 'activo',
  debe_cambiar_password  SMALLINT NOT NULL DEFAULT 0,
  ultimo_acceso          TIMESTAMP(0) NULL,
  creado_en              TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  actualizado_en         TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_usuarios_email UNIQUE (email),
  CONSTRAINT chk_usuarios_estado CHECK (estado IN ('activo','inactivo','bloqueado')),
  CONSTRAINT chk_usuarios_cambiar CHECK (debe_cambiar_password IN (0,1)),
  CONSTRAINT fk_usuarios_rol  FOREIGN KEY (rol_id)  REFERENCES seguridad.roles(id),
  CONSTRAINT fk_usuarios_sede FOREIGN KEY (sede_id) REFERENCES configuracion.sedes(id) ON DELETE SET NULL
);
CREATE INDEX idx_usuarios_rol_estado ON usuarios.usuarios (rol_id, estado);

CREATE TRIGGER trg_usuarios_actualizado BEFORE UPDATE ON usuarios.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_actualizado_en();

-- Ficha del cliente (dueño de mascotas)
CREATE TABLE usuarios.clientes (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  usuario_id     INTEGER NOT NULL,
  tipo_documento VARCHAR(10)  NOT NULL DEFAULT 'CC',
  documento      VARCHAR(30)  NULL,
  direccion      VARCHAR(180) NULL,
  ciudad         VARCHAR(80)  NULL,
  notas          TEXT NULL,
  creado_en      TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_clientes_usuario   UNIQUE (usuario_id),
  CONSTRAINT uq_clientes_documento UNIQUE (documento),
  CONSTRAINT chk_clientes_tipo_doc CHECK (tipo_documento IN ('CC','CE','NIT','PAS','TI')),
  CONSTRAINT fk_clientes_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios.usuarios(id) ON DELETE CASCADE
);

CREATE TABLE usuarios.veterinarios (
  id                INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  usuario_id        INTEGER NOT NULL,
  licencia          VARCHAR(40)  NOT NULL,
  especialidad      VARCHAR(30)  NOT NULL DEFAULT 'medicina_general',
  foto              VARCHAR(255) NULL,
  descripcion       TEXT NULL,
  duracion_slot_min SMALLINT NOT NULL DEFAULT 30,  -- granularidad de la agenda
  activo            SMALLINT NOT NULL DEFAULT 1,
  creado_en         TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_veterinarios_usuario  UNIQUE (usuario_id),
  CONSTRAINT uq_veterinarios_licencia UNIQUE (licencia),
  CONSTRAINT chk_veterinarios_especialidad CHECK (especialidad IN (
    'medicina_general','cirugia','dermatologia','cardiologia',
    'odontologia','exoticos','imagenes','felinos')),
  CONSTRAINT chk_veterinarios_activo CHECK (activo IN (0,1)),
  CONSTRAINT chk_veterinarios_slot   CHECK (duracion_slot_min > 0),
  CONSTRAINT fk_veterinarios_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios.usuarios(id) ON DELETE CASCADE
);

-- Personal que no es veterinario: recepción, auxiliares, administración.
CREATE TABLE usuarios.empleados (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  usuario_id     INTEGER NOT NULL,
  sede_id        SMALLINT NULL,
  cargo          VARCHAR(60) NOT NULL,
  documento      VARCHAR(30) NULL,
  fecha_ingreso  DATE NULL,
  fecha_retiro   DATE NULL,
  activo         SMALLINT NOT NULL DEFAULT 1,
  creado_en      TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_empleados_usuario   UNIQUE (usuario_id),
  CONSTRAINT uq_empleados_documento UNIQUE (documento),
  CONSTRAINT chk_empleados_activo CHECK (activo IN (0,1)),
  CONSTRAINT chk_empleados_fechas CHECK (fecha_retiro IS NULL OR fecha_ingreso IS NULL OR fecha_retiro >= fecha_ingreso),
  CONSTRAINT fk_empleados_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios.usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_empleados_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE SET NULL
);

-- A quién llamar si el dueño no contesta. Se comparte entre sus mascotas.
CREATE TABLE usuarios.contactos_emergencia (
  id         INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cliente_id INTEGER NOT NULL,
  nombre     VARCHAR(120) NOT NULL,
  parentesco VARCHAR(60)  NULL,
  telefono   VARCHAR(30)  NOT NULL,
  email      VARCHAR(160) NULL,
  principal  SMALLINT NOT NULL DEFAULT 0,
  creado_en  TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_contactos_principal CHECK (principal IN (0,1)),
  CONSTRAINT fk_contactos_cliente FOREIGN KEY (cliente_id)
    REFERENCES usuarios.clientes(id) ON DELETE CASCADE
);
CREATE INDEX idx_contactos_cliente ON usuarios.contactos_emergencia (cliente_id);


-- =====================================================================
--  MÓDULO 2 (continuación) · SEGURIDAD que depende de usuarios
-- =====================================================================

-- Sesiones abiertas. Se guarda el hash del token, nunca el token: si alguien
-- lee la tabla no puede suplantar a nadie. Cerrar sesión marca cerrada_en y
-- el middleware rechaza el token aunque el JWT siga vigente.
CREATE TABLE seguridad.sesiones (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  usuario_id  INTEGER NOT NULL,
  token_hash  CHAR(64) NOT NULL,
  ip          VARCHAR(45)  NULL,
  agente      VARCHAR(255) NULL,
  creada_en   TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  expira_en   TIMESTAMP(0) NOT NULL,
  ultima_vez  TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  cerrada_en  TIMESTAMP(0) NULL,
  motivo_cierre VARCHAR(30) NULL,
  CONSTRAINT uq_sesiones_token UNIQUE (token_hash),
  CONSTRAINT fk_sesiones_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios.usuarios(id) ON DELETE CASCADE
);
CREATE INDEX idx_sesiones_usuario ON seguridad.sesiones (usuario_id, cerrada_en);
CREATE INDEX idx_sesiones_expira  ON seguridad.sesiones (expira_en);

-- Recuperación de contraseña: token de un solo uso con caducidad corta.
CREATE TABLE seguridad.tokens_recuperacion (
  id         INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  usuario_id INTEGER NOT NULL,
  token_hash CHAR(64) NOT NULL,
  ip         VARCHAR(45) NULL,
  creado_en  TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  expira_en  TIMESTAMP(0) NOT NULL,
  usado_en   TIMESTAMP(0) NULL,
  CONSTRAINT uq_tokens_recuperacion UNIQUE (token_hash),
  CONSTRAINT fk_tokens_recuperacion_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios.usuarios(id) ON DELETE CASCADE
);
CREATE INDEX idx_tokens_recuperacion_usuario ON seguridad.tokens_recuperacion (usuario_id, usado_en);

-- ---------------------------------------------------------------------
--  Segundo factor (TOTP)
--
--  El secreto NO se puede hashear: el servidor necesita el original para
--  recalcular el código de seis cifras en cada ingreso. Por eso se guarda
--  cifrado (AES-256-GCM, backend/src/utils/cifrado.js) con una llave que
--  vive en el entorno y no en la base. Un volcado de esta tabla, entonces,
--  no entrega el segundo factor de nadie.
--
--  La columna es holgada porque el valor cifrado lleva dentro el nonce y la
--  etiqueta de autenticación, y ocupa bastante más que el secreto original.
-- ---------------------------------------------------------------------
CREATE TABLE seguridad.mfa (
  usuario_id      INTEGER PRIMARY KEY,
  secreto         VARCHAR(255) NOT NULL,
  activo          SMALLINT NOT NULL DEFAULT 0,
  -- Último bloque de treinta segundos aceptado. Impide que el mismo código
  -- valga dos veces dentro de su ventana de validez.
  ultimo_contador BIGINT NULL,
  creado_en       TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  confirmado_en   TIMESTAMP(0) NULL,
  CONSTRAINT chk_mfa_activo CHECK (activo IN (0,1)),
  CONSTRAINT fk_mfa_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios.usuarios(id) ON DELETE CASCADE
);

-- Códigos de un solo uso para entrar cuando se pierde el teléfono. Se guardan
-- hasheados: leer la tabla no puede dar acceso a nadie.
CREATE TABLE seguridad.mfa_codigos (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  usuario_id  INTEGER NOT NULL,
  codigo_hash CHAR(64) NOT NULL,
  usado_en    TIMESTAMP(0) NULL,
  creado_en   TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_mfa_codigos UNIQUE (codigo_hash),
  CONSTRAINT fk_mfa_codigos_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios.usuarios(id) ON DELETE CASCADE
);
CREATE INDEX idx_mfa_codigos_usuario ON seguridad.mfa_codigos (usuario_id, usado_en);

-- El paso intermedio del ingreso: la contraseña ya se comprobó y falta el
-- código. Es una fila con caducidad corta, no una sesión: no sirve para llamar
-- a ninguna ruta de la API.
CREATE TABLE seguridad.mfa_desafios (
  id         INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  usuario_id INTEGER NOT NULL,
  token_hash CHAR(64) NOT NULL,
  -- Las seis cifras que se le mandaron al correo, hasheadas igual que todo lo
  -- demás: leer la tabla no puede dar el código de nadie. Queda en NULL cuando
  -- el ingreso se resuelve con la aplicación de códigos.
  codigo_hash CHAR(64) NULL,
  intentos   SMALLINT NOT NULL DEFAULT 0,
  ip         VARCHAR(45) NULL,
  agente     VARCHAR(255) NULL,
  creado_en  TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  expira_en  TIMESTAMP(0) NOT NULL,
  usado_en   TIMESTAMP(0) NULL,
  CONSTRAINT uq_mfa_desafios UNIQUE (token_hash),
  CONSTRAINT fk_mfa_desafios_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios.usuarios(id) ON DELETE CASCADE
);
CREATE INDEX idx_mfa_desafios_usuario ON seguridad.mfa_desafios (usuario_id, usado_en);

-- Todo intento de login, acertado o no. Con esto se bloquea temporalmente
-- una cuenta tras varios fallos seguidos.
CREATE TABLE seguridad.intentos_login (
  id         INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  email      VARCHAR(160) NOT NULL,
  usuario_id INTEGER NULL,               -- NULL si el correo no existe
  exito      SMALLINT NOT NULL DEFAULT 0,
  motivo     VARCHAR(40) NULL,           -- credenciales, cuenta_inactiva, bloqueo…
  ip         VARCHAR(45)  NULL,
  agente     VARCHAR(255) NULL,
  creado_en  TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_intentos_exito CHECK (exito IN (0,1)),
  CONSTRAINT fk_intentos_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_intentos_email ON seguridad.intentos_login (email, creado_en);
CREATE INDEX idx_intentos_ip    ON seguridad.intentos_login (ip, creado_en);

-- Entradas y salidas efectivas del sistema (el "quién entró y cuándo").
CREATE TABLE seguridad.accesos (
  id         INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  usuario_id INTEGER NOT NULL,
  sesion_id  INTEGER NULL,
  tipo       VARCHAR(12) NOT NULL,       -- entrada | salida | expiro
  ip         VARCHAR(45)  NULL,
  agente     VARCHAR(255) NULL,
  creado_en  TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_accesos_tipo CHECK (tipo IN ('entrada','salida','expiro')),
  CONSTRAINT fk_accesos_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios.usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_accesos_sesion FOREIGN KEY (sesion_id)
    REFERENCES seguridad.sesiones(id) ON DELETE SET NULL
);
CREATE INDEX idx_accesos_usuario ON seguridad.accesos (usuario_id, creado_en);

-- Rastro de cambios sobre los datos sensibles. Lo escribe el backend, que es
-- el único que sabe qué usuario está detrás de cada petición.
CREATE TABLE seguridad.auditoria (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  usuario_id   INTEGER NULL,
  modulo       VARCHAR(30)  NOT NULL,
  tabla        VARCHAR(60)  NOT NULL,
  registro_id  VARCHAR(40)  NULL,
  accion       VARCHAR(40)  NOT NULL,    -- crear | actualizar | eliminar | recuperacion_solicitada…
  descripcion  VARCHAR(255) NULL,
  datos_antes  JSONB NULL,
  datos_despues JSONB NULL,
  ip           VARCHAR(45) NULL,
  creado_en    TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT fk_auditoria_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_auditoria_usuario  ON seguridad.auditoria (usuario_id, creado_en);
CREATE INDEX idx_auditoria_registro ON seguridad.auditoria (tabla, registro_id);
CREATE INDEX idx_auditoria_fecha    ON seguridad.auditoria (creado_en);


-- =====================================================================
--  MÓDULO 4 · MASCOTAS
-- =====================================================================

CREATE TABLE mascotas.especies (
  id     SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL,
  CONSTRAINT uq_especies_nombre UNIQUE (nombre)
);

CREATE TABLE mascotas.razas (
  id         SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  especie_id SMALLINT NOT NULL,
  nombre     VARCHAR(80) NOT NULL,
  CONSTRAINT uq_razas UNIQUE (especie_id, nombre),
  CONSTRAINT fk_razas_especie FOREIGN KEY (especie_id)
    REFERENCES mascotas.especies(id) ON DELETE CASCADE
);

CREATE TABLE mascotas.mascotas (
  id                INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cliente_id        INTEGER NOT NULL,
  nombre            VARCHAR(80) NOT NULL,
  foto              VARCHAR(255) NULL,
  especie_id        SMALLINT NOT NULL,
  raza_id           SMALLINT NULL,
  sexo              VARCHAR(12) NOT NULL DEFAULT 'desconocido',
  fecha_nacimiento  DATE NULL,
  peso_kg           NUMERIC(6,2) NULL,
  color             VARCHAR(60) NULL,
  microchip         VARCHAR(40) NULL,
  esterilizado      SMALLINT NOT NULL DEFAULT 0,
  informacion       TEXT NULL,
  fallecido         SMALLINT NOT NULL DEFAULT 0,
  fecha_fallecimiento DATE NULL,
  activo            SMALLINT NOT NULL DEFAULT 1,
  creado_en         TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  actualizado_en    TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_mascotas_microchip UNIQUE (microchip),
  CONSTRAINT chk_mascotas_sexo      CHECK (sexo IN ('macho','hembra','desconocido')),
  CONSTRAINT chk_mascotas_peso      CHECK (peso_kg IS NULL OR peso_kg > 0),
  CONSTRAINT chk_mascotas_activo    CHECK (activo IN (0,1)),
  CONSTRAINT chk_mascotas_ester     CHECK (esterilizado IN (0,1)),
  CONSTRAINT chk_mascotas_fallecido CHECK (fallecido IN (0,1)),
  CONSTRAINT fk_mascotas_cliente FOREIGN KEY (cliente_id)
    REFERENCES usuarios.clientes(id) ON DELETE CASCADE,
  CONSTRAINT fk_mascotas_especie FOREIGN KEY (especie_id) REFERENCES mascotas.especies(id),
  CONSTRAINT fk_mascotas_raza    FOREIGN KEY (raza_id)    REFERENCES mascotas.razas(id) ON DELETE SET NULL
);
CREATE INDEX idx_mascotas_cliente ON mascotas.mascotas (cliente_id, activo);

CREATE TRIGGER trg_mascotas_actualizado BEFORE UPDATE ON mascotas.mascotas
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_actualizado_en();

-- Qué contacto de emergencia responde por qué mascota.
CREATE TABLE mascotas.mascotas_contactos (
  mascota_id INTEGER NOT NULL,
  contacto_id INTEGER NOT NULL,
  autorizado_recoger SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (mascota_id, contacto_id),
  CONSTRAINT chk_mascotas_contactos_autorizado CHECK (autorizado_recoger IN (0,1)),
  CONSTRAINT fk_mascotas_contactos_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_mascotas_contactos_contacto FOREIGN KEY (contacto_id)
    REFERENCES usuarios.contactos_emergencia(id) ON DELETE CASCADE
);

-- Catálogo de alérgenos (medicamento, alimento, ambiental…)
CREATE TABLE mascotas.alergias (
  id     SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  tipo   VARCHAR(20)  NOT NULL DEFAULT 'otro',
  CONSTRAINT uq_alergias_nombre UNIQUE (nombre),
  CONSTRAINT chk_alergias_tipo CHECK (tipo IN ('medicamento','alimento','ambiental','contacto','otro'))
);

CREATE TABLE mascotas.mascota_alergias (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id   INTEGER NOT NULL,
  alergia_id   SMALLINT NOT NULL,
  severidad    VARCHAR(10) NOT NULL DEFAULT 'leve',
  reaccion     VARCHAR(200) NULL,
  notas        TEXT NULL,
  registrado_en DATE NOT NULL DEFAULT CURRENT_DATE,
  CONSTRAINT uq_mascota_alergias UNIQUE (mascota_id, alergia_id),
  CONSTRAINT chk_mascota_alergias_severidad CHECK (severidad IN ('leve','moderada','grave')),
  CONSTRAINT fk_mascota_alergias_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_mascota_alergias_alergia FOREIGN KEY (alergia_id)
    REFERENCES mascotas.alergias(id)
);
CREATE INDEX idx_mascota_alergias_mascota ON mascotas.mascota_alergias (mascota_id);

-- Catálogo de enfermedades crónicas o condiciones permanentes.
CREATE TABLE mascotas.condiciones_medicas (
  id          SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre      VARCHAR(120) NOT NULL,
  descripcion VARCHAR(255) NULL,
  CONSTRAINT uq_condiciones_nombre UNIQUE (nombre)
);

CREATE TABLE mascotas.mascota_condiciones (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id     INTEGER NOT NULL,
  condicion_id   SMALLINT NOT NULL,
  estado         VARCHAR(12) NOT NULL DEFAULT 'activa',
  diagnosticada_en DATE NULL,
  notas          TEXT NULL,
  CONSTRAINT uq_mascota_condiciones UNIQUE (mascota_id, condicion_id),
  CONSTRAINT chk_mascota_condiciones_estado CHECK (estado IN ('activa','controlada','resuelta')),
  CONSTRAINT fk_mascota_condiciones_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_mascota_condiciones_condicion FOREIGN KEY (condicion_id)
    REFERENCES mascotas.condiciones_medicas(id)
);
CREATE INDEX idx_mascota_condiciones_mascota ON mascotas.mascota_condiciones (mascota_id);

-- Curva de peso: cada pesaje deja una fila y la ficha guarda el último.
CREATE TABLE mascotas.historial_peso (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id  INTEGER NOT NULL,
  peso_kg     NUMERIC(6,2) NOT NULL,
  fecha       DATE NOT NULL DEFAULT CURRENT_DATE,
  origen      VARCHAR(12) NOT NULL DEFAULT 'consulta',
  consulta_id INTEGER NULL,             -- se enlaza más abajo con ALTER TABLE
  notas       VARCHAR(200) NULL,
  CONSTRAINT chk_historial_peso_valor  CHECK (peso_kg > 0),
  CONSTRAINT chk_historial_peso_origen CHECK (origen IN ('consulta','dueno','control')),
  CONSTRAINT fk_historial_peso_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE
);
CREATE INDEX idx_historial_peso_mascota ON mascotas.historial_peso (mascota_id, fecha);


-- =====================================================================
--  MÓDULO 5 · AGENDA
-- =====================================================================

CREATE TABLE agenda.servicios (
  id           SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre       VARCHAR(100) NOT NULL,
  slug         VARCHAR(120) NOT NULL,
  descripcion  TEXT NULL,
  precio       NUMERIC(12,2) NOT NULL DEFAULT 0,
  duracion_min SMALLINT NOT NULL DEFAULT 30,
  requisitos   TEXT NULL,
  icono        VARCHAR(40) NULL,          -- id del sprite SVG del front
  activo       SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_servicios_slug UNIQUE (slug),
  CONSTRAINT chk_servicios_precio   CHECK (precio >= 0),
  CONSTRAINT chk_servicios_duracion CHECK (duracion_min > 0),
  CONSTRAINT chk_servicios_activo   CHECK (activo IN (0,1))
);

-- Qué veterinario puede atender qué servicio
CREATE TABLE agenda.veterinario_servicios (
  servicio_id    SMALLINT NOT NULL,
  veterinario_id INTEGER NOT NULL,
  PRIMARY KEY (servicio_id, veterinario_id),
  CONSTRAINT fk_vs_servicio FOREIGN KEY (servicio_id)
    REFERENCES agenda.servicios(id) ON DELETE CASCADE,
  CONSTRAINT fk_vs_veterinario FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE CASCADE
);

-- Horario de atención semanal de cada veterinario
CREATE TABLE agenda.horarios_veterinarios (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  veterinario_id INTEGER NOT NULL,
  sede_id        SMALLINT NULL,
  dia_semana     SMALLINT NOT NULL,   -- 0=domingo … 6=sábado
  hora_inicio    TIME(0) NOT NULL,
  hora_fin       TIME(0) NOT NULL,
  CONSTRAINT chk_horarios_vet_dia   CHECK (dia_semana BETWEEN 0 AND 6),
  CONSTRAINT chk_horarios_vet_rango CHECK (hora_fin > hora_inicio),
  CONSTRAINT fk_horarios_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_horarios_vet_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE SET NULL
);
CREATE INDEX idx_horarios_vet_dia ON agenda.horarios_veterinarios (veterinario_id, dia_semana);

-- Bloqueos puntuales (vacaciones, cirugía programada, capacitación…)
CREATE TABLE agenda.bloqueos_agenda (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  veterinario_id INTEGER NOT NULL,
  inicio         TIMESTAMP(0) NOT NULL,
  fin            TIMESTAMP(0) NOT NULL,
  motivo         VARCHAR(160) NULL,
  creado_por     INTEGER NULL,
  creado_en      TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_bloqueos_rango CHECK (fin > inicio),
  CONSTRAINT fk_bloqueos_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_bloqueos_creador FOREIGN KEY (creado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_bloqueos_vet_rango ON agenda.bloqueos_agenda (veterinario_id, inicio, fin);

CREATE TABLE agenda.citas (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id        SMALLINT NULL,
  cliente_id     INTEGER NOT NULL,
  mascota_id     INTEGER NOT NULL,
  veterinario_id INTEGER NOT NULL,
  servicio_id    SMALLINT NOT NULL,
  inicio         TIMESTAMP(0) NOT NULL,
  fin            TIMESTAMP(0) NOT NULL,
  estado         VARCHAR(12) NOT NULL DEFAULT 'pendiente',
  motivo         VARCHAR(255) NULL,
  notas          TEXT NULL,
  creado_por     INTEGER NULL,        -- usuario que la registró
  cancelada_en   TIMESTAMP(0) NULL,
  creado_en      TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  actualizado_en TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,

  -- Vale NULL cuando la cita ya no ocupa agenda. En un índice UNIQUE los NULL
  -- no chocan entre sí, así que esto impide dos citas activas a la misma hora
  -- con el mismo veterinario, pero permite reusar el horario si se cancela.
  slot_ocupado TIMESTAMP(0)
    GENERATED ALWAYS AS (CASE WHEN estado IN ('cancelada','no_asistio') THEN NULL ELSE inicio END) STORED,

  CONSTRAINT uq_citas_vet_slot UNIQUE (veterinario_id, slot_ocupado),
  CONSTRAINT chk_citas_estado CHECK (estado IN ('pendiente','confirmada','atendida','cancelada','no_asistio')),
  CONSTRAINT chk_citas_rango  CHECK (fin > inicio),
  CONSTRAINT fk_citas_sede        FOREIGN KEY (sede_id)        REFERENCES configuracion.sedes(id) ON DELETE SET NULL,
  CONSTRAINT fk_citas_cliente     FOREIGN KEY (cliente_id)     REFERENCES usuarios.clientes(id),
  CONSTRAINT fk_citas_mascota     FOREIGN KEY (mascota_id)     REFERENCES mascotas.mascotas(id),
  CONSTRAINT fk_citas_veterinario FOREIGN KEY (veterinario_id) REFERENCES usuarios.veterinarios(id),
  CONSTRAINT fk_citas_servicio    FOREIGN KEY (servicio_id)    REFERENCES agenda.servicios(id),
  CONSTRAINT fk_citas_creador     FOREIGN KEY (creado_por)     REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_citas_vet_fecha ON agenda.citas (veterinario_id, inicio);
CREATE INDEX idx_citas_cliente   ON agenda.citas (cliente_id, inicio);
CREATE INDEX idx_citas_mascota   ON agenda.citas (mascota_id, inicio);
CREATE INDEX idx_citas_estado    ON agenda.citas (estado, inicio);

CREATE TRIGGER trg_citas_actualizado BEFORE UPDATE ON agenda.citas
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_actualizado_en();

-- Bitácora de la cita: quién la creó, quién la confirmó, quién la canceló.
CREATE TABLE agenda.cita_historial (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cita_id      INTEGER NOT NULL,
  estado_antes VARCHAR(12) NULL,
  estado_nuevo VARCHAR(12) NOT NULL,
  usuario_id   INTEGER NULL,
  motivo       VARCHAR(255) NULL,
  creado_en    TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT fk_cita_historial_cita FOREIGN KEY (cita_id)
    REFERENCES agenda.citas(id) ON DELETE CASCADE,
  CONSTRAINT fk_cita_historial_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_cita_historial_cita ON agenda.cita_historial (cita_id, creado_en);


-- =====================================================================
--  MÓDULO 6 · HISTORIA CLINICA
-- =====================================================================

CREATE TABLE historia_clinica.historias_clinicas (
  id         INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id INTEGER NOT NULL,
  numero     VARCHAR(20) NULL,
  abierta_en TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_historias_mascota UNIQUE (mascota_id),
  CONSTRAINT uq_historias_numero  UNIQUE (numero),
  CONSTRAINT fk_historias_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE
);

CREATE TABLE historia_clinica.consultas (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  historia_id    INTEGER NOT NULL,
  cita_id        INTEGER NULL,
  veterinario_id INTEGER NOT NULL,
  sede_id        SMALLINT NULL,
  fecha          TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  tipo           VARCHAR(15) NOT NULL DEFAULT 'consulta',
  motivo         VARCHAR(255) NOT NULL,
  anamnesis      TEXT NULL,
  sintomas       TEXT NULL,
  examen_fisico  TEXT NULL,
  observaciones  TEXT NULL,
  plan_manejo    TEXT NULL,
  estado         VARCHAR(12) NOT NULL DEFAULT 'cerrada',
  creado_en      TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  actualizado_en TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_consultas_cita UNIQUE (cita_id),
  CONSTRAINT chk_consultas_tipo   CHECK (tipo IN ('consulta','control','urgencia','cirugia','vacunacion')),
  CONSTRAINT chk_consultas_estado CHECK (estado IN ('abierta','cerrada')),
  CONSTRAINT fk_consultas_historia FOREIGN KEY (historia_id)
    REFERENCES historia_clinica.historias_clinicas(id) ON DELETE CASCADE,
  CONSTRAINT fk_consultas_cita FOREIGN KEY (cita_id)
    REFERENCES agenda.citas(id) ON DELETE SET NULL,
  CONSTRAINT fk_consultas_vet  FOREIGN KEY (veterinario_id) REFERENCES usuarios.veterinarios(id),
  CONSTRAINT fk_consultas_sede FOREIGN KEY (sede_id) REFERENCES configuracion.sedes(id) ON DELETE SET NULL
);
CREATE INDEX idx_consultas_historia ON historia_clinica.consultas (historia_id, fecha);
CREATE INDEX idx_consultas_vet      ON historia_clinica.consultas (veterinario_id, fecha);

CREATE TRIGGER trg_consultas_actualizado BEFORE UPDATE ON historia_clinica.consultas
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_actualizado_en();

-- Ahora que existe consultas, se cierra el enlace del historial de peso.
ALTER TABLE mascotas.historial_peso
  ADD CONSTRAINT fk_historial_peso_consulta FOREIGN KEY (consulta_id)
    REFERENCES historia_clinica.consultas(id) ON DELETE SET NULL;

-- Toma de constantes. Va aparte de la consulta porque en una hospitalización
-- se miden varias veces al día.
CREATE TABLE historia_clinica.signos_vitales (
  id                INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  consulta_id       INTEGER NULL,
  mascota_id        INTEGER NOT NULL,
  tomado_por        INTEGER NULL,
  fecha             TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  peso_kg           NUMERIC(6,2) NULL,
  temperatura_c     NUMERIC(4,1) NULL,
  frec_cardiaca     SMALLINT NULL,
  frec_respiratoria SMALLINT NULL,
  mucosas           VARCHAR(30) NULL,
  hidratacion       VARCHAR(30) NULL,
  condicion_corporal SMALLINT NULL,   -- escala 1 a 9
  notas             VARCHAR(255) NULL,
  CONSTRAINT chk_signos_peso  CHECK (peso_kg IS NULL OR peso_kg > 0),
  CONSTRAINT chk_signos_cc    CHECK (condicion_corporal IS NULL OR condicion_corporal BETWEEN 1 AND 9),
  CONSTRAINT fk_signos_consulta FOREIGN KEY (consulta_id)
    REFERENCES historia_clinica.consultas(id) ON DELETE CASCADE,
  CONSTRAINT fk_signos_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_signos_usuario FOREIGN KEY (tomado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_signos_consulta ON historia_clinica.signos_vitales (consulta_id);
CREATE INDEX idx_signos_mascota  ON historia_clinica.signos_vitales (mascota_id, fecha);

-- Catálogo de diagnósticos, para que las estadísticas no dependan de cómo
-- escribió cada quien la misma enfermedad.
CREATE TABLE historia_clinica.catalogo_diagnosticos (
  id         SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  codigo     VARCHAR(20)  NULL,
  nombre     VARCHAR(150) NOT NULL,
  categoria  VARCHAR(60)  NULL,
  especie_id SMALLINT NULL,         -- NULL = aplica a cualquier especie
  activo     SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_catalogo_diag_codigo UNIQUE (codigo),
  CONSTRAINT uq_catalogo_diag_nombre UNIQUE (nombre),
  CONSTRAINT chk_catalogo_diag_activo CHECK (activo IN (0,1)),
  CONSTRAINT fk_catalogo_diag_especie FOREIGN KEY (especie_id)
    REFERENCES mascotas.especies(id) ON DELETE SET NULL
);

CREATE TABLE historia_clinica.consulta_diagnosticos (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  consulta_id   INTEGER NOT NULL,
  diagnostico_id SMALLINT NULL,      -- del catálogo, si está tipificado
  descripcion   TEXT NOT NULL,
  tipo          VARCHAR(12) NOT NULL DEFAULT 'presuntivo',
  principal     SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT chk_consulta_diag_tipo      CHECK (tipo IN ('presuntivo','definitivo','descartado')),
  CONSTRAINT chk_consulta_diag_principal CHECK (principal IN (0,1)),
  CONSTRAINT fk_consulta_diag_consulta FOREIGN KEY (consulta_id)
    REFERENCES historia_clinica.consultas(id) ON DELETE CASCADE,
  CONSTRAINT fk_consulta_diag_catalogo FOREIGN KEY (diagnostico_id)
    REFERENCES historia_clinica.catalogo_diagnosticos(id) ON DELETE SET NULL
);
CREATE INDEX idx_consulta_diag_consulta ON historia_clinica.consulta_diagnosticos (consulta_id);

CREATE TABLE historia_clinica.tratamientos (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  consulta_id  INTEGER NOT NULL,
  descripcion  TEXT NOT NULL,
  indicaciones TEXT NULL,
  fecha_inicio DATE NULL,
  fecha_fin    DATE NULL,
  estado       VARCHAR(12) NOT NULL DEFAULT 'activo',
  creado_en    TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_tratamientos_estado CHECK (estado IN ('activo','finalizado','suspendido')),
  CONSTRAINT chk_tratamientos_fechas CHECK (fecha_fin IS NULL OR fecha_inicio IS NULL OR fecha_fin >= fecha_inicio),
  CONSTRAINT fk_tratamientos_consulta FOREIGN KEY (consulta_id)
    REFERENCES historia_clinica.consultas(id) ON DELETE CASCADE
);
CREATE INDEX idx_tratamientos_consulta ON historia_clinica.tratamientos (consulta_id);

CREATE TABLE historia_clinica.medicamentos (
  id               INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre           VARCHAR(120) NOT NULL,
  principio_activo VARCHAR(120) NULL,
  presentacion     VARCHAR(80)  NULL,
  concentracion    VARCHAR(60)  NULL,
  via              VARCHAR(20)  NULL,     -- oral, intravenosa, tópica…
  producto_id      INTEGER NULL,          -- se enlaza con inventario más abajo
  activo           SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_medicamentos_nombre UNIQUE (nombre, presentacion),
  CONSTRAINT chk_medicamentos_activo CHECK (activo IN (0,1))
);

-- Lo que el veterinario receta dentro de un tratamiento.
CREATE TABLE historia_clinica.prescripciones (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  tratamiento_id INTEGER NOT NULL,
  medicamento_id INTEGER NOT NULL,
  dosis          VARCHAR(80) NULL,
  frecuencia     VARCHAR(80) NULL,
  duracion       VARCHAR(80) NULL,
  via            VARCHAR(20) NULL,
  cantidad       NUMERIC(10,2) NULL,
  indicaciones   TEXT NULL,
  CONSTRAINT fk_prescripciones_tratamiento FOREIGN KEY (tratamiento_id)
    REFERENCES historia_clinica.tratamientos(id) ON DELETE CASCADE,
  CONSTRAINT fk_prescripciones_medicamento FOREIGN KEY (medicamento_id)
    REFERENCES historia_clinica.medicamentos(id)
);
CREATE INDEX idx_prescripciones_tratamiento ON historia_clinica.prescripciones (tratamiento_id);

-- Catálogo de vacunas
CREATE TABLE historia_clinica.vacunas (
  id             SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre         VARCHAR(100) NOT NULL,
  especie_id     SMALLINT NULL,
  enfermedades   VARCHAR(255) NULL,
  refuerzo_meses SMALLINT NULL,   -- cada cuánto se repite
  obligatoria    SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT uq_vacunas_nombre UNIQUE NULLS NOT DISTINCT (nombre, especie_id),
  CONSTRAINT chk_vacunas_obligatoria CHECK (obligatoria IN (0,1)),
  CONSTRAINT fk_vacunas_especie FOREIGN KEY (especie_id)
    REFERENCES mascotas.especies(id) ON DELETE SET NULL
);

-- Lotes recibidos de cada vacuna, con su vencimiento.
CREATE TABLE historia_clinica.lotes_vacunas (
  id              INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  vacuna_id       SMALLINT NOT NULL,
  lote            VARCHAR(60) NOT NULL,
  laboratorio     VARCHAR(120) NULL,
  fecha_vencimiento DATE NULL,
  dosis_totales   INTEGER NOT NULL DEFAULT 0,
  dosis_usadas    INTEGER NOT NULL DEFAULT 0,
  activo          SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_lotes_vacunas UNIQUE (vacuna_id, lote),
  CONSTRAINT chk_lotes_vacunas_dosis  CHECK (dosis_usadas >= 0 AND dosis_totales >= 0),
  CONSTRAINT chk_lotes_vacunas_activo CHECK (activo IN (0,1)),
  CONSTRAINT fk_lotes_vacunas_vacuna FOREIGN KEY (vacuna_id)
    REFERENCES historia_clinica.vacunas(id) ON DELETE CASCADE
);

-- Vacunas efectivamente aplicadas a una mascota
CREATE TABLE historia_clinica.aplicaciones_vacunas (
  id               INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id       INTEGER NOT NULL,
  vacuna_id        SMALLINT NOT NULL,
  lote_id          INTEGER NULL,
  consulta_id      INTEGER NULL,
  veterinario_id   INTEGER NOT NULL,
  fecha_aplicacion DATE NOT NULL,
  proxima_fecha    DATE NULL,
  lote             VARCHAR(60) NULL,   -- texto libre cuando no se registró el lote
  observaciones    TEXT NULL,
  CONSTRAINT fk_av_mascota  FOREIGN KEY (mascota_id)  REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_av_vacuna   FOREIGN KEY (vacuna_id)   REFERENCES historia_clinica.vacunas(id),
  CONSTRAINT fk_av_lote     FOREIGN KEY (lote_id)     REFERENCES historia_clinica.lotes_vacunas(id) ON DELETE SET NULL,
  CONSTRAINT fk_av_consulta FOREIGN KEY (consulta_id) REFERENCES historia_clinica.consultas(id) ON DELETE SET NULL,
  CONSTRAINT fk_av_vet      FOREIGN KEY (veterinario_id) REFERENCES usuarios.veterinarios(id)
);
CREATE INDEX idx_av_mascota ON historia_clinica.aplicaciones_vacunas (mascota_id, fecha_aplicacion);
CREATE INDEX idx_av_proxima ON historia_clinica.aplicaciones_vacunas (proxima_fecha);

CREATE TABLE historia_clinica.tipos_examen (
  id          SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre      VARCHAR(120) NOT NULL,     -- hemograma, ecografía, rayos X…
  categoria   VARCHAR(40)  NULL,         -- laboratorio | imagen | otro
  descripcion VARCHAR(255) NULL,
  precio      NUMERIC(12,2) NOT NULL DEFAULT 0,
  activo      SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_tipos_examen_nombre UNIQUE (nombre),
  CONSTRAINT chk_tipos_examen_activo CHECK (activo IN (0,1))
);

CREATE TABLE historia_clinica.examenes (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id     INTEGER NOT NULL,
  consulta_id    INTEGER NULL,
  tipo_examen_id SMALLINT NULL,
  solicitado_por INTEGER NULL,
  descripcion    VARCHAR(150) NULL,
  fecha_solicitud DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_resultado DATE NULL,
  estado         VARCHAR(12) NOT NULL DEFAULT 'solicitado',
  conclusion     TEXT NULL,
  CONSTRAINT chk_examenes_estado CHECK (estado IN ('solicitado','en_proceso','listo','anulado')),
  CONSTRAINT fk_examenes_mascota  FOREIGN KEY (mascota_id)  REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_examenes_consulta FOREIGN KEY (consulta_id) REFERENCES historia_clinica.consultas(id) ON DELETE SET NULL,
  CONSTRAINT fk_examenes_tipo     FOREIGN KEY (tipo_examen_id) REFERENCES historia_clinica.tipos_examen(id) ON DELETE SET NULL,
  CONSTRAINT fk_examenes_solicita FOREIGN KEY (solicitado_por) REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_examenes_mascota ON historia_clinica.examenes (mascota_id, fecha_solicitud);
CREATE INDEX idx_examenes_estado  ON historia_clinica.examenes (estado);

-- Un renglón por parámetro medido (hematocrito, creatinina…), que es como
-- llegan los resultados del laboratorio.
CREATE TABLE historia_clinica.resultados_examenes (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  examen_id   INTEGER NOT NULL,
  parametro   VARCHAR(120) NOT NULL,
  valor       VARCHAR(80)  NULL,
  unidad      VARCHAR(30)  NULL,
  referencia  VARCHAR(60)  NULL,
  fuera_rango SMALLINT NOT NULL DEFAULT 0,
  notas       VARCHAR(255) NULL,
  CONSTRAINT chk_resultados_fuera_rango CHECK (fuera_rango IN (0,1)),
  CONSTRAINT fk_resultados_examen FOREIGN KEY (examen_id)
    REFERENCES historia_clinica.examenes(id) ON DELETE CASCADE
);
CREATE INDEX idx_resultados_examen ON historia_clinica.resultados_examenes (examen_id);

CREATE TABLE historia_clinica.cirugias (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id     INTEGER NOT NULL,
  veterinario_id INTEGER NOT NULL,      -- cirujano principal
  consulta_id    INTEGER NULL,
  sede_id        SMALLINT NULL,
  nombre         VARCHAR(150) NOT NULL,
  fecha          DATE NOT NULL,
  hora_inicio    TIME(0) NULL,
  hora_fin       TIME(0) NULL,
  anestesia      VARCHAR(60) NULL,
  descripcion    TEXT NULL,
  resultado      TEXT NULL,
  complicaciones TEXT NULL,
  estado         VARCHAR(12) NOT NULL DEFAULT 'programada',
  CONSTRAINT chk_cirugias_estado CHECK (estado IN ('programada','realizada','cancelada')),
  CONSTRAINT fk_cirugias_mascota  FOREIGN KEY (mascota_id) REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_cirugias_vet      FOREIGN KEY (veterinario_id) REFERENCES usuarios.veterinarios(id),
  CONSTRAINT fk_cirugias_consulta FOREIGN KEY (consulta_id) REFERENCES historia_clinica.consultas(id) ON DELETE SET NULL,
  CONSTRAINT fk_cirugias_sede     FOREIGN KEY (sede_id) REFERENCES configuracion.sedes(id) ON DELETE SET NULL
);
CREATE INDEX idx_cirugias_mascota ON historia_clinica.cirugias (mascota_id, fecha);

-- Equipo que participó en cada cirugía.
CREATE TABLE historia_clinica.cirugia_personal (
  id         INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cirugia_id INTEGER NOT NULL,
  usuario_id INTEGER NOT NULL,
  funcion    VARCHAR(40) NOT NULL DEFAULT 'asistente',
  CONSTRAINT uq_cirugia_personal UNIQUE (cirugia_id, usuario_id),
  CONSTRAINT chk_cirugia_personal_funcion CHECK (funcion IN ('cirujano','asistente','anestesista','instrumentador','auxiliar')),
  CONSTRAINT fk_cirugia_personal_cirugia FOREIGN KEY (cirugia_id)
    REFERENCES historia_clinica.cirugias(id) ON DELETE CASCADE,
  CONSTRAINT fk_cirugia_personal_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios.usuarios(id) ON DELETE CASCADE
);

CREATE TABLE historia_clinica.hospitalizaciones (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id     INTEGER NOT NULL,
  consulta_id    INTEGER NULL,
  veterinario_id INTEGER NOT NULL,
  sede_id        SMALLINT NULL,
  jaula          VARCHAR(20) NULL,
  motivo         VARCHAR(255) NOT NULL,
  fecha_ingreso  TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  fecha_egreso   TIMESTAMP(0) NULL,
  estado         VARCHAR(12) NOT NULL DEFAULT 'activa',
  indicaciones   TEXT NULL,
  epicrisis      TEXT NULL,
  CONSTRAINT chk_hosp_estado CHECK (estado IN ('activa','alta','remitida','fallecido')),
  CONSTRAINT chk_hosp_fechas CHECK (fecha_egreso IS NULL OR fecha_egreso >= fecha_ingreso),
  CONSTRAINT fk_hosp_mascota  FOREIGN KEY (mascota_id)  REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_hosp_consulta FOREIGN KEY (consulta_id) REFERENCES historia_clinica.consultas(id) ON DELETE SET NULL,
  CONSTRAINT fk_hosp_vet      FOREIGN KEY (veterinario_id) REFERENCES usuarios.veterinarios(id),
  CONSTRAINT fk_hosp_sede     FOREIGN KEY (sede_id) REFERENCES configuracion.sedes(id) ON DELETE SET NULL
);
CREATE INDEX idx_hosp_mascota ON historia_clinica.hospitalizaciones (mascota_id, fecha_ingreso);
CREATE INDEX idx_hosp_estado  ON historia_clinica.hospitalizaciones (estado);

CREATE TABLE historia_clinica.hospitalizacion_controles (
  id                  INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  hospitalizacion_id  INTEGER NOT NULL,
  registrado_por      INTEGER NULL,
  fecha               TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  temperatura_c       NUMERIC(4,1) NULL,
  frec_cardiaca       SMALLINT NULL,
  frec_respiratoria   SMALLINT NULL,
  come                SMALLINT NULL,
  orina               SMALLINT NULL,
  defeca              SMALLINT NULL,
  medicacion          TEXT NULL,
  observaciones       TEXT NULL,
  CONSTRAINT chk_hosp_ctrl_come   CHECK (come   IS NULL OR come   IN (0,1)),
  CONSTRAINT chk_hosp_ctrl_orina  CHECK (orina  IS NULL OR orina  IN (0,1)),
  CONSTRAINT chk_hosp_ctrl_defeca CHECK (defeca IS NULL OR defeca IN (0,1)),
  CONSTRAINT fk_hosp_ctrl_hosp FOREIGN KEY (hospitalizacion_id)
    REFERENCES historia_clinica.hospitalizaciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_hosp_ctrl_usuario FOREIGN KEY (registrado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_hosp_ctrl ON historia_clinica.hospitalizacion_controles (hospitalizacion_id, fecha);

-- Radiografías, ecografías, consentimientos… todo lo que se adjunta a la
-- historia. El archivo vive en Supabase Storage; aquí queda la referencia.
CREATE TABLE historia_clinica.documentos_clinicos (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id   INTEGER NOT NULL,
  consulta_id  INTEGER NULL,
  examen_id    INTEGER NULL,
  subido_por   INTEGER NULL,
  tipo         VARCHAR(20) NOT NULL DEFAULT 'otro',
  titulo       VARCHAR(150) NOT NULL,
  archivo      VARCHAR(255) NOT NULL,       -- URL en Supabase Storage
  mime         VARCHAR(100) NULL,
  tamano_bytes INTEGER NULL,
  creado_en    TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_documentos_clinicos_tipo CHECK (tipo IN ('radiografia','ecografia','laboratorio','consentimiento','receta','otro')),
  CONSTRAINT fk_doc_clinicos_mascota  FOREIGN KEY (mascota_id)  REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_doc_clinicos_consulta FOREIGN KEY (consulta_id) REFERENCES historia_clinica.consultas(id) ON DELETE SET NULL,
  CONSTRAINT fk_doc_clinicos_examen   FOREIGN KEY (examen_id)   REFERENCES historia_clinica.examenes(id) ON DELETE SET NULL,
  CONSTRAINT fk_doc_clinicos_usuario  FOREIGN KEY (subido_por)  REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_doc_clinicos_mascota ON historia_clinica.documentos_clinicos (mascota_id);


-- =====================================================================
--  MÓDULO 7 · INVENTARIO
-- =====================================================================

CREATE TABLE inventario.categorias_productos (
  id     SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre VARCHAR(60) NOT NULL,
  tipo   VARCHAR(20) NOT NULL DEFAULT 'insumo',
  CONSTRAINT uq_categorias_nombre UNIQUE (nombre),
  CONSTRAINT chk_categorias_tipo CHECK (tipo IN ('medicamento','alimento','insumo','accesorio','vacuna'))
);

CREATE TABLE inventario.proveedores (
  id        INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre    VARCHAR(140) NOT NULL,
  nit       VARCHAR(30)  NULL,
  contacto  VARCHAR(120) NULL,
  telefono  VARCHAR(30)  NULL,
  email     VARCHAR(160) NULL,
  direccion VARCHAR(180) NULL,
  activo    SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_proveedores_nit UNIQUE (nit),
  CONSTRAINT chk_proveedores_activo CHECK (activo IN (0,1))
);

CREATE TABLE inventario.productos (
  id                INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  categoria_id      SMALLINT NOT NULL,
  proveedor_id      INTEGER NULL,
  nombre            VARCHAR(140) NOT NULL,
  sku               VARCHAR(50) NULL,
  descripcion       VARCHAR(255) NULL,
  -- Foto del producto. Guarda la URL pública que devuelve Supabase Storage,
  -- igual que mascotas.foto; el archivo en sí nunca entra en la base.
  imagen            VARCHAR(255) NULL,
  unidad            VARCHAR(20) NOT NULL DEFAULT 'unidad',
  -- Existencia total sumada de todas las ubicaciones. La mantiene al día el
  -- disparador de movimientos, así que las consultas rápidas no tienen que
  -- agregar la tabla de existencias.
  cantidad          INTEGER NOT NULL DEFAULT 0,
  stock_minimo      INTEGER NOT NULL DEFAULT 0,
  precio_compra     NUMERIC(12,2) NOT NULL DEFAULT 0,
  precio_venta      NUMERIC(12,2) NOT NULL DEFAULT 0,
  requiere_lote     SMALLINT NOT NULL DEFAULT 0,
  activo            SMALLINT NOT NULL DEFAULT 1,
  creado_en         TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_productos_sku UNIQUE (sku),
  CONSTRAINT chk_productos_cantidad CHECK (cantidad >= 0),
  CONSTRAINT chk_productos_activo   CHECK (activo IN (0,1)),
  CONSTRAINT chk_productos_lote     CHECK (requiere_lote IN (0,1)),
  CONSTRAINT fk_productos_categoria FOREIGN KEY (categoria_id) REFERENCES inventario.categorias_productos(id),
  CONSTRAINT fk_productos_proveedor FOREIGN KEY (proveedor_id) REFERENCES inventario.proveedores(id) ON DELETE SET NULL
);
CREATE INDEX idx_productos_stock ON inventario.productos (cantidad, stock_minimo);

-- El medicamento de la receta apunta al producto que se descuenta del stock.
ALTER TABLE historia_clinica.medicamentos
  ADD CONSTRAINT fk_medicamentos_producto FOREIGN KEY (producto_id)
    REFERENCES inventario.productos(id) ON DELETE SET NULL;

-- Bodega, farmacia, consultorio… dentro de cada sede.
CREATE TABLE inventario.ubicaciones_inventario (
  id      SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id SMALLINT NOT NULL,
  nombre  VARCHAR(60) NOT NULL,
  tipo    VARCHAR(20) NOT NULL DEFAULT 'bodega',
  activo  SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_ubicaciones UNIQUE (sede_id, nombre),
  CONSTRAINT chk_ubicaciones_tipo   CHECK (tipo IN ('bodega','farmacia','consultorio','quirofano')),
  CONSTRAINT chk_ubicaciones_activo CHECK (activo IN (0,1)),
  CONSTRAINT fk_ubicaciones_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE CASCADE
);

CREATE TABLE inventario.lotes (
  id                INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  producto_id       INTEGER NOT NULL,
  codigo            VARCHAR(60) NOT NULL,
  fecha_vencimiento DATE NULL,
  precio_compra     NUMERIC(12,2) NULL,
  creado_en         TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_lotes UNIQUE (producto_id, codigo),
  CONSTRAINT fk_lotes_producto FOREIGN KEY (producto_id)
    REFERENCES inventario.productos(id) ON DELETE CASCADE
);
CREATE INDEX idx_lotes_vence ON inventario.lotes (fecha_vencimiento);

-- Cuánto hay de cada producto, en qué ubicación y de qué lote.
CREATE TABLE inventario.existencias (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  producto_id  INTEGER NOT NULL,
  ubicacion_id SMALLINT NOT NULL,
  lote_id      INTEGER NULL,
  cantidad     INTEGER NOT NULL DEFAULT 0,
  actualizado_en TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  -- NULLS NOT DISTINCT para que el ON CONFLICT del disparador de stock
  -- encuentre la fila de los productos que no manejan lote.
  CONSTRAINT uq_existencias UNIQUE NULLS NOT DISTINCT (producto_id, ubicacion_id, lote_id),
  CONSTRAINT chk_existencias_cantidad CHECK (cantidad >= 0),
  CONSTRAINT fk_existencias_producto  FOREIGN KEY (producto_id)  REFERENCES inventario.productos(id) ON DELETE CASCADE,
  CONSTRAINT fk_existencias_ubicacion FOREIGN KEY (ubicacion_id) REFERENCES inventario.ubicaciones_inventario(id) ON DELETE CASCADE,
  CONSTRAINT fk_existencias_lote      FOREIGN KEY (lote_id)      REFERENCES inventario.lotes(id) ON DELETE SET NULL
);
CREATE INDEX idx_existencias_producto ON inventario.existencias (producto_id);

CREATE TRIGGER trg_existencias_actualizado BEFORE UPDATE ON inventario.existencias
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_actualizado_en();

CREATE TABLE inventario.compras (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  proveedor_id INTEGER NOT NULL,
  sede_id      SMALLINT NULL,
  usuario_id   INTEGER NULL,
  numero       VARCHAR(30) NOT NULL,
  fecha        DATE NOT NULL DEFAULT CURRENT_DATE,
  subtotal     NUMERIC(12,2) NOT NULL DEFAULT 0,
  impuestos    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total        NUMERIC(12,2) NOT NULL DEFAULT 0,
  estado       VARCHAR(12) NOT NULL DEFAULT 'recibida',
  notas        VARCHAR(255) NULL,
  creado_en    TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_compras_numero UNIQUE (numero),
  CONSTRAINT chk_compras_estado CHECK (estado IN ('pendiente','recibida','anulada')),
  CONSTRAINT fk_compras_proveedor FOREIGN KEY (proveedor_id) REFERENCES inventario.proveedores(id),
  CONSTRAINT fk_compras_sede      FOREIGN KEY (sede_id)      REFERENCES configuracion.sedes(id) ON DELETE SET NULL,
  CONSTRAINT fk_compras_usuario   FOREIGN KEY (usuario_id)   REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_compras_fecha ON inventario.compras (fecha);

CREATE TABLE inventario.detalle_compras (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  compra_id   INTEGER NOT NULL,
  producto_id INTEGER NOT NULL,
  lote_id     INTEGER NULL,
  cantidad    INTEGER NOT NULL,
  precio_unit NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_linea NUMERIC(12,2) NOT NULL DEFAULT 0,
  CONSTRAINT chk_detalle_compras_cantidad CHECK (cantidad > 0),
  CONSTRAINT fk_detalle_compras_compra   FOREIGN KEY (compra_id)   REFERENCES inventario.compras(id) ON DELETE CASCADE,
  CONSTRAINT fk_detalle_compras_producto FOREIGN KEY (producto_id) REFERENCES inventario.productos(id),
  CONSTRAINT fk_detalle_compras_lote     FOREIGN KEY (lote_id)     REFERENCES inventario.lotes(id) ON DELETE SET NULL
);
CREATE INDEX idx_detalle_compras ON inventario.detalle_compras (compra_id);

-- Kardex: toda entrada, salida o ajuste queda registrado aquí y el
-- disparador de más abajo es el que mueve productos.cantidad.
CREATE TABLE inventario.movimientos_inventario (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  producto_id  INTEGER NOT NULL,
  ubicacion_id SMALLINT NULL,
  lote_id      INTEGER NULL,
  usuario_id   INTEGER NULL,
  tipo         VARCHAR(10) NOT NULL,
  cantidad     INTEGER NOT NULL,
  motivo       VARCHAR(180) NULL,
  referencia   VARCHAR(60)  NULL,    -- nº de compra, factura, consulta…
  creado_en    TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_mov_tipo     CHECK (tipo IN ('entrada','salida','ajuste')),
  CONSTRAINT chk_mov_cantidad CHECK (cantidad >= 0),
  CONSTRAINT fk_mov_producto  FOREIGN KEY (producto_id)  REFERENCES inventario.productos(id) ON DELETE CASCADE,
  CONSTRAINT fk_mov_ubicacion FOREIGN KEY (ubicacion_id) REFERENCES inventario.ubicaciones_inventario(id) ON DELETE SET NULL,
  CONSTRAINT fk_mov_lote      FOREIGN KEY (lote_id)      REFERENCES inventario.lotes(id) ON DELETE SET NULL,
  CONSTRAINT fk_mov_usuario   FOREIGN KEY (usuario_id)   REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_mov_producto ON inventario.movimientos_inventario (producto_id, creado_en);

CREATE TABLE inventario.transferencias_inventario (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  origen_id     SMALLINT NOT NULL,
  destino_id    SMALLINT NOT NULL,
  usuario_id    INTEGER NULL,
  fecha         TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  estado        VARCHAR(12) NOT NULL DEFAULT 'completada',
  notas         VARCHAR(255) NULL,
  CONSTRAINT chk_transferencias_estado  CHECK (estado IN ('pendiente','completada','anulada')),
  CONSTRAINT chk_transferencias_distinta CHECK (origen_id <> destino_id),
  CONSTRAINT fk_transferencias_origen  FOREIGN KEY (origen_id)  REFERENCES inventario.ubicaciones_inventario(id),
  CONSTRAINT fk_transferencias_destino FOREIGN KEY (destino_id) REFERENCES inventario.ubicaciones_inventario(id),
  CONSTRAINT fk_transferencias_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE inventario.detalle_transferencias (
  id               INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  transferencia_id INTEGER NOT NULL,
  producto_id      INTEGER NOT NULL,
  lote_id          INTEGER NULL,
  cantidad         INTEGER NOT NULL,
  CONSTRAINT chk_detalle_transferencias_cantidad CHECK (cantidad > 0),
  CONSTRAINT fk_detalle_transf_transf   FOREIGN KEY (transferencia_id) REFERENCES inventario.transferencias_inventario(id) ON DELETE CASCADE,
  CONSTRAINT fk_detalle_transf_producto FOREIGN KEY (producto_id)      REFERENCES inventario.productos(id),
  CONSTRAINT fk_detalle_transf_lote     FOREIGN KEY (lote_id)          REFERENCES inventario.lotes(id) ON DELETE SET NULL
);
CREATE INDEX idx_detalle_transferencias ON inventario.detalle_transferencias (transferencia_id);


-- =====================================================================
--  MÓDULO 8 · FACTURACION
-- =====================================================================

CREATE TABLE facturacion.facturas (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  numero      VARCHAR(30) NOT NULL,
  sede_id     SMALLINT NULL,
  cliente_id  INTEGER NOT NULL,
  cita_id     INTEGER NULL,
  consulta_id INTEGER NULL,
  usuario_id  INTEGER NULL,             -- quién la emitió
  fecha       DATE NOT NULL DEFAULT CURRENT_DATE,
  subtotal    NUMERIC(12,2) NOT NULL DEFAULT 0,
  descuento   NUMERIC(12,2) NOT NULL DEFAULT 0,
  impuestos   NUMERIC(12,2) NOT NULL DEFAULT 0,
  total       NUMERIC(12,2) NOT NULL DEFAULT 0,
  pagado      NUMERIC(12,2) NOT NULL DEFAULT 0,
  estado      VARCHAR(10) NOT NULL DEFAULT 'pendiente',
  observaciones VARCHAR(255) NULL,
  creado_en   TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  actualizado_en TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_facturas_numero UNIQUE (numero),
  CONSTRAINT chk_facturas_estado CHECK (estado IN ('pendiente','parcial','pagada','anulada')),
  CONSTRAINT fk_facturas_sede     FOREIGN KEY (sede_id)     REFERENCES configuracion.sedes(id) ON DELETE SET NULL,
  CONSTRAINT fk_facturas_cliente  FOREIGN KEY (cliente_id)  REFERENCES usuarios.clientes(id),
  CONSTRAINT fk_facturas_cita     FOREIGN KEY (cita_id)     REFERENCES agenda.citas(id) ON DELETE SET NULL,
  CONSTRAINT fk_facturas_consulta FOREIGN KEY (consulta_id) REFERENCES historia_clinica.consultas(id) ON DELETE SET NULL,
  CONSTRAINT fk_facturas_usuario  FOREIGN KEY (usuario_id)  REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_facturas_estado  ON facturacion.facturas (estado, fecha);
CREATE INDEX idx_facturas_cliente ON facturacion.facturas (cliente_id, fecha);

CREATE TRIGGER trg_facturas_actualizado BEFORE UPDATE ON facturacion.facturas
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_actualizado_en();

CREATE TABLE facturacion.detalle_facturas (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  factura_id   INTEGER NOT NULL,
  servicio_id  SMALLINT NULL,
  producto_id  INTEGER NULL,
  examen_id    INTEGER NULL,
  descripcion  VARCHAR(180) NOT NULL,
  cantidad     NUMERIC(10,2) NOT NULL DEFAULT 1,
  precio_unit  NUMERIC(12,2) NOT NULL,
  descuento    NUMERIC(12,2) NOT NULL DEFAULT 0,
  impuesto     NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_linea  NUMERIC(12,2) NOT NULL,
  CONSTRAINT chk_detalle_facturas_cantidad CHECK (cantidad > 0),
  CONSTRAINT fk_detalle_facturas_factura  FOREIGN KEY (factura_id)  REFERENCES facturacion.facturas(id) ON DELETE CASCADE,
  CONSTRAINT fk_detalle_facturas_servicio FOREIGN KEY (servicio_id) REFERENCES agenda.servicios(id) ON DELETE SET NULL,
  CONSTRAINT fk_detalle_facturas_producto FOREIGN KEY (producto_id) REFERENCES inventario.productos(id) ON DELETE SET NULL,
  CONSTRAINT fk_detalle_facturas_examen   FOREIGN KEY (examen_id)   REFERENCES historia_clinica.examenes(id) ON DELETE SET NULL
);
CREATE INDEX idx_detalle_facturas ON facturacion.detalle_facturas (factura_id);

CREATE TABLE facturacion.pagos (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  factura_id  INTEGER NOT NULL,
  usuario_id  INTEGER NULL,
  metodo      VARCHAR(15) NOT NULL,
  valor       NUMERIC(12,2) NOT NULL,
  referencia  VARCHAR(100) NULL,
  estado      VARCHAR(12) NOT NULL DEFAULT 'registrado',
  fecha       TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_pagos_metodo CHECK (metodo IN ('efectivo','tarjeta','transferencia','en_linea')),
  CONSTRAINT chk_pagos_estado CHECK (estado IN ('registrado','anulado')),
  CONSTRAINT chk_pagos_valor  CHECK (valor > 0),
  CONSTRAINT fk_pagos_factura FOREIGN KEY (factura_id) REFERENCES facturacion.facturas(id) ON DELETE CASCADE,
  CONSTRAINT fk_pagos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_pagos_factura ON facturacion.pagos (factura_id);

CREATE TABLE facturacion.devoluciones (
  id         INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  factura_id INTEGER NOT NULL,
  usuario_id INTEGER NULL,
  numero     VARCHAR(30) NOT NULL,
  fecha      TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  motivo     VARCHAR(255) NOT NULL,
  total      NUMERIC(12,2) NOT NULL DEFAULT 0,
  estado     VARCHAR(12) NOT NULL DEFAULT 'registrada',
  CONSTRAINT uq_devoluciones_numero UNIQUE (numero),
  CONSTRAINT chk_devoluciones_estado CHECK (estado IN ('registrada','anulada')),
  CONSTRAINT fk_devoluciones_factura FOREIGN KEY (factura_id) REFERENCES facturacion.facturas(id) ON DELETE CASCADE,
  CONSTRAINT fk_devoluciones_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE facturacion.detalle_devoluciones (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  devolucion_id  INTEGER NOT NULL,
  detalle_id     INTEGER NULL,          -- línea original de la factura
  descripcion    VARCHAR(180) NOT NULL,
  cantidad       NUMERIC(10,2) NOT NULL DEFAULT 1,
  valor          NUMERIC(12,2) NOT NULL DEFAULT 0,
  reingresa_stock SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT chk_detalle_dev_cantidad CHECK (cantidad > 0),
  CONSTRAINT chk_detalle_dev_reingresa CHECK (reingresa_stock IN (0,1)),
  CONSTRAINT fk_detalle_dev_devolucion FOREIGN KEY (devolucion_id)
    REFERENCES facturacion.devoluciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_detalle_dev_detalle FOREIGN KEY (detalle_id)
    REFERENCES facturacion.detalle_facturas(id) ON DELETE SET NULL
);
CREATE INDEX idx_detalle_devoluciones ON facturacion.detalle_devoluciones (devolucion_id);


-- =====================================================================
--  MÓDULO 9 · COMUNICACION
-- =====================================================================

CREATE TABLE comunicacion.plantillas_notificaciones (
  id        SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  codigo    VARCHAR(50) NOT NULL,
  canal     VARCHAR(15) NOT NULL DEFAULT 'sistema',
  asunto    VARCHAR(150) NOT NULL,
  cuerpo    TEXT NOT NULL,          -- admite marcas {{mascota}}, {{fecha}}…
  activo    SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_plantillas_codigo UNIQUE (codigo, canal),
  CONSTRAINT chk_plantillas_canal  CHECK (canal IN ('sistema','email','sms','whatsapp')),
  CONSTRAINT chk_plantillas_activo CHECK (activo IN (0,1))
);

CREATE TABLE comunicacion.notificaciones (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  usuario_id  INTEGER NOT NULL,
  plantilla_id SMALLINT NULL,
  tipo        VARCHAR(50) NOT NULL,        -- cita_confirmada, vacuna_proxima…
  titulo      VARCHAR(150) NOT NULL,
  mensaje     TEXT NULL,
  enlace      VARCHAR(255) NULL,
  canal       VARCHAR(15) NOT NULL DEFAULT 'sistema',
  leida       SMALLINT NOT NULL DEFAULT 0,
  leida_en    TIMESTAMP(0) NULL,
  creado_en   TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_notificaciones_leida CHECK (leida IN (0,1)),
  CONSTRAINT chk_notificaciones_canal CHECK (canal IN ('sistema','email','sms','whatsapp')),
  CONSTRAINT fk_notificaciones_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios.usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_notificaciones_plantilla FOREIGN KEY (plantilla_id)
    REFERENCES comunicacion.plantillas_notificaciones(id) ON DELETE SET NULL
);
CREATE INDEX idx_notificaciones_usuario ON comunicacion.notificaciones (usuario_id, leida, creado_en);

-- Avisos programados: recordatorio de cita, refuerzo de vacuna, control…
CREATE TABLE comunicacion.recordatorios (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  usuario_id    INTEGER NOT NULL,
  mascota_id    INTEGER NULL,
  cita_id       INTEGER NULL,
  aplicacion_id INTEGER NULL,          -- refuerzo de una vacuna aplicada
  tipo          VARCHAR(30) NOT NULL,
  canal         VARCHAR(15) NOT NULL DEFAULT 'sistema',
  programado_en TIMESTAMP(0) NOT NULL,
  enviado_en    TIMESTAMP(0) NULL,
  estado        VARCHAR(12) NOT NULL DEFAULT 'pendiente',
  mensaje       VARCHAR(255) NULL,
  CONSTRAINT chk_recordatorios_tipo   CHECK (tipo IN ('cita','vacuna','control','tratamiento','otro')),
  CONSTRAINT chk_recordatorios_canal  CHECK (canal IN ('sistema','email','sms','whatsapp')),
  CONSTRAINT chk_recordatorios_estado CHECK (estado IN ('pendiente','enviado','cancelado','fallido')),
  CONSTRAINT fk_recordatorios_usuario  FOREIGN KEY (usuario_id) REFERENCES usuarios.usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_recordatorios_mascota  FOREIGN KEY (mascota_id) REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_recordatorios_cita     FOREIGN KEY (cita_id)    REFERENCES agenda.citas(id) ON DELETE CASCADE,
  CONSTRAINT fk_recordatorios_aplicacion FOREIGN KEY (aplicacion_id)
    REFERENCES historia_clinica.aplicaciones_vacunas(id) ON DELETE CASCADE
);
CREATE INDEX idx_recordatorios_pendientes ON comunicacion.recordatorios (estado, programado_en);


-- =====================================================================
--  MÓDULO 10 · ARCHIVOS
--
--  Los documentos clínicos viven en historia_clinica.documentos_clinicos
--  (están en ese módulo porque forman parte de la historia). Aquí quedan
--  los soportes de facturación y los adjuntos genéricos.
-- =====================================================================

CREATE TABLE archivos.documentos_facturacion (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  factura_id   INTEGER NULL,
  pago_id      INTEGER NULL,
  compra_id    INTEGER NULL,
  subido_por   INTEGER NULL,
  tipo         VARCHAR(20) NOT NULL DEFAULT 'soporte',
  titulo       VARCHAR(150) NOT NULL,
  archivo      VARCHAR(255) NOT NULL,
  mime         VARCHAR(100) NULL,
  tamano_bytes INTEGER NULL,
  creado_en    TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_doc_fact_tipo CHECK (tipo IN ('factura','soporte','comprobante','nota_credito')),
  CONSTRAINT fk_doc_fact_factura FOREIGN KEY (factura_id) REFERENCES facturacion.facturas(id) ON DELETE CASCADE,
  CONSTRAINT fk_doc_fact_pago    FOREIGN KEY (pago_id)    REFERENCES facturacion.pagos(id) ON DELETE CASCADE,
  CONSTRAINT fk_doc_fact_compra  FOREIGN KEY (compra_id)  REFERENCES inventario.compras(id) ON DELETE CASCADE,
  CONSTRAINT fk_doc_fact_usuario FOREIGN KEY (subido_por) REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_doc_fact_factura ON archivos.documentos_facturacion (factura_id);

-- Adjunto genérico: se apunta a cualquier tabla por nombre + id, para no
-- llenar el esquema de tablas de archivos casi idénticas.
CREATE TABLE archivos.archivos_adjuntos (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  entidad      VARCHAR(60) NOT NULL,     -- 'mascotas', 'usuarios', 'cirugias'…
  entidad_id   VARCHAR(40) NOT NULL,
  subido_por   INTEGER NULL,
  titulo       VARCHAR(150) NOT NULL,
  archivo      VARCHAR(255) NOT NULL,
  mime         VARCHAR(100) NULL,
  tamano_bytes INTEGER NULL,
  publico      SMALLINT NOT NULL DEFAULT 0,
  creado_en    TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_adjuntos_publico CHECK (publico IN (0,1)),
  CONSTRAINT fk_adjuntos_usuario FOREIGN KEY (subido_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_adjuntos_entidad ON archivos.archivos_adjuntos (entidad, entidad_id);


-- =====================================================================
--  MÓDULO 11 · HISTORIA CLINICA AVANZADA
--
--  Lo que ya había (consultas, vacunas, exámenes, cirugías) se queda como
--  está. Aquí se añade lo que le faltaba a la historia para leerse como una
--  línea de tiempo completa: antecedentes, evolución, reacciones adversas,
--  firma de procedimientos y las curvas de crecimiento.
-- =====================================================================

-- Antecedentes: lo que trae el paciente de antes de esta clínica.
CREATE TABLE historia_clinica.antecedentes (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id    INTEGER NOT NULL,
  tipo          VARCHAR(20) NOT NULL,
  descripcion   TEXT NOT NULL,
  fecha         DATE NULL,             -- cuándo ocurrió, si se sabe
  relevante     SMALLINT NOT NULL DEFAULT 0,   -- 1 = se muestra siempre arriba
  registrado_por INTEGER NULL,
  creado_en     TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_antecedentes_tipo CHECK (tipo IN (
    'quirurgico','medico','reproductivo','familiar','habitat','conductual','otro')),
  CONSTRAINT chk_antecedentes_relevante CHECK (relevante IN (0,1)),
  CONSTRAINT fk_antecedentes_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_antecedentes_usuario FOREIGN KEY (registrado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_antecedentes_mascota ON historia_clinica.antecedentes (mascota_id, tipo);

-- Reacciones adversas a medicamentos. Va aparte de mascota_alergias porque una
-- alergia es un catálogo y esto es un suceso: qué se aplicó, qué pasó y cuándo.
CREATE TABLE historia_clinica.reacciones_medicamentosas (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id     INTEGER NOT NULL,
  medicamento_id INTEGER NULL,
  consulta_id    INTEGER NULL,
  descripcion    TEXT NOT NULL,
  severidad      VARCHAR(10) NOT NULL DEFAULT 'leve',
  fecha          DATE NOT NULL DEFAULT CURRENT_DATE,
  desenlace      VARCHAR(20) NULL,
  registrado_por INTEGER NULL,
  CONSTRAINT chk_reacciones_severidad CHECK (severidad IN ('leve','moderada','grave','mortal')),
  CONSTRAINT fk_reacciones_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_reacciones_medicamento FOREIGN KEY (medicamento_id)
    REFERENCES historia_clinica.medicamentos(id) ON DELETE SET NULL,
  CONSTRAINT fk_reacciones_consulta FOREIGN KEY (consulta_id)
    REFERENCES historia_clinica.consultas(id) ON DELETE SET NULL,
  CONSTRAINT fk_reacciones_usuario FOREIGN KEY (registrado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_reacciones_mascota ON historia_clinica.reacciones_medicamentosas (mascota_id);

-- Curva de crecimiento esperada. Con esto la gráfica de peso del portal puede
-- dibujar la banda normal y no solo los puntos sueltos de la mascota.
CREATE TABLE mascotas.referencias_crecimiento (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  especie_id  SMALLINT NOT NULL,
  porte       VARCHAR(12) NOT NULL DEFAULT 'mediano',
  sexo        VARCHAR(12) NOT NULL DEFAULT 'desconocido',
  edad_meses  SMALLINT NOT NULL,
  peso_min_kg NUMERIC(6,2) NOT NULL,
  peso_ideal_kg NUMERIC(6,2) NOT NULL,
  peso_max_kg NUMERIC(6,2) NOT NULL,
  CONSTRAINT uq_referencias_crecimiento UNIQUE (especie_id, porte, sexo, edad_meses),
  CONSTRAINT chk_referencias_porte CHECK (porte IN ('pequeno','mediano','grande','gigante')),
  CONSTRAINT chk_referencias_sexo  CHECK (sexo IN ('macho','hembra','desconocido')),
  CONSTRAINT chk_referencias_rango CHECK (peso_max_kg >= peso_ideal_kg AND peso_ideal_kg >= peso_min_kg),
  CONSTRAINT fk_referencias_especie FOREIGN KEY (especie_id)
    REFERENCES mascotas.especies(id) ON DELETE CASCADE
);

-- Porte de la raza, que es lo que decide qué curva de referencia aplica.
ALTER TABLE mascotas.razas
  ADD COLUMN porte VARCHAR(12) NOT NULL DEFAULT 'mediano',
  ADD CONSTRAINT chk_razas_porte CHECK (porte IN ('pequeno','mediano','grande','gigante'));

-- Medicamentos de control especial: los que exigen fórmula y libro de registro.
ALTER TABLE historia_clinica.medicamentos
  ADD COLUMN requiere_receta SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN restringido     SMALLINT NOT NULL DEFAULT 0,
  ADD CONSTRAINT chk_medicamentos_receta      CHECK (requiere_receta IN (0,1)),
  ADD CONSTRAINT chk_medicamentos_restringido CHECK (restringido IN (0,1));


-- =====================================================================
--  MÓDULO 12 · URGENCIAS
--
--  El triage decide el orden de atención: en urgencias no se atiende por
--  orden de llegada sino por gravedad, y eso tiene que estar en los datos,
--  no en la cabeza de quien está en recepción.
-- =====================================================================

CREATE TABLE urgencias.salas_urgencias (
  id       SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id  SMALLINT NOT NULL,
  nombre   VARCHAR(60) NOT NULL,
  tipo     VARCHAR(20) NOT NULL DEFAULT 'valoracion',
  capacidad SMALLINT NOT NULL DEFAULT 1,
  activo   SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_salas_urgencias UNIQUE (sede_id, nombre),
  CONSTRAINT chk_salas_urgencias_tipo CHECK (tipo IN ('valoracion','reanimacion','aislamiento','observacion')),
  CONSTRAINT chk_salas_urgencias_activo CHECK (activo IN (0,1)),
  CONSTRAINT chk_salas_urgencias_capacidad CHECK (capacidad > 0),
  CONSTRAINT fk_salas_urgencias_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE CASCADE
);

CREATE TABLE urgencias.ingresos_urgencias (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id        SMALLINT NULL,
  mascota_id     INTEGER NOT NULL,
  cliente_id     INTEGER NOT NULL,
  sala_id        SMALLINT NULL,
  veterinario_id INTEGER NULL,           -- responsable; se asigna en el triage
  consulta_id    INTEGER NULL,           -- la consulta que deja en la historia
  recibido_por   INTEGER NULL,
  llegada        TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  triage_en      TIMESTAMP(0) NULL,
  atencion_en    TIMESTAMP(0) NULL,
  cierre_en      TIMESTAMP(0) NULL,
  -- Escala de cinco niveles: rojo se atiende de inmediato y azul puede esperar.
  prioridad      VARCHAR(10) NULL,
  motivo         VARCHAR(255) NOT NULL,
  hallazgos_triage TEXT NULL,
  estado         VARCHAR(14) NOT NULL DEFAULT 'en_espera',
  desenlace      VARCHAR(16) NULL,
  observaciones  TEXT NULL,
  actualizado_en TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_ingresos_urgencias_consulta UNIQUE (consulta_id),
  CONSTRAINT chk_urgencias_prioridad CHECK (prioridad IS NULL OR prioridad IN ('rojo','naranja','amarillo','verde','azul')),
  CONSTRAINT chk_urgencias_estado CHECK (estado IN ('en_espera','en_triage','en_atencion','en_observacion','cerrado')),
  CONSTRAINT chk_urgencias_desenlace CHECK (desenlace IS NULL OR desenlace IN (
    'alta','hospitalizacion','remitido','fallecido','retiro_voluntario')),
  -- Cerrar exige decir cómo terminó: sin esto la estadística de urgencias
  -- quedaría con casos que "desaparecen" sin desenlace.
  CONSTRAINT chk_urgencias_cierre CHECK (estado <> 'cerrado' OR desenlace IS NOT NULL),
  CONSTRAINT fk_urgencias_sede    FOREIGN KEY (sede_id)    REFERENCES configuracion.sedes(id) ON DELETE SET NULL,
  CONSTRAINT fk_urgencias_mascota FOREIGN KEY (mascota_id) REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_urgencias_cliente FOREIGN KEY (cliente_id) REFERENCES usuarios.clientes(id),
  CONSTRAINT fk_urgencias_sala    FOREIGN KEY (sala_id)    REFERENCES urgencias.salas_urgencias(id) ON DELETE SET NULL,
  CONSTRAINT fk_urgencias_vet     FOREIGN KEY (veterinario_id) REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_urgencias_consulta FOREIGN KEY (consulta_id) REFERENCES historia_clinica.consultas(id) ON DELETE SET NULL,
  CONSTRAINT fk_urgencias_recibido FOREIGN KEY (recibido_por) REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_urgencias_estado   ON urgencias.ingresos_urgencias (estado, prioridad, llegada);
CREATE INDEX idx_urgencias_mascota  ON urgencias.ingresos_urgencias (mascota_id, llegada);

CREATE TRIGGER trg_urgencias_actualizado BEFORE UPDATE ON urgencias.ingresos_urgencias
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_actualizado_en();

-- Línea de tiempo de la emergencia. Todo lo que pasa —medicación, un
-- procedimiento, un cambio de estado— deja un renglón con su hora, que es lo
-- que después permite reconstruir el caso minuto a minuto.
CREATE TABLE urgencias.eventos_urgencias (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  ingreso_id  INTEGER NOT NULL,
  usuario_id  INTEGER NULL,
  tipo        VARCHAR(20) NOT NULL,
  descripcion TEXT NOT NULL,
  detalle     JSONB NULL,          -- dosis, vía, valores… según el tipo
  fecha       TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_eventos_urgencias_tipo CHECK (tipo IN (
    'llegada','triage','signos','medicacion','procedimiento','examen',
    'evolucion','traslado','alta','nota')),
  CONSTRAINT fk_eventos_urgencias_ingreso FOREIGN KEY (ingreso_id)
    REFERENCES urgencias.ingresos_urgencias(id) ON DELETE CASCADE,
  CONSTRAINT fk_eventos_urgencias_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_eventos_urgencias ON urgencias.eventos_urgencias (ingreso_id, fecha);

-- Medicación administrada durante la urgencia. Va en tabla propia, y no solo
-- como evento, porque hay que poder sumar dosis y cruzarla con las alergias.
CREATE TABLE urgencias.medicacion_urgencias (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  ingreso_id     INTEGER NOT NULL,
  medicamento_id INTEGER NULL,
  producto_id    INTEGER NULL,
  descripcion    VARCHAR(180) NOT NULL,
  dosis          VARCHAR(80) NULL,
  via            VARCHAR(20) NULL,
  cantidad       NUMERIC(10,2) NULL,
  administrado_por INTEGER NULL,
  fecha          TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT fk_medurg_ingreso     FOREIGN KEY (ingreso_id)     REFERENCES urgencias.ingresos_urgencias(id) ON DELETE CASCADE,
  CONSTRAINT fk_medurg_medicamento FOREIGN KEY (medicamento_id) REFERENCES historia_clinica.medicamentos(id) ON DELETE SET NULL,
  CONSTRAINT fk_medurg_producto    FOREIGN KEY (producto_id)    REFERENCES inventario.productos(id) ON DELETE SET NULL,
  CONSTRAINT fk_medurg_usuario     FOREIGN KEY (administrado_por) REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_medurg_ingreso ON urgencias.medicacion_urgencias (ingreso_id, fecha);

CREATE TABLE urgencias.procedimientos_urgencias (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  ingreso_id   INTEGER NOT NULL,
  nombre       VARCHAR(150) NOT NULL,
  descripcion  TEXT NULL,
  realizado_por INTEGER NULL,
  inicio       TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  fin          TIMESTAMP(0) NULL,
  resultado    TEXT NULL,
  CONSTRAINT chk_procurg_rango CHECK (fin IS NULL OR fin >= inicio),
  CONSTRAINT fk_procurg_ingreso FOREIGN KEY (ingreso_id)
    REFERENCES urgencias.ingresos_urgencias(id) ON DELETE CASCADE,
  CONSTRAINT fk_procurg_usuario FOREIGN KEY (realizado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_procurg_ingreso ON urgencias.procedimientos_urgencias (ingreso_id);

-- Los signos vitales de una urgencia son los mismos de siempre, así que se
-- reutiliza la tabla en vez de duplicarla: solo hace falta saber a qué ingreso
-- pertenecen.
ALTER TABLE historia_clinica.signos_vitales
  ADD COLUMN ingreso_urgencia_id INTEGER NULL,
  ADD CONSTRAINT fk_signos_urgencia FOREIGN KEY (ingreso_urgencia_id)
    REFERENCES urgencias.ingresos_urgencias(id) ON DELETE CASCADE;
CREATE INDEX idx_signos_urgencia ON historia_clinica.signos_vitales (ingreso_urgencia_id);


-- =====================================================================
--  MÓDULO 13 · HOSPITALIZACION
--
--  Ya existía la hospitalización y sus controles. Lo que faltaba era el
--  lado físico (qué jaula está libre) y el día a día del paciente:
--  qué comió, qué se le puso y quién vino a verlo.
-- =====================================================================

CREATE TABLE historia_clinica.habitaciones (
  id        SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id   SMALLINT NOT NULL,
  codigo    VARCHAR(20) NOT NULL,
  nombre    VARCHAR(60) NULL,
  tipo      VARCHAR(16) NOT NULL DEFAULT 'jaula',
  tamano    VARCHAR(10) NOT NULL DEFAULT 'mediano',
  -- Aislamiento para infectocontagiosos: no se mezcla con el resto.
  aislamiento SMALLINT NOT NULL DEFAULT 0,
  estado    VARCHAR(14) NOT NULL DEFAULT 'disponible',
  notas     VARCHAR(255) NULL,
  activo    SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_habitaciones UNIQUE (sede_id, codigo),
  CONSTRAINT chk_habitaciones_tipo   CHECK (tipo IN ('jaula','habitacion','uci','aislamiento')),
  CONSTRAINT chk_habitaciones_tamano CHECK (tamano IN ('pequeno','mediano','grande')),
  CONSTRAINT chk_habitaciones_estado CHECK (estado IN ('disponible','ocupada','limpieza','mantenimiento')),
  CONSTRAINT chk_habitaciones_aislamiento CHECK (aislamiento IN (0,1)),
  CONSTRAINT chk_habitaciones_activo CHECK (activo IN (0,1)),
  CONSTRAINT fk_habitaciones_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE CASCADE
);

ALTER TABLE historia_clinica.hospitalizaciones
  ADD COLUMN habitacion_id SMALLINT NULL,
  ADD COLUMN dieta VARCHAR(180) NULL,
  ADD COLUMN pronostico VARCHAR(16) NULL,
  ADD CONSTRAINT chk_hosp_pronostico CHECK (pronostico IS NULL OR pronostico IN ('bueno','reservado','malo')),
  ADD CONSTRAINT fk_hosp_habitacion FOREIGN KEY (habitacion_id)
    REFERENCES historia_clinica.habitaciones(id) ON DELETE SET NULL;

CREATE TABLE historia_clinica.hospitalizacion_alimentacion (
  id                 INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  hospitalizacion_id INTEGER NOT NULL,
  registrado_por     INTEGER NULL,
  fecha              TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  alimento           VARCHAR(140) NULL,
  cantidad_g         NUMERIC(8,2) NULL,
  consumido          VARCHAR(12) NOT NULL DEFAULT 'total',
  agua_ml            NUMERIC(8,2) NULL,
  observaciones      VARCHAR(255) NULL,
  CONSTRAINT chk_hosp_alim_consumido CHECK (consumido IN ('total','parcial','nada','rechazo')),
  CONSTRAINT fk_hosp_alim_hosp FOREIGN KEY (hospitalizacion_id)
    REFERENCES historia_clinica.hospitalizaciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_hosp_alim_usuario FOREIGN KEY (registrado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_hosp_alim ON historia_clinica.hospitalizacion_alimentacion (hospitalizacion_id, fecha);

-- Plan de medicación del paciente internado: qué toca, cada cuánto y hasta
-- cuándo. Las tomas concretas se marcan sobre esta misma fila (proxima_toma),
-- que es lo que alimenta la alerta de "control pendiente".
CREATE TABLE historia_clinica.hospitalizacion_medicacion (
  id                 INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  hospitalizacion_id INTEGER NOT NULL,
  medicamento_id     INTEGER NULL,
  descripcion        VARCHAR(180) NOT NULL,
  dosis              VARCHAR(80) NULL,
  via                VARCHAR(20) NULL,
  cada_horas         SMALLINT NULL,
  inicio             TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  fin                TIMESTAMP(0) NULL,
  proxima_toma       TIMESTAMP(0) NULL,
  estado             VARCHAR(12) NOT NULL DEFAULT 'activo',
  indicado_por       INTEGER NULL,
  CONSTRAINT chk_hosp_med_estado CHECK (estado IN ('activo','suspendido','finalizado')),
  CONSTRAINT chk_hosp_med_horas  CHECK (cada_horas IS NULL OR cada_horas > 0),
  CONSTRAINT fk_hosp_med_hosp FOREIGN KEY (hospitalizacion_id)
    REFERENCES historia_clinica.hospitalizaciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_hosp_med_medicamento FOREIGN KEY (medicamento_id)
    REFERENCES historia_clinica.medicamentos(id) ON DELETE SET NULL,
  CONSTRAINT fk_hosp_med_vet FOREIGN KEY (indicado_por)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_hosp_med ON historia_clinica.hospitalizacion_medicacion (hospitalizacion_id, estado);
CREATE INDEX idx_hosp_med_proxima ON historia_clinica.hospitalizacion_medicacion (proxima_toma) WHERE estado = 'activo';

CREATE TABLE historia_clinica.hospitalizacion_visitas (
  id                 INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  hospitalizacion_id INTEGER NOT NULL,
  visitante          VARCHAR(120) NOT NULL,
  parentesco         VARCHAR(60) NULL,
  autorizada_por     INTEGER NULL,
  entrada            TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  salida             TIMESTAMP(0) NULL,
  observaciones      VARCHAR(255) NULL,
  CONSTRAINT chk_hosp_visita_rango CHECK (salida IS NULL OR salida >= entrada),
  CONSTRAINT fk_hosp_visita_hosp FOREIGN KEY (hospitalizacion_id)
    REFERENCES historia_clinica.hospitalizaciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_hosp_visita_usuario FOREIGN KEY (autorizada_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_hosp_visitas ON historia_clinica.hospitalizacion_visitas (hospitalizacion_id, entrada);

-- Evolución médica. Sirve para una consulta, una hospitalización o una
-- urgencia, que son los tres sitios donde un paciente "evoluciona".
CREATE TABLE historia_clinica.evoluciones (
  id                 INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id         INTEGER NOT NULL,
  consulta_id        INTEGER NULL,
  hospitalizacion_id INTEGER NULL,
  ingreso_urgencia_id INTEGER NULL,
  veterinario_id     INTEGER NULL,
  fecha              TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  subjetivo          TEXT NULL,     -- lo que refiere el dueño o se observa
  objetivo           TEXT NULL,     -- hallazgos medibles
  analisis           TEXT NULL,
  plan               TEXT NULL,
  estado_paciente    VARCHAR(14) NULL,
  -- La IA puede proponer un borrador, pero la fila solo se da por buena cuando
  -- un veterinario la firma. Ver el módulo de IA más abajo.
  generado_por_ia    SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT chk_evoluciones_estado CHECK (estado_paciente IS NULL OR estado_paciente IN (
    'critico','delicado','estable','en_mejoria','recuperado')),
  CONSTRAINT chk_evoluciones_ia CHECK (generado_por_ia IN (0,1)),
  CONSTRAINT fk_evoluciones_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_evoluciones_consulta FOREIGN KEY (consulta_id)
    REFERENCES historia_clinica.consultas(id) ON DELETE CASCADE,
  CONSTRAINT fk_evoluciones_hosp FOREIGN KEY (hospitalizacion_id)
    REFERENCES historia_clinica.hospitalizaciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_evoluciones_urgencia FOREIGN KEY (ingreso_urgencia_id)
    REFERENCES urgencias.ingresos_urgencias(id) ON DELETE CASCADE,
  CONSTRAINT fk_evoluciones_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_evoluciones_mascota ON historia_clinica.evoluciones (mascota_id, fecha);
CREATE INDEX idx_evoluciones_hosp    ON historia_clinica.evoluciones (hospitalizacion_id, fecha);

-- Firma digital de procedimientos (consentimientos, altas, cirugías).
--
-- No es una firma criptográfica con certificado: se guarda el trazo, quién
-- firmó, cuándo, desde qué IP y el hash del texto exacto que se aceptó. Con eso
-- se puede demostrar que el documento no cambió después de firmarse, que es lo
-- que hace falta en la práctica para un consentimiento.
CREATE TABLE historia_clinica.firmas_procedimientos (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  entidad       VARCHAR(40) NOT NULL,      -- 'cirugias', 'hospitalizaciones'…
  entidad_id    INTEGER NOT NULL,
  mascota_id    INTEGER NULL,
  firmante_id   INTEGER NULL,              -- usuario, si firmó dentro del sistema
  firmante_nombre VARCHAR(120) NOT NULL,
  firmante_documento VARCHAR(30) NULL,
  rol_firmante  VARCHAR(20) NOT NULL DEFAULT 'propietario',
  documento_texto TEXT NOT NULL,
  documento_hash  CHAR(64) NOT NULL,       -- SHA-256 del texto firmado
  firma_imagen  VARCHAR(255) NULL,         -- trazo en Storage
  ip            VARCHAR(45) NULL,
  firmado_en    TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_firmas_rol CHECK (rol_firmante IN ('propietario','veterinario','testigo','autorizado')),
  CONSTRAINT fk_firmas_mascota  FOREIGN KEY (mascota_id)  REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_firmas_firmante FOREIGN KEY (firmante_id) REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_firmas_entidad ON historia_clinica.firmas_procedimientos (entidad, entidad_id);


-- =====================================================================
--  MÓDULO 14 · FARMACIA
--
--  La receta es el documento que firma el veterinario; la dispensación es
--  lo que efectivamente sale del estante. Son dos cosas distintas: se
--  puede recetar y que el dueño compre fuera, o dispensar parcialmente.
-- =====================================================================

CREATE TABLE farmacia.recetas (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  numero         VARCHAR(30) NOT NULL,
  mascota_id     INTEGER NOT NULL,
  cliente_id     INTEGER NOT NULL,
  veterinario_id INTEGER NOT NULL,
  consulta_id    INTEGER NULL,
  tratamiento_id INTEGER NULL,
  sede_id        SMALLINT NULL,
  fecha          TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  vigente_hasta  DATE NULL,
  estado         VARCHAR(14) NOT NULL DEFAULT 'emitida',
  indicaciones   TEXT NULL,
  firma_id       INTEGER NULL,
  CONSTRAINT uq_recetas_numero UNIQUE (numero),
  CONSTRAINT chk_recetas_estado CHECK (estado IN ('emitida','dispensada','parcial','vencida','anulada')),
  CONSTRAINT fk_recetas_mascota     FOREIGN KEY (mascota_id)     REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_recetas_cliente     FOREIGN KEY (cliente_id)     REFERENCES usuarios.clientes(id),
  CONSTRAINT fk_recetas_vet         FOREIGN KEY (veterinario_id) REFERENCES usuarios.veterinarios(id),
  CONSTRAINT fk_recetas_consulta    FOREIGN KEY (consulta_id)    REFERENCES historia_clinica.consultas(id) ON DELETE SET NULL,
  CONSTRAINT fk_recetas_tratamiento FOREIGN KEY (tratamiento_id) REFERENCES historia_clinica.tratamientos(id) ON DELETE SET NULL,
  CONSTRAINT fk_recetas_sede        FOREIGN KEY (sede_id)        REFERENCES configuracion.sedes(id) ON DELETE SET NULL,
  CONSTRAINT fk_recetas_firma       FOREIGN KEY (firma_id)       REFERENCES historia_clinica.firmas_procedimientos(id) ON DELETE SET NULL
);
CREATE INDEX idx_recetas_mascota ON farmacia.recetas (mascota_id, fecha);
CREATE INDEX idx_recetas_estado  ON farmacia.recetas (estado, fecha);

CREATE TABLE farmacia.receta_items (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  receta_id      INTEGER NOT NULL,
  medicamento_id INTEGER NOT NULL,
  dosis          VARCHAR(80) NULL,
  frecuencia     VARCHAR(80) NULL,
  duracion       VARCHAR(80) NULL,
  via            VARCHAR(20) NULL,
  cantidad       NUMERIC(10,2) NOT NULL DEFAULT 1,
  dispensado     NUMERIC(10,2) NOT NULL DEFAULT 0,
  indicaciones   TEXT NULL,
  CONSTRAINT chk_receta_items_cantidad CHECK (cantidad > 0),
  CONSTRAINT chk_receta_items_dispensado CHECK (dispensado >= 0 AND dispensado <= cantidad),
  CONSTRAINT fk_receta_items_receta FOREIGN KEY (receta_id)
    REFERENCES farmacia.recetas(id) ON DELETE CASCADE,
  CONSTRAINT fk_receta_items_medicamento FOREIGN KEY (medicamento_id)
    REFERENCES historia_clinica.medicamentos(id)
);
CREATE INDEX idx_receta_items ON farmacia.receta_items (receta_id);

CREATE TABLE farmacia.dispensaciones (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  receta_id    INTEGER NULL,             -- venta libre: sin receta
  cliente_id   INTEGER NULL,
  mascota_id   INTEGER NULL,
  factura_id   INTEGER NULL,
  sede_id      SMALLINT NULL,
  entregado_por INTEGER NULL,
  recibe       VARCHAR(120) NULL,
  documento_recibe VARCHAR(30) NULL,
  fecha        TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  estado       VARCHAR(12) NOT NULL DEFAULT 'entregada',
  observaciones VARCHAR(255) NULL,
  CONSTRAINT chk_dispensaciones_estado CHECK (estado IN ('entregada','anulada')),
  CONSTRAINT fk_dispensaciones_receta  FOREIGN KEY (receta_id)  REFERENCES farmacia.recetas(id) ON DELETE SET NULL,
  CONSTRAINT fk_dispensaciones_cliente FOREIGN KEY (cliente_id) REFERENCES usuarios.clientes(id) ON DELETE SET NULL,
  CONSTRAINT fk_dispensaciones_mascota FOREIGN KEY (mascota_id) REFERENCES mascotas.mascotas(id) ON DELETE SET NULL,
  CONSTRAINT fk_dispensaciones_factura FOREIGN KEY (factura_id) REFERENCES facturacion.facturas(id) ON DELETE SET NULL,
  CONSTRAINT fk_dispensaciones_sede    FOREIGN KEY (sede_id)    REFERENCES configuracion.sedes(id) ON DELETE SET NULL,
  CONSTRAINT fk_dispensaciones_usuario FOREIGN KEY (entregado_por) REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_dispensaciones_receta ON farmacia.dispensaciones (receta_id);
CREATE INDEX idx_dispensaciones_fecha  ON farmacia.dispensaciones (fecha);

CREATE TABLE farmacia.dispensacion_items (
  id              INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  dispensacion_id INTEGER NOT NULL,
  receta_item_id  INTEGER NULL,
  producto_id     INTEGER NOT NULL,
  lote_id         INTEGER NULL,
  cantidad        NUMERIC(10,2) NOT NULL,
  precio_unit     NUMERIC(12,2) NOT NULL DEFAULT 0,
  CONSTRAINT chk_disp_items_cantidad CHECK (cantidad > 0),
  CONSTRAINT fk_disp_items_dispensacion FOREIGN KEY (dispensacion_id)
    REFERENCES farmacia.dispensaciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_disp_items_receta_item FOREIGN KEY (receta_item_id)
    REFERENCES farmacia.receta_items(id) ON DELETE SET NULL,
  CONSTRAINT fk_disp_items_producto FOREIGN KEY (producto_id)
    REFERENCES inventario.productos(id),
  CONSTRAINT fk_disp_items_lote FOREIGN KEY (lote_id)
    REFERENCES inventario.lotes(id) ON DELETE SET NULL
);
CREATE INDEX idx_disp_items ON farmacia.dispensacion_items (dispensacion_id);

-- Catálogo de interacciones entre principios activos. Es un catálogo, no un
-- oráculo: el sistema avisa, la decisión sigue siendo del veterinario.
CREATE TABLE farmacia.interacciones_medicamentosas (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  principio_a  VARCHAR(120) NOT NULL,
  principio_b  VARCHAR(120) NOT NULL,
  severidad    VARCHAR(12) NOT NULL DEFAULT 'moderada',
  efecto       VARCHAR(255) NOT NULL,
  recomendacion TEXT NULL,
  fuente       VARCHAR(180) NULL,
  activo       SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_interacciones UNIQUE (principio_a, principio_b),
  CONSTRAINT chk_interacciones_severidad CHECK (severidad IN ('leve','moderada','grave','contraindicada')),
  CONSTRAINT chk_interacciones_activo CHECK (activo IN (0,1)),
  CONSTRAINT chk_interacciones_distintos CHECK (principio_a <> principio_b)
);
CREATE INDEX idx_interacciones_a ON farmacia.interacciones_medicamentosas (principio_a);
CREATE INDEX idx_interacciones_b ON farmacia.interacciones_medicamentosas (principio_b);

CREATE TABLE farmacia.devoluciones_medicamentos (
  id              INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  dispensacion_id INTEGER NULL,
  producto_id     INTEGER NOT NULL,
  lote_id         INTEGER NULL,
  cliente_id      INTEGER NULL,
  recibido_por    INTEGER NULL,
  cantidad        NUMERIC(10,2) NOT NULL,
  motivo          VARCHAR(255) NOT NULL,
  destino         VARCHAR(14) NOT NULL DEFAULT 'reingreso',
  fecha           TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_dev_med_cantidad CHECK (cantidad > 0),
  -- Un medicamento devuelto no siempre vuelve al estante: si se rompió la
  -- cadena de frío o venció, va a destrucción y eso queda registrado.
  CONSTRAINT chk_dev_med_destino CHECK (destino IN ('reingreso','destruccion','cuarentena')),
  CONSTRAINT fk_dev_med_dispensacion FOREIGN KEY (dispensacion_id)
    REFERENCES farmacia.dispensaciones(id) ON DELETE SET NULL,
  CONSTRAINT fk_dev_med_producto FOREIGN KEY (producto_id) REFERENCES inventario.productos(id),
  CONSTRAINT fk_dev_med_lote     FOREIGN KEY (lote_id)     REFERENCES inventario.lotes(id) ON DELETE SET NULL,
  CONSTRAINT fk_dev_med_cliente  FOREIGN KEY (cliente_id)  REFERENCES usuarios.clientes(id) ON DELETE SET NULL,
  CONSTRAINT fk_dev_med_usuario  FOREIGN KEY (recibido_por) REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_dev_med_fecha ON farmacia.devoluciones_medicamentos (fecha);


-- =====================================================================
--  MÓDULO 15 · LABORATORIO
--
--  El examen ya existía en la historia clínica. Lo que se añade es el
--  circuito completo: orden → muestra → resultado por parámetro →
--  validación → aviso. El examen sigue siendo el mismo registro, para que
--  la historia clínica no se parta en dos.
-- =====================================================================

CREATE TABLE laboratorio.ordenes_laboratorio (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  numero         VARCHAR(30) NOT NULL,
  mascota_id     INTEGER NOT NULL,
  consulta_id    INTEGER NULL,
  veterinario_id INTEGER NOT NULL,
  sede_id        SMALLINT NULL,
  fecha          TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  prioridad      VARCHAR(10) NOT NULL DEFAULT 'normal',
  estado         VARCHAR(12) NOT NULL DEFAULT 'solicitada',
  indicaciones   TEXT NULL,
  ayuno          SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT uq_ordenes_lab_numero UNIQUE (numero),
  CONSTRAINT chk_ordenes_lab_prioridad CHECK (prioridad IN ('normal','urgente')),
  CONSTRAINT chk_ordenes_lab_estado CHECK (estado IN ('solicitada','en_proceso','completada','anulada')),
  CONSTRAINT chk_ordenes_lab_ayuno CHECK (ayuno IN (0,1)),
  CONSTRAINT fk_ordenes_lab_mascota  FOREIGN KEY (mascota_id)  REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_ordenes_lab_consulta FOREIGN KEY (consulta_id) REFERENCES historia_clinica.consultas(id) ON DELETE SET NULL,
  CONSTRAINT fk_ordenes_lab_vet      FOREIGN KEY (veterinario_id) REFERENCES usuarios.veterinarios(id),
  CONSTRAINT fk_ordenes_lab_sede     FOREIGN KEY (sede_id) REFERENCES configuracion.sedes(id) ON DELETE SET NULL
);
CREATE INDEX idx_ordenes_lab_mascota ON laboratorio.ordenes_laboratorio (mascota_id, fecha);
CREATE INDEX idx_ordenes_lab_estado  ON laboratorio.ordenes_laboratorio (estado, prioridad, fecha);

-- Cada línea de la orden se materializa en un examen de la historia clínica:
-- así el resultado queda donde el veterinario lo va a buscar.
CREATE TABLE laboratorio.orden_laboratorio_items (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  orden_id       INTEGER NOT NULL,
  tipo_examen_id SMALLINT NOT NULL,
  examen_id      INTEGER NULL,
  observaciones  VARCHAR(255) NULL,
  CONSTRAINT uq_orden_lab_items UNIQUE (orden_id, tipo_examen_id),
  CONSTRAINT uq_orden_lab_examen UNIQUE (examen_id),
  CONSTRAINT fk_orden_lab_items_orden FOREIGN KEY (orden_id)
    REFERENCES laboratorio.ordenes_laboratorio(id) ON DELETE CASCADE,
  CONSTRAINT fk_orden_lab_items_tipo FOREIGN KEY (tipo_examen_id)
    REFERENCES historia_clinica.tipos_examen(id),
  CONSTRAINT fk_orden_lab_items_examen FOREIGN KEY (examen_id)
    REFERENCES historia_clinica.examenes(id) ON DELETE SET NULL
);
CREATE INDEX idx_orden_lab_items ON laboratorio.orden_laboratorio_items (orden_id);

CREATE TABLE laboratorio.muestras (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  orden_id     INTEGER NOT NULL,
  codigo       VARCHAR(30) NOT NULL,
  tipo         VARCHAR(20) NOT NULL,
  tomada_por   INTEGER NULL,
  tomada_en    TIMESTAMP(0) NULL,
  recibida_en  TIMESTAMP(0) NULL,
  estado       VARCHAR(14) NOT NULL DEFAULT 'pendiente',
  motivo_rechazo VARCHAR(180) NULL,
  observaciones VARCHAR(255) NULL,
  CONSTRAINT uq_muestras_codigo UNIQUE (codigo),
  CONSTRAINT chk_muestras_tipo CHECK (tipo IN ('sangre','orina','heces','tejido','hisopado','liquido','otro')),
  CONSTRAINT chk_muestras_estado CHECK (estado IN ('pendiente','tomada','en_transito','recibida','procesando','rechazada')),
  -- Rechazar una muestra sin decir por qué deja al veterinario sin saber si
  -- hay que repetir la toma o esperar.
  CONSTRAINT chk_muestras_rechazo CHECK (estado <> 'rechazada' OR motivo_rechazo IS NOT NULL),
  CONSTRAINT fk_muestras_orden FOREIGN KEY (orden_id)
    REFERENCES laboratorio.ordenes_laboratorio(id) ON DELETE CASCADE,
  CONSTRAINT fk_muestras_usuario FOREIGN KEY (tomada_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_muestras_orden  ON laboratorio.muestras (orden_id);
CREATE INDEX idx_muestras_estado ON laboratorio.muestras (estado);

-- Qué parámetros trae cada tipo de examen (hematocrito, creatinina…).
CREATE TABLE laboratorio.parametros_laboratorio (
  id             SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  tipo_examen_id SMALLINT NOT NULL,
  codigo         VARCHAR(30) NULL,
  nombre         VARCHAR(120) NOT NULL,
  unidad         VARCHAR(30) NULL,
  orden          SMALLINT NOT NULL DEFAULT 0,
  decimales      SMALLINT NOT NULL DEFAULT 2,
  activo         SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_parametros_lab UNIQUE (tipo_examen_id, nombre),
  CONSTRAINT chk_parametros_lab_activo CHECK (activo IN (0,1)),
  CONSTRAINT fk_parametros_lab_tipo FOREIGN KEY (tipo_examen_id)
    REFERENCES historia_clinica.tipos_examen(id) ON DELETE CASCADE
);

-- Rango normal del parámetro. Cambia por especie y, en algunos casos, por
-- edad o sexo: un cachorro no tiene los mismos valores que un adulto.
CREATE TABLE laboratorio.rangos_referencia (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  parametro_id SMALLINT NOT NULL,
  especie_id   SMALLINT NULL,          -- NULL = vale para cualquier especie
  sexo         VARCHAR(12) NULL,
  edad_min_meses SMALLINT NULL,
  edad_max_meses SMALLINT NULL,
  valor_min    NUMERIC(12,4) NULL,
  valor_max    NUMERIC(12,4) NULL,
  texto        VARCHAR(60) NULL,       -- para resultados cualitativos
  CONSTRAINT chk_rangos_sexo CHECK (sexo IS NULL OR sexo IN ('macho','hembra')),
  CONSTRAINT chk_rangos_edades CHECK (
    edad_min_meses IS NULL OR edad_max_meses IS NULL OR edad_max_meses >= edad_min_meses),
  CONSTRAINT fk_rangos_parametro FOREIGN KEY (parametro_id)
    REFERENCES laboratorio.parametros_laboratorio(id) ON DELETE CASCADE,
  CONSTRAINT fk_rangos_especie FOREIGN KEY (especie_id)
    REFERENCES mascotas.especies(id) ON DELETE CASCADE
);
CREATE INDEX idx_rangos_parametro ON laboratorio.rangos_referencia (parametro_id, especie_id);

-- El resultado se sigue guardando en historia_clinica.resultados_examenes; lo
-- que se añade es de qué parámetro del catálogo viene, para poder graficar la
-- evolución de un valor a lo largo de los años.
ALTER TABLE historia_clinica.resultados_examenes
  ADD COLUMN parametro_id SMALLINT NULL,
  ADD COLUMN valor_numerico NUMERIC(12,4) NULL,
  ADD CONSTRAINT fk_resultados_parametro FOREIGN KEY (parametro_id)
    REFERENCES laboratorio.parametros_laboratorio(id) ON DELETE SET NULL;

-- Un resultado no está listo hasta que alguien lo valida. Antes de eso no se
-- le avisa al propietario: un valor mal digitado que llega al dueño por
-- correo antes de que nadie lo mire es un problema difícil de recoger.
ALTER TABLE historia_clinica.examenes
  ADD COLUMN orden_id      INTEGER NULL,
  ADD COLUMN muestra_id    INTEGER NULL,
  ADD COLUMN validado_por  INTEGER NULL,
  ADD COLUMN validado_en   TIMESTAMP(0) NULL,
  ADD COLUMN archivo_pdf   VARCHAR(255) NULL,
  ADD COLUMN avisado_en    TIMESTAMP(0) NULL,
  ADD CONSTRAINT fk_examenes_orden   FOREIGN KEY (orden_id)   REFERENCES laboratorio.ordenes_laboratorio(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_examenes_muestra FOREIGN KEY (muestra_id) REFERENCES laboratorio.muestras(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_examenes_validador FOREIGN KEY (validado_por) REFERENCES usuarios.usuarios(id) ON DELETE SET NULL;

-- 'validado' es el estado que autoriza a avisar al propietario.
ALTER TABLE historia_clinica.examenes
  DROP CONSTRAINT chk_examenes_estado,
  ADD CONSTRAINT chk_examenes_estado CHECK (estado IN (
    'solicitado','en_proceso','listo','validado','anulado'));


-- =====================================================================
--  MÓDULO 16 · IMAGENOLOGIA
-- =====================================================================

CREATE TABLE imagenes.estudios_imagen (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  numero         VARCHAR(30) NOT NULL,
  mascota_id     INTEGER NOT NULL,
  consulta_id    INTEGER NULL,
  examen_id      INTEGER NULL,
  solicitado_por INTEGER NULL,
  realizado_por  INTEGER NULL,
  equipo_id      INTEGER NULL,          -- se enlaza con el módulo de equipos
  sede_id        SMALLINT NULL,
  modalidad      VARCHAR(16) NOT NULL,
  region         VARCHAR(80) NULL,
  proyeccion     VARCHAR(60) NULL,
  fecha          TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  estado         VARCHAR(12) NOT NULL DEFAULT 'realizado',
  sedacion       SMALLINT NOT NULL DEFAULT 0,
  indicacion     TEXT NULL,
  CONSTRAINT uq_estudios_imagen_numero UNIQUE (numero),
  CONSTRAINT chk_estudios_modalidad CHECK (modalidad IN (
    'radiografia','ecografia','tomografia','endoscopia','fotografia')),
  CONSTRAINT chk_estudios_estado CHECK (estado IN ('solicitado','realizado','informado','anulado')),
  CONSTRAINT chk_estudios_sedacion CHECK (sedacion IN (0,1)),
  CONSTRAINT fk_estudios_mascota  FOREIGN KEY (mascota_id)  REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_estudios_consulta FOREIGN KEY (consulta_id) REFERENCES historia_clinica.consultas(id) ON DELETE SET NULL,
  CONSTRAINT fk_estudios_examen   FOREIGN KEY (examen_id)   REFERENCES historia_clinica.examenes(id) ON DELETE SET NULL,
  CONSTRAINT fk_estudios_solicita FOREIGN KEY (solicitado_por) REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_estudios_realiza  FOREIGN KEY (realizado_por)  REFERENCES usuarios.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_estudios_sede     FOREIGN KEY (sede_id) REFERENCES configuracion.sedes(id) ON DELETE SET NULL
);
CREATE INDEX idx_estudios_mascota   ON imagenes.estudios_imagen (mascota_id, fecha);
CREATE INDEX idx_estudios_modalidad ON imagenes.estudios_imagen (modalidad, fecha);

CREATE TABLE imagenes.archivos_estudio (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  estudio_id  INTEGER NOT NULL,
  documento_id INTEGER NULL,           -- copia en la historia clínica
  titulo      VARCHAR(150) NOT NULL,
  archivo     VARCHAR(255) NOT NULL,
  miniatura   VARCHAR(255) NULL,
  mime        VARCHAR(100) NULL,
  tamano_bytes INTEGER NULL,
  orden       SMALLINT NOT NULL DEFAULT 0,
  subido_por  INTEGER NULL,
  creado_en   TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT fk_archivos_estudio_estudio FOREIGN KEY (estudio_id)
    REFERENCES imagenes.estudios_imagen(id) ON DELETE CASCADE,
  CONSTRAINT fk_archivos_estudio_documento FOREIGN KEY (documento_id)
    REFERENCES historia_clinica.documentos_clinicos(id) ON DELETE SET NULL,
  CONSTRAINT fk_archivos_estudio_usuario FOREIGN KEY (subido_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_archivos_estudio ON imagenes.archivos_estudio (estudio_id, orden);

CREATE TABLE imagenes.informes_imagen (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  estudio_id    INTEGER NOT NULL,
  -- Estudio anterior con el que se compara. Es lo que convierte un informe en
  -- un seguimiento: "la lesión creció respecto a la placa de marzo".
  comparado_con INTEGER NULL,
  radiologo_id  INTEGER NULL,
  tecnica       TEXT NULL,
  hallazgos     TEXT NOT NULL,
  conclusion    TEXT NOT NULL,
  recomendaciones TEXT NULL,
  estado        VARCHAR(12) NOT NULL DEFAULT 'borrador',
  firmado_en    TIMESTAMP(0) NULL,
  creado_en     TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_informes_estudio UNIQUE (estudio_id),
  CONSTRAINT chk_informes_estado CHECK (estado IN ('borrador','firmado')),
  CONSTRAINT chk_informes_firma  CHECK (estado <> 'firmado' OR firmado_en IS NOT NULL),
  CONSTRAINT chk_informes_comparacion CHECK (comparado_con IS NULL OR comparado_con <> estudio_id),
  CONSTRAINT fk_informes_estudio FOREIGN KEY (estudio_id)
    REFERENCES imagenes.estudios_imagen(id) ON DELETE CASCADE,
  CONSTRAINT fk_informes_comparado FOREIGN KEY (comparado_con)
    REFERENCES imagenes.estudios_imagen(id) ON DELETE SET NULL,
  CONSTRAINT fk_informes_radiologo FOREIGN KEY (radiologo_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);


-- =====================================================================
--  MÓDULO 17 · VACUNACION INTELIGENTE
--
--  El catálogo de vacunas ya decía cada cuántos meses toca el refuerzo.
--  Lo que faltaba era el esquema completo por especie —qué dosis, a qué
--  edad y en qué orden— que es lo que permite decir si un cachorro va al
--  día o le falta la tercera del plan.
-- =====================================================================

CREATE TABLE historia_clinica.esquemas_vacunacion (
  id          SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  especie_id  SMALLINT NOT NULL,
  nombre      VARCHAR(100) NOT NULL,
  descripcion VARCHAR(255) NULL,
  activo      SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_esquemas_vacunacion UNIQUE (especie_id, nombre),
  CONSTRAINT chk_esquemas_vac_activo CHECK (activo IN (0,1)),
  CONSTRAINT fk_esquemas_vac_especie FOREIGN KEY (especie_id)
    REFERENCES mascotas.especies(id) ON DELETE CASCADE
);

CREATE TABLE historia_clinica.esquema_dosis (
  id          SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  esquema_id  SMALLINT NOT NULL,
  vacuna_id   SMALLINT NOT NULL,
  orden       SMALLINT NOT NULL,
  edad_semanas SMALLINT NULL,        -- a qué edad toca esta dosis
  intervalo_semanas SMALLINT NULL,   -- o cuánto después de la anterior
  obligatoria SMALLINT NOT NULL DEFAULT 1,
  notas       VARCHAR(200) NULL,
  CONSTRAINT uq_esquema_dosis UNIQUE (esquema_id, orden),
  CONSTRAINT chk_esquema_dosis_obligatoria CHECK (obligatoria IN (0,1)),
  CONSTRAINT chk_esquema_dosis_momento CHECK (edad_semanas IS NOT NULL OR intervalo_semanas IS NOT NULL),
  CONSTRAINT fk_esquema_dosis_esquema FOREIGN KEY (esquema_id)
    REFERENCES historia_clinica.esquemas_vacunacion(id) ON DELETE CASCADE,
  CONSTRAINT fk_esquema_dosis_vacuna FOREIGN KEY (vacuna_id)
    REFERENCES historia_clinica.vacunas(id) ON DELETE CASCADE
);

-- Datos que exige un carné de vacunación serio: dónde se aplicó, por qué vía
-- y si hubo reacción. El fabricante y el vencimiento ya viven en el lote.
ALTER TABLE historia_clinica.aplicaciones_vacunas
  ADD COLUMN sede_id SMALLINT NULL,
  ADD COLUMN via VARCHAR(20) NULL,
  ADD COLUMN sitio_aplicacion VARCHAR(60) NULL,
  ADD COLUMN reaccion VARCHAR(255) NULL,
  ADD COLUMN esquema_dosis_id SMALLINT NULL,
  ADD CONSTRAINT fk_av_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_av_esquema_dosis FOREIGN KEY (esquema_dosis_id)
    REFERENCES historia_clinica.esquema_dosis(id) ON DELETE SET NULL;


-- =====================================================================
--  MÓDULO 18 · DESPARASITACION
-- =====================================================================

CREATE TABLE historia_clinica.productos_antiparasitarios (
  id               SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre           VARCHAR(120) NOT NULL,
  principio_activo VARCHAR(120) NULL,
  tipo             VARCHAR(10) NOT NULL DEFAULT 'interna',
  presentacion     VARCHAR(80) NULL,
  via              VARCHAR(20) NULL,
  especie_id       SMALLINT NULL,
  producto_id      INTEGER NULL,          -- el del inventario, si se vende
  intervalo_meses  SMALLINT NOT NULL DEFAULT 3,
  activo           SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_antiparasitarios UNIQUE (nombre, presentacion),
  CONSTRAINT chk_antiparasitarios_tipo CHECK (tipo IN ('interna','externa','mixta')),
  CONSTRAINT chk_antiparasitarios_activo CHECK (activo IN (0,1)),
  CONSTRAINT chk_antiparasitarios_intervalo CHECK (intervalo_meses > 0),
  CONSTRAINT fk_antiparasitarios_especie FOREIGN KEY (especie_id)
    REFERENCES mascotas.especies(id) ON DELETE SET NULL,
  CONSTRAINT fk_antiparasitarios_producto FOREIGN KEY (producto_id)
    REFERENCES inventario.productos(id) ON DELETE SET NULL
);

CREATE TABLE historia_clinica.desparasitaciones (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id     INTEGER NOT NULL,
  antiparasitario_id SMALLINT NULL,
  consulta_id    INTEGER NULL,
  veterinario_id INTEGER NULL,
  tipo           VARCHAR(10) NOT NULL DEFAULT 'interna',
  producto       VARCHAR(120) NOT NULL,   -- nombre tal cual se aplicó
  dosis          VARCHAR(80) NULL,
  peso_kg        NUMERIC(6,2) NULL,       -- la dosis depende del peso
  lote           VARCHAR(60) NULL,
  fecha          DATE NOT NULL DEFAULT CURRENT_DATE,
  proxima_fecha  DATE NULL,
  observaciones  VARCHAR(255) NULL,
  CONSTRAINT chk_desparasitaciones_tipo CHECK (tipo IN ('interna','externa','mixta')),
  CONSTRAINT chk_desparasitaciones_fechas CHECK (proxima_fecha IS NULL OR proxima_fecha >= fecha),
  CONSTRAINT fk_desparasitaciones_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_desparasitaciones_producto FOREIGN KEY (antiparasitario_id)
    REFERENCES historia_clinica.productos_antiparasitarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_desparasitaciones_consulta FOREIGN KEY (consulta_id)
    REFERENCES historia_clinica.consultas(id) ON DELETE SET NULL,
  CONSTRAINT fk_desparasitaciones_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_desparasitaciones_mascota ON historia_clinica.desparasitaciones (mascota_id, fecha);
CREATE INDEX idx_desparasitaciones_proxima ON historia_clinica.desparasitaciones (proxima_fecha);


-- =====================================================================
--  MÓDULO 19 · NUTRICION
-- =====================================================================

CREATE TABLE nutricion.tipos_alimento (
  id          SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre      VARCHAR(120) NOT NULL,
  marca       VARCHAR(80) NULL,
  categoria   VARCHAR(20) NOT NULL DEFAULT 'mantenimiento',
  especie_id  SMALLINT NULL,
  kcal_por_100g NUMERIC(8,2) NULL,
  producto_id INTEGER NULL,
  indicaciones VARCHAR(255) NULL,
  activo      SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_tipos_alimento UNIQUE (nombre, marca),
  CONSTRAINT chk_tipos_alimento_categoria CHECK (categoria IN (
    'cachorro','mantenimiento','senior','medicado','light','gestacion')),
  CONSTRAINT chk_tipos_alimento_activo CHECK (activo IN (0,1)),
  CONSTRAINT fk_tipos_alimento_especie  FOREIGN KEY (especie_id)  REFERENCES mascotas.especies(id) ON DELETE SET NULL,
  CONSTRAINT fk_tipos_alimento_producto FOREIGN KEY (producto_id) REFERENCES inventario.productos(id) ON DELETE SET NULL
);

CREATE TABLE nutricion.evaluaciones_nutricionales (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id     INTEGER NOT NULL,
  consulta_id    INTEGER NULL,
  veterinario_id INTEGER NULL,
  fecha          DATE NOT NULL DEFAULT CURRENT_DATE,
  peso_kg        NUMERIC(6,2) NOT NULL,
  peso_ideal_kg  NUMERIC(6,2) NULL,
  condicion_corporal SMALLINT NULL,      -- escala 1 a 9, igual que en signos vitales
  actividad      VARCHAR(12) NOT NULL DEFAULT 'normal',
  requerimiento_kcal NUMERIC(8,2) NULL,
  diagnostico    VARCHAR(20) NULL,
  observaciones  TEXT NULL,
  CONSTRAINT chk_eval_nutri_peso CHECK (peso_kg > 0),
  CONSTRAINT chk_eval_nutri_cc   CHECK (condicion_corporal IS NULL OR condicion_corporal BETWEEN 1 AND 9),
  CONSTRAINT chk_eval_nutri_actividad CHECK (actividad IN ('baja','normal','alta','deportiva')),
  CONSTRAINT chk_eval_nutri_diagnostico CHECK (diagnostico IS NULL OR diagnostico IN (
    'desnutrido','bajo_peso','ideal','sobrepeso','obeso')),
  CONSTRAINT fk_eval_nutri_mascota  FOREIGN KEY (mascota_id)  REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_eval_nutri_consulta FOREIGN KEY (consulta_id) REFERENCES historia_clinica.consultas(id) ON DELETE SET NULL,
  CONSTRAINT fk_eval_nutri_vet      FOREIGN KEY (veterinario_id) REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_eval_nutri_mascota ON nutricion.evaluaciones_nutricionales (mascota_id, fecha);

CREATE TABLE nutricion.planes_nutricionales (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id     INTEGER NOT NULL,
  evaluacion_id  INTEGER NULL,
  veterinario_id INTEGER NULL,
  objetivo       VARCHAR(20) NOT NULL DEFAULT 'mantener',
  kcal_dia       NUMERIC(8,2) NULL,
  gramos_dia     NUMERIC(8,2) NULL,
  comidas_dia    SMALLINT NOT NULL DEFAULT 2,
  fecha_inicio   DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_fin      DATE NULL,
  peso_objetivo_kg NUMERIC(6,2) NULL,
  estado         VARCHAR(12) NOT NULL DEFAULT 'activo',
  indicaciones   TEXT NULL,
  CONSTRAINT chk_planes_nutri_objetivo CHECK (objetivo IN ('mantener','bajar_peso','subir_peso','medico')),
  CONSTRAINT chk_planes_nutri_estado CHECK (estado IN ('activo','finalizado','suspendido')),
  CONSTRAINT chk_planes_nutri_comidas CHECK (comidas_dia > 0),
  CONSTRAINT chk_planes_nutri_fechas CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio),
  CONSTRAINT fk_planes_nutri_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_planes_nutri_evaluacion FOREIGN KEY (evaluacion_id)
    REFERENCES nutricion.evaluaciones_nutricionales(id) ON DELETE SET NULL,
  CONSTRAINT fk_planes_nutri_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_planes_nutri_mascota ON nutricion.planes_nutricionales (mascota_id, estado);

CREATE TABLE nutricion.plan_comidas (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  plan_id       INTEGER NOT NULL,
  alimento_id   SMALLINT NULL,
  descripcion   VARCHAR(140) NULL,
  hora          TIME(0) NULL,
  cantidad_g    NUMERIC(8,2) NULL,
  orden         SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT fk_plan_comidas_plan FOREIGN KEY (plan_id)
    REFERENCES nutricion.planes_nutricionales(id) ON DELETE CASCADE,
  CONSTRAINT fk_plan_comidas_alimento FOREIGN KEY (alimento_id)
    REFERENCES nutricion.tipos_alimento(id) ON DELETE SET NULL
);
CREATE INDEX idx_plan_comidas ON nutricion.plan_comidas (plan_id, orden);

-- Restricciones alimentarias. Cuando nacen de una alergia ya registrada se
-- apunta a ella para que no queden dos versiones de la misma información.
CREATE TABLE nutricion.restricciones_alimentarias (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id  INTEGER NOT NULL,
  alergia_id  SMALLINT NULL,
  tipo        VARCHAR(14) NOT NULL DEFAULT 'restriccion',
  descripcion VARCHAR(200) NOT NULL,
  severidad   VARCHAR(10) NOT NULL DEFAULT 'leve',
  registrado_en DATE NOT NULL DEFAULT CURRENT_DATE,
  CONSTRAINT chk_restricciones_tipo CHECK (tipo IN ('alergia','intolerancia','restriccion','prohibicion')),
  CONSTRAINT chk_restricciones_severidad CHECK (severidad IN ('leve','moderada','grave')),
  CONSTRAINT fk_restricciones_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_restricciones_alergia FOREIGN KEY (alergia_id)
    REFERENCES mascotas.alergias(id) ON DELETE SET NULL
);
CREATE INDEX idx_restricciones_mascota ON nutricion.restricciones_alimentarias (mascota_id);


-- =====================================================================
--  MÓDULO 20 · TELEMEDICINA
--
--  El sistema no transporta vídeo: guarda la sala, el enlace del
--  proveedor de videollamada, el chat, el consentimiento y el pago, y
--  deja la consulta escrita en la historia clínica. El vídeo en sí lo
--  pone el proveedor que se configure en el módulo de integraciones.
-- =====================================================================

-- Una cita puede ser presencial, virtual o a domicilio. Las virtuales no
-- ocupan sala pero sí agenda del veterinario.
ALTER TABLE agenda.citas
  ADD COLUMN modalidad VARCHAR(12) NOT NULL DEFAULT 'presencial',
  ADD CONSTRAINT chk_citas_modalidad CHECK (modalidad IN ('presencial','virtual','domicilio'));

CREATE TABLE telemedicina.sesiones_telemedicina (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cita_id        INTEGER NULL,
  mascota_id     INTEGER NOT NULL,
  cliente_id     INTEGER NOT NULL,
  veterinario_id INTEGER NOT NULL,
  consulta_id    INTEGER NULL,
  factura_id     INTEGER NULL,
  firma_id       INTEGER NULL,          -- consentimiento de atención remota
  codigo_sala    VARCHAR(40) NOT NULL,
  enlace         VARCHAR(255) NULL,
  motivo         VARCHAR(255) NULL,
  estado         VARCHAR(12) NOT NULL DEFAULT 'programada',
  -- Se cobra antes de conectar: sin pago la sala no se abre.
  pagada         SMALLINT NOT NULL DEFAULT 0,
  inicio         TIMESTAMP(0) NULL,
  fin            TIMESTAMP(0) NULL,
  resumen        TEXT NULL,
  creado_en      TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_sesiones_tele_sala UNIQUE (codigo_sala),
  CONSTRAINT uq_sesiones_tele_cita UNIQUE (cita_id),
  CONSTRAINT chk_sesiones_tele_estado CHECK (estado IN ('programada','en_curso','finalizada','cancelada')),
  CONSTRAINT chk_sesiones_tele_pagada CHECK (pagada IN (0,1)),
  CONSTRAINT chk_sesiones_tele_rango CHECK (fin IS NULL OR inicio IS NULL OR fin >= inicio),
  CONSTRAINT fk_sesiones_tele_cita     FOREIGN KEY (cita_id)     REFERENCES agenda.citas(id) ON DELETE SET NULL,
  CONSTRAINT fk_sesiones_tele_mascota  FOREIGN KEY (mascota_id)  REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_sesiones_tele_cliente  FOREIGN KEY (cliente_id)  REFERENCES usuarios.clientes(id),
  CONSTRAINT fk_sesiones_tele_vet      FOREIGN KEY (veterinario_id) REFERENCES usuarios.veterinarios(id),
  CONSTRAINT fk_sesiones_tele_consulta FOREIGN KEY (consulta_id) REFERENCES historia_clinica.consultas(id) ON DELETE SET NULL,
  CONSTRAINT fk_sesiones_tele_factura  FOREIGN KEY (factura_id)  REFERENCES facturacion.facturas(id) ON DELETE SET NULL,
  CONSTRAINT fk_sesiones_tele_firma    FOREIGN KEY (firma_id)    REFERENCES historia_clinica.firmas_procedimientos(id) ON DELETE SET NULL
);
CREATE INDEX idx_sesiones_tele_cliente ON telemedicina.sesiones_telemedicina (cliente_id, creado_en);
CREATE INDEX idx_sesiones_tele_estado  ON telemedicina.sesiones_telemedicina (estado, creado_en);

CREATE TABLE telemedicina.mensajes_telemedicina (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sesion_id   INTEGER NOT NULL,
  autor_id    INTEGER NOT NULL,
  tipo        VARCHAR(10) NOT NULL DEFAULT 'texto',
  texto       TEXT NULL,
  archivo     VARCHAR(255) NULL,
  mime        VARCHAR(100) NULL,
  leido_en    TIMESTAMP(0) NULL,
  creado_en   TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_mensajes_tele_tipo CHECK (tipo IN ('texto','foto','video','archivo')),
  CONSTRAINT chk_mensajes_tele_contenido CHECK (texto IS NOT NULL OR archivo IS NOT NULL),
  CONSTRAINT fk_mensajes_tele_sesion FOREIGN KEY (sesion_id)
    REFERENCES telemedicina.sesiones_telemedicina(id) ON DELETE CASCADE,
  CONSTRAINT fk_mensajes_tele_autor FOREIGN KEY (autor_id)
    REFERENCES usuarios.usuarios(id) ON DELETE CASCADE
);
CREATE INDEX idx_mensajes_tele ON telemedicina.mensajes_telemedicina (sesion_id, creado_en);


-- =====================================================================
--  MÓDULO 21 · COMUNIDAD
--  Identidad digital, mascotas perdidas y adopciones.
-- =====================================================================

-- Perfil público de la mascota, el que hay detrás del QR de la placa. El
-- token es lo que va en la URL: así se puede revocar y generar otro sin
-- tocar el id de la mascota, que no debe salir a la calle.
CREATE TABLE comunidad.identidades_mascota (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id     INTEGER NOT NULL,
  token          VARCHAR(32) NOT NULL,
  activo         SMALLINT NOT NULL DEFAULT 1,
  -- Qué se enseña a quien escanea el código. Por defecto lo imprescindible
  -- para devolver la mascota, no la historia clínica completa.
  mostrar_telefono   SMALLINT NOT NULL DEFAULT 1,
  mostrar_direccion  SMALLINT NOT NULL DEFAULT 0,
  mostrar_alergias   SMALLINT NOT NULL DEFAULT 1,
  mostrar_vacunas    SMALLINT NOT NULL DEFAULT 1,
  mensaje        VARCHAR(255) NULL,
  visitas        INTEGER NOT NULL DEFAULT 0,
  ultima_visita  TIMESTAMP(0) NULL,
  creado_en      TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_identidades_mascota UNIQUE (mascota_id),
  CONSTRAINT uq_identidades_token   UNIQUE (token),
  CONSTRAINT chk_identidades_activo    CHECK (activo IN (0,1)),
  CONSTRAINT chk_identidades_telefono  CHECK (mostrar_telefono IN (0,1)),
  CONSTRAINT chk_identidades_direccion CHECK (mostrar_direccion IN (0,1)),
  CONSTRAINT chk_identidades_alergias  CHECK (mostrar_alergias IN (0,1)),
  CONSTRAINT chk_identidades_vacunas   CHECK (mostrar_vacunas IN (0,1)),
  CONSTRAINT fk_identidades_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE
);

CREATE TABLE comunidad.reportes_perdida (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id   INTEGER NOT NULL,
  cliente_id   INTEGER NOT NULL,
  estado       VARCHAR(12) NOT NULL DEFAULT 'perdida',
  fecha_perdida TIMESTAMP(0) NOT NULL,
  ultima_direccion VARCHAR(180) NULL,
  ciudad       VARCHAR(80) NULL,
  latitud      NUMERIC(10,7) NULL,
  longitud     NUMERIC(10,7) NULL,
  descripcion  TEXT NULL,
  senas        VARCHAR(255) NULL,
  telefono_contacto VARCHAR(30) NOT NULL,
  recompensa   NUMERIC(12,2) NULL,
  foto         VARCHAR(255) NULL,
  publicado    SMALLINT NOT NULL DEFAULT 1,
  encontrada_en TIMESTAMP(0) NULL,
  creado_en    TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  actualizado_en TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_reportes_perdida_estado CHECK (estado IN ('perdida','encontrada','cerrada')),
  CONSTRAINT chk_reportes_perdida_publicado CHECK (publicado IN (0,1)),
  CONSTRAINT fk_reportes_perdida_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_reportes_perdida_cliente FOREIGN KEY (cliente_id)
    REFERENCES usuarios.clientes(id) ON DELETE CASCADE
);
CREATE INDEX idx_reportes_perdida_estado ON comunidad.reportes_perdida (estado, creado_en);

CREATE TRIGGER trg_reportes_perdida_actualizado BEFORE UPDATE ON comunidad.reportes_perdida
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_actualizado_en();

-- Quien avista una mascota perdida normalmente no tiene cuenta, así que el
-- aviso se acepta con nombre y teléfono sueltos.
CREATE TABLE comunidad.avistamientos (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  reporte_id  INTEGER NOT NULL,
  nombre      VARCHAR(120) NULL,
  telefono    VARCHAR(30) NULL,
  direccion   VARCHAR(180) NULL,
  latitud     NUMERIC(10,7) NULL,
  longitud    NUMERIC(10,7) NULL,
  descripcion TEXT NULL,
  foto        VARCHAR(255) NULL,
  fecha       TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  estado      VARCHAR(12) NOT NULL DEFAULT 'nuevo',
  ip          VARCHAR(45) NULL,
  CONSTRAINT chk_avistamientos_estado CHECK (estado IN ('nuevo','revisado','confirmado','descartado')),
  CONSTRAINT fk_avistamientos_reporte FOREIGN KEY (reporte_id)
    REFERENCES comunidad.reportes_perdida(id) ON DELETE CASCADE
);
CREATE INDEX idx_avistamientos_reporte ON comunidad.avistamientos (reporte_id, fecha);

-- Mascota en adopción. mascota_id es opcional a propósito: los animales que
-- llegan a la clínica para darlos en adopción no tienen dueño y por tanto no
-- pueden existir en mascotas.mascotas, que cuelga de un cliente.
CREATE TABLE comunidad.publicaciones_adopcion (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id   INTEGER NULL,
  sede_id      SMALLINT NULL,
  nombre       VARCHAR(80) NOT NULL,
  especie_id   SMALLINT NOT NULL,
  raza_id      SMALLINT NULL,
  sexo         VARCHAR(12) NOT NULL DEFAULT 'desconocido',
  edad_meses   SMALLINT NULL,
  porte        VARCHAR(12) NOT NULL DEFAULT 'mediano',
  color        VARCHAR(60) NULL,
  descripcion  TEXT NULL,
  historia     TEXT NULL,
  foto         VARCHAR(255) NULL,
  esterilizado SMALLINT NOT NULL DEFAULT 0,
  vacunas_al_dia SMALLINT NOT NULL DEFAULT 0,
  desparasitado  SMALLINT NOT NULL DEFAULT 0,
  compatible_ninos SMALLINT NULL,
  compatible_mascotas SMALLINT NULL,
  estado       VARCHAR(12) NOT NULL DEFAULT 'disponible',
  publicado_en TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  adoptado_en  TIMESTAMP(0) NULL,
  CONSTRAINT chk_pub_adopcion_sexo   CHECK (sexo IN ('macho','hembra','desconocido')),
  CONSTRAINT chk_pub_adopcion_porte  CHECK (porte IN ('pequeno','mediano','grande','gigante')),
  CONSTRAINT chk_pub_adopcion_estado CHECK (estado IN ('disponible','reservado','adoptado','retirado')),
  CONSTRAINT chk_pub_adopcion_ester  CHECK (esterilizado IN (0,1)),
  CONSTRAINT chk_pub_adopcion_vac    CHECK (vacunas_al_dia IN (0,1)),
  CONSTRAINT chk_pub_adopcion_desp   CHECK (desparasitado IN (0,1)),
  CONSTRAINT fk_pub_adopcion_mascota FOREIGN KEY (mascota_id) REFERENCES mascotas.mascotas(id) ON DELETE SET NULL,
  CONSTRAINT fk_pub_adopcion_sede    FOREIGN KEY (sede_id)    REFERENCES configuracion.sedes(id) ON DELETE SET NULL,
  CONSTRAINT fk_pub_adopcion_especie FOREIGN KEY (especie_id) REFERENCES mascotas.especies(id),
  CONSTRAINT fk_pub_adopcion_raza    FOREIGN KEY (raza_id)    REFERENCES mascotas.razas(id) ON DELETE SET NULL
);
CREATE INDEX idx_pub_adopcion_estado ON comunidad.publicaciones_adopcion (estado, publicado_en);

CREATE TABLE comunidad.solicitudes_adopcion (
  id              INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  publicacion_id  INTEGER NOT NULL,
  usuario_id      INTEGER NULL,           -- si la hizo alguien con cuenta
  nombre          VARCHAR(120) NOT NULL,
  documento       VARCHAR(30) NULL,
  email           VARCHAR(160) NOT NULL,
  telefono        VARCHAR(30) NOT NULL,
  direccion       VARCHAR(180) NULL,
  ciudad          VARCHAR(80) NULL,
  tipo_vivienda   VARCHAR(20) NULL,
  tiene_patio     SMALLINT NULL,
  otras_mascotas  VARCHAR(200) NULL,
  personas_hogar  SMALLINT NULL,
  motivo          TEXT NULL,
  estado          VARCHAR(14) NOT NULL DEFAULT 'recibida',
  puntaje         SMALLINT NULL,          -- resultado de la evaluación
  motivo_rechazo  VARCHAR(255) NULL,
  evaluado_por    INTEGER NULL,
  creado_en       TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  actualizado_en  TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_sol_adopcion_estado CHECK (estado IN (
    'recibida','en_evaluacion','entrevista','aprobada','rechazada','completada')),
  CONSTRAINT chk_sol_adopcion_vivienda CHECK (tipo_vivienda IS NULL OR tipo_vivienda IN ('casa','apartamento','finca','otro')),
  CONSTRAINT chk_sol_adopcion_patio CHECK (tiene_patio IS NULL OR tiene_patio IN (0,1)),
  CONSTRAINT chk_sol_adopcion_rechazo CHECK (estado <> 'rechazada' OR motivo_rechazo IS NOT NULL),
  CONSTRAINT fk_sol_adopcion_publicacion FOREIGN KEY (publicacion_id)
    REFERENCES comunidad.publicaciones_adopcion(id) ON DELETE CASCADE,
  CONSTRAINT fk_sol_adopcion_usuario  FOREIGN KEY (usuario_id)   REFERENCES usuarios.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_sol_adopcion_evaluador FOREIGN KEY (evaluado_por) REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_sol_adopcion_publicacion ON comunidad.solicitudes_adopcion (publicacion_id, estado);

CREATE TRIGGER trg_sol_adopcion_actualizado BEFORE UPDATE ON comunidad.solicitudes_adopcion
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_actualizado_en();

CREATE TABLE comunidad.entrevistas_adopcion (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  solicitud_id INTEGER NOT NULL,
  entrevistador_id INTEGER NULL,
  fecha        TIMESTAMP(0) NOT NULL,
  modalidad    VARCHAR(12) NOT NULL DEFAULT 'presencial',
  resultado    VARCHAR(14) NULL,
  notas        TEXT NULL,
  CONSTRAINT chk_entrevistas_modalidad CHECK (modalidad IN ('presencial','virtual','telefonica')),
  CONSTRAINT chk_entrevistas_resultado CHECK (resultado IS NULL OR resultado IN ('favorable','desfavorable','pendiente')),
  CONSTRAINT fk_entrevistas_solicitud FOREIGN KEY (solicitud_id)
    REFERENCES comunidad.solicitudes_adopcion(id) ON DELETE CASCADE,
  CONSTRAINT fk_entrevistas_usuario FOREIGN KEY (entrevistador_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_entrevistas_solicitud ON comunidad.entrevistas_adopcion (solicitud_id, fecha);

CREATE TABLE comunidad.contratos_adopcion (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  solicitud_id INTEGER NOT NULL,
  numero       VARCHAR(30) NOT NULL,
  firma_id     INTEGER NULL,
  archivo      VARCHAR(255) NULL,
  fecha        DATE NOT NULL DEFAULT CURRENT_DATE,
  compromisos  TEXT NULL,
  CONSTRAINT uq_contratos_adopcion_numero UNIQUE (numero),
  CONSTRAINT uq_contratos_adopcion_solicitud UNIQUE (solicitud_id),
  CONSTRAINT fk_contratos_adopcion_solicitud FOREIGN KEY (solicitud_id)
    REFERENCES comunidad.solicitudes_adopcion(id) ON DELETE CASCADE,
  CONSTRAINT fk_contratos_adopcion_firma FOREIGN KEY (firma_id)
    REFERENCES historia_clinica.firmas_procedimientos(id) ON DELETE SET NULL
);

-- Seguimiento posterior: la adopción no termina cuando se entrega el animal.
CREATE TABLE comunidad.seguimientos_adopcion (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  solicitud_id INTEGER NOT NULL,
  realizado_por INTEGER NULL,
  fecha_programada DATE NOT NULL,
  fecha_realizado  DATE NULL,
  medio        VARCHAR(12) NOT NULL DEFAULT 'llamada',
  estado_mascota VARCHAR(14) NULL,
  notas        TEXT NULL,
  estado       VARCHAR(12) NOT NULL DEFAULT 'pendiente',
  CONSTRAINT chk_seg_adopcion_medio CHECK (medio IN ('llamada','visita','virtual','mensaje')),
  CONSTRAINT chk_seg_adopcion_estado CHECK (estado IN ('pendiente','realizado','sin_respuesta','cancelado')),
  CONSTRAINT chk_seg_adopcion_mascota CHECK (estado_mascota IS NULL OR estado_mascota IN (
    'excelente','bueno','regular','preocupante','devuelta')),
  CONSTRAINT fk_seg_adopcion_solicitud FOREIGN KEY (solicitud_id)
    REFERENCES comunidad.solicitudes_adopcion(id) ON DELETE CASCADE,
  CONSTRAINT fk_seg_adopcion_usuario FOREIGN KEY (realizado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_seg_adopcion ON comunidad.seguimientos_adopcion (solicitud_id, fecha_programada);

-- Testimonio que deja un cliente desde la página pública: es un comentario
-- abierto, sin cuenta y sin que nadie lo apruebe antes, así que sale publicado
-- en cuanto pasa el filtro de palabras del servidor
-- (backend/src/utils/moderacion.js).
--
-- `publicado` es la forma de bajar uno de la página sin borrarlo, para cuando
-- el filtro deja pasar algo que no debía: UPDATE comunidad.testimonios SET
-- publicado = 0 WHERE id = ?. usuario_id queda en NULL si lo escribió alguien
-- sin cuenta, que es el caso normal.
CREATE TABLE comunidad.testimonios (
  id         INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  usuario_id INTEGER NULL,
  nombre     VARCHAR(80) NOT NULL,
  mensaje    VARCHAR(600) NOT NULL,
  publicado  SMALLINT NOT NULL DEFAULT 1,
  ip         VARCHAR(45) NULL,
  creado_en  TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_testimonios_publicado CHECK (publicado IN (0,1)),
  CONSTRAINT fk_testimonios_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_testimonios_publicados ON comunidad.testimonios (publicado, creado_en DESC);


-- =====================================================================
--  MÓDULO 22 · TIENDA EN LINEA Y DOMICILIOS
--
--  El artículo de la tienda no repite el stock ni el precio: apunta al
--  producto del inventario y añade lo propio de la venta en línea (foto,
--  descripción larga, si está destacado). Así vender por la web descuenta
--  del mismo inventario que vender en el mostrador.
-- =====================================================================

CREATE TABLE tienda.categorias_tienda (
  id     SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre VARCHAR(60) NOT NULL,
  slug   VARCHAR(80) NOT NULL,
  icono  VARCHAR(40) NULL,
  orden  SMALLINT NOT NULL DEFAULT 0,
  activo SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_categorias_tienda_slug UNIQUE (slug),
  CONSTRAINT chk_categorias_tienda_activo CHECK (activo IN (0,1))
);

CREATE TABLE tienda.articulos_tienda (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  producto_id   INTEGER NOT NULL,
  categoria_id  SMALLINT NOT NULL,
  nombre        VARCHAR(140) NOT NULL,
  slug          VARCHAR(160) NOT NULL,
  descripcion   TEXT NULL,
  imagen        VARCHAR(255) NULL,
  precio        NUMERIC(12,2) NULL,        -- NULL = usa el del inventario
  precio_antes  NUMERIC(12,2) NULL,
  -- Un medicamento solo se despacha si el cliente adjunta la fórmula. Sin
  -- esto la tienda sería un mostrador de venta libre de antibióticos.
  requiere_receta SMALLINT NOT NULL DEFAULT 0,
  destacado     SMALLINT NOT NULL DEFAULT 0,
  activo        SMALLINT NOT NULL DEFAULT 1,
  creado_en     TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_articulos_tienda_slug UNIQUE (slug),
  CONSTRAINT uq_articulos_tienda_producto UNIQUE (producto_id),
  CONSTRAINT chk_articulos_receta    CHECK (requiere_receta IN (0,1)),
  CONSTRAINT chk_articulos_destacado CHECK (destacado IN (0,1)),
  CONSTRAINT chk_articulos_activo    CHECK (activo IN (0,1)),
  CONSTRAINT fk_articulos_producto  FOREIGN KEY (producto_id)  REFERENCES inventario.productos(id) ON DELETE CASCADE,
  CONSTRAINT fk_articulos_categoria FOREIGN KEY (categoria_id) REFERENCES tienda.categorias_tienda(id)
);
CREATE INDEX idx_articulos_tienda ON tienda.articulos_tienda (categoria_id, activo);

CREATE TABLE tienda.cupones (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  codigo        VARCHAR(30) NOT NULL,
  descripcion   VARCHAR(180) NULL,
  tipo          VARCHAR(12) NOT NULL DEFAULT 'porcentaje',
  valor         NUMERIC(12,2) NOT NULL,
  minimo_compra NUMERIC(12,2) NOT NULL DEFAULT 0,
  usos_maximos  INTEGER NULL,
  usos          INTEGER NOT NULL DEFAULT 0,
  desde         DATE NULL,
  hasta         DATE NULL,
  activo        SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_cupones_codigo UNIQUE (codigo),
  CONSTRAINT chk_cupones_tipo   CHECK (tipo IN ('porcentaje','valor','envio_gratis')),
  CONSTRAINT chk_cupones_valor  CHECK (valor >= 0),
  CONSTRAINT chk_cupones_activo CHECK (activo IN (0,1)),
  CONSTRAINT chk_cupones_fechas CHECK (hasta IS NULL OR desde IS NULL OR hasta >= desde)
);

CREATE TABLE tienda.carritos (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cliente_id  INTEGER NOT NULL,
  cupon_id    INTEGER NULL,
  estado      VARCHAR(12) NOT NULL DEFAULT 'abierto',
  creado_en   TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  actualizado_en TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_carritos_estado CHECK (estado IN ('abierto','convertido','abandonado')),
  CONSTRAINT fk_carritos_cliente FOREIGN KEY (cliente_id) REFERENCES usuarios.clientes(id) ON DELETE CASCADE,
  CONSTRAINT fk_carritos_cupon   FOREIGN KEY (cupon_id)   REFERENCES tienda.cupones(id) ON DELETE SET NULL
);
-- Un carrito abierto por cliente: al entrar se recupera el que dejó a medias.
CREATE UNIQUE INDEX uq_carrito_abierto ON tienda.carritos (cliente_id) WHERE estado = 'abierto';

CREATE TRIGGER trg_carritos_actualizado BEFORE UPDATE ON tienda.carritos
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_actualizado_en();

CREATE TABLE tienda.carrito_items (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  carrito_id  INTEGER NOT NULL,
  articulo_id INTEGER NOT NULL,
  cantidad    INTEGER NOT NULL DEFAULT 1,
  precio_unit NUMERIC(12,2) NOT NULL,
  CONSTRAINT uq_carrito_items UNIQUE (carrito_id, articulo_id),
  CONSTRAINT chk_carrito_items_cantidad CHECK (cantidad > 0),
  CONSTRAINT fk_carrito_items_carrito  FOREIGN KEY (carrito_id)  REFERENCES tienda.carritos(id) ON DELETE CASCADE,
  CONSTRAINT fk_carrito_items_articulo FOREIGN KEY (articulo_id) REFERENCES tienda.articulos_tienda(id) ON DELETE CASCADE
);

CREATE TABLE tienda.pedidos (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  numero       VARCHAR(30) NOT NULL,
  -- Opcional: en la tienda de la página pública se compra sin cuenta. Cuando
  -- va vacío, el responsable del pedido son los datos del invitado de abajo.
  cliente_id   INTEGER NULL,
  sede_id      SMALLINT NULL,
  cupon_id     INTEGER NULL,
  factura_id   INTEGER NULL,
  entrega      VARCHAR(12) NOT NULL DEFAULT 'domicilio',
  subtotal     NUMERIC(12,2) NOT NULL DEFAULT 0,
  descuento    NUMERIC(12,2) NOT NULL DEFAULT 0,
  impuestos    NUMERIC(12,2) NOT NULL DEFAULT 0,
  envio        NUMERIC(12,2) NOT NULL DEFAULT 0,
  total        NUMERIC(12,2) NOT NULL DEFAULT 0,
  estado       VARCHAR(14) NOT NULL DEFAULT 'pendiente',
  estado_pago  VARCHAR(12) NOT NULL DEFAULT 'pendiente',
  -- Cómo se va a pagar. Sin esto, quien sale a entregar el domicilio no sabe
  -- si tiene que llevar cambio o si el dinero ya entró por la pasarela.
  metodo_pago  VARCHAR(14) NOT NULL DEFAULT 'efectivo',
  -- Quién compró, cuando lo hizo sin cuenta.
  invitado_nombre   VARCHAR(120) NULL,
  invitado_email    VARCHAR(160) NULL,
  invitado_telefono VARCHAR(30)  NULL,
  receta_url   VARCHAR(255) NULL,      -- fórmula adjunta, si el pedido la exige
  notas        VARCHAR(255) NULL,
  creado_en    TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  actualizado_en TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_pedidos_numero UNIQUE (numero),
  CONSTRAINT chk_pedidos_entrega CHECK (entrega IN ('domicilio','recoger')),
  CONSTRAINT chk_pedidos_estado  CHECK (estado IN (
    'pendiente','confirmado','preparando','enviado','entregado','cancelado')),
  CONSTRAINT chk_pedidos_pago    CHECK (estado_pago IN ('pendiente','pagado','fallido','reembolsado')),
  CONSTRAINT chk_pedidos_metodo_pago CHECK (metodo_pago IN ('efectivo','transferencia','tarjeta','en_linea')),
  -- Un pedido sin cuenta y sin datos de contacto no lo puede atender nadie.
  CONSTRAINT chk_pedidos_responsable CHECK (
    cliente_id IS NOT NULL OR (invitado_nombre IS NOT NULL AND invitado_telefono IS NOT NULL)),
  CONSTRAINT fk_pedidos_cliente FOREIGN KEY (cliente_id) REFERENCES usuarios.clientes(id),
  CONSTRAINT fk_pedidos_sede    FOREIGN KEY (sede_id)    REFERENCES configuracion.sedes(id) ON DELETE SET NULL,
  CONSTRAINT fk_pedidos_cupon   FOREIGN KEY (cupon_id)   REFERENCES tienda.cupones(id) ON DELETE SET NULL,
  CONSTRAINT fk_pedidos_factura FOREIGN KEY (factura_id) REFERENCES facturacion.facturas(id) ON DELETE SET NULL
);
CREATE INDEX idx_pedidos_cliente ON tienda.pedidos (cliente_id, creado_en);
CREATE INDEX idx_pedidos_estado  ON tienda.pedidos (estado, creado_en);

CREATE TRIGGER trg_pedidos_actualizado BEFORE UPDATE ON tienda.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_actualizado_en();

CREATE TABLE tienda.pedido_items (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  pedido_id   INTEGER NOT NULL,
  articulo_id INTEGER NULL,
  producto_id INTEGER NULL,
  descripcion VARCHAR(180) NOT NULL,
  cantidad    INTEGER NOT NULL,
  precio_unit NUMERIC(12,2) NOT NULL,
  total_linea NUMERIC(12,2) NOT NULL,
  CONSTRAINT chk_pedido_items_cantidad CHECK (cantidad > 0),
  CONSTRAINT fk_pedido_items_pedido   FOREIGN KEY (pedido_id)   REFERENCES tienda.pedidos(id) ON DELETE CASCADE,
  CONSTRAINT fk_pedido_items_articulo FOREIGN KEY (articulo_id) REFERENCES tienda.articulos_tienda(id) ON DELETE SET NULL,
  CONSTRAINT fk_pedido_items_producto FOREIGN KEY (producto_id) REFERENCES inventario.productos(id) ON DELETE SET NULL
);
CREATE INDEX idx_pedido_items ON tienda.pedido_items (pedido_id);

CREATE TABLE tienda.pedido_historial (
  id         INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  pedido_id  INTEGER NOT NULL,
  estado     VARCHAR(14) NOT NULL,
  usuario_id INTEGER NULL,
  nota       VARCHAR(255) NULL,
  creado_en  TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT fk_pedido_historial_pedido FOREIGN KEY (pedido_id)
    REFERENCES tienda.pedidos(id) ON DELETE CASCADE,
  CONSTRAINT fk_pedido_historial_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_pedido_historial ON tienda.pedido_historial (pedido_id, creado_en);

CREATE TABLE tienda.repartidores (
  id         INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  usuario_id INTEGER NULL,
  nombre     VARCHAR(120) NOT NULL,
  documento  VARCHAR(30) NULL,
  telefono   VARCHAR(30) NOT NULL,
  vehiculo   VARCHAR(20) NOT NULL DEFAULT 'moto',
  placa      VARCHAR(15) NULL,
  sede_id    SMALLINT NULL,
  activo     SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_repartidores_usuario UNIQUE (usuario_id),
  CONSTRAINT chk_repartidores_vehiculo CHECK (vehiculo IN ('moto','bicicleta','carro','a_pie')),
  CONSTRAINT chk_repartidores_activo CHECK (activo IN (0,1)),
  CONSTRAINT fk_repartidores_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_repartidores_sede    FOREIGN KEY (sede_id)    REFERENCES configuracion.sedes(id) ON DELETE SET NULL
);

CREATE TABLE tienda.domicilios (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  pedido_id     INTEGER NOT NULL,
  repartidor_id INTEGER NULL,
  direccion     VARCHAR(180) NOT NULL,
  barrio        VARCHAR(80) NULL,
  ciudad        VARCHAR(80) NULL,
  latitud       NUMERIC(10,7) NULL,
  longitud      NUMERIC(10,7) NULL,
  indicaciones  VARCHAR(255) NULL,
  telefono      VARCHAR(30) NULL,
  estado        VARCHAR(14) NOT NULL DEFAULT 'asignado',
  hora_estimada TIMESTAMP(0) NULL,
  salida_en     TIMESTAMP(0) NULL,
  entregado_en  TIMESTAMP(0) NULL,
  recibido_por  VARCHAR(120) NULL,
  evidencia     VARCHAR(255) NULL,     -- foto de la entrega
  creado_en     TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_domicilios_pedido UNIQUE (pedido_id),
  CONSTRAINT chk_domicilios_estado CHECK (estado IN (
    'asignado','recogido','en_ruta','entregado','fallido','devuelto')),
  CONSTRAINT fk_domicilios_pedido FOREIGN KEY (pedido_id)
    REFERENCES tienda.pedidos(id) ON DELETE CASCADE,
  CONSTRAINT fk_domicilios_repartidor FOREIGN KEY (repartidor_id)
    REFERENCES tienda.repartidores(id) ON DELETE SET NULL
);
CREATE INDEX idx_domicilios_estado ON tienda.domicilios (estado, creado_en);

-- Puntos de la ruta. Con esto el cliente ve el avance sin llamar a preguntar.
CREATE TABLE tienda.seguimiento_domicilio (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  domicilio_id INTEGER NOT NULL,
  estado       VARCHAR(14) NOT NULL,
  latitud      NUMERIC(10,7) NULL,
  longitud     NUMERIC(10,7) NULL,
  nota         VARCHAR(180) NULL,
  fecha        TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT fk_seguimiento_domicilio FOREIGN KEY (domicilio_id)
    REFERENCES tienda.domicilios(id) ON DELETE CASCADE
);
CREATE INDEX idx_seguimiento_domicilio ON tienda.seguimiento_domicilio (domicilio_id, fecha);


-- =====================================================================
--  MÓDULO 23 · PLANES DE SALUD Y FIDELIZACION
-- =====================================================================

CREATE TABLE fidelizacion.planes_salud (
  id             SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre         VARCHAR(80) NOT NULL,
  slug           VARCHAR(100) NOT NULL,
  descripcion    TEXT NULL,
  precio_mensual NUMERIC(12,2) NOT NULL DEFAULT 0,
  precio_anual   NUMERIC(12,2) NULL,
  descuento_general_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  color          VARCHAR(20) NULL,
  orden          SMALLINT NOT NULL DEFAULT 0,
  activo         SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_planes_salud_slug UNIQUE (slug),
  CONSTRAINT chk_planes_salud_activo CHECK (activo IN (0,1)),
  CONSTRAINT chk_planes_salud_descuento CHECK (descuento_general_pct BETWEEN 0 AND 100)
);

CREATE TABLE fidelizacion.plan_beneficios (
  id           SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  plan_id      SMALLINT NOT NULL,
  tipo         VARCHAR(14) NOT NULL,
  servicio_id  SMALLINT NULL,
  vacuna_id    SMALLINT NULL,
  descripcion  VARCHAR(180) NOT NULL,
  cantidad_incluida SMALLINT NULL,      -- NULL = ilimitado
  descuento_pct NUMERIC(5,2) NULL,
  periodo      VARCHAR(10) NOT NULL DEFAULT 'anual',
  CONSTRAINT chk_plan_beneficios_tipo CHECK (tipo IN ('consulta','vacuna','servicio','examen','descuento','otro')),
  CONSTRAINT chk_plan_beneficios_periodo CHECK (periodo IN ('mensual','trimestral','anual')),
  CONSTRAINT fk_plan_beneficios_plan     FOREIGN KEY (plan_id)     REFERENCES fidelizacion.planes_salud(id) ON DELETE CASCADE,
  CONSTRAINT fk_plan_beneficios_servicio FOREIGN KEY (servicio_id) REFERENCES agenda.servicios(id) ON DELETE SET NULL,
  CONSTRAINT fk_plan_beneficios_vacuna   FOREIGN KEY (vacuna_id)   REFERENCES historia_clinica.vacunas(id) ON DELETE SET NULL
);
CREATE INDEX idx_plan_beneficios ON fidelizacion.plan_beneficios (plan_id);

CREATE TABLE fidelizacion.suscripciones_plan (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cliente_id   INTEGER NOT NULL,
  plan_id      SMALLINT NOT NULL,
  mascota_id   INTEGER NULL,            -- NULL = cubre a todas sus mascotas
  periodicidad VARCHAR(10) NOT NULL DEFAULT 'mensual',
  precio       NUMERIC(12,2) NOT NULL,
  inicio       DATE NOT NULL DEFAULT CURRENT_DATE,
  fin          DATE NOT NULL,
  renovacion_automatica SMALLINT NOT NULL DEFAULT 1,
  estado       VARCHAR(12) NOT NULL DEFAULT 'activa',
  creado_en    TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_suscripciones_periodicidad CHECK (periodicidad IN ('mensual','anual')),
  CONSTRAINT chk_suscripciones_estado CHECK (estado IN ('activa','vencida','cancelada','suspendida')),
  CONSTRAINT chk_suscripciones_renovacion CHECK (renovacion_automatica IN (0,1)),
  CONSTRAINT chk_suscripciones_fechas CHECK (fin > inicio),
  CONSTRAINT fk_suscripciones_cliente FOREIGN KEY (cliente_id) REFERENCES usuarios.clientes(id) ON DELETE CASCADE,
  CONSTRAINT fk_suscripciones_plan    FOREIGN KEY (plan_id)    REFERENCES fidelizacion.planes_salud(id),
  CONSTRAINT fk_suscripciones_mascota FOREIGN KEY (mascota_id) REFERENCES mascotas.mascotas(id) ON DELETE CASCADE
);
CREATE INDEX idx_suscripciones_cliente ON fidelizacion.suscripciones_plan (cliente_id, estado);
CREATE INDEX idx_suscripciones_vencen  ON fidelizacion.suscripciones_plan (fin) WHERE estado = 'activa';

-- Cada vez que se usa un beneficio queda anotado. Es lo que permite decir
-- "te quedan 2 consultas incluidas de las 4 del plan".
CREATE TABLE fidelizacion.consumo_beneficios (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  suscripcion_id INTEGER NOT NULL,
  beneficio_id   SMALLINT NOT NULL,
  cita_id        INTEGER NULL,
  factura_id     INTEGER NULL,
  cantidad       SMALLINT NOT NULL DEFAULT 1,
  valor_ahorrado NUMERIC(12,2) NOT NULL DEFAULT 0,
  fecha          TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_consumo_cantidad CHECK (cantidad > 0),
  CONSTRAINT fk_consumo_suscripcion FOREIGN KEY (suscripcion_id)
    REFERENCES fidelizacion.suscripciones_plan(id) ON DELETE CASCADE,
  CONSTRAINT fk_consumo_beneficio FOREIGN KEY (beneficio_id)
    REFERENCES fidelizacion.plan_beneficios(id) ON DELETE CASCADE,
  CONSTRAINT fk_consumo_cita    FOREIGN KEY (cita_id)    REFERENCES agenda.citas(id) ON DELETE SET NULL,
  CONSTRAINT fk_consumo_factura FOREIGN KEY (factura_id) REFERENCES facturacion.facturas(id) ON DELETE SET NULL
);
CREATE INDEX idx_consumo_suscripcion ON fidelizacion.consumo_beneficios (suscripcion_id, fecha);

CREATE TABLE fidelizacion.niveles_cliente (
  id            SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre        VARCHAR(40) NOT NULL,
  puntos_minimos INTEGER NOT NULL DEFAULT 0,
  descuento_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  beneficios    VARCHAR(255) NULL,
  color         VARCHAR(20) NULL,
  orden         SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT uq_niveles_nombre UNIQUE (nombre),
  CONSTRAINT uq_niveles_puntos UNIQUE (puntos_minimos),
  CONSTRAINT chk_niveles_descuento CHECK (descuento_pct BETWEEN 0 AND 100)
);

CREATE TABLE fidelizacion.cuentas_puntos (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cliente_id  INTEGER NOT NULL,
  nivel_id    SMALLINT NULL,
  puntos      INTEGER NOT NULL DEFAULT 0,
  puntos_historicos INTEGER NOT NULL DEFAULT 0,
  desde       DATE NOT NULL DEFAULT CURRENT_DATE,
  actualizado_en TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_cuentas_puntos_cliente UNIQUE (cliente_id),
  CONSTRAINT chk_cuentas_puntos CHECK (puntos >= 0),
  CONSTRAINT fk_cuentas_puntos_cliente FOREIGN KEY (cliente_id) REFERENCES usuarios.clientes(id) ON DELETE CASCADE,
  CONSTRAINT fk_cuentas_puntos_nivel   FOREIGN KEY (nivel_id)   REFERENCES fidelizacion.niveles_cliente(id) ON DELETE SET NULL
);

CREATE TRIGGER trg_cuentas_puntos_actualizado BEFORE UPDATE ON fidelizacion.cuentas_puntos
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_actualizado_en();

CREATE TABLE fidelizacion.movimientos_puntos (
  id         INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cuenta_id  INTEGER NOT NULL,
  tipo       VARCHAR(12) NOT NULL,
  puntos     INTEGER NOT NULL,          -- positivo suma, negativo resta
  motivo     VARCHAR(180) NOT NULL,
  factura_id INTEGER NULL,
  pedido_id  INTEGER NULL,
  usuario_id INTEGER NULL,
  vence_en   DATE NULL,
  fecha      TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_mov_puntos_tipo CHECK (tipo IN ('ganancia','canje','ajuste','vencimiento')),
  CONSTRAINT chk_mov_puntos_valor CHECK (puntos <> 0),
  CONSTRAINT fk_mov_puntos_cuenta  FOREIGN KEY (cuenta_id)  REFERENCES fidelizacion.cuentas_puntos(id) ON DELETE CASCADE,
  CONSTRAINT fk_mov_puntos_factura FOREIGN KEY (factura_id) REFERENCES facturacion.facturas(id) ON DELETE SET NULL,
  CONSTRAINT fk_mov_puntos_pedido  FOREIGN KEY (pedido_id)  REFERENCES tienda.pedidos(id) ON DELETE SET NULL,
  CONSTRAINT fk_mov_puntos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_mov_puntos_cuenta ON fidelizacion.movimientos_puntos (cuenta_id, fecha);

CREATE TABLE fidelizacion.recompensas (
  id          SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre      VARCHAR(120) NOT NULL,
  descripcion VARCHAR(255) NULL,
  puntos      INTEGER NOT NULL,
  tipo        VARCHAR(12) NOT NULL DEFAULT 'producto',
  servicio_id SMALLINT NULL,
  producto_id INTEGER NULL,
  valor       NUMERIC(12,2) NULL,
  existencias SMALLINT NULL,            -- NULL = sin límite
  activo      SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT chk_recompensas_tipo   CHECK (tipo IN ('producto','servicio','descuento','otro')),
  CONSTRAINT chk_recompensas_puntos CHECK (puntos > 0),
  CONSTRAINT chk_recompensas_activo CHECK (activo IN (0,1)),
  CONSTRAINT fk_recompensas_servicio FOREIGN KEY (servicio_id) REFERENCES agenda.servicios(id) ON DELETE SET NULL,
  CONSTRAINT fk_recompensas_producto FOREIGN KEY (producto_id) REFERENCES inventario.productos(id) ON DELETE SET NULL
);

CREATE TABLE fidelizacion.canjes (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cuenta_id     INTEGER NOT NULL,
  recompensa_id SMALLINT NOT NULL,
  puntos        INTEGER NOT NULL,
  codigo        VARCHAR(20) NOT NULL,
  estado        VARCHAR(12) NOT NULL DEFAULT 'pendiente',
  fecha         TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  usado_en      TIMESTAMP(0) NULL,
  vence_en      DATE NULL,
  CONSTRAINT uq_canjes_codigo UNIQUE (codigo),
  CONSTRAINT chk_canjes_estado CHECK (estado IN ('pendiente','usado','vencido','anulado')),
  CONSTRAINT fk_canjes_cuenta     FOREIGN KEY (cuenta_id)     REFERENCES fidelizacion.cuentas_puntos(id) ON DELETE CASCADE,
  CONSTRAINT fk_canjes_recompensa FOREIGN KEY (recompensa_id) REFERENCES fidelizacion.recompensas(id)
);
CREATE INDEX idx_canjes_cuenta ON fidelizacion.canjes (cuenta_id, fecha);

-- Promoción dirigida a un segmento de clientes: los que hace meses que no
-- vienen, los del nivel oro, los que tienen mascota que cumple años…
CREATE TABLE fidelizacion.promociones (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre      VARCHAR(120) NOT NULL,
  descripcion TEXT NULL,
  segmento    VARCHAR(20) NOT NULL DEFAULT 'todos',
  cupon_id    INTEGER NULL,
  plantilla_id SMALLINT NULL,
  desde       DATE NOT NULL DEFAULT CURRENT_DATE,
  hasta       DATE NULL,
  activo      SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT chk_promociones_segmento CHECK (segmento IN (
    'todos','nuevos','inactivos','recurrentes','nivel','plan','cumpleanos')),
  CONSTRAINT chk_promociones_activo CHECK (activo IN (0,1)),
  CONSTRAINT chk_promociones_fechas CHECK (hasta IS NULL OR hasta >= desde),
  CONSTRAINT fk_promociones_cupon     FOREIGN KEY (cupon_id)     REFERENCES tienda.cupones(id) ON DELETE SET NULL,
  CONSTRAINT fk_promociones_plantilla FOREIGN KEY (plantilla_id) REFERENCES comunicacion.plantillas_notificaciones(id) ON DELETE SET NULL
);


-- =====================================================================
--  MÓDULO 24 · ATENCION AL CLIENTE (PQRS)
-- =====================================================================

CREATE TABLE soporte.tickets (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  numero      VARCHAR(30) NOT NULL,
  usuario_id  INTEGER NULL,
  cliente_id  INTEGER NULL,
  sede_id     SMALLINT NULL,
  tipo        VARCHAR(14) NOT NULL DEFAULT 'peticion',
  canal       VARCHAR(12) NOT NULL DEFAULT 'portal',
  asunto      VARCHAR(150) NOT NULL,
  descripcion TEXT NOT NULL,
  prioridad   VARCHAR(10) NOT NULL DEFAULT 'normal',
  estado      VARCHAR(14) NOT NULL DEFAULT 'abierto',
  asignado_a  INTEGER NULL,
  cita_id     INTEGER NULL,
  factura_id  INTEGER NULL,
  -- Contacto de quien no tiene cuenta (una queja puede llegar de cualquiera).
  nombre_contacto VARCHAR(120) NULL,
  email_contacto  VARCHAR(160) NULL,
  telefono_contacto VARCHAR(30) NULL,
  creado_en   TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  actualizado_en TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  cerrado_en  TIMESTAMP(0) NULL,
  -- Plazo de respuesta: la ley colombiana da 15 días hábiles para una PQRS.
  vence_en    TIMESTAMP(0) NULL,
  calificacion SMALLINT NULL,
  comentario_cierre TEXT NULL,
  CONSTRAINT uq_tickets_numero UNIQUE (numero),
  CONSTRAINT chk_tickets_tipo CHECK (tipo IN ('peticion','queja','reclamo','sugerencia','felicitacion','soporte')),
  CONSTRAINT chk_tickets_canal CHECK (canal IN ('portal','telefono','presencial','email','whatsapp')),
  CONSTRAINT chk_tickets_prioridad CHECK (prioridad IN ('baja','normal','alta','urgente')),
  CONSTRAINT chk_tickets_estado CHECK (estado IN ('abierto','en_proceso','esperando','resuelto','cerrado')),
  CONSTRAINT chk_tickets_calificacion CHECK (calificacion IS NULL OR calificacion BETWEEN 1 AND 5),
  CONSTRAINT fk_tickets_usuario  FOREIGN KEY (usuario_id) REFERENCES usuarios.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_tickets_cliente  FOREIGN KEY (cliente_id) REFERENCES usuarios.clientes(id) ON DELETE SET NULL,
  CONSTRAINT fk_tickets_sede     FOREIGN KEY (sede_id)    REFERENCES configuracion.sedes(id) ON DELETE SET NULL,
  CONSTRAINT fk_tickets_asignado FOREIGN KEY (asignado_a) REFERENCES usuarios.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_tickets_cita     FOREIGN KEY (cita_id)    REFERENCES agenda.citas(id) ON DELETE SET NULL,
  CONSTRAINT fk_tickets_factura  FOREIGN KEY (factura_id) REFERENCES facturacion.facturas(id) ON DELETE SET NULL
);
CREATE INDEX idx_tickets_estado  ON soporte.tickets (estado, prioridad, creado_en);
CREATE INDEX idx_tickets_cliente ON soporte.tickets (cliente_id, creado_en);

CREATE TRIGGER trg_tickets_actualizado BEFORE UPDATE ON soporte.tickets
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_actualizado_en();

CREATE TABLE soporte.ticket_mensajes (
  id         INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  ticket_id  INTEGER NOT NULL,
  autor_id   INTEGER NULL,
  autor_nombre VARCHAR(120) NULL,
  mensaje    TEXT NOT NULL,
  -- Nota interna: la ve el equipo, no el cliente.
  interno    SMALLINT NOT NULL DEFAULT 0,
  archivo    VARCHAR(255) NULL,
  creado_en  TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_ticket_mensajes_interno CHECK (interno IN (0,1)),
  CONSTRAINT fk_ticket_mensajes_ticket FOREIGN KEY (ticket_id)
    REFERENCES soporte.tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_ticket_mensajes_autor FOREIGN KEY (autor_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_ticket_mensajes ON soporte.ticket_mensajes (ticket_id, creado_en);

CREATE TABLE soporte.encuestas (
  id          SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  codigo      VARCHAR(40) NOT NULL,
  nombre      VARCHAR(120) NOT NULL,
  descripcion VARCHAR(255) NULL,
  momento     VARCHAR(20) NOT NULL DEFAULT 'post_cita',
  preguntas   JSONB NOT NULL,
  activo      SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_encuestas_codigo UNIQUE (codigo),
  CONSTRAINT chk_encuestas_momento CHECK (momento IN ('post_cita','post_pedido','post_ticket','general')),
  CONSTRAINT chk_encuestas_activo CHECK (activo IN (0,1))
);

CREATE TABLE soporte.encuesta_respuestas (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  encuesta_id  SMALLINT NOT NULL,
  cliente_id   INTEGER NULL,
  cita_id      INTEGER NULL,
  pedido_id    INTEGER NULL,
  ticket_id    INTEGER NULL,
  veterinario_id INTEGER NULL,
  respuestas   JSONB NOT NULL,
  calificacion SMALLINT NULL,
  comentario   TEXT NULL,
  fecha        TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_encuesta_resp_calificacion CHECK (calificacion IS NULL OR calificacion BETWEEN 1 AND 5),
  CONSTRAINT fk_encuesta_resp_encuesta FOREIGN KEY (encuesta_id) REFERENCES soporte.encuestas(id) ON DELETE CASCADE,
  CONSTRAINT fk_encuesta_resp_cliente  FOREIGN KEY (cliente_id)  REFERENCES usuarios.clientes(id) ON DELETE SET NULL,
  CONSTRAINT fk_encuesta_resp_cita     FOREIGN KEY (cita_id)     REFERENCES agenda.citas(id) ON DELETE SET NULL,
  CONSTRAINT fk_encuesta_resp_pedido   FOREIGN KEY (pedido_id)   REFERENCES tienda.pedidos(id) ON DELETE SET NULL,
  CONSTRAINT fk_encuesta_resp_ticket   FOREIGN KEY (ticket_id)   REFERENCES soporte.tickets(id) ON DELETE SET NULL,
  CONSTRAINT fk_encuesta_resp_vet      FOREIGN KEY (veterinario_id) REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_encuesta_resp ON soporte.encuesta_respuestas (encuesta_id, fecha);


-- =====================================================================
--  MÓDULO 25 · GESTION DEL PERSONAL
-- =====================================================================

CREATE TABLE personal.turnos (
  id          SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre      VARCHAR(60) NOT NULL,
  sede_id     SMALLINT NULL,
  hora_inicio TIME(0) NOT NULL,
  hora_fin    TIME(0) NOT NULL,
  color       VARCHAR(20) NULL,
  -- Turno de noche: cruza la medianoche, así que hora_fin < hora_inicio.
  nocturno    SMALLINT NOT NULL DEFAULT 0,
  activo      SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_turnos_nombre UNIQUE NULLS NOT DISTINCT (sede_id, nombre),
  CONSTRAINT chk_turnos_nocturno CHECK (nocturno IN (0,1)),
  CONSTRAINT chk_turnos_activo   CHECK (activo IN (0,1)),
  CONSTRAINT chk_turnos_rango    CHECK (nocturno = 1 OR hora_fin > hora_inicio),
  CONSTRAINT fk_turnos_sede FOREIGN KEY (sede_id) REFERENCES configuracion.sedes(id) ON DELETE CASCADE
);

CREATE TABLE personal.asignaciones_turno (
  id         INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  usuario_id INTEGER NOT NULL,
  turno_id   SMALLINT NOT NULL,
  sede_id    SMALLINT NULL,
  fecha      DATE NOT NULL,
  estado     VARCHAR(12) NOT NULL DEFAULT 'programado',
  notas      VARCHAR(180) NULL,
  CONSTRAINT uq_asignaciones_turno UNIQUE (usuario_id, fecha, turno_id),
  CONSTRAINT chk_asignaciones_estado CHECK (estado IN ('programado','cumplido','ausente','cambiado')),
  CONSTRAINT fk_asignaciones_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios.usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_asignaciones_turno   FOREIGN KEY (turno_id)   REFERENCES personal.turnos(id) ON DELETE CASCADE,
  CONSTRAINT fk_asignaciones_sede    FOREIGN KEY (sede_id)    REFERENCES configuracion.sedes(id) ON DELETE SET NULL
);
CREATE INDEX idx_asignaciones_fecha ON personal.asignaciones_turno (fecha, sede_id);

CREATE TABLE personal.asistencia (
  id         INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  usuario_id INTEGER NOT NULL,
  fecha      DATE NOT NULL,
  entrada    TIMESTAMP(0) NULL,
  salida     TIMESTAMP(0) NULL,
  horas      NUMERIC(5,2) NULL,
  estado     VARCHAR(12) NOT NULL DEFAULT 'presente',
  observaciones VARCHAR(200) NULL,
  registrado_por INTEGER NULL,
  CONSTRAINT uq_asistencia UNIQUE (usuario_id, fecha),
  CONSTRAINT chk_asistencia_estado CHECK (estado IN ('presente','tarde','ausente','justificado','descanso')),
  CONSTRAINT chk_asistencia_rango CHECK (salida IS NULL OR entrada IS NULL OR salida >= entrada),
  CONSTRAINT fk_asistencia_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios.usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_asistencia_registro FOREIGN KEY (registrado_por) REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_asistencia_fecha ON personal.asistencia (fecha);

CREATE TABLE personal.ausencias (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  usuario_id  INTEGER NOT NULL,
  tipo        VARCHAR(14) NOT NULL,
  desde       DATE NOT NULL,
  hasta       DATE NOT NULL,
  dias        SMALLINT NULL,
  motivo      VARCHAR(255) NULL,
  soporte_url VARCHAR(255) NULL,
  estado      VARCHAR(12) NOT NULL DEFAULT 'solicitada',
  aprobado_por INTEGER NULL,
  aprobado_en TIMESTAMP(0) NULL,
  -- El bloqueo de agenda que se crea al aprobar, para no dejar citas encima.
  bloqueo_id  INTEGER NULL,
  creado_en   TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_ausencias_tipo CHECK (tipo IN ('vacaciones','permiso','incapacidad','licencia','compensatorio')),
  CONSTRAINT chk_ausencias_estado CHECK (estado IN ('solicitada','aprobada','rechazada','cancelada')),
  CONSTRAINT chk_ausencias_fechas CHECK (hasta >= desde),
  CONSTRAINT fk_ausencias_usuario  FOREIGN KEY (usuario_id)   REFERENCES usuarios.usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_ausencias_aprobador FOREIGN KEY (aprobado_por) REFERENCES usuarios.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_ausencias_bloqueo  FOREIGN KEY (bloqueo_id)   REFERENCES agenda.bloqueos_agenda(id) ON DELETE SET NULL
);
CREATE INDEX idx_ausencias_usuario ON personal.ausencias (usuario_id, desde);

CREATE TABLE personal.reglas_comision (
  id          SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL,
  aplica_a    VARCHAR(12) NOT NULL DEFAULT 'servicio',
  servicio_id SMALLINT NULL,
  categoria_id SMALLINT NULL,
  usuario_id  INTEGER NULL,             -- NULL = vale para todo el equipo
  porcentaje  NUMERIC(5,2) NULL,
  valor_fijo  NUMERIC(12,2) NULL,
  activo      SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT chk_reglas_comision_aplica CHECK (aplica_a IN ('servicio','producto','examen','global')),
  CONSTRAINT chk_reglas_comision_activo CHECK (activo IN (0,1)),
  CONSTRAINT chk_reglas_comision_valor CHECK (porcentaje IS NOT NULL OR valor_fijo IS NOT NULL),
  CONSTRAINT fk_reglas_comision_servicio  FOREIGN KEY (servicio_id)  REFERENCES agenda.servicios(id) ON DELETE CASCADE,
  CONSTRAINT fk_reglas_comision_categoria FOREIGN KEY (categoria_id) REFERENCES inventario.categorias_productos(id) ON DELETE CASCADE,
  CONSTRAINT fk_reglas_comision_usuario   FOREIGN KEY (usuario_id)   REFERENCES usuarios.usuarios(id) ON DELETE CASCADE
);

CREATE TABLE personal.comisiones_generadas (
  id         INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  usuario_id INTEGER NOT NULL,
  regla_id   SMALLINT NULL,
  factura_id INTEGER NULL,
  detalle_id INTEGER NULL,
  periodo    CHAR(7) NOT NULL,          -- 'AAAA-MM'
  base       NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor      NUMERIC(12,2) NOT NULL DEFAULT 0,
  estado     VARCHAR(12) NOT NULL DEFAULT 'pendiente',
  liquidado_en DATE NULL,
  creado_en  TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_comisiones_estado CHECK (estado IN ('pendiente','liquidada','anulada')),
  CONSTRAINT fk_comisiones_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios.usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_comisiones_regla   FOREIGN KEY (regla_id)   REFERENCES personal.reglas_comision(id) ON DELETE SET NULL,
  CONSTRAINT fk_comisiones_factura FOREIGN KEY (factura_id) REFERENCES facturacion.facturas(id) ON DELETE SET NULL,
  CONSTRAINT fk_comisiones_detalle FOREIGN KEY (detalle_id) REFERENCES facturacion.detalle_facturas(id) ON DELETE SET NULL
);
CREATE INDEX idx_comisiones_periodo ON personal.comisiones_generadas (periodo, usuario_id);

CREATE TABLE personal.certificaciones (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  usuario_id  INTEGER NOT NULL,
  nombre      VARCHAR(150) NOT NULL,
  entidad     VARCHAR(150) NULL,
  tipo        VARCHAR(16) NOT NULL DEFAULT 'certificacion',
  expedida_en DATE NULL,
  vence_en    DATE NULL,
  archivo     VARCHAR(255) NULL,
  CONSTRAINT chk_certificaciones_tipo CHECK (tipo IN ('titulo','especializacion','certificacion','curso','tarjeta')),
  CONSTRAINT chk_certificaciones_fechas CHECK (vence_en IS NULL OR expedida_en IS NULL OR vence_en >= expedida_en),
  CONSTRAINT fk_certificaciones_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios.usuarios(id) ON DELETE CASCADE
);
CREATE INDEX idx_certificaciones_vence ON personal.certificaciones (vence_en);


-- =====================================================================
--  MÓDULO 26 · EQUIPOS MEDICOS
-- =====================================================================

CREATE TABLE equipos.equipos_medicos (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  codigo        VARCHAR(30) NOT NULL,
  nombre        VARCHAR(140) NOT NULL,
  marca         VARCHAR(80) NULL,
  modelo        VARCHAR(80) NULL,
  numero_serie  VARCHAR(80) NULL,
  categoria     VARCHAR(30) NULL,
  sede_id       SMALLINT NULL,
  ubicacion     VARCHAR(80) NULL,
  responsable_id INTEGER NULL,
  proveedor_id  INTEGER NULL,
  fecha_compra  DATE NULL,
  valor_compra  NUMERIC(12,2) NULL,
  garantia_hasta DATE NULL,
  estado        VARCHAR(14) NOT NULL DEFAULT 'operativo',
  requiere_calibracion SMALLINT NOT NULL DEFAULT 0,
  frecuencia_meses SMALLINT NULL,
  proximo_mantenimiento DATE NULL,
  proxima_calibracion   DATE NULL,
  notas         TEXT NULL,
  activo        SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_equipos_codigo UNIQUE (codigo),
  CONSTRAINT uq_equipos_serie  UNIQUE (numero_serie),
  CONSTRAINT chk_equipos_estado CHECK (estado IN ('operativo','mantenimiento','reparacion','fuera_servicio','dado_baja')),
  CONSTRAINT chk_equipos_calibracion CHECK (requiere_calibracion IN (0,1)),
  CONSTRAINT chk_equipos_activo CHECK (activo IN (0,1)),
  CONSTRAINT fk_equipos_sede        FOREIGN KEY (sede_id)        REFERENCES configuracion.sedes(id) ON DELETE SET NULL,
  CONSTRAINT fk_equipos_responsable FOREIGN KEY (responsable_id) REFERENCES usuarios.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_equipos_proveedor   FOREIGN KEY (proveedor_id)   REFERENCES inventario.proveedores(id) ON DELETE SET NULL
);
CREATE INDEX idx_equipos_estado ON equipos.equipos_medicos (estado, sede_id);
CREATE INDEX idx_equipos_mantenimiento ON equipos.equipos_medicos (proximo_mantenimiento);

CREATE TABLE equipos.mantenimientos_equipo (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  equipo_id   INTEGER NOT NULL,
  tipo        VARCHAR(14) NOT NULL DEFAULT 'preventivo',
  fecha       DATE NOT NULL DEFAULT CURRENT_DATE,
  realizado_por INTEGER NULL,
  proveedor   VARCHAR(150) NULL,
  descripcion TEXT NOT NULL,
  repuestos   VARCHAR(255) NULL,
  costo       NUMERIC(12,2) NOT NULL DEFAULT 0,
  resultado   VARCHAR(14) NOT NULL DEFAULT 'satisfactorio',
  proximo     DATE NULL,
  certificado VARCHAR(255) NULL,
  fuera_servicio_dias SMALLINT NULL,
  CONSTRAINT chk_mant_tipo CHECK (tipo IN ('preventivo','correctivo','calibracion','verificacion')),
  CONSTRAINT chk_mant_resultado CHECK (resultado IN ('satisfactorio','con_reservas','fallido')),
  CONSTRAINT fk_mant_equipo  FOREIGN KEY (equipo_id) REFERENCES equipos.equipos_medicos(id) ON DELETE CASCADE,
  CONSTRAINT fk_mant_usuario FOREIGN KEY (realizado_por) REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_mant_equipo ON equipos.mantenimientos_equipo (equipo_id, fecha);

-- Ahora que existen los equipos se cierra el enlace del estudio de imagen:
-- saber con qué equipo se tomó una placa importa cuando hay que repetirla.
ALTER TABLE imagenes.estudios_imagen
  ADD CONSTRAINT fk_estudios_equipo FOREIGN KEY (equipo_id)
    REFERENCES equipos.equipos_medicos(id) ON DELETE SET NULL;


-- =====================================================================
--  MÓDULO 27 · BIOSEGURIDAD
-- =====================================================================

CREATE TABLE bioseguridad.protocolos_bioseguridad (
  id          SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  codigo      VARCHAR(30) NOT NULL,
  nombre      VARCHAR(150) NOT NULL,
  categoria   VARCHAR(20) NOT NULL DEFAULT 'limpieza',
  descripcion TEXT NULL,
  pasos       TEXT NULL,
  frecuencia  VARCHAR(14) NOT NULL DEFAULT 'diaria',
  responsable_cargo VARCHAR(60) NULL,
  activo      SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_protocolos_codigo UNIQUE (codigo),
  CONSTRAINT chk_protocolos_categoria CHECK (categoria IN (
    'limpieza','desinfeccion','esterilizacion','residuos','proteccion','emergencia')),
  CONSTRAINT chk_protocolos_frecuencia CHECK (frecuencia IN (
    'por_uso','diaria','semanal','quincenal','mensual','trimestral')),
  CONSTRAINT chk_protocolos_activo CHECK (activo IN (0,1))
);

CREATE TABLE bioseguridad.registros_bioseguridad (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  protocolo_id SMALLINT NOT NULL,
  sede_id      SMALLINT NULL,
  area         VARCHAR(80) NULL,
  realizado_por INTEGER NULL,
  verificado_por INTEGER NULL,
  fecha        TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  cumplido     SMALLINT NOT NULL DEFAULT 1,
  producto_usado VARCHAR(120) NULL,
  observaciones VARCHAR(255) NULL,
  CONSTRAINT chk_registros_bio_cumplido CHECK (cumplido IN (0,1)),
  CONSTRAINT fk_registros_bio_protocolo FOREIGN KEY (protocolo_id)
    REFERENCES bioseguridad.protocolos_bioseguridad(id) ON DELETE CASCADE,
  CONSTRAINT fk_registros_bio_sede      FOREIGN KEY (sede_id) REFERENCES configuracion.sedes(id) ON DELETE SET NULL,
  CONSTRAINT fk_registros_bio_usuario   FOREIGN KEY (realizado_por)  REFERENCES usuarios.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_registros_bio_verifica  FOREIGN KEY (verificado_por) REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_registros_bio ON bioseguridad.registros_bioseguridad (protocolo_id, fecha);

CREATE TABLE bioseguridad.residuos (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id      SMALLINT NULL,
  tipo         VARCHAR(20) NOT NULL,
  peso_kg      NUMERIC(8,3) NOT NULL,
  fecha        DATE NOT NULL DEFAULT CURRENT_DATE,
  gestor       VARCHAR(150) NULL,
  numero_acta  VARCHAR(40) NULL,
  entregado_por INTEGER NULL,
  observaciones VARCHAR(255) NULL,
  CONSTRAINT chk_residuos_tipo CHECK (tipo IN (
    'anatomopatologico','cortopunzante','biosanitario','quimico','farmaco','ordinario','reciclable')),
  CONSTRAINT chk_residuos_peso CHECK (peso_kg > 0),
  CONSTRAINT fk_residuos_sede    FOREIGN KEY (sede_id) REFERENCES configuracion.sedes(id) ON DELETE SET NULL,
  CONSTRAINT fk_residuos_usuario FOREIGN KEY (entregado_por) REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_residuos_fecha ON bioseguridad.residuos (fecha, tipo);

CREATE TABLE bioseguridad.incidentes_bioseguridad (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id     SMALLINT NULL,
  tipo        VARCHAR(24) NOT NULL,
  fecha       TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  lugar       VARCHAR(120) NULL,
  descripcion TEXT NOT NULL,
  involucrados VARCHAR(255) NULL,
  gravedad    VARCHAR(10) NOT NULL DEFAULT 'leve',
  acciones    TEXT NULL,
  estado      VARCHAR(12) NOT NULL DEFAULT 'abierto',
  reportado_por INTEGER NULL,
  cerrado_en  TIMESTAMP(0) NULL,
  CONSTRAINT chk_incidentes_tipo CHECK (tipo IN (
    'accidente_cortopunzante','mordedura','arañazo','exposicion_quimica',
    'derrame','contaminacion','fuga_paciente','otro')),
  CONSTRAINT chk_incidentes_gravedad CHECK (gravedad IN ('leve','moderada','grave')),
  CONSTRAINT chk_incidentes_estado CHECK (estado IN ('abierto','en_seguimiento','cerrado')),
  CONSTRAINT fk_incidentes_sede    FOREIGN KEY (sede_id) REFERENCES configuracion.sedes(id) ON DELETE SET NULL,
  CONSTRAINT fk_incidentes_usuario FOREIGN KEY (reportado_por) REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_incidentes_estado ON bioseguridad.incidentes_bioseguridad (estado, fecha);

CREATE TABLE bioseguridad.elementos_proteccion (
  id          SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL,
  tipo        VARCHAR(20) NOT NULL DEFAULT 'otro',
  producto_id INTEGER NULL,
  vida_util_dias SMALLINT NULL,
  activo      SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_epp_nombre UNIQUE (nombre),
  CONSTRAINT chk_epp_tipo CHECK (tipo IN ('guantes','tapabocas','bata','gafas','careta','delantal','calzado','otro')),
  CONSTRAINT chk_epp_activo CHECK (activo IN (0,1)),
  CONSTRAINT fk_epp_producto FOREIGN KEY (producto_id) REFERENCES inventario.productos(id) ON DELETE SET NULL
);

CREATE TABLE bioseguridad.entregas_epp (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  elemento_id SMALLINT NOT NULL,
  usuario_id  INTEGER NOT NULL,
  cantidad    SMALLINT NOT NULL DEFAULT 1,
  fecha       DATE NOT NULL DEFAULT CURRENT_DATE,
  proxima_entrega DATE NULL,
  entregado_por INTEGER NULL,
  observaciones VARCHAR(200) NULL,
  CONSTRAINT chk_entregas_epp_cantidad CHECK (cantidad > 0),
  CONSTRAINT fk_entregas_epp_elemento FOREIGN KEY (elemento_id) REFERENCES bioseguridad.elementos_proteccion(id) ON DELETE CASCADE,
  CONSTRAINT fk_entregas_epp_usuario  FOREIGN KEY (usuario_id)  REFERENCES usuarios.usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_entregas_epp_entrega  FOREIGN KEY (entregado_por) REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_entregas_epp ON bioseguridad.entregas_epp (usuario_id, fecha);


-- =====================================================================
--  MÓDULO 28 · CAJA POR SEDE
--
--  Multi-sede ya estaba resuelto para agenda, inventario y facturación:
--  todo cuelga de sede_id. Lo que faltaba era la caja, que es lo único
--  que de verdad tiene que cuadrar sede por sede al cerrar el día.
-- =====================================================================

CREATE TABLE facturacion.cajas (
  id      SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id SMALLINT NOT NULL,
  nombre  VARCHAR(60) NOT NULL,
  activo  SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_cajas UNIQUE (sede_id, nombre),
  CONSTRAINT chk_cajas_activo CHECK (activo IN (0,1)),
  CONSTRAINT fk_cajas_sede FOREIGN KEY (sede_id) REFERENCES configuracion.sedes(id) ON DELETE CASCADE
);

CREATE TABLE facturacion.aperturas_caja (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  caja_id        SMALLINT NOT NULL,
  abierta_por    INTEGER NOT NULL,
  cerrada_por    INTEGER NULL,
  base_inicial   NUMERIC(12,2) NOT NULL DEFAULT 0,
  apertura       TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  cierre         TIMESTAMP(0) NULL,
  total_esperado NUMERIC(12,2) NULL,
  total_contado  NUMERIC(12,2) NULL,
  diferencia     NUMERIC(12,2) NULL,
  estado         VARCHAR(10) NOT NULL DEFAULT 'abierta',
  observaciones  VARCHAR(255) NULL,
  CONSTRAINT chk_aperturas_estado CHECK (estado IN ('abierta','cerrada')),
  CONSTRAINT chk_aperturas_cierre CHECK (estado <> 'cerrada' OR cierre IS NOT NULL),
  CONSTRAINT fk_aperturas_caja  FOREIGN KEY (caja_id)     REFERENCES facturacion.cajas(id),
  CONSTRAINT fk_aperturas_abre  FOREIGN KEY (abierta_por) REFERENCES usuarios.usuarios(id),
  CONSTRAINT fk_aperturas_cierra FOREIGN KEY (cerrada_por) REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
-- Una sola apertura viva por caja: dos turnos abiertos a la vez harían
-- imposible saber a quién le falta el dinero al cuadrar.
CREATE UNIQUE INDEX uq_caja_abierta ON facturacion.aperturas_caja (caja_id) WHERE estado = 'abierta';

CREATE TABLE facturacion.movimientos_caja (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  apertura_id INTEGER NOT NULL,
  tipo        VARCHAR(10) NOT NULL,
  concepto    VARCHAR(180) NOT NULL,
  valor       NUMERIC(12,2) NOT NULL,
  metodo      VARCHAR(15) NOT NULL DEFAULT 'efectivo',
  pago_id     INTEGER NULL,
  usuario_id  INTEGER NULL,
  fecha       TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_mov_caja_tipo   CHECK (tipo IN ('ingreso','egreso','venta','base')),
  CONSTRAINT chk_mov_caja_valor  CHECK (valor > 0),
  CONSTRAINT chk_mov_caja_metodo CHECK (metodo IN ('efectivo','tarjeta','transferencia','en_linea')),
  CONSTRAINT fk_mov_caja_apertura FOREIGN KEY (apertura_id) REFERENCES facturacion.aperturas_caja(id) ON DELETE CASCADE,
  CONSTRAINT fk_mov_caja_pago     FOREIGN KEY (pago_id)     REFERENCES facturacion.pagos(id) ON DELETE SET NULL,
  CONSTRAINT fk_mov_caja_usuario  FOREIGN KEY (usuario_id)  REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_mov_caja ON facturacion.movimientos_caja (apertura_id, fecha);


-- =====================================================================
--  MÓDULO 29 · INTEGRACIONES (Colombia)
--
--  Este módulo guarda la configuración y el rastro de lo que se manda a
--  terceros. No incluye credenciales en claro: se guarda el nombre de la
--  variable de entorno donde vive cada secreto, para que rotar una clave
--  no obligue a tocar la base ni deje el token escrito en un backup.
-- =====================================================================

CREATE TABLE integraciones.proveedores_facturacion (
  id            SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre        VARCHAR(120) NOT NULL,
  nit           VARCHAR(30) NULL,
  ambiente      VARCHAR(12) NOT NULL DEFAULT 'pruebas',
  url_base      VARCHAR(255) NULL,
  usuario       VARCHAR(120) NULL,
  secreto_env   VARCHAR(60) NULL,      -- nombre de la variable de entorno
  prefijo       VARCHAR(10) NULL,
  resolucion    VARCHAR(40) NULL,
  rango_desde   INTEGER NULL,
  rango_hasta   INTEGER NULL,
  vigencia_hasta DATE NULL,
  activo        SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT uq_prov_facturacion_nombre UNIQUE (nombre),
  CONSTRAINT chk_prov_facturacion_ambiente CHECK (ambiente IN ('pruebas','produccion')),
  CONSTRAINT chk_prov_facturacion_activo CHECK (activo IN (0,1)),
  CONSTRAINT chk_prov_facturacion_rango CHECK (
    rango_hasta IS NULL OR rango_desde IS NULL OR rango_hasta >= rango_desde)
);

CREATE TABLE integraciones.facturas_electronicas (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  factura_id   INTEGER NOT NULL,
  proveedor_id SMALLINT NULL,
  cufe         VARCHAR(120) NULL,
  numero_dian  VARCHAR(40) NULL,
  estado       VARCHAR(14) NOT NULL DEFAULT 'pendiente',
  xml_url      VARCHAR(255) NULL,
  pdf_url      VARCHAR(255) NULL,
  qr_texto     TEXT NULL,
  intentos     SMALLINT NOT NULL DEFAULT 0,
  respuesta    JSONB NULL,
  error        VARCHAR(255) NULL,
  enviado_en   TIMESTAMP(0) NULL,
  aceptado_en  TIMESTAMP(0) NULL,
  creado_en    TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_facturas_electronicas UNIQUE (factura_id),
  CONSTRAINT uq_facturas_electronicas_cufe UNIQUE (cufe),
  CONSTRAINT chk_fe_estado CHECK (estado IN ('pendiente','enviada','aceptada','rechazada','anulada')),
  CONSTRAINT fk_fe_factura   FOREIGN KEY (factura_id)   REFERENCES facturacion.facturas(id) ON DELETE CASCADE,
  CONSTRAINT fk_fe_proveedor FOREIGN KEY (proveedor_id) REFERENCES integraciones.proveedores_facturacion(id) ON DELETE SET NULL
);
CREATE INDEX idx_fe_estado ON integraciones.facturas_electronicas (estado, creado_en);

CREATE TABLE integraciones.pasarelas_pago (
  id          SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre      VARCHAR(60) NOT NULL,
  metodo      VARCHAR(16) NOT NULL,
  proveedor   VARCHAR(60) NULL,        -- Wompi, PayU, Mercado Pago…
  ambiente    VARCHAR(12) NOT NULL DEFAULT 'pruebas',
  clave_publica VARCHAR(160) NULL,
  secreto_env VARCHAR(60) NULL,
  comision_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  orden       SMALLINT NOT NULL DEFAULT 0,
  activo      SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT uq_pasarelas_nombre UNIQUE (nombre),
  CONSTRAINT chk_pasarelas_metodo CHECK (metodo IN (
    'pse','nequi','daviplata','tarjeta','transferencia','efecty','otro')),
  CONSTRAINT chk_pasarelas_ambiente CHECK (ambiente IN ('pruebas','produccion')),
  CONSTRAINT chk_pasarelas_activo CHECK (activo IN (0,1))
);

CREATE TABLE integraciones.transacciones_pago (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  pasarela_id  SMALLINT NULL,
  factura_id   INTEGER NULL,
  pedido_id    INTEGER NULL,
  sesion_tele_id INTEGER NULL,
  suscripcion_id INTEGER NULL,
  cliente_id   INTEGER NULL,
  pago_id      INTEGER NULL,           -- el pago que se creó al confirmarse
  referencia   VARCHAR(60) NOT NULL,
  referencia_externa VARCHAR(120) NULL,
  valor        NUMERIC(12,2) NOT NULL,
  metodo       VARCHAR(16) NULL,
  estado       VARCHAR(12) NOT NULL DEFAULT 'iniciada',
  respuesta    JSONB NULL,
  creado_en    TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  confirmado_en TIMESTAMP(0) NULL,
  CONSTRAINT uq_transacciones_referencia UNIQUE (referencia),
  CONSTRAINT chk_transacciones_estado CHECK (estado IN (
    'iniciada','pendiente','aprobada','rechazada','expirada','reversada')),
  CONSTRAINT chk_transacciones_valor CHECK (valor > 0),
  CONSTRAINT fk_transacciones_pasarela FOREIGN KEY (pasarela_id) REFERENCES integraciones.pasarelas_pago(id) ON DELETE SET NULL,
  CONSTRAINT fk_transacciones_factura  FOREIGN KEY (factura_id)  REFERENCES facturacion.facturas(id) ON DELETE SET NULL,
  CONSTRAINT fk_transacciones_pedido   FOREIGN KEY (pedido_id)   REFERENCES tienda.pedidos(id) ON DELETE SET NULL,
  CONSTRAINT fk_transacciones_tele     FOREIGN KEY (sesion_tele_id) REFERENCES telemedicina.sesiones_telemedicina(id) ON DELETE SET NULL,
  CONSTRAINT fk_transacciones_suscripcion FOREIGN KEY (suscripcion_id) REFERENCES fidelizacion.suscripciones_plan(id) ON DELETE SET NULL,
  CONSTRAINT fk_transacciones_cliente  FOREIGN KEY (cliente_id)  REFERENCES usuarios.clientes(id) ON DELETE SET NULL,
  CONSTRAINT fk_transacciones_pago     FOREIGN KEY (pago_id)     REFERENCES facturacion.pagos(id) ON DELETE SET NULL
);
CREATE INDEX idx_transacciones_estado ON integraciones.transacciones_pago (estado, creado_en);

-- Rastro de todo lo que sale por WhatsApp, correo o SMS. Sin esto no hay
-- manera de responder a "yo nunca recibí el recordatorio".
CREATE TABLE integraciones.mensajes_enviados (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  canal          VARCHAR(12) NOT NULL,
  destino        VARCHAR(160) NOT NULL,
  usuario_id     INTEGER NULL,
  plantilla_id   SMALLINT NULL,
  notificacion_id INTEGER NULL,
  recordatorio_id INTEGER NULL,
  asunto         VARCHAR(180) NULL,
  cuerpo         TEXT NULL,
  estado         VARCHAR(12) NOT NULL DEFAULT 'pendiente',
  proveedor      VARCHAR(60) NULL,
  id_externo     VARCHAR(120) NULL,
  error          VARCHAR(255) NULL,
  intentos       SMALLINT NOT NULL DEFAULT 0,
  creado_en      TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  enviado_en     TIMESTAMP(0) NULL,
  entregado_en   TIMESTAMP(0) NULL,
  CONSTRAINT chk_mensajes_canal  CHECK (canal IN ('email','sms','whatsapp','push')),
  CONSTRAINT chk_mensajes_estado CHECK (estado IN ('pendiente','enviado','entregado','leido','fallido')),
  CONSTRAINT fk_mensajes_usuario     FOREIGN KEY (usuario_id)      REFERENCES usuarios.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_mensajes_plantilla   FOREIGN KEY (plantilla_id)    REFERENCES comunicacion.plantillas_notificaciones(id) ON DELETE SET NULL,
  CONSTRAINT fk_mensajes_notificacion FOREIGN KEY (notificacion_id) REFERENCES comunicacion.notificaciones(id) ON DELETE SET NULL,
  CONSTRAINT fk_mensajes_recordatorio FOREIGN KEY (recordatorio_id) REFERENCES comunicacion.recordatorios(id) ON DELETE SET NULL
);
CREATE INDEX idx_mensajes_enviados ON integraciones.mensajes_enviados (canal, estado, creado_en);


-- =====================================================================
--  MÓDULO 30 · AUTOMATIZACION
--
--  Qué suceso dispara qué aviso y con cuánta antelación. Estaba escrito
--  en el código; sacarlo a una tabla deja que la clínica cambie "recordar
--  la cita 24 horas antes" por 48 sin volver a desplegar.
-- =====================================================================

CREATE TABLE comunicacion.reglas_automaticas (
  id           SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  codigo       VARCHAR(50) NOT NULL,
  nombre       VARCHAR(120) NOT NULL,
  evento       VARCHAR(40) NOT NULL,
  plantilla_id SMALLINT NULL,
  canal        VARCHAR(15) NOT NULL DEFAULT 'sistema',
  -- Horas respecto al suceso: negativo = antes, positivo = después.
  desfase_horas INTEGER NOT NULL DEFAULT 0,
  destinatario VARCHAR(16) NOT NULL DEFAULT 'cliente',
  condiciones  JSONB NULL,
  activo       SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_reglas_automaticas_codigo UNIQUE (codigo),
  CONSTRAINT chk_reglas_auto_evento CHECK (evento IN (
    'cita_creada','cita_proxima','cita_no_asistio','vacuna_proxima','vacuna_vencida',
    'desparasitacion_proxima','resultado_listo','factura_pendiente','factura_vencida',
    'tratamiento_control','medicamento_toma','cumpleanos','cliente_inactivo',
    'pedido_estado','plan_por_vencer')),
  CONSTRAINT chk_reglas_auto_canal CHECK (canal IN ('sistema','email','sms','whatsapp')),
  CONSTRAINT chk_reglas_auto_destinatario CHECK (destinatario IN ('cliente','veterinario','admin','equipo')),
  CONSTRAINT chk_reglas_auto_activo CHECK (activo IN (0,1)),
  CONSTRAINT fk_reglas_auto_plantilla FOREIGN KEY (plantilla_id)
    REFERENCES comunicacion.plantillas_notificaciones(id) ON DELETE SET NULL
);

-- El recordatorio puede nacer de una regla; guardarlo evita programar dos
-- veces el mismo aviso cuando el procesador se ejecuta varias veces.
ALTER TABLE comunicacion.recordatorios
  ADD COLUMN regla_id SMALLINT NULL,
  ADD COLUMN clave_unica VARCHAR(80) NULL,
  ADD CONSTRAINT fk_recordatorios_regla FOREIGN KEY (regla_id)
    REFERENCES comunicacion.reglas_automaticas(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX uq_recordatorios_clave ON comunicacion.recordatorios (clave_unica)
  WHERE clave_unica IS NOT NULL;

-- Los recordatorios de la automatización cubren más casos que los cinco de
-- antes (facturas, pedidos, cumpleaños…).
ALTER TABLE comunicacion.recordatorios
  DROP CONSTRAINT chk_recordatorios_tipo,
  ADD CONSTRAINT chk_recordatorios_tipo CHECK (tipo IN (
    'cita','vacuna','control','tratamiento','desparasitacion','resultado',
    'factura','medicamento','cumpleanos','reactivacion','pedido','plan','otro'));


-- =====================================================================
--  MÓDULO 31 · ALERTAS CRITICAS
--
--  Una alerta no es una notificación: la notificación se lee y se
--  descarta, la alerta se queda hasta que alguien la resuelve. Por eso
--  vive aparte y tiene estado.
-- =====================================================================

CREATE TABLE alertas.reglas_alerta (
  id          SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  codigo      VARCHAR(50) NOT NULL,
  nombre      VARCHAR(120) NOT NULL,
  categoria   VARCHAR(16) NOT NULL,
  severidad   VARCHAR(10) NOT NULL DEFAULT 'media',
  descripcion VARCHAR(255) NULL,
  parametros  JSONB NULL,              -- umbrales: días de aviso, mínimos…
  activo      SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_reglas_alerta_codigo UNIQUE (codigo),
  CONSTRAINT chk_reglas_alerta_categoria CHECK (categoria IN (
    'clinica','inventario','agenda','facturacion','equipos','personal','seguridad')),
  CONSTRAINT chk_reglas_alerta_severidad CHECK (severidad IN ('baja','media','alta','critica')),
  CONSTRAINT chk_reglas_alerta_activo CHECK (activo IN (0,1))
);

CREATE TABLE alertas.alertas_criticas (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  regla_id    SMALLINT NULL,
  codigo      VARCHAR(50) NOT NULL,
  categoria   VARCHAR(16) NOT NULL,
  severidad   VARCHAR(10) NOT NULL DEFAULT 'media',
  titulo      VARCHAR(150) NOT NULL,
  mensaje     TEXT NULL,
  entidad     VARCHAR(40) NULL,
  entidad_id  INTEGER NULL,
  mascota_id  INTEGER NULL,
  sede_id     SMALLINT NULL,
  enlace      VARCHAR(255) NULL,
  estado      VARCHAR(12) NOT NULL DEFAULT 'abierta',
  atendida_por INTEGER NULL,
  atendida_en TIMESTAMP(0) NULL,
  nota_cierre VARCHAR(255) NULL,
  creado_en   TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  -- Clave de deduplicación: la misma alerta sobre la misma cosa no se repite
  -- cada vez que se recalculan. Sin esto, un producto vencido generaría una
  -- alerta nueva en cada visita al panel.
  clave_unica VARCHAR(120) NULL,
  CONSTRAINT chk_alertas_categoria CHECK (categoria IN (
    'clinica','inventario','agenda','facturacion','equipos','personal','seguridad')),
  CONSTRAINT chk_alertas_severidad CHECK (severidad IN ('baja','media','alta','critica')),
  CONSTRAINT chk_alertas_estado CHECK (estado IN ('abierta','vista','resuelta','descartada')),
  CONSTRAINT fk_alertas_regla   FOREIGN KEY (regla_id)   REFERENCES alertas.reglas_alerta(id) ON DELETE SET NULL,
  CONSTRAINT fk_alertas_mascota FOREIGN KEY (mascota_id) REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_alertas_sede    FOREIGN KEY (sede_id)    REFERENCES configuracion.sedes(id) ON DELETE SET NULL,
  CONSTRAINT fk_alertas_usuario FOREIGN KEY (atendida_por) REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_alertas_estado ON alertas.alertas_criticas (estado, severidad, creado_en);
CREATE INDEX idx_alertas_entidad ON alertas.alertas_criticas (entidad, entidad_id);
CREATE UNIQUE INDEX uq_alertas_clave ON alertas.alertas_criticas (clave_unica)
  WHERE clave_unica IS NOT NULL AND estado IN ('abierta','vista');


-- =====================================================================
--  MÓDULO 32 · IA COMO ASISTENTE INTERNO
--
--  La IA propone; el veterinario dispone. Ninguna sugerencia entra en la
--  historia clínica por su cuenta: se guarda como propuesta y solo cuenta
--  cuando alguien la revisa y la acepta, y queda registrado quién fue.
--  Un algoritmo con buena interfaz sigue sin tener tarjeta profesional.
-- =====================================================================

CREATE TABLE ia.solicitudes_ia (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  usuario_id  INTEGER NULL,
  tipo        VARCHAR(30) NOT NULL,
  entidad     VARCHAR(40) NULL,
  entidad_id  INTEGER NULL,
  mascota_id  INTEGER NULL,
  entrada     TEXT NULL,               -- resumen de lo que se le pasó
  respuesta   TEXT NULL,
  modelo      VARCHAR(60) NULL,
  tokens_entrada INTEGER NULL,
  tokens_salida  INTEGER NULL,
  duracion_ms INTEGER NULL,
  estado      VARCHAR(12) NOT NULL DEFAULT 'completada',
  error       VARCHAR(255) NULL,
  creado_en   TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_solicitudes_ia_tipo CHECK (tipo IN (
    'resumen_historia','resumen_consultas','borrador_evolucion','datos_faltantes',
    'interacciones','busqueda','clasificar_documento','sugerencia_recordatorio')),
  CONSTRAINT chk_solicitudes_ia_estado CHECK (estado IN ('completada','fallida','cancelada')),
  CONSTRAINT fk_solicitudes_ia_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_solicitudes_ia_mascota FOREIGN KEY (mascota_id) REFERENCES mascotas.mascotas(id) ON DELETE CASCADE
);
CREATE INDEX idx_solicitudes_ia ON ia.solicitudes_ia (tipo, creado_en);

CREATE TABLE ia.sugerencias_ia (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  solicitud_id INTEGER NULL,
  tipo         VARCHAR(30) NOT NULL,
  titulo       VARCHAR(180) NOT NULL,
  contenido    TEXT NOT NULL,
  entidad      VARCHAR(40) NULL,
  entidad_id   INTEGER NULL,
  mascota_id   INTEGER NULL,
  severidad    VARCHAR(10) NOT NULL DEFAULT 'media',
  estado       VARCHAR(12) NOT NULL DEFAULT 'propuesta',
  revisado_por INTEGER NULL,
  revisado_en  TIMESTAMP(0) NULL,
  nota_revision VARCHAR(255) NULL,
  creado_en    TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_sugerencias_ia_estado CHECK (estado IN ('propuesta','aceptada','descartada')),
  CONSTRAINT chk_sugerencias_ia_severidad CHECK (severidad IN ('baja','media','alta')),
  -- Aceptar o descartar exige nombre y fecha: una sugerencia clínica no puede
  -- quedar aprobada "por el sistema".
  CONSTRAINT chk_sugerencias_ia_revision CHECK (
    estado = 'propuesta' OR (revisado_por IS NOT NULL AND revisado_en IS NOT NULL)),
  CONSTRAINT fk_sugerencias_ia_solicitud FOREIGN KEY (solicitud_id) REFERENCES ia.solicitudes_ia(id) ON DELETE SET NULL,
  CONSTRAINT fk_sugerencias_ia_mascota   FOREIGN KEY (mascota_id)   REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_sugerencias_ia_revisor   FOREIGN KEY (revisado_por) REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_sugerencias_ia ON ia.sugerencias_ia (estado, creado_en);


-- =====================================================================
--  MÓDULO 33 · REPORTES GENERADOS
--
--  Registro de qué PDF se generó, para quién y con qué parámetros. Sirve
--  para volver a descargar el mismo documento y para auditar quién sacó
--  la historia clínica de un paciente.
-- =====================================================================

CREATE TABLE archivos.reportes_generados (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  tipo        VARCHAR(30) NOT NULL,
  titulo      VARCHAR(180) NOT NULL,
  entidad     VARCHAR(40) NULL,
  entidad_id  INTEGER NULL,
  mascota_id  INTEGER NULL,
  cliente_id  INTEGER NULL,
  generado_por INTEGER NULL,
  parametros  JSONB NULL,
  archivo     VARCHAR(255) NULL,
  formato     VARCHAR(10) NOT NULL DEFAULT 'pdf',
  creado_en   TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_reportes_tipo CHECK (tipo IN (
    'historia_clinica','certificado_vacunacion','formula_medica','orden_examen',
    'resultado_laboratorio','informe_quirurgico','informe_hospitalizacion',
    'certificado_salud','factura','reporte_administrativo','informe_imagen')),
  CONSTRAINT chk_reportes_formato CHECK (formato IN ('pdf','csv','xlsx')),
  CONSTRAINT fk_reportes_mascota FOREIGN KEY (mascota_id)   REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_reportes_cliente FOREIGN KEY (cliente_id)   REFERENCES usuarios.clientes(id) ON DELETE SET NULL,
  CONSTRAINT fk_reportes_usuario FOREIGN KEY (generado_por) REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_reportes_generados ON archivos.reportes_generados (tipo, creado_en);



-- =====================================================================
--  MÓDULO 39 · MEDICINA PREVENTIVA
--
--  La clínica deja de esperar a que el animal se enferme: un plan por
--  especie y edad dice qué toca y cuándo, y lo pendiente sale solo.
--  Los factores de riesgo se guardan POR PACIENTE y no como catálogo,
--  porque lo que importa no es que exista "obesidad" sino que este perro
--  la tenga desde marzo.
-- =====================================================================

CREATE TABLE prevencion.planes_preventivos (
  id                 SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre             VARCHAR(120) NOT NULL,
  especie_id         SMALLINT NULL,
  descripcion        TEXT NULL,
  edad_min_meses     SMALLINT NULL,
  edad_max_meses     SMALLINT NULL,
  periodicidad_meses SMALLINT NOT NULL DEFAULT 12,
  activo             SMALLINT NOT NULL DEFAULT 1,
  creado_en          TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_planes_preventivos UNIQUE (nombre, especie_id),
  CONSTRAINT chk_planes_preventivos_activo CHECK (activo IN (0,1)),
  CONSTRAINT chk_planes_preventivos_edades CHECK (
    edad_max_meses IS NULL OR edad_min_meses IS NULL OR edad_max_meses >= edad_min_meses),
  CONSTRAINT fk_planes_preventivos_especie FOREIGN KEY (especie_id)
    REFERENCES mascotas.especies(id) ON DELETE CASCADE
);

CREATE TABLE prevencion.evaluaciones_periodicas (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id     INTEGER NOT NULL,
  plan_id        SMALLINT NULL,
  consulta_id    INTEGER NULL,
  veterinario_id INTEGER NULL,
  fecha          DATE NOT NULL DEFAULT CURRENT_DATE,
  hallazgos      TEXT NULL,
  riesgo_global  VARCHAR(10) NOT NULL DEFAULT 'bajo',
  recomendacion  TEXT NULL,
  proxima_fecha  DATE NULL,
  creado_en      TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_evaluaciones_periodicas_riesgo CHECK (riesgo_global IN ('bajo','medio','alto','critico')),
  CONSTRAINT fk_evaluaciones_periodicas_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_evaluaciones_periodicas_plan FOREIGN KEY (plan_id)
    REFERENCES prevencion.planes_preventivos(id) ON DELETE SET NULL,
  CONSTRAINT fk_evaluaciones_periodicas_consulta FOREIGN KEY (consulta_id)
    REFERENCES historia_clinica.consultas(id) ON DELETE SET NULL,
  CONSTRAINT fk_evaluaciones_periodicas_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_evaluaciones_periodicas_mascota ON prevencion.evaluaciones_periodicas (mascota_id, fecha DESC);

-- Qué le toca a cada paciente y cuándo. Es la agenda de salud, no la de citas.
CREATE TABLE prevencion.calendarios_salud (
  id                INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id        INTEGER NOT NULL,
  plan_id           SMALLINT NULL,
  actividad         VARCHAR(140) NOT NULL,
  tipo              VARCHAR(20) NOT NULL,
  fecha_programada  DATE NOT NULL,
  fecha_realizada   DATE NULL,
  estado            VARCHAR(15) NOT NULL DEFAULT 'programada',
  cita_id           INTEGER NULL,
  creado_en         TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_calendarios_salud_tipo CHECK (tipo IN (
    'vacuna','desparasitacion','control','examen','odontologia','nutricion','otro')),
  CONSTRAINT chk_calendarios_salud_estado CHECK (estado IN ('programada','cumplida','vencida','omitida')),
  CONSTRAINT fk_calendarios_salud_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_calendarios_salud_plan FOREIGN KEY (plan_id)
    REFERENCES prevencion.planes_preventivos(id) ON DELETE SET NULL,
  CONSTRAINT fk_calendarios_salud_cita FOREIGN KEY (cita_id)
    REFERENCES agenda.citas(id) ON DELETE SET NULL
);
CREATE INDEX idx_calendarios_salud_pendiente ON prevencion.calendarios_salud (estado, fecha_programada);

CREATE TABLE prevencion.factores_riesgo (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id   INTEGER NOT NULL,
  evaluacion_id INTEGER NULL,
  factor       VARCHAR(120) NOT NULL,
  categoria    VARCHAR(20) NOT NULL,
  nivel        VARCHAR(10) NOT NULL DEFAULT 'medio',
  detectado_en DATE NOT NULL DEFAULT CURRENT_DATE,
  resuelto_en  DATE NULL,
  activo       SMALLINT NOT NULL DEFAULT 1,
  notas        TEXT NULL,
  CONSTRAINT chk_factores_riesgo_categoria CHECK (categoria IN (
    'racial','edad','peso','habitat','alimentacion','conducta','genetico','ambiental','otro')),
  CONSTRAINT chk_factores_riesgo_nivel  CHECK (nivel IN ('bajo','medio','alto')),
  CONSTRAINT chk_factores_riesgo_activo CHECK (activo IN (0,1)),
  CONSTRAINT fk_factores_riesgo_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_factores_riesgo_evaluacion FOREIGN KEY (evaluacion_id)
    REFERENCES prevencion.evaluaciones_periodicas(id) ON DELETE SET NULL
);
CREATE INDEX idx_factores_riesgo_mascota ON prevencion.factores_riesgo (mascota_id, activo);

CREATE TABLE prevencion.recomendaciones_preventivas (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id    INTEGER NOT NULL,
  evaluacion_id INTEGER NULL,
  texto         TEXT NOT NULL,
  categoria     VARCHAR(20) NOT NULL DEFAULT 'general',
  prioridad     VARCHAR(10) NOT NULL DEFAULT 'media',
  vigente_hasta DATE NULL,
  aceptada      SMALLINT NOT NULL DEFAULT 0,
  creado_en     TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_recomendaciones_prev_categoria CHECK (categoria IN (
    'general','nutricion','ejercicio','vacunacion','odontologia','conducta','ambiente')),
  CONSTRAINT chk_recomendaciones_prev_prioridad CHECK (prioridad IN ('baja','media','alta')),
  CONSTRAINT chk_recomendaciones_prev_aceptada  CHECK (aceptada IN (0,1)),
  CONSTRAINT fk_recomendaciones_prev_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_recomendaciones_prev_evaluacion FOREIGN KEY (evaluacion_id)
    REFERENCES prevencion.evaluaciones_periodicas(id) ON DELETE CASCADE
);

-- Lo que ya se pasó de fecha. Se materializa (y no se calcula cada vez) para
-- que el recordatorio pueda decir desde cuándo está vencido y a quién se avisó.
CREATE TABLE prevencion.controles_pendientes (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id     INTEGER NOT NULL,
  calendario_id  INTEGER NULL,
  tipo           VARCHAR(20) NOT NULL,
  descripcion    VARCHAR(180) NOT NULL,
  fecha_prevista DATE NOT NULL,
  dias_vencido   INTEGER NOT NULL DEFAULT 0,
  estado         VARCHAR(15) NOT NULL DEFAULT 'pendiente',
  notificado_en  TIMESTAMP(0) NULL,
  CONSTRAINT chk_controles_pendientes_tipo CHECK (tipo IN (
    'vacuna','desparasitacion','control','examen','odontologia','nutricion','otro')),
  CONSTRAINT chk_controles_pendientes_estado CHECK (estado IN ('pendiente','agendado','cumplido','descartado')),
  CONSTRAINT fk_controles_pendientes_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_controles_pendientes_calendario FOREIGN KEY (calendario_id)
    REFERENCES prevencion.calendarios_salud(id) ON DELETE CASCADE
);
CREATE INDEX idx_controles_pendientes ON prevencion.controles_pendientes (estado, fecha_prevista);

CREATE TABLE prevencion.historial_prevencion (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id     INTEGER NOT NULL,
  fecha          DATE NOT NULL DEFAULT CURRENT_DATE,
  evento         VARCHAR(120) NOT NULL,
  referencia_tipo VARCHAR(30) NULL,
  referencia_id  INTEGER NULL,
  detalle        TEXT NULL,
  registrado_por INTEGER NULL,
  CONSTRAINT fk_historial_prevencion_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_historial_prevencion_usuario FOREIGN KEY (registrado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_historial_prevencion_mascota ON prevencion.historial_prevencion (mascota_id, fecha DESC);


-- =====================================================================
--  MÓDULO 63 · PROGRAMA DE SALUD POR ETAPA DE VIDA
--
--  Un cachorro, un adulto y un geriátrico no necesitan lo mismo. Aquí se
--  define qué toca en cada etapa; el módulo 39 lo convierte en fechas
--  concretas para cada paciente.
-- =====================================================================

CREATE TABLE prevencion.etapas_vida (
  id             SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  especie_id     SMALLINT NOT NULL,
  nombre         VARCHAR(40) NOT NULL,
  porte          VARCHAR(12) NOT NULL DEFAULT 'mediano',
  edad_min_meses SMALLINT NOT NULL,
  edad_max_meses SMALLINT NULL,
  descripcion    TEXT NULL,
  CONSTRAINT uq_etapas_vida UNIQUE (especie_id, nombre, porte),
  CONSTRAINT chk_etapas_vida_porte CHECK (porte IN ('pequeno','mediano','grande','gigante','todos')),
  CONSTRAINT fk_etapas_vida_especie FOREIGN KEY (especie_id)
    REFERENCES mascotas.especies(id) ON DELETE CASCADE
);

CREATE TABLE prevencion.protocolos_por_edad (
  id               SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  etapa_id         SMALLINT NOT NULL,
  nombre           VARCHAR(120) NOT NULL,
  descripcion      TEXT NULL,
  frecuencia_meses SMALLINT NOT NULL DEFAULT 12,
  obligatorio      SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT chk_protocolos_edad_obligatorio CHECK (obligatorio IN (0,1)),
  CONSTRAINT fk_protocolos_edad_etapa FOREIGN KEY (etapa_id)
    REFERENCES prevencion.etapas_vida(id) ON DELETE CASCADE
);

CREATE TABLE prevencion.controles_por_edad (
  id                  SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  etapa_id            SMALLINT NOT NULL,
  control             VARCHAR(120) NOT NULL,
  tipo                VARCHAR(20) NOT NULL DEFAULT 'control',
  periodicidad_meses  SMALLINT NOT NULL DEFAULT 6,
  obligatorio         SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT chk_controles_edad_tipo CHECK (tipo IN ('control','examen','odontologia','imagen','laboratorio')),
  CONSTRAINT chk_controles_edad_obligatorio CHECK (obligatorio IN (0,1)),
  CONSTRAINT fk_controles_edad_etapa FOREIGN KEY (etapa_id)
    REFERENCES prevencion.etapas_vida(id) ON DELETE CASCADE
);

CREATE TABLE prevencion.vacunas_por_edad (
  id          SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  etapa_id    SMALLINT NOT NULL,
  vacuna_id   SMALLINT NOT NULL,
  edad_meses  SMALLINT NOT NULL,
  dosis       SMALLINT NOT NULL DEFAULT 1,
  obligatoria SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_vacunas_por_edad UNIQUE (etapa_id, vacuna_id, dosis),
  CONSTRAINT chk_vacunas_edad_obligatoria CHECK (obligatoria IN (0,1)),
  CONSTRAINT fk_vacunas_edad_etapa FOREIGN KEY (etapa_id)
    REFERENCES prevencion.etapas_vida(id) ON DELETE CASCADE,
  CONSTRAINT fk_vacunas_edad_vacuna FOREIGN KEY (vacuna_id)
    REFERENCES historia_clinica.vacunas(id) ON DELETE CASCADE
);

CREATE TABLE prevencion.nutricion_por_edad (
  id               SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  etapa_id         SMALLINT NOT NULL,
  tipo_alimento_id SMALLINT NULL,
  kcal_kg_dia      NUMERIC(6,2) NULL,
  comidas_dia      SMALLINT NULL,
  recomendaciones  TEXT NULL,
  CONSTRAINT fk_nutricion_edad_etapa FOREIGN KEY (etapa_id)
    REFERENCES prevencion.etapas_vida(id) ON DELETE CASCADE,
  CONSTRAINT fk_nutricion_edad_alimento FOREIGN KEY (tipo_alimento_id)
    REFERENCES nutricion.tipos_alimento(id) ON DELETE SET NULL
);

CREATE TABLE prevencion.recomendaciones_por_edad (
  id        SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  etapa_id  SMALLINT NOT NULL,
  categoria VARCHAR(20) NOT NULL DEFAULT 'general',
  texto     TEXT NOT NULL,
  orden     SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT chk_recomendaciones_edad_categoria CHECK (categoria IN (
    'general','nutricion','ejercicio','odontologia','conducta','ambiente','reproduccion')),
  CONSTRAINT fk_recomendaciones_edad_etapa FOREIGN KEY (etapa_id)
    REFERENCES prevencion.etapas_vida(id) ON DELETE CASCADE
);


-- =====================================================================
--  MÓDULO 64 · GESTIÓN DE PATOLOGÍAS CRÓNICAS
--
--  Un paciente crónico no se "cura": se controla. Por eso el módulo gira
--  alrededor de un objetivo medible (glucemia, peso, creatinina) y de si
--  las mediciones caen dentro de él. Cuando no caen, se abre una alerta
--  de descompensación en vez de esperar a la siguiente cita.
-- =====================================================================

CREATE TABLE prevencion.enfermedades_cronicas (
  id             SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre         VARCHAR(120) NOT NULL,
  categoria      VARCHAR(30) NOT NULL DEFAULT 'otra',
  diagnostico_id SMALLINT NULL,
  especie_id     SMALLINT NULL,
  descripcion    TEXT NULL,
  activo         SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_enfermedades_cronicas UNIQUE (nombre),
  CONSTRAINT chk_enfermedades_cronicas_activo CHECK (activo IN (0,1)),
  CONSTRAINT fk_enfermedades_cronicas_dx FOREIGN KEY (diagnostico_id)
    REFERENCES historia_clinica.catalogo_diagnosticos(id) ON DELETE SET NULL,
  CONSTRAINT fk_enfermedades_cronicas_especie FOREIGN KEY (especie_id)
    REFERENCES mascotas.especies(id) ON DELETE SET NULL
);

CREATE TABLE prevencion.pacientes_cronicos (
  id              INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id      INTEGER NOT NULL,
  enfermedad_id   SMALLINT NOT NULL,
  veterinario_id  INTEGER NULL,
  diagnosticada_en DATE NOT NULL DEFAULT CURRENT_DATE,
  severidad       VARCHAR(10) NOT NULL DEFAULT 'moderada',
  estado          VARCHAR(15) NOT NULL DEFAULT 'controlado',
  periodicidad_meses SMALLINT NOT NULL DEFAULT 3,
  proxima_revision DATE NULL,
  notas           TEXT NULL,
  CONSTRAINT uq_pacientes_cronicos UNIQUE (mascota_id, enfermedad_id),
  CONSTRAINT chk_pacientes_cronicos_severidad CHECK (severidad IN ('leve','moderada','grave')),
  CONSTRAINT chk_pacientes_cronicos_estado CHECK (estado IN ('controlado','descompensado','remision','fallecido')),
  CONSTRAINT fk_pacientes_cronicos_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_pacientes_cronicos_enfermedad FOREIGN KEY (enfermedad_id)
    REFERENCES prevencion.enfermedades_cronicas(id) ON DELETE CASCADE,
  CONSTRAINT fk_pacientes_cronicos_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_pacientes_cronicos_estado ON prevencion.pacientes_cronicos (estado, proxima_revision);

CREATE TABLE prevencion.objetivos_clinicos (
  id                 INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  paciente_cronico_id INTEGER NOT NULL,
  parametro          VARCHAR(80) NOT NULL,
  unidad             VARCHAR(20) NULL,
  valor_objetivo     NUMERIC(12,3) NULL,
  rango_min          NUMERIC(12,3) NULL,
  rango_max          NUMERIC(12,3) NULL,
  plazo_meses        SMALLINT NULL,
  definido_por       INTEGER NULL,
  activo             SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT chk_objetivos_clinicos_activo CHECK (activo IN (0,1)),
  CONSTRAINT chk_objetivos_clinicos_rango CHECK (
    rango_max IS NULL OR rango_min IS NULL OR rango_max >= rango_min),
  CONSTRAINT fk_objetivos_clinicos_paciente FOREIGN KEY (paciente_cronico_id)
    REFERENCES prevencion.pacientes_cronicos(id) ON DELETE CASCADE,
  CONSTRAINT fk_objetivos_clinicos_vet FOREIGN KEY (definido_por)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);

CREATE TABLE prevencion.mediciones_periodicas (
  id                 INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  paciente_cronico_id INTEGER NOT NULL,
  objetivo_id        INTEGER NULL,
  fecha              TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  parametro          VARCHAR(80) NOT NULL,
  valor              NUMERIC(12,3) NOT NULL,
  unidad             VARCHAR(20) NULL,
  en_rango           SMALLINT NOT NULL DEFAULT 1,
  origen             VARCHAR(20) NOT NULL DEFAULT 'consulta',
  tomado_por         INTEGER NULL,
  CONSTRAINT chk_mediciones_periodicas_rango CHECK (en_rango IN (0,1)),
  CONSTRAINT chk_mediciones_periodicas_origen CHECK (origen IN (
    'consulta','laboratorio','domicilio','dispositivo','telemedicina')),
  CONSTRAINT fk_mediciones_periodicas_paciente FOREIGN KEY (paciente_cronico_id)
    REFERENCES prevencion.pacientes_cronicos(id) ON DELETE CASCADE,
  CONSTRAINT fk_mediciones_periodicas_objetivo FOREIGN KEY (objetivo_id)
    REFERENCES prevencion.objetivos_clinicos(id) ON DELETE SET NULL,
  CONSTRAINT fk_mediciones_periodicas_usuario FOREIGN KEY (tomado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_mediciones_periodicas ON prevencion.mediciones_periodicas (paciente_cronico_id, fecha DESC);

CREATE TABLE prevencion.tratamientos_cronicos (
  id                 INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  paciente_cronico_id INTEGER NOT NULL,
  medicamento_id     INTEGER NULL,
  descripcion        VARCHAR(180) NOT NULL,
  dosis              VARCHAR(80) NULL,
  frecuencia         VARCHAR(60) NULL,
  via                VARCHAR(20) NULL,
  inicio             DATE NOT NULL DEFAULT CURRENT_DATE,
  fin                DATE NULL,
  estado             VARCHAR(15) NOT NULL DEFAULT 'activo',
  prescrito_por      INTEGER NULL,
  CONSTRAINT chk_tratamientos_cronicos_estado CHECK (estado IN ('activo','suspendido','finalizado')),
  CONSTRAINT fk_tratamientos_cronicos_paciente FOREIGN KEY (paciente_cronico_id)
    REFERENCES prevencion.pacientes_cronicos(id) ON DELETE CASCADE,
  CONSTRAINT fk_tratamientos_cronicos_medicamento FOREIGN KEY (medicamento_id)
    REFERENCES historia_clinica.medicamentos(id) ON DELETE SET NULL,
  CONSTRAINT fk_tratamientos_cronicos_vet FOREIGN KEY (prescrito_por)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);

CREATE TABLE prevencion.adherencia_tratamiento (
  id                    INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  tratamiento_cronico_id INTEGER NOT NULL,
  periodo               VARCHAR(7) NOT NULL,      -- AAAA-MM
  dosis_esperadas       INTEGER NOT NULL DEFAULT 0,
  dosis_aplicadas       INTEGER NOT NULL DEFAULT 0,
  porcentaje            NUMERIC(5,2) NOT NULL DEFAULT 0,
  fuente                VARCHAR(20) NOT NULL DEFAULT 'propietario',
  registrado_en         TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_adherencia_tratamiento UNIQUE (tratamiento_cronico_id, periodo),
  CONSTRAINT chk_adherencia_fuente CHECK (fuente IN ('propietario','clinica','dispositivo','farmacia')),
  CONSTRAINT fk_adherencia_tratamiento FOREIGN KEY (tratamiento_cronico_id)
    REFERENCES prevencion.tratamientos_cronicos(id) ON DELETE CASCADE
);

CREATE TABLE prevencion.alertas_descompensacion (
  id                 INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  paciente_cronico_id INTEGER NOT NULL,
  medicion_id        INTEGER NULL,
  motivo             VARCHAR(180) NOT NULL,
  severidad          VARCHAR(10) NOT NULL DEFAULT 'media',
  generada_en        TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  atendida_en        TIMESTAMP(0) NULL,
  atendida_por       INTEGER NULL,
  estado             VARCHAR(15) NOT NULL DEFAULT 'abierta',
  CONSTRAINT chk_alertas_descomp_severidad CHECK (severidad IN ('baja','media','alta','critica')),
  CONSTRAINT chk_alertas_descomp_estado CHECK (estado IN ('abierta','vista','resuelta','descartada')),
  CONSTRAINT fk_alertas_descomp_paciente FOREIGN KEY (paciente_cronico_id)
    REFERENCES prevencion.pacientes_cronicos(id) ON DELETE CASCADE,
  CONSTRAINT fk_alertas_descomp_medicion FOREIGN KEY (medicion_id)
    REFERENCES prevencion.mediciones_periodicas(id) ON DELETE SET NULL,
  CONSTRAINT fk_alertas_descomp_usuario FOREIGN KEY (atendida_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_alertas_descompensacion ON prevencion.alertas_descompensacion (estado, severidad, generada_en DESC);


-- =====================================================================
--  MÓDULO 40 · GESTIÓN DE DONANTES  ·  MÓDULO 54 · BANCO DE SANGRE
--
--  Una unidad de sangre es trazable de punta a punta: qué donante la dio,
--  qué muestra se le sacó, dónde estuvo guardada, a qué paciente entró y
--  qué reacción tuvo. Por eso `unidades_sangre` cuelga de la donación y
--  la transfusión apunta a la unidad concreta, no al tipo de sangre.
-- =====================================================================

CREATE TABLE banco_sangre.tipos_sangre (
  id          SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  especie_id  SMALLINT NOT NULL,
  nombre      VARCHAR(30) NOT NULL,       -- DEA 1.1, DEA 1.2, A, B, AB…
  descripcion VARCHAR(180) NULL,
  universal   SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT uq_tipos_sangre UNIQUE (especie_id, nombre),
  CONSTRAINT chk_tipos_sangre_universal CHECK (universal IN (0,1)),
  CONSTRAINT fk_tipos_sangre_especie FOREIGN KEY (especie_id)
    REFERENCES mascotas.especies(id) ON DELETE CASCADE
);

CREATE TABLE banco_sangre.donantes_animales (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id     INTEGER NOT NULL,
  tipo_sangre_id SMALLINT NULL,
  fecha_alta     DATE NOT NULL DEFAULT CURRENT_DATE,
  ultima_donacion DATE NULL,
  donaciones_totales SMALLINT NOT NULL DEFAULT 0,
  apto           SMALLINT NOT NULL DEFAULT 1,
  estado         VARCHAR(15) NOT NULL DEFAULT 'activo',
  consentimiento SMALLINT NOT NULL DEFAULT 0,
  notas          TEXT NULL,
  CONSTRAINT uq_donantes_animales UNIQUE (mascota_id),
  CONSTRAINT chk_donantes_apto   CHECK (apto IN (0,1)),
  CONSTRAINT chk_donantes_consent CHECK (consentimiento IN (0,1)),
  CONSTRAINT chk_donantes_estado CHECK (estado IN ('activo','suspendido','retirado')),
  CONSTRAINT fk_donantes_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_donantes_tipo_sangre FOREIGN KEY (tipo_sangre_id)
    REFERENCES banco_sangre.tipos_sangre(id) ON DELETE SET NULL
);

CREATE TABLE banco_sangre.evaluaciones_donante (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  donante_id     INTEGER NOT NULL,
  veterinario_id INTEGER NULL,
  fecha          DATE NOT NULL DEFAULT CURRENT_DATE,
  peso_kg        NUMERIC(6,2) NULL,
  hematocrito    NUMERIC(5,2) NULL,
  hemoglobina    NUMERIC(5,2) NULL,
  temperatura_c  NUMERIC(4,1) NULL,
  serologia_ok   SMALLINT NOT NULL DEFAULT 1,
  apto           SMALLINT NOT NULL DEFAULT 1,
  motivo_rechazo VARCHAR(180) NULL,
  proxima_fecha  DATE NULL,
  CONSTRAINT chk_evaluaciones_donante_apto CHECK (apto IN (0,1)),
  CONSTRAINT chk_evaluaciones_donante_serologia CHECK (serologia_ok IN (0,1)),
  CONSTRAINT fk_evaluaciones_donante FOREIGN KEY (donante_id)
    REFERENCES banco_sangre.donantes_animales(id) ON DELETE CASCADE,
  CONSTRAINT fk_evaluaciones_donante_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);

CREATE TABLE banco_sangre.donaciones (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  donante_id    INTEGER NOT NULL,
  evaluacion_id INTEGER NULL,
  sede_id       SMALLINT NULL,
  fecha         TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  volumen_ml    NUMERIC(7,2) NOT NULL,
  duracion_min  SMALLINT NULL,
  responsable_id INTEGER NULL,
  estado        VARCHAR(15) NOT NULL DEFAULT 'completada',
  complicaciones TEXT NULL,
  CONSTRAINT chk_donaciones_estado CHECK (estado IN ('completada','interrumpida','descartada')),
  CONSTRAINT chk_donaciones_volumen CHECK (volumen_ml > 0),
  CONSTRAINT fk_donaciones_donante FOREIGN KEY (donante_id)
    REFERENCES banco_sangre.donantes_animales(id) ON DELETE CASCADE,
  CONSTRAINT fk_donaciones_evaluacion FOREIGN KEY (evaluacion_id)
    REFERENCES banco_sangre.evaluaciones_donante(id) ON DELETE SET NULL,
  CONSTRAINT fk_donaciones_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE SET NULL,
  CONSTRAINT fk_donaciones_usuario FOREIGN KEY (responsable_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_donaciones_fecha ON banco_sangre.donaciones (fecha DESC);

CREATE TABLE banco_sangre.muestras_sangre (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  donacion_id INTEGER NOT NULL,
  codigo      VARCHAR(40) NOT NULL,
  tipo        VARCHAR(20) NOT NULL DEFAULT 'serologia',
  volumen_ml  NUMERIC(6,2) NULL,
  tomada_en   TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  estado      VARCHAR(15) NOT NULL DEFAULT 'pendiente',
  resultado   TEXT NULL,
  CONSTRAINT uq_muestras_sangre UNIQUE (codigo),
  CONSTRAINT chk_muestras_sangre_tipo CHECK (tipo IN ('serologia','tipificacion','hemograma','cultivo')),
  CONSTRAINT chk_muestras_sangre_estado CHECK (estado IN ('pendiente','procesada','descartada')),
  CONSTRAINT fk_muestras_sangre_donacion FOREIGN KEY (donacion_id)
    REFERENCES banco_sangre.donaciones(id) ON DELETE CASCADE
);

CREATE TABLE banco_sangre.unidades_sangre (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  donacion_id    INTEGER NOT NULL,
  tipo_sangre_id SMALLINT NULL,
  codigo         VARCHAR(40) NOT NULL,
  componente     VARCHAR(25) NOT NULL DEFAULT 'sangre_total',
  volumen_ml     NUMERIC(7,2) NOT NULL,
  obtenida_en    TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  vence_en       DATE NOT NULL,
  estado         VARCHAR(15) NOT NULL DEFAULT 'disponible',
  sede_id        SMALLINT NULL,
  CONSTRAINT uq_unidades_sangre UNIQUE (codigo),
  CONSTRAINT chk_unidades_componente CHECK (componente IN (
    'sangre_total','concentrado_globular','plasma_fresco','plasma_congelado','plaquetas','crioprecipitado')),
  CONSTRAINT chk_unidades_estado CHECK (estado IN ('disponible','reservada','transfundida','vencida','descartada')),
  CONSTRAINT fk_unidades_donacion FOREIGN KEY (donacion_id)
    REFERENCES banco_sangre.donaciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_unidades_tipo_sangre FOREIGN KEY (tipo_sangre_id)
    REFERENCES banco_sangre.tipos_sangre(id) ON DELETE SET NULL,
  CONSTRAINT fk_unidades_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE SET NULL
);
CREATE INDEX idx_unidades_sangre_stock ON banco_sangre.unidades_sangre (estado, tipo_sangre_id, vence_en);

CREATE TABLE banco_sangre.almacenamiento_sangre (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  unidad_id     INTEGER NOT NULL,
  sede_id       SMALLINT NULL,
  nevera        VARCHAR(60) NOT NULL,
  posicion      VARCHAR(40) NULL,
  temperatura_c NUMERIC(4,1) NULL,
  ubicado_en    TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  retirado_en   TIMESTAMP(0) NULL,
  registrado_por INTEGER NULL,
  CONSTRAINT fk_almacenamiento_sangre_unidad FOREIGN KEY (unidad_id)
    REFERENCES banco_sangre.unidades_sangre(id) ON DELETE CASCADE,
  CONSTRAINT fk_almacenamiento_sangre_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE SET NULL,
  CONSTRAINT fk_almacenamiento_sangre_usuario FOREIGN KEY (registrado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE banco_sangre.solicitudes_transfusion (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id     INTEGER NOT NULL,
  veterinario_id INTEGER NULL,
  sede_id        SMALLINT NULL,
  tipo_sangre_id SMALLINT NULL,
  componente     VARCHAR(25) NOT NULL DEFAULT 'sangre_total',
  unidades       SMALLINT NOT NULL DEFAULT 1,
  urgencia       VARCHAR(10) NOT NULL DEFAULT 'programada',
  motivo         TEXT NULL,
  hematocrito    NUMERIC(5,2) NULL,
  estado         VARCHAR(15) NOT NULL DEFAULT 'pendiente',
  solicitada_en  TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  resuelta_en    TIMESTAMP(0) NULL,
  CONSTRAINT chk_solicitudes_transf_urgencia CHECK (urgencia IN ('programada','urgente','vital')),
  CONSTRAINT chk_solicitudes_transf_estado CHECK (estado IN ('pendiente','reservada','despachada','transfundida','cancelada')),
  CONSTRAINT fk_solicitudes_transf_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_solicitudes_transf_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_solicitudes_transf_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE SET NULL,
  CONSTRAINT fk_solicitudes_transf_tipo FOREIGN KEY (tipo_sangre_id)
    REFERENCES banco_sangre.tipos_sangre(id) ON DELETE SET NULL
);
CREATE INDEX idx_solicitudes_transfusion ON banco_sangre.solicitudes_transfusion (estado, urgencia, solicitada_en);

CREATE TABLE banco_sangre.pruebas_compatibilidad (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  solicitud_id INTEGER NULL,
  receptor_id  INTEGER NOT NULL,          -- mascota que va a recibir
  unidad_id    INTEGER NOT NULL,
  tipo_prueba  VARCHAR(25) NOT NULL DEFAULT 'crossmatch_mayor',
  resultado    VARCHAR(15) NOT NULL,
  aglutinacion VARCHAR(20) NULL,
  realizada_en TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  realizada_por INTEGER NULL,
  observaciones TEXT NULL,
  CONSTRAINT chk_pruebas_compat_tipo CHECK (tipo_prueba IN (
    'crossmatch_mayor','crossmatch_menor','tipificacion','autocontrol')),
  CONSTRAINT chk_pruebas_compat_resultado CHECK (resultado IN ('compatible','incompatible','dudoso')),
  CONSTRAINT fk_pruebas_compat_solicitud FOREIGN KEY (solicitud_id)
    REFERENCES banco_sangre.solicitudes_transfusion(id) ON DELETE SET NULL,
  CONSTRAINT fk_pruebas_compat_receptor FOREIGN KEY (receptor_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_pruebas_compat_unidad FOREIGN KEY (unidad_id)
    REFERENCES banco_sangre.unidades_sangre(id) ON DELETE CASCADE,
  CONSTRAINT fk_pruebas_compat_usuario FOREIGN KEY (realizada_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE banco_sangre.reservas_unidades (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  solicitud_id  INTEGER NOT NULL,
  unidad_id     INTEGER NOT NULL,
  reservada_en  TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  vence_reserva TIMESTAMP(0) NULL,
  estado        VARCHAR(15) NOT NULL DEFAULT 'activa',
  liberada_en   TIMESTAMP(0) NULL,
  reservada_por INTEGER NULL,
  CONSTRAINT uq_reservas_unidades UNIQUE (unidad_id, solicitud_id),
  CONSTRAINT chk_reservas_unidades_estado CHECK (estado IN ('activa','usada','liberada','vencida')),
  CONSTRAINT fk_reservas_solicitud FOREIGN KEY (solicitud_id)
    REFERENCES banco_sangre.solicitudes_transfusion(id) ON DELETE CASCADE,
  CONSTRAINT fk_reservas_unidad FOREIGN KEY (unidad_id)
    REFERENCES banco_sangre.unidades_sangre(id) ON DELETE CASCADE,
  CONSTRAINT fk_reservas_usuario FOREIGN KEY (reservada_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE banco_sangre.transfusiones (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id     INTEGER NOT NULL,
  unidad_id      INTEGER NOT NULL,
  solicitud_id   INTEGER NULL,
  hospitalizacion_id INTEGER NULL,
  veterinario_id INTEGER NULL,
  fecha          TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  volumen_ml     NUMERIC(7,2) NOT NULL,
  velocidad_ml_h NUMERIC(6,2) NULL,
  duracion_min   SMALLINT NULL,
  premedicacion  VARCHAR(180) NULL,
  resultado      VARCHAR(15) NOT NULL DEFAULT 'satisfactoria',
  observaciones  TEXT NULL,
  CONSTRAINT chk_transfusiones_resultado CHECK (resultado IN ('satisfactoria','con_reaccion','suspendida')),
  CONSTRAINT fk_transfusiones_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_transfusiones_unidad FOREIGN KEY (unidad_id)
    REFERENCES banco_sangre.unidades_sangre(id) ON DELETE CASCADE,
  CONSTRAINT fk_transfusiones_solicitud FOREIGN KEY (solicitud_id)
    REFERENCES banco_sangre.solicitudes_transfusion(id) ON DELETE SET NULL,
  CONSTRAINT fk_transfusiones_hosp FOREIGN KEY (hospitalizacion_id)
    REFERENCES historia_clinica.hospitalizaciones(id) ON DELETE SET NULL,
  CONSTRAINT fk_transfusiones_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_transfusiones_mascota ON banco_sangre.transfusiones (mascota_id, fecha DESC);

CREATE TABLE banco_sangre.reacciones_transfusion (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  transfusion_id INTEGER NOT NULL,
  tipo           VARCHAR(25) NOT NULL,
  severidad      VARCHAR(10) NOT NULL DEFAULT 'leve',
  minuto_inicio  SMALLINT NULL,
  signos         TEXT NOT NULL,
  manejo         TEXT NULL,
  desenlace      VARCHAR(20) NULL,
  registrada_por INTEGER NULL,
  CONSTRAINT chk_reacciones_transf_tipo CHECK (tipo IN (
    'hemolitica','febril','alergica','sobrecarga','contaminacion','otra')),
  CONSTRAINT chk_reacciones_transf_severidad CHECK (severidad IN ('leve','moderada','grave','mortal')),
  CONSTRAINT fk_reacciones_transf FOREIGN KEY (transfusion_id)
    REFERENCES banco_sangre.transfusiones(id) ON DELETE CASCADE,
  CONSTRAINT fk_reacciones_transf_usuario FOREIGN KEY (registrada_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

-- Stock por sede y componente. Es un consolidado: lo cierto son las unidades,
-- pero el tablero necesita responder "¿cuánto DEA 1.1 hay?" sin recorrerlas.
CREATE TABLE banco_sangre.niveles_stock_sangre (
  id                  INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id             SMALLINT NOT NULL,
  tipo_sangre_id      SMALLINT NOT NULL,
  componente          VARCHAR(25) NOT NULL DEFAULT 'sangre_total',
  unidades_disponibles SMALLINT NOT NULL DEFAULT 0,
  unidades_reservadas SMALLINT NOT NULL DEFAULT 0,
  minimo              SMALLINT NOT NULL DEFAULT 2,
  critico             SMALLINT NOT NULL DEFAULT 1,
  actualizado_en      TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_niveles_stock_sangre UNIQUE (sede_id, tipo_sangre_id, componente),
  CONSTRAINT fk_niveles_stock_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE CASCADE,
  CONSTRAINT fk_niveles_stock_tipo FOREIGN KEY (tipo_sangre_id)
    REFERENCES banco_sangre.tipos_sangre(id) ON DELETE CASCADE
);

CREATE TABLE banco_sangre.alertas_vencimiento_sangre (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  unidad_id     INTEGER NOT NULL,
  vence_en      DATE NOT NULL,
  dias_restantes SMALLINT NOT NULL,
  nivel         VARCHAR(10) NOT NULL DEFAULT 'aviso',
  generada_en   TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  atendida_en   TIMESTAMP(0) NULL,
  estado        VARCHAR(15) NOT NULL DEFAULT 'abierta',
  CONSTRAINT chk_alertas_venc_sangre_nivel CHECK (nivel IN ('aviso','critico','vencida')),
  CONSTRAINT chk_alertas_venc_sangre_estado CHECK (estado IN ('abierta','vista','resuelta')),
  CONSTRAINT fk_alertas_venc_sangre_unidad FOREIGN KEY (unidad_id)
    REFERENCES banco_sangre.unidades_sangre(id) ON DELETE CASCADE
);

CREATE TABLE banco_sangre.emergencias_transfusion (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  solicitud_id  INTEGER NULL,
  mascota_id    INTEGER NOT NULL,
  sede_id       SMALLINT NULL,
  tipo_sangre_id SMALLINT NULL,
  activada_en   TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  motivo        TEXT NOT NULL,
  donantes_convocados SMALLINT NOT NULL DEFAULT 0,
  resuelta_en   TIMESTAMP(0) NULL,
  desenlace     VARCHAR(20) NULL,
  activada_por  INTEGER NULL,
  CONSTRAINT chk_emergencias_transf_desenlace CHECK (desenlace IS NULL OR desenlace IN (
    'transfundido','sin_unidades','no_requerido','fallecido')),
  CONSTRAINT fk_emergencias_transf_solicitud FOREIGN KEY (solicitud_id)
    REFERENCES banco_sangre.solicitudes_transfusion(id) ON DELETE SET NULL,
  CONSTRAINT fk_emergencias_transf_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_emergencias_transf_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE SET NULL,
  CONSTRAINT fk_emergencias_transf_tipo FOREIGN KEY (tipo_sangre_id)
    REFERENCES banco_sangre.tipos_sangre(id) ON DELETE SET NULL,
  CONSTRAINT fk_emergencias_transf_usuario FOREIGN KEY (activada_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);


-- =====================================================================
--  MÓDULO 41 · BANCO DE TEJIDOS
--
--  Mismo principio que el banco de sangre pero con tejidos (córnea, hueso,
--  piel, membrana amniótica): cadena de frío documentada y una muestra que
--  se puede seguir hasta el procedimiento en que se usó.
-- =====================================================================

CREATE TABLE banco_tejidos.tejidos (
  id             SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre         VARCHAR(80) NOT NULL,
  categoria      VARCHAR(25) NOT NULL DEFAULT 'otro',
  conservacion   VARCHAR(25) NOT NULL DEFAULT 'congelado',
  vida_util_dias SMALLINT NULL,
  descripcion    TEXT NULL,
  activo         SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_tejidos_nombre UNIQUE (nombre),
  CONSTRAINT chk_tejidos_categoria CHECK (categoria IN (
    'oseo','corneal','cutaneo','amniotico','tendinoso','cartilaginoso','otro')),
  CONSTRAINT chk_tejidos_conservacion CHECK (conservacion IN (
    'refrigerado','congelado','criopreservado','liofilizado','glicerinado')),
  CONSTRAINT chk_tejidos_activo CHECK (activo IN (0,1))
);

CREATE TABLE banco_tejidos.donantes_tejidos (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id     INTEGER NULL,
  tipo_donante   VARCHAR(15) NOT NULL DEFAULT 'vivo',
  consentimiento SMALLINT NOT NULL DEFAULT 0,
  fecha_registro DATE NOT NULL DEFAULT CURRENT_DATE,
  causa_muerte   VARCHAR(180) NULL,
  serologia_ok   SMALLINT NULL,
  estado         VARCHAR(15) NOT NULL DEFAULT 'activo',
  notas          TEXT NULL,
  CONSTRAINT chk_donantes_tejidos_tipo CHECK (tipo_donante IN ('vivo','cadaverico')),
  CONSTRAINT chk_donantes_tejidos_consent CHECK (consentimiento IN (0,1)),
  CONSTRAINT chk_donantes_tejidos_estado CHECK (estado IN ('activo','descartado','agotado')),
  CONSTRAINT fk_donantes_tejidos_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE SET NULL
);

CREATE TABLE banco_tejidos.muestras_tejido (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  donante_id   INTEGER NOT NULL,
  tejido_id    SMALLINT NOT NULL,
  codigo       VARCHAR(40) NOT NULL,
  obtenida_en  TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  obtenida_por INTEGER NULL,
  medida       VARCHAR(60) NULL,          -- cm², mm, unidades…
  vence_en     DATE NULL,
  serologia    VARCHAR(20) NULL,
  estado       VARCHAR(15) NOT NULL DEFAULT 'disponible',
  CONSTRAINT uq_muestras_tejido UNIQUE (codigo),
  CONSTRAINT chk_muestras_tejido_estado CHECK (estado IN (
    'cuarentena','disponible','reservada','usada','vencida','descartada')),
  CONSTRAINT fk_muestras_tejido_donante FOREIGN KEY (donante_id)
    REFERENCES banco_tejidos.donantes_tejidos(id) ON DELETE CASCADE,
  CONSTRAINT fk_muestras_tejido_tejido FOREIGN KEY (tejido_id)
    REFERENCES banco_tejidos.tejidos(id) ON DELETE CASCADE,
  CONSTRAINT fk_muestras_tejido_usuario FOREIGN KEY (obtenida_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_muestras_tejido_estado ON banco_tejidos.muestras_tejido (estado, vence_en);

CREATE TABLE banco_tejidos.almacenamiento_tejidos (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  muestra_id    INTEGER NOT NULL,
  sede_id       SMALLINT NULL,
  contenedor    VARCHAR(60) NOT NULL,
  posicion      VARCHAR(40) NULL,
  metodo        VARCHAR(25) NOT NULL DEFAULT 'congelado',
  temperatura_c NUMERIC(5,1) NULL,
  ingresado_en  TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  retirado_en   TIMESTAMP(0) NULL,
  registrado_por INTEGER NULL,
  CONSTRAINT chk_almacenamiento_tejidos_metodo CHECK (metodo IN (
    'refrigerado','congelado','criopreservado','liofilizado','glicerinado')),
  CONSTRAINT fk_almacenamiento_tejidos_muestra FOREIGN KEY (muestra_id)
    REFERENCES banco_tejidos.muestras_tejido(id) ON DELETE CASCADE,
  CONSTRAINT fk_almacenamiento_tejidos_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE SET NULL,
  CONSTRAINT fk_almacenamiento_tejidos_usuario FOREIGN KEY (registrado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE banco_tejidos.disponibilidad_tejidos (
  id                   INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  tejido_id            SMALLINT NOT NULL,
  sede_id              SMALLINT NOT NULL,
  unidades_disponibles SMALLINT NOT NULL DEFAULT 0,
  unidades_reservadas  SMALLINT NOT NULL DEFAULT 0,
  minimo               SMALLINT NOT NULL DEFAULT 1,
  actualizado_en       TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_disponibilidad_tejidos UNIQUE (tejido_id, sede_id),
  CONSTRAINT fk_disponibilidad_tejidos_tejido FOREIGN KEY (tejido_id)
    REFERENCES banco_tejidos.tejidos(id) ON DELETE CASCADE,
  CONSTRAINT fk_disponibilidad_tejidos_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE CASCADE
);

CREATE TABLE banco_tejidos.procedimientos_tejidos (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id     INTEGER NOT NULL,
  muestra_id     INTEGER NOT NULL,
  cirugia_id     INTEGER NULL,
  veterinario_id INTEGER NULL,
  fecha          TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  tipo           VARCHAR(25) NOT NULL DEFAULT 'injerto',
  descripcion    TEXT NULL,
  resultado      VARCHAR(20) NULL,
  complicaciones TEXT NULL,
  CONSTRAINT chk_procedimientos_tejidos_tipo CHECK (tipo IN (
    'injerto','implante','reconstruccion','recubrimiento','otro')),
  CONSTRAINT fk_proc_tejidos_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_proc_tejidos_muestra FOREIGN KEY (muestra_id)
    REFERENCES banco_tejidos.muestras_tejido(id) ON DELETE CASCADE,
  CONSTRAINT fk_proc_tejidos_cirugia FOREIGN KEY (cirugia_id)
    REFERENCES historia_clinica.cirugias(id) ON DELETE SET NULL,
  CONSTRAINT fk_proc_tejidos_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);


-- =====================================================================
--  MÓDULO 42 · ODONTOLOGÍA VETERINARIA
--
--  El odontograma no es un dibujo: es una fila por pieza y evaluación.
--  Guardado así se puede comparar la misma pieza entre dos visitas, que
--  es justo lo que decide si una extracción se adelanta o se espera.
-- =====================================================================

CREATE TABLE odontologia.piezas_dentales (
  id         SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  especie_id SMALLINT NOT NULL,
  codigo     VARCHAR(10) NOT NULL,        -- numeración Triadan (104, 208…)
  nombre     VARCHAR(60) NOT NULL,
  cuadrante  SMALLINT NOT NULL,
  tipo       VARCHAR(15) NOT NULL,
  raices     SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_piezas_dentales UNIQUE (especie_id, codigo),
  CONSTRAINT chk_piezas_dentales_tipo CHECK (tipo IN ('incisivo','canino','premolar','molar')),
  CONSTRAINT chk_piezas_dentales_cuadrante CHECK (cuadrante BETWEEN 1 AND 4),
  CONSTRAINT fk_piezas_dentales_especie FOREIGN KEY (especie_id)
    REFERENCES mascotas.especies(id) ON DELETE CASCADE
);

CREATE TABLE odontologia.enfermedades_orales (
  id          SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre      VARCHAR(120) NOT NULL,
  codigo      VARCHAR(20) NULL,
  categoria   VARCHAR(25) NOT NULL DEFAULT 'periodontal',
  descripcion TEXT NULL,
  CONSTRAINT uq_enfermedades_orales UNIQUE (nombre),
  CONSTRAINT chk_enfermedades_orales_categoria CHECK (categoria IN (
    'periodontal','endodontica','ortodontica','oncologica','traumatica','congenita','otra'))
);

CREATE TABLE odontologia.evaluaciones_dentales (
  id              INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id      INTEGER NOT NULL,
  consulta_id     INTEGER NULL,
  veterinario_id  INTEGER NULL,
  fecha           DATE NOT NULL DEFAULT CURRENT_DATE,
  motivo          VARCHAR(180) NULL,
  grado_enfermedad SMALLINT NOT NULL DEFAULT 0,   -- 0 sano … 4 avanzado
  sarro           SMALLINT NOT NULL DEFAULT 0,
  gingivitis      SMALLINT NOT NULL DEFAULT 0,
  halitosis       SMALLINT NOT NULL DEFAULT 0,
  movilidad_general SMALLINT NOT NULL DEFAULT 0,
  observaciones   TEXT NULL,
  proxima_fecha   DATE NULL,
  CONSTRAINT chk_evaluaciones_dentales_grado CHECK (grado_enfermedad BETWEEN 0 AND 4),
  CONSTRAINT chk_evaluaciones_dentales_halitosis CHECK (halitosis IN (0,1)),
  CONSTRAINT fk_evaluaciones_dentales_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_evaluaciones_dentales_consulta FOREIGN KEY (consulta_id)
    REFERENCES historia_clinica.consultas(id) ON DELETE SET NULL,
  CONSTRAINT fk_evaluaciones_dentales_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_evaluaciones_dentales_mascota ON odontologia.evaluaciones_dentales (mascota_id, fecha DESC);

-- Una fila por pieza revisada. El "odontograma" de una visita es el conjunto
-- de filas con la misma evaluacion_id.
CREATE TABLE odontologia.odontogramas (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  evaluacion_id  INTEGER NOT NULL,
  mascota_id     INTEGER NOT NULL,
  pieza_id       SMALLINT NOT NULL,
  enfermedad_id  SMALLINT NULL,
  hallazgo       VARCHAR(120) NULL,
  movilidad      SMALLINT NOT NULL DEFAULT 0,
  bolsa_mm       NUMERIC(4,1) NULL,
  recesion_mm    NUMERIC(4,1) NULL,
  fractura       SMALLINT NOT NULL DEFAULT 0,
  ausente        SMALLINT NOT NULL DEFAULT 0,
  tratamiento_sugerido VARCHAR(120) NULL,
  CONSTRAINT uq_odontogramas UNIQUE (evaluacion_id, pieza_id),
  CONSTRAINT chk_odontogramas_movilidad CHECK (movilidad BETWEEN 0 AND 3),
  CONSTRAINT chk_odontogramas_fractura CHECK (fractura IN (0,1)),
  CONSTRAINT chk_odontogramas_ausente  CHECK (ausente IN (0,1)),
  CONSTRAINT fk_odontogramas_evaluacion FOREIGN KEY (evaluacion_id)
    REFERENCES odontologia.evaluaciones_dentales(id) ON DELETE CASCADE,
  CONSTRAINT fk_odontogramas_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_odontogramas_pieza FOREIGN KEY (pieza_id)
    REFERENCES odontologia.piezas_dentales(id) ON DELETE CASCADE,
  CONSTRAINT fk_odontogramas_enfermedad FOREIGN KEY (enfermedad_id)
    REFERENCES odontologia.enfermedades_orales(id) ON DELETE SET NULL
);
CREATE INDEX idx_odontogramas_mascota ON odontologia.odontogramas (mascota_id, pieza_id);

CREATE TABLE odontologia.limpiezas_dentales (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id     INTEGER NOT NULL,
  evaluacion_id  INTEGER NULL,
  veterinario_id INTEGER NULL,
  fecha          DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo           VARCHAR(20) NOT NULL DEFAULT 'profilaxis',
  anestesia      SMALLINT NOT NULL DEFAULT 1,
  duracion_min   SMALLINT NULL,
  hallazgos      TEXT NULL,
  recomendaciones TEXT NULL,
  proxima_fecha  DATE NULL,
  CONSTRAINT chk_limpiezas_dentales_tipo CHECK (tipo IN ('profilaxis','tartrectomia','pulido','completa')),
  CONSTRAINT chk_limpiezas_dentales_anestesia CHECK (anestesia IN (0,1)),
  CONSTRAINT fk_limpiezas_dentales_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_limpiezas_dentales_evaluacion FOREIGN KEY (evaluacion_id)
    REFERENCES odontologia.evaluaciones_dentales(id) ON DELETE SET NULL,
  CONSTRAINT fk_limpiezas_dentales_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);

CREATE TABLE odontologia.procedimientos_dentales (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id     INTEGER NOT NULL,
  evaluacion_id  INTEGER NULL,
  pieza_id       SMALLINT NULL,
  cirugia_id     INTEGER NULL,
  veterinario_id INTEGER NULL,
  fecha          DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo           VARCHAR(25) NOT NULL,
  descripcion    TEXT NULL,
  resultado      VARCHAR(20) NULL,
  complicaciones TEXT NULL,
  CONSTRAINT chk_procedimientos_dentales_tipo CHECK (tipo IN (
    'extraccion','endodoncia','obturacion','sellado','ferulizacion','biopsia','cirugia_oral','otro')),
  CONSTRAINT fk_proc_dentales_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_proc_dentales_evaluacion FOREIGN KEY (evaluacion_id)
    REFERENCES odontologia.evaluaciones_dentales(id) ON DELETE SET NULL,
  CONSTRAINT fk_proc_dentales_pieza FOREIGN KEY (pieza_id)
    REFERENCES odontologia.piezas_dentales(id) ON DELETE SET NULL,
  CONSTRAINT fk_proc_dentales_cirugia FOREIGN KEY (cirugia_id)
    REFERENCES historia_clinica.cirugias(id) ON DELETE SET NULL,
  CONSTRAINT fk_proc_dentales_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_proc_dentales_mascota ON odontologia.procedimientos_dentales (mascota_id, fecha DESC);

CREATE TABLE odontologia.controles_dentales (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id     INTEGER NOT NULL,
  procedimiento_id INTEGER NULL,
  fecha_prevista DATE NOT NULL,
  motivo         VARCHAR(180) NULL,
  realizado_en   DATE NULL,
  hallazgos      TEXT NULL,
  estado         VARCHAR(15) NOT NULL DEFAULT 'pendiente',
  CONSTRAINT chk_controles_dentales_estado CHECK (estado IN ('pendiente','cumplido','vencido','cancelado')),
  CONSTRAINT fk_controles_dentales_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_controles_dentales_proc FOREIGN KEY (procedimiento_id)
    REFERENCES odontologia.procedimientos_dentales(id) ON DELETE SET NULL
);


-- =====================================================================
--  MÓDULO 43 · CARDIOLOGÍA
--
--  Los estudios cardíacos se guardan con sus MEDIDAS separadas del texto:
--  un informe en prosa no permite dibujar la evolución de la fracción de
--  acortamiento, y esa curva es la que dice si el tratamiento sirve.
-- =====================================================================

CREATE TABLE cardiologia.evaluaciones_cardiacas (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id     INTEGER NOT NULL,
  consulta_id    INTEGER NULL,
  veterinario_id INTEGER NULL,
  fecha          DATE NOT NULL DEFAULT CURRENT_DATE,
  motivo         VARCHAR(180) NULL,
  frec_cardiaca  SMALLINT NULL,
  ritmo          VARCHAR(25) NULL,
  soplo_grado    SMALLINT NULL,
  punto_maximo   VARCHAR(30) NULL,
  pulso          VARCHAR(25) NULL,
  presion_sistolica  SMALLINT NULL,
  presion_diastolica SMALLINT NULL,
  clase_funcional VARCHAR(5) NULL,        -- ISACHC / ACVIM: A, B1, B2, C, D
  observaciones  TEXT NULL,
  CONSTRAINT chk_evaluaciones_card_soplo CHECK (soplo_grado IS NULL OR soplo_grado BETWEEN 0 AND 6),
  CONSTRAINT chk_evaluaciones_card_clase CHECK (clase_funcional IS NULL OR clase_funcional IN ('A','B1','B2','C','D')),
  CONSTRAINT fk_evaluaciones_card_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_evaluaciones_card_consulta FOREIGN KEY (consulta_id)
    REFERENCES historia_clinica.consultas(id) ON DELETE SET NULL,
  CONSTRAINT fk_evaluaciones_card_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_evaluaciones_cardiacas ON cardiologia.evaluaciones_cardiacas (mascota_id, fecha DESC);

CREATE TABLE cardiologia.electrocardiogramas (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  evaluacion_id  INTEGER NULL,
  mascota_id     INTEGER NOT NULL,
  fecha          TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  derivacion     VARCHAR(20) NULL,
  frecuencia     SMALLINT NULL,
  ritmo          VARCHAR(30) NULL,
  onda_p_ms      SMALLINT NULL,
  intervalo_pr_ms SMALLINT NULL,
  qrs_ms         SMALLINT NULL,
  intervalo_qt_ms SMALLINT NULL,
  eje_electrico  SMALLINT NULL,
  interpretacion TEXT NULL,
  archivo        VARCHAR(255) NULL,
  realizado_por  INTEGER NULL,
  CONSTRAINT fk_ecg_evaluacion FOREIGN KEY (evaluacion_id)
    REFERENCES cardiologia.evaluaciones_cardiacas(id) ON DELETE SET NULL,
  CONSTRAINT fk_ecg_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_ecg_vet FOREIGN KEY (realizado_por)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);

CREATE TABLE cardiologia.ecocardiogramas (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  evaluacion_id  INTEGER NULL,
  mascota_id     INTEGER NOT NULL,
  fecha          TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  modo           VARCHAR(20) NULL,
  ai_ao          NUMERIC(4,2) NULL,       -- relación aurícula izquierda / aorta
  dvid_mm        NUMERIC(5,2) NULL,
  dvis_mm        NUMERIC(5,2) NULL,
  fraccion_acortamiento NUMERIC(5,2) NULL,
  fraccion_eyeccion     NUMERIC(5,2) NULL,
  insuficiencias VARCHAR(120) NULL,
  derrame        SMALLINT NOT NULL DEFAULT 0,
  interpretacion TEXT NULL,
  archivo        VARCHAR(255) NULL,
  realizado_por  INTEGER NULL,
  CONSTRAINT chk_eco_derrame CHECK (derrame IN (0,1)),
  CONSTRAINT fk_eco_evaluacion FOREIGN KEY (evaluacion_id)
    REFERENCES cardiologia.evaluaciones_cardiacas(id) ON DELETE SET NULL,
  CONSTRAINT fk_eco_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_eco_vet FOREIGN KEY (realizado_por)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);

CREATE TABLE cardiologia.estudios_cardiacos (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id     INTEGER NOT NULL,
  evaluacion_id  INTEGER NULL,
  tipo           VARCHAR(25) NOT NULL,
  solicitado_por INTEGER NULL,
  fecha          DATE NOT NULL DEFAULT CURRENT_DATE,
  estado         VARCHAR(15) NOT NULL DEFAULT 'solicitado',
  conclusion     TEXT NULL,
  archivo        VARCHAR(255) NULL,
  CONSTRAINT chk_estudios_cardiacos_tipo CHECK (tipo IN (
    'holter','presion_arterial','radiografia_torax','prueba_esfuerzo','biomarcadores','otro')),
  CONSTRAINT chk_estudios_cardiacos_estado CHECK (estado IN ('solicitado','en_proceso','informado','anulado')),
  CONSTRAINT fk_estudios_card_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_estudios_card_evaluacion FOREIGN KEY (evaluacion_id)
    REFERENCES cardiologia.evaluaciones_cardiacas(id) ON DELETE SET NULL,
  CONSTRAINT fk_estudios_card_vet FOREIGN KEY (solicitado_por)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);

CREATE TABLE cardiologia.resultados_cardiacos (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  estudio_id  INTEGER NOT NULL,
  parametro   VARCHAR(80) NOT NULL,
  valor       VARCHAR(60) NOT NULL,
  unidad      VARCHAR(20) NULL,
  referencia  VARCHAR(60) NULL,
  fuera_rango SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT chk_resultados_cardiacos_rango CHECK (fuera_rango IN (0,1)),
  CONSTRAINT fk_resultados_cardiacos_estudio FOREIGN KEY (estudio_id)
    REFERENCES cardiologia.estudios_cardiacos(id) ON DELETE CASCADE
);

CREATE TABLE cardiologia.seguimiento_cardiaco (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id     INTEGER NOT NULL,
  evaluacion_id  INTEGER NULL,
  fecha          DATE NOT NULL DEFAULT CURRENT_DATE,
  clase_funcional VARCHAR(5) NULL,
  tratamiento    TEXT NULL,
  evolucion      VARCHAR(20) NOT NULL DEFAULT 'estable',
  tolerancia_ejercicio VARCHAR(20) NULL,
  proxima_fecha  DATE NULL,
  veterinario_id INTEGER NULL,
  CONSTRAINT chk_seguimiento_card_evolucion CHECK (evolucion IN ('mejora','estable','deterioro')),
  CONSTRAINT fk_seguimiento_card_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_seguimiento_card_evaluacion FOREIGN KEY (evaluacion_id)
    REFERENCES cardiologia.evaluaciones_cardiacas(id) ON DELETE SET NULL,
  CONSTRAINT fk_seguimiento_card_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);


-- =====================================================================
--  MÓDULO 44 · DERMATOLOGÍA
--
--  La dermatología se sigue con fotos y con una escala de prurito. Las
--  lesiones se ubican en una zona corporal concreta para poder decir
--  "la misma mancha del flanco derecho", no "una mancha".
-- =====================================================================

CREATE TABLE dermatologia.zonas_corporales (
  id         SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  especie_id SMALLINT NULL,
  nombre     VARCHAR(60) NOT NULL,
  region     VARCHAR(30) NOT NULL DEFAULT 'tronco',
  codigo     VARCHAR(10) NULL,
  CONSTRAINT uq_zonas_corporales UNIQUE (especie_id, nombre),
  CONSTRAINT chk_zonas_corporales_region CHECK (region IN (
    'cabeza','cuello','tronco','dorso','abdomen','extremidades','cola','perianal','generalizada')),
  CONSTRAINT fk_zonas_corporales_especie FOREIGN KEY (especie_id)
    REFERENCES mascotas.especies(id) ON DELETE CASCADE
);

CREATE TABLE dermatologia.evaluaciones_dermatologicas (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id     INTEGER NOT NULL,
  consulta_id    INTEGER NULL,
  veterinario_id INTEGER NULL,
  fecha          DATE NOT NULL DEFAULT CURRENT_DATE,
  motivo         VARCHAR(180) NULL,
  prurito_escala SMALLINT NULL,           -- 0 a 10
  distribucion   VARCHAR(60) NULL,
  tiempo_evolucion VARCHAR(60) NULL,
  estacionalidad SMALLINT NOT NULL DEFAULT 0,
  diagnostico_presuntivo VARCHAR(180) NULL,
  observaciones  TEXT NULL,
  CONSTRAINT chk_evaluaciones_derm_prurito CHECK (prurito_escala IS NULL OR prurito_escala BETWEEN 0 AND 10),
  CONSTRAINT chk_evaluaciones_derm_estacional CHECK (estacionalidad IN (0,1)),
  CONSTRAINT fk_evaluaciones_derm_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_evaluaciones_derm_consulta FOREIGN KEY (consulta_id)
    REFERENCES historia_clinica.consultas(id) ON DELETE SET NULL,
  CONSTRAINT fk_evaluaciones_derm_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_evaluaciones_derm_mascota ON dermatologia.evaluaciones_dermatologicas (mascota_id, fecha DESC);

CREATE TABLE dermatologia.lesiones (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  evaluacion_id INTEGER NOT NULL,
  mascota_id    INTEGER NOT NULL,
  zona_id       SMALLINT NULL,
  tipo          VARCHAR(25) NOT NULL,
  primaria      SMALLINT NOT NULL DEFAULT 1,
  tamano_mm     NUMERIC(6,1) NULL,
  cantidad      SMALLINT NULL,
  descripcion   TEXT NULL,
  CONSTRAINT chk_lesiones_tipo CHECK (tipo IN (
    'macula','papula','pustula','vesicula','nodulo','placa','costra','escama',
    'alopecia','erosion','ulcera','liquenificacion','hiperpigmentacion','otra')),
  CONSTRAINT chk_lesiones_primaria CHECK (primaria IN (0,1)),
  CONSTRAINT fk_lesiones_evaluacion FOREIGN KEY (evaluacion_id)
    REFERENCES dermatologia.evaluaciones_dermatologicas(id) ON DELETE CASCADE,
  CONSTRAINT fk_lesiones_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_lesiones_zona FOREIGN KEY (zona_id)
    REFERENCES dermatologia.zonas_corporales(id) ON DELETE SET NULL
);

CREATE TABLE dermatologia.pruebas_dermatologicas (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  evaluacion_id INTEGER NULL,
  mascota_id    INTEGER NOT NULL,
  zona_id       SMALLINT NULL,
  tipo          VARCHAR(30) NOT NULL,
  fecha         DATE NOT NULL DEFAULT CURRENT_DATE,
  laboratorio   VARCHAR(120) NULL,
  resultado     TEXT NULL,
  positivo      SMALLINT NULL,
  archivo       VARCHAR(255) NULL,
  CONSTRAINT chk_pruebas_derm_tipo CHECK (tipo IN (
    'raspado','citologia','tricograma','cultivo_hongos','cultivo_bacteriano',
    'biopsia','intradermorreaccion','serologia_alergenos','lampara_wood','otra')),
  CONSTRAINT chk_pruebas_derm_positivo CHECK (positivo IS NULL OR positivo IN (0,1)),
  CONSTRAINT fk_pruebas_derm_evaluacion FOREIGN KEY (evaluacion_id)
    REFERENCES dermatologia.evaluaciones_dermatologicas(id) ON DELETE SET NULL,
  CONSTRAINT fk_pruebas_derm_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_pruebas_derm_zona FOREIGN KEY (zona_id)
    REFERENCES dermatologia.zonas_corporales(id) ON DELETE SET NULL
);

CREATE TABLE dermatologia.tratamientos_dermatologicos (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  evaluacion_id INTEGER NULL,
  mascota_id    INTEGER NOT NULL,
  tipo          VARCHAR(20) NOT NULL DEFAULT 'topico',
  producto      VARCHAR(140) NOT NULL,
  medicamento_id INTEGER NULL,
  dosis         VARCHAR(80) NULL,
  frecuencia    VARCHAR(60) NULL,
  inicio        DATE NOT NULL DEFAULT CURRENT_DATE,
  fin           DATE NULL,
  estado        VARCHAR(15) NOT NULL DEFAULT 'activo',
  respuesta     VARCHAR(20) NULL,
  CONSTRAINT chk_tratamientos_derm_tipo CHECK (tipo IN ('topico','sistemico','bano','dieta','inmunoterapia','otro')),
  CONSTRAINT chk_tratamientos_derm_estado CHECK (estado IN ('activo','suspendido','finalizado')),
  CONSTRAINT fk_tratamientos_derm_evaluacion FOREIGN KEY (evaluacion_id)
    REFERENCES dermatologia.evaluaciones_dermatologicas(id) ON DELETE SET NULL,
  CONSTRAINT fk_tratamientos_derm_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_tratamientos_derm_medicamento FOREIGN KEY (medicamento_id)
    REFERENCES historia_clinica.medicamentos(id) ON DELETE SET NULL
);

CREATE TABLE dermatologia.fotografias_dermatologicas (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id    INTEGER NOT NULL,
  evaluacion_id INTEGER NULL,
  lesion_id     INTEGER NULL,
  zona_id       SMALLINT NULL,
  archivo       VARCHAR(255) NOT NULL,
  tomada_en     TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  descripcion   VARCHAR(180) NULL,
  subida_por    INTEGER NULL,
  CONSTRAINT fk_fotos_derm_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_fotos_derm_evaluacion FOREIGN KEY (evaluacion_id)
    REFERENCES dermatologia.evaluaciones_dermatologicas(id) ON DELETE SET NULL,
  CONSTRAINT fk_fotos_derm_lesion FOREIGN KEY (lesion_id)
    REFERENCES dermatologia.lesiones(id) ON DELETE SET NULL,
  CONSTRAINT fk_fotos_derm_zona FOREIGN KEY (zona_id)
    REFERENCES dermatologia.zonas_corporales(id) ON DELETE SET NULL,
  CONSTRAINT fk_fotos_derm_usuario FOREIGN KEY (subida_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_fotos_derm_mascota ON dermatologia.fotografias_dermatologicas (mascota_id, tomada_en DESC);

CREATE TABLE dermatologia.seguimiento_dermatologico (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id     INTEGER NOT NULL,
  evaluacion_id  INTEGER NULL,
  fecha          DATE NOT NULL DEFAULT CURRENT_DATE,
  prurito_escala SMALLINT NULL,
  evolucion      VARCHAR(20) NOT NULL DEFAULT 'estable',
  ajuste_tratamiento TEXT NULL,
  proxima_fecha  DATE NULL,
  veterinario_id INTEGER NULL,
  CONSTRAINT chk_seguimiento_derm_prurito CHECK (prurito_escala IS NULL OR prurito_escala BETWEEN 0 AND 10),
  CONSTRAINT chk_seguimiento_derm_evolucion CHECK (evolucion IN ('mejora','estable','deterioro','recaida')),
  CONSTRAINT fk_seguimiento_derm_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_seguimiento_derm_evaluacion FOREIGN KEY (evaluacion_id)
    REFERENCES dermatologia.evaluaciones_dermatologicas(id) ON DELETE SET NULL,
  CONSTRAINT fk_seguimiento_derm_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);


-- =====================================================================
--  MÓDULO 45 · OFTALMOLOGÍA
--
--  Todo se registra por OJO. Guardar "presión 22" sin decir cuál es
--  inservible: el glaucoma casi siempre empieza en uno solo.
-- =====================================================================

CREATE TABLE oftalmologia.enfermedades_oculares (
  id          SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre      VARCHAR(120) NOT NULL,
  codigo      VARCHAR(20) NULL,
  categoria   VARCHAR(25) NOT NULL DEFAULT 'otra',
  hereditaria SMALLINT NOT NULL DEFAULT 0,
  descripcion TEXT NULL,
  CONSTRAINT uq_enfermedades_oculares UNIQUE (nombre),
  CONSTRAINT chk_enfermedades_oculares_categoria CHECK (categoria IN (
    'corneal','cristalino','retiniana','glaucoma','parpados','lagrimal','uveal','otra')),
  CONSTRAINT chk_enfermedades_oculares_hereditaria CHECK (hereditaria IN (0,1))
);

CREATE TABLE oftalmologia.evaluaciones_oculares (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id     INTEGER NOT NULL,
  consulta_id    INTEGER NULL,
  veterinario_id INTEGER NULL,
  fecha          DATE NOT NULL DEFAULT CURRENT_DATE,
  motivo         VARCHAR(180) NULL,
  ojo_afectado   VARCHAR(10) NOT NULL DEFAULT 'ambos',
  reflejo_pupilar_od VARCHAR(20) NULL,
  reflejo_pupilar_oi VARCHAR(20) NULL,
  presion_od     SMALLINT NULL,
  presion_oi     SMALLINT NULL,
  fondo_ojo      TEXT NULL,
  observaciones  TEXT NULL,
  CONSTRAINT chk_evaluaciones_oculares_ojo CHECK (ojo_afectado IN ('od','oi','ambos')),
  CONSTRAINT fk_evaluaciones_oculares_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_evaluaciones_oculares_consulta FOREIGN KEY (consulta_id)
    REFERENCES historia_clinica.consultas(id) ON DELETE SET NULL,
  CONSTRAINT fk_evaluaciones_oculares_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_evaluaciones_oculares ON oftalmologia.evaluaciones_oculares (mascota_id, fecha DESC);

CREATE TABLE oftalmologia.pruebas_visuales (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  evaluacion_id INTEGER NULL,
  mascota_id    INTEGER NOT NULL,
  tipo          VARCHAR(25) NOT NULL,
  ojo           VARCHAR(5) NOT NULL DEFAULT 'od',
  valor         NUMERIC(8,2) NULL,
  unidad        VARCHAR(15) NULL,
  resultado     VARCHAR(30) NULL,
  fecha         DATE NOT NULL DEFAULT CURRENT_DATE,
  CONSTRAINT chk_pruebas_visuales_tipo CHECK (tipo IN (
    'schirmer','fluoresceina','tonometria','amenaza','deslumbramiento','rosa_bengala','electroretinografia','otra')),
  CONSTRAINT chk_pruebas_visuales_ojo CHECK (ojo IN ('od','oi')),
  CONSTRAINT fk_pruebas_visuales_evaluacion FOREIGN KEY (evaluacion_id)
    REFERENCES oftalmologia.evaluaciones_oculares(id) ON DELETE SET NULL,
  CONSTRAINT fk_pruebas_visuales_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE
);

CREATE TABLE oftalmologia.tratamientos_oculares (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  evaluacion_id INTEGER NULL,
  mascota_id    INTEGER NOT NULL,
  enfermedad_id SMALLINT NULL,
  ojo           VARCHAR(10) NOT NULL DEFAULT 'ambos',
  tipo          VARCHAR(20) NOT NULL DEFAULT 'topico',
  producto      VARCHAR(140) NOT NULL,
  medicamento_id INTEGER NULL,
  dosis         VARCHAR(80) NULL,
  frecuencia    VARCHAR(60) NULL,
  inicio        DATE NOT NULL DEFAULT CURRENT_DATE,
  fin           DATE NULL,
  estado        VARCHAR(15) NOT NULL DEFAULT 'activo',
  CONSTRAINT chk_tratamientos_oculares_ojo CHECK (ojo IN ('od','oi','ambos')),
  CONSTRAINT chk_tratamientos_oculares_tipo CHECK (tipo IN ('topico','sistemico','quirurgico','laser','otro')),
  CONSTRAINT chk_tratamientos_oculares_estado CHECK (estado IN ('activo','suspendido','finalizado')),
  CONSTRAINT fk_tratamientos_oculares_evaluacion FOREIGN KEY (evaluacion_id)
    REFERENCES oftalmologia.evaluaciones_oculares(id) ON DELETE SET NULL,
  CONSTRAINT fk_tratamientos_oculares_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_tratamientos_oculares_enfermedad FOREIGN KEY (enfermedad_id)
    REFERENCES oftalmologia.enfermedades_oculares(id) ON DELETE SET NULL,
  CONSTRAINT fk_tratamientos_oculares_medicamento FOREIGN KEY (medicamento_id)
    REFERENCES historia_clinica.medicamentos(id) ON DELETE SET NULL
);

CREATE TABLE oftalmologia.seguimiento_ocular (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id     INTEGER NOT NULL,
  evaluacion_id  INTEGER NULL,
  fecha          DATE NOT NULL DEFAULT CURRENT_DATE,
  presion_od     SMALLINT NULL,
  presion_oi     SMALLINT NULL,
  vision         VARCHAR(20) NULL,
  evolucion      VARCHAR(20) NOT NULL DEFAULT 'estable',
  proxima_fecha  DATE NULL,
  veterinario_id INTEGER NULL,
  CONSTRAINT chk_seguimiento_ocular_evolucion CHECK (evolucion IN ('mejora','estable','deterioro')),
  CONSTRAINT fk_seguimiento_ocular_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_seguimiento_ocular_evaluacion FOREIGN KEY (evaluacion_id)
    REFERENCES oftalmologia.evaluaciones_oculares(id) ON DELETE SET NULL,
  CONSTRAINT fk_seguimiento_ocular_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);


-- =====================================================================
--  MÓDULO 46 · REHABILITACIÓN  ·  MÓDULO 47 · MANEJO DEL DOLOR
--
--  Van juntos porque comparten la misma pregunta: ¿le duele menos y se
--  mueve mejor que la semana pasada? Ambos se miden con una escala y un
--  número, no con adjetivos.
-- =====================================================================

CREATE TABLE rehabilitacion.ejercicios (
  id          SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre      VARCHAR(120) NOT NULL,
  categoria   VARCHAR(25) NOT NULL DEFAULT 'movilidad',
  descripcion TEXT NULL,
  equipo      VARCHAR(120) NULL,
  dificultad  SMALLINT NOT NULL DEFAULT 1,
  activo      SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_ejercicios_nombre UNIQUE (nombre),
  CONSTRAINT chk_ejercicios_categoria CHECK (categoria IN (
    'movilidad','fuerza','propiocepcion','equilibrio','marcha','cardio','estiramiento')),
  CONSTRAINT chk_ejercicios_dificultad CHECK (dificultad BETWEEN 1 AND 5),
  CONSTRAINT chk_ejercicios_activo CHECK (activo IN (0,1))
);

CREATE TABLE rehabilitacion.terapias (
  id               SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre           VARCHAR(120) NOT NULL,
  tipo             VARCHAR(25) NOT NULL DEFAULT 'fisica',
  descripcion      TEXT NULL,
  duracion_min     SMALLINT NULL,
  contraindicaciones TEXT NULL,
  activo           SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_terapias_nombre UNIQUE (nombre),
  CONSTRAINT chk_terapias_tipo CHECK (tipo IN (
    'fisica','hidroterapia','laser','ultrasonido','electroestimulacion','magnetoterapia','acupuntura','masaje')),
  CONSTRAINT chk_terapias_activo CHECK (activo IN (0,1))
);

CREATE TABLE rehabilitacion.evaluaciones_fisioterapia (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id     INTEGER NOT NULL,
  consulta_id    INTEGER NULL,
  veterinario_id INTEGER NULL,
  fecha          DATE NOT NULL DEFAULT CURRENT_DATE,
  motivo         VARCHAR(180) NULL,
  diagnostico    VARCHAR(180) NULL,
  dolor_escala   SMALLINT NULL,
  marcha         VARCHAR(30) NULL,
  cojera_grado   SMALLINT NULL,
  masa_muscular  VARCHAR(30) NULL,
  objetivo       TEXT NULL,
  CONSTRAINT chk_eval_fisio_dolor CHECK (dolor_escala IS NULL OR dolor_escala BETWEEN 0 AND 10),
  CONSTRAINT chk_eval_fisio_cojera CHECK (cojera_grado IS NULL OR cojera_grado BETWEEN 0 AND 5),
  CONSTRAINT fk_eval_fisio_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_eval_fisio_consulta FOREIGN KEY (consulta_id)
    REFERENCES historia_clinica.consultas(id) ON DELETE SET NULL,
  CONSTRAINT fk_eval_fisio_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);

CREATE TABLE rehabilitacion.planes_rehabilitacion (
  id                INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  evaluacion_id     INTEGER NULL,
  mascota_id        INTEGER NOT NULL,
  nombre            VARCHAR(140) NOT NULL,
  objetivo          TEXT NULL,
  sesiones_previstas SMALLINT NOT NULL DEFAULT 8,
  frecuencia_semanal SMALLINT NOT NULL DEFAULT 2,
  inicio            DATE NOT NULL DEFAULT CURRENT_DATE,
  fin               DATE NULL,
  estado            VARCHAR(15) NOT NULL DEFAULT 'activo',
  responsable_id    INTEGER NULL,
  CONSTRAINT chk_planes_rehab_estado CHECK (estado IN ('activo','pausado','finalizado','abandonado')),
  CONSTRAINT fk_planes_rehab_evaluacion FOREIGN KEY (evaluacion_id)
    REFERENCES rehabilitacion.evaluaciones_fisioterapia(id) ON DELETE SET NULL,
  CONSTRAINT fk_planes_rehab_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_planes_rehab_usuario FOREIGN KEY (responsable_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE rehabilitacion.sesiones_rehabilitacion (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  plan_id      INTEGER NOT NULL,
  mascota_id   INTEGER NOT NULL,
  terapia_id   SMALLINT NULL,
  ejercicio_id SMALLINT NULL,
  terapeuta_id INTEGER NULL,
  fecha        TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  numero       SMALLINT NOT NULL DEFAULT 1,
  duracion_min SMALLINT NULL,
  tolerancia   VARCHAR(20) NULL,
  dolor_post   SMALLINT NULL,
  observaciones TEXT NULL,
  CONSTRAINT chk_sesiones_rehab_dolor CHECK (dolor_post IS NULL OR dolor_post BETWEEN 0 AND 10),
  CONSTRAINT fk_sesiones_rehab_plan FOREIGN KEY (plan_id)
    REFERENCES rehabilitacion.planes_rehabilitacion(id) ON DELETE CASCADE,
  CONSTRAINT fk_sesiones_rehab_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_sesiones_rehab_terapia FOREIGN KEY (terapia_id)
    REFERENCES rehabilitacion.terapias(id) ON DELETE SET NULL,
  CONSTRAINT fk_sesiones_rehab_ejercicio FOREIGN KEY (ejercicio_id)
    REFERENCES rehabilitacion.ejercicios(id) ON DELETE SET NULL,
  CONSTRAINT fk_sesiones_rehab_usuario FOREIGN KEY (terapeuta_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_sesiones_rehab_plan ON rehabilitacion.sesiones_rehabilitacion (plan_id, fecha);

CREATE TABLE rehabilitacion.progreso_rehabilitacion (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  plan_id        INTEGER NOT NULL,
  mascota_id     INTEGER NOT NULL,
  fecha          DATE NOT NULL DEFAULT CURRENT_DATE,
  sesiones_hechas SMALLINT NOT NULL DEFAULT 0,
  dolor_escala   SMALLINT NULL,
  funcionalidad_pct NUMERIC(5,2) NULL,
  evolucion      VARCHAR(20) NOT NULL DEFAULT 'estable',
  ajustes        TEXT NULL,
  CONSTRAINT chk_progreso_rehab_evolucion CHECK (evolucion IN ('mejora','estable','deterioro')),
  CONSTRAINT fk_progreso_rehab_plan FOREIGN KEY (plan_id)
    REFERENCES rehabilitacion.planes_rehabilitacion(id) ON DELETE CASCADE,
  CONSTRAINT fk_progreso_rehab_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE
);

CREATE TABLE rehabilitacion.mediciones_movilidad (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id     INTEGER NOT NULL,
  plan_id        INTEGER NULL,
  sesion_id      INTEGER NULL,
  fecha          DATE NOT NULL DEFAULT CURRENT_DATE,
  articulacion   VARCHAR(40) NOT NULL,
  lado           VARCHAR(10) NOT NULL DEFAULT 'derecho',
  grados_flexion NUMERIC(5,1) NULL,
  grados_extension NUMERIC(5,1) NULL,
  circunferencia_cm NUMERIC(5,1) NULL,
  medido_por     INTEGER NULL,
  CONSTRAINT chk_mediciones_movilidad_lado CHECK (lado IN ('derecho','izquierdo','bilateral')),
  CONSTRAINT fk_mediciones_movilidad_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_mediciones_movilidad_plan FOREIGN KEY (plan_id)
    REFERENCES rehabilitacion.planes_rehabilitacion(id) ON DELETE SET NULL,
  CONSTRAINT fk_mediciones_movilidad_sesion FOREIGN KEY (sesion_id)
    REFERENCES rehabilitacion.sesiones_rehabilitacion(id) ON DELETE SET NULL,
  CONSTRAINT fk_mediciones_movilidad_usuario FOREIGN KEY (medido_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

-- --- Manejo del dolor (módulo 47) ------------------------------------

CREATE TABLE rehabilitacion.escalas_dolor (
  id          SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre      VARCHAR(80) NOT NULL,       -- Glasgow, Colorado, Feline Grimace…
  especie_id  SMALLINT NULL,
  puntaje_min SMALLINT NOT NULL DEFAULT 0,
  puntaje_max SMALLINT NOT NULL DEFAULT 24,
  umbral_rescate SMALLINT NULL,
  descripcion TEXT NULL,
  CONSTRAINT uq_escalas_dolor UNIQUE (nombre, especie_id),
  CONSTRAINT chk_escalas_dolor_rango CHECK (puntaje_max > puntaje_min),
  CONSTRAINT fk_escalas_dolor_especie FOREIGN KEY (especie_id)
    REFERENCES mascotas.especies(id) ON DELETE CASCADE
);

CREATE TABLE rehabilitacion.medicamentos_dolor (
  id             SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  medicamento_id INTEGER NULL,
  nombre         VARCHAR(120) NOT NULL,
  categoria      VARCHAR(20) NOT NULL DEFAULT 'aine',
  especie_id     SMALLINT NULL,
  dosis_min      NUMERIC(8,3) NULL,
  dosis_max      NUMERIC(8,3) NULL,
  unidad         VARCHAR(20) NULL DEFAULT 'mg/kg',
  via            VARCHAR(20) NULL,
  intervalo_horas SMALLINT NULL,
  CONSTRAINT chk_medicamentos_dolor_categoria CHECK (categoria IN (
    'aine','opioide','anestesico_local','adyuvante','corticoide','otro')),
  CONSTRAINT fk_medicamentos_dolor_medicamento FOREIGN KEY (medicamento_id)
    REFERENCES historia_clinica.medicamentos(id) ON DELETE SET NULL,
  CONSTRAINT fk_medicamentos_dolor_especie FOREIGN KEY (especie_id)
    REFERENCES mascotas.especies(id) ON DELETE SET NULL
);

CREATE TABLE rehabilitacion.evaluaciones_dolor (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id    INTEGER NOT NULL,
  escala_id     SMALLINT NULL,
  hospitalizacion_id INTEGER NULL,
  cirugia_id    INTEGER NULL,
  fecha         TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  puntaje       SMALLINT NOT NULL,
  nivel         VARCHAR(15) NOT NULL DEFAULT 'leve',
  origen        VARCHAR(20) NULL,
  localizacion  VARCHAR(80) NULL,
  requiere_rescate SMALLINT NOT NULL DEFAULT 0,
  evaluado_por  INTEGER NULL,
  observaciones TEXT NULL,
  CONSTRAINT chk_evaluaciones_dolor_nivel CHECK (nivel IN ('ausente','leve','moderado','intenso','severo')),
  CONSTRAINT chk_evaluaciones_dolor_rescate CHECK (requiere_rescate IN (0,1)),
  CONSTRAINT fk_evaluaciones_dolor_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_evaluaciones_dolor_escala FOREIGN KEY (escala_id)
    REFERENCES rehabilitacion.escalas_dolor(id) ON DELETE SET NULL,
  CONSTRAINT fk_evaluaciones_dolor_hosp FOREIGN KEY (hospitalizacion_id)
    REFERENCES historia_clinica.hospitalizaciones(id) ON DELETE SET NULL,
  CONSTRAINT fk_evaluaciones_dolor_cirugia FOREIGN KEY (cirugia_id)
    REFERENCES historia_clinica.cirugias(id) ON DELETE SET NULL,
  CONSTRAINT fk_evaluaciones_dolor_usuario FOREIGN KEY (evaluado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_evaluaciones_dolor_mascota ON rehabilitacion.evaluaciones_dolor (mascota_id, fecha DESC);

CREATE TABLE rehabilitacion.tratamientos_dolor (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id     INTEGER NOT NULL,
  evaluacion_id  INTEGER NULL,
  veterinario_id INTEGER NULL,
  tipo           VARCHAR(20) NOT NULL DEFAULT 'farmacologico',
  objetivo_puntaje SMALLINT NULL,
  inicio         DATE NOT NULL DEFAULT CURRENT_DATE,
  fin            DATE NULL,
  estado         VARCHAR(15) NOT NULL DEFAULT 'activo',
  descripcion    TEXT NULL,
  CONSTRAINT chk_tratamientos_dolor_tipo CHECK (tipo IN (
    'farmacologico','fisico','multimodal','intervencionista','paliativo')),
  CONSTRAINT chk_tratamientos_dolor_estado CHECK (estado IN ('activo','suspendido','finalizado')),
  CONSTRAINT fk_tratamientos_dolor_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_tratamientos_dolor_evaluacion FOREIGN KEY (evaluacion_id)
    REFERENCES rehabilitacion.evaluaciones_dolor(id) ON DELETE SET NULL,
  CONSTRAINT fk_tratamientos_dolor_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);

CREATE TABLE rehabilitacion.intervenciones (
  id                 INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  tratamiento_dolor_id INTEGER NOT NULL,
  mascota_id         INTEGER NOT NULL,
  medicamento_dolor_id SMALLINT NULL,
  tipo               VARCHAR(25) NOT NULL DEFAULT 'dosis',
  dosis              VARCHAR(60) NULL,
  via                VARCHAR(20) NULL,
  aplicada_en        TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  aplicada_por       INTEGER NULL,
  respuesta          VARCHAR(20) NULL,
  notas              TEXT NULL,
  CONSTRAINT chk_intervenciones_tipo CHECK (tipo IN (
    'dosis','rescate','bloqueo','infusion','crioterapia','termoterapia','otra')),
  CONSTRAINT fk_intervenciones_tratamiento FOREIGN KEY (tratamiento_dolor_id)
    REFERENCES rehabilitacion.tratamientos_dolor(id) ON DELETE CASCADE,
  CONSTRAINT fk_intervenciones_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_intervenciones_medicamento FOREIGN KEY (medicamento_dolor_id)
    REFERENCES rehabilitacion.medicamentos_dolor(id) ON DELETE SET NULL,
  CONSTRAINT fk_intervenciones_usuario FOREIGN KEY (aplicada_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE rehabilitacion.seguimiento_dolor (
  id                 INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id         INTEGER NOT NULL,
  tratamiento_dolor_id INTEGER NULL,
  fecha              TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  puntaje            SMALLINT NULL,
  nivel              VARCHAR(15) NULL,
  efectividad        VARCHAR(20) NULL,
  ajuste             TEXT NULL,
  proxima_evaluacion TIMESTAMP(0) NULL,
  CONSTRAINT chk_seguimiento_dolor_efectividad CHECK (efectividad IS NULL OR efectividad IN (
    'sin_respuesta','parcial','buena','completa')),
  CONSTRAINT fk_seguimiento_dolor_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_seguimiento_dolor_tratamiento FOREIGN KEY (tratamiento_dolor_id)
    REFERENCES rehabilitacion.tratamientos_dolor(id) ON DELETE CASCADE
);


-- =====================================================================
--  MÓDULO 48 · ANESTESIOLOGÍA
--
--  La monitorización se guarda minuto a minuto y no como un resumen: si
--  algo salió mal, lo que hay que poder reconstruir es la curva, no una
--  frase. Cada fila es una toma de constantes durante el procedimiento.
-- =====================================================================

CREATE TABLE anestesia.protocolos_anestesia (
  id            SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre        VARCHAR(120) NOT NULL,
  especie_id    SMALLINT NULL,
  riesgo_asa    VARCHAR(5) NULL,
  premedicacion TEXT NULL,
  induccion     TEXT NULL,
  mantenimiento TEXT NULL,
  analgesia     TEXT NULL,
  descripcion   TEXT NULL,
  activo        SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_protocolos_anestesia UNIQUE (nombre, especie_id),
  CONSTRAINT chk_protocolos_anestesia_asa CHECK (riesgo_asa IS NULL OR riesgo_asa IN ('I','II','III','IV','V')),
  CONSTRAINT chk_protocolos_anestesia_activo CHECK (activo IN (0,1)),
  CONSTRAINT fk_protocolos_anestesia_especie FOREIGN KEY (especie_id)
    REFERENCES mascotas.especies(id) ON DELETE CASCADE
);

CREATE TABLE anestesia.medicamentos_anestesicos (
  id             SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  medicamento_id INTEGER NULL,
  nombre         VARCHAR(120) NOT NULL,
  tipo           VARCHAR(25) NOT NULL DEFAULT 'inductor',
  especie_id     SMALLINT NULL,
  dosis_min      NUMERIC(8,3) NULL,
  dosis_max      NUMERIC(8,3) NULL,
  unidad         VARCHAR(20) NULL DEFAULT 'mg/kg',
  via            VARCHAR(20) NULL,
  notas          TEXT NULL,
  CONSTRAINT chk_medicamentos_anest_tipo CHECK (tipo IN (
    'premedicacion','inductor','mantenimiento','relajante','analgesico','reversor','emergencia')),
  CONSTRAINT fk_medicamentos_anest_medicamento FOREIGN KEY (medicamento_id)
    REFERENCES historia_clinica.medicamentos(id) ON DELETE SET NULL,
  CONSTRAINT fk_medicamentos_anest_especie FOREIGN KEY (especie_id)
    REFERENCES mascotas.especies(id) ON DELETE SET NULL
);

CREATE TABLE anestesia.evaluaciones_anestesicas (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id     INTEGER NOT NULL,
  cirugia_id     INTEGER NULL,
  protocolo_id   SMALLINT NULL,
  veterinario_id INTEGER NULL,
  fecha          DATE NOT NULL DEFAULT CURRENT_DATE,
  asa            VARCHAR(5) NOT NULL DEFAULT 'I',
  peso_kg        NUMERIC(6,2) NULL,
  ayuno_horas    SMALLINT NULL,
  examenes_previos TEXT NULL,
  hallazgos      TEXT NULL,
  riesgos        TEXT NULL,
  apto           SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT chk_evaluaciones_anest_asa CHECK (asa IN ('I','II','III','IV','V','E')),
  CONSTRAINT chk_evaluaciones_anest_apto CHECK (apto IN (0,1)),
  CONSTRAINT fk_evaluaciones_anest_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_evaluaciones_anest_cirugia FOREIGN KEY (cirugia_id)
    REFERENCES historia_clinica.cirugias(id) ON DELETE SET NULL,
  CONSTRAINT fk_evaluaciones_anest_protocolo FOREIGN KEY (protocolo_id)
    REFERENCES anestesia.protocolos_anestesia(id) ON DELETE SET NULL,
  CONSTRAINT fk_evaluaciones_anest_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);

CREATE TABLE anestesia.monitorizacion_anestesica (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cirugia_id    INTEGER NULL,
  evaluacion_id INTEGER NULL,
  mascota_id    INTEGER NOT NULL,
  momento       TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  minuto        SMALLINT NULL,
  frec_cardiaca SMALLINT NULL,
  frec_respiratoria SMALLINT NULL,
  spo2          SMALLINT NULL,
  etco2         SMALLINT NULL,
  presion_media SMALLINT NULL,
  temperatura_c NUMERIC(4,1) NULL,
  plano         VARCHAR(15) NULL,
  registrado_por INTEGER NULL,
  CONSTRAINT chk_monitorizacion_plano CHECK (plano IS NULL OR plano IN ('superficial','quirurgico','profundo')),
  CONSTRAINT fk_monitorizacion_cirugia FOREIGN KEY (cirugia_id)
    REFERENCES historia_clinica.cirugias(id) ON DELETE CASCADE,
  CONSTRAINT fk_monitorizacion_evaluacion FOREIGN KEY (evaluacion_id)
    REFERENCES anestesia.evaluaciones_anestesicas(id) ON DELETE SET NULL,
  CONSTRAINT fk_monitorizacion_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_monitorizacion_usuario FOREIGN KEY (registrado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_monitorizacion_anestesica ON anestesia.monitorizacion_anestesica (cirugia_id, momento);

CREATE TABLE anestesia.eventos_anestesia (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cirugia_id    INTEGER NULL,
  evaluacion_id INTEGER NULL,
  mascota_id    INTEGER NOT NULL,
  momento       TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  tipo          VARCHAR(30) NOT NULL,
  gravedad      VARCHAR(10) NOT NULL DEFAULT 'leve',
  descripcion   TEXT NOT NULL,
  manejo        TEXT NULL,
  registrado_por INTEGER NULL,
  CONSTRAINT chk_eventos_anestesia_tipo CHECK (tipo IN (
    'hipotension','hipertension','bradicardia','taquicardia','arritmia','apnea',
    'hipoxemia','hipotermia','hipertermia','despertar','paro','regurgitacion','otro')),
  CONSTRAINT chk_eventos_anestesia_gravedad CHECK (gravedad IN ('leve','moderada','grave','mortal')),
  CONSTRAINT fk_eventos_anestesia_cirugia FOREIGN KEY (cirugia_id)
    REFERENCES historia_clinica.cirugias(id) ON DELETE CASCADE,
  CONSTRAINT fk_eventos_anestesia_evaluacion FOREIGN KEY (evaluacion_id)
    REFERENCES anestesia.evaluaciones_anestesicas(id) ON DELETE SET NULL,
  CONSTRAINT fk_eventos_anestesia_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_eventos_anestesia_usuario FOREIGN KEY (registrado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE anestesia.recuperacion_anestesica (
  id                INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cirugia_id        INTEGER NULL,
  evaluacion_id     INTEGER NULL,
  mascota_id        INTEGER NOT NULL,
  extubacion        TIMESTAMP(0) NULL,
  decubito_esternal TIMESTAMP(0) NULL,
  deambulacion      TIMESTAMP(0) NULL,
  temperatura_c     NUMERIC(4,1) NULL,
  dolor_puntaje     SMALLINT NULL,
  complicaciones    TEXT NULL,
  alta_en           TIMESTAMP(0) NULL,
  responsable_id    INTEGER NULL,
  CONSTRAINT fk_recuperacion_cirugia FOREIGN KEY (cirugia_id)
    REFERENCES historia_clinica.cirugias(id) ON DELETE CASCADE,
  CONSTRAINT fk_recuperacion_evaluacion FOREIGN KEY (evaluacion_id)
    REFERENCES anestesia.evaluaciones_anestesicas(id) ON DELETE SET NULL,
  CONSTRAINT fk_recuperacion_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_recuperacion_usuario FOREIGN KEY (responsable_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);


-- =====================================================================
--  MÓDULO 49 · NUTRICIÓN AVANZADA
--
--  Amplía el esquema `nutricion` que ya existía. Las restricciones y las
--  evaluaciones NO se duplican: siguen en nutricion.restricciones_alimentarias
--  y nutricion.evaluaciones_nutricionales. Lo que se añade es lo que faltaba
--  para calcular una ración de verdad: el alimento con sus kcal, la
--  composición corporal y el requerimiento energético del paciente.
-- =====================================================================

CREATE TABLE nutricion.alimentos (
  id               INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  tipo_alimento_id SMALLINT NULL,
  producto_id      INTEGER NULL,
  nombre           VARCHAR(140) NOT NULL,
  marca            VARCHAR(80) NULL,
  presentacion     VARCHAR(60) NULL,
  especie_id       SMALLINT NULL,
  kcal_100g        NUMERIC(7,2) NULL,
  proteina_pct     NUMERIC(5,2) NULL,
  grasa_pct        NUMERIC(5,2) NULL,
  fibra_pct        NUMERIC(5,2) NULL,
  humedad_pct      NUMERIC(5,2) NULL,
  medicado         SMALLINT NOT NULL DEFAULT 0,
  activo           SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_alimentos UNIQUE (nombre, marca, presentacion),
  CONSTRAINT chk_alimentos_medicado CHECK (medicado IN (0,1)),
  CONSTRAINT chk_alimentos_activo   CHECK (activo IN (0,1)),
  CONSTRAINT fk_alimentos_tipo FOREIGN KEY (tipo_alimento_id)
    REFERENCES nutricion.tipos_alimento(id) ON DELETE SET NULL,
  CONSTRAINT fk_alimentos_producto FOREIGN KEY (producto_id)
    REFERENCES inventario.productos(id) ON DELETE SET NULL,
  CONSTRAINT fk_alimentos_especie FOREIGN KEY (especie_id)
    REFERENCES mascotas.especies(id) ON DELETE SET NULL
);

CREATE TABLE nutricion.composicion_corporal (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id    INTEGER NOT NULL,
  evaluacion_id INTEGER NULL,
  fecha         DATE NOT NULL DEFAULT CURRENT_DATE,
  peso_kg       NUMERIC(6,2) NOT NULL,
  condicion_corporal SMALLINT NULL,       -- escala 1-9
  masa_muscular VARCHAR(20) NULL,
  grasa_pct     NUMERIC(5,2) NULL,
  perimetro_toracico_cm NUMERIC(5,1) NULL,
  perimetro_abdominal_cm NUMERIC(5,1) NULL,
  medido_por    INTEGER NULL,
  CONSTRAINT chk_composicion_ccs CHECK (condicion_corporal IS NULL OR condicion_corporal BETWEEN 1 AND 9),
  CONSTRAINT chk_composicion_masa CHECK (masa_muscular IS NULL OR masa_muscular IN (
    'normal','perdida_leve','perdida_moderada','perdida_grave')),
  CONSTRAINT fk_composicion_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_composicion_evaluacion FOREIGN KEY (evaluacion_id)
    REFERENCES nutricion.evaluaciones_nutricionales(id) ON DELETE SET NULL,
  CONSTRAINT fk_composicion_usuario FOREIGN KEY (medido_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_composicion_corporal ON nutricion.composicion_corporal (mascota_id, fecha DESC);

-- RER = 70 × peso^0.75; MER = RER × factor. Se guardan los tres para poder
-- explicarle al dueño de dónde salió la ración y para rehacer el cálculo si
-- el factor cambia (castrado, gestante, hospitalizado…).
CREATE TABLE nutricion.requerimientos_caloricos (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id    INTEGER NOT NULL,
  evaluacion_id INTEGER NULL,
  fecha         DATE NOT NULL DEFAULT CURRENT_DATE,
  peso_kg       NUMERIC(6,2) NOT NULL,
  rer_kcal      NUMERIC(8,2) NOT NULL,
  factor        NUMERIC(4,2) NOT NULL DEFAULT 1.6,
  mer_kcal      NUMERIC(8,2) NOT NULL,
  objetivo      VARCHAR(20) NOT NULL DEFAULT 'mantenimiento',
  kcal_objetivo NUMERIC(8,2) NULL,
  calculado_por INTEGER NULL,
  CONSTRAINT chk_requerimientos_objetivo CHECK (objetivo IN (
    'mantenimiento','perdida_peso','ganancia_peso','crecimiento','gestacion','lactancia','hospitalizacion')),
  CONSTRAINT fk_requerimientos_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_requerimientos_evaluacion FOREIGN KEY (evaluacion_id)
    REFERENCES nutricion.evaluaciones_nutricionales(id) ON DELETE SET NULL,
  CONSTRAINT fk_requerimientos_usuario FOREIGN KEY (calculado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE nutricion.planes_alimentacion (
  id                  INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id          INTEGER NOT NULL,
  plan_nutricional_id INTEGER NULL,
  alimento_id         INTEGER NULL,
  requerimiento_id    INTEGER NULL,
  gramos_dia          NUMERIC(7,2) NULL,
  comidas_dia         SMALLINT NOT NULL DEFAULT 2,
  kcal_dia            NUMERIC(8,2) NULL,
  inicio              DATE NOT NULL DEFAULT CURRENT_DATE,
  fin                 DATE NULL,
  estado              VARCHAR(15) NOT NULL DEFAULT 'activo',
  indicaciones        TEXT NULL,
  CONSTRAINT chk_planes_alimentacion_estado CHECK (estado IN ('activo','pausado','finalizado')),
  CONSTRAINT fk_planes_alimentacion_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_planes_alimentacion_plan FOREIGN KEY (plan_nutricional_id)
    REFERENCES nutricion.planes_nutricionales(id) ON DELETE SET NULL,
  CONSTRAINT fk_planes_alimentacion_alimento FOREIGN KEY (alimento_id)
    REFERENCES nutricion.alimentos(id) ON DELETE SET NULL,
  CONSTRAINT fk_planes_alimentacion_req FOREIGN KEY (requerimiento_id)
    REFERENCES nutricion.requerimientos_caloricos(id) ON DELETE SET NULL
);

CREATE TABLE nutricion.alergias_alimentarias (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id    INTEGER NOT NULL,
  alimento_id   INTEGER NULL,
  ingrediente   VARCHAR(120) NULL,
  reaccion      VARCHAR(180) NULL,
  severidad     VARCHAR(10) NOT NULL DEFAULT 'leve',
  confirmada    SMALLINT NOT NULL DEFAULT 0,
  metodo        VARCHAR(30) NULL,
  diagnosticada_en DATE NOT NULL DEFAULT CURRENT_DATE,
  CONSTRAINT chk_alergias_alim_severidad CHECK (severidad IN ('leve','moderada','grave')),
  CONSTRAINT chk_alergias_alim_confirmada CHECK (confirmada IN (0,1)),
  CONSTRAINT fk_alergias_alim_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_alergias_alim_alimento FOREIGN KEY (alimento_id)
    REFERENCES nutricion.alimentos(id) ON DELETE SET NULL
);

CREATE TABLE nutricion.seguimiento_nutricional (
  id                   INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id           INTEGER NOT NULL,
  plan_alimentacion_id INTEGER NULL,
  fecha                DATE NOT NULL DEFAULT CURRENT_DATE,
  peso_kg              NUMERIC(6,2) NULL,
  condicion_corporal   SMALLINT NULL,
  adherencia_pct       NUMERIC(5,2) NULL,
  evolucion            VARCHAR(20) NOT NULL DEFAULT 'estable',
  ajuste               TEXT NULL,
  proxima_fecha        DATE NULL,
  CONSTRAINT chk_seguimiento_nutri_evolucion CHECK (evolucion IN ('mejora','estable','deterioro')),
  CONSTRAINT fk_seguimiento_nutri_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_seguimiento_nutri_plan FOREIGN KEY (plan_alimentacion_id)
    REFERENCES nutricion.planes_alimentacion(id) ON DELETE SET NULL
);


-- =====================================================================
--  MÓDULO 50 · COMPORTAMIENTO ANIMAL
--
--  Los problemas de conducta se guardan por PACIENTE y con su frecuencia,
--  porque el dato útil no es "existe la ansiedad por separación" sino
--  "este perro la tiene tres veces por semana y va bajando".
-- =====================================================================

CREATE TABLE comportamiento.evaluaciones_conductuales (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id     INTEGER NOT NULL,
  consulta_id    INTEGER NULL,
  veterinario_id INTEGER NULL,
  fecha          DATE NOT NULL DEFAULT CURRENT_DATE,
  motivo         VARCHAR(180) NULL,
  entorno        TEXT NULL,
  convivencia    TEXT NULL,
  historia       TEXT NULL,
  diagnostico    VARCHAR(180) NULL,
  gravedad       VARCHAR(10) NOT NULL DEFAULT 'media',
  riesgo_mordida SMALLINT NOT NULL DEFAULT 0,
  observaciones  TEXT NULL,
  CONSTRAINT chk_eval_conductuales_gravedad CHECK (gravedad IN ('baja','media','alta')),
  CONSTRAINT chk_eval_conductuales_riesgo CHECK (riesgo_mordida IN (0,1)),
  CONSTRAINT fk_eval_conductuales_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_eval_conductuales_consulta FOREIGN KEY (consulta_id)
    REFERENCES historia_clinica.consultas(id) ON DELETE SET NULL,
  CONSTRAINT fk_eval_conductuales_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_eval_conductuales_mascota ON comportamiento.evaluaciones_conductuales (mascota_id, fecha DESC);

CREATE TABLE comportamiento.problemas_conducta (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id    INTEGER NOT NULL,
  evaluacion_id INTEGER NULL,
  nombre        VARCHAR(120) NOT NULL,
  categoria     VARCHAR(25) NOT NULL DEFAULT 'otra',
  frecuencia    VARCHAR(20) NULL,
  gravedad      VARCHAR(10) NOT NULL DEFAULT 'media',
  inicio        DATE NULL,
  activo        SMALLINT NOT NULL DEFAULT 1,
  descripcion   TEXT NULL,
  CONSTRAINT chk_problemas_conducta_categoria CHECK (categoria IN (
    'agresividad','ansiedad','miedo','eliminacion','estereotipia','vocalizacion',
    'destructiva','alimentaria','social','otra')),
  CONSTRAINT chk_problemas_conducta_gravedad CHECK (gravedad IN ('baja','media','alta')),
  CONSTRAINT chk_problemas_conducta_activo CHECK (activo IN (0,1)),
  CONSTRAINT fk_problemas_conducta_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_problemas_conducta_evaluacion FOREIGN KEY (evaluacion_id)
    REFERENCES comportamiento.evaluaciones_conductuales(id) ON DELETE SET NULL
);

CREATE TABLE comportamiento.factores_desencadenantes (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  problema_id INTEGER NOT NULL,
  mascota_id  INTEGER NOT NULL,
  factor      VARCHAR(120) NOT NULL,
  categoria   VARCHAR(25) NOT NULL DEFAULT 'ambiental',
  contexto    TEXT NULL,
  frecuencia  VARCHAR(20) NULL,
  evitable    SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT chk_factores_desenc_categoria CHECK (categoria IN (
    'ambiental','social','manejo','ruido','dolor','rutina','otro')),
  CONSTRAINT chk_factores_desenc_evitable CHECK (evitable IN (0,1)),
  CONSTRAINT fk_factores_desenc_problema FOREIGN KEY (problema_id)
    REFERENCES comportamiento.problemas_conducta(id) ON DELETE CASCADE,
  CONSTRAINT fk_factores_desenc_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE
);

CREATE TABLE comportamiento.planes_conductuales (
  id                INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id        INTEGER NOT NULL,
  evaluacion_id     INTEGER NULL,
  nombre            VARCHAR(140) NOT NULL,
  objetivo          TEXT NULL,
  tecnicas          TEXT NULL,
  duracion_semanas  SMALLINT NULL,
  inicio            DATE NOT NULL DEFAULT CURRENT_DATE,
  fin               DATE NULL,
  estado            VARCHAR(15) NOT NULL DEFAULT 'activo',
  responsable_id    INTEGER NULL,
  CONSTRAINT chk_planes_conductuales_estado CHECK (estado IN ('activo','pausado','finalizado','abandonado')),
  CONSTRAINT fk_planes_conductuales_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_planes_conductuales_evaluacion FOREIGN KEY (evaluacion_id)
    REFERENCES comportamiento.evaluaciones_conductuales(id) ON DELETE SET NULL,
  CONSTRAINT fk_planes_conductuales_usuario FOREIGN KEY (responsable_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE comportamiento.sesiones_comportamiento (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  plan_id       INTEGER NOT NULL,
  mascota_id    INTEGER NOT NULL,
  profesional_id INTEGER NULL,
  fecha         TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  numero        SMALLINT NOT NULL DEFAULT 1,
  duracion_min  SMALLINT NULL,
  modalidad     VARCHAR(15) NOT NULL DEFAULT 'presencial',
  actividades   TEXT NULL,
  respuesta     VARCHAR(20) NULL,
  tarea_casa    TEXT NULL,
  CONSTRAINT chk_sesiones_comport_modalidad CHECK (modalidad IN ('presencial','domicilio','videollamada')),
  CONSTRAINT fk_sesiones_comport_plan FOREIGN KEY (plan_id)
    REFERENCES comportamiento.planes_conductuales(id) ON DELETE CASCADE,
  CONSTRAINT fk_sesiones_comport_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_sesiones_comport_usuario FOREIGN KEY (profesional_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE comportamiento.evolucion_conductual (
  id                  INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id          INTEGER NOT NULL,
  plan_id             INTEGER NULL,
  problema_id         INTEGER NULL,
  fecha               DATE NOT NULL DEFAULT CURRENT_DATE,
  frecuencia_episodios SMALLINT NULL,
  intensidad          SMALLINT NULL,
  mejoria_pct         NUMERIC(5,2) NULL,
  observaciones       TEXT NULL,
  ajuste              TEXT NULL,
  CONSTRAINT chk_evolucion_conductual_intensidad CHECK (intensidad IS NULL OR intensidad BETWEEN 0 AND 10),
  CONSTRAINT fk_evolucion_conductual_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_evolucion_conductual_plan FOREIGN KEY (plan_id)
    REFERENCES comportamiento.planes_conductuales(id) ON DELETE SET NULL,
  CONSTRAINT fk_evolucion_conductual_problema FOREIGN KEY (problema_id)
    REFERENCES comportamiento.problemas_conducta(id) ON DELETE SET NULL
);


-- =====================================================================
--  MÓDULO 51 · GENÉTICA
--
--  Un resultado genético dice tres cosas distintas: portador, afectado y
--  libre. Se guardan como columnas y no como texto porque de ahí salen
--  los avisos de cruzamiento del módulo 52.
-- =====================================================================

CREATE TABLE genetica.enfermedades_geneticas (
  id          SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre      VARCHAR(140) NOT NULL,
  gen         VARCHAR(60) NULL,
  herencia    VARCHAR(30) NOT NULL DEFAULT 'autosomica_recesiva',
  especie_id  SMALLINT NULL,
  raza_id     SMALLINT NULL,
  descripcion TEXT NULL,
  CONSTRAINT uq_enfermedades_geneticas UNIQUE (nombre, gen),
  CONSTRAINT chk_enfermedades_gen_herencia CHECK (herencia IN (
    'autosomica_dominante','autosomica_recesiva','ligada_x','poligenica','mitocondrial','desconocida')),
  CONSTRAINT fk_enfermedades_gen_especie FOREIGN KEY (especie_id)
    REFERENCES mascotas.especies(id) ON DELETE SET NULL,
  CONSTRAINT fk_enfermedades_gen_raza FOREIGN KEY (raza_id)
    REFERENCES mascotas.razas(id) ON DELETE SET NULL
);

CREATE TABLE genetica.perfiles_geneticos (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id  INTEGER NOT NULL,
  codigo      VARCHAR(40) NULL,
  laboratorio VARCHAR(120) NULL,
  tipo_panel  VARCHAR(30) NOT NULL DEFAULT 'enfermedades',
  fecha       DATE NOT NULL DEFAULT CURRENT_DATE,
  estado      VARCHAR(15) NOT NULL DEFAULT 'pendiente',
  resumen     TEXT NULL,
  archivo     VARCHAR(255) NULL,
  CONSTRAINT uq_perfiles_geneticos UNIQUE (codigo),
  CONSTRAINT chk_perfiles_gen_panel CHECK (tipo_panel IN (
    'enfermedades','razas','parentesco','rasgos','completo')),
  CONSTRAINT chk_perfiles_gen_estado CHECK (estado IN ('pendiente','procesando','informado','anulado')),
  CONSTRAINT fk_perfiles_gen_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE
);

CREATE TABLE genetica.muestras_geneticas (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id  INTEGER NOT NULL,
  perfil_id   INTEGER NULL,
  codigo      VARCHAR(40) NOT NULL,
  tipo        VARCHAR(20) NOT NULL DEFAULT 'hisopo',
  tomada_en   TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  tomada_por  INTEGER NULL,
  enviada_en  TIMESTAMP(0) NULL,
  estado      VARCHAR(15) NOT NULL DEFAULT 'tomada',
  CONSTRAINT uq_muestras_geneticas UNIQUE (codigo),
  CONSTRAINT chk_muestras_gen_tipo CHECK (tipo IN ('hisopo','sangre','tejido','pelo','saliva')),
  CONSTRAINT chk_muestras_gen_estado CHECK (estado IN ('tomada','enviada','procesada','rechazada')),
  CONSTRAINT fk_muestras_gen_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_muestras_gen_perfil FOREIGN KEY (perfil_id)
    REFERENCES genetica.perfiles_geneticos(id) ON DELETE SET NULL,
  CONSTRAINT fk_muestras_gen_usuario FOREIGN KEY (tomada_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE genetica.pruebas_geneticas (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  perfil_id     INTEGER NOT NULL,
  muestra_id    INTEGER NULL,
  enfermedad_id SMALLINT NULL,
  metodo        VARCHAR(40) NULL,
  laboratorio   VARCHAR(120) NULL,
  fecha         DATE NOT NULL DEFAULT CURRENT_DATE,
  estado        VARCHAR(15) NOT NULL DEFAULT 'pendiente',
  CONSTRAINT chk_pruebas_gen_estado CHECK (estado IN ('pendiente','procesando','informada','anulada')),
  CONSTRAINT fk_pruebas_gen_perfil FOREIGN KEY (perfil_id)
    REFERENCES genetica.perfiles_geneticos(id) ON DELETE CASCADE,
  CONSTRAINT fk_pruebas_gen_muestra FOREIGN KEY (muestra_id)
    REFERENCES genetica.muestras_geneticas(id) ON DELETE SET NULL,
  CONSTRAINT fk_pruebas_gen_enfermedad FOREIGN KEY (enfermedad_id)
    REFERENCES genetica.enfermedades_geneticas(id) ON DELETE SET NULL
);

CREATE TABLE genetica.resultados_geneticos (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  prueba_id      INTEGER NOT NULL,
  enfermedad_id  SMALLINT NULL,
  genotipo       VARCHAR(30) NULL,        -- N/N, N/M, M/M
  portador       SMALLINT NOT NULL DEFAULT 0,
  afectado       SMALLINT NOT NULL DEFAULT 0,
  riesgo         VARCHAR(10) NULL,
  interpretacion TEXT NULL,
  informe        VARCHAR(255) NULL,
  CONSTRAINT chk_resultados_gen_portador CHECK (portador IN (0,1)),
  CONSTRAINT chk_resultados_gen_afectado CHECK (afectado IN (0,1)),
  CONSTRAINT chk_resultados_gen_riesgo CHECK (riesgo IS NULL OR riesgo IN ('bajo','medio','alto')),
  CONSTRAINT fk_resultados_gen_prueba FOREIGN KEY (prueba_id)
    REFERENCES genetica.pruebas_geneticas(id) ON DELETE CASCADE,
  CONSTRAINT fk_resultados_gen_enfermedad FOREIGN KEY (enfermedad_id)
    REFERENCES genetica.enfermedades_geneticas(id) ON DELETE SET NULL
);

CREATE TABLE genetica.antecedentes_geneticos (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id    INTEGER NOT NULL,
  enfermedad_id SMALLINT NULL,
  parentesco    VARCHAR(20) NOT NULL DEFAULT 'padre',
  pariente      VARCHAR(120) NULL,
  pariente_mascota_id INTEGER NULL,
  confirmado    SMALLINT NOT NULL DEFAULT 0,
  notas         TEXT NULL,
  CONSTRAINT chk_antecedentes_gen_parentesco CHECK (parentesco IN (
    'padre','madre','abuelo','abuela','hermano','hermana','hijo','hija','otro')),
  CONSTRAINT chk_antecedentes_gen_confirmado CHECK (confirmado IN (0,1)),
  CONSTRAINT fk_antecedentes_gen_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_antecedentes_gen_enfermedad FOREIGN KEY (enfermedad_id)
    REFERENCES genetica.enfermedades_geneticas(id) ON DELETE SET NULL,
  CONSTRAINT fk_antecedentes_gen_pariente FOREIGN KEY (pariente_mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE SET NULL
);


-- =====================================================================
--  MÓDULO 52 · REPRODUCCIÓN  ·  MÓDULO 53 · NEONATOLOGÍA
--
--  La cadena es: ciclo -> cruzamiento o inseminación -> gestación ->
--  parto -> camada -> cachorros -> neonatos. Cada cachorro puede darse de
--  alta como mascota del sistema, y entonces `cachorros.mascota_id` las
--  une: así la ficha del adulto conserva su peso al nacer.
-- =====================================================================

CREATE TABLE reproduccion.ciclos_reproductivos (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id    INTEGER NOT NULL,
  fecha_inicio  DATE NOT NULL,
  fecha_fin     DATE NULL,
  fase          VARCHAR(15) NULL,
  duracion_dias SMALLINT NULL,
  citologia     VARCHAR(120) NULL,
  progesterona  NUMERIC(6,2) NULL,
  apta_monta    SMALLINT NOT NULL DEFAULT 0,
  observaciones TEXT NULL,
  CONSTRAINT chk_ciclos_fase CHECK (fase IS NULL OR fase IN ('proestro','estro','diestro','anestro')),
  CONSTRAINT chk_ciclos_apta CHECK (apta_monta IN (0,1)),
  CONSTRAINT fk_ciclos_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE
);
CREATE INDEX idx_ciclos_reproductivos ON reproduccion.ciclos_reproductivos (mascota_id, fecha_inicio DESC);

CREATE TABLE reproduccion.cruzamientos (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  hembra_id     INTEGER NOT NULL,
  macho_id      INTEGER NULL,
  macho_externo VARCHAR(140) NULL,
  ciclo_id      INTEGER NULL,
  fecha         DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo          VARCHAR(20) NOT NULL DEFAULT 'natural',
  lugar         VARCHAR(120) NULL,
  resultado     VARCHAR(15) NULL,
  observaciones TEXT NULL,
  CONSTRAINT chk_cruzamientos_tipo CHECK (tipo IN ('natural','asistida','inseminacion')),
  CONSTRAINT chk_cruzamientos_resultado CHECK (resultado IS NULL OR resultado IN (
    'gestante','no_gestante','pendiente')),
  CONSTRAINT fk_cruzamientos_hembra FOREIGN KEY (hembra_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_cruzamientos_macho FOREIGN KEY (macho_id)
    REFERENCES mascotas.mascotas(id) ON DELETE SET NULL,
  CONSTRAINT fk_cruzamientos_ciclo FOREIGN KEY (ciclo_id)
    REFERENCES reproduccion.ciclos_reproductivos(id) ON DELETE SET NULL
);

CREATE TABLE reproduccion.inseminaciones (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  hembra_id      INTEGER NOT NULL,
  cruzamiento_id INTEGER NULL,
  fecha          TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  tipo           VARCHAR(20) NOT NULL DEFAULT 'vaginal',
  semen_origen   VARCHAR(140) NULL,
  semen_estado   VARCHAR(15) NULL,
  volumen_ml     NUMERIC(5,2) NULL,
  concentracion  VARCHAR(40) NULL,
  motilidad_pct  NUMERIC(5,2) NULL,
  veterinario_id INTEGER NULL,
  resultado      VARCHAR(15) NULL,
  CONSTRAINT chk_inseminaciones_tipo CHECK (tipo IN ('vaginal','transcervical','quirurgica')),
  CONSTRAINT chk_inseminaciones_semen CHECK (semen_estado IS NULL OR semen_estado IN (
    'fresco','refrigerado','congelado')),
  CONSTRAINT fk_inseminaciones_hembra FOREIGN KEY (hembra_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_inseminaciones_cruzamiento FOREIGN KEY (cruzamiento_id)
    REFERENCES reproduccion.cruzamientos(id) ON DELETE SET NULL,
  CONSTRAINT fk_inseminaciones_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);

CREATE TABLE reproduccion.gestaciones (
  id                  INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  hembra_id           INTEGER NOT NULL,
  cruzamiento_id      INTEGER NULL,
  inseminacion_id     INTEGER NULL,
  fecha_monta         DATE NULL,
  fecha_probable_parto DATE NULL,
  confirmada_en       DATE NULL,
  metodo_confirmacion VARCHAR(25) NULL,
  numero_fetos        SMALLINT NULL,
  estado              VARCHAR(15) NOT NULL DEFAULT 'en_curso',
  veterinario_id      INTEGER NULL,
  observaciones       TEXT NULL,
  CONSTRAINT chk_gestaciones_metodo CHECK (metodo_confirmacion IS NULL OR metodo_confirmacion IN (
    'ecografia','radiografia','relaxina','palpacion')),
  CONSTRAINT chk_gestaciones_estado CHECK (estado IN ('en_curso','finalizada','aborto','reabsorcion','falsa')),
  CONSTRAINT fk_gestaciones_hembra FOREIGN KEY (hembra_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_gestaciones_cruzamiento FOREIGN KEY (cruzamiento_id)
    REFERENCES reproduccion.cruzamientos(id) ON DELETE SET NULL,
  CONSTRAINT fk_gestaciones_inseminacion FOREIGN KEY (inseminacion_id)
    REFERENCES reproduccion.inseminaciones(id) ON DELETE SET NULL,
  CONSTRAINT fk_gestaciones_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_gestaciones_estado ON reproduccion.gestaciones (estado, fecha_probable_parto);

CREATE TABLE reproduccion.controles_gestacion (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  gestacion_id   INTEGER NOT NULL,
  fecha          DATE NOT NULL DEFAULT CURRENT_DATE,
  semana         SMALLINT NULL,
  peso_kg        NUMERIC(6,2) NULL,
  ecografia      SMALLINT NOT NULL DEFAULT 0,
  latidos_fetales SMALLINT NULL,
  numero_fetos   SMALLINT NULL,
  hallazgos      TEXT NULL,
  veterinario_id INTEGER NULL,
  CONSTRAINT chk_controles_gestacion_eco CHECK (ecografia IN (0,1)),
  CONSTRAINT fk_controles_gestacion FOREIGN KEY (gestacion_id)
    REFERENCES reproduccion.gestaciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_controles_gestacion_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);

CREATE TABLE reproduccion.partos (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  gestacion_id   INTEGER NULL,
  hembra_id      INTEGER NOT NULL,
  fecha          TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  tipo           VARCHAR(15) NOT NULL DEFAULT 'natural',
  duracion_horas NUMERIC(5,2) NULL,
  asistido       SMALLINT NOT NULL DEFAULT 0,
  nacidos_vivos  SMALLINT NOT NULL DEFAULT 0,
  nacidos_muertos SMALLINT NOT NULL DEFAULT 0,
  complicaciones TEXT NULL,
  veterinario_id INTEGER NULL,
  sede_id        SMALLINT NULL,
  CONSTRAINT chk_partos_tipo CHECK (tipo IN ('natural','asistido','cesarea')),
  CONSTRAINT chk_partos_asistido CHECK (asistido IN (0,1)),
  CONSTRAINT fk_partos_gestacion FOREIGN KEY (gestacion_id)
    REFERENCES reproduccion.gestaciones(id) ON DELETE SET NULL,
  CONSTRAINT fk_partos_hembra FOREIGN KEY (hembra_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_partos_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_partos_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE SET NULL
);

CREATE TABLE reproduccion.camadas (
  id              INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  parto_id        INTEGER NULL,
  hembra_id       INTEGER NOT NULL,
  codigo          VARCHAR(40) NULL,
  fecha_nacimiento DATE NOT NULL DEFAULT CURRENT_DATE,
  total_crias     SMALLINT NOT NULL DEFAULT 0,
  machos          SMALLINT NOT NULL DEFAULT 0,
  hembras         SMALLINT NOT NULL DEFAULT 0,
  peso_promedio_g NUMERIC(7,2) NULL,
  estado          VARCHAR(15) NOT NULL DEFAULT 'lactancia',
  CONSTRAINT uq_camadas_codigo UNIQUE (codigo),
  CONSTRAINT chk_camadas_estado CHECK (estado IN ('lactancia','destete','entregada','cerrada')),
  CONSTRAINT fk_camadas_parto FOREIGN KEY (parto_id)
    REFERENCES reproduccion.partos(id) ON DELETE SET NULL,
  CONSTRAINT fk_camadas_hembra FOREIGN KEY (hembra_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE
);

CREATE TABLE reproduccion.cachorros (
  id                INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  camada_id         INTEGER NOT NULL,
  mascota_id        INTEGER NULL,          -- si se da de alta como paciente
  identificacion    VARCHAR(60) NULL,
  sexo              VARCHAR(12) NOT NULL DEFAULT 'desconocido',
  peso_nacimiento_g NUMERIC(7,2) NULL,
  color             VARCHAR(60) NULL,
  vivo              SMALLINT NOT NULL DEFAULT 1,
  malformaciones    VARCHAR(180) NULL,
  observaciones     TEXT NULL,
  CONSTRAINT chk_cachorros_sexo CHECK (sexo IN ('macho','hembra','desconocido')),
  CONSTRAINT chk_cachorros_vivo CHECK (vivo IN (0,1)),
  CONSTRAINT fk_cachorros_camada FOREIGN KEY (camada_id)
    REFERENCES reproduccion.camadas(id) ON DELETE CASCADE,
  CONSTRAINT fk_cachorros_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE SET NULL
);

CREATE TABLE reproduccion.seguimiento_reproductivo (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id    INTEGER NOT NULL,
  gestacion_id  INTEGER NULL,
  camada_id     INTEGER NULL,
  fecha         DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo          VARCHAR(20) NOT NULL DEFAULT 'posparto',
  hallazgos     TEXT NULL,
  proxima_fecha DATE NULL,
  veterinario_id INTEGER NULL,
  CONSTRAINT chk_seguimiento_reprod_tipo CHECK (tipo IN (
    'preparto','posparto','lactancia','destete','fertilidad','otro')),
  CONSTRAINT fk_seguimiento_reprod_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_seguimiento_reprod_gestacion FOREIGN KEY (gestacion_id)
    REFERENCES reproduccion.gestaciones(id) ON DELETE SET NULL,
  CONSTRAINT fk_seguimiento_reprod_camada FOREIGN KEY (camada_id)
    REFERENCES reproduccion.camadas(id) ON DELETE SET NULL,
  CONSTRAINT fk_seguimiento_reprod_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);

-- --- Neonatología (módulo 53) ----------------------------------------
-- En un neonato el peso diario ES el signo vital: una caída del 10 % en
-- 24 h es una urgencia. Por eso el peso tiene tabla propia y no una
-- columna dentro del control.

CREATE TABLE reproduccion.pacientes_neonatos (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cachorro_id    INTEGER NULL,
  camada_id      INTEGER NULL,
  mascota_id     INTEGER NULL,
  ingreso        TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  edad_dias      SMALLINT NOT NULL DEFAULT 0,
  peso_ingreso_g NUMERIC(7,2) NULL,
  riesgo         VARCHAR(10) NOT NULL DEFAULT 'medio',
  estado         VARCHAR(15) NOT NULL DEFAULT 'activo',
  egreso         TIMESTAMP(0) NULL,
  responsable_id INTEGER NULL,
  CONSTRAINT chk_neonatos_riesgo CHECK (riesgo IN ('bajo','medio','alto','critico')),
  CONSTRAINT chk_neonatos_estado CHECK (estado IN ('activo','alta','fallecido')),
  CONSTRAINT fk_neonatos_cachorro FOREIGN KEY (cachorro_id)
    REFERENCES reproduccion.cachorros(id) ON DELETE SET NULL,
  CONSTRAINT fk_neonatos_camada FOREIGN KEY (camada_id)
    REFERENCES reproduccion.camadas(id) ON DELETE SET NULL,
  CONSTRAINT fk_neonatos_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE SET NULL,
  CONSTRAINT fk_neonatos_usuario FOREIGN KEY (responsable_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_pacientes_neonatos ON reproduccion.pacientes_neonatos (estado, riesgo);

CREATE TABLE reproduccion.controles_neonatales (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  neonato_id     INTEGER NOT NULL,
  fecha          TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  edad_dias      SMALLINT NULL,
  frec_cardiaca  SMALLINT NULL,
  frec_respiratoria SMALLINT NULL,
  reflejo_succion VARCHAR(15) NULL,
  hidratacion    VARCHAR(20) NULL,
  glucemia       NUMERIC(6,2) NULL,
  observaciones  TEXT NULL,
  registrado_por INTEGER NULL,
  CONSTRAINT fk_controles_neonatales FOREIGN KEY (neonato_id)
    REFERENCES reproduccion.pacientes_neonatos(id) ON DELETE CASCADE,
  CONSTRAINT fk_controles_neonatales_usuario FOREIGN KEY (registrado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE reproduccion.peso_neonatal (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  neonato_id     INTEGER NOT NULL,
  fecha          TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  peso_g         NUMERIC(7,2) NOT NULL,
  variacion_pct  NUMERIC(6,2) NULL,
  alerta         SMALLINT NOT NULL DEFAULT 0,
  registrado_por INTEGER NULL,
  CONSTRAINT chk_peso_neonatal_alerta CHECK (alerta IN (0,1)),
  CONSTRAINT fk_peso_neonatal FOREIGN KEY (neonato_id)
    REFERENCES reproduccion.pacientes_neonatos(id) ON DELETE CASCADE,
  CONSTRAINT fk_peso_neonatal_usuario FOREIGN KEY (registrado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_peso_neonatal ON reproduccion.peso_neonatal (neonato_id, fecha DESC);

CREATE TABLE reproduccion.alimentacion_neonatal (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  neonato_id    INTEGER NOT NULL,
  fecha         TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  tipo          VARCHAR(20) NOT NULL DEFAULT 'materna',
  formula       VARCHAR(120) NULL,
  volumen_ml    NUMERIC(6,2) NULL,
  metodo        VARCHAR(20) NULL,
  tolerancia    VARCHAR(20) NULL,
  administrada_por INTEGER NULL,
  CONSTRAINT chk_alimentacion_neo_tipo CHECK (tipo IN ('materna','formula','mixta','sonda')),
  CONSTRAINT chk_alimentacion_neo_metodo CHECK (metodo IS NULL OR metodo IN (
    'succion','biberon','jeringa','sonda')),
  CONSTRAINT fk_alimentacion_neo FOREIGN KEY (neonato_id)
    REFERENCES reproduccion.pacientes_neonatos(id) ON DELETE CASCADE,
  CONSTRAINT fk_alimentacion_neo_usuario FOREIGN KEY (administrada_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE reproduccion.temperatura_neonatal (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  neonato_id     INTEGER NOT NULL,
  fecha          TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  temperatura_c  NUMERIC(4,1) NOT NULL,
  ambiente_c     NUMERIC(4,1) NULL,
  metodo_calor   VARCHAR(25) NULL,
  alerta         SMALLINT NOT NULL DEFAULT 0,
  registrado_por INTEGER NULL,
  CONSTRAINT chk_temperatura_neo_alerta CHECK (alerta IN (0,1)),
  CONSTRAINT fk_temperatura_neo FOREIGN KEY (neonato_id)
    REFERENCES reproduccion.pacientes_neonatos(id) ON DELETE CASCADE,
  CONSTRAINT fk_temperatura_neo_usuario FOREIGN KEY (registrado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE reproduccion.medicamentos_neonatales (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  neonato_id     INTEGER NOT NULL,
  medicamento_id INTEGER NULL,
  descripcion    VARCHAR(140) NOT NULL,
  dosis          VARCHAR(60) NULL,
  via            VARCHAR(20) NULL,
  frecuencia     VARCHAR(60) NULL,
  inicio         TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  fin            TIMESTAMP(0) NULL,
  estado         VARCHAR(15) NOT NULL DEFAULT 'activo',
  aplicado_por   INTEGER NULL,
  CONSTRAINT chk_medicamentos_neo_estado CHECK (estado IN ('activo','suspendido','finalizado')),
  CONSTRAINT fk_medicamentos_neo FOREIGN KEY (neonato_id)
    REFERENCES reproduccion.pacientes_neonatos(id) ON DELETE CASCADE,
  CONSTRAINT fk_medicamentos_neo_medicamento FOREIGN KEY (medicamento_id)
    REFERENCES historia_clinica.medicamentos(id) ON DELETE SET NULL,
  CONSTRAINT fk_medicamentos_neo_usuario FOREIGN KEY (aplicado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE reproduccion.mortalidad_neonatal (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  neonato_id    INTEGER NULL,
  camada_id     INTEGER NULL,
  cachorro_id   INTEGER NULL,
  fecha         TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  edad_dias     SMALLINT NULL,
  causa         VARCHAR(180) NULL,
  categoria     VARCHAR(25) NULL,
  necropsia     SMALLINT NOT NULL DEFAULT 0,
  hallazgos     TEXT NULL,
  registrado_por INTEGER NULL,
  CONSTRAINT chk_mortalidad_neo_categoria CHECK (categoria IS NULL OR categoria IN (
    'infecciosa','congenita','traumatica','nutricional','hipotermia','asfixia','desconocida')),
  CONSTRAINT chk_mortalidad_neo_necropsia CHECK (necropsia IN (0,1)),
  CONSTRAINT fk_mortalidad_neo FOREIGN KEY (neonato_id)
    REFERENCES reproduccion.pacientes_neonatos(id) ON DELETE SET NULL,
  CONSTRAINT fk_mortalidad_neo_camada FOREIGN KEY (camada_id)
    REFERENCES reproduccion.camadas(id) ON DELETE SET NULL,
  CONSTRAINT fk_mortalidad_neo_cachorro FOREIGN KEY (cachorro_id)
    REFERENCES reproduccion.cachorros(id) ON DELETE SET NULL,
  CONSTRAINT fk_mortalidad_neo_usuario FOREIGN KEY (registrado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);


-- =====================================================================
--  MÓDULO 55 · GESTIÓN DE RIESGO CLÍNICO
--
--  Todo lo que sale mal entra por la misma puerta: `eventos_adversos`.
--  Las tablas de abajo son el detalle según el tipo de evento, y todas
--  cuelgan de él. Así el indicador "cuántos eventos hubo este mes" se
--  cuenta una sola vez y no cuatro veces según dónde se registró.
-- =====================================================================

CREATE TABLE calidad.eventos_adversos (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id    INTEGER NULL,
  sede_id       SMALLINT NULL,
  tipo          VARCHAR(25) NOT NULL,
  fecha         TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  descripcion   TEXT NOT NULL,
  gravedad      VARCHAR(10) NOT NULL DEFAULT 'leve',
  dano          VARCHAR(20) NOT NULL DEFAULT 'ninguno',
  evitable      SMALLINT NULL,
  reportado_por INTEGER NULL,
  estado        VARCHAR(15) NOT NULL DEFAULT 'abierto',
  CONSTRAINT chk_eventos_adversos_tipo CHECK (tipo IN (
    'medicacion','procedimiento','caida','infeccion','reaccion','identificacion','equipo','otro')),
  CONSTRAINT chk_eventos_adversos_gravedad CHECK (gravedad IN ('leve','moderada','grave','centinela')),
  CONSTRAINT chk_eventos_adversos_dano CHECK (dano IN ('ninguno','temporal','permanente','muerte')),
  CONSTRAINT chk_eventos_adversos_evitable CHECK (evitable IS NULL OR evitable IN (0,1)),
  CONSTRAINT chk_eventos_adversos_estado CHECK (estado IN ('abierto','investigando','cerrado')),
  CONSTRAINT fk_eventos_adversos_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE SET NULL,
  CONSTRAINT fk_eventos_adversos_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE SET NULL,
  CONSTRAINT fk_eventos_adversos_usuario FOREIGN KEY (reportado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_eventos_adversos ON calidad.eventos_adversos (estado, gravedad, fecha DESC);

CREATE TABLE calidad.errores_medicacion (
  id                 INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  evento_id          INTEGER NOT NULL,
  mascota_id         INTEGER NULL,
  medicamento_id     INTEGER NULL,
  tipo_error         VARCHAR(25) NOT NULL,
  etapa              VARCHAR(20) NOT NULL DEFAULT 'administracion',
  dosis_prescrita    VARCHAR(60) NULL,
  dosis_administrada VARCHAR(60) NULL,
  alcanzo_paciente   SMALLINT NOT NULL DEFAULT 0,
  detectado_en       VARCHAR(30) NULL,
  consecuencia       TEXT NULL,
  CONSTRAINT chk_errores_medicacion_tipo CHECK (tipo_error IN (
    'dosis','medicamento','via','paciente','frecuencia','omision','duplicidad','caducado','otro')),
  CONSTRAINT chk_errores_medicacion_etapa CHECK (etapa IN (
    'prescripcion','transcripcion','dispensacion','administracion','seguimiento')),
  CONSTRAINT chk_errores_medicacion_alcanzo CHECK (alcanzo_paciente IN (0,1)),
  CONSTRAINT fk_errores_medicacion_evento FOREIGN KEY (evento_id)
    REFERENCES calidad.eventos_adversos(id) ON DELETE CASCADE,
  CONSTRAINT fk_errores_medicacion_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE SET NULL,
  CONSTRAINT fk_errores_medicacion_medicamento FOREIGN KEY (medicamento_id)
    REFERENCES historia_clinica.medicamentos(id) ON DELETE SET NULL
);

CREATE TABLE calidad.errores_procedimiento (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  evento_id    INTEGER NOT NULL,
  mascota_id   INTEGER NULL,
  cirugia_id   INTEGER NULL,
  procedimiento VARCHAR(140) NOT NULL,
  tipo_error   VARCHAR(25) NOT NULL,
  etapa        VARCHAR(20) NOT NULL DEFAULT 'intraoperatorio',
  descripcion  TEXT NULL,
  consecuencia TEXT NULL,
  CONSTRAINT chk_errores_proc_tipo CHECK (tipo_error IN (
    'sitio_incorrecto','paciente_incorrecto','material_retenido','tecnica','asepsia','consentimiento','otro')),
  CONSTRAINT chk_errores_proc_etapa CHECK (etapa IN (
    'preoperatorio','intraoperatorio','postoperatorio')),
  CONSTRAINT fk_errores_proc_evento FOREIGN KEY (evento_id)
    REFERENCES calidad.eventos_adversos(id) ON DELETE CASCADE,
  CONSTRAINT fk_errores_proc_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE SET NULL,
  CONSTRAINT fk_errores_proc_cirugia FOREIGN KEY (cirugia_id)
    REFERENCES historia_clinica.cirugias(id) ON DELETE SET NULL
);

CREATE TABLE calidad.caidas (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  evento_id    INTEGER NOT NULL,
  mascota_id   INTEGER NULL,
  sede_id      SMALLINT NULL,
  lugar        VARCHAR(120) NULL,
  fecha        TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  altura_cm    SMALLINT NULL,
  circunstancia TEXT NULL,
  lesion       VARCHAR(180) NULL,
  atendida     SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT chk_caidas_atendida CHECK (atendida IN (0,1)),
  CONSTRAINT fk_caidas_evento FOREIGN KEY (evento_id)
    REFERENCES calidad.eventos_adversos(id) ON DELETE CASCADE,
  CONSTRAINT fk_caidas_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE SET NULL,
  CONSTRAINT fk_caidas_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE SET NULL
);

-- Infecciones asociadas a la atención (nosocomiales). El caso clínico y su
-- aislamiento viven en el módulo 57; aquí solo interesa como evento adverso.
CREATE TABLE calidad.infecciones (
  id              INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  evento_id       INTEGER NOT NULL,
  mascota_id      INTEGER NULL,
  tipo            VARCHAR(25) NOT NULL DEFAULT 'quirurgica',
  foco            VARCHAR(120) NULL,
  agente          VARCHAR(120) NULL,
  adquirida_en    VARCHAR(30) NULL,
  fecha_deteccion DATE NOT NULL DEFAULT CURRENT_DATE,
  tratamiento     TEXT NULL,
  desenlace       VARCHAR(20) NULL,
  CONSTRAINT chk_infecciones_tipo CHECK (tipo IN (
    'quirurgica','urinaria','respiratoria','cateter','digestiva','cutanea','otra')),
  CONSTRAINT fk_infecciones_evento FOREIGN KEY (evento_id)
    REFERENCES calidad.eventos_adversos(id) ON DELETE CASCADE,
  CONSTRAINT fk_infecciones_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE SET NULL
);

CREATE TABLE calidad.reacciones (
  id         INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  evento_id  INTEGER NOT NULL,
  mascota_id INTEGER NULL,
  tipo       VARCHAR(25) NOT NULL DEFAULT 'medicamentosa',
  agente     VARCHAR(140) NULL,
  signos     TEXT NULL,
  gravedad   VARCHAR(10) NOT NULL DEFAULT 'leve',
  manejo     TEXT NULL,
  desenlace  VARCHAR(20) NULL,
  fecha      TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_reacciones_calidad_tipo CHECK (tipo IN (
    'medicamentosa','vacunal','transfusional','anestesica','alimentaria','otra')),
  CONSTRAINT chk_reacciones_calidad_gravedad CHECK (gravedad IN ('leve','moderada','grave','mortal')),
  CONSTRAINT fk_reacciones_calidad_evento FOREIGN KEY (evento_id)
    REFERENCES calidad.eventos_adversos(id) ON DELETE CASCADE,
  CONSTRAINT fk_reacciones_calidad_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE SET NULL
);

CREATE TABLE calidad.investigaciones (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  evento_id      INTEGER NOT NULL,
  responsable_id INTEGER NULL,
  abierta_en     DATE NOT NULL DEFAULT CURRENT_DATE,
  metodo         VARCHAR(25) NOT NULL DEFAULT 'causa_raiz',
  causa_raiz     TEXT NULL,
  factores       TEXT NULL,
  conclusion     TEXT NULL,
  cerrada_en     DATE NULL,
  estado         VARCHAR(15) NOT NULL DEFAULT 'abierta',
  CONSTRAINT chk_investigaciones_metodo CHECK (metodo IN (
    'causa_raiz','espina_pescado','cinco_porques','protocolo_londres','otro')),
  CONSTRAINT chk_investigaciones_estado CHECK (estado IN ('abierta','en_curso','cerrada')),
  CONSTRAINT fk_investigaciones_evento FOREIGN KEY (evento_id)
    REFERENCES calidad.eventos_adversos(id) ON DELETE CASCADE,
  CONSTRAINT fk_investigaciones_usuario FOREIGN KEY (responsable_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE calidad.acciones_correctivas (
  id               INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  investigacion_id INTEGER NULL,
  evento_id        INTEGER NULL,
  descripcion      TEXT NOT NULL,
  tipo             VARCHAR(20) NOT NULL DEFAULT 'correctiva',
  responsable_id   INTEGER NULL,
  fecha_limite     DATE NULL,
  estado           VARCHAR(15) NOT NULL DEFAULT 'pendiente',
  verificada_en    DATE NULL,
  eficacia         VARCHAR(15) NULL,
  CONSTRAINT chk_acciones_correctivas_tipo CHECK (tipo IN ('correctiva','preventiva','mejora')),
  CONSTRAINT chk_acciones_correctivas_estado CHECK (estado IN ('pendiente','en_curso','cumplida','vencida')),
  CONSTRAINT chk_acciones_correctivas_eficacia CHECK (eficacia IS NULL OR eficacia IN (
    'eficaz','parcial','ineficaz')),
  CONSTRAINT fk_acciones_correctivas_investigacion FOREIGN KEY (investigacion_id)
    REFERENCES calidad.investigaciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_acciones_correctivas_evento FOREIGN KEY (evento_id)
    REFERENCES calidad.eventos_adversos(id) ON DELETE SET NULL,
  CONSTRAINT fk_acciones_correctivas_usuario FOREIGN KEY (responsable_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);


-- =====================================================================
--  MÓDULO 56 · SEGURIDAD DEL PACIENTE
--
--  Las listas de verificación se guardan ítem por ítem, con quién lo
--  marcó y cuándo. Un checklist como un solo "sí" no sirve de nada
--  cuando hay que demostrar que se comprobó el sitio quirúrgico.
-- =====================================================================

CREATE TABLE calidad.identificacion_paciente (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id   INTEGER NOT NULL,
  metodo       VARCHAR(20) NOT NULL DEFAULT 'manilla',
  codigo       VARCHAR(60) NULL,
  colocada_en  TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  colocada_por INTEGER NULL,
  verificada_en TIMESTAMP(0) NULL,
  retirada_en  TIMESTAMP(0) NULL,
  activa       SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT chk_identificacion_metodo CHECK (metodo IN ('manilla','collar','microchip','qr','jaula')),
  CONSTRAINT chk_identificacion_activa CHECK (activa IN (0,1)),
  CONSTRAINT fk_identificacion_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_identificacion_usuario FOREIGN KEY (colocada_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE calidad.verificaciones_preprocedimiento (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id    INTEGER NOT NULL,
  cirugia_id    INTEGER NULL,
  procedimiento VARCHAR(140) NOT NULL,
  tipo          VARCHAR(20) NOT NULL DEFAULT 'cirugia',
  fecha         TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  identidad_ok  SMALLINT NOT NULL DEFAULT 0,
  sitio_ok      SMALLINT NOT NULL DEFAULT 0,
  consentimiento_ok SMALLINT NOT NULL DEFAULT 0,
  ayuno_ok      SMALLINT NOT NULL DEFAULT 0,
  material_ok   SMALLINT NOT NULL DEFAULT 0,
  verificado_por INTEGER NULL,
  observaciones TEXT NULL,
  CONSTRAINT chk_verificaciones_tipo CHECK (tipo IN ('cirugia','anestesia','imagen','transfusion','otro')),
  CONSTRAINT chk_verificaciones_identidad CHECK (identidad_ok IN (0,1)),
  CONSTRAINT chk_verificaciones_sitio CHECK (sitio_ok IN (0,1)),
  CONSTRAINT fk_verificaciones_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_verificaciones_cirugia FOREIGN KEY (cirugia_id)
    REFERENCES historia_clinica.cirugias(id) ON DELETE SET NULL,
  CONSTRAINT fk_verificaciones_usuario FOREIGN KEY (verificado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE calidad.checklist_cirugia (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cirugia_id    INTEGER NOT NULL,
  mascota_id    INTEGER NULL,
  momento       VARCHAR(15) NOT NULL DEFAULT 'entrada',
  item          VARCHAR(180) NOT NULL,
  cumplido      SMALLINT NOT NULL DEFAULT 0,
  responsable_id INTEGER NULL,
  registrado_en TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  nota          VARCHAR(180) NULL,
  CONSTRAINT chk_checklist_cirugia_momento CHECK (momento IN ('entrada','pausa','salida')),
  CONSTRAINT chk_checklist_cirugia_cumplido CHECK (cumplido IN (0,1)),
  CONSTRAINT fk_checklist_cirugia FOREIGN KEY (cirugia_id)
    REFERENCES historia_clinica.cirugias(id) ON DELETE CASCADE,
  CONSTRAINT fk_checklist_cirugia_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE SET NULL,
  CONSTRAINT fk_checklist_cirugia_usuario FOREIGN KEY (responsable_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_checklist_cirugia ON calidad.checklist_cirugia (cirugia_id, momento);

CREATE TABLE calidad.checklist_anestesia (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cirugia_id    INTEGER NULL,
  evaluacion_anestesica_id INTEGER NULL,
  mascota_id    INTEGER NULL,
  momento       VARCHAR(15) NOT NULL DEFAULT 'previo',
  item          VARCHAR(180) NOT NULL,
  cumplido      SMALLINT NOT NULL DEFAULT 0,
  responsable_id INTEGER NULL,
  registrado_en TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  nota          VARCHAR(180) NULL,
  CONSTRAINT chk_checklist_anestesia_momento CHECK (momento IN ('previo','induccion','mantenimiento','recuperacion')),
  CONSTRAINT chk_checklist_anestesia_cumplido CHECK (cumplido IN (0,1)),
  CONSTRAINT fk_checklist_anestesia_cirugia FOREIGN KEY (cirugia_id)
    REFERENCES historia_clinica.cirugias(id) ON DELETE CASCADE,
  CONSTRAINT fk_checklist_anestesia_evaluacion FOREIGN KEY (evaluacion_anestesica_id)
    REFERENCES anestesia.evaluaciones_anestesicas(id) ON DELETE SET NULL,
  CONSTRAINT fk_checklist_anestesia_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE SET NULL,
  CONSTRAINT fk_checklist_anestesia_usuario FOREIGN KEY (responsable_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE calidad.checklist_alta (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id    INTEGER NOT NULL,
  hospitalizacion_id INTEGER NULL,
  item          VARCHAR(180) NOT NULL,
  cumplido      SMALLINT NOT NULL DEFAULT 0,
  responsable_id INTEGER NULL,
  registrado_en TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  nota          VARCHAR(180) NULL,
  CONSTRAINT chk_checklist_alta_cumplido CHECK (cumplido IN (0,1)),
  CONSTRAINT fk_checklist_alta_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_checklist_alta_hosp FOREIGN KEY (hospitalizacion_id)
    REFERENCES historia_clinica.hospitalizaciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_checklist_alta_usuario FOREIGN KEY (responsable_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE calidad.controles_seguridad (
  id              INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id         SMALLINT NULL,
  tipo            VARCHAR(25) NOT NULL DEFAULT 'ronda',
  area            VARCHAR(120) NULL,
  fecha           DATE NOT NULL DEFAULT CURRENT_DATE,
  responsable_id  INTEGER NULL,
  items_evaluados SMALLINT NOT NULL DEFAULT 0,
  items_cumplidos SMALLINT NOT NULL DEFAULT 0,
  cumplimiento_pct NUMERIC(5,2) NULL,
  hallazgos       TEXT NULL,
  acciones        TEXT NULL,
  CONSTRAINT chk_controles_seguridad_tipo CHECK (tipo IN (
    'ronda','auditoria','simulacro','revision_equipos','revision_medicacion')),
  CONSTRAINT fk_controles_seguridad_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE SET NULL,
  CONSTRAINT fk_controles_seguridad_usuario FOREIGN KEY (responsable_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);


-- =====================================================================
--  MÓDULO 57 · CONTROL DE INFECCIONES
--
--  Un caso infeccioso obliga a aislar, y el aislamiento hay que
--  controlarlo todos los días. La limpieza del área queda ligada a la
--  desinfección concreta que se hizo, con producto y tiempo de contacto:
--  sin eso no se puede demostrar que el protocolo se cumplió.
-- =====================================================================

CREATE TABLE calidad.protocolos_infeccion (
  id            SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre        VARCHAR(140) NOT NULL,
  agente        VARCHAR(120) NULL,
  categoria     VARCHAR(25) NOT NULL DEFAULT 'contacto',
  medidas       TEXT NULL,
  duracion_dias SMALLINT NULL,
  activo        SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_protocolos_infeccion UNIQUE (nombre),
  CONSTRAINT chk_protocolos_infeccion_categoria CHECK (categoria IN (
    'contacto','gotas','aerea','vectorial','estricto')),
  CONSTRAINT chk_protocolos_infeccion_activo CHECK (activo IN (0,1))
);

CREATE TABLE calidad.casos_infecciosos (
  id              INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id      INTEGER NOT NULL,
  protocolo_id    SMALLINT NULL,
  sede_id         SMALLINT NULL,
  agente          VARCHAR(120) NULL,
  tipo            VARCHAR(20) NOT NULL DEFAULT 'sospechoso',
  confirmado      SMALLINT NOT NULL DEFAULT 0,
  fecha_deteccion DATE NOT NULL DEFAULT CURRENT_DATE,
  origen          VARCHAR(20) NULL,
  notificado      SMALLINT NOT NULL DEFAULT 0,
  estado          VARCHAR(15) NOT NULL DEFAULT 'activo',
  CONSTRAINT chk_casos_infecciosos_tipo CHECK (tipo IN ('sospechoso','probable','confirmado','descartado')),
  CONSTRAINT chk_casos_infecciosos_origen CHECK (origen IS NULL OR origen IN (
    'comunitario','nosocomial','desconocido')),
  CONSTRAINT chk_casos_infecciosos_confirmado CHECK (confirmado IN (0,1)),
  CONSTRAINT chk_casos_infecciosos_notificado CHECK (notificado IN (0,1)),
  CONSTRAINT chk_casos_infecciosos_estado CHECK (estado IN ('activo','resuelto','fallecido')),
  CONSTRAINT fk_casos_infecciosos_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_casos_infecciosos_protocolo FOREIGN KEY (protocolo_id)
    REFERENCES calidad.protocolos_infeccion(id) ON DELETE SET NULL,
  CONSTRAINT fk_casos_infecciosos_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE SET NULL
);
CREATE INDEX idx_casos_infecciosos ON calidad.casos_infecciosos (estado, fecha_deteccion DESC);

CREATE TABLE calidad.aislamientos (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  caso_id     INTEGER NULL,
  mascota_id  INTEGER NOT NULL,
  sede_id     SMALLINT NULL,
  habitacion_id SMALLINT NULL,
  area        VARCHAR(120) NULL,
  tipo        VARCHAR(20) NOT NULL DEFAULT 'contacto',
  inicio      TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  fin         TIMESTAMP(0) NULL,
  motivo      TEXT NULL,
  estado      VARCHAR(15) NOT NULL DEFAULT 'activo',
  CONSTRAINT chk_aislamientos_tipo CHECK (tipo IN ('contacto','gotas','aereo','protector','estricto')),
  CONSTRAINT chk_aislamientos_estado CHECK (estado IN ('activo','levantado')),
  CONSTRAINT fk_aislamientos_caso FOREIGN KEY (caso_id)
    REFERENCES calidad.casos_infecciosos(id) ON DELETE CASCADE,
  CONSTRAINT fk_aislamientos_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_aislamientos_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE SET NULL,
  CONSTRAINT fk_aislamientos_habitacion FOREIGN KEY (habitacion_id)
    REFERENCES historia_clinica.habitaciones(id) ON DELETE SET NULL
);

CREATE TABLE calidad.controles_aislamiento (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  aislamiento_id INTEGER NOT NULL,
  fecha          TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  responsable_id INTEGER NULL,
  cumple_epp     SMALLINT NOT NULL DEFAULT 1,
  senalizacion   SMALLINT NOT NULL DEFAULT 1,
  signos         TEXT NULL,
  observaciones  TEXT NULL,
  CONSTRAINT chk_controles_aislamiento_epp CHECK (cumple_epp IN (0,1)),
  CONSTRAINT chk_controles_aislamiento_senal CHECK (senalizacion IN (0,1)),
  CONSTRAINT fk_controles_aislamiento FOREIGN KEY (aislamiento_id)
    REFERENCES calidad.aislamientos(id) ON DELETE CASCADE,
  CONSTRAINT fk_controles_aislamiento_usuario FOREIGN KEY (responsable_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE calidad.limpieza_areas (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id        SMALLINT NULL,
  area           VARCHAR(120) NOT NULL,
  habitacion_id  SMALLINT NULL,
  tipo           VARCHAR(20) NOT NULL DEFAULT 'rutinaria',
  fecha          TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  responsable_id INTEGER NULL,
  productos      VARCHAR(180) NULL,
  verificada     SMALLINT NOT NULL DEFAULT 0,
  observaciones  TEXT NULL,
  CONSTRAINT chk_limpieza_areas_tipo CHECK (tipo IN ('rutinaria','terminal','emergencia','preoperatoria')),
  CONSTRAINT chk_limpieza_areas_verificada CHECK (verificada IN (0,1)),
  CONSTRAINT fk_limpieza_areas_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE SET NULL,
  CONSTRAINT fk_limpieza_areas_habitacion FOREIGN KEY (habitacion_id)
    REFERENCES historia_clinica.habitaciones(id) ON DELETE SET NULL,
  CONSTRAINT fk_limpieza_areas_usuario FOREIGN KEY (responsable_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_limpieza_areas ON calidad.limpieza_areas (sede_id, fecha DESC);

CREATE TABLE calidad.desinfecciones (
  id                 INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  limpieza_id        INTEGER NULL,
  sede_id            SMALLINT NULL,
  area               VARCHAR(120) NOT NULL,
  metodo             VARCHAR(25) NOT NULL DEFAULT 'quimica',
  producto           VARCHAR(140) NULL,
  concentracion      VARCHAR(40) NULL,
  tiempo_contacto_min SMALLINT NULL,
  fecha              TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  responsable_id     INTEGER NULL,
  CONSTRAINT chk_desinfecciones_metodo CHECK (metodo IN (
    'quimica','termica','ultravioleta','vaporizacion','ozono')),
  CONSTRAINT fk_desinfecciones_limpieza FOREIGN KEY (limpieza_id)
    REFERENCES calidad.limpieza_areas(id) ON DELETE CASCADE,
  CONSTRAINT fk_desinfecciones_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE SET NULL,
  CONSTRAINT fk_desinfecciones_usuario FOREIGN KEY (responsable_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE calidad.indicadores_infeccion (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id     SMALLINT NULL,
  periodo     VARCHAR(7) NOT NULL,        -- AAAA-MM
  indicador   VARCHAR(80) NOT NULL,
  numerador   INTEGER NOT NULL DEFAULT 0,
  denominador INTEGER NOT NULL DEFAULT 0,
  tasa        NUMERIC(8,3) NULL,
  meta        NUMERIC(8,3) NULL,
  calculado_en TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_indicadores_infeccion UNIQUE (sede_id, periodo, indicador),
  CONSTRAINT fk_indicadores_infeccion_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE CASCADE
);


-- =====================================================================
--  MÓDULO 58 · TRAZABILIDAD CLÍNICA
--
--  seguridad.auditoria ya guarda quién cambió qué en TODO el sistema.
--  Esto es lo mismo pero acotado a la historia clínica y con el nivel de
--  detalle que exige un documento médico: quién la abrió y por qué, qué
--  campo se corrigió y quién firmó cada procedimiento.
-- =====================================================================

CREATE TABLE calidad.eventos_clinicos (
  id         INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id INTEGER NOT NULL,
  tipo       VARCHAR(30) NOT NULL,
  entidad    VARCHAR(40) NULL,
  entidad_id INTEGER NULL,
  usuario_id INTEGER NULL,
  sede_id    SMALLINT NULL,
  fecha      TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  resumen    VARCHAR(240) NULL,
  CONSTRAINT fk_eventos_clinicos_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_eventos_clinicos_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_eventos_clinicos_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE SET NULL
);
CREATE INDEX idx_eventos_clinicos ON calidad.eventos_clinicos (mascota_id, fecha DESC);

CREATE TABLE calidad.modificaciones_historia (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  historia_id  INTEGER NULL,
  mascota_id   INTEGER NULL,
  tabla        VARCHAR(60) NOT NULL,
  registro_id  INTEGER NULL,
  campo        VARCHAR(60) NOT NULL,
  valor_antes  TEXT NULL,
  valor_despues TEXT NULL,
  usuario_id   INTEGER NULL,
  motivo       VARCHAR(240) NULL,
  fecha        TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  ip           VARCHAR(45) NULL,
  CONSTRAINT fk_modificaciones_historia FOREIGN KEY (historia_id)
    REFERENCES historia_clinica.historias_clinicas(id) ON DELETE CASCADE,
  CONSTRAINT fk_modificaciones_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE SET NULL,
  CONSTRAINT fk_modificaciones_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_modificaciones_historia ON calidad.modificaciones_historia (historia_id, fecha DESC);

CREATE TABLE calidad.accesos_historia (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  historia_id INTEGER NULL,
  mascota_id  INTEGER NULL,
  usuario_id  INTEGER NULL,
  rol         VARCHAR(30) NULL,
  motivo      VARCHAR(180) NULL,
  autorizado  SMALLINT NOT NULL DEFAULT 1,
  ip          VARCHAR(45) NULL,
  fecha       TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_accesos_historia_autorizado CHECK (autorizado IN (0,1)),
  CONSTRAINT fk_accesos_historia FOREIGN KEY (historia_id)
    REFERENCES historia_clinica.historias_clinicas(id) ON DELETE CASCADE,
  CONSTRAINT fk_accesos_historia_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE SET NULL,
  CONSTRAINT fk_accesos_historia_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_accesos_historia ON calidad.accesos_historia (historia_id, fecha DESC);

CREATE TABLE calidad.firmas_profesionales (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  usuario_id  INTEGER NOT NULL,
  entidad     VARCHAR(40) NOT NULL,
  entidad_id  INTEGER NOT NULL,
  tipo_firma  VARCHAR(20) NOT NULL DEFAULT 'electronica',
  hash_documento VARCHAR(64) NULL,
  firmado_en  TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  ip          VARCHAR(45) NULL,
  valida      SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT chk_firmas_prof_tipo CHECK (tipo_firma IN ('electronica','digital','manuscrita')),
  CONSTRAINT chk_firmas_prof_valida CHECK (valida IN (0,1)),
  CONSTRAINT fk_firmas_prof_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios.usuarios(id) ON DELETE CASCADE
);
CREATE INDEX idx_firmas_profesionales ON calidad.firmas_profesionales (entidad, entidad_id);

CREATE TABLE calidad.validaciones_clinicas (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  entidad      VARCHAR(40) NOT NULL,
  entidad_id   INTEGER NOT NULL,
  mascota_id   INTEGER NULL,
  tipo         VARCHAR(25) NOT NULL DEFAULT 'revision',
  resultado    VARCHAR(15) NOT NULL DEFAULT 'aprobada',
  validado_por INTEGER NULL,
  comentario   TEXT NULL,
  fecha        TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_validaciones_clinicas_resultado CHECK (resultado IN ('aprobada','rechazada','con_reparos')),
  CONSTRAINT fk_validaciones_clinicas_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE SET NULL,
  CONSTRAINT fk_validaciones_clinicas_usuario FOREIGN KEY (validado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE calidad.historial_documentos (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  documento_tipo VARCHAR(40) NOT NULL,
  documento_id   INTEGER NOT NULL,
  mascota_id     INTEGER NULL,
  accion         VARCHAR(20) NOT NULL,
  version        SMALLINT NULL,
  usuario_id     INTEGER NULL,
  fecha          TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  detalle        TEXT NULL,
  CONSTRAINT chk_historial_documentos_accion CHECK (accion IN (
    'creado','editado','firmado','anulado','descargado','compartido','archivado')),
  CONSTRAINT fk_historial_documentos_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE SET NULL,
  CONSTRAINT fk_historial_documentos_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);


-- =====================================================================
--  MÓDULO 59 · SEGUNDA OPINIÓN  ·  MÓDULO 60 · REFERENCIAS MÉDICAS
--
--  Dos formas de sacar al paciente del consultorio: pedirle a otro
--  profesional que mire el caso (sin mover al animal) o remitirlo a otra
--  institución. La contrarreferencia —lo que el otro respondió— es la
--  parte que casi siempre se pierde, así que aquí es una columna.
-- =====================================================================

CREATE TABLE interconsulta.especialistas (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  usuario_id  INTEGER NULL,               -- si es alguien de la propia clínica
  nombre      VARCHAR(140) NOT NULL,
  especialidad VARCHAR(80) NOT NULL,
  institucion VARCHAR(140) NULL,
  licencia    VARCHAR(60) NULL,
  externo     SMALLINT NOT NULL DEFAULT 1,
  email       VARCHAR(160) NULL,
  telefono    VARCHAR(30) NULL,
  activo      SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT chk_especialistas_externo CHECK (externo IN (0,1)),
  CONSTRAINT chk_especialistas_activo CHECK (activo IN (0,1)),
  CONSTRAINT fk_especialistas_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE interconsulta.solicitudes_opinion (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id     INTEGER NOT NULL,
  consulta_id    INTEGER NULL,
  solicitante_id INTEGER NULL,
  especialista_id INTEGER NULL,
  especialidad   VARCHAR(80) NULL,
  motivo         TEXT NOT NULL,
  pregunta       TEXT NULL,
  urgencia       VARCHAR(10) NOT NULL DEFAULT 'normal',
  estado         VARCHAR(15) NOT NULL DEFAULT 'pendiente',
  fecha          TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  respuesta_en   TIMESTAMP(0) NULL,
  CONSTRAINT chk_solicitudes_opinion_urgencia CHECK (urgencia IN ('normal','prioritaria','urgente')),
  CONSTRAINT chk_solicitudes_opinion_estado CHECK (estado IN (
    'pendiente','enviada','respondida','cerrada','cancelada')),
  CONSTRAINT fk_solicitudes_opinion_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_solicitudes_opinion_consulta FOREIGN KEY (consulta_id)
    REFERENCES historia_clinica.consultas(id) ON DELETE SET NULL,
  CONSTRAINT fk_solicitudes_opinion_usuario FOREIGN KEY (solicitante_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_solicitudes_opinion_especialista FOREIGN KEY (especialista_id)
    REFERENCES interconsulta.especialistas(id) ON DELETE SET NULL
);
CREATE INDEX idx_solicitudes_opinion ON interconsulta.solicitudes_opinion (estado, urgencia, fecha DESC);

CREATE TABLE interconsulta.documentos_compartidos (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  solicitud_id   INTEGER NOT NULL,
  tipo           VARCHAR(30) NOT NULL,
  referencia_tipo VARCHAR(40) NULL,
  referencia_id  INTEGER NULL,
  archivo        VARCHAR(255) NULL,
  descripcion    VARCHAR(180) NULL,
  compartido_en  TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  compartido_por INTEGER NULL,
  CONSTRAINT chk_documentos_compartidos_tipo CHECK (tipo IN (
    'historia','laboratorio','imagen','video','foto','informe','otro')),
  CONSTRAINT fk_documentos_compartidos_solicitud FOREIGN KEY (solicitud_id)
    REFERENCES interconsulta.solicitudes_opinion(id) ON DELETE CASCADE,
  CONSTRAINT fk_documentos_compartidos_usuario FOREIGN KEY (compartido_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE interconsulta.opiniones (
  id              INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  solicitud_id    INTEGER NOT NULL,
  especialista_id INTEGER NULL,
  fecha           TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  resumen         TEXT NOT NULL,
  diagnostico     VARCHAR(240) NULL,
  concuerda       SMALLINT NULL,
  fundamento      TEXT NULL,
  archivo         VARCHAR(255) NULL,
  CONSTRAINT chk_opiniones_concuerda CHECK (concuerda IS NULL OR concuerda IN (0,1)),
  CONSTRAINT fk_opiniones_solicitud FOREIGN KEY (solicitud_id)
    REFERENCES interconsulta.solicitudes_opinion(id) ON DELETE CASCADE,
  CONSTRAINT fk_opiniones_especialista FOREIGN KEY (especialista_id)
    REFERENCES interconsulta.especialistas(id) ON DELETE SET NULL
);

CREATE TABLE interconsulta.recomendaciones (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  opinion_id  INTEGER NULL,
  solicitud_id INTEGER NULL,
  texto       TEXT NOT NULL,
  tipo        VARCHAR(25) NOT NULL DEFAULT 'tratamiento',
  prioridad   VARCHAR(10) NOT NULL DEFAULT 'media',
  aceptada    SMALLINT NULL,
  aplicada_en DATE NULL,
  CONSTRAINT chk_recomendaciones_tipo CHECK (tipo IN (
    'diagnostico','tratamiento','examen','derivacion','seguimiento','otro')),
  CONSTRAINT chk_recomendaciones_prioridad CHECK (prioridad IN ('baja','media','alta')),
  CONSTRAINT chk_recomendaciones_aceptada CHECK (aceptada IS NULL OR aceptada IN (0,1)),
  CONSTRAINT fk_recomendaciones_opinion FOREIGN KEY (opinion_id)
    REFERENCES interconsulta.opiniones(id) ON DELETE CASCADE,
  CONSTRAINT fk_recomendaciones_solicitud FOREIGN KEY (solicitud_id)
    REFERENCES interconsulta.solicitudes_opinion(id) ON DELETE CASCADE
);

CREATE TABLE interconsulta.seguimiento_opinion (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  solicitud_id INTEGER NOT NULL,
  mascota_id   INTEGER NULL,
  fecha        DATE NOT NULL DEFAULT CURRENT_DATE,
  estado       VARCHAR(20) NOT NULL DEFAULT 'en_curso',
  aplicada     SMALLINT NOT NULL DEFAULT 0,
  resultado    TEXT NULL,
  notas        TEXT NULL,
  CONSTRAINT chk_seguimiento_opinion_estado CHECK (estado IN ('en_curso','cerrado','sin_respuesta')),
  CONSTRAINT chk_seguimiento_opinion_aplicada CHECK (aplicada IN (0,1)),
  CONSTRAINT fk_seguimiento_opinion_solicitud FOREIGN KEY (solicitud_id)
    REFERENCES interconsulta.solicitudes_opinion(id) ON DELETE CASCADE,
  CONSTRAINT fk_seguimiento_opinion_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE SET NULL
);

-- --- Referencias médicas (módulo 60) ---------------------------------

CREATE TABLE interconsulta.instituciones_referidas (
  id        INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre    VARCHAR(160) NOT NULL,
  tipo      VARCHAR(25) NOT NULL DEFAULT 'clinica',
  nit       VARCHAR(30) NULL,
  direccion VARCHAR(180) NULL,
  ciudad    VARCHAR(80) NULL,
  telefono  VARCHAR(30) NULL,
  email     VARCHAR(160) NULL,
  convenio  SMALLINT NOT NULL DEFAULT 0,
  activa    SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_instituciones_referidas UNIQUE (nombre, ciudad),
  CONSTRAINT chk_instituciones_tipo CHECK (tipo IN (
    'clinica','hospital','laboratorio','centro_imagen','universidad','especialista')),
  CONSTRAINT chk_instituciones_convenio CHECK (convenio IN (0,1)),
  CONSTRAINT chk_instituciones_activa CHECK (activa IN (0,1))
);

CREATE TABLE interconsulta.especialistas_referidos (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  institucion_id INTEGER NULL,
  nombre        VARCHAR(140) NOT NULL,
  especialidad  VARCHAR(80) NOT NULL,
  licencia      VARCHAR(60) NULL,
  telefono      VARCHAR(30) NULL,
  email         VARCHAR(160) NULL,
  activo        SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT chk_especialistas_ref_activo CHECK (activo IN (0,1)),
  CONSTRAINT fk_especialistas_ref_institucion FOREIGN KEY (institucion_id)
    REFERENCES interconsulta.instituciones_referidas(id) ON DELETE CASCADE
);

CREATE TABLE interconsulta.referencias (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id     INTEGER NOT NULL,
  consulta_id    INTEGER NULL,
  referido_por   INTEGER NULL,
  institucion_id INTEGER NULL,
  especialista_referido_id INTEGER NULL,
  motivo         TEXT NOT NULL,
  tipo           VARCHAR(20) NOT NULL DEFAULT 'consulta',
  urgencia       VARCHAR(10) NOT NULL DEFAULT 'normal',
  fecha          DATE NOT NULL DEFAULT CURRENT_DATE,
  estado         VARCHAR(20) NOT NULL DEFAULT 'emitida',
  contrarreferencia TEXT NULL,
  CONSTRAINT chk_referencias_tipo CHECK (tipo IN (
    'consulta','examen','imagen','cirugia','hospitalizacion','urgencia')),
  CONSTRAINT chk_referencias_urgencia CHECK (urgencia IN ('normal','prioritaria','urgente')),
  CONSTRAINT chk_referencias_estado CHECK (estado IN (
    'emitida','aceptada','atendida','contrarreferida','rechazada','anulada')),
  CONSTRAINT fk_referencias_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_referencias_consulta FOREIGN KEY (consulta_id)
    REFERENCES historia_clinica.consultas(id) ON DELETE SET NULL,
  CONSTRAINT fk_referencias_usuario FOREIGN KEY (referido_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_referencias_institucion FOREIGN KEY (institucion_id)
    REFERENCES interconsulta.instituciones_referidas(id) ON DELETE SET NULL,
  CONSTRAINT fk_referencias_especialista FOREIGN KEY (especialista_referido_id)
    REFERENCES interconsulta.especialistas_referidos(id) ON DELETE SET NULL
);
CREATE INDEX idx_referencias_estado ON interconsulta.referencias (estado, fecha DESC);

CREATE TABLE interconsulta.documentos_referencia (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  referencia_id INTEGER NOT NULL,
  tipo          VARCHAR(30) NOT NULL,
  archivo       VARCHAR(255) NULL,
  descripcion   VARCHAR(180) NULL,
  enviado_en    TIMESTAMP(0) NULL,
  enviado_por   INTEGER NULL,
  CONSTRAINT chk_documentos_referencia_tipo CHECK (tipo IN (
    'resumen_historia','laboratorio','imagen','informe','autorizacion','otro')),
  CONSTRAINT fk_documentos_referencia FOREIGN KEY (referencia_id)
    REFERENCES interconsulta.referencias(id) ON DELETE CASCADE,
  CONSTRAINT fk_documentos_referencia_usuario FOREIGN KEY (enviado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE interconsulta.citas_referencia (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  referencia_id INTEGER NOT NULL,
  institucion_id INTEGER NULL,
  fecha         DATE NULL,
  hora          TIME NULL,
  estado        VARCHAR(15) NOT NULL DEFAULT 'solicitada',
  confirmada_en TIMESTAMP(0) NULL,
  notas         TEXT NULL,
  CONSTRAINT chk_citas_referencia_estado CHECK (estado IN (
    'solicitada','confirmada','cumplida','no_asistio','cancelada')),
  CONSTRAINT fk_citas_referencia FOREIGN KEY (referencia_id)
    REFERENCES interconsulta.referencias(id) ON DELETE CASCADE,
  CONSTRAINT fk_citas_referencia_institucion FOREIGN KEY (institucion_id)
    REFERENCES interconsulta.instituciones_referidas(id) ON DELETE SET NULL
);

CREATE TABLE interconsulta.seguimiento_referencia (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  referencia_id INTEGER NOT NULL,
  mascota_id    INTEGER NULL,
  fecha         DATE NOT NULL DEFAULT CURRENT_DATE,
  estado        VARCHAR(20) NOT NULL DEFAULT 'en_curso',
  contrarreferencia_recibida SMALLINT NOT NULL DEFAULT 0,
  hallazgos     TEXT NULL,
  notas         TEXT NULL,
  CONSTRAINT chk_seguimiento_ref_estado CHECK (estado IN ('en_curso','cerrado','perdido')),
  CONSTRAINT chk_seguimiento_ref_contra CHECK (contrarreferencia_recibida IN (0,1)),
  CONSTRAINT fk_seguimiento_ref FOREIGN KEY (referencia_id)
    REFERENCES interconsulta.referencias(id) ON DELETE CASCADE,
  CONSTRAINT fk_seguimiento_ref_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE SET NULL
);


-- =====================================================================
--  MÓDULO 61 · GESTIÓN DE COLAS
--
--  El turno lleva prioridad, y la prioridad manda sobre la hora de
--  emisión: es el mismo criterio del triage de urgencias aplicado a la
--  recepción. `tiempos_atencion` guarda lo ya ocurrido para poder decir
--  si se cumplió el objetivo, sin recalcularlo cada vez.
-- =====================================================================

CREATE TABLE atencion.colas (
  id            SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id       SMALLINT NOT NULL,
  nombre        VARCHAR(80) NOT NULL,
  tipo          VARCHAR(20) NOT NULL DEFAULT 'general',
  prefijo       VARCHAR(5) NOT NULL DEFAULT 'A',
  atiende_desde TIME NULL,
  atiende_hasta TIME NULL,
  activa        SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_colas UNIQUE (sede_id, nombre),
  CONSTRAINT chk_colas_tipo CHECK (tipo IN ('general','preferencial','urgencias','farmacia','caja','peluqueria')),
  CONSTRAINT chk_colas_activa CHECK (activa IN (0,1)),
  CONSTRAINT fk_colas_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE CASCADE
);

CREATE TABLE atencion.prioridades_turno (
  id            SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre        VARCHAR(40) NOT NULL,
  nivel         SMALLINT NOT NULL,        -- 1 es lo primero que se llama
  color         VARCHAR(20) NULL,
  tiempo_objetivo_min SMALLINT NULL,
  descripcion   VARCHAR(180) NULL,
  CONSTRAINT uq_prioridades_turno UNIQUE (nombre),
  CONSTRAINT chk_prioridades_turno_nivel CHECK (nivel BETWEEN 1 AND 9)
);

CREATE TABLE atencion.salas_espera (
  id        SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id   SMALLINT NOT NULL,
  nombre    VARCHAR(80) NOT NULL,
  tipo      VARCHAR(20) NOT NULL DEFAULT 'general',
  capacidad SMALLINT NULL,
  pantalla  VARCHAR(60) NULL,
  activa    SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_salas_espera UNIQUE (sede_id, nombre),
  CONSTRAINT chk_salas_espera_tipo CHECK (tipo IN ('general','felina','canina','aislamiento','preferencial')),
  CONSTRAINT chk_salas_espera_activa CHECK (activa IN (0,1)),
  CONSTRAINT fk_salas_espera_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE CASCADE
);

CREATE TABLE atencion.turnos_atencion (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cola_id      SMALLINT NOT NULL,
  sede_id      SMALLINT NULL,
  sala_id      SMALLINT NULL,
  numero       VARCHAR(15) NOT NULL,
  cliente_id   INTEGER NULL,
  mascota_id   INTEGER NULL,
  cita_id      INTEGER NULL,
  prioridad_id SMALLINT NULL,
  estado       VARCHAR(15) NOT NULL DEFAULT 'en_espera',
  modulo       VARCHAR(40) NULL,
  emitido_en   TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  llamado_en   TIMESTAMP(0) NULL,
  atendido_en  TIMESTAMP(0) NULL,
  finalizado_en TIMESTAMP(0) NULL,
  CONSTRAINT chk_turnos_atencion_estado CHECK (estado IN (
    'en_espera','llamado','atendiendo','atendido','ausente','cancelado')),
  CONSTRAINT fk_turnos_atencion_cola FOREIGN KEY (cola_id)
    REFERENCES atencion.colas(id) ON DELETE CASCADE,
  CONSTRAINT fk_turnos_atencion_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE SET NULL,
  CONSTRAINT fk_turnos_atencion_sala FOREIGN KEY (sala_id)
    REFERENCES atencion.salas_espera(id) ON DELETE SET NULL,
  CONSTRAINT fk_turnos_atencion_cliente FOREIGN KEY (cliente_id)
    REFERENCES usuarios.clientes(id) ON DELETE SET NULL,
  CONSTRAINT fk_turnos_atencion_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE SET NULL,
  CONSTRAINT fk_turnos_atencion_cita FOREIGN KEY (cita_id)
    REFERENCES agenda.citas(id) ON DELETE SET NULL,
  CONSTRAINT fk_turnos_atencion_prioridad FOREIGN KEY (prioridad_id)
    REFERENCES atencion.prioridades_turno(id) ON DELETE SET NULL
);
CREATE INDEX idx_turnos_atencion_cola ON atencion.turnos_atencion (cola_id, estado, emitido_en);

CREATE TABLE atencion.llamados (
  id         INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  turno_id   INTEGER NOT NULL,
  modulo     VARCHAR(40) NULL,
  usuario_id INTEGER NULL,
  momento    TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  intento    SMALLINT NOT NULL DEFAULT 1,
  atendido   SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT chk_llamados_atendido CHECK (atendido IN (0,1)),
  CONSTRAINT fk_llamados_turno FOREIGN KEY (turno_id)
    REFERENCES atencion.turnos_atencion(id) ON DELETE CASCADE,
  CONSTRAINT fk_llamados_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE atencion.tiempos_atencion (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  turno_id      INTEGER NOT NULL,
  cola_id       SMALLINT NULL,
  sede_id       SMALLINT NULL,
  fecha         DATE NOT NULL DEFAULT CURRENT_DATE,
  espera_min    SMALLINT NULL,
  atencion_min  SMALLINT NULL,
  total_min     SMALLINT NULL,
  cumple_objetivo SMALLINT NULL,
  CONSTRAINT uq_tiempos_atencion UNIQUE (turno_id),
  CONSTRAINT chk_tiempos_atencion_objetivo CHECK (cumple_objetivo IS NULL OR cumple_objetivo IN (0,1)),
  CONSTRAINT fk_tiempos_atencion_turno FOREIGN KEY (turno_id)
    REFERENCES atencion.turnos_atencion(id) ON DELETE CASCADE,
  CONSTRAINT fk_tiempos_atencion_cola FOREIGN KEY (cola_id)
    REFERENCES atencion.colas(id) ON DELETE SET NULL,
  CONSTRAINT fk_tiempos_atencion_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE SET NULL
);


-- =====================================================================
--  MÓDULO 62 · EXPERIENCIA DEL CLIENTE
--
--  Un cliente inactivo no es el que no viene: es el que no viene y
--  DEBERÍA estar viniendo. Por eso `clientes_inactivos` guarda el riesgo
--  de fuga y si ya se le contactó, que es lo que decide la campaña.
-- =====================================================================

CREATE TABLE atencion.preferencias_cliente (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cliente_id     INTEGER NOT NULL,
  canal_contacto VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
  horario_preferido VARCHAR(30) NULL,
  veterinario_preferido_id INTEGER NULL,
  sede_preferida_id SMALLINT NULL,
  idioma         VARCHAR(20) NOT NULL DEFAULT 'es',
  recordatorios  SMALLINT NOT NULL DEFAULT 1,
  publicidad     SMALLINT NOT NULL DEFAULT 0,
  notas          TEXT NULL,
  CONSTRAINT uq_preferencias_cliente UNIQUE (cliente_id),
  CONSTRAINT chk_preferencias_cliente_canal CHECK (canal_contacto IN (
    'whatsapp','email','sms','llamada','app')),
  CONSTRAINT chk_preferencias_cliente_recordatorios CHECK (recordatorios IN (0,1)),
  CONSTRAINT chk_preferencias_cliente_publicidad CHECK (publicidad IN (0,1)),
  CONSTRAINT fk_preferencias_cliente FOREIGN KEY (cliente_id)
    REFERENCES usuarios.clientes(id) ON DELETE CASCADE,
  CONSTRAINT fk_preferencias_cliente_vet FOREIGN KEY (veterinario_preferido_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_preferencias_cliente_sede FOREIGN KEY (sede_preferida_id)
    REFERENCES configuracion.sedes(id) ON DELETE SET NULL
);

CREATE TABLE atencion.preferencias_mascota (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id     INTEGER NOT NULL,
  temperamento   VARCHAR(30) NULL,
  manejo         TEXT NULL,
  requiere_bozal SMALLINT NOT NULL DEFAULT 0,
  requiere_sedacion SMALLINT NOT NULL DEFAULT 0,
  alimento_preferido VARCHAR(120) NULL,
  juguete        VARCHAR(80) NULL,
  miedos         VARCHAR(180) NULL,
  notas          TEXT NULL,
  CONSTRAINT uq_preferencias_mascota UNIQUE (mascota_id),
  CONSTRAINT chk_preferencias_mascota_bozal CHECK (requiere_bozal IN (0,1)),
  CONSTRAINT chk_preferencias_mascota_sedacion CHECK (requiere_sedacion IN (0,1)),
  CONSTRAINT fk_preferencias_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE
);

CREATE TABLE atencion.nivel_satisfaccion (
  id         INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cliente_id INTEGER NOT NULL,
  cita_id    INTEGER NULL,
  encuesta_id SMALLINT NULL,
  fecha      DATE NOT NULL DEFAULT CURRENT_DATE,
  puntaje    SMALLINT NULL,
  nps        SMALLINT NULL,
  categoria  VARCHAR(15) NULL,
  comentario TEXT NULL,
  CONSTRAINT chk_nivel_satisfaccion_puntaje CHECK (puntaje IS NULL OR puntaje BETWEEN 1 AND 5),
  CONSTRAINT chk_nivel_satisfaccion_nps CHECK (nps IS NULL OR nps BETWEEN 0 AND 10),
  CONSTRAINT chk_nivel_satisfaccion_categoria CHECK (categoria IS NULL OR categoria IN (
    'promotor','pasivo','detractor')),
  CONSTRAINT fk_nivel_satisfaccion_cliente FOREIGN KEY (cliente_id)
    REFERENCES usuarios.clientes(id) ON DELETE CASCADE,
  CONSTRAINT fk_nivel_satisfaccion_cita FOREIGN KEY (cita_id)
    REFERENCES agenda.citas(id) ON DELETE SET NULL,
  CONSTRAINT fk_nivel_satisfaccion_encuesta FOREIGN KEY (encuesta_id)
    REFERENCES soporte.encuestas(id) ON DELETE SET NULL
);

CREATE TABLE atencion.historial_atencion (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cliente_id     INTEGER NOT NULL,
  mascota_id     INTEGER NULL,
  sede_id        SMALLINT NULL,
  veterinario_id INTEGER NULL,
  fecha          TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  tipo           VARCHAR(25) NOT NULL DEFAULT 'consulta',
  referencia_tipo VARCHAR(40) NULL,
  referencia_id  INTEGER NULL,
  resultado      VARCHAR(30) NULL,
  valoracion     SMALLINT NULL,
  CONSTRAINT chk_historial_atencion_tipo CHECK (tipo IN (
    'consulta','urgencia','cirugia','tienda','telemedicina','pqrs','llamada','otro')),
  CONSTRAINT chk_historial_atencion_valoracion CHECK (valoracion IS NULL OR valoracion BETWEEN 1 AND 5),
  CONSTRAINT fk_historial_atencion_cliente FOREIGN KEY (cliente_id)
    REFERENCES usuarios.clientes(id) ON DELETE CASCADE,
  CONSTRAINT fk_historial_atencion_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE SET NULL,
  CONSTRAINT fk_historial_atencion_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE SET NULL,
  CONSTRAINT fk_historial_atencion_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_historial_atencion_cliente ON atencion.historial_atencion (cliente_id, fecha DESC);

CREATE TABLE atencion.motivos_abandono (
  id          SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre      VARCHAR(120) NOT NULL,
  categoria   VARCHAR(25) NOT NULL DEFAULT 'otro',
  descripcion VARCHAR(180) NULL,
  CONSTRAINT uq_motivos_abandono UNIQUE (nombre),
  CONSTRAINT chk_motivos_abandono_categoria CHECK (categoria IN (
    'precio','atencion','distancia','espera','resultado','mudanza','fallecimiento','otro'))
);

CREATE TABLE atencion.clientes_inactivos (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cliente_id    INTEGER NOT NULL,
  ultima_visita DATE NULL,
  dias_inactivo INTEGER NOT NULL DEFAULT 0,
  motivo_id     SMALLINT NULL,
  riesgo_fuga   VARCHAR(10) NOT NULL DEFAULT 'medio',
  detectado_en  DATE NOT NULL DEFAULT CURRENT_DATE,
  contactado    SMALLINT NOT NULL DEFAULT 0,
  estado        VARCHAR(15) NOT NULL DEFAULT 'inactivo',
  CONSTRAINT uq_clientes_inactivos UNIQUE (cliente_id),
  CONSTRAINT chk_clientes_inactivos_riesgo CHECK (riesgo_fuga IN ('bajo','medio','alto')),
  CONSTRAINT chk_clientes_inactivos_contactado CHECK (contactado IN (0,1)),
  CONSTRAINT chk_clientes_inactivos_estado CHECK (estado IN ('inactivo','en_recuperacion','recuperado','perdido')),
  CONSTRAINT fk_clientes_inactivos FOREIGN KEY (cliente_id)
    REFERENCES usuarios.clientes(id) ON DELETE CASCADE,
  CONSTRAINT fk_clientes_inactivos_motivo FOREIGN KEY (motivo_id)
    REFERENCES atencion.motivos_abandono(id) ON DELETE SET NULL
);

CREATE TABLE atencion.recuperacion_clientes (
  id                  INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cliente_inactivo_id INTEGER NULL,
  cliente_id          INTEGER NOT NULL,
  campana             VARCHAR(120) NULL,
  canal               VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
  contactado_en       TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  respuesta           VARCHAR(20) NULL,
  recuperado          SMALLINT NOT NULL DEFAULT 0,
  cita_id             INTEGER NULL,
  notas               TEXT NULL,
  CONSTRAINT chk_recuperacion_canal CHECK (canal IN ('whatsapp','email','sms','llamada','app')),
  CONSTRAINT chk_recuperacion_respuesta CHECK (respuesta IS NULL OR respuesta IN (
    'sin_respuesta','interesado','no_interesado','agendo')),
  CONSTRAINT chk_recuperacion_recuperado CHECK (recuperado IN (0,1)),
  CONSTRAINT fk_recuperacion_inactivo FOREIGN KEY (cliente_inactivo_id)
    REFERENCES atencion.clientes_inactivos(id) ON DELETE SET NULL,
  CONSTRAINT fk_recuperacion_cliente FOREIGN KEY (cliente_id)
    REFERENCES usuarios.clientes(id) ON DELETE CASCADE,
  CONSTRAINT fk_recuperacion_cita FOREIGN KEY (cita_id)
    REFERENCES agenda.citas(id) ON DELETE SET NULL
);


-- =====================================================================
--  MÓDULO 73 · GESTIÓN DE CITAS INTELIGENTE
--
--  Cuando alguien cancela, el hueco no se pierde: se ofrece a quien está
--  en lista de espera. Y antes de que llegue el día, el sistema estima
--  quién no va a venir para llamarlo primero. La predicción se guarda
--  con su resultado real: sin eso no hay forma de saber si acierta.
-- =====================================================================

CREATE TABLE atencion.lista_espera (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cliente_id     INTEGER NOT NULL,
  mascota_id     INTEGER NULL,
  servicio_id    SMALLINT NULL,
  veterinario_id INTEGER NULL,
  sede_id        SMALLINT NULL,
  desde          DATE NULL,
  hasta          DATE NULL,
  franja         VARCHAR(20) NULL,
  prioridad      SMALLINT NOT NULL DEFAULT 5,
  estado         VARCHAR(15) NOT NULL DEFAULT 'esperando',
  creada_en      TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  avisado_en     TIMESTAMP(0) NULL,
  CONSTRAINT chk_lista_espera_franja CHECK (franja IS NULL OR franja IN ('manana','tarde','cualquiera')),
  CONSTRAINT chk_lista_espera_estado CHECK (estado IN ('esperando','avisado','agendado','vencido','cancelado')),
  CONSTRAINT fk_lista_espera_cliente FOREIGN KEY (cliente_id)
    REFERENCES usuarios.clientes(id) ON DELETE CASCADE,
  CONSTRAINT fk_lista_espera_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE SET NULL,
  CONSTRAINT fk_lista_espera_servicio FOREIGN KEY (servicio_id)
    REFERENCES agenda.servicios(id) ON DELETE SET NULL,
  CONSTRAINT fk_lista_espera_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_lista_espera_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE SET NULL
);
CREATE INDEX idx_lista_espera_estado ON atencion.lista_espera (estado, prioridad, creada_en);

CREATE TABLE atencion.sustituciones (
  id              INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cita_id         INTEGER NULL,            -- la que se liberó
  lista_espera_id INTEGER NULL,
  cita_liberada_en TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  ofrecida_a      INTEGER NULL,
  ofrecida_en     TIMESTAMP(0) NULL,
  aceptada        SMALLINT NULL,
  nueva_cita_id   INTEGER NULL,
  CONSTRAINT chk_sustituciones_aceptada CHECK (aceptada IS NULL OR aceptada IN (0,1)),
  CONSTRAINT fk_sustituciones_cita FOREIGN KEY (cita_id)
    REFERENCES agenda.citas(id) ON DELETE SET NULL,
  CONSTRAINT fk_sustituciones_lista FOREIGN KEY (lista_espera_id)
    REFERENCES atencion.lista_espera(id) ON DELETE SET NULL,
  CONSTRAINT fk_sustituciones_cliente FOREIGN KEY (ofrecida_a)
    REFERENCES usuarios.clientes(id) ON DELETE SET NULL,
  CONSTRAINT fk_sustituciones_nueva_cita FOREIGN KEY (nueva_cita_id)
    REFERENCES agenda.citas(id) ON DELETE SET NULL
);

CREATE TABLE atencion.recordatorio_confirmacion (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cita_id       INTEGER NOT NULL,
  canal         VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
  intento       SMALLINT NOT NULL DEFAULT 1,
  enviado_en    TIMESTAMP(0) NULL,
  confirmado_en TIMESTAMP(0) NULL,
  respuesta     VARCHAR(20) NULL,
  estado        VARCHAR(15) NOT NULL DEFAULT 'pendiente',
  CONSTRAINT chk_recordatorio_conf_canal CHECK (canal IN ('whatsapp','email','sms','llamada','app')),
  CONSTRAINT chk_recordatorio_conf_estado CHECK (estado IN (
    'pendiente','enviado','confirmado','cancelado','sin_respuesta')),
  CONSTRAINT fk_recordatorio_conf_cita FOREIGN KEY (cita_id)
    REFERENCES agenda.citas(id) ON DELETE CASCADE
);

CREATE TABLE atencion.prediccion_no_asistencia (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cita_id       INTEGER NOT NULL,
  cliente_id    INTEGER NULL,
  probabilidad  NUMERIC(5,2) NOT NULL,
  nivel         VARCHAR(10) NOT NULL DEFAULT 'medio',
  factores      TEXT NULL,
  modelo        VARCHAR(60) NULL,
  calculada_en  TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  resultado_real VARCHAR(15) NULL,
  CONSTRAINT uq_prediccion_no_asistencia UNIQUE (cita_id),
  CONSTRAINT chk_prediccion_nivel CHECK (nivel IN ('bajo','medio','alto')),
  CONSTRAINT chk_prediccion_resultado CHECK (resultado_real IS NULL OR resultado_real IN (
    'asistio','no_asistio','cancelo')),
  CONSTRAINT fk_prediccion_cita FOREIGN KEY (cita_id)
    REFERENCES agenda.citas(id) ON DELETE CASCADE,
  CONSTRAINT fk_prediccion_cliente FOREIGN KEY (cliente_id)
    REFERENCES usuarios.clientes(id) ON DELETE SET NULL
);

CREATE TABLE atencion.sobrecupo_controlado (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  veterinario_id INTEGER NOT NULL,
  sede_id        SMALLINT NULL,
  fecha          DATE NOT NULL,
  franja_inicio  TIME NOT NULL,
  franja_fin     TIME NOT NULL,
  cupos_extra    SMALLINT NOT NULL DEFAULT 1,
  usados         SMALLINT NOT NULL DEFAULT 0,
  motivo         VARCHAR(180) NULL,
  autorizado_por INTEGER NULL,
  CONSTRAINT uq_sobrecupo UNIQUE (veterinario_id, fecha, franja_inicio),
  CONSTRAINT chk_sobrecupo_franja CHECK (franja_fin > franja_inicio),
  CONSTRAINT chk_sobrecupo_usados CHECK (usados <= cupos_extra),
  CONSTRAINT fk_sobrecupo_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_sobrecupo_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE SET NULL,
  CONSTRAINT fk_sobrecupo_usuario FOREIGN KEY (autorizado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE atencion.citas_urgentes (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cita_id        INTEGER NULL,
  mascota_id     INTEGER NOT NULL,
  cliente_id     INTEGER NULL,
  motivo         TEXT NOT NULL,
  prioridad      VARCHAR(10) NOT NULL DEFAULT 'alta',
  solicitada_en  TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  asignada_en    TIMESTAMP(0) NULL,
  veterinario_id INTEGER NULL,
  estado         VARCHAR(15) NOT NULL DEFAULT 'pendiente',
  CONSTRAINT chk_citas_urgentes_prioridad CHECK (prioridad IN ('media','alta','critica')),
  CONSTRAINT chk_citas_urgentes_estado CHECK (estado IN ('pendiente','asignada','atendida','derivada','cancelada')),
  CONSTRAINT fk_citas_urgentes_cita FOREIGN KEY (cita_id)
    REFERENCES agenda.citas(id) ON DELETE SET NULL,
  CONSTRAINT fk_citas_urgentes_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_citas_urgentes_cliente FOREIGN KEY (cliente_id)
    REFERENCES usuarios.clientes(id) ON DELETE SET NULL,
  CONSTRAINT fk_citas_urgentes_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);

CREATE TABLE atencion.optimizacion_agenda (
  id               INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  veterinario_id   INTEGER NULL,
  sede_id          SMALLINT NULL,
  fecha            DATE NOT NULL,
  huecos_detectados SMALLINT NOT NULL DEFAULT 0,
  minutos_ociosos  SMALLINT NOT NULL DEFAULT 0,
  ocupacion_pct    NUMERIC(5,2) NULL,
  sugerencia       TEXT NULL,
  aplicada         SMALLINT NOT NULL DEFAULT 0,
  generada_en      TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_optimizacion_aplicada CHECK (aplicada IN (0,1)),
  CONSTRAINT fk_optimizacion_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_optimizacion_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE SET NULL
);


-- =====================================================================
--  MÓDULO 65 · MONITOREO REMOTO  ·  MÓDULO 66 · IoT CLÍNICO
--
--  Dos familias de aparatos con la misma estructura: dispositivo ->
--  sensor -> lectura -> alerta. Se separan porque el collar del perro es
--  del dueño y la sonda de la jaula es de la clínica, y ni el permiso ni
--  el volumen de datos son comparables.
-- =====================================================================

CREATE TABLE dispositivos.dispositivos_mascota (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id    INTEGER NOT NULL,
  cliente_id    INTEGER NULL,
  tipo          VARCHAR(25) NOT NULL DEFAULT 'collar',
  marca         VARCHAR(60) NULL,
  modelo        VARCHAR(60) NULL,
  serial        VARCHAR(80) NULL,
  vinculado_en  TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  bateria_pct   SMALLINT NULL,
  ultima_lectura TIMESTAMP(0) NULL,
  estado        VARCHAR(15) NOT NULL DEFAULT 'activo',
  CONSTRAINT uq_dispositivos_mascota_serial UNIQUE (serial),
  CONSTRAINT chk_dispositivos_mascota_tipo CHECK (tipo IN (
    'collar','arnes','gps','bascula','comedero','bebedero','camara','otro')),
  CONSTRAINT chk_dispositivos_mascota_estado CHECK (estado IN ('activo','inactivo','desvinculado','averiado')),
  CONSTRAINT fk_dispositivos_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_dispositivos_mascota_cliente FOREIGN KEY (cliente_id)
    REFERENCES usuarios.clientes(id) ON DELETE SET NULL
);

CREATE TABLE dispositivos.sensores_mascota (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  dispositivo_id INTEGER NOT NULL,
  tipo          VARCHAR(25) NOT NULL,
  unidad        VARCHAR(20) NULL,
  rango_min     NUMERIC(10,3) NULL,
  rango_max     NUMERIC(10,3) NULL,
  precision_dec SMALLINT NOT NULL DEFAULT 2,
  activo        SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT chk_sensores_mascota_tipo CHECK (tipo IN (
    'actividad','frecuencia_cardiaca','temperatura','sueno','peso','ingesta','ubicacion','respiracion')),
  CONSTRAINT chk_sensores_mascota_activo CHECK (activo IN (0,1)),
  CONSTRAINT fk_sensores_mascota_dispositivo FOREIGN KEY (dispositivo_id)
    REFERENCES dispositivos.dispositivos_mascota(id) ON DELETE CASCADE
);

CREATE TABLE dispositivos.parametros_monitoreados (
  id         INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id INTEGER NOT NULL,
  sensor_id  INTEGER NULL,
  parametro  VARCHAR(40) NOT NULL,
  unidad     VARCHAR(20) NULL,
  umbral_min NUMERIC(10,3) NULL,
  umbral_max NUMERIC(10,3) NULL,
  activo     SMALLINT NOT NULL DEFAULT 1,
  definido_por INTEGER NULL,
  CONSTRAINT uq_parametros_monitoreados UNIQUE (mascota_id, parametro),
  CONSTRAINT chk_parametros_monitoreados_activo CHECK (activo IN (0,1)),
  CONSTRAINT fk_parametros_monitoreados_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_parametros_monitoreados_sensor FOREIGN KEY (sensor_id)
    REFERENCES dispositivos.sensores_mascota(id) ON DELETE SET NULL,
  CONSTRAINT fk_parametros_monitoreados_usuario FOREIGN KEY (definido_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

-- Tabla de alto volumen: una fila por medición. Sin índice por (sensor,
-- momento) la gráfica del portal tendría que recorrerla entera.
CREATE TABLE dispositivos.lecturas (
  id            BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sensor_id     INTEGER NULL,
  dispositivo_id INTEGER NULL,
  mascota_id    INTEGER NOT NULL,
  parametro     VARCHAR(40) NOT NULL,
  valor         NUMERIC(12,3) NOT NULL,
  unidad        VARCHAR(20) NULL,
  momento       TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  fuera_rango   SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT chk_lecturas_fuera_rango CHECK (fuera_rango IN (0,1)),
  CONSTRAINT fk_lecturas_sensor FOREIGN KEY (sensor_id)
    REFERENCES dispositivos.sensores_mascota(id) ON DELETE CASCADE,
  CONSTRAINT fk_lecturas_dispositivo FOREIGN KEY (dispositivo_id)
    REFERENCES dispositivos.dispositivos_mascota(id) ON DELETE CASCADE,
  CONSTRAINT fk_lecturas_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE
);
CREATE INDEX idx_lecturas_sensor ON dispositivos.lecturas (sensor_id, momento DESC);
CREATE INDEX idx_lecturas_mascota ON dispositivos.lecturas (mascota_id, parametro, momento DESC);

CREATE TABLE dispositivos.alertas_sensor (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sensor_id     INTEGER NULL,
  dispositivo_id INTEGER NULL,
  mascota_id    INTEGER NOT NULL,
  lectura_id    BIGINT NULL,
  parametro     VARCHAR(40) NOT NULL,
  valor         NUMERIC(12,3) NULL,
  umbral        NUMERIC(12,3) NULL,
  severidad     VARCHAR(10) NOT NULL DEFAULT 'media',
  generada_en   TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  atendida_en   TIMESTAMP(0) NULL,
  atendida_por  INTEGER NULL,
  estado        VARCHAR(15) NOT NULL DEFAULT 'abierta',
  CONSTRAINT chk_alertas_sensor_severidad CHECK (severidad IN ('baja','media','alta','critica')),
  CONSTRAINT chk_alertas_sensor_estado CHECK (estado IN ('abierta','vista','resuelta','descartada')),
  CONSTRAINT fk_alertas_sensor_sensor FOREIGN KEY (sensor_id)
    REFERENCES dispositivos.sensores_mascota(id) ON DELETE CASCADE,
  CONSTRAINT fk_alertas_sensor_dispositivo FOREIGN KEY (dispositivo_id)
    REFERENCES dispositivos.dispositivos_mascota(id) ON DELETE CASCADE,
  CONSTRAINT fk_alertas_sensor_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_alertas_sensor_lectura FOREIGN KEY (lectura_id)
    REFERENCES dispositivos.lecturas(id) ON DELETE SET NULL,
  CONSTRAINT fk_alertas_sensor_usuario FOREIGN KEY (atendida_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_alertas_sensor_estado ON dispositivos.alertas_sensor (estado, severidad, generada_en DESC);

CREATE TABLE dispositivos.historial_dispositivos (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  dispositivo_id INTEGER NOT NULL,
  mascota_id    INTEGER NULL,
  evento        VARCHAR(30) NOT NULL,
  detalle       TEXT NULL,
  fecha         TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  usuario_id    INTEGER NULL,
  CONSTRAINT chk_historial_dispositivos_evento CHECK (evento IN (
    'vinculado','desvinculado','bateria_baja','sin_senal','actualizado','averiado','reparado')),
  CONSTRAINT fk_historial_dispositivos FOREIGN KEY (dispositivo_id)
    REFERENCES dispositivos.dispositivos_mascota(id) ON DELETE CASCADE,
  CONSTRAINT fk_historial_dispositivos_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE SET NULL,
  CONSTRAINT fk_historial_dispositivos_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

-- --- IoT clínico (módulo 66) -----------------------------------------
-- `equipos.equipos_medicos` sigue siendo el inventario del aparato (marca,
-- compra, mantenimientos). Esto es su parte conectada: dirección de red,
-- última conexión y lo que emite.

CREATE TABLE dispositivos.dispositivos_medicos (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  equipo_id      INTEGER NULL,
  sede_id        SMALLINT NULL,
  nombre         VARCHAR(120) NOT NULL,
  tipo           VARCHAR(30) NOT NULL,
  protocolo      VARCHAR(20) NULL,
  direccion_red  VARCHAR(60) NULL,
  ultima_conexion TIMESTAMP(0) NULL,
  estado         VARCHAR(15) NOT NULL DEFAULT 'en_linea',
  CONSTRAINT chk_dispositivos_medicos_tipo CHECK (tipo IN (
    'monitor','bomba_infusion','ventilador','incubadora','oximetro','termometro',
    'concentrador_oxigeno','nevera','autoclave','balanza','otro')),
  CONSTRAINT chk_dispositivos_medicos_protocolo CHECK (protocolo IS NULL OR protocolo IN (
    'mqtt','http','modbus','ble','zigbee','serial')),
  CONSTRAINT chk_dispositivos_medicos_estado CHECK (estado IN ('en_linea','fuera_linea','mantenimiento','averiado')),
  CONSTRAINT fk_dispositivos_medicos_equipo FOREIGN KEY (equipo_id)
    REFERENCES equipos.equipos_medicos(id) ON DELETE SET NULL,
  CONSTRAINT fk_dispositivos_medicos_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE SET NULL
);

CREATE TABLE dispositivos.sensores_clinicos (
  id                  INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  dispositivo_medico_id INTEGER NOT NULL,
  tipo                VARCHAR(25) NOT NULL,
  unidad              VARCHAR(20) NULL,
  umbral_min          NUMERIC(10,3) NULL,
  umbral_max          NUMERIC(10,3) NULL,
  intervalo_seg       SMALLINT NULL,
  activo              SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT chk_sensores_clinicos_tipo CHECK (tipo IN (
    'temperatura','humedad','oxigeno','presion','flujo','peso','co2','luz')),
  CONSTRAINT chk_sensores_clinicos_activo CHECK (activo IN (0,1)),
  CONSTRAINT fk_sensores_clinicos_dispositivo FOREIGN KEY (dispositivo_medico_id)
    REFERENCES dispositivos.dispositivos_medicos(id) ON DELETE CASCADE
);

CREATE TABLE dispositivos.dispositivos_hospitalizacion (
  id                  INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  dispositivo_medico_id INTEGER NOT NULL,
  habitacion_id       SMALLINT NULL,
  hospitalizacion_id  INTEGER NULL,
  asignado_en         TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  retirado_en         TIMESTAMP(0) NULL,
  estado              VARCHAR(15) NOT NULL DEFAULT 'asignado',
  CONSTRAINT chk_dispositivos_hosp_estado CHECK (estado IN ('asignado','retirado','averiado')),
  CONSTRAINT fk_dispositivos_hosp_dispositivo FOREIGN KEY (dispositivo_medico_id)
    REFERENCES dispositivos.dispositivos_medicos(id) ON DELETE CASCADE,
  CONSTRAINT fk_dispositivos_hosp_habitacion FOREIGN KEY (habitacion_id)
    REFERENCES historia_clinica.habitaciones(id) ON DELETE SET NULL,
  CONSTRAINT fk_dispositivos_hosp_hospitalizacion FOREIGN KEY (hospitalizacion_id)
    REFERENCES historia_clinica.hospitalizaciones(id) ON DELETE SET NULL
);

CREATE TABLE dispositivos.temperatura_jaulas (
  id            BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  habitacion_id SMALLINT NULL,
  sensor_id     INTEGER NULL,
  temperatura_c NUMERIC(4,1) NOT NULL,
  momento       TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  fuera_rango   SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT chk_temperatura_jaulas_rango CHECK (fuera_rango IN (0,1)),
  CONSTRAINT fk_temperatura_jaulas_habitacion FOREIGN KEY (habitacion_id)
    REFERENCES historia_clinica.habitaciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_temperatura_jaulas_sensor FOREIGN KEY (sensor_id)
    REFERENCES dispositivos.sensores_clinicos(id) ON DELETE SET NULL
);
CREATE INDEX idx_temperatura_jaulas ON dispositivos.temperatura_jaulas (habitacion_id, momento DESC);

CREATE TABLE dispositivos.humedad (
  id            BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  habitacion_id SMALLINT NULL,
  sede_id       SMALLINT NULL,
  sensor_id     INTEGER NULL,
  humedad_pct   NUMERIC(5,2) NOT NULL,
  momento       TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  fuera_rango   SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT chk_humedad_rango CHECK (fuera_rango IN (0,1)),
  CONSTRAINT fk_humedad_habitacion FOREIGN KEY (habitacion_id)
    REFERENCES historia_clinica.habitaciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_humedad_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE SET NULL,
  CONSTRAINT fk_humedad_sensor FOREIGN KEY (sensor_id)
    REFERENCES dispositivos.sensores_clinicos(id) ON DELETE SET NULL
);
CREATE INDEX idx_humedad_habitacion ON dispositivos.humedad (habitacion_id, momento DESC);

CREATE TABLE dispositivos.consumo_oxigeno (
  id                  BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  hospitalizacion_id  INTEGER NULL,
  habitacion_id       SMALLINT NULL,
  dispositivo_medico_id INTEGER NULL,
  flujo_lpm           NUMERIC(6,2) NULL,
  fio2_pct            NUMERIC(5,2) NULL,
  consumo_litros      NUMERIC(10,2) NULL,
  momento             TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT fk_consumo_oxigeno_hosp FOREIGN KEY (hospitalizacion_id)
    REFERENCES historia_clinica.hospitalizaciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_consumo_oxigeno_habitacion FOREIGN KEY (habitacion_id)
    REFERENCES historia_clinica.habitaciones(id) ON DELETE SET NULL,
  CONSTRAINT fk_consumo_oxigeno_dispositivo FOREIGN KEY (dispositivo_medico_id)
    REFERENCES dispositivos.dispositivos_medicos(id) ON DELETE SET NULL
);

CREATE TABLE dispositivos.eventos_dispositivo (
  id                  INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  dispositivo_medico_id INTEGER NOT NULL,
  sede_id             SMALLINT NULL,
  tipo                VARCHAR(25) NOT NULL,
  severidad           VARCHAR(10) NOT NULL DEFAULT 'media',
  mensaje             VARCHAR(240) NOT NULL,
  momento             TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  atendido_en         TIMESTAMP(0) NULL,
  atendido_por        INTEGER NULL,
  CONSTRAINT chk_eventos_dispositivo_tipo CHECK (tipo IN (
    'desconexion','alarma','fuera_rango','bateria','error','mantenimiento','calibracion')),
  CONSTRAINT chk_eventos_dispositivo_severidad CHECK (severidad IN ('baja','media','alta','critica')),
  CONSTRAINT fk_eventos_dispositivo FOREIGN KEY (dispositivo_medico_id)
    REFERENCES dispositivos.dispositivos_medicos(id) ON DELETE CASCADE,
  CONSTRAINT fk_eventos_dispositivo_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE SET NULL,
  CONSTRAINT fk_eventos_dispositivo_usuario FOREIGN KEY (atendido_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_eventos_dispositivo ON dispositivos.eventos_dispositivo (severidad, momento DESC);


-- =====================================================================
--  MÓDULO 67 · GESTIÓN DE RESIDUOS
--
--  `bioseguridad.residuos` anota el residuo que se generó en el día a
--  día. Esto es la otra mitad: quién se lo lleva, con qué manifiesto y
--  qué certificado de destrucción devolvió. Es lo que pide la autoridad
--  ambiental y lo que no se puede reconstruir a posteriori.
-- =====================================================================

CREATE TABLE gestion_residuos.tipos_residuos (
  id          SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL,
  clasificacion VARCHAR(25) NOT NULL DEFAULT 'biosanitario',
  color_bolsa VARCHAR(20) NULL,
  riesgo      VARCHAR(10) NOT NULL DEFAULT 'medio',
  tratamiento VARCHAR(60) NULL,
  normativa   VARCHAR(120) NULL,
  CONSTRAINT uq_tipos_residuos UNIQUE (nombre),
  CONSTRAINT chk_tipos_residuos_clasificacion CHECK (clasificacion IN (
    'biosanitario','anatomopatologico','cortopunzante','quimico','farmaceutico',
    'radiactivo','ordinario','reciclable')),
  CONSTRAINT chk_tipos_residuos_riesgo CHECK (riesgo IN ('bajo','medio','alto'))
);

CREATE TABLE gestion_residuos.contenedores (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id        SMALLINT NOT NULL,
  tipo_residuo_id SMALLINT NOT NULL,
  codigo         VARCHAR(40) NOT NULL,
  ubicacion      VARCHAR(120) NULL,
  capacidad_kg   NUMERIC(7,2) NULL,
  instalado_en   DATE NULL,
  estado         VARCHAR(15) NOT NULL DEFAULT 'activo',
  CONSTRAINT uq_contenedores_codigo UNIQUE (codigo),
  CONSTRAINT chk_contenedores_estado CHECK (estado IN ('activo','lleno','retirado','danado')),
  CONSTRAINT fk_contenedores_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE CASCADE,
  CONSTRAINT fk_contenedores_tipo FOREIGN KEY (tipo_residuo_id)
    REFERENCES gestion_residuos.tipos_residuos(id) ON DELETE CASCADE
);

CREATE TABLE gestion_residuos.gestores_residuos (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre         VARCHAR(160) NOT NULL,
  nit            VARCHAR(30) NULL,
  licencia       VARCHAR(60) NULL,
  vence_licencia DATE NULL,
  contacto       VARCHAR(120) NULL,
  telefono       VARCHAR(30) NULL,
  email          VARCHAR(160) NULL,
  activo         SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_gestores_residuos UNIQUE (nit),
  CONSTRAINT chk_gestores_residuos_activo CHECK (activo IN (0,1))
);

CREATE TABLE gestion_residuos.recolecciones (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id        SMALLINT NOT NULL,
  gestor_id      INTEGER NULL,
  contenedor_id  INTEGER NULL,
  tipo_residuo_id SMALLINT NULL,
  fecha          TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  peso_kg        NUMERIC(9,3) NOT NULL DEFAULT 0,
  responsable_id INTEGER NULL,
  estado         VARCHAR(15) NOT NULL DEFAULT 'recolectado',
  CONSTRAINT chk_recolecciones_estado CHECK (estado IN ('programada','recolectado','en_transito','tratado','rechazado')),
  CONSTRAINT fk_recolecciones_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE CASCADE,
  CONSTRAINT fk_recolecciones_gestor FOREIGN KEY (gestor_id)
    REFERENCES gestion_residuos.gestores_residuos(id) ON DELETE SET NULL,
  CONSTRAINT fk_recolecciones_contenedor FOREIGN KEY (contenedor_id)
    REFERENCES gestion_residuos.contenedores(id) ON DELETE SET NULL,
  CONSTRAINT fk_recolecciones_tipo FOREIGN KEY (tipo_residuo_id)
    REFERENCES gestion_residuos.tipos_residuos(id) ON DELETE SET NULL,
  CONSTRAINT fk_recolecciones_usuario FOREIGN KEY (responsable_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_recolecciones_sede ON gestion_residuos.recolecciones (sede_id, fecha DESC);

CREATE TABLE gestion_residuos.manifiestos (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  recoleccion_id INTEGER NULL,
  gestor_id      INTEGER NULL,
  numero         VARCHAR(60) NOT NULL,
  fecha          DATE NOT NULL DEFAULT CURRENT_DATE,
  peso_total_kg  NUMERIC(10,3) NOT NULL DEFAULT 0,
  tratamiento    VARCHAR(60) NULL,
  archivo        VARCHAR(255) NULL,
  certificado    VARCHAR(255) NULL,
  recibido_en    DATE NULL,
  CONSTRAINT uq_manifiestos_numero UNIQUE (numero),
  CONSTRAINT fk_manifiestos_recoleccion FOREIGN KEY (recoleccion_id)
    REFERENCES gestion_residuos.recolecciones(id) ON DELETE SET NULL,
  CONSTRAINT fk_manifiestos_gestor FOREIGN KEY (gestor_id)
    REFERENCES gestion_residuos.gestores_residuos(id) ON DELETE SET NULL
);

CREATE TABLE gestion_residuos.trazabilidad_residuos (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  manifiesto_id  INTEGER NULL,
  recoleccion_id INTEGER NULL,
  etapa          VARCHAR(25) NOT NULL,
  fecha          TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  responsable    VARCHAR(140) NULL,
  ubicacion      VARCHAR(140) NULL,
  peso_kg        NUMERIC(9,3) NULL,
  observaciones  TEXT NULL,
  CONSTRAINT chk_trazabilidad_residuos_etapa CHECK (etapa IN (
    'generacion','almacenamiento','recoleccion','transporte','tratamiento','disposicion','certificacion')),
  CONSTRAINT fk_trazabilidad_manifiesto FOREIGN KEY (manifiesto_id)
    REFERENCES gestion_residuos.manifiestos(id) ON DELETE CASCADE,
  CONSTRAINT fk_trazabilidad_recoleccion FOREIGN KEY (recoleccion_id)
    REFERENCES gestion_residuos.recolecciones(id) ON DELETE CASCADE
);


-- =====================================================================
--  MÓDULO 69 · CONTRATOS  ·  MÓDULO 68 · GESTIÓN DE PROVEEDORES
--
--  Los contratos van primero porque el incumplimiento de un proveedor
--  apunta al contrato que incumplió. Hay un registro por contraparte
--  (cliente, proveedor, empleado) en vez de una sola tabla polimórfica:
--  cada uno tiene campos propios —salario, cupo, objeto— y mezclarlos
--  obligaría a dejarlos todos NULL.
-- =====================================================================

CREATE TABLE contratos.contratos_clientes (
  id         INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cliente_id INTEGER NOT NULL,
  numero     VARCHAR(40) NOT NULL,
  tipo       VARCHAR(25) NOT NULL DEFAULT 'servicios',
  objeto     TEXT NULL,
  valor      NUMERIC(12,2) NULL,
  inicio     DATE NOT NULL DEFAULT CURRENT_DATE,
  fin        DATE NULL,
  estado     VARCHAR(15) NOT NULL DEFAULT 'vigente',
  firmado_en DATE NULL,
  archivo    VARCHAR(255) NULL,
  CONSTRAINT uq_contratos_clientes_numero UNIQUE (numero),
  CONSTRAINT chk_contratos_clientes_tipo CHECK (tipo IN (
    'servicios','plan_salud','credito','adopcion','convenio','otro')),
  CONSTRAINT chk_contratos_clientes_estado CHECK (estado IN (
    'borrador','vigente','vencido','terminado','anulado')),
  CONSTRAINT fk_contratos_clientes FOREIGN KEY (cliente_id)
    REFERENCES usuarios.clientes(id) ON DELETE CASCADE
);

CREATE TABLE contratos.contratos_proveedores (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  proveedor_id INTEGER NOT NULL,
  numero       VARCHAR(40) NOT NULL,
  tipo         VARCHAR(25) NOT NULL DEFAULT 'suministro',
  objeto       TEXT NULL,
  valor        NUMERIC(12,2) NULL,
  plazo_entrega_dias SMALLINT NULL,
  inicio       DATE NOT NULL DEFAULT CURRENT_DATE,
  fin          DATE NULL,
  estado       VARCHAR(15) NOT NULL DEFAULT 'vigente',
  firmado_en   DATE NULL,
  archivo      VARCHAR(255) NULL,
  CONSTRAINT uq_contratos_proveedores_numero UNIQUE (numero),
  CONSTRAINT chk_contratos_proveedores_tipo CHECK (tipo IN (
    'suministro','servicios','mantenimiento','arrendamiento','transporte','otro')),
  CONSTRAINT chk_contratos_proveedores_estado CHECK (estado IN (
    'borrador','vigente','vencido','terminado','anulado')),
  CONSTRAINT fk_contratos_proveedores FOREIGN KEY (proveedor_id)
    REFERENCES inventario.proveedores(id) ON DELETE CASCADE
);

CREATE TABLE contratos.contratos_empleados (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  empleado_id INTEGER NOT NULL,
  numero      VARCHAR(40) NOT NULL,
  tipo        VARCHAR(25) NOT NULL DEFAULT 'termino_indefinido',
  cargo       VARCHAR(80) NULL,
  salario     NUMERIC(12,2) NULL,
  jornada     VARCHAR(20) NULL,
  inicio      DATE NOT NULL DEFAULT CURRENT_DATE,
  fin         DATE NULL,
  estado      VARCHAR(15) NOT NULL DEFAULT 'vigente',
  firmado_en  DATE NULL,
  archivo     VARCHAR(255) NULL,
  CONSTRAINT uq_contratos_empleados_numero UNIQUE (numero),
  CONSTRAINT chk_contratos_empleados_tipo CHECK (tipo IN (
    'termino_indefinido','termino_fijo','obra_labor','aprendizaje','prestacion_servicios')),
  CONSTRAINT chk_contratos_empleados_estado CHECK (estado IN (
    'borrador','vigente','vencido','terminado','anulado')),
  CONSTRAINT fk_contratos_empleados FOREIGN KEY (empleado_id)
    REFERENCES usuarios.empleados(id) ON DELETE CASCADE
);

-- Las tres tablas siguientes son comunes a los tres tipos de contrato.
-- `contrato_tipo` dice a cuál apuntan; no hay FK porque una clave foránea
-- no puede apuntar a tres tablas distintas, así que el CHECK acota los
-- valores posibles y el backend hace la comprobación.
CREATE TABLE contratos.condiciones_contrato (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  contrato_tipo VARCHAR(15) NOT NULL,
  contrato_id   INTEGER NOT NULL,
  orden         SMALLINT NOT NULL DEFAULT 1,
  titulo        VARCHAR(140) NOT NULL,
  descripcion   TEXT NULL,
  obligatoria   SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT chk_condiciones_contrato_tipo CHECK (contrato_tipo IN ('cliente','proveedor','empleado')),
  CONSTRAINT chk_condiciones_contrato_obligatoria CHECK (obligatoria IN (0,1))
);
CREATE INDEX idx_condiciones_contrato ON contratos.condiciones_contrato (contrato_tipo, contrato_id);

CREATE TABLE contratos.renovaciones (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  contrato_tipo  VARCHAR(15) NOT NULL,
  contrato_id    INTEGER NOT NULL,
  fecha          DATE NOT NULL DEFAULT CURRENT_DATE,
  nuevo_fin      DATE NULL,
  valor_anterior NUMERIC(12,2) NULL,
  valor_nuevo    NUMERIC(12,2) NULL,
  motivo         TEXT NULL,
  aprobada_por   INTEGER NULL,
  CONSTRAINT chk_renovaciones_tipo CHECK (contrato_tipo IN ('cliente','proveedor','empleado')),
  CONSTRAINT fk_renovaciones_usuario FOREIGN KEY (aprobada_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_renovaciones_contrato ON contratos.renovaciones (contrato_tipo, contrato_id);

CREATE TABLE contratos.vencimientos_contrato (
  id                INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  contrato_tipo     VARCHAR(15) NOT NULL,
  contrato_id       INTEGER NOT NULL,
  fecha_vencimiento DATE NOT NULL,
  dias_aviso        SMALLINT NOT NULL DEFAULT 30,
  avisado_en        TIMESTAMP(0) NULL,
  estado            VARCHAR(15) NOT NULL DEFAULT 'pendiente',
  CONSTRAINT chk_vencimientos_contrato_tipo CHECK (contrato_tipo IN ('cliente','proveedor','empleado')),
  CONSTRAINT chk_vencimientos_contrato_estado CHECK (estado IN ('pendiente','avisado','renovado','vencido')),
  CONSTRAINT uq_vencimientos_contrato UNIQUE (contrato_tipo, contrato_id, fecha_vencimiento)
);
CREATE INDEX idx_vencimientos_contrato ON contratos.vencimientos_contrato (estado, fecha_vencimiento);

CREATE TABLE contratos.documentos_contrato (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  contrato_tipo VARCHAR(15) NOT NULL,
  contrato_id   INTEGER NOT NULL,
  tipo          VARCHAR(30) NOT NULL DEFAULT 'contrato',
  archivo       VARCHAR(255) NOT NULL,
  descripcion   VARCHAR(180) NULL,
  subido_en     TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  subido_por    INTEGER NULL,
  CONSTRAINT chk_documentos_contrato_tipo CHECK (contrato_tipo IN ('cliente','proveedor','empleado')),
  CONSTRAINT fk_documentos_contrato_usuario FOREIGN KEY (subido_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_documentos_contrato ON contratos.documentos_contrato (contrato_tipo, contrato_id);

-- --- Gestión de proveedores (módulo 68) ------------------------------
-- Los contratos con proveedores NO se repiten aquí: son
-- contratos.contratos_proveedores, que es el registro único.

CREATE TABLE contratos.evaluaciones_proveedor (
  id                   INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  proveedor_id         INTEGER NOT NULL,
  periodo              VARCHAR(7) NOT NULL,       -- AAAA-MM
  fecha                DATE NOT NULL DEFAULT CURRENT_DATE,
  calidad              SMALLINT NULL,
  cumplimiento_entrega SMALLINT NULL,
  precio               SMALLINT NULL,
  servicio             SMALLINT NULL,
  puntaje_total        NUMERIC(5,2) NULL,
  calificacion         VARCHAR(15) NULL,
  evaluado_por         INTEGER NULL,
  observaciones        TEXT NULL,
  CONSTRAINT uq_evaluaciones_proveedor UNIQUE (proveedor_id, periodo),
  CONSTRAINT chk_evaluaciones_proveedor_calificacion CHECK (calificacion IS NULL OR calificacion IN (
    'excelente','bueno','aceptable','deficiente','critico')),
  CONSTRAINT fk_evaluaciones_proveedor FOREIGN KEY (proveedor_id)
    REFERENCES inventario.proveedores(id) ON DELETE CASCADE,
  CONSTRAINT fk_evaluaciones_proveedor_usuario FOREIGN KEY (evaluado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE contratos.documentos_proveedor (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  proveedor_id INTEGER NOT NULL,
  tipo         VARCHAR(30) NOT NULL,
  numero       VARCHAR(60) NULL,
  archivo      VARCHAR(255) NULL,
  emitido_en   DATE NULL,
  vence_en     DATE NULL,
  vigente      SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT chk_documentos_proveedor_tipo CHECK (tipo IN (
    'rut','camara_comercio','invima','licencia','poliza','certificacion','bancario','otro')),
  CONSTRAINT chk_documentos_proveedor_vigente CHECK (vigente IN (0,1)),
  CONSTRAINT fk_documentos_proveedor FOREIGN KEY (proveedor_id)
    REFERENCES inventario.proveedores(id) ON DELETE CASCADE
);
CREATE INDEX idx_documentos_proveedor_vence ON contratos.documentos_proveedor (vigente, vence_en);

CREATE TABLE contratos.indicadores_proveedor (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  proveedor_id INTEGER NOT NULL,
  periodo      VARCHAR(7) NOT NULL,
  indicador    VARCHAR(80) NOT NULL,
  valor        NUMERIC(12,3) NULL,
  meta         NUMERIC(12,3) NULL,
  cumple       SMALLINT NULL,
  calculado_en TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_indicadores_proveedor UNIQUE (proveedor_id, periodo, indicador),
  CONSTRAINT chk_indicadores_proveedor_cumple CHECK (cumple IS NULL OR cumple IN (0,1)),
  CONSTRAINT fk_indicadores_proveedor FOREIGN KEY (proveedor_id)
    REFERENCES inventario.proveedores(id) ON DELETE CASCADE
);

CREATE TABLE contratos.incumplimientos (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  proveedor_id INTEGER NOT NULL,
  contrato_id  INTEGER NULL,
  compra_id    INTEGER NULL,
  fecha        DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo         VARCHAR(25) NOT NULL,
  descripcion  TEXT NULL,
  impacto      VARCHAR(10) NOT NULL DEFAULT 'medio',
  accion       TEXT NULL,
  estado       VARCHAR(15) NOT NULL DEFAULT 'abierto',
  CONSTRAINT chk_incumplimientos_tipo CHECK (tipo IN (
    'entrega_tardia','producto_defectuoso','cantidad','precio','documentacion','servicio','otro')),
  CONSTRAINT chk_incumplimientos_impacto CHECK (impacto IN ('bajo','medio','alto')),
  CONSTRAINT chk_incumplimientos_estado CHECK (estado IN ('abierto','en_gestion','resuelto','escalado')),
  CONSTRAINT fk_incumplimientos_proveedor FOREIGN KEY (proveedor_id)
    REFERENCES inventario.proveedores(id) ON DELETE CASCADE,
  CONSTRAINT fk_incumplimientos_contrato FOREIGN KEY (contrato_id)
    REFERENCES contratos.contratos_proveedores(id) ON DELETE SET NULL,
  CONSTRAINT fk_incumplimientos_compra FOREIGN KEY (compra_id)
    REFERENCES inventario.compras(id) ON DELETE SET NULL
);

CREATE TABLE contratos.historial_proveedor (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  proveedor_id   INTEGER NOT NULL,
  fecha          TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  evento         VARCHAR(60) NOT NULL,
  detalle        TEXT NULL,
  referencia_tipo VARCHAR(40) NULL,
  referencia_id  INTEGER NULL,
  usuario_id     INTEGER NULL,
  CONSTRAINT fk_historial_proveedor FOREIGN KEY (proveedor_id)
    REFERENCES inventario.proveedores(id) ON DELETE CASCADE,
  CONSTRAINT fk_historial_proveedor_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_historial_proveedor ON contratos.historial_proveedor (proveedor_id, fecha DESC);


-- =====================================================================
--  MÓDULO 71 · CONTROL FINANCIERO  ·  MÓDULO 72 · COMISIONES
--
--  facturacion ya guarda lo que se le cobra al cliente. Esto es la otra
--  cara: lo que la clínica debe, lo que le deben, en qué se gasta y
--  cuánto de eso es comisión del veterinario. Las reglas de comisión NO
--  se duplican: siguen siendo personal.reglas_comision.
-- =====================================================================

CREATE TABLE finanzas.categorias_gasto (
  id              SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre          VARCHAR(100) NOT NULL,
  tipo            VARCHAR(20) NOT NULL DEFAULT 'operativo',
  cuenta_contable VARCHAR(30) NULL,
  deducible       SMALLINT NOT NULL DEFAULT 1,
  activa          SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_categorias_gasto UNIQUE (nombre),
  CONSTRAINT chk_categorias_gasto_tipo CHECK (tipo IN (
    'operativo','administrativo','nomina','arriendo','servicios','insumos','impuestos','financiero','otro')),
  CONSTRAINT chk_categorias_gasto_deducible CHECK (deducible IN (0,1)),
  CONSTRAINT chk_categorias_gasto_activa CHECK (activa IN (0,1))
);

CREATE TABLE finanzas.gastos (
  id                INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id           SMALLINT NULL,
  categoria_gasto_id SMALLINT NULL,
  proveedor_id      INTEGER NULL,
  fecha             DATE NOT NULL DEFAULT CURRENT_DATE,
  concepto          VARCHAR(180) NOT NULL,
  valor             NUMERIC(12,2) NOT NULL,
  iva               NUMERIC(12,2) NOT NULL DEFAULT 0,
  total             NUMERIC(12,2) NOT NULL,
  forma_pago        VARCHAR(20) NULL,
  comprobante       VARCHAR(255) NULL,
  estado            VARCHAR(15) NOT NULL DEFAULT 'registrado',
  registrado_por    INTEGER NULL,
  CONSTRAINT chk_gastos_estado CHECK (estado IN ('registrado','aprobado','pagado','anulado')),
  CONSTRAINT chk_gastos_valor CHECK (valor >= 0 AND total >= 0),
  CONSTRAINT fk_gastos_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE SET NULL,
  CONSTRAINT fk_gastos_categoria FOREIGN KEY (categoria_gasto_id)
    REFERENCES finanzas.categorias_gasto(id) ON DELETE SET NULL,
  CONSTRAINT fk_gastos_proveedor FOREIGN KEY (proveedor_id)
    REFERENCES inventario.proveedores(id) ON DELETE SET NULL,
  CONSTRAINT fk_gastos_usuario FOREIGN KEY (registrado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_gastos_periodo ON finanzas.gastos (sede_id, fecha);

CREATE TABLE finanzas.cuentas_por_cobrar (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cliente_id   INTEGER NULL,
  factura_id   INTEGER NULL,
  sede_id      SMALLINT NULL,
  numero       VARCHAR(40) NULL,
  fecha_emision DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_vencimiento DATE NULL,
  valor        NUMERIC(12,2) NOT NULL,
  abonado      NUMERIC(12,2) NOT NULL DEFAULT 0,
  saldo        NUMERIC(12,2) NOT NULL DEFAULT 0,
  dias_mora    INTEGER NOT NULL DEFAULT 0,
  estado       VARCHAR(15) NOT NULL DEFAULT 'pendiente',
  CONSTRAINT chk_cxc_estado CHECK (estado IN ('pendiente','parcial','pagada','vencida','incobrable')),
  CONSTRAINT fk_cxc_cliente FOREIGN KEY (cliente_id)
    REFERENCES usuarios.clientes(id) ON DELETE SET NULL,
  CONSTRAINT fk_cxc_factura FOREIGN KEY (factura_id)
    REFERENCES facturacion.facturas(id) ON DELETE CASCADE,
  CONSTRAINT fk_cxc_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE SET NULL
);
CREATE INDEX idx_cxc_estado ON finanzas.cuentas_por_cobrar (estado, fecha_vencimiento);

CREATE TABLE finanzas.cuentas_por_pagar (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  proveedor_id INTEGER NULL,
  compra_id    INTEGER NULL,
  contrato_id  INTEGER NULL,
  gasto_id     INTEGER NULL,
  sede_id      SMALLINT NULL,
  numero       VARCHAR(40) NULL,
  fecha_emision DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_vencimiento DATE NULL,
  valor        NUMERIC(12,2) NOT NULL,
  abonado      NUMERIC(12,2) NOT NULL DEFAULT 0,
  saldo        NUMERIC(12,2) NOT NULL DEFAULT 0,
  dias_mora    INTEGER NOT NULL DEFAULT 0,
  estado       VARCHAR(15) NOT NULL DEFAULT 'pendiente',
  CONSTRAINT chk_cxp_estado CHECK (estado IN ('pendiente','parcial','pagada','vencida')),
  CONSTRAINT fk_cxp_proveedor FOREIGN KEY (proveedor_id)
    REFERENCES inventario.proveedores(id) ON DELETE SET NULL,
  CONSTRAINT fk_cxp_compra FOREIGN KEY (compra_id)
    REFERENCES inventario.compras(id) ON DELETE SET NULL,
  CONSTRAINT fk_cxp_contrato FOREIGN KEY (contrato_id)
    REFERENCES contratos.contratos_proveedores(id) ON DELETE SET NULL,
  CONSTRAINT fk_cxp_gasto FOREIGN KEY (gasto_id)
    REFERENCES finanzas.gastos(id) ON DELETE SET NULL,
  CONSTRAINT fk_cxp_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE SET NULL
);
CREATE INDEX idx_cxp_estado ON finanzas.cuentas_por_pagar (estado, fecha_vencimiento);

CREATE TABLE finanzas.presupuestos (
  id                  INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id             SMALLINT NULL,
  periodo             VARCHAR(7) NOT NULL,
  categoria_gasto_id  SMALLINT NULL,
  monto_presupuestado NUMERIC(12,2) NOT NULL DEFAULT 0,
  monto_ejecutado     NUMERIC(12,2) NOT NULL DEFAULT 0,
  variacion_pct       NUMERIC(6,2) NULL,
  estado              VARCHAR(15) NOT NULL DEFAULT 'abierto',
  aprobado_por        INTEGER NULL,
  CONSTRAINT uq_presupuestos UNIQUE (sede_id, periodo, categoria_gasto_id),
  CONSTRAINT chk_presupuestos_estado CHECK (estado IN ('borrador','abierto','cerrado','excedido')),
  CONSTRAINT fk_presupuestos_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE CASCADE,
  CONSTRAINT fk_presupuestos_categoria FOREIGN KEY (categoria_gasto_id)
    REFERENCES finanzas.categorias_gasto(id) ON DELETE SET NULL,
  CONSTRAINT fk_presupuestos_usuario FOREIGN KEY (aprobado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE finanzas.movimientos_financieros (
  id              INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id         SMALLINT NULL,
  fecha           TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  tipo            VARCHAR(10) NOT NULL,
  origen          VARCHAR(25) NOT NULL DEFAULT 'manual',
  referencia_tipo VARCHAR(40) NULL,
  referencia_id   INTEGER NULL,
  concepto        VARCHAR(180) NOT NULL,
  valor           NUMERIC(12,2) NOT NULL,
  saldo_acumulado NUMERIC(14,2) NULL,
  registrado_por  INTEGER NULL,
  CONSTRAINT chk_movimientos_fin_tipo CHECK (tipo IN ('ingreso','egreso')),
  CONSTRAINT chk_movimientos_fin_origen CHECK (origen IN (
    'manual','factura','pago','gasto','compra','caja','pasarela','ajuste')),
  CONSTRAINT fk_movimientos_fin_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE SET NULL,
  CONSTRAINT fk_movimientos_fin_usuario FOREIGN KEY (registrado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_movimientos_financieros ON finanzas.movimientos_financieros (sede_id, fecha DESC);

CREATE TABLE finanzas.conciliaciones (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id       SMALLINT NULL,
  cuenta        VARCHAR(80) NOT NULL,
  periodo       VARCHAR(7) NOT NULL,
  fecha         DATE NOT NULL DEFAULT CURRENT_DATE,
  saldo_libros  NUMERIC(14,2) NOT NULL DEFAULT 0,
  saldo_banco   NUMERIC(14,2) NOT NULL DEFAULT 0,
  diferencia    NUMERIC(14,2) NOT NULL DEFAULT 0,
  estado        VARCHAR(15) NOT NULL DEFAULT 'abierta',
  conciliado_por INTEGER NULL,
  observaciones TEXT NULL,
  CONSTRAINT uq_conciliaciones UNIQUE (sede_id, cuenta, periodo),
  CONSTRAINT chk_conciliaciones_estado CHECK (estado IN ('abierta','conciliada','con_diferencia')),
  CONSTRAINT fk_conciliaciones_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE CASCADE,
  CONSTRAINT fk_conciliaciones_usuario FOREIGN KEY (conciliado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE finanzas.cierres_contables (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id       SMALLINT NULL,
  periodo       VARCHAR(7) NOT NULL,
  fecha_cierre  DATE NULL,
  ingresos      NUMERIC(14,2) NOT NULL DEFAULT 0,
  gastos        NUMERIC(14,2) NOT NULL DEFAULT 0,
  utilidad      NUMERIC(14,2) NOT NULL DEFAULT 0,
  estado        VARCHAR(15) NOT NULL DEFAULT 'abierto',
  cerrado_por   INTEGER NULL,
  observaciones TEXT NULL,
  CONSTRAINT uq_cierres_contables UNIQUE (sede_id, periodo),
  CONSTRAINT chk_cierres_contables_estado CHECK (estado IN ('abierto','cerrado','reabierto')),
  CONSTRAINT fk_cierres_contables_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE CASCADE,
  CONSTRAINT fk_cierres_contables_usuario FOREIGN KEY (cerrado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

-- --- Comisiones (módulo 72) ------------------------------------------

CREATE TABLE finanzas.servicios_comisionables (
  id                INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  servicio_id       SMALLINT NULL,
  producto_id       INTEGER NULL,
  regla_comision_id SMALLINT NULL,
  porcentaje        NUMERIC(5,2) NULL,
  valor_fijo        NUMERIC(12,2) NULL,
  activo            SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT chk_servicios_comisionables_activo CHECK (activo IN (0,1)),
  CONSTRAINT chk_servicios_comisionables_base CHECK (servicio_id IS NOT NULL OR producto_id IS NOT NULL),
  CONSTRAINT fk_servicios_comisionables_servicio FOREIGN KEY (servicio_id)
    REFERENCES agenda.servicios(id) ON DELETE CASCADE,
  CONSTRAINT fk_servicios_comisionables_producto FOREIGN KEY (producto_id)
    REFERENCES inventario.productos(id) ON DELETE CASCADE,
  CONSTRAINT fk_servicios_comisionables_regla FOREIGN KEY (regla_comision_id)
    REFERENCES personal.reglas_comision(id) ON DELETE SET NULL
);

CREATE TABLE finanzas.ventas_comisionables (
  id                 INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  factura_id         INTEGER NULL,
  detalle_factura_id INTEGER NULL,
  veterinario_id     INTEGER NOT NULL,
  servicio_id        SMALLINT NULL,
  producto_id        INTEGER NULL,
  fecha              DATE NOT NULL DEFAULT CURRENT_DATE,
  base               NUMERIC(12,2) NOT NULL DEFAULT 0,
  porcentaje         NUMERIC(5,2) NULL,
  valor_comision     NUMERIC(12,2) NOT NULL DEFAULT 0,
  estado             VARCHAR(15) NOT NULL DEFAULT 'pendiente',
  CONSTRAINT chk_ventas_comisionables_estado CHECK (estado IN ('pendiente','liquidada','anulada')),
  CONSTRAINT fk_ventas_comisionables_factura FOREIGN KEY (factura_id)
    REFERENCES facturacion.facturas(id) ON DELETE CASCADE,
  CONSTRAINT fk_ventas_comisionables_detalle FOREIGN KEY (detalle_factura_id)
    REFERENCES facturacion.detalle_facturas(id) ON DELETE CASCADE,
  CONSTRAINT fk_ventas_comisionables_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_ventas_comisionables_servicio FOREIGN KEY (servicio_id)
    REFERENCES agenda.servicios(id) ON DELETE SET NULL,
  CONSTRAINT fk_ventas_comisionables_producto FOREIGN KEY (producto_id)
    REFERENCES inventario.productos(id) ON DELETE SET NULL
);
CREATE INDEX idx_ventas_comisionables ON finanzas.ventas_comisionables (veterinario_id, fecha, estado);

CREATE TABLE finanzas.comisiones_veterinario (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  veterinario_id INTEGER NOT NULL,
  periodo        VARCHAR(7) NOT NULL,
  ventas         INTEGER NOT NULL DEFAULT 0,
  total_base     NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_comision NUMERIC(14,2) NOT NULL DEFAULT 0,
  estado         VARCHAR(15) NOT NULL DEFAULT 'calculada',
  calculado_en   TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_comisiones_veterinario UNIQUE (veterinario_id, periodo),
  CONSTRAINT chk_comisiones_vet_estado CHECK (estado IN ('calculada','liquidada','pagada','anulada')),
  CONSTRAINT fk_comisiones_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE CASCADE
);

CREATE TABLE finanzas.liquidaciones (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  veterinario_id INTEGER NOT NULL,
  comision_id    INTEGER NULL,
  periodo        VARCHAR(7) NOT NULL,
  total_bruto    NUMERIC(14,2) NOT NULL DEFAULT 0,
  deducciones    NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_neto     NUMERIC(14,2) NOT NULL DEFAULT 0,
  estado         VARCHAR(15) NOT NULL DEFAULT 'borrador',
  liquidada_en   DATE NULL,
  pagada_en      DATE NULL,
  aprobada_por   INTEGER NULL,
  CONSTRAINT chk_liquidaciones_estado CHECK (estado IN ('borrador','aprobada','pagada','anulada')),
  CONSTRAINT fk_liquidaciones_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_liquidaciones_comision FOREIGN KEY (comision_id)
    REFERENCES finanzas.comisiones_veterinario(id) ON DELETE SET NULL,
  CONSTRAINT fk_liquidaciones_usuario FOREIGN KEY (aprobada_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE finanzas.historial_comisiones (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  veterinario_id INTEGER NOT NULL,
  liquidacion_id INTEGER NULL,
  fecha          TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  evento         VARCHAR(40) NOT NULL,
  valor          NUMERIC(14,2) NULL,
  detalle        TEXT NULL,
  usuario_id     INTEGER NULL,
  CONSTRAINT fk_historial_comisiones_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_historial_comisiones_liquidacion FOREIGN KEY (liquidacion_id)
    REFERENCES finanzas.liquidaciones(id) ON DELETE SET NULL,
  CONSTRAINT fk_historial_comisiones_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);


-- =====================================================================
--  MÓDULO 70 · GESTIÓN DE SUCURSALES
--
--  Va después del 71 porque el gasto consolidado de una sede se agrupa
--  por las categorías de gasto que define finanzas. Aquí no se registran
--  gastos uno a uno (eso es finanzas.gastos): se guarda el consolidado
--  del periodo contra su presupuesto, que es lo que compara el tablero.
-- =====================================================================

CREATE TABLE sucursales.configuracion_sede (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id        SMALLINT NOT NULL,
  clave          VARCHAR(80) NOT NULL,
  valor          TEXT NULL,
  tipo           VARCHAR(15) NOT NULL DEFAULT 'texto',
  descripcion    VARCHAR(180) NULL,
  actualizado_en TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_configuracion_sede UNIQUE (sede_id, clave),
  CONSTRAINT chk_configuracion_sede_tipo CHECK (tipo IN ('texto','numero','booleano','json','fecha')),
  CONSTRAINT fk_configuracion_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE CASCADE
);

CREATE TABLE sucursales.responsables_sede (
  id         INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id    SMALLINT NOT NULL,
  usuario_id INTEGER NOT NULL,
  cargo      VARCHAR(60) NOT NULL DEFAULT 'director',
  desde      DATE NOT NULL DEFAULT CURRENT_DATE,
  hasta      DATE NULL,
  principal  SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT chk_responsables_sede_principal CHECK (principal IN (0,1)),
  CONSTRAINT fk_responsables_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE CASCADE,
  CONSTRAINT fk_responsables_sede_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios.usuarios(id) ON DELETE CASCADE
);

CREATE TABLE sucursales.metas_sede (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id      SMALLINT NOT NULL,
  periodo      VARCHAR(7) NOT NULL,
  indicador    VARCHAR(80) NOT NULL,
  meta         NUMERIC(14,2) NOT NULL,
  unidad       VARCHAR(20) NULL,
  definida_por INTEGER NULL,
  creado_en    TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_metas_sede UNIQUE (sede_id, periodo, indicador),
  CONSTRAINT fk_metas_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE CASCADE,
  CONSTRAINT fk_metas_sede_usuario FOREIGN KEY (definida_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE sucursales.gastos_sede (
  id                 INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id            SMALLINT NOT NULL,
  periodo            VARCHAR(7) NOT NULL,
  categoria_gasto_id SMALLINT NULL,
  total              NUMERIC(14,2) NOT NULL DEFAULT 0,
  presupuesto        NUMERIC(14,2) NULL,
  variacion_pct      NUMERIC(6,2) NULL,
  calculado_en       TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_gastos_sede UNIQUE (sede_id, periodo, categoria_gasto_id),
  CONSTRAINT fk_gastos_sede_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE CASCADE,
  CONSTRAINT fk_gastos_sede_categoria FOREIGN KEY (categoria_gasto_id)
    REFERENCES finanzas.categorias_gasto(id) ON DELETE SET NULL
);

CREATE TABLE sucursales.ingresos_sede (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id     SMALLINT NOT NULL,
  periodo     VARCHAR(7) NOT NULL,
  origen      VARCHAR(25) NOT NULL DEFAULT 'servicios',
  total       NUMERIC(14,2) NOT NULL DEFAULT 0,
  meta        NUMERIC(14,2) NULL,
  variacion_pct NUMERIC(6,2) NULL,
  calculado_en TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_ingresos_sede UNIQUE (sede_id, periodo, origen),
  CONSTRAINT chk_ingresos_sede_origen CHECK (origen IN (
    'servicios','productos','tienda','planes','hospitalizacion','laboratorio','otros')),
  CONSTRAINT fk_ingresos_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE CASCADE
);

CREATE TABLE sucursales.indicadores_sede (
  id               INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id          SMALLINT NOT NULL,
  periodo          VARCHAR(7) NOT NULL,
  indicador        VARCHAR(80) NOT NULL,
  valor            NUMERIC(14,3) NOT NULL DEFAULT 0,
  meta             NUMERIC(14,3) NULL,
  cumplimiento_pct NUMERIC(6,2) NULL,
  calculado_en     TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_indicadores_sede UNIQUE (sede_id, periodo, indicador),
  CONSTRAINT fk_indicadores_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE CASCADE
);

CREATE TABLE sucursales.comparativas_sedes (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  periodo       VARCHAR(7) NOT NULL,
  indicador     VARCHAR(80) NOT NULL,
  sede_id       SMALLINT NOT NULL,
  valor         NUMERIC(14,3) NOT NULL DEFAULT 0,
  posicion      SMALLINT NULL,
  promedio_red  NUMERIC(14,3) NULL,
  calculado_en  TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_comparativas_sedes UNIQUE (periodo, indicador, sede_id),
  CONSTRAINT fk_comparativas_sedes FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE CASCADE
);


-- =====================================================================
--  MÓDULO 74 · CENTRO DE OPERACIONES
--
--  El tablero en vivo se arma con VISTAS (están al final del archivo,
--  junto a las demás): pacientes críticos, citas de hoy, hospitalizados,
--  urgencias, inventario crítico, equipos fuera de servicio y alertas.
--  Lo único que necesita tabla es la foto de cada indicador en el
--  momento en que se tomó: una vista dice cómo está la clínica AHORA y
--  no permite dibujar cómo estaba a las tres de la tarde.
-- =====================================================================

CREATE TABLE centro_operaciones.tablero_tiempo_real (
  id        INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id   SMALLINT NULL,
  indicador VARCHAR(60) NOT NULL,
  valor     NUMERIC(14,3) NOT NULL DEFAULT 0,
  unidad    VARCHAR(20) NULL,
  estado    VARCHAR(15) NOT NULL DEFAULT 'normal',
  momento   TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_tablero_estado CHECK (estado IN ('normal','atencion','critico')),
  CONSTRAINT fk_tablero_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE CASCADE
);
CREATE INDEX idx_tablero_tiempo_real ON centro_operaciones.tablero_tiempo_real (indicador, momento DESC);


-- =====================================================================
--  MÓDULO 75 · MOTOR DE REGLAS  ·  MÓDULO 76 · MOTOR DE AUTOMATIZACIÓN
--
--  Una REGLA decide (si pasa X entonces vale Y); un WORKFLOW ejecuta una
--  secuencia de pasos que pueden fallar y reintentarse. Por eso el
--  workflow tiene errores y reintentos y la regla no: la regla se evalúa
--  y termina.
--
--  Las condiciones se guardan como filas (campo / operador / valor) en
--  vez de una expresión de texto, para que la pantalla pueda armarlas y
--  el motor evaluarlas sin interpretar código escrito por el usuario.
-- =====================================================================

CREATE TABLE automatizacion.prioridades_regla (
  id          SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre      VARCHAR(40) NOT NULL,
  nivel       SMALLINT NOT NULL,
  descripcion VARCHAR(180) NULL,
  CONSTRAINT uq_prioridades_regla UNIQUE (nombre),
  CONSTRAINT chk_prioridades_regla_nivel CHECK (nivel BETWEEN 1 AND 99)
);

CREATE TABLE automatizacion.reglas (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  codigo         VARCHAR(60) NOT NULL,
  nombre         VARCHAR(140) NOT NULL,
  modulo         VARCHAR(40) NULL,
  descripcion    TEXT NULL,
  evento         VARCHAR(60) NOT NULL,
  prioridad_id   SMALLINT NULL,
  activa         SMALLINT NOT NULL DEFAULT 1,
  vigente_desde  DATE NULL,
  vigente_hasta  DATE NULL,
  creada_por     INTEGER NULL,
  creado_en      TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_reglas_codigo UNIQUE (codigo),
  CONSTRAINT chk_reglas_activa CHECK (activa IN (0,1)),
  CONSTRAINT fk_reglas_prioridad FOREIGN KEY (prioridad_id)
    REFERENCES automatizacion.prioridades_regla(id) ON DELETE SET NULL,
  CONSTRAINT fk_reglas_usuario FOREIGN KEY (creada_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_reglas_evento ON automatizacion.reglas (evento, activa);

CREATE TABLE automatizacion.condiciones_regla (
  id        INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  regla_id  INTEGER NOT NULL,
  orden     SMALLINT NOT NULL DEFAULT 1,
  grupo     SMALLINT NOT NULL DEFAULT 1,
  campo     VARCHAR(80) NOT NULL,
  operador  VARCHAR(15) NOT NULL,
  valor     VARCHAR(240) NULL,
  conector  VARCHAR(3) NOT NULL DEFAULT 'y',
  CONSTRAINT chk_condiciones_regla_operador CHECK (operador IN (
    'igual','distinto','mayor','menor','mayor_igual','menor_igual','contiene','entre','vacio','no_vacio')),
  CONSTRAINT chk_condiciones_regla_conector CHECK (conector IN ('y','o')),
  CONSTRAINT fk_condiciones_regla FOREIGN KEY (regla_id)
    REFERENCES automatizacion.reglas(id) ON DELETE CASCADE
);

CREATE TABLE automatizacion.acciones_regla (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  regla_id      INTEGER NOT NULL,
  orden         SMALLINT NOT NULL DEFAULT 1,
  tipo          VARCHAR(25) NOT NULL,
  destino       VARCHAR(120) NULL,
  parametros    JSONB NULL,
  detener_flujo SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT chk_acciones_regla_tipo CHECK (tipo IN (
    'notificar','crear_alerta','bloquear','asignar','marcar','descuento','webhook','workflow','registrar')),
  CONSTRAINT chk_acciones_regla_detener CHECK (detener_flujo IN (0,1)),
  CONSTRAINT fk_acciones_regla FOREIGN KEY (regla_id)
    REFERENCES automatizacion.reglas(id) ON DELETE CASCADE
);

CREATE TABLE automatizacion.excepciones_regla (
  id         INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  regla_id   INTEGER NOT NULL,
  tipo       VARCHAR(20) NOT NULL DEFAULT 'entidad',
  entidad    VARCHAR(40) NULL,
  entidad_id INTEGER NULL,
  motivo     VARCHAR(240) NULL,
  desde      DATE NULL,
  hasta      DATE NULL,
  creada_por INTEGER NULL,
  CONSTRAINT chk_excepciones_regla_tipo CHECK (tipo IN ('entidad','sede','rol','usuario','periodo')),
  CONSTRAINT fk_excepciones_regla FOREIGN KEY (regla_id)
    REFERENCES automatizacion.reglas(id) ON DELETE CASCADE,
  CONSTRAINT fk_excepciones_regla_usuario FOREIGN KEY (creada_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE automatizacion.ejecuciones_regla (
  id                  INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  regla_id            INTEGER NOT NULL,
  disparada_en        TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  entidad             VARCHAR(40) NULL,
  entidad_id          INTEGER NULL,
  resultado           VARCHAR(15) NOT NULL DEFAULT 'cumplida',
  acciones_ejecutadas SMALLINT NOT NULL DEFAULT 0,
  duracion_ms         INTEGER NULL,
  error               TEXT NULL,
  CONSTRAINT chk_ejecuciones_regla_resultado CHECK (resultado IN ('cumplida','no_cumplida','exceptuada','error')),
  CONSTRAINT fk_ejecuciones_regla FOREIGN KEY (regla_id)
    REFERENCES automatizacion.reglas(id) ON DELETE CASCADE
);
CREATE INDEX idx_ejecuciones_regla ON automatizacion.ejecuciones_regla (regla_id, disparada_en DESC);

CREATE TABLE automatizacion.historial_reglas (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  regla_id       INTEGER NOT NULL,
  version        SMALLINT NOT NULL DEFAULT 1,
  cambio         VARCHAR(140) NOT NULL,
  valor_antes    TEXT NULL,
  valor_despues  TEXT NULL,
  usuario_id     INTEGER NULL,
  fecha          TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT fk_historial_reglas FOREIGN KEY (regla_id)
    REFERENCES automatizacion.reglas(id) ON DELETE CASCADE,
  CONSTRAINT fk_historial_reglas_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

-- --- Motor de automatización (módulo 76) -----------------------------

CREATE TABLE automatizacion.workflows (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  codigo      VARCHAR(60) NOT NULL,
  nombre      VARCHAR(140) NOT NULL,
  modulo      VARCHAR(40) NULL,
  descripcion TEXT NULL,
  version     SMALLINT NOT NULL DEFAULT 1,
  estado      VARCHAR(15) NOT NULL DEFAULT 'borrador',
  activo      SMALLINT NOT NULL DEFAULT 0,
  creado_por  INTEGER NULL,
  creado_en   TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_workflows_codigo UNIQUE (codigo),
  CONSTRAINT chk_workflows_estado CHECK (estado IN ('borrador','publicado','pausado','retirado')),
  CONSTRAINT chk_workflows_activo CHECK (activo IN (0,1)),
  CONSTRAINT fk_workflows_usuario FOREIGN KEY (creado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE automatizacion.triggers_workflow (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  workflow_id  INTEGER NOT NULL,
  tipo         VARCHAR(20) NOT NULL DEFAULT 'evento',
  evento       VARCHAR(60) NULL,
  entidad      VARCHAR(40) NULL,
  programacion VARCHAR(60) NULL,          -- expresión cron si tipo = 'programado'
  activo       SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT chk_triggers_workflow_tipo CHECK (tipo IN ('evento','programado','manual','webhook')),
  CONSTRAINT chk_triggers_workflow_activo CHECK (activo IN (0,1)),
  CONSTRAINT fk_triggers_workflow FOREIGN KEY (workflow_id)
    REFERENCES automatizacion.workflows(id) ON DELETE CASCADE
);

CREATE TABLE automatizacion.condiciones_workflow (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  workflow_id INTEGER NOT NULL,
  paso        SMALLINT NOT NULL DEFAULT 1,
  campo       VARCHAR(80) NOT NULL,
  operador    VARCHAR(15) NOT NULL,
  valor       VARCHAR(240) NULL,
  conector    VARCHAR(3) NOT NULL DEFAULT 'y',
  CONSTRAINT chk_condiciones_workflow_operador CHECK (operador IN (
    'igual','distinto','mayor','menor','mayor_igual','menor_igual','contiene','entre','vacio','no_vacio')),
  CONSTRAINT chk_condiciones_workflow_conector CHECK (conector IN ('y','o')),
  CONSTRAINT fk_condiciones_workflow FOREIGN KEY (workflow_id)
    REFERENCES automatizacion.workflows(id) ON DELETE CASCADE
);

CREATE TABLE automatizacion.acciones_workflow (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  workflow_id  INTEGER NOT NULL,
  orden        SMALLINT NOT NULL DEFAULT 1,
  tipo         VARCHAR(25) NOT NULL,
  destino      VARCHAR(120) NULL,
  parametros   JSONB NULL,
  reintentable SMALLINT NOT NULL DEFAULT 1,
  timeout_seg  SMALLINT NULL,
  CONSTRAINT chk_acciones_workflow_tipo CHECK (tipo IN (
    'notificar','email','whatsapp','sms','crear_registro','actualizar_registro',
    'crear_alerta','webhook','esperar','asignar','generar_documento')),
  CONSTRAINT chk_acciones_workflow_reintentable CHECK (reintentable IN (0,1)),
  CONSTRAINT fk_acciones_workflow FOREIGN KEY (workflow_id)
    REFERENCES automatizacion.workflows(id) ON DELETE CASCADE
);

CREATE TABLE automatizacion.ejecuciones_workflow (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  workflow_id INTEGER NOT NULL,
  trigger_id  INTEGER NULL,
  entidad     VARCHAR(40) NULL,
  entidad_id  INTEGER NULL,
  inicio      TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  fin         TIMESTAMP(0) NULL,
  estado      VARCHAR(15) NOT NULL DEFAULT 'en_curso',
  pasos_ok    SMALLINT NOT NULL DEFAULT 0,
  pasos_error SMALLINT NOT NULL DEFAULT 0,
  contexto    JSONB NULL,
  CONSTRAINT chk_ejecuciones_workflow_estado CHECK (estado IN (
    'en_curso','completada','fallida','cancelada','esperando')),
  CONSTRAINT fk_ejecuciones_workflow FOREIGN KEY (workflow_id)
    REFERENCES automatizacion.workflows(id) ON DELETE CASCADE,
  CONSTRAINT fk_ejecuciones_workflow_trigger FOREIGN KEY (trigger_id)
    REFERENCES automatizacion.triggers_workflow(id) ON DELETE SET NULL
);
CREATE INDEX idx_ejecuciones_workflow ON automatizacion.ejecuciones_workflow (workflow_id, estado, inicio DESC);

CREATE TABLE automatizacion.errores_workflow (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  ejecucion_id INTEGER NOT NULL,
  workflow_id  INTEGER NULL,
  accion_id    INTEGER NULL,
  momento      TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  mensaje      VARCHAR(240) NOT NULL,
  detalle      TEXT NULL,
  resuelto     SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT chk_errores_workflow_resuelto CHECK (resuelto IN (0,1)),
  CONSTRAINT fk_errores_workflow_ejecucion FOREIGN KEY (ejecucion_id)
    REFERENCES automatizacion.ejecuciones_workflow(id) ON DELETE CASCADE,
  CONSTRAINT fk_errores_workflow_workflow FOREIGN KEY (workflow_id)
    REFERENCES automatizacion.workflows(id) ON DELETE CASCADE,
  CONSTRAINT fk_errores_workflow_accion FOREIGN KEY (accion_id)
    REFERENCES automatizacion.acciones_workflow(id) ON DELETE SET NULL
);

CREATE TABLE automatizacion.reintentos_workflow (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  ejecucion_id  INTEGER NOT NULL,
  error_id      INTEGER NULL,
  intento       SMALLINT NOT NULL DEFAULT 1,
  programado_en TIMESTAMP(0) NULL,
  ejecutado_en  TIMESTAMP(0) NULL,
  resultado     VARCHAR(15) NULL,
  mensaje       VARCHAR(240) NULL,
  CONSTRAINT chk_reintentos_workflow_resultado CHECK (resultado IS NULL OR resultado IN (
    'exitoso','fallido','descartado')),
  CONSTRAINT fk_reintentos_workflow_ejecucion FOREIGN KEY (ejecucion_id)
    REFERENCES automatizacion.ejecuciones_workflow(id) ON DELETE CASCADE,
  CONSTRAINT fk_reintentos_workflow_error FOREIGN KEY (error_id)
    REFERENCES automatizacion.errores_workflow(id) ON DELETE SET NULL
);


-- =====================================================================
--  MÓDULO 77 · IA CLÍNICA AUDITABLE  ·  MÓDULO 78 · IA ADMINISTRATIVA
--
--  Amplía el esquema `ia`, donde ya estaban solicitudes_ia y
--  sugerencias_ia. Lo que se añade es lo que hace la IA auditable: qué
--  fuentes se consultaron, quién revisó la sugerencia y quién la aprobó.
--  Una sugerencia clínica NO se aplica sola: sin fila en aprobaciones_ia
--  no ha pasado por un veterinario.
-- =====================================================================

CREATE TABLE ia.respuestas_ia (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  solicitud_id  INTEGER NOT NULL,
  modelo        VARCHAR(60) NULL,
  respuesta     TEXT NOT NULL,
  tokens_entrada INTEGER NULL,
  tokens_salida INTEGER NULL,
  confianza     NUMERIC(5,2) NULL,
  latencia_ms   INTEGER NULL,
  creada_en     TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT fk_respuestas_ia_solicitud FOREIGN KEY (solicitud_id)
    REFERENCES ia.solicitudes_ia(id) ON DELETE CASCADE
);

CREATE TABLE ia.fuentes_consultadas (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  respuesta_id   INTEGER NULL,
  solicitud_id   INTEGER NULL,
  tipo           VARCHAR(25) NOT NULL DEFAULT 'historia',
  referencia_tipo VARCHAR(40) NULL,
  referencia_id  INTEGER NULL,
  descripcion    VARCHAR(240) NULL,
  peso           NUMERIC(5,2) NULL,
  CONSTRAINT chk_fuentes_consultadas_tipo CHECK (tipo IN (
    'historia','laboratorio','imagen','protocolo','catalogo','literatura','inventario','otro')),
  CONSTRAINT fk_fuentes_consultadas_respuesta FOREIGN KEY (respuesta_id)
    REFERENCES ia.respuestas_ia(id) ON DELETE CASCADE,
  CONSTRAINT fk_fuentes_consultadas_solicitud FOREIGN KEY (solicitud_id)
    REFERENCES ia.solicitudes_ia(id) ON DELETE CASCADE
);

CREATE TABLE ia.sugerencias_clinicas (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  respuesta_id INTEGER NULL,
  mascota_id   INTEGER NULL,
  tipo         VARCHAR(25) NOT NULL DEFAULT 'diagnostico',
  texto        TEXT NOT NULL,
  fundamento   TEXT NULL,
  confianza    NUMERIC(5,2) NULL,
  estado       VARCHAR(15) NOT NULL DEFAULT 'propuesta',
  creada_en    TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_sugerencias_clinicas_tipo CHECK (tipo IN (
    'diagnostico','tratamiento','examen','dosis','interaccion','pronostico','seguimiento')),
  CONSTRAINT chk_sugerencias_clinicas_estado CHECK (estado IN (
    'propuesta','en_revision','aceptada','rechazada','aplicada')),
  CONSTRAINT fk_sugerencias_clinicas_respuesta FOREIGN KEY (respuesta_id)
    REFERENCES ia.respuestas_ia(id) ON DELETE CASCADE,
  CONSTRAINT fk_sugerencias_clinicas_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE SET NULL
);
CREATE INDEX idx_sugerencias_clinicas ON ia.sugerencias_clinicas (estado, creada_en DESC);

CREATE TABLE ia.revisiones_veterinario (
  id                    INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sugerencia_clinica_id INTEGER NOT NULL,
  veterinario_id        INTEGER NULL,
  fecha                 TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  decision              VARCHAR(15) NOT NULL,
  comentario            TEXT NULL,
  ajuste                TEXT NULL,
  CONSTRAINT chk_revisiones_vet_decision CHECK (decision IN ('acepta','rechaza','ajusta','consulta')),
  CONSTRAINT fk_revisiones_vet_sugerencia FOREIGN KEY (sugerencia_clinica_id)
    REFERENCES ia.sugerencias_clinicas(id) ON DELETE CASCADE,
  CONSTRAINT fk_revisiones_vet FOREIGN KEY (veterinario_id)
    REFERENCES usuarios.veterinarios(id) ON DELETE SET NULL
);

CREATE TABLE ia.aprobaciones_ia (
  id                    INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sugerencia_clinica_id INTEGER NOT NULL,
  revision_id           INTEGER NULL,
  aprobada_por          INTEGER NULL,
  fecha                 TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  alcance               VARCHAR(20) NOT NULL DEFAULT 'paciente',
  aplicada_en           TIMESTAMP(0) NULL,
  entidad               VARCHAR(40) NULL,
  entidad_id            INTEGER NULL,
  CONSTRAINT chk_aprobaciones_ia_alcance CHECK (alcance IN ('paciente','consulta','protocolo','global')),
  CONSTRAINT fk_aprobaciones_ia_sugerencia FOREIGN KEY (sugerencia_clinica_id)
    REFERENCES ia.sugerencias_clinicas(id) ON DELETE CASCADE,
  CONSTRAINT fk_aprobaciones_ia_revision FOREIGN KEY (revision_id)
    REFERENCES ia.revisiones_veterinario(id) ON DELETE SET NULL,
  CONSTRAINT fk_aprobaciones_ia_usuario FOREIGN KEY (aprobada_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE ia.historial_ia (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  solicitud_id INTEGER NULL,
  respuesta_id INTEGER NULL,
  usuario_id   INTEGER NULL,
  evento       VARCHAR(40) NOT NULL,
  detalle      TEXT NULL,
  fecha        TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT fk_historial_ia_solicitud FOREIGN KEY (solicitud_id)
    REFERENCES ia.solicitudes_ia(id) ON DELETE CASCADE,
  CONSTRAINT fk_historial_ia_respuesta FOREIGN KEY (respuesta_id)
    REFERENCES ia.respuestas_ia(id) ON DELETE SET NULL,
  CONSTRAINT fk_historial_ia_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

-- --- IA administrativa (módulo 78) -----------------------------------
-- Las predicciones guardan también el valor REAL cuando se conoce: sin
-- comparar lo previsto con lo ocurrido no hay forma de saber si el
-- modelo sirve, y una predicción que nadie mide es solo una opinión.

CREATE TABLE ia.analisis_ventas (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id       SMALLINT NULL,
  periodo       VARCHAR(7) NOT NULL,
  total_ventas  NUMERIC(14,2) NOT NULL DEFAULT 0,
  variacion_pct NUMERIC(6,2) NULL,
  top_servicios JSONB NULL,
  top_productos JSONB NULL,
  hallazgos     TEXT NULL,
  generado_en   TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_analisis_ventas UNIQUE (sede_id, periodo),
  CONSTRAINT fk_analisis_ventas_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE CASCADE
);

CREATE TABLE ia.predicciones_demanda (
  id               INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id          SMALLINT NULL,
  servicio_id      SMALLINT NULL,
  periodo          VARCHAR(7) NOT NULL,
  demanda_estimada NUMERIC(12,2) NOT NULL DEFAULT 0,
  intervalo_min    NUMERIC(12,2) NULL,
  intervalo_max    NUMERIC(12,2) NULL,
  modelo           VARCHAR(60) NULL,
  precision_pct    NUMERIC(5,2) NULL,
  demanda_real     NUMERIC(12,2) NULL,
  generada_en      TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_predicciones_demanda UNIQUE (sede_id, servicio_id, periodo),
  CONSTRAINT fk_predicciones_demanda_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE CASCADE,
  CONSTRAINT fk_predicciones_demanda_servicio FOREIGN KEY (servicio_id)
    REFERENCES agenda.servicios(id) ON DELETE CASCADE
);

CREATE TABLE ia.predicciones_inventario (
  id                INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id           SMALLINT NULL,
  producto_id       INTEGER NOT NULL,
  periodo           VARCHAR(7) NOT NULL,
  consumo_estimado  NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock_proyectado  NUMERIC(12,2) NULL,
  dias_cobertura    SMALLINT NULL,
  sugerencia_compra NUMERIC(12,2) NULL,
  consumo_real      NUMERIC(12,2) NULL,
  generada_en       TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_predicciones_inventario UNIQUE (sede_id, producto_id, periodo),
  CONSTRAINT fk_predicciones_inv_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE CASCADE,
  CONSTRAINT fk_predicciones_inv_producto FOREIGN KEY (producto_id)
    REFERENCES inventario.productos(id) ON DELETE CASCADE
);

CREATE TABLE ia.analisis_clientes (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cliente_id    INTEGER NOT NULL,
  periodo       VARCHAR(7) NOT NULL,
  segmento      VARCHAR(25) NULL,
  valor_vida    NUMERIC(14,2) NULL,
  frecuencia    NUMERIC(6,2) NULL,
  riesgo_fuga   NUMERIC(5,2) NULL,
  recomendacion TEXT NULL,
  generado_en   TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_analisis_clientes UNIQUE (cliente_id, periodo),
  CONSTRAINT chk_analisis_clientes_segmento CHECK (segmento IS NULL OR segmento IN (
    'nuevo','ocasional','frecuente','premium','en_riesgo','inactivo')),
  CONSTRAINT fk_analisis_clientes FOREIGN KEY (cliente_id)
    REFERENCES usuarios.clientes(id) ON DELETE CASCADE
);

CREATE TABLE ia.recomendaciones_negocio (
  id               INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id          SMALLINT NULL,
  categoria        VARCHAR(25) NOT NULL DEFAULT 'operacion',
  titulo           VARCHAR(180) NOT NULL,
  descripcion      TEXT NULL,
  impacto_estimado NUMERIC(14,2) NULL,
  prioridad        VARCHAR(10) NOT NULL DEFAULT 'media',
  estado           VARCHAR(15) NOT NULL DEFAULT 'propuesta',
  generada_en      TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_recomendaciones_negocio_categoria CHECK (categoria IN (
    'operacion','ventas','inventario','precios','personal','marketing','fidelizacion')),
  CONSTRAINT chk_recomendaciones_negocio_prioridad CHECK (prioridad IN ('baja','media','alta')),
  CONSTRAINT chk_recomendaciones_negocio_estado CHECK (estado IN (
    'propuesta','aceptada','descartada','aplicada')),
  CONSTRAINT fk_recomendaciones_negocio_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE CASCADE
);

CREATE TABLE ia.reportes_automaticos (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre        VARCHAR(140) NOT NULL,
  tipo          VARCHAR(30) NOT NULL DEFAULT 'ventas',
  periodicidad  VARCHAR(15) NOT NULL DEFAULT 'mensual',
  destinatarios TEXT NULL,
  formato       VARCHAR(10) NOT NULL DEFAULT 'pdf',
  ultimo_envio  TIMESTAMP(0) NULL,
  proximo_envio TIMESTAMP(0) NULL,
  activo        SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT uq_reportes_automaticos UNIQUE (nombre),
  CONSTRAINT chk_reportes_automaticos_periodicidad CHECK (periodicidad IN (
    'diaria','semanal','quincenal','mensual','trimestral','anual')),
  CONSTRAINT chk_reportes_automaticos_formato CHECK (formato IN ('pdf','csv','xlsx')),
  CONSTRAINT chk_reportes_automaticos_activo CHECK (activo IN (0,1))
);


-- =====================================================================
--  MÓDULO 79 · CENTRO DE DOCUMENTOS
--
--  Un documento clínico no se edita: se versiona. Cada versión guarda su
--  hash, y la firma se hace sobre ese hash; si alguien cambia el archivo,
--  la firma deja de cuadrar y se nota.
-- =====================================================================

CREATE TABLE documentos.versiones_documentos (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  documento_tipo VARCHAR(40) NOT NULL,
  documento_id   INTEGER NOT NULL,
  version        SMALLINT NOT NULL DEFAULT 1,
  archivo        VARCHAR(255) NOT NULL,
  hash           VARCHAR(64) NULL,
  tamano_bytes   INTEGER NULL,
  creado_por     INTEGER NULL,
  creado_en      TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  notas          VARCHAR(240) NULL,
  CONSTRAINT uq_versiones_documentos UNIQUE (documento_tipo, documento_id, version),
  CONSTRAINT fk_versiones_documentos_usuario FOREIGN KEY (creado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE documentos.firmas_documento (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  documento_tipo VARCHAR(40) NOT NULL,
  documento_id   INTEGER NOT NULL,
  version_id     INTEGER NULL,
  firmante_id    INTEGER NULL,
  tipo_firma     VARCHAR(20) NOT NULL DEFAULT 'electronica',
  hash_firma     VARCHAR(64) NULL,
  firmado_en     TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  ip             VARCHAR(45) NULL,
  valida         SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT chk_firmas_documento_tipo CHECK (tipo_firma IN ('electronica','digital','manuscrita')),
  CONSTRAINT chk_firmas_documento_valida CHECK (valida IN (0,1)),
  CONSTRAINT fk_firmas_documento_version FOREIGN KEY (version_id)
    REFERENCES documentos.versiones_documentos(id) ON DELETE CASCADE,
  CONSTRAINT fk_firmas_documento_usuario FOREIGN KEY (firmante_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE documentos.validaciones_documento (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  documento_tipo VARCHAR(40) NOT NULL,
  documento_id   INTEGER NOT NULL,
  version_id     INTEGER NULL,
  validado_por   INTEGER NULL,
  resultado      VARCHAR(15) NOT NULL DEFAULT 'aprobado',
  comentario     TEXT NULL,
  fecha          TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_validaciones_documento_resultado CHECK (resultado IN (
    'aprobado','rechazado','con_reparos')),
  CONSTRAINT fk_validaciones_documento_version FOREIGN KEY (version_id)
    REFERENCES documentos.versiones_documentos(id) ON DELETE CASCADE,
  CONSTRAINT fk_validaciones_documento_usuario FOREIGN KEY (validado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE documentos.vencimientos_documentos (
  id                INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  documento_tipo    VARCHAR(40) NOT NULL,
  documento_id      INTEGER NOT NULL,
  fecha_vencimiento DATE NOT NULL,
  dias_aviso        SMALLINT NOT NULL DEFAULT 30,
  avisado_en        TIMESTAMP(0) NULL,
  responsable_id    INTEGER NULL,
  estado            VARCHAR(15) NOT NULL DEFAULT 'vigente',
  CONSTRAINT chk_vencimientos_documentos_estado CHECK (estado IN (
    'vigente','por_vencer','vencido','renovado')),
  CONSTRAINT fk_vencimientos_documentos_usuario FOREIGN KEY (responsable_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_vencimientos_documentos ON documentos.vencimientos_documentos (estado, fecha_vencimiento);

CREATE TABLE documentos.permisos_documentos (
  id              INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  documento_tipo  VARCHAR(40) NOT NULL,
  documento_id    INTEGER NOT NULL,
  rol_id          SMALLINT NULL,
  usuario_id      INTEGER NULL,
  puede_ver       SMALLINT NOT NULL DEFAULT 1,
  puede_descargar SMALLINT NOT NULL DEFAULT 0,
  puede_editar    SMALLINT NOT NULL DEFAULT 0,
  otorgado_por    INTEGER NULL,
  otorgado_en     TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT chk_permisos_documentos_ver CHECK (puede_ver IN (0,1)),
  CONSTRAINT chk_permisos_documentos_descargar CHECK (puede_descargar IN (0,1)),
  CONSTRAINT chk_permisos_documentos_editar CHECK (puede_editar IN (0,1)),
  CONSTRAINT chk_permisos_documentos_sujeto CHECK (rol_id IS NOT NULL OR usuario_id IS NOT NULL),
  CONSTRAINT fk_permisos_documentos_rol FOREIGN KEY (rol_id)
    REFERENCES seguridad.roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_permisos_documentos_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios.usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_permisos_documentos_otorgante FOREIGN KEY (otorgado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE documentos.historial_descargas (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  documento_tipo VARCHAR(40) NOT NULL,
  documento_id   INTEGER NOT NULL,
  version_id     INTEGER NULL,
  usuario_id     INTEGER NULL,
  fecha          TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  ip             VARCHAR(45) NULL,
  formato        VARCHAR(10) NULL,
  CONSTRAINT fk_historial_descargas_version FOREIGN KEY (version_id)
    REFERENCES documentos.versiones_documentos(id) ON DELETE SET NULL,
  CONSTRAINT fk_historial_descargas_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_historial_descargas ON documentos.historial_descargas (documento_tipo, documento_id, fecha DESC);

CREATE TABLE documentos.documentos_archivados (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  documento_tipo VARCHAR(40) NOT NULL,
  documento_id   INTEGER NOT NULL,
  archivado_en   TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  archivado_por  INTEGER NULL,
  motivo         VARCHAR(240) NULL,
  ruta_archivo   VARCHAR(255) NULL,
  recuperable    SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT chk_documentos_archivados_recuperable CHECK (recuperable IN (0,1)),
  CONSTRAINT fk_documentos_archivados_usuario FOREIGN KEY (archivado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);


-- =====================================================================
--  MÓDULO 80 · CENTRO DE ALERTAS
--
--  Amplía el esquema `alertas`, donde ya estaban alertas_criticas y sus
--  reglas. Se separa por dominio en vez de meter todo en una tabla con
--  una columna "categoria" porque cada alerta apunta a algo distinto: la
--  clínica a un paciente, la de inventario a un lote, la financiera a
--  una factura. Con una sola tabla esos enlaces serían texto suelto.
-- =====================================================================

CREATE TABLE alertas.prioridades_alerta (
  id                  SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre              VARCHAR(40) NOT NULL,
  nivel               SMALLINT NOT NULL,
  color               VARCHAR(20) NULL,
  tiempo_respuesta_min SMALLINT NULL,
  descripcion         VARCHAR(180) NULL,
  CONSTRAINT uq_prioridades_alerta UNIQUE (nombre),
  CONSTRAINT chk_prioridades_alerta_nivel CHECK (nivel BETWEEN 1 AND 9)
);

CREATE TABLE alertas.alertas_clinicas (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mascota_id    INTEGER NULL,
  hospitalizacion_id INTEGER NULL,
  urgencia_id   INTEGER NULL,
  tipo          VARCHAR(30) NOT NULL,
  mensaje       VARCHAR(240) NOT NULL,
  prioridad_id  SMALLINT NULL,
  estado        VARCHAR(15) NOT NULL DEFAULT 'abierta',
  generada_en   TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  atendida_en   TIMESTAMP(0) NULL,
  atendida_por  INTEGER NULL,
  CONSTRAINT chk_alertas_clinicas_estado CHECK (estado IN ('abierta','vista','resuelta','descartada')),
  CONSTRAINT fk_alertas_clinicas_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas.mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_alertas_clinicas_hosp FOREIGN KEY (hospitalizacion_id)
    REFERENCES historia_clinica.hospitalizaciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_alertas_clinicas_urgencia FOREIGN KEY (urgencia_id)
    REFERENCES urgencias.ingresos_urgencias(id) ON DELETE CASCADE,
  CONSTRAINT fk_alertas_clinicas_prioridad FOREIGN KEY (prioridad_id)
    REFERENCES alertas.prioridades_alerta(id) ON DELETE SET NULL,
  CONSTRAINT fk_alertas_clinicas_usuario FOREIGN KEY (atendida_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_alertas_clinicas ON alertas.alertas_clinicas (estado, generada_en DESC);

CREATE TABLE alertas.alertas_inventario (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id      SMALLINT NULL,
  producto_id  INTEGER NULL,
  lote_id      INTEGER NULL,
  tipo         VARCHAR(25) NOT NULL,
  mensaje      VARCHAR(240) NOT NULL,
  cantidad     NUMERIC(12,2) NULL,
  umbral       NUMERIC(12,2) NULL,
  prioridad_id SMALLINT NULL,
  estado       VARCHAR(15) NOT NULL DEFAULT 'abierta',
  generada_en  TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  atendida_en  TIMESTAMP(0) NULL,
  CONSTRAINT chk_alertas_inventario_tipo CHECK (tipo IN (
    'stock_bajo','agotado','vencimiento','vencido','sobrestock','discrepancia')),
  CONSTRAINT chk_alertas_inventario_estado CHECK (estado IN ('abierta','vista','resuelta','descartada')),
  CONSTRAINT fk_alertas_inventario_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE CASCADE,
  CONSTRAINT fk_alertas_inventario_producto FOREIGN KEY (producto_id)
    REFERENCES inventario.productos(id) ON DELETE CASCADE,
  CONSTRAINT fk_alertas_inventario_lote FOREIGN KEY (lote_id)
    REFERENCES inventario.lotes(id) ON DELETE CASCADE,
  CONSTRAINT fk_alertas_inventario_prioridad FOREIGN KEY (prioridad_id)
    REFERENCES alertas.prioridades_alerta(id) ON DELETE SET NULL
);
CREATE INDEX idx_alertas_inventario ON alertas.alertas_inventario (estado, generada_en DESC);

CREATE TABLE alertas.alertas_financieras (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id      SMALLINT NULL,
  factura_id   INTEGER NULL,
  cuenta_cobrar_id INTEGER NULL,
  cuenta_pagar_id  INTEGER NULL,
  tipo         VARCHAR(25) NOT NULL,
  mensaje      VARCHAR(240) NOT NULL,
  valor        NUMERIC(14,2) NULL,
  prioridad_id SMALLINT NULL,
  estado       VARCHAR(15) NOT NULL DEFAULT 'abierta',
  generada_en  TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  atendida_en  TIMESTAMP(0) NULL,
  CONSTRAINT chk_alertas_financieras_tipo CHECK (tipo IN (
    'mora','vencimiento','presupuesto_excedido','caja_descuadrada','pago_rechazado','meta_incumplida')),
  CONSTRAINT chk_alertas_financieras_estado CHECK (estado IN ('abierta','vista','resuelta','descartada')),
  CONSTRAINT fk_alertas_financieras_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE CASCADE,
  CONSTRAINT fk_alertas_financieras_factura FOREIGN KEY (factura_id)
    REFERENCES facturacion.facturas(id) ON DELETE CASCADE,
  CONSTRAINT fk_alertas_financieras_cxc FOREIGN KEY (cuenta_cobrar_id)
    REFERENCES finanzas.cuentas_por_cobrar(id) ON DELETE CASCADE,
  CONSTRAINT fk_alertas_financieras_cxp FOREIGN KEY (cuenta_pagar_id)
    REFERENCES finanzas.cuentas_por_pagar(id) ON DELETE CASCADE,
  CONSTRAINT fk_alertas_financieras_prioridad FOREIGN KEY (prioridad_id)
    REFERENCES alertas.prioridades_alerta(id) ON DELETE SET NULL
);

CREATE TABLE alertas.alertas_seguridad (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  usuario_id   INTEGER NULL,
  sesion_id    INTEGER NULL,
  tipo         VARCHAR(30) NOT NULL,
  mensaje      VARCHAR(240) NOT NULL,
  ip           VARCHAR(45) NULL,
  prioridad_id SMALLINT NULL,
  estado       VARCHAR(15) NOT NULL DEFAULT 'abierta',
  generada_en  TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  atendida_en  TIMESTAMP(0) NULL,
  CONSTRAINT chk_alertas_seguridad_tipo CHECK (tipo IN (
    'intentos_fallidos','cuenta_bloqueada','acceso_inusual','permiso_elevado',
    'sesion_multiple','descarga_masiva','cambio_critico')),
  CONSTRAINT chk_alertas_seguridad_estado CHECK (estado IN ('abierta','vista','resuelta','descartada')),
  CONSTRAINT fk_alertas_seguridad_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios.usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_alertas_seguridad_sesion FOREIGN KEY (sesion_id)
    REFERENCES seguridad.sesiones(id) ON DELETE SET NULL,
  CONSTRAINT fk_alertas_seguridad_prioridad FOREIGN KEY (prioridad_id)
    REFERENCES alertas.prioridades_alerta(id) ON DELETE SET NULL
);

CREATE TABLE alertas.alertas_operativas (
  id           INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id      SMALLINT NULL,
  equipo_id    INTEGER NULL,
  area         VARCHAR(120) NULL,
  tipo         VARCHAR(30) NOT NULL,
  mensaje      VARCHAR(240) NOT NULL,
  prioridad_id SMALLINT NULL,
  estado       VARCHAR(15) NOT NULL DEFAULT 'abierta',
  generada_en  TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  atendida_en  TIMESTAMP(0) NULL,
  CONSTRAINT chk_alertas_operativas_tipo CHECK (tipo IN (
    'equipo_fuera_servicio','mantenimiento_vencido','personal_insuficiente',
    'sala_saturada','espera_excesiva','temperatura','residuos','otro')),
  CONSTRAINT chk_alertas_operativas_estado CHECK (estado IN ('abierta','vista','resuelta','descartada')),
  CONSTRAINT fk_alertas_operativas_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE CASCADE,
  CONSTRAINT fk_alertas_operativas_equipo FOREIGN KEY (equipo_id)
    REFERENCES equipos.equipos_medicos(id) ON DELETE CASCADE,
  CONSTRAINT fk_alertas_operativas_prioridad FOREIGN KEY (prioridad_id)
    REFERENCES alertas.prioridades_alerta(id) ON DELETE SET NULL
);

CREATE TABLE alertas.alertas_documentales (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  documento_tipo VARCHAR(40) NULL,
  documento_id   INTEGER NULL,
  vencimiento_id INTEGER NULL,
  tipo           VARCHAR(25) NOT NULL,
  mensaje        VARCHAR(240) NOT NULL,
  vence_en       DATE NULL,
  prioridad_id   SMALLINT NULL,
  estado         VARCHAR(15) NOT NULL DEFAULT 'abierta',
  generada_en    TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  atendida_en    TIMESTAMP(0) NULL,
  CONSTRAINT chk_alertas_documentales_tipo CHECK (tipo IN (
    'por_vencer','vencido','sin_firma','sin_validar','contrato','licencia')),
  CONSTRAINT chk_alertas_documentales_estado CHECK (estado IN ('abierta','vista','resuelta','descartada')),
  CONSTRAINT fk_alertas_documentales_vencimiento FOREIGN KEY (vencimiento_id)
    REFERENCES documentos.vencimientos_documentos(id) ON DELETE CASCADE,
  CONSTRAINT fk_alertas_documentales_prioridad FOREIGN KEY (prioridad_id)
    REFERENCES alertas.prioridades_alerta(id) ON DELETE SET NULL
);

-- Una alerta que nadie atiende sube de nivel. `alerta_origen` dice de qué
-- tabla salió, porque el escalamiento es el mismo para todas.
CREATE TABLE alertas.escalamiento_alertas (
  id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  alerta_origen VARCHAR(25) NOT NULL,
  alerta_id     INTEGER NOT NULL,
  nivel         SMALLINT NOT NULL DEFAULT 1,
  escalada_en   TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  escalada_a    INTEGER NULL,
  motivo        VARCHAR(240) NULL,
  respondida_en TIMESTAMP(0) NULL,
  estado        VARCHAR(15) NOT NULL DEFAULT 'abierto',
  CONSTRAINT chk_escalamiento_origen CHECK (alerta_origen IN (
    'critica','clinica','inventario','financiera','seguridad','operativa','documental')),
  CONSTRAINT chk_escalamiento_estado CHECK (estado IN ('abierto','respondido','cerrado')),
  CONSTRAINT fk_escalamiento_usuario FOREIGN KEY (escalada_a)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_escalamiento_alertas ON alertas.escalamiento_alertas (alerta_origen, alerta_id);


-- =====================================================================
--  MÓDULO 81 · CONTINUIDAD OPERATIVA
--
--  RTO es cuánto puede estar caído un servicio y RPO cuántos datos se
--  puede permitir perder. Están como columnas porque son lo que hay que
--  comparar contra la recuperación real cuando pasa algo.
-- =====================================================================

CREATE TABLE continuidad.servicios_criticos (
  id             SMALLINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  nombre         VARCHAR(140) NOT NULL,
  area           VARCHAR(60) NULL,
  sede_id        SMALLINT NULL,
  criticidad     VARCHAR(10) NOT NULL DEFAULT 'alta',
  rto_horas      NUMERIC(6,2) NULL,
  rpo_horas      NUMERIC(6,2) NULL,
  responsable_id INTEGER NULL,
  descripcion    TEXT NULL,
  CONSTRAINT uq_servicios_criticos UNIQUE (nombre, sede_id),
  CONSTRAINT chk_servicios_criticos_criticidad CHECK (criticidad IN ('baja','media','alta','vital')),
  CONSTRAINT fk_servicios_criticos_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE CASCADE,
  CONSTRAINT fk_servicios_criticos_usuario FOREIGN KEY (responsable_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE continuidad.planes_contingencia (
  id                 INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  servicio_critico_id SMALLINT NULL,
  nombre             VARCHAR(140) NOT NULL,
  version            SMALLINT NOT NULL DEFAULT 1,
  escenario          VARCHAR(180) NULL,
  procedimiento      TEXT NULL,
  responsable_id     INTEGER NULL,
  vigente_desde      DATE NULL,
  revisado_en        DATE NULL,
  estado             VARCHAR(15) NOT NULL DEFAULT 'vigente',
  CONSTRAINT chk_planes_contingencia_estado CHECK (estado IN ('borrador','vigente','en_revision','retirado')),
  CONSTRAINT fk_planes_contingencia_servicio FOREIGN KEY (servicio_critico_id)
    REFERENCES continuidad.servicios_criticos(id) ON DELETE CASCADE,
  CONSTRAINT fk_planes_contingencia_usuario FOREIGN KEY (responsable_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE continuidad.dependencias (
  id                 INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  servicio_critico_id SMALLINT NOT NULL,
  tipo               VARCHAR(25) NOT NULL DEFAULT 'proveedor',
  nombre             VARCHAR(140) NOT NULL,
  proveedor_id       INTEGER NULL,
  criticidad         VARCHAR(10) NOT NULL DEFAULT 'media',
  alternativa        VARCHAR(180) NULL,
  descripcion        TEXT NULL,
  CONSTRAINT chk_dependencias_tipo CHECK (tipo IN (
    'proveedor','energia','internet','software','equipo','personal','insumo','instalacion')),
  CONSTRAINT chk_dependencias_criticidad CHECK (criticidad IN ('baja','media','alta','vital')),
  CONSTRAINT fk_dependencias_servicio FOREIGN KEY (servicio_critico_id)
    REFERENCES continuidad.servicios_criticos(id) ON DELETE CASCADE,
  CONSTRAINT fk_dependencias_proveedor FOREIGN KEY (proveedor_id)
    REFERENCES inventario.proveedores(id) ON DELETE SET NULL
);

CREATE TABLE continuidad.puntos_recuperacion (
  id                 INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  servicio_critico_id SMALLINT NULL,
  tipo               VARCHAR(25) NOT NULL DEFAULT 'copia_datos',
  ubicacion          VARCHAR(180) NULL,
  frecuencia         VARCHAR(25) NULL,
  ultima_copia       TIMESTAMP(0) NULL,
  tamano_mb          NUMERIC(12,2) NULL,
  verificada_en      TIMESTAMP(0) NULL,
  estado             VARCHAR(15) NOT NULL DEFAULT 'vigente',
  CONSTRAINT chk_puntos_recuperacion_tipo CHECK (tipo IN (
    'copia_datos','copia_archivos','replica','snapshot','documental')),
  CONSTRAINT chk_puntos_recuperacion_estado CHECK (estado IN ('vigente','desactualizada','fallida')),
  CONSTRAINT fk_puntos_recuperacion_servicio FOREIGN KEY (servicio_critico_id)
    REFERENCES continuidad.servicios_criticos(id) ON DELETE CASCADE
);

CREATE TABLE continuidad.incidentes_continuidad (
  id                 INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  servicio_critico_id SMALLINT NULL,
  plan_id            INTEGER NULL,
  sede_id            SMALLINT NULL,
  inicio             TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  fin                TIMESTAMP(0) NULL,
  tipo               VARCHAR(25) NOT NULL DEFAULT 'tecnologico',
  severidad          VARCHAR(10) NOT NULL DEFAULT 'media',
  descripcion        TEXT NOT NULL,
  impacto            TEXT NULL,
  estado             VARCHAR(15) NOT NULL DEFAULT 'abierto',
  reportado_por      INTEGER NULL,
  CONSTRAINT chk_incidentes_cont_tipo CHECK (tipo IN (
    'tecnologico','electrico','natural','sanitario','seguridad','proveedor','personal','otro')),
  CONSTRAINT chk_incidentes_cont_severidad CHECK (severidad IN ('baja','media','alta','critica')),
  CONSTRAINT chk_incidentes_cont_estado CHECK (estado IN ('abierto','en_recuperacion','cerrado')),
  CONSTRAINT fk_incidentes_cont_servicio FOREIGN KEY (servicio_critico_id)
    REFERENCES continuidad.servicios_criticos(id) ON DELETE SET NULL,
  CONSTRAINT fk_incidentes_cont_plan FOREIGN KEY (plan_id)
    REFERENCES continuidad.planes_contingencia(id) ON DELETE SET NULL,
  CONSTRAINT fk_incidentes_cont_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE SET NULL,
  CONSTRAINT fk_incidentes_cont_usuario FOREIGN KEY (reportado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX idx_incidentes_continuidad ON continuidad.incidentes_continuidad (estado, severidad, inicio DESC);

CREATE TABLE continuidad.recuperaciones (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  incidente_id   INTEGER NOT NULL,
  plan_id        INTEGER NULL,
  inicio         TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  fin            TIMESTAMP(0) NULL,
  duracion_min   INTEGER NULL,
  rto_cumplido   SMALLINT NULL,
  acciones       TEXT NULL,
  resultado      VARCHAR(20) NULL,
  responsable_id INTEGER NULL,
  CONSTRAINT chk_recuperaciones_rto CHECK (rto_cumplido IS NULL OR rto_cumplido IN (0,1)),
  CONSTRAINT chk_recuperaciones_resultado CHECK (resultado IS NULL OR resultado IN (
    'total','parcial','fallida')),
  CONSTRAINT fk_recuperaciones_incidente FOREIGN KEY (incidente_id)
    REFERENCES continuidad.incidentes_continuidad(id) ON DELETE CASCADE,
  CONSTRAINT fk_recuperaciones_plan FOREIGN KEY (plan_id)
    REFERENCES continuidad.planes_contingencia(id) ON DELETE SET NULL,
  CONSTRAINT fk_recuperaciones_usuario FOREIGN KEY (responsable_id)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE continuidad.simulacros (
  id                 INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  plan_id            INTEGER NULL,
  servicio_critico_id SMALLINT NULL,
  fecha              DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo               VARCHAR(20) NOT NULL DEFAULT 'parcial',
  participantes      SMALLINT NULL,
  duracion_min       SMALLINT NULL,
  resultado          VARCHAR(20) NULL,
  hallazgos          TEXT NULL,
  calificacion       SMALLINT NULL,
  CONSTRAINT chk_simulacros_tipo CHECK (tipo IN ('escritorio','parcial','completo','sorpresa')),
  CONSTRAINT chk_simulacros_resultado CHECK (resultado IS NULL OR resultado IN (
    'satisfactorio','con_observaciones','fallido')),
  CONSTRAINT chk_simulacros_calificacion CHECK (calificacion IS NULL OR calificacion BETWEEN 1 AND 5),
  CONSTRAINT fk_simulacros_plan FOREIGN KEY (plan_id)
    REFERENCES continuidad.planes_contingencia(id) ON DELETE CASCADE,
  CONSTRAINT fk_simulacros_servicio FOREIGN KEY (servicio_critico_id)
    REFERENCES continuidad.servicios_criticos(id) ON DELETE SET NULL
);


-- =====================================================================
--  MÓDULO 82 · CENTRO DE CONFIGURACIÓN
--
--  configuracion.configuraciones seguía siendo una bolsa de clave/valor
--  para todo. Aquí se separa por dominio para poder darle a cada uno su
--  permiso: quien administra la facturación no tiene por qué poder
--  cambiar los umbrales clínicos. `parametros_por_sede` pisa el valor
--  general cuando una sede necesita otro.
-- =====================================================================

CREATE TABLE configuracion.parametros_clinicos (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  clave          VARCHAR(80) NOT NULL,
  valor          TEXT NULL,
  tipo           VARCHAR(15) NOT NULL DEFAULT 'texto',
  descripcion    VARCHAR(200) NULL,
  minimo         NUMERIC(14,3) NULL,
  maximo         NUMERIC(14,3) NULL,
  editable       SMALLINT NOT NULL DEFAULT 1,
  actualizado_por INTEGER NULL,
  actualizado_en TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_parametros_clinicos UNIQUE (clave),
  CONSTRAINT chk_parametros_clinicos_tipo CHECK (tipo IN ('texto','numero','booleano','json','fecha')),
  CONSTRAINT chk_parametros_clinicos_editable CHECK (editable IN (0,1)),
  CONSTRAINT fk_parametros_clinicos_usuario FOREIGN KEY (actualizado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE configuracion.parametros_facturacion (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  clave          VARCHAR(80) NOT NULL,
  valor          TEXT NULL,
  tipo           VARCHAR(15) NOT NULL DEFAULT 'texto',
  descripcion    VARCHAR(200) NULL,
  editable       SMALLINT NOT NULL DEFAULT 1,
  actualizado_por INTEGER NULL,
  actualizado_en TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_parametros_facturacion UNIQUE (clave),
  CONSTRAINT chk_parametros_facturacion_tipo CHECK (tipo IN ('texto','numero','booleano','json','fecha')),
  CONSTRAINT chk_parametros_facturacion_editable CHECK (editable IN (0,1)),
  CONSTRAINT fk_parametros_facturacion_usuario FOREIGN KEY (actualizado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE configuracion.parametros_inventario (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  clave          VARCHAR(80) NOT NULL,
  valor          TEXT NULL,
  tipo           VARCHAR(15) NOT NULL DEFAULT 'texto',
  descripcion    VARCHAR(200) NULL,
  editable       SMALLINT NOT NULL DEFAULT 1,
  actualizado_por INTEGER NULL,
  actualizado_en TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_parametros_inventario UNIQUE (clave),
  CONSTRAINT chk_parametros_inventario_tipo CHECK (tipo IN ('texto','numero','booleano','json','fecha')),
  CONSTRAINT chk_parametros_inventario_editable CHECK (editable IN (0,1)),
  CONSTRAINT fk_parametros_inventario_usuario FOREIGN KEY (actualizado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE configuracion.parametros_notificaciones (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  clave          VARCHAR(80) NOT NULL,
  valor          TEXT NULL,
  tipo           VARCHAR(15) NOT NULL DEFAULT 'texto',
  canal          VARCHAR(20) NULL,
  descripcion    VARCHAR(200) NULL,
  editable       SMALLINT NOT NULL DEFAULT 1,
  actualizado_por INTEGER NULL,
  actualizado_en TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_parametros_notificaciones UNIQUE (clave),
  CONSTRAINT chk_parametros_notif_tipo CHECK (tipo IN ('texto','numero','booleano','json','fecha')),
  CONSTRAINT chk_parametros_notif_canal CHECK (canal IS NULL OR canal IN (
    'email','sms','whatsapp','push','app')),
  CONSTRAINT chk_parametros_notif_editable CHECK (editable IN (0,1)),
  CONSTRAINT fk_parametros_notif_usuario FOREIGN KEY (actualizado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE configuracion.parametros_seguridad (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  clave          VARCHAR(80) NOT NULL,
  valor          TEXT NULL,
  tipo           VARCHAR(15) NOT NULL DEFAULT 'texto',
  descripcion    VARCHAR(200) NULL,
  editable       SMALLINT NOT NULL DEFAULT 1,
  actualizado_por INTEGER NULL,
  actualizado_en TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_parametros_seguridad UNIQUE (clave),
  CONSTRAINT chk_parametros_seguridad_tipo CHECK (tipo IN ('texto','numero','booleano','json','fecha')),
  CONSTRAINT chk_parametros_seguridad_editable CHECK (editable IN (0,1)),
  CONSTRAINT fk_parametros_seguridad_usuario FOREIGN KEY (actualizado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE configuracion.parametros_ia (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  clave          VARCHAR(80) NOT NULL,
  valor          TEXT NULL,
  tipo           VARCHAR(15) NOT NULL DEFAULT 'texto',
  descripcion    VARCHAR(200) NULL,
  editable       SMALLINT NOT NULL DEFAULT 1,
  actualizado_por INTEGER NULL,
  actualizado_en TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_parametros_ia UNIQUE (clave),
  CONSTRAINT chk_parametros_ia_tipo CHECK (tipo IN ('texto','numero','booleano','json','fecha')),
  CONSTRAINT chk_parametros_ia_editable CHECK (editable IN (0,1)),
  CONSTRAINT fk_parametros_ia_usuario FOREIGN KEY (actualizado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE configuracion.parametros_por_sede (
  id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  sede_id        SMALLINT NOT NULL,
  ambito         VARCHAR(20) NOT NULL,
  clave          VARCHAR(80) NOT NULL,
  valor          TEXT NULL,
  tipo           VARCHAR(15) NOT NULL DEFAULT 'texto',
  actualizado_por INTEGER NULL,
  actualizado_en TIMESTAMP(0) NOT NULL DEFAULT LOCALTIMESTAMP,
  CONSTRAINT uq_parametros_por_sede UNIQUE (sede_id, ambito, clave),
  CONSTRAINT chk_parametros_sede_ambito CHECK (ambito IN (
    'clinico','facturacion','inventario','notificaciones','seguridad','ia','general')),
  CONSTRAINT chk_parametros_sede_tipo CHECK (tipo IN ('texto','numero','booleano','json','fecha')),
  CONSTRAINT fk_parametros_sede FOREIGN KEY (sede_id)
    REFERENCES configuracion.sedes(id) ON DELETE CASCADE,
  CONSTRAINT fk_parametros_sede_usuario FOREIGN KEY (actualizado_por)
    REFERENCES usuarios.usuarios(id) ON DELETE SET NULL
);


-- =====================================================================
--  AUTOMATISMOS
-- =====================================================================

-- Toda mascota nueva abre su historia clínica automáticamente.
CREATE FUNCTION historia_clinica.trg_abrir_historia_clinica() RETURNS trigger AS $$
BEGIN
  INSERT INTO historia_clinica.historias_clinicas (mascota_id, numero)
  VALUES (NEW.id, 'HC-' || LPAD(NEW.id::text, 6, '0'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_mascota_historia AFTER INSERT ON mascotas.mascotas
  FOR EACH ROW EXECUTE FUNCTION historia_clinica.trg_abrir_historia_clinica();

-- Cada movimiento de inventario ajusta el total del producto y, si se indicó
-- ubicación, también la existencia de esa ubicación.
CREATE FUNCTION inventario.trg_ajustar_stock() RETURNS trigger AS $$
DECLARE
  delta INTEGER;
BEGIN
  IF NEW.tipo = 'entrada' THEN
    delta := NEW.cantidad;
  ELSIF NEW.tipo = 'salida' THEN
    delta := -NEW.cantidad;
  ELSE
    -- Ajuste: la cantidad es el nuevo total, no una diferencia.
    delta := NEW.cantidad - (SELECT cantidad FROM inventario.productos WHERE id = NEW.producto_id);
  END IF;

  UPDATE inventario.productos
     SET cantidad = GREATEST(cantidad + delta, 0)
   WHERE id = NEW.producto_id;

  IF NEW.ubicacion_id IS NOT NULL THEN
    INSERT INTO inventario.existencias (producto_id, ubicacion_id, lote_id, cantidad)
    VALUES (NEW.producto_id, NEW.ubicacion_id, NEW.lote_id, GREATEST(delta, 0))
    ON CONFLICT (producto_id, ubicacion_id, lote_id) DO UPDATE
      SET cantidad = GREATEST(inventario.existencias.cantidad + delta, 0),
          actualizado_en = LOCALTIMESTAMP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_movimiento_stock AFTER INSERT ON inventario.movimientos_inventario
  FOR EACH ROW EXECUTE FUNCTION inventario.trg_ajustar_stock();

-- Cada cambio de estado de una cita deja su renglón en la bitácora. El usuario
-- que lo hizo lo pone el backend con SET LOCAL huellitas.usuario_id.
CREATE FUNCTION agenda.trg_cita_historial() RETURNS trigger AS $$
DECLARE
  autor INTEGER;
BEGIN
  BEGIN
    autor := NULLIF(current_setting('huellitas.usuario_id', true), '')::INTEGER;
  EXCEPTION WHEN others THEN
    autor := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO agenda.cita_historial (cita_id, estado_antes, estado_nuevo, usuario_id, motivo)
    VALUES (NEW.id, NULL, NEW.estado, COALESCE(autor, NEW.creado_por), 'Cita creada');
  ELSIF NEW.estado IS DISTINCT FROM OLD.estado THEN
    INSERT INTO agenda.cita_historial (cita_id, estado_antes, estado_nuevo, usuario_id)
    VALUES (NEW.id, OLD.estado, NEW.estado, autor);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_citas_historial AFTER INSERT OR UPDATE ON agenda.citas
  FOR EACH ROW EXECUTE FUNCTION agenda.trg_cita_historial();

-- El peso que se toma en una consulta se copia a la ficha de la mascota y a
-- su curva de peso, que es donde lo consulta el dueño.
CREATE FUNCTION historia_clinica.trg_registrar_peso() RETURNS trigger AS $$
BEGIN
  IF NEW.peso_kg IS NOT NULL THEN
    UPDATE mascotas.mascotas SET peso_kg = NEW.peso_kg WHERE id = NEW.mascota_id;

    INSERT INTO mascotas.historial_peso (mascota_id, peso_kg, fecha, origen, consulta_id)
    VALUES (NEW.mascota_id, NEW.peso_kg, NEW.fecha::date, 'consulta', NEW.consulta_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_signos_peso AFTER INSERT ON historia_clinica.signos_vitales
  FOR EACH ROW EXECUTE FUNCTION historia_clinica.trg_registrar_peso();

-- Un pago cambia el estado de la factura sin que el backend tenga que
-- recalcularlo a mano (y sin que se le olvide).
CREATE FUNCTION facturacion.trg_actualizar_factura() RETURNS trigger AS $$
DECLARE
  fid INTEGER := COALESCE(NEW.factura_id, OLD.factura_id);
  cobrado NUMERIC(12,2);
  total_factura NUMERIC(12,2);
BEGIN
  SELECT COALESCE(SUM(valor), 0) INTO cobrado
    FROM facturacion.pagos WHERE factura_id = fid AND estado = 'registrado';

  SELECT total INTO total_factura FROM facturacion.facturas WHERE id = fid;

  UPDATE facturacion.facturas
     SET pagado = cobrado,
         estado = CASE
           WHEN estado = 'anulada'          THEN 'anulada'
           WHEN cobrado <= 0                THEN 'pendiente'
           WHEN cobrado >= total_factura    THEN 'pagada'
           ELSE 'parcial'
         END
   WHERE id = fid;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pagos_factura AFTER INSERT OR UPDATE OR DELETE ON facturacion.pagos
  FOR EACH ROW EXECUTE FUNCTION facturacion.trg_actualizar_factura();

-- Una jaula ocupada deja de ofrecerse, y al dar el alta pasa a limpieza en vez
-- de quedar disponible: entre un paciente y el siguiente hay que desinfectar.
CREATE FUNCTION historia_clinica.trg_estado_habitacion() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.habitacion_id IS NOT NULL
     AND (OLD.habitacion_id IS DISTINCT FROM NEW.habitacion_id OR NEW.estado <> 'activa') THEN
    UPDATE historia_clinica.habitaciones
       SET estado = 'limpieza'
     WHERE id = OLD.habitacion_id AND estado = 'ocupada';
  END IF;

  IF NEW.estado = 'activa' AND NEW.habitacion_id IS NOT NULL THEN
    UPDATE historia_clinica.habitaciones SET estado = 'ocupada' WHERE id = NEW.habitacion_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_hosp_habitacion AFTER INSERT OR UPDATE ON historia_clinica.hospitalizaciones
  FOR EACH ROW EXECUTE FUNCTION historia_clinica.trg_estado_habitacion();

-- El estado de la receta sale de sus renglones: no hace falta que quien
-- dispensa se acuerde de marcarla, y así no puede quedar "emitida" una receta
-- que ya se entregó entera.
CREATE FUNCTION farmacia.trg_estado_receta() RETURNS trigger AS $$
DECLARE
  rid        INTEGER := COALESCE(NEW.receta_id, OLD.receta_id);
  total      INTEGER;
  pendientes INTEGER;
  entregados INTEGER;
BEGIN
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE dispensado < cantidad),
         COUNT(*) FILTER (WHERE dispensado > 0)
    INTO total, pendientes, entregados
    FROM farmacia.receta_items
   WHERE receta_id = rid;

  UPDATE farmacia.recetas
     SET estado = CASE
       WHEN estado IN ('anulada','vencida') THEN estado
       WHEN total = 0                       THEN 'emitida'
       WHEN pendientes = 0                  THEN 'dispensada'
       WHEN entregados > 0                  THEN 'parcial'
       ELSE 'emitida'
     END
   WHERE id = rid;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_receta_items_estado
  AFTER INSERT OR UPDATE OF dispensado, cantidad OR DELETE ON farmacia.receta_items
  FOR EACH ROW EXECUTE FUNCTION farmacia.trg_estado_receta();

-- Bitácora del pedido, igual que la de las citas: cada estado con su hora y su
-- responsable, que es lo que se le enseña al cliente en el seguimiento.
CREATE FUNCTION tienda.trg_pedido_historial() RETURNS trigger AS $$
DECLARE
  autor INTEGER;
BEGIN
  BEGIN
    autor := NULLIF(current_setting('huellitas.usuario_id', true), '')::INTEGER;
  EXCEPTION WHEN others THEN
    autor := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO tienda.pedido_historial (pedido_id, estado, usuario_id, nota)
    VALUES (NEW.id, NEW.estado, autor, 'Pedido creado');
  ELSIF NEW.estado IS DISTINCT FROM OLD.estado THEN
    INSERT INTO tienda.pedido_historial (pedido_id, estado, usuario_id)
    VALUES (NEW.id, NEW.estado, autor);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pedidos_historial AFTER INSERT OR UPDATE ON tienda.pedidos
  FOR EACH ROW EXECUTE FUNCTION tienda.trg_pedido_historial();

-- Cada movimiento de puntos ajusta el saldo y recalcula el nivel del cliente.
CREATE FUNCTION fidelizacion.trg_aplicar_puntos() RETURNS trigger AS $$
BEGIN
  UPDATE fidelizacion.cuentas_puntos
     SET puntos = GREATEST(puntos + NEW.puntos, 0),
         -- Solo suman al acumulado histórico las ganancias: el nivel se calcula
         -- con lo que el cliente ha traído en total, así que canjear un premio
         -- no debe hacerle perder la categoría que ya se ganó.
         puntos_historicos = puntos_historicos + GREATEST(NEW.puntos, 0)
   WHERE id = NEW.cuenta_id;

  UPDATE fidelizacion.cuentas_puntos c
     SET nivel_id = (
       SELECT n.id
         FROM fidelizacion.niveles_cliente n
        WHERE n.puntos_minimos <= c.puntos_historicos
        ORDER BY n.puntos_minimos DESC
        LIMIT 1)
   WHERE c.id = NEW.cuenta_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_movimientos_puntos AFTER INSERT ON fidelizacion.movimientos_puntos
  FOR EACH ROW EXECUTE FUNCTION fidelizacion.trg_aplicar_puntos();


-- =====================================================================
--  VISTAS DE APOYO
-- =====================================================================

-- La agenda y los tres paneles leen las citas por aquí.
CREATE VIEW agenda.v_citas_detalle AS
SELECT
  c.id, c.inicio, c.fin, c.estado, c.motivo, c.notas, c.creado_en, c.sede_id,
  m.id  AS mascota_id,  m.nombre AS mascota_nombre, m.foto AS mascota_foto,
  e.nombre AS especie,
  cl.id AS cliente_id,  uc.nombre AS cliente_nombre, uc.telefono AS cliente_telefono,
  v.id  AS veterinario_id, uv.nombre AS veterinario_nombre, v.especialidad,
  s.id  AS servicio_id, s.nombre AS servicio_nombre, s.precio, s.duracion_min,
  sd.nombre AS sede_nombre
FROM agenda.citas c
JOIN mascotas.mascotas m       ON m.id  = c.mascota_id
JOIN mascotas.especies e       ON e.id  = m.especie_id
JOIN usuarios.clientes cl      ON cl.id = c.cliente_id
JOIN usuarios.usuarios uc      ON uc.id = cl.usuario_id
JOIN usuarios.veterinarios v   ON v.id  = c.veterinario_id
JOIN usuarios.usuarios uv      ON uv.id = v.usuario_id
JOIN agenda.servicios s        ON s.id  = c.servicio_id
LEFT JOIN configuracion.sedes sd ON sd.id = c.sede_id;

-- Permisos efectivos de cada usuario, que es lo que carga el middleware.
CREATE VIEW seguridad.v_permisos_usuario AS
SELECT u.id AS usuario_id, r.nombre AS rol, p.codigo, p.modulo
FROM usuarios.usuarios u
JOIN seguridad.roles r        ON r.id = u.rol_id
JOIN seguridad.rol_permisos rp ON rp.rol_id = r.id
JOIN seguridad.permisos p     ON p.id = rp.permiso_id;

-- Resumen de existencias por producto, con el aviso de stock bajo.
CREATE VIEW inventario.v_stock_productos AS
SELECT
  p.id, p.nombre, p.sku, p.cantidad, p.stock_minimo, p.precio_venta,
  cp.nombre AS categoria,
  (p.cantidad <= p.stock_minimo) AS stock_bajo,
  (SELECT MIN(l.fecha_vencimiento) FROM inventario.lotes l
    WHERE l.producto_id = p.id AND l.fecha_vencimiento >= CURRENT_DATE) AS proximo_vencimiento
FROM inventario.productos p
JOIN inventario.categorias_productos cp ON cp.id = p.categoria_id
WHERE p.activo = 1;

-- Lotes por vencer y ya vencidos, que es de donde salen dos de las alertas
-- críticas y el control de vencimientos de la farmacia.
CREATE VIEW inventario.v_lotes_vencimiento AS
SELECT
  l.id, l.codigo, l.fecha_vencimiento,
  p.id AS producto_id, p.nombre AS producto, p.sku,
  cp.nombre AS categoria, cp.tipo AS categoria_tipo,
  COALESCE(SUM(e.cantidad), 0) AS cantidad,
  (l.fecha_vencimiento - CURRENT_DATE) AS dias_restantes,
  CASE
    WHEN l.fecha_vencimiento < CURRENT_DATE                          THEN 'vencido'
    WHEN l.fecha_vencimiento <= CURRENT_DATE + INTERVAL '30 days'    THEN 'critico'
    WHEN l.fecha_vencimiento <= CURRENT_DATE + INTERVAL '90 days'    THEN 'proximo'
    ELSE 'vigente'
  END AS situacion
FROM inventario.lotes l
JOIN inventario.productos p ON p.id = l.producto_id
JOIN inventario.categorias_productos cp ON cp.id = p.categoria_id
LEFT JOIN inventario.existencias e ON e.lote_id = l.id
WHERE l.fecha_vencimiento IS NOT NULL
GROUP BY l.id, l.codigo, l.fecha_vencimiento, p.id, p.nombre, p.sku, cp.nombre, cp.tipo;

-- ---------------------------------------------------------------------
--  Línea de tiempo de la historia clínica
--
--  Une en una sola lista todo lo que le ha pasado a un paciente. Es una
--  vista y no una tabla a propósito: no hay nada que sincronizar, siempre
--  refleja lo que hay. Cada rama aporta las mismas columnas, así que la
--  pantalla solo tiene que ordenar por fecha y pintar.
-- ---------------------------------------------------------------------
CREATE VIEW historia_clinica.v_linea_tiempo AS
  SELECT h.mascota_id AS mascota_id, co.fecha, 'consulta'::varchar(20) AS tipo,
         co.motivo::text AS titulo, co.observaciones AS detalle, co.id AS referencia_id,
         uv.nombre AS veterinario
    FROM historia_clinica.consultas co
    JOIN historia_clinica.historias_clinicas h ON h.id = co.historia_id
    LEFT JOIN usuarios.veterinarios v ON v.id = co.veterinario_id
    LEFT JOIN usuarios.usuarios uv ON uv.id = v.usuario_id

  UNION ALL
  SELECT av.mascota_id, av.fecha_aplicacion::timestamp(0), 'vacuna',
         va.nombre::text, NULLIF(concat_ws(' · ', av.lote, av.observaciones), ''), av.id, uv.nombre
    FROM historia_clinica.aplicaciones_vacunas av
    JOIN historia_clinica.vacunas va ON va.id = av.vacuna_id
    LEFT JOIN usuarios.veterinarios v ON v.id = av.veterinario_id
    LEFT JOIN usuarios.usuarios uv ON uv.id = v.usuario_id

  UNION ALL
  SELECT d.mascota_id, d.fecha::timestamp(0), 'desparasitacion',
         d.producto::text, NULLIF(concat_ws(' · ', d.tipo, d.dosis), ''), d.id, uv.nombre
    FROM historia_clinica.desparasitaciones d
    LEFT JOIN usuarios.veterinarios v ON v.id = d.veterinario_id
    LEFT JOIN usuarios.usuarios uv ON uv.id = v.usuario_id

  UNION ALL
  SELECT ex.mascota_id, ex.fecha_solicitud::timestamp(0), 'examen',
         COALESCE(te.nombre, ex.descripcion, 'Examen')::text, ex.conclusion, ex.id, uv.nombre
    FROM historia_clinica.examenes ex
    LEFT JOIN historia_clinica.tipos_examen te ON te.id = ex.tipo_examen_id
    LEFT JOIN usuarios.veterinarios v ON v.id = ex.solicitado_por
    LEFT JOIN usuarios.usuarios uv ON uv.id = v.usuario_id

  UNION ALL
  SELECT ci.mascota_id, ci.fecha + COALESCE(ci.hora_inicio, TIME '00:00'), 'cirugia',
         ci.nombre::text, COALESCE(ci.resultado, ci.descripcion), ci.id, uv.nombre
    FROM historia_clinica.cirugias ci
    LEFT JOIN usuarios.veterinarios v ON v.id = ci.veterinario_id
    LEFT JOIN usuarios.usuarios uv ON uv.id = v.usuario_id

  UNION ALL
  SELECT ho.mascota_id, ho.fecha_ingreso, 'hospitalizacion',
         ho.motivo::text, COALESCE(ho.epicrisis, ho.indicaciones), ho.id, uv.nombre
    FROM historia_clinica.hospitalizaciones ho
    LEFT JOIN usuarios.veterinarios v ON v.id = ho.veterinario_id
    LEFT JOIN usuarios.usuarios uv ON uv.id = v.usuario_id

  UNION ALL
  SELECT iu.mascota_id, iu.llegada, 'urgencia',
         iu.motivo::text, NULLIF(concat_ws(' · ', iu.prioridad, iu.desenlace), ''), iu.id, uv.nombre
    FROM urgencias.ingresos_urgencias iu
    LEFT JOIN usuarios.veterinarios v ON v.id = iu.veterinario_id
    LEFT JOIN usuarios.usuarios uv ON uv.id = v.usuario_id

  UNION ALL
  SELECT es.mascota_id, es.fecha, 'imagen',
         concat_ws(' · ', es.modalidad, es.region)::text, inf.conclusion, es.id, uv.nombre
    FROM imagenes.estudios_imagen es
    LEFT JOIN imagenes.informes_imagen inf ON inf.estudio_id = es.id
    LEFT JOIN usuarios.veterinarios v ON v.id = es.solicitado_por
    LEFT JOIN usuarios.usuarios uv ON uv.id = v.usuario_id

  UNION ALL
  SELECT ev.mascota_id, ev.fecha, 'evolucion',
         COALESCE(ev.estado_paciente, 'Evolución')::text, COALESCE(ev.analisis, ev.plan), ev.id, uv.nombre
    FROM historia_clinica.evoluciones ev
    LEFT JOIN usuarios.veterinarios v ON v.id = ev.veterinario_id
    LEFT JOIN usuarios.usuarios uv ON uv.id = v.usuario_id;

-- ---------------------------------------------------------------------
--  Vacunación: qué le falta a cada paciente
--
--  Toma la última aplicación de cada vacuna y la compara con hoy. Una
--  vacuna que nunca se aplicó no sale aquí: eso lo resuelve el esquema de
--  vacunación, que sí sabe qué debería tener por edad.
-- ---------------------------------------------------------------------
CREATE VIEW historia_clinica.v_vacunas_pendientes AS
SELECT
  m.id AS mascota_id, m.nombre AS mascota, m.cliente_id,
  u.id AS usuario_id, u.nombre AS cliente, u.email, u.telefono,
  va.id AS vacuna_id, va.nombre AS vacuna,
  av.fecha_aplicacion AS ultima_aplicacion,
  av.proxima_fecha,
  (av.proxima_fecha - CURRENT_DATE) AS dias_restantes,
  CASE
    WHEN av.proxima_fecha < CURRENT_DATE                       THEN 'vencida'
    WHEN av.proxima_fecha <= CURRENT_DATE + INTERVAL '30 days' THEN 'proxima'
    ELSE 'al_dia'
  END AS situacion
FROM historia_clinica.aplicaciones_vacunas av
JOIN mascotas.mascotas m   ON m.id = av.mascota_id
JOIN usuarios.clientes cl  ON cl.id = m.cliente_id
JOIN usuarios.usuarios u   ON u.id = cl.usuario_id
JOIN historia_clinica.vacunas va ON va.id = av.vacuna_id
WHERE m.activo = 1 AND m.fallecido = 0 AND av.proxima_fecha IS NOT NULL
  -- Solo la última dosis de cada vacuna: las anteriores ya no dicen nada
  -- sobre si el paciente está al día.
  AND av.fecha_aplicacion = (
    SELECT MAX(a2.fecha_aplicacion) FROM historia_clinica.aplicaciones_vacunas a2
     WHERE a2.mascota_id = av.mascota_id AND a2.vacuna_id = av.vacuna_id);

CREATE VIEW historia_clinica.v_desparasitaciones_pendientes AS
SELECT
  m.id AS mascota_id, m.nombre AS mascota, m.cliente_id,
  u.id AS usuario_id, u.nombre AS cliente,
  d.id AS desparasitacion_id, d.tipo, d.producto,
  d.fecha AS ultima_aplicacion, d.proxima_fecha,
  (d.proxima_fecha - CURRENT_DATE) AS dias_restantes,
  CASE
    WHEN d.proxima_fecha < CURRENT_DATE                       THEN 'vencida'
    WHEN d.proxima_fecha <= CURRENT_DATE + INTERVAL '15 days' THEN 'proxima'
    ELSE 'al_dia'
  END AS situacion
FROM historia_clinica.desparasitaciones d
JOIN mascotas.mascotas m  ON m.id = d.mascota_id
JOIN usuarios.clientes cl ON cl.id = m.cliente_id
JOIN usuarios.usuarios u  ON u.id = cl.usuario_id
WHERE m.activo = 1 AND m.fallecido = 0 AND d.proxima_fecha IS NOT NULL
  AND d.fecha = (
    SELECT MAX(d2.fecha) FROM historia_clinica.desparasitaciones d2
     WHERE d2.mascota_id = d.mascota_id AND d2.tipo = d.tipo);

-- Tablero de hospitalización: quién está internado, dónde y qué control le
-- toca. `control_vencido` es lo que enciende la alerta en el panel.
CREATE VIEW historia_clinica.v_hospitalizados AS
SELECT
  ho.id, ho.mascota_id, m.nombre AS mascota, m.foto AS mascota_foto,
  e.nombre AS especie, ho.motivo, ho.estado, ho.pronostico,
  ho.fecha_ingreso, ho.sede_id, sd.nombre AS sede,
  hb.id AS habitacion_id, hb.codigo AS habitacion, hb.tipo AS habitacion_tipo,
  uv.nombre AS veterinario,
  cl.id AS cliente_id, uc.nombre AS cliente, uc.telefono AS cliente_telefono,
  (SELECT MAX(hc.fecha) FROM historia_clinica.hospitalizacion_controles hc
    WHERE hc.hospitalizacion_id = ho.id) AS ultimo_control,
  (SELECT MIN(hm.proxima_toma) FROM historia_clinica.hospitalizacion_medicacion hm
    WHERE hm.hospitalizacion_id = ho.id AND hm.estado = 'activo') AS proxima_medicacion,
  (SELECT COUNT(*) FROM historia_clinica.hospitalizacion_medicacion hm
    WHERE hm.hospitalizacion_id = ho.id AND hm.estado = 'activo'
      AND hm.proxima_toma IS NOT NULL AND hm.proxima_toma <= LOCALTIMESTAMP) AS medicacion_vencida
FROM historia_clinica.hospitalizaciones ho
JOIN mascotas.mascotas m  ON m.id = ho.mascota_id
JOIN mascotas.especies e  ON e.id = m.especie_id
JOIN usuarios.clientes cl ON cl.id = m.cliente_id
JOIN usuarios.usuarios uc ON uc.id = cl.usuario_id
LEFT JOIN usuarios.veterinarios v ON v.id = ho.veterinario_id
LEFT JOIN usuarios.usuarios uv ON uv.id = v.usuario_id
LEFT JOIN historia_clinica.habitaciones hb ON hb.id = ho.habitacion_id
LEFT JOIN configuracion.sedes sd ON sd.id = ho.sede_id
WHERE ho.estado = 'activa';

-- Sala de urgencias en tiempo real, ordenable por gravedad y no por llegada.
CREATE VIEW urgencias.v_urgencias_activas AS
SELECT
  iu.id, iu.mascota_id, m.nombre AS mascota, m.foto AS mascota_foto,
  e.nombre AS especie, iu.motivo, iu.prioridad, iu.estado, iu.desenlace,
  iu.llegada, iu.triage_en, iu.atencion_en,
  EXTRACT(EPOCH FROM (LOCALTIMESTAMP - iu.llegada))::integer / 60 AS minutos_espera,
  iu.sede_id, sd.nombre AS sede,
  sa.id AS sala_id, sa.nombre AS sala,
  -- El id además del nombre: la pantalla de triage lo necesita para dejar
  -- preseleccionado al veterinario que ya tenía asignado.
  iu.veterinario_id, uv.nombre AS veterinario,
  cl.id AS cliente_id, uc.nombre AS cliente, uc.telefono AS cliente_telefono,
  -- Peso del triage para ordenar: rojo primero, azul al final.
  CASE iu.prioridad
    WHEN 'rojo' THEN 1 WHEN 'naranja' THEN 2 WHEN 'amarillo' THEN 3
    WHEN 'verde' THEN 4 WHEN 'azul' THEN 5 ELSE 9
  END AS orden_prioridad
FROM urgencias.ingresos_urgencias iu
JOIN mascotas.mascotas m  ON m.id = iu.mascota_id
JOIN mascotas.especies e  ON e.id = m.especie_id
JOIN usuarios.clientes cl ON cl.id = iu.cliente_id
JOIN usuarios.usuarios uc ON uc.id = cl.usuario_id
LEFT JOIN usuarios.veterinarios v ON v.id = iu.veterinario_id
LEFT JOIN usuarios.usuarios uv ON uv.id = v.usuario_id
LEFT JOIN urgencias.salas_urgencias sa ON sa.id = iu.sala_id
LEFT JOIN configuracion.sedes sd ON sd.id = iu.sede_id
WHERE iu.estado <> 'cerrado';

-- Cuánto le queda al cliente de cada beneficio de su plan.
CREATE VIEW fidelizacion.v_beneficios_disponibles AS
SELECT
  s.id AS suscripcion_id, s.cliente_id, s.estado AS estado_suscripcion,
  s.inicio, s.fin,
  p.id AS plan_id, p.nombre AS plan,
  b.id AS beneficio_id, b.tipo, b.descripcion, b.cantidad_incluida, b.descuento_pct,
  COALESCE(SUM(cb.cantidad), 0) AS usados,
  CASE
    WHEN b.cantidad_incluida IS NULL THEN NULL
    ELSE GREATEST(b.cantidad_incluida - COALESCE(SUM(cb.cantidad), 0), 0)
  END AS disponibles
FROM fidelizacion.suscripciones_plan s
JOIN fidelizacion.planes_salud p    ON p.id = s.plan_id
JOIN fidelizacion.plan_beneficios b ON b.plan_id = p.id
LEFT JOIN fidelizacion.consumo_beneficios cb
       ON cb.suscripcion_id = s.id AND cb.beneficio_id = b.id
WHERE s.estado = 'activa'
GROUP BY s.id, s.cliente_id, s.estado, s.inicio, s.fin, p.id, p.nombre,
         b.id, b.tipo, b.descripcion, b.cantidad_incluida, b.descuento_pct;



-- ---------------------------------------------------------------------
--  MÓDULO 74 · Centro de operaciones
--
--  El tablero de la clínica no necesita tablas nuevas: necesita mirar a
--  la vez lo que ya está guardado en cinco módulos distintos. Se deja
--  como vistas para que el dato no se duplique y no pueda quedar viejo.
--
--  Hospitalizados y urgencias ya tienen su vista más arriba
--  (v_hospitalizados y v_urgencias_activas); el panel las consulta tal
--  cual y aquí no se repiten.
-- ---------------------------------------------------------------------

-- Pacientes críticos: los internados de pronóstico reservado o grave y
-- los de urgencias en rojo o naranja, en una sola lista.
CREATE VIEW centro_operaciones.v_pacientes_criticos AS
SELECT
  'hospitalizacion'::text AS origen, ho.id AS referencia_id,
  ho.mascota_id, m.nombre AS mascota, e.nombre AS especie,
  ho.sede_id, sd.nombre AS sede,
  ho.motivo, ho.pronostico AS gravedad, ho.fecha_ingreso AS desde,
  uv.nombre AS responsable
FROM historia_clinica.hospitalizaciones ho
JOIN mascotas.mascotas m ON m.id = ho.mascota_id
JOIN mascotas.especies e ON e.id = m.especie_id
LEFT JOIN configuracion.sedes sd ON sd.id = ho.sede_id
LEFT JOIN usuarios.veterinarios v ON v.id = ho.veterinario_id
LEFT JOIN usuarios.usuarios uv ON uv.id = v.usuario_id
WHERE ho.estado = 'activa' AND ho.pronostico IN ('reservado','malo')

UNION ALL
SELECT
  'urgencia'::text, iu.id,
  iu.mascota_id, m.nombre, e.nombre,
  iu.sede_id, sd.nombre,
  iu.motivo, iu.prioridad, iu.llegada,
  uv.nombre
FROM urgencias.ingresos_urgencias iu
JOIN mascotas.mascotas m ON m.id = iu.mascota_id
JOIN mascotas.especies e ON e.id = m.especie_id
LEFT JOIN configuracion.sedes sd ON sd.id = iu.sede_id
LEFT JOIN usuarios.veterinarios v ON v.id = iu.veterinario_id
LEFT JOIN usuarios.usuarios uv ON uv.id = v.usuario_id
WHERE iu.estado <> 'cerrado' AND iu.prioridad IN ('rojo','naranja');

-- Las citas de hoy con su estado, para el tablero de recepción.
CREATE VIEW centro_operaciones.v_citas_actuales AS
SELECT
  c.id, c.sede_id, sd.nombre AS sede,
  c.inicio, c.fin, c.estado, c.motivo,
  c.mascota_id, m.nombre AS mascota,
  c.cliente_id, uc.nombre AS cliente, uc.telefono AS cliente_telefono,
  c.veterinario_id, uv.nombre AS veterinario,
  s.nombre AS servicio,
  (c.inicio <= LOCALTIMESTAMP AND c.estado IN ('pendiente','confirmada')) AS en_mora
FROM agenda.citas c
JOIN mascotas.mascotas m   ON m.id = c.mascota_id
JOIN usuarios.clientes cl  ON cl.id = c.cliente_id
JOIN usuarios.usuarios uc  ON uc.id = cl.usuario_id
LEFT JOIN usuarios.veterinarios v ON v.id = c.veterinario_id
LEFT JOIN usuarios.usuarios uv ON uv.id = v.usuario_id
LEFT JOIN agenda.servicios s ON s.id = c.servicio_id
LEFT JOIN configuracion.sedes sd ON sd.id = c.sede_id
WHERE c.inicio::date = CURRENT_DATE;

-- Inventario crítico: lo que está por debajo del mínimo y lo que se
-- vence en menos de 30 días, que es lo que hay que resolver hoy.
CREATE VIEW centro_operaciones.v_inventario_critico AS
SELECT
  'stock'::text AS motivo, sp.id AS producto_id, sp.nombre AS producto,
  sp.sku, sp.categoria, sp.cantidad::numeric AS cantidad,
  sp.stock_minimo::numeric AS referencia, NULL::date AS vence_en
FROM inventario.v_stock_productos sp
WHERE sp.stock_bajo

UNION ALL
SELECT
  'vencimiento'::text, lv.producto_id, lv.producto,
  lv.sku, lv.categoria, lv.cantidad::numeric,
  NULL::numeric, lv.fecha_vencimiento
FROM inventario.v_lotes_vencimiento lv
WHERE lv.situacion IN ('vencido','critico');

-- Equipos que no se pueden usar y los que tienen el mantenimiento vencido.
CREATE VIEW centro_operaciones.v_equipos_fuera_servicio AS
SELECT
  eq.id, eq.codigo, eq.nombre, eq.categoria, eq.estado,
  eq.sede_id, sd.nombre AS sede, eq.ubicacion,
  eq.proximo_mantenimiento, eq.proxima_calibracion,
  u.nombre AS responsable,
  CASE
    WHEN eq.estado IN ('fuera_servicio','reparacion')                    THEN 'fuera_servicio'
    WHEN eq.estado = 'mantenimiento'                                     THEN 'en_mantenimiento'
    WHEN eq.proximo_mantenimiento < CURRENT_DATE                         THEN 'mantenimiento_vencido'
    ELSE 'calibracion_vencida'
  END AS situacion
FROM equipos.equipos_medicos eq
LEFT JOIN configuracion.sedes sd ON sd.id = eq.sede_id
LEFT JOIN usuarios.usuarios u ON u.id = eq.responsable_id
WHERE eq.activo = 1
  AND (eq.estado IN ('fuera_servicio','reparacion','mantenimiento')
       OR eq.proximo_mantenimiento < CURRENT_DATE
       OR eq.proxima_calibracion   < CURRENT_DATE);

-- Todas las alertas abiertas del sistema en una sola lista: las del
-- módulo 31 más las seis del centro de alertas (módulo 80).
CREATE VIEW centro_operaciones.v_alertas_globales AS
SELECT 'critica'::text AS origen, a.id, a.categoria::text AS tipo, a.titulo AS mensaje,
       a.severidad::text AS severidad, a.sede_id, a.estado, a.creado_en AS generada_en
  FROM alertas.alertas_criticas a WHERE a.estado IN ('abierta','vista')
UNION ALL
SELECT 'clinica', ac.id, ac.tipo, ac.mensaje,
       COALESCE(pa.nombre, 'media'), NULL::smallint, ac.estado, ac.generada_en
  FROM alertas.alertas_clinicas ac
  LEFT JOIN alertas.prioridades_alerta pa ON pa.id = ac.prioridad_id
 WHERE ac.estado IN ('abierta','vista')
UNION ALL
SELECT 'inventario', ai.id, ai.tipo, ai.mensaje,
       COALESCE(pa.nombre, 'media'), ai.sede_id, ai.estado, ai.generada_en
  FROM alertas.alertas_inventario ai
  LEFT JOIN alertas.prioridades_alerta pa ON pa.id = ai.prioridad_id
 WHERE ai.estado IN ('abierta','vista')
UNION ALL
SELECT 'financiera', af.id, af.tipo, af.mensaje,
       COALESCE(pa.nombre, 'media'), af.sede_id, af.estado, af.generada_en
  FROM alertas.alertas_financieras af
  LEFT JOIN alertas.prioridades_alerta pa ON pa.id = af.prioridad_id
 WHERE af.estado IN ('abierta','vista')
UNION ALL
SELECT 'seguridad', asg.id, asg.tipo, asg.mensaje,
       COALESCE(pa.nombre, 'media'), NULL::smallint, asg.estado, asg.generada_en
  FROM alertas.alertas_seguridad asg
  LEFT JOIN alertas.prioridades_alerta pa ON pa.id = asg.prioridad_id
 WHERE asg.estado IN ('abierta','vista')
UNION ALL
SELECT 'operativa', ao.id, ao.tipo, ao.mensaje,
       COALESCE(pa.nombre, 'media'), ao.sede_id, ao.estado, ao.generada_en
  FROM alertas.alertas_operativas ao
  LEFT JOIN alertas.prioridades_alerta pa ON pa.id = ao.prioridad_id
 WHERE ao.estado IN ('abierta','vista')
UNION ALL
SELECT 'documental', ad.id, ad.tipo, ad.mensaje,
       COALESCE(pa.nombre, 'media'), NULL::smallint, ad.estado, ad.generada_en
  FROM alertas.alertas_documentales ad
  LEFT JOIN alertas.prioridades_alerta pa ON pa.id = ad.prioridad_id
 WHERE ad.estado IN ('abierta','vista');


-- =====================================================================
--  SEGURIDAD A NIVEL DE BASE (específico de Supabase)
--
--  El backend se conecta con la cadena de PostgreSQL (rol postgres), que
--  NO pasa por RLS. Las claves anon/publishable, en cambio, sí llegarían a
--  estas tablas a través de la API REST de Supabase, y esa API es pública.
--
--  Por eso se activa RLS sin ninguna política: nadie que use las claves
--  del navegador puede leer ni escribir. Todo el acceso pasa por la API
--  de Express, que es la que valida sesión, rol y permisos.
-- =====================================================================

DO $huellitas$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT schemaname, tablename FROM pg_tables
     WHERE schemaname = ANY (public.huellitas_esquemas())
  LOOP
    -- Sin FORCE: el dueño de la tabla (el rol que usa el backend) sigue
    -- teniendo acceso; anon y authenticated quedan fuera.
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', t.schemaname, t.tablename);
  END LOOP;
END
$huellitas$;

-- Y por si acaso, se quitan los permisos de los roles del navegador sobre los
-- esquemas nuevos. Sin USAGE sobre el esquema no pueden ni nombrarlos.
DO $huellitas$
DECLARE
  r text;
  e text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      FOREACH e IN ARRAY public.huellitas_esquemas() LOOP
        EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM %I', e, r);
        EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM %I', e, r);
        EXECUTE format('REVOKE ALL ON SCHEMA %I FROM %I', e, r);
      END LOOP;
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
    END IF;
  END LOOP;
END
$huellitas$;
