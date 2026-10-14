-- =====================================================================
--  ⚠️  VERSIÓN ANTIGUA — YA NO SE USA
--  Los datos iniciales vigentes están en database/supabase/seed.sql
--  y se cargan con:  npm run db:setup
-- =====================================================================
--  Huellitas de Amor — Datos iniciales (versión MySQL, solo referencia)
--
--  Cuentas de prueba (cámbialas antes de publicar el sitio):
--    admin@huellitas.com      Admin1234    administrador
--    valentina@huellitas.com  Vet12345     veterinaria
--    andres@huellitas.com     Vet12345     veterinario
--    paula@huellitas.com      Vet12345     veterinaria
--    julian@huellitas.com     Vet12345     veterinario
--    daniela@correo.com       Cliente123   cliente
--    carlos@correo.com        Cliente123   cliente
-- =====================================================================

USE huellitas;

SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE servicio_veterinario;
TRUNCATE TABLE horarios_veterinario;
TRUNCATE TABLE bloqueos_veterinario;
TRUNCATE TABLE citas;
TRUNCATE TABLE mascota_vacunas;
TRUNCATE TABLE historias_clinicas;
TRUNCATE TABLE mascotas;
TRUNCATE TABLE razas;
TRUNCATE TABLE especies;
TRUNCATE TABLE vacunas;
TRUNCATE TABLE servicios;
TRUNCATE TABLE veterinarios;
TRUNCATE TABLE clientes;
TRUNCATE TABLE usuarios;
TRUNCATE TABLE roles;
TRUNCATE TABLE productos;
TRUNCATE TABLE categorias_productos;
TRUNCATE TABLE proveedores;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
--  Roles
-- ---------------------------------------------------------------------
INSERT INTO roles (id, nombre, descripcion) VALUES
  (1, 'cliente',     'Dueño de mascotas: agenda citas y consulta historias clínicas'),
  (2, 'veterinario', 'Personal clínico: agenda propia, consultas y pacientes'),
  (3, 'admin',       'Administración completa de la clínica');

-- ---------------------------------------------------------------------
--  Usuarios
--  Los hash son bcrypt de las contraseñas indicadas arriba.
-- ---------------------------------------------------------------------
INSERT INTO usuarios (id, rol_id, nombre, email, telefono, password_hash) VALUES
  (1, 3, 'Administración Huellitas', 'admin@huellitas.com',     '3107896780', '$2a$10$f9UZ1oFSjfahouhLXVAeQOZ7mCp0x5Xo/9URr8oZEGWpSX/3YDr6i'),
  (2, 2, 'Valentina Ríos',           'valentina@huellitas.com', '3107896781', '$2a$10$XPaLj51uq/ccAAkVpQB9.uMIGqFNErB8UVYiXnAqBTFjSuoC2TT2u'),
  (3, 2, 'Andrés Suárez',            'andres@huellitas.com',    '3107896782', '$2a$10$XPaLj51uq/ccAAkVpQB9.uMIGqFNErB8UVYiXnAqBTFjSuoC2TT2u'),
  (4, 2, 'Paula Méndez',             'paula@huellitas.com',     '3107896783', '$2a$10$XPaLj51uq/ccAAkVpQB9.uMIGqFNErB8UVYiXnAqBTFjSuoC2TT2u'),
  (5, 2, 'Julián Castaño',           'julian@huellitas.com',    '3107896784', '$2a$10$XPaLj51uq/ccAAkVpQB9.uMIGqFNErB8UVYiXnAqBTFjSuoC2TT2u'),
  (6, 1, 'Daniela Ortiz',            'daniela@correo.com',      '3201234567', '$2a$10$Fs7/gEBtq7jopS74r6Zvu.jzLsmbnHaDd338Shc2DAlAqh3FQxkZ2'),
  (7, 1, 'Carlos Peña',              'carlos@correo.com',       '3209876543', '$2a$10$Fs7/gEBtq7jopS74r6Zvu.jzLsmbnHaDd338Shc2DAlAqh3FQxkZ2');

INSERT INTO clientes (id, usuario_id, documento, direccion, ciudad) VALUES
  (1, 6, '1052398471', 'Cra. 11 #14-25', 'Sogamoso'),
  (2, 7, '1052874390', 'Calle 8 #22-14', 'Sogamoso');

INSERT INTO veterinarios (id, usuario_id, licencia, especialidad, descripcion, duracion_slot_min) VALUES
  (1, 2, 'MV-10432', 'medicina_general', 'Medicina general y cirugía de tejidos blandos. 12 años de experiencia.', 30),
  (2, 3, 'MV-9821',  'imagenes',         'Diagnóstico por imágenes: ecografía y radiología digital.', 30),
  (3, 4, 'MV-11207', 'felinos',          'Medicina felina y manejo de pacientes geriátricos.', 30),
  (4, 5, 'MV-10877', 'cirugia',          'Cirugía de urgencias y ortopedia.', 60);

-- Horario semanal: 0=domingo … 6=sábado
INSERT INTO horarios_veterinario (veterinario_id, dia_semana, hora_inicio, hora_fin) VALUES
  -- Valentina: lunes a viernes, jornada partida
  (1, 1, '08:00:00', '12:00:00'), (1, 1, '14:00:00', '18:00:00'),
  (1, 2, '08:00:00', '12:00:00'), (1, 2, '14:00:00', '18:00:00'),
  (1, 3, '08:00:00', '12:00:00'), (1, 3, '14:00:00', '18:00:00'),
  (1, 4, '08:00:00', '12:00:00'), (1, 4, '14:00:00', '18:00:00'),
  (1, 5, '08:00:00', '12:00:00'), (1, 5, '14:00:00', '18:00:00'),
  -- Andrés: lunes, miércoles y viernes en la mañana; sábado completo
  (2, 1, '08:00:00', '13:00:00'),
  (2, 3, '08:00:00', '13:00:00'),
  (2, 5, '08:00:00', '13:00:00'),
  (2, 6, '09:00:00', '15:00:00'),
  -- Paula: martes a sábado en la tarde
  (3, 2, '13:00:00', '19:00:00'),
  (3, 3, '13:00:00', '19:00:00'),
  (3, 4, '13:00:00', '19:00:00'),
  (3, 5, '13:00:00', '19:00:00'),
  (3, 6, '10:00:00', '16:00:00'),
  -- Julián: cirugías de lunes a jueves
  (4, 1, '07:00:00', '13:00:00'),
  (4, 2, '07:00:00', '13:00:00'),
  (4, 3, '07:00:00', '13:00:00'),
  (4, 4, '07:00:00', '13:00:00');

-- ---------------------------------------------------------------------
--  Especies y razas
-- ---------------------------------------------------------------------
INSERT INTO especies (id, nombre) VALUES
  (1, 'Perro'), (2, 'Gato'), (3, 'Ave'), (4, 'Conejo'), (5, 'Roedor'), (6, 'Reptil');

INSERT INTO razas (especie_id, nombre) VALUES
  (1, 'Mestizo'), (1, 'Criollo'), (1, 'Labrador Retriever'), (1, 'Golden Retriever'),
  (1, 'Pastor Alemán'), (1, 'Bulldog Francés'), (1, 'Poodle'), (1, 'Schnauzer'),
  (1, 'Chihuahua'), (1, 'Pug'), (1, 'Beagle'), (1, 'Border Collie'),
  (1, 'Husky Siberiano'), (1, 'Pitbull'), (1, 'Yorkshire Terrier'), (1, 'Cocker Spaniel'),
  (2, 'Mestizo'), (2, 'Criollo'), (2, 'Siamés'), (2, 'Persa'), (2, 'Angora'),
  (2, 'Maine Coon'), (2, 'Bengalí'), (2, 'Esfinge'), (2, 'Atigrado común'),
  (3, 'Canario'), (3, 'Periquito'), (3, 'Agapornis'), (3, 'Loro amazónico'), (3, 'Cacatúa'),
  (4, 'Belier'), (4, 'Cabeza de león'), (4, 'Mini Rex'), (4, 'Holandés enano'),
  (5, 'Hámster sirio'), (5, 'Hámster ruso'), (5, 'Cobayo'), (5, 'Jerbo'), (5, 'Chinchilla'),
  (6, 'Iguana verde'), (6, 'Tortuga morrocoy'), (6, 'Gecko leopardo'), (6, 'Pogona');

-- ---------------------------------------------------------------------
--  Servicios (sección 2 del documento)
-- ---------------------------------------------------------------------
INSERT INTO servicios (id, nombre, slug, descripcion, precio, duracion_min, requisitos, icono) VALUES
  (1,  'Consulta veterinaria', 'consulta-veterinaria',
       'Revisión completa: peso, temperatura, signos vitales y estado general, con espacio para resolver todas tus dudas.',
       60000, 30, 'Llevar carné de vacunación si es la primera visita.', 'icon-stetho'),
  (2,  'Vacunación', 'vacunacion',
       'Aplicación del esquema según edad y especie, con registro en el carné y recordatorio del refuerzo.',
       40000, 20, 'La mascota debe estar desparasitada y sin fiebre.', 'icon-syringe'),
  (3,  'Odontología', 'odontologia',
       'Profilaxis dental, extracciones y tratamiento de enfermedad periodontal.',
       180000, 60, 'Ayuno de 8 horas. Requiere valoración previa.', 'icon-cross'),
  (4,  'Laboratorio', 'laboratorio',
       'Hemogramas, perfiles bioquímicos, coprológicos y pruebas rápidas con resultados el mismo día.',
       75000, 30, 'Ayuno de 8 horas para perfiles bioquímicos.', 'icon-micro'),
  (5,  'Cirugía', 'cirugia',
       'Desde esterilizaciones hasta cirugías mayores, con quirófano propio y sala de recuperación.',
       350000, 120, 'Ayuno de 12 horas y exámenes prequirúrgicos vigentes.', 'icon-cross'),
  (6,  'Radiografía', 'radiografia',
       'Radiología digital con lectura inmediata por el veterinario tratante.',
       95000, 30, 'Sin requisitos especiales.', 'icon-micro'),
  (7,  'Peluquería', 'peluqueria',
       'Baño medicado, corte según raza, corte de uñas y limpieza de oídos.',
       45000, 60, 'La mascota debe tener el esquema de vacunas al día.', 'icon-scissors'),
  (8,  'Hospitalización', 'hospitalizacion',
       'Internación con monitoreo constante, fluidoterapia y reporte diario al propietario.',
       120000, 60, 'Ingreso por remisión del veterinario tratante.', 'icon-house'),
  (9,  'Urgencias', 'urgencias',
       'Atención inmediata para accidentes, intoxicaciones y cuadros agudos.',
       90000, 45, 'Atención por orden de gravedad, no por orden de llegada.', 'icon-heart'),
  (10, 'Farmacia', 'farmacia',
       'Dispensación de medicamentos con fórmula veterinaria y asesoría en la administración.',
       0, 15, 'Presentar la fórmula del veterinario tratante.', 'icon-shield');

-- Qué veterinario atiende cada servicio
INSERT INTO servicio_veterinario (servicio_id, veterinario_id) VALUES
  (1, 1), (1, 3), (1, 4),          -- consulta general
  (2, 1), (2, 3),                  -- vacunación
  (3, 1),                          -- odontología
  (4, 2),                          -- laboratorio
  (5, 4), (5, 1),                  -- cirugía
  (6, 2),                          -- radiografía
  (7, 3),                          -- peluquería
  (8, 4), (8, 1),                  -- hospitalización
  (9, 4), (9, 1), (9, 2), (9, 3),  -- urgencias: todo el equipo
  (10, 1);                         -- farmacia

-- ---------------------------------------------------------------------
--  Catálogo de vacunas
-- ---------------------------------------------------------------------
INSERT INTO vacunas (nombre, especie_id, refuerzo_meses) VALUES
  ('Polivalente (Séxtuple)', 1, 12),
  ('Rabia',                  1, 12),
  ('Tos de las perreras',    1, 12),
  ('Leptospirosis',          1, 6),
  ('Triple felina',          2, 12),
  ('Rabia felina',           2, 12),
  ('Leucemia felina',        2, 12),
  ('Mixomatosis',            4, 12);

-- ---------------------------------------------------------------------
--  Mascotas de ejemplo (el trigger abre su historia clínica)
-- ---------------------------------------------------------------------
INSERT INTO mascotas (id, cliente_id, nombre, especie_id, raza_id, sexo, fecha_nacimiento, peso_kg, color, microchip, esterilizado, informacion) VALUES
  (1, 1, 'Luna',  1, (SELECT id FROM razas WHERE nombre = 'Mestizo' AND especie_id = 1),
      'hembra', DATE_SUB(CURDATE(), INTERVAL 2 YEAR),  18.40, 'Café con blanco', '982000123456789', 1,
      'Juguetona y muy apegada. Le encantan los niños y las caminatas largas.'),
  (2, 1, 'Simón', 2, (SELECT id FROM razas WHERE nombre = 'Atigrado común' AND especie_id = 2),
      'macho',  DATE_SUB(CURDATE(), INTERVAL 1 YEAR),   4.20, 'Atigrado gris', NULL, 1,
      'Tranquilo y curioso, ideal para apartamento.'),
  (3, 2, 'Rocky', 1, (SELECT id FROM razas WHERE nombre = 'Criollo' AND especie_id = 1),
      'macho',  DATE_SUB(CURDATE(), INTERVAL 5 YEAR),  24.10, 'Negro', '982000987654321', 1,
      'Tranquilo, guardián y noble. Perfecto para una familia con patio.');

-- Vacuna aplicada con refuerzo próximo, para ver las alertas del panel
INSERT INTO mascota_vacunas (mascota_id, vacuna_id, veterinario_id, fecha_aplicacion, proxima_fecha, lote) VALUES
  (1, 1, 1, DATE_SUB(CURDATE(), INTERVAL 11 MONTH), DATE_ADD(CURDATE(), INTERVAL 20 DAY), 'L-2024-A17'),
  (1, 2, 1, DATE_SUB(CURDATE(), INTERVAL 11 MONTH), DATE_ADD(CURDATE(), INTERVAL 25 DAY), 'R-2024-B04'),
  (3, 2, 1, DATE_SUB(CURDATE(), INTERVAL 13 MONTH), DATE_SUB(CURDATE(), INTERVAL 30 DAY), 'R-2023-C11');

-- ---------------------------------------------------------------------
--  Inventario mínimo (la lógica llega en la fase 7)
-- ---------------------------------------------------------------------
INSERT INTO categorias_productos (id, nombre) VALUES
  (1, 'Medicamentos'), (2, 'Vacunas'), (3, 'Alimentos'), (4, 'Accesorios'), (5, 'Material médico');

INSERT INTO proveedores (id, nombre, nit, telefono, email) VALUES
  (1, 'Distribuidora VetAndina', '900123456-1', '6017778899', 'ventas@vetandina.com'),
  (2, 'Alimentos Patitas S.A.S', '901987654-2', '6014445566', 'pedidos@patitas.com');

INSERT INTO productos (categoria_id, proveedor_id, nombre, sku, cantidad, stock_minimo, precio_compra, precio_venta, lote, fecha_vencimiento) VALUES
  (1, 1, 'Amoxicilina 250 mg x 20 tabletas', 'MED-AMX-250', 40, 10,  18000, 32000, 'AMX-2411', DATE_ADD(CURDATE(), INTERVAL 14 MONTH)),
  (1, 1, 'Meloxicam 1.5 mg/ml x 10 ml',      'MED-MLX-15',   8, 10,  24000, 41000, 'MLX-2409', DATE_ADD(CURDATE(), INTERVAL 8 MONTH)),
  (2, 1, 'Vacuna polivalente canina',        'VAC-POLI-C',  25,  8,  22000, 40000, 'POLI-2501', DATE_ADD(CURDATE(), INTERVAL 10 MONTH)),
  (3, 2, 'Alimento balanceado premium 3 kg', 'ALI-PREM-3',  16,  5,  42000, 68000, NULL, DATE_ADD(CURDATE(), INTERVAL 11 MONTH)),
  (4, 2, 'Correa y arnés ajustable',         'ACC-ARN-01',  12,  4,  26000, 45000, NULL, NULL),
  (5, 1, 'Jeringa 3 ml x 100 unidades',      'MAT-JER-3',    3, 10,  35000, 55000, 'JER-2408', DATE_ADD(CURDATE(), INTERVAL 2 MONTH));

-- ---------------------------------------------------------------------
--  Una cita de ejemplo, siempre en el futuro
--  (mañana a las 09:00 con Valentina, consulta general)
-- ---------------------------------------------------------------------
INSERT INTO citas (cliente_id, mascota_id, veterinario_id, servicio_id, inicio, fin, estado, motivo, creado_por)
SELECT 1, 1, 1, 1,
       TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 1 DAY), '09:00:00'),
       TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 1 DAY), '09:30:00'),
       'confirmada', 'Control anual y refuerzo de vacunas', 6
FROM DUAL
-- Solo si mañana es un día en que Valentina atiende, para no crear una cita
-- que el propio sistema consideraría fuera de horario.
WHERE DAYOFWEEK(DATE_ADD(CURDATE(), INTERVAL 1 DAY)) BETWEEN 2 AND 6;
