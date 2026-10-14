-- =====================================================================
--  ⚠️  VERSIÓN ANTIGUA — YA NO SE USA
--
--  El proyecto migró a PostgreSQL (Supabase). El esquema vigente está en:
--      database/supabase/schema.sql
--  y se carga con:  npm run db:setup
--
--  Este archivo se conserva solo como referencia de la versión MySQL.
-- =====================================================================
--  Huellitas de Amor — Esquema de base de datos
--  Motor: MySQL 8.0+ / MariaDB 10.4+ (compatible con XAMPP)
-- =====================================================================

DROP DATABASE IF EXISTS huellitas;
CREATE DATABASE huellitas
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE huellitas;

-- =====================================================================
--  1. USUARIOS Y ROLES
-- =====================================================================

CREATE TABLE roles (
  id          TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  nombre      VARCHAR(30)  NOT NULL UNIQUE,   -- cliente | veterinario | admin
  descripcion VARCHAR(150) NULL
) ENGINE=InnoDB;

CREATE TABLE usuarios (
  id             INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  rol_id         TINYINT UNSIGNED NOT NULL,
  nombre         VARCHAR(120) NOT NULL,
  email          VARCHAR(160) NOT NULL,
  telefono       VARCHAR(30)  NULL,
  password_hash  VARCHAR(255) NOT NULL,
  estado         ENUM('activo','inactivo') NOT NULL DEFAULT 'activo',
  ultimo_acceso  DATETIME NULL,
  creado_en      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_usuarios_email UNIQUE (email),
  CONSTRAINT fk_usuarios_rol FOREIGN KEY (rol_id) REFERENCES roles(id),
  INDEX idx_usuarios_rol_estado (rol_id, estado)
) ENGINE=InnoDB;

-- Datos propios del cliente (dueño de mascotas)
CREATE TABLE clientes (
  id         INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  usuario_id INT UNSIGNED NOT NULL,
  documento  VARCHAR(30)  NULL,
  direccion  VARCHAR(180) NULL,
  ciudad     VARCHAR(80)  NULL,
  notas      TEXT NULL,
  creado_en  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_clientes_usuario UNIQUE (usuario_id),
  CONSTRAINT uq_clientes_documento UNIQUE (documento),
  CONSTRAINT fk_clientes_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE veterinarios (
  id                INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  usuario_id        INT UNSIGNED NOT NULL,
  licencia          VARCHAR(40)  NOT NULL,
  especialidad      ENUM('medicina_general','cirugia','dermatologia','cardiologia',
                         'odontologia','exoticos','imagenes','felinos')
                    NOT NULL DEFAULT 'medicina_general',
  foto              VARCHAR(255) NULL,
  descripcion       TEXT NULL,
  duracion_slot_min SMALLINT UNSIGNED NOT NULL DEFAULT 30,  -- granularidad de la agenda
  activo            TINYINT(1) NOT NULL DEFAULT 1,
  creado_en         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_veterinarios_usuario UNIQUE (usuario_id),
  CONSTRAINT uq_veterinarios_licencia UNIQUE (licencia),
  CONSTRAINT fk_veterinarios_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Horario de atención semanal de cada veterinario
CREATE TABLE horarios_veterinario (
  id             INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  veterinario_id INT UNSIGNED NOT NULL,
  dia_semana     TINYINT UNSIGNED NOT NULL,   -- 0=domingo … 6=sábado (igual que MySQL DAYOFWEEK-1)
  hora_inicio    TIME NOT NULL,
  hora_fin       TIME NOT NULL,
  CONSTRAINT fk_horarios_vet FOREIGN KEY (veterinario_id)
    REFERENCES veterinarios(id) ON DELETE CASCADE,
  CONSTRAINT chk_horarios_dia   CHECK (dia_semana BETWEEN 0 AND 6),
  CONSTRAINT chk_horarios_rango CHECK (hora_fin > hora_inicio),
  INDEX idx_horarios_vet_dia (veterinario_id, dia_semana)
) ENGINE=InnoDB;

-- Bloqueos puntuales (vacaciones, cirugía programada, capacitación…)
CREATE TABLE bloqueos_veterinario (
  id             INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  veterinario_id INT UNSIGNED NOT NULL,
  inicio         DATETIME NOT NULL,
  fin            DATETIME NOT NULL,
  motivo         VARCHAR(160) NULL,
  CONSTRAINT fk_bloqueos_vet FOREIGN KEY (veterinario_id)
    REFERENCES veterinarios(id) ON DELETE CASCADE,
  CONSTRAINT chk_bloqueos_rango CHECK (fin > inicio),
  INDEX idx_bloqueos_vet_rango (veterinario_id, inicio, fin)
) ENGINE=InnoDB;

-- =====================================================================
--  2. MASCOTAS
-- =====================================================================

CREATE TABLE especies (
  id     TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  nombre VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE razas (
  id         SMALLINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  especie_id TINYINT UNSIGNED NOT NULL,
  nombre     VARCHAR(80) NOT NULL,
  CONSTRAINT fk_razas_especie FOREIGN KEY (especie_id)
    REFERENCES especies(id) ON DELETE CASCADE,
  CONSTRAINT uq_razas UNIQUE (especie_id, nombre)
) ENGINE=InnoDB;

CREATE TABLE mascotas (
  id                INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  cliente_id        INT UNSIGNED NOT NULL,
  nombre            VARCHAR(80) NOT NULL,
  foto              VARCHAR(255) NULL,
  especie_id        TINYINT UNSIGNED NOT NULL,
  raza_id           SMALLINT UNSIGNED NULL,
  sexo              ENUM('macho','hembra','desconocido') NOT NULL DEFAULT 'desconocido',
  fecha_nacimiento  DATE NULL,
  peso_kg           DECIMAL(6,2) NULL,
  color             VARCHAR(60) NULL,
  microchip         VARCHAR(40) NULL,
  esterilizado      TINYINT(1) NOT NULL DEFAULT 0,
  informacion       TEXT NULL,
  activo            TINYINT(1) NOT NULL DEFAULT 1,
  creado_en         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_mascotas_microchip UNIQUE (microchip),
  CONSTRAINT fk_mascotas_cliente FOREIGN KEY (cliente_id)
    REFERENCES clientes(id) ON DELETE CASCADE,
  CONSTRAINT fk_mascotas_especie FOREIGN KEY (especie_id) REFERENCES especies(id),
  CONSTRAINT fk_mascotas_raza    FOREIGN KEY (raza_id)    REFERENCES razas(id) ON DELETE SET NULL,
  CONSTRAINT chk_mascotas_peso   CHECK (peso_kg IS NULL OR peso_kg > 0),
  INDEX idx_mascotas_cliente (cliente_id, activo)
) ENGINE=InnoDB;

-- =====================================================================
--  3. SERVICIOS Y CITAS
-- =====================================================================

CREATE TABLE servicios (
  id           SMALLINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  nombre       VARCHAR(100) NOT NULL,
  slug         VARCHAR(120) NOT NULL,
  descripcion  TEXT NULL,
  precio       DECIMAL(12,2) NOT NULL DEFAULT 0,
  duracion_min SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  requisitos   TEXT NULL,
  icono        VARCHAR(40) NULL,          -- id del sprite SVG del front
  activo       TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT uq_servicios_slug UNIQUE (slug),
  CONSTRAINT chk_servicios_precio CHECK (precio >= 0),
  CONSTRAINT chk_servicios_duracion CHECK (duracion_min > 0)
) ENGINE=InnoDB;

-- Qué veterinario puede atender qué servicio
CREATE TABLE servicio_veterinario (
  servicio_id    SMALLINT UNSIGNED NOT NULL,
  veterinario_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (servicio_id, veterinario_id),
  CONSTRAINT fk_sv_servicio FOREIGN KEY (servicio_id)
    REFERENCES servicios(id) ON DELETE CASCADE,
  CONSTRAINT fk_sv_veterinario FOREIGN KEY (veterinario_id)
    REFERENCES veterinarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE citas (
  id             INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  cliente_id     INT UNSIGNED NOT NULL,
  mascota_id     INT UNSIGNED NOT NULL,
  veterinario_id INT UNSIGNED NOT NULL,
  servicio_id    SMALLINT UNSIGNED NOT NULL,
  inicio         DATETIME NOT NULL,
  fin            DATETIME NOT NULL,
  estado         ENUM('pendiente','confirmada','atendida','cancelada','no_asistio')
                 NOT NULL DEFAULT 'pendiente',
  motivo         VARCHAR(255) NULL,
  notas          TEXT NULL,
  creado_por     INT UNSIGNED NULL,        -- usuario que la registró
  cancelada_en   DATETIME NULL,
  creado_en      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Vale NULL cuando la cita ya no ocupa agenda; los UNIQUE de MySQL ignoran
  -- los NULL, así que esto impide dos citas activas a la misma hora con el
  -- mismo veterinario, pero permite reusar el horario si se cancela.
  slot_ocupado DATETIME
    GENERATED ALWAYS AS (IF(estado IN ('cancelada','no_asistio'), NULL, inicio)) STORED,

  CONSTRAINT uq_citas_vet_slot UNIQUE (veterinario_id, slot_ocupado),
  CONSTRAINT fk_citas_cliente     FOREIGN KEY (cliente_id)     REFERENCES clientes(id),
  CONSTRAINT fk_citas_mascota     FOREIGN KEY (mascota_id)     REFERENCES mascotas(id),
  CONSTRAINT fk_citas_veterinario FOREIGN KEY (veterinario_id) REFERENCES veterinarios(id),
  CONSTRAINT fk_citas_servicio    FOREIGN KEY (servicio_id)    REFERENCES servicios(id),
  CONSTRAINT fk_citas_creador     FOREIGN KEY (creado_por)     REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT chk_citas_rango CHECK (fin > inicio),
  INDEX idx_citas_vet_fecha (veterinario_id, inicio),
  INDEX idx_citas_cliente  (cliente_id, inicio),
  INDEX idx_citas_mascota  (mascota_id, inicio),
  INDEX idx_citas_estado   (estado, inicio)
) ENGINE=InnoDB;

-- =====================================================================
--  4. HISTORIA CLÍNICA
-- =====================================================================

CREATE TABLE historias_clinicas (
  id         INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  mascota_id INT UNSIGNED NOT NULL,
  abierta_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_historias_mascota UNIQUE (mascota_id),
  CONSTRAINT fk_historias_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE consultas (
  id              INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  historia_id     INT UNSIGNED NOT NULL,
  cita_id         INT UNSIGNED NULL,
  veterinario_id  INT UNSIGNED NOT NULL,
  fecha           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  motivo          VARCHAR(255) NOT NULL,
  peso_kg         DECIMAL(6,2) NULL,
  temperatura_c   DECIMAL(4,1) NULL,
  frec_cardiaca   SMALLINT UNSIGNED NULL,
  frec_respiratoria SMALLINT UNSIGNED NULL,
  sintomas        TEXT NULL,
  observaciones   TEXT NULL,
  creado_en       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_consultas_cita UNIQUE (cita_id),
  CONSTRAINT fk_consultas_historia FOREIGN KEY (historia_id)
    REFERENCES historias_clinicas(id) ON DELETE CASCADE,
  CONSTRAINT fk_consultas_cita FOREIGN KEY (cita_id)
    REFERENCES citas(id) ON DELETE SET NULL,
  CONSTRAINT fk_consultas_vet FOREIGN KEY (veterinario_id) REFERENCES veterinarios(id),
  INDEX idx_consultas_historia (historia_id, fecha)
) ENGINE=InnoDB;

CREATE TABLE diagnosticos (
  id          INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  consulta_id INT UNSIGNED NOT NULL,
  descripcion TEXT NOT NULL,
  tipo        ENUM('presuntivo','definitivo') NOT NULL DEFAULT 'presuntivo',
  CONSTRAINT fk_diagnosticos_consulta FOREIGN KEY (consulta_id)
    REFERENCES consultas(id) ON DELETE CASCADE,
  INDEX idx_diagnosticos_consulta (consulta_id)
) ENGINE=InnoDB;

CREATE TABLE medicamentos (
  id             INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  nombre         VARCHAR(120) NOT NULL,
  principio_activo VARCHAR(120) NULL,
  presentacion   VARCHAR(80) NULL,
  CONSTRAINT uq_medicamentos_nombre UNIQUE (nombre, presentacion)
) ENGINE=InnoDB;

CREATE TABLE tratamientos (
  id            INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  consulta_id   INT UNSIGNED NOT NULL,
  descripcion   TEXT NOT NULL,
  indicaciones  TEXT NULL,
  fecha_inicio  DATE NULL,
  fecha_fin     DATE NULL,
  estado        ENUM('activo','finalizado','suspendido') NOT NULL DEFAULT 'activo',
  CONSTRAINT fk_tratamientos_consulta FOREIGN KEY (consulta_id)
    REFERENCES consultas(id) ON DELETE CASCADE,
  INDEX idx_tratamientos_consulta (consulta_id)
) ENGINE=InnoDB;

CREATE TABLE tratamiento_medicamentos (
  id              INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tratamiento_id  INT UNSIGNED NOT NULL,
  medicamento_id  INT UNSIGNED NOT NULL,
  dosis           VARCHAR(80) NULL,
  frecuencia      VARCHAR(80) NULL,
  duracion        VARCHAR(80) NULL,
  CONSTRAINT fk_tm_tratamiento FOREIGN KEY (tratamiento_id)
    REFERENCES tratamientos(id) ON DELETE CASCADE,
  CONSTRAINT fk_tm_medicamento FOREIGN KEY (medicamento_id) REFERENCES medicamentos(id)
) ENGINE=InnoDB;

-- Catálogo de vacunas
CREATE TABLE vacunas (
  id              SMALLINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  nombre          VARCHAR(100) NOT NULL,
  especie_id      TINYINT UNSIGNED NULL,
  refuerzo_meses  SMALLINT UNSIGNED NULL,   -- cada cuánto se repite
  CONSTRAINT uq_vacunas_nombre UNIQUE (nombre, especie_id),
  CONSTRAINT fk_vacunas_especie FOREIGN KEY (especie_id) REFERENCES especies(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Vacunas efectivamente aplicadas a una mascota
CREATE TABLE mascota_vacunas (
  id              INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  mascota_id      INT UNSIGNED NOT NULL,
  vacuna_id       SMALLINT UNSIGNED NOT NULL,
  consulta_id     INT UNSIGNED NULL,
  veterinario_id  INT UNSIGNED NOT NULL,
  fecha_aplicacion DATE NOT NULL,
  proxima_fecha   DATE NULL,
  lote            VARCHAR(60) NULL,
  observaciones   TEXT NULL,
  CONSTRAINT fk_mv_mascota   FOREIGN KEY (mascota_id) REFERENCES mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_mv_vacuna    FOREIGN KEY (vacuna_id)  REFERENCES vacunas(id),
  CONSTRAINT fk_mv_consulta  FOREIGN KEY (consulta_id) REFERENCES consultas(id) ON DELETE SET NULL,
  CONSTRAINT fk_mv_vet       FOREIGN KEY (veterinario_id) REFERENCES veterinarios(id),
  INDEX idx_mv_mascota (mascota_id, fecha_aplicacion),
  INDEX idx_mv_proxima (proxima_fecha)
) ENGINE=InnoDB;

CREATE TABLE alergias (
  id          INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  mascota_id  INT UNSIGNED NOT NULL,
  sustancia   VARCHAR(120) NOT NULL,
  severidad   ENUM('leve','moderada','grave') NOT NULL DEFAULT 'leve',
  notas       TEXT NULL,
  CONSTRAINT fk_alergias_mascota FOREIGN KEY (mascota_id)
    REFERENCES mascotas(id) ON DELETE CASCADE,
  INDEX idx_alergias_mascota (mascota_id)
) ENGINE=InnoDB;

CREATE TABLE cirugias (
  id             INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  mascota_id     INT UNSIGNED NOT NULL,
  veterinario_id INT UNSIGNED NOT NULL,
  consulta_id    INT UNSIGNED NULL,
  nombre         VARCHAR(150) NOT NULL,
  fecha          DATE NOT NULL,
  descripcion    TEXT NULL,
  resultado      TEXT NULL,
  CONSTRAINT fk_cirugias_mascota FOREIGN KEY (mascota_id) REFERENCES mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_cirugias_vet     FOREIGN KEY (veterinario_id) REFERENCES veterinarios(id),
  CONSTRAINT fk_cirugias_consulta FOREIGN KEY (consulta_id) REFERENCES consultas(id) ON DELETE SET NULL,
  INDEX idx_cirugias_mascota (mascota_id, fecha)
) ENGINE=InnoDB;

CREATE TABLE examenes (
  id           INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  mascota_id   INT UNSIGNED NOT NULL,
  consulta_id  INT UNSIGNED NULL,
  tipo         VARCHAR(120) NOT NULL,       -- hemograma, ecografía, rayos X…
  fecha        DATE NOT NULL,
  resultado    TEXT NULL,
  CONSTRAINT fk_examenes_mascota  FOREIGN KEY (mascota_id) REFERENCES mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_examenes_consulta FOREIGN KEY (consulta_id) REFERENCES consultas(id) ON DELETE SET NULL,
  INDEX idx_examenes_mascota (mascota_id, fecha)
) ENGINE=InnoDB;

CREATE TABLE documentos (
  id           INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  mascota_id   INT UNSIGNED NOT NULL,
  consulta_id  INT UNSIGNED NULL,
  subido_por   INT UNSIGNED NULL,
  titulo       VARCHAR(150) NOT NULL,
  archivo      VARCHAR(255) NOT NULL,       -- ruta dentro de /uploads
  mime         VARCHAR(100) NULL,
  tamano_bytes INT UNSIGNED NULL,
  creado_en    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_documentos_mascota  FOREIGN KEY (mascota_id) REFERENCES mascotas(id) ON DELETE CASCADE,
  CONSTRAINT fk_documentos_consulta FOREIGN KEY (consulta_id) REFERENCES consultas(id) ON DELETE SET NULL,
  CONSTRAINT fk_documentos_usuario  FOREIGN KEY (subido_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  INDEX idx_documentos_mascota (mascota_id)
) ENGINE=InnoDB;

-- =====================================================================
--  5. INVENTARIO  (tablas listas; la lógica llega en la fase 7)
-- =====================================================================

CREATE TABLE categorias_productos (
  id     TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  nombre VARCHAR(60) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE proveedores (
  id        INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  nombre    VARCHAR(140) NOT NULL,
  nit       VARCHAR(30)  NULL,
  telefono  VARCHAR(30)  NULL,
  email     VARCHAR(160) NULL,
  direccion VARCHAR(180) NULL,
  CONSTRAINT uq_proveedores_nit UNIQUE (nit)
) ENGINE=InnoDB;

CREATE TABLE productos (
  id             INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  categoria_id   TINYINT UNSIGNED NOT NULL,
  proveedor_id   INT UNSIGNED NULL,
  nombre         VARCHAR(140) NOT NULL,
  sku            VARCHAR(50) NULL,
  cantidad       INT NOT NULL DEFAULT 0,
  stock_minimo   INT NOT NULL DEFAULT 0,
  precio_compra  DECIMAL(12,2) NOT NULL DEFAULT 0,
  precio_venta   DECIMAL(12,2) NOT NULL DEFAULT 0,
  lote           VARCHAR(60) NULL,
  fecha_vencimiento DATE NULL,
  activo         TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT uq_productos_sku UNIQUE (sku),
  CONSTRAINT fk_productos_categoria FOREIGN KEY (categoria_id) REFERENCES categorias_productos(id),
  CONSTRAINT fk_productos_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE SET NULL,
  CONSTRAINT chk_productos_cantidad CHECK (cantidad >= 0),
  INDEX idx_productos_stock (cantidad, stock_minimo),
  INDEX idx_productos_vence (fecha_vencimiento)
) ENGINE=InnoDB;

CREATE TABLE movimientos_inventario (
  id           INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  producto_id  INT UNSIGNED NOT NULL,
  usuario_id   INT UNSIGNED NULL,
  tipo         ENUM('entrada','salida','ajuste') NOT NULL,
  cantidad     INT NOT NULL,
  motivo       VARCHAR(180) NULL,
  creado_en    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_mov_producto FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
  CONSTRAINT fk_mov_usuario  FOREIGN KEY (usuario_id)  REFERENCES usuarios(id) ON DELETE SET NULL,
  INDEX idx_mov_producto (producto_id, creado_en)
) ENGINE=InnoDB;

-- =====================================================================
--  6. FACTURACIÓN  (tablas listas; la lógica llega en la fase 8)
-- =====================================================================

CREATE TABLE facturas (
  id          INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  numero      VARCHAR(30) NOT NULL,
  cliente_id  INT UNSIGNED NOT NULL,
  cita_id     INT UNSIGNED NULL,
  fecha       DATE NOT NULL,
  subtotal    DECIMAL(12,2) NOT NULL DEFAULT 0,
  descuento   DECIMAL(12,2) NOT NULL DEFAULT 0,
  impuestos   DECIMAL(12,2) NOT NULL DEFAULT 0,
  total       DECIMAL(12,2) NOT NULL DEFAULT 0,
  estado      ENUM('pendiente','pagada','cancelada') NOT NULL DEFAULT 'pendiente',
  creado_en   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_facturas_numero UNIQUE (numero),
  CONSTRAINT fk_facturas_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  CONSTRAINT fk_facturas_cita    FOREIGN KEY (cita_id) REFERENCES citas(id) ON DELETE SET NULL,
  INDEX idx_facturas_estado (estado, fecha)
) ENGINE=InnoDB;

CREATE TABLE detalle_factura (
  id           INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  factura_id   INT UNSIGNED NOT NULL,
  servicio_id  SMALLINT UNSIGNED NULL,
  producto_id  INT UNSIGNED NULL,
  descripcion  VARCHAR(180) NOT NULL,
  cantidad     DECIMAL(10,2) NOT NULL DEFAULT 1,
  precio_unit  DECIMAL(12,2) NOT NULL,
  descuento    DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_linea  DECIMAL(12,2) NOT NULL,
  CONSTRAINT fk_detalle_factura  FOREIGN KEY (factura_id)  REFERENCES facturas(id) ON DELETE CASCADE,
  CONSTRAINT fk_detalle_servicio FOREIGN KEY (servicio_id) REFERENCES servicios(id) ON DELETE SET NULL,
  CONSTRAINT fk_detalle_producto FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE SET NULL,
  INDEX idx_detalle_factura (factura_id)
) ENGINE=InnoDB;

CREATE TABLE pagos (
  id          INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  factura_id  INT UNSIGNED NOT NULL,
  metodo      ENUM('efectivo','tarjeta','transferencia','en_linea') NOT NULL,
  valor       DECIMAL(12,2) NOT NULL,
  referencia  VARCHAR(100) NULL,
  estado      ENUM('registrado','anulado') NOT NULL DEFAULT 'registrado',
  fecha       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pagos_factura FOREIGN KEY (factura_id) REFERENCES facturas(id) ON DELETE CASCADE,
  CONSTRAINT chk_pagos_valor CHECK (valor > 0),
  INDEX idx_pagos_factura (factura_id)
) ENGINE=InnoDB;

-- =====================================================================
--  7. NOTIFICACIONES
-- =====================================================================

CREATE TABLE notificaciones (
  id          INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  usuario_id  INT UNSIGNED NOT NULL,
  tipo        VARCHAR(50) NOT NULL,        -- cita_confirmada, vacuna_proxima, stock_bajo…
  titulo      VARCHAR(150) NOT NULL,
  mensaje     TEXT NULL,
  enlace      VARCHAR(255) NULL,
  leida       TINYINT(1) NOT NULL DEFAULT 0,
  creado_en   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notificaciones_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE CASCADE,
  INDEX idx_notificaciones_usuario (usuario_id, leida, creado_en)
) ENGINE=InnoDB;

-- =====================================================================
--  8. AUTOMATISMOS
-- =====================================================================

-- Toda mascota nueva abre su historia clínica automáticamente.
DELIMITER //
CREATE TRIGGER trg_mascota_historia
AFTER INSERT ON mascotas
FOR EACH ROW
BEGIN
  INSERT INTO historias_clinicas (mascota_id) VALUES (NEW.id);
END//
DELIMITER ;

-- Cada movimiento de inventario ajusta el stock del producto.
DELIMITER //
CREATE TRIGGER trg_movimiento_stock
AFTER INSERT ON movimientos_inventario
FOR EACH ROW
BEGIN
  IF NEW.tipo = 'entrada' THEN
    UPDATE productos SET cantidad = cantidad + NEW.cantidad WHERE id = NEW.producto_id;
  ELSEIF NEW.tipo = 'salida' THEN
    UPDATE productos SET cantidad = cantidad - NEW.cantidad WHERE id = NEW.producto_id;
  ELSE
    UPDATE productos SET cantidad = NEW.cantidad WHERE id = NEW.producto_id;
  END IF;
END//
DELIMITER ;

-- Vista de apoyo para la agenda y los reportes.
CREATE OR REPLACE VIEW v_citas_detalle AS
SELECT
  c.id, c.inicio, c.fin, c.estado, c.motivo, c.notas, c.creado_en,
  m.id  AS mascota_id,  m.nombre AS mascota_nombre,
  e.nombre AS especie,
  cl.id AS cliente_id,  uc.nombre AS cliente_nombre, uc.telefono AS cliente_telefono,
  v.id  AS veterinario_id, uv.nombre AS veterinario_nombre, v.especialidad,
  s.id  AS servicio_id, s.nombre AS servicio_nombre, s.precio, s.duracion_min
FROM citas c
JOIN mascotas m      ON m.id  = c.mascota_id
JOIN especies e      ON e.id  = m.especie_id
JOIN clientes cl     ON cl.id = c.cliente_id
JOIN usuarios uc     ON uc.id = cl.usuario_id
JOIN veterinarios v  ON v.id  = c.veterinario_id
JOIN usuarios uv     ON uv.id = v.usuario_id
JOIN servicios s     ON s.id  = c.servicio_id;
