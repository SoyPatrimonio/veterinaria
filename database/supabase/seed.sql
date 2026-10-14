-- =====================================================================
--  Huellitas de Amor — Datos iniciales (PostgreSQL / Supabase)
--  Ejecutar DESPUÉS de schema.sql.
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

SET TIME ZONE 'America/Bogota';

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

-- ---------------------------------------------------------------------
--  Limpieza: vacía todas las tablas de todos los módulos y reinicia los
--  contadores. Se hace en un solo TRUNCATE para que el CASCADE resuelva
--  el orden de las dependencias. La lista de esquemas la da schema.sql,
--  para que añadir un módulo no obligue a acordarse de este archivo.
-- ---------------------------------------------------------------------
DO $huellitas$
DECLARE
  lista text;
BEGIN
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
    INTO lista
    FROM pg_tables
   WHERE schemaname = ANY (public.huellitas_esquemas());

  IF lista IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE ' || lista || ' RESTART IDENTITY CASCADE';
  END IF;
END
$huellitas$;


-- =====================================================================
--  CONFIGURACION
-- =====================================================================

INSERT INTO configuracion.sedes (id, nombre, codigo, direccion, ciudad, telefono, email, principal) VALUES
  (1, 'Huellitas de Amor — Sede principal', 'SOG-01', 'Cra. 11 #13-42', 'Sogamoso', '6087700111', 'contacto@huellitas.com', 1),
  (2, 'Huellitas de Amor — Norte',          'SOG-02', 'Av. Las Torres #48-10', 'Sogamoso', '6087700222', 'norte@huellitas.com', 0);

-- Lunes a sábado; domingo cerrado.
INSERT INTO configuracion.horarios_sede (sede_id, dia_semana, hora_apertura, hora_cierre, cerrado) VALUES
  (1, 1, '08:00', '20:00', 0), (1, 2, '08:00', '20:00', 0), (1, 3, '08:00', '20:00', 0),
  (1, 4, '08:00', '20:00', 0), (1, 5, '08:00', '20:00', 0), (1, 6, '09:00', '16:00', 0),
  (1, 0, NULL, NULL, 1),
  (2, 1, '09:00', '18:00', 0), (2, 2, '09:00', '18:00', 0), (2, 3, '09:00', '18:00', 0),
  (2, 4, '09:00', '18:00', 0), (2, 5, '09:00', '18:00', 0), (2, 6, '09:00', '13:00', 0),
  (2, 0, NULL, NULL, 1);

-- Parámetros que la administración puede cambiar sin volver a desplegar.
INSERT INTO configuracion.configuraciones (sede_id, clave, valor, tipo, descripcion) VALUES
  (NULL, 'clinica.nombre',            'Huellitas de Amor',  'texto',    'Nombre que aparece en el sitio y en las facturas'),
  (NULL, 'clinica.nit',               '901234567-8',        'texto',    'NIT de la clínica'),
  (NULL, 'citas.anticipacion_minutos','60',                 'numero',   'Anticipación mínima para reservar una cita'),
  (NULL, 'citas.dias_maximos',        '60',                 'numero',   'Hasta cuántos días adelante se abre la agenda'),
  (NULL, 'citas.cancelacion_horas',   '4',                  'numero',   'Horas mínimas para cancelar sin penalidad'),
  (NULL, 'facturacion.iva',           '19',                 'numero',   'Porcentaje de IVA aplicado a los productos'),
  (NULL, 'facturacion.prefijo',       'FAC',                'texto',    'Prefijo del consecutivo de facturas'),
  (NULL, 'seguridad.intentos_maximos','5',                  'numero',   'Fallos de login seguidos antes de bloquear'),
  (NULL, 'seguridad.bloqueo_minutos', '15',                 'numero',   'Cuánto dura el bloqueo temporal'),
  (NULL, 'notificaciones.recordatorio_horas','24',          'numero',   'Cuántas horas antes se recuerda la cita');


-- =====================================================================
--  SEGURIDAD · roles y permisos
-- =====================================================================

INSERT INTO seguridad.roles (id, nombre, descripcion) VALUES
  (1, 'cliente',     'Dueño de mascotas: agenda citas y consulta la historia de sus mascotas'),
  (2, 'veterinario', 'Personal clínico: agenda propia, consultas, pacientes e historia clínica'),
  (3, 'admin',       'Administración completa de la clínica');

-- Catálogo de permisos. El código `modulo.accion` es lo que comprueba el
-- middleware del backend; añadir un rol nuevo es solo insertar filas aquí.
INSERT INTO seguridad.permisos (codigo, modulo, nombre, descripcion) VALUES
  -- configuracion
  ('sedes.ver',                'configuracion', 'Ver sedes',                 'Consultar las sedes de la clínica'),
  ('sedes.gestionar',          'configuracion', 'Gestionar sedes',           'Crear y editar sedes y sus horarios'),
  ('config.ver',               'configuracion', 'Ver configuración',         'Consultar los parámetros del sistema'),
  ('config.gestionar',         'configuracion', 'Cambiar configuración',     'Modificar los parámetros del sistema'),
  -- seguridad
  ('usuarios.ver',             'seguridad',     'Ver usuarios',              'Listar las cuentas del sistema'),
  ('usuarios.crear',           'seguridad',     'Crear usuarios',            'Dar de alta veterinarios y empleados'),
  ('usuarios.editar',          'seguridad',     'Editar usuarios',           'Cambiar datos de una cuenta'),
  ('usuarios.estado',          'seguridad',     'Activar o desactivar',      'Bloquear o reactivar una cuenta'),
  ('roles.ver',                'seguridad',     'Ver roles y permisos',      'Consultar la matriz de permisos'),
  ('roles.asignar',            'seguridad',     'Asignar roles',             'Cambiar el rol de una cuenta'),
  ('auditoria.ver',            'seguridad',     'Ver auditoría',             'Consultar el rastro de cambios y los accesos'),
  ('sesiones.ver',             'seguridad',     'Ver sesiones',              'Consultar las sesiones abiertas'),
  ('sesiones.cerrar',          'seguridad',     'Cerrar sesiones ajenas',    'Forzar el cierre de sesión de otra cuenta'),
  -- usuarios
  ('perfil.ver',               'usuarios',      'Ver perfil propio',         'Consultar los datos de la propia cuenta'),
  ('perfil.editar',            'usuarios',      'Editar perfil propio',      'Cambiar nombre, teléfono y contraseña'),
  ('clientes.ver',             'usuarios',      'Ver clientes',              'Consultar la lista de clientes'),
  ('clientes.gestionar',       'usuarios',      'Gestionar clientes',        'Crear y editar fichas de cliente'),
  ('empleados.ver',            'usuarios',      'Ver empleados',             'Consultar el personal de la clínica'),
  ('empleados.gestionar',      'usuarios',      'Gestionar empleados',       'Crear y editar fichas de empleado'),
  -- mascotas
  ('mascotas.ver_propias',     'mascotas',      'Ver mis mascotas',          'Consultar solo las mascotas propias'),
  ('mascotas.ver_todas',       'mascotas',      'Ver todas las mascotas',    'Consultar cualquier paciente'),
  ('mascotas.crear',           'mascotas',      'Registrar mascotas',        'Dar de alta un paciente'),
  ('mascotas.editar',          'mascotas',      'Editar mascotas',           'Modificar la ficha de un paciente'),
  ('mascotas.eliminar',        'mascotas',      'Retirar mascotas',          'Marcar un paciente como inactivo'),
  -- agenda
  ('citas.ver_propias',        'agenda',        'Ver mis citas',             'Consultar solo las citas propias'),
  ('citas.ver_todas',          'agenda',        'Ver todas las citas',       'Consultar la agenda completa'),
  ('citas.crear',              'agenda',        'Agendar citas',             'Reservar una cita'),
  ('citas.editar',             'agenda',        'Editar citas',              'Reprogramar o cambiar datos de una cita'),
  ('citas.cancelar',           'agenda',        'Cancelar citas',            'Cancelar una cita'),
  ('citas.confirmar',          'agenda',        'Confirmar y atender',       'Cambiar el estado de una cita'),
  ('agenda.gestionar',         'agenda',        'Gestionar la agenda',       'Horarios y bloqueos de los veterinarios'),
  ('servicios.ver',            'agenda',        'Ver servicios',             'Consultar el catálogo de servicios'),
  ('servicios.gestionar',      'agenda',        'Gestionar servicios',       'Crear, editar y desactivar servicios'),
  ('veterinarios.ver',         'agenda',        'Ver veterinarios',          'Consultar el equipo clínico'),
  ('veterinarios.gestionar',   'agenda',        'Gestionar veterinarios',    'Crear y editar perfiles de veterinario'),
  -- historia clinica
  ('historia.ver_propia',      'historia',      'Ver la historia de mis mascotas', 'Consultar la historia clínica propia'),
  ('historia.ver_todas',       'historia',      'Ver cualquier historia',    'Consultar la historia clínica de cualquier paciente'),
  ('consultas.crear',          'historia',      'Registrar consultas',       'Abrir y cerrar una consulta'),
  ('consultas.editar',         'historia',      'Editar consultas',          'Modificar una consulta ya registrada'),
  ('vacunas.aplicar',          'historia',      'Aplicar vacunas',           'Registrar la aplicación de una vacuna'),
  ('examenes.gestionar',       'historia',      'Gestionar exámenes',        'Solicitar exámenes y cargar resultados'),
  ('cirugias.gestionar',       'historia',      'Gestionar cirugías',        'Programar y registrar cirugías'),
  ('hospitalizacion.gestionar','historia',      'Gestionar hospitalización', 'Ingresos, controles y altas'),
  -- inventario
  ('inventario.ver',           'inventario',    'Ver inventario',            'Consultar productos y existencias'),
  ('inventario.gestionar',     'inventario',    'Gestionar inventario',      'Crear productos y registrar movimientos'),
  ('compras.gestionar',        'inventario',    'Gestionar compras',         'Registrar compras a proveedores'),
  -- facturacion
  ('facturas.ver_propias',     'facturacion',   'Ver mis facturas',          'Consultar solo las facturas propias'),
  ('facturas.ver_todas',       'facturacion',   'Ver todas las facturas',    'Consultar la facturación de la clínica'),
  ('facturas.crear',           'facturacion',   'Emitir facturas',           'Crear una factura'),
  ('pagos.registrar',          'facturacion',   'Registrar pagos',           'Anotar el pago de una factura'),
  ('devoluciones.gestionar',   'facturacion',   'Gestionar devoluciones',    'Registrar y anular devoluciones'),
  -- comunicacion
  ('notificaciones.ver',       'comunicacion',  'Ver notificaciones',        'Consultar las notificaciones propias'),
  ('notificaciones.enviar',    'comunicacion',  'Enviar notificaciones',     'Notificar a clientes o al equipo'),
  ('recordatorios.gestionar',  'comunicacion',  'Gestionar recordatorios',   'Programar y cancelar recordatorios'),
  -- archivos
  ('archivos.ver',             'archivos',      'Ver archivos',              'Descargar documentos y adjuntos'),
  ('archivos.subir',           'archivos',      'Subir archivos',            'Adjuntar documentos'),
  ('archivos.eliminar',        'archivos',      'Eliminar archivos',         'Borrar documentos adjuntos'),
  -- reportes
  ('reportes.ver',             'reportes',      'Ver reportes',              'Consultar los indicadores de la clínica'),
  ('reportes.exportar',        'reportes',      'Exportar reportes',         'Descargar reportes en PDF o CSV'),
  ('reportes.inteligencia',    'reportes',      'Inteligencia de negocio',   'Pronósticos, rentabilidad y análisis de clientes'),
  -- urgencias
  ('urgencias.ver',            'urgencias',     'Ver urgencias',             'Consultar la sala de urgencias en tiempo real'),
  ('urgencias.gestionar',      'urgencias',     'Atender urgencias',         'Registrar llegada, triage, medicación y desenlace'),
  -- hospitalización
  ('hospitalizacion.ver',      'historia',      'Ver hospitalización',       'Consultar los pacientes internados'),
  ('habitaciones.gestionar',   'historia',      'Gestionar habitaciones',    'Crear jaulas y habitaciones y cambiar su estado'),
  -- farmacia
  ('recetas.ver_propias',      'farmacia',      'Ver mis recetas',           'Consultar solo las recetas de las mascotas propias'),
  ('recetas.ver_todas',        'farmacia',      'Ver todas las recetas',     'Consultar cualquier receta'),
  ('recetas.crear',            'farmacia',      'Emitir recetas',            'Firmar una receta electrónica'),
  ('farmacia.dispensar',       'farmacia',      'Dispensar medicamentos',    'Entregar medicamentos y descontarlos del inventario'),
  ('farmacia.gestionar',       'farmacia',      'Gestionar farmacia',        'Interacciones, restringidos y devoluciones'),
  -- laboratorio
  ('laboratorio.ver',          'laboratorio',   'Ver laboratorio',           'Consultar órdenes, muestras y resultados'),
  ('laboratorio.ordenar',      'laboratorio',   'Ordenar exámenes',          'Crear órdenes de laboratorio'),
  ('laboratorio.procesar',     'laboratorio',   'Procesar muestras',         'Registrar toma de muestras y cargar resultados'),
  ('laboratorio.validar',      'laboratorio',   'Validar resultados',        'Dar por bueno un resultado y avisar al propietario'),
  -- imágenes
  ('imagenes.ver',             'imagenes',      'Ver estudios de imagen',    'Consultar radiografías, ecografías y fotografías'),
  ('imagenes.gestionar',       'imagenes',      'Gestionar estudios',        'Registrar estudios y subir archivos'),
  ('imagenes.informar',        'imagenes',      'Firmar informes',           'Redactar y firmar el informe radiológico'),
  -- vacunación y desparasitación
  ('vacunacion.esquemas',      'historia',      'Gestionar esquemas',        'Definir el plan de vacunación por especie'),
  ('desparasitacion.registrar','historia',      'Registrar desparasitación', 'Anotar aplicaciones internas y externas'),
  -- nutrición
  ('nutricion.ver',            'nutricion',     'Ver nutrición',             'Consultar evaluaciones y planes alimenticios'),
  ('nutricion.gestionar',      'nutricion',     'Gestionar nutrición',       'Evaluar y prescribir planes alimenticios'),
  -- telemedicina
  ('telemedicina.ver_propias', 'telemedicina',  'Ver mis videoconsultas',    'Entrar a las videoconsultas propias'),
  ('telemedicina.atender',     'telemedicina',  'Atender videoconsultas',    'Conducir la videoconsulta y registrarla'),
  ('telemedicina.gestionar',   'telemedicina',  'Gestionar telemedicina',    'Programar, cancelar y cobrar videoconsultas'),
  -- comunidad
  ('identidad.gestionar',      'comunidad',     'Identidad digital',         'Generar y revocar el QR de una mascota'),
  ('perdidas.reportar',        'comunidad',     'Reportar mascota perdida',  'Publicar el reporte de una mascota propia'),
  ('perdidas.gestionar',       'comunidad',     'Gestionar reportes',        'Moderar reportes y avistamientos'),
  ('adopciones.ver',           'comunidad',     'Ver adopciones',            'Consultar las mascotas disponibles'),
  ('adopciones.solicitar',     'comunidad',     'Solicitar adopción',        'Enviar una solicitud de adopción'),
  ('adopciones.gestionar',     'comunidad',     'Gestionar adopciones',      'Publicar, evaluar, aprobar y hacer seguimiento'),
  -- tienda y domicilios
  ('tienda.comprar',           'tienda',        'Comprar en la tienda',      'Usar el carrito y hacer pedidos'),
  ('pedidos.ver_propios',      'tienda',        'Ver mis pedidos',           'Consultar solo los pedidos propios'),
  ('pedidos.ver_todos',        'tienda',        'Ver todos los pedidos',     'Consultar los pedidos de la clínica'),
  ('tienda.gestionar',         'tienda',        'Gestionar la tienda',       'Catálogo en línea, cupones y precios'),
  ('pedidos.gestionar',        'tienda',        'Gestionar pedidos',         'Confirmar, preparar y cancelar pedidos'),
  ('domicilios.gestionar',     'tienda',        'Gestionar domicilios',      'Asignar repartidores y seguir las entregas'),
  ('domicilios.repartir',      'tienda',        'Repartir domicilios',       'Actualizar el estado de la entrega asignada'),
  -- planes y fidelización
  ('planes.ver',               'fidelizacion',  'Ver planes de salud',       'Consultar los planes y sus beneficios'),
  ('planes.suscribir',         'fidelizacion',  'Suscribirse a un plan',     'Contratar o renovar un plan de salud'),
  ('planes.gestionar',         'fidelizacion',  'Gestionar planes',          'Crear planes, beneficios y suscripciones'),
  ('puntos.ver',               'fidelizacion',  'Ver puntos',                'Consultar el saldo de puntos y el nivel'),
  ('puntos.gestionar',         'fidelizacion',  'Gestionar puntos',          'Ajustar puntos, recompensas y canjes'),
  ('promociones.gestionar',    'fidelizacion',  'Gestionar promociones',     'Crear promociones y campañas dirigidas'),
  -- atención al cliente
  ('tickets.crear',            'soporte',       'Crear PQRS',                'Radicar una petición, queja, reclamo o sugerencia'),
  ('tickets.ver_propios',      'soporte',       'Ver mis PQRS',              'Consultar solo los casos propios'),
  ('tickets.ver_todos',        'soporte',       'Ver todas las PQRS',        'Consultar la bandeja completa'),
  ('tickets.gestionar',        'soporte',       'Gestionar PQRS',            'Responder, asignar y cerrar casos'),
  ('encuestas.responder',      'soporte',       'Responder encuestas',       'Calificar la atención recibida'),
  ('encuestas.gestionar',      'soporte',       'Gestionar encuestas',       'Crear encuestas y ver sus resultados'),
  -- personal
  ('personal.ver',             'personal',      'Ver personal',              'Consultar turnos, asistencia y ausencias'),
  ('personal.gestionar',       'personal',      'Gestionar personal',        'Turnos, asistencia y certificaciones'),
  ('ausencias.solicitar',      'personal',      'Solicitar ausencias',       'Pedir vacaciones o permisos'),
  ('ausencias.aprobar',        'personal',      'Aprobar ausencias',         'Aprobar o rechazar vacaciones y permisos'),
  ('comisiones.ver',           'personal',      'Ver comisiones',            'Consultar las comisiones propias'),
  ('comisiones.gestionar',     'personal',      'Gestionar comisiones',      'Definir reglas y liquidar comisiones'),
  -- equipos médicos
  ('equipos.ver',              'equipos',       'Ver equipos',               'Consultar el inventario de equipos médicos'),
  ('equipos.gestionar',        'equipos',       'Gestionar equipos',         'Registrar equipos, mantenimientos y calibraciones'),
  -- bioseguridad
  ('bioseguridad.ver',         'bioseguridad',  'Ver bioseguridad',          'Consultar protocolos, residuos e incidentes'),
  ('bioseguridad.registrar',   'bioseguridad',  'Registrar cumplimiento',    'Anotar limpiezas, residuos e incidentes'),
  ('bioseguridad.gestionar',   'bioseguridad',  'Gestionar bioseguridad',    'Definir protocolos y elementos de protección'),
  -- caja
  ('caja.operar',              'facturacion',   'Operar caja',               'Abrir, mover y cerrar la caja del turno'),
  ('caja.gestionar',           'facturacion',   'Gestionar cajas',           'Crear cajas y revisar los cuadres'),
  -- integraciones
  ('integraciones.ver',        'integraciones', 'Ver integraciones',         'Consultar el estado de DIAN, pagos y mensajería'),
  ('integraciones.gestionar',  'integraciones', 'Gestionar integraciones',   'Configurar proveedores, pasarelas y canales'),
  ('facturacion_electronica.enviar', 'integraciones', 'Enviar a la DIAN',    'Transmitir facturas electrónicas'),
  ('pagos.en_linea',           'integraciones', 'Pagar en línea',            'Pagar facturas y pedidos desde el portal'),
  -- alertas
  ('alertas.ver',              'alertas',       'Ver alertas críticas',      'Consultar el tablero de alertas'),
  ('alertas.gestionar',        'alertas',       'Gestionar alertas',         'Resolver alertas y ajustar sus reglas'),
  -- automatización
  ('automatizacion.gestionar', 'comunicacion',  'Gestionar automatización',  'Definir qué aviso dispara cada suceso'),
  -- IA
  ('ia.usar',                  'ia',            'Usar el asistente',         'Pedir resúmenes y borradores al asistente'),
  ('ia.revisar',               'ia',            'Revisar sugerencias',       'Aceptar o descartar lo que propone el asistente'),
  ('ia.ver_registro',          'ia',            'Ver el registro de IA',     'Auditar qué se le pidió al asistente y qué respondió'),
  -- medicina preventiva, etapas de vida y pacientes crónicos
  ('prevencion.ver',           'prevencion',    'Ver medicina preventiva',   'Planes, calendario de salud y controles pendientes'),
  ('prevencion.gestionar',     'prevencion',    'Gestionar prevención',      'Definir planes, etapas de vida y evaluaciones periódicas'),
  ('cronicos.ver',             'prevencion',    'Ver pacientes crónicos',    'Consultar objetivos, mediciones y adherencia'),
  ('cronicos.gestionar',       'prevencion',    'Gestionar crónicos',        'Definir objetivos clínicos y tratamientos de largo plazo'),
  -- banco de sangre
  ('banco_sangre.ver',         'banco_sangre',  'Ver banco de sangre',       'Stock de unidades, donantes y solicitudes'),
  ('banco_sangre.gestionar',   'banco_sangre',  'Gestionar banco de sangre', 'Unidades, almacenamiento, reservas y emergencias'),
  ('donantes.gestionar',       'banco_sangre',  'Gestionar donantes',        'Alta, evaluación y donaciones de animales donantes'),
  ('transfusiones.registrar',  'banco_sangre',  'Registrar transfusiones',   'Compatibilidad, transfusión y reacciones'),
  -- banco de tejidos
  ('tejidos.ver',              'banco_tejidos', 'Ver banco de tejidos',      'Muestras disponibles y su conservación'),
  ('tejidos.gestionar',        'banco_tejidos', 'Gestionar banco de tejidos','Donantes, muestras, almacenamiento y procedimientos'),
  -- especialidades clínicas
  ('odontologia.ver',          'odontologia',   'Ver odontología',           'Odontogramas, limpiezas y controles dentales'),
  ('odontologia.gestionar',    'odontologia',   'Gestionar odontología',     'Registrar evaluaciones y procedimientos dentales'),
  ('cardiologia.ver',          'cardiologia',   'Ver cardiología',           'Evaluaciones, ECG, ecocardiogramas y seguimiento'),
  ('cardiologia.gestionar',    'cardiologia',   'Gestionar cardiología',     'Registrar estudios y resultados cardíacos'),
  ('dermatologia.ver',         'dermatologia',  'Ver dermatología',          'Lesiones, pruebas y fotografías'),
  ('dermatologia.gestionar',   'dermatologia',  'Gestionar dermatología',    'Registrar evaluaciones, pruebas y tratamientos'),
  ('oftalmologia.ver',         'oftalmologia',  'Ver oftalmología',          'Evaluaciones y pruebas por ojo'),
  ('oftalmologia.gestionar',   'oftalmologia',  'Gestionar oftalmología',    'Registrar pruebas visuales y tratamientos oculares'),
  ('rehabilitacion.ver',       'rehabilitacion','Ver rehabilitación',        'Planes, sesiones y progreso de fisioterapia'),
  ('rehabilitacion.gestionar', 'rehabilitacion','Gestionar rehabilitación',  'Definir planes, terapias y mediciones de movilidad'),
  ('dolor.ver',                'rehabilitacion','Ver manejo del dolor',      'Escalas, evaluaciones y seguimiento del dolor'),
  ('dolor.gestionar',          'rehabilitacion','Gestionar el dolor',        'Tratamientos, intervenciones y dosis de rescate'),
  ('anestesia.ver',            'anestesia',     'Ver anestesiología',        'Protocolos, monitorización y recuperación'),
  ('anestesia.gestionar',      'anestesia',     'Gestionar anestesia',       'Evaluación preanestésica, registro y eventos'),
  ('comportamiento.ver',       'comportamiento','Ver comportamiento',        'Evaluaciones conductuales y evolución'),
  ('comportamiento.gestionar', 'comportamiento','Gestionar comportamiento',  'Planes conductuales y sesiones'),
  ('genetica.ver',             'genetica',      'Ver genética',              'Perfiles, pruebas y antecedentes genéticos'),
  ('genetica.gestionar',       'genetica',      'Gestionar genética',        'Registrar muestras, pruebas y resultados'),
  ('reproduccion.ver',         'reproduccion',  'Ver reproducción',          'Ciclos, gestaciones, partos y camadas'),
  ('reproduccion.gestionar',   'reproduccion',  'Gestionar reproducción',    'Cruzamientos, inseminaciones y controles de gestación'),
  ('neonatologia.ver',         'reproduccion',  'Ver neonatología',          'Neonatos, peso, temperatura y alimentación'),
  ('neonatologia.gestionar',   'reproduccion',  'Gestionar neonatología',    'Controles, medicación y mortalidad neonatal'),
  -- calidad y seguridad del paciente
  ('riesgo.ver',               'calidad',       'Ver riesgo clínico',        'Consultar eventos adversos y sus investigaciones'),
  ('riesgo.reportar',          'calidad',       'Reportar eventos adversos', 'Notificar errores, caídas, infecciones y reacciones'),
  ('riesgo.investigar',        'calidad',       'Investigar eventos',        'Análisis de causa raíz y acciones correctivas'),
  ('seguridad_paciente.ver',   'calidad',       'Ver seguridad del paciente','Identificación, verificaciones y listas de chequeo'),
  ('seguridad_paciente.registrar','calidad',    'Registrar verificaciones',  'Marcar checklist de cirugía, anestesia y alta'),
  ('infecciones.ver',          'calidad',       'Ver control de infecciones','Casos, aislamientos e indicadores'),
  ('infecciones.gestionar',    'calidad',       'Gestionar infecciones',     'Aislamientos, limpieza y desinfección'),
  ('trazabilidad.ver',         'calidad',       'Ver trazabilidad clínica',  'Quién abrió, cambió o firmó la historia'),
  -- segunda opinión y referencias
  ('opiniones.ver',            'interconsulta', 'Ver segundas opiniones',    'Consultar solicitudes y respuestas de especialistas'),
  ('opiniones.solicitar',      'interconsulta', 'Pedir segunda opinión',     'Enviar el caso a un especialista'),
  ('opiniones.responder',      'interconsulta', 'Responder opiniones',       'Emitir la opinión y sus recomendaciones'),
  ('referencias.ver',          'interconsulta', 'Ver referencias',           'Remisiones a otras instituciones y su respuesta'),
  ('referencias.gestionar',    'interconsulta', 'Gestionar referencias',     'Emitir remisiones y registrar la contrarreferencia'),
  -- colas, experiencia y agenda inteligente
  ('colas.ver',                'atencion',      'Ver colas y turnos',        'Consultar la sala de espera y los turnos'),
  ('colas.operar',             'atencion',      'Operar la cola',            'Emitir, llamar y cerrar turnos'),
  ('colas.gestionar',          'atencion',      'Gestionar colas',           'Definir colas, prioridades y salas de espera'),
  ('experiencia.ver',          'atencion',      'Ver experiencia',           'Satisfacción, preferencias y clientes inactivos'),
  ('experiencia.gestionar',    'atencion',      'Gestionar experiencia',     'Campañas de recuperación y preferencias'),
  ('agenda_inteligente.ver',   'atencion',      'Ver agenda inteligente',    'Lista de espera, predicción y optimización'),
  ('agenda_inteligente.gestionar','atencion',   'Gestionar agenda inteligente','Sobrecupos, sustituciones y citas urgentes'),
  ('lista_espera.inscribirse', 'atencion',      'Entrar en lista de espera', 'Pedir aviso cuando se libere un horario'),
  -- monitoreo remoto e IoT
  ('monitoreo.ver_propio',     'dispositivos',  'Ver mis dispositivos',      'Lecturas del collar o sensor de su propia mascota'),
  ('monitoreo.ver',            'dispositivos',  'Ver monitoreo remoto',      'Lecturas y alertas de los dispositivos del paciente'),
  ('monitoreo.gestionar',      'dispositivos',  'Gestionar monitoreo',       'Vincular dispositivos y fijar umbrales'),
  ('iot.ver',                  'dispositivos',  'Ver IoT clínico',           'Temperatura de jaulas, humedad y oxígeno'),
  ('iot.gestionar',            'dispositivos',  'Gestionar IoT clínico',     'Dispositivos médicos conectados y sus sensores'),
  -- residuos
  ('residuos.ver',             'gestion_residuos','Ver gestión de residuos', 'Recolecciones, manifiestos y trazabilidad'),
  ('residuos.gestionar',       'gestion_residuos','Gestionar residuos',      'Contenedores, gestores y certificados'),
  -- proveedores y contratos
  ('proveedores.evaluar',      'contratos',     'Evaluar proveedores',       'Calificar, medir indicadores y registrar incumplimientos'),
  ('contratos.ver',            'contratos',     'Ver contratos',             'Contratos de clientes, proveedores y empleados'),
  ('contratos.gestionar',      'contratos',     'Gestionar contratos',       'Crear, renovar y controlar vencimientos'),
  -- sucursales
  ('sucursales.ver',           'sucursales',    'Ver sucursales',            'Metas, indicadores y comparativas por sede'),
  ('sucursales.gestionar',     'sucursales',    'Gestionar sucursales',      'Responsables, metas y configuración de cada sede'),
  -- control financiero
  ('finanzas.ver',             'finanzas',      'Ver control financiero',    'Cuentas por cobrar y pagar, presupuestos y cierres'),
  ('finanzas.gestionar',       'finanzas',      'Gestionar finanzas',        'Presupuestos, conciliaciones y cierres contables'),
  ('gastos.registrar',         'finanzas',      'Registrar gastos',          'Anotar gastos con su categoría y comprobante'),
  -- centro de operaciones
  ('operaciones.tablero',      'centro_operaciones','Ver el tablero en vivo','Pacientes críticos, citas, inventario y alertas'),
  -- motor de reglas y automatización
  ('reglas.ver',               'automatizacion','Ver reglas',                'Consultar reglas, condiciones y ejecuciones'),
  ('reglas.gestionar',         'automatizacion','Gestionar reglas',          'Crear reglas, acciones y excepciones'),
  ('workflows.ver',            'automatizacion','Ver workflows',             'Ejecuciones, errores y reintentos'),
  ('workflows.gestionar',      'automatizacion','Gestionar workflows',       'Definir disparadores, pasos y acciones'),
  -- IA
  ('ia.aprobar',               'ia',            'Aprobar sugerencias de IA', 'Dejar aplicar una sugerencia clínica revisada'),
  ('ia.negocio',               'ia',            'Ver IA administrativa',     'Predicciones de demanda, inventario y clientes'),
  -- centro de documentos
  ('documentos.ver',           'documentos',    'Ver el centro de documentos','Versiones, firmas y vencimientos'),
  ('documentos.gestionar',     'documentos',    'Gestionar documentos',      'Versionar, archivar y dar permisos'),
  ('documentos.firmar',        'documentos',    'Firmar documentos',         'Firmar electrónicamente y validar'),
  -- centro de alertas
  ('alertas.escalar',          'alertas',       'Escalar alertas',           'Subir de nivel una alerta sin atender'),
  -- continuidad operativa
  ('continuidad.ver',          'continuidad',   'Ver continuidad operativa', 'Servicios críticos, planes e incidentes'),
  ('continuidad.gestionar',    'continuidad',   'Gestionar continuidad',     'Planes de contingencia, recuperación y simulacros'),
  -- configuración por dominio
  ('config.clinicos',          'configuracion', 'Cambiar parámetros clínicos','Umbrales y valores del área clínica'),
  ('config.por_sede',          'configuracion', 'Configurar por sede',       'Sobrescribir parámetros en una sede concreta');

-- --- Permisos del CLIENTE --------------------------------------------
-- Solo lo suyo: sus mascotas, sus citas, su historia y sus facturas.
INSERT INTO seguridad.rol_permisos (rol_id, permiso_id)
SELECT 1, id FROM seguridad.permisos WHERE codigo IN (
  'perfil.ver','perfil.editar',
  'mascotas.ver_propias','mascotas.crear','mascotas.editar','mascotas.eliminar',
  'citas.ver_propias','citas.crear','citas.cancelar',
  'servicios.ver','veterinarios.ver',
  'historia.ver_propia',
  'facturas.ver_propias',
  'notificaciones.ver',
  'archivos.ver',
  -- Módulos nuevos: siempre en su versión "lo mío".
  'recetas.ver_propias',
  'nutricion.ver',
  'telemedicina.ver_propias',
  'identidad.gestionar','perdidas.reportar',
  'adopciones.ver','adopciones.solicitar',
  'tienda.comprar','pedidos.ver_propios',
  'planes.ver','planes.suscribir','puntos.ver',
  'tickets.crear','tickets.ver_propios','encuestas.responder',
  'pagos.en_linea',
  'reportes.exportar',
  -- Módulos 39-82: solo lo que tiene sentido para el dueño.
  'prevencion.ver',
  'lista_espera.inscribirse',
  'monitoreo.ver_propio'
);

-- --- Permisos del VETERINARIO ----------------------------------------
-- Todo lo clínico y su agenda, pero nada de seguridad ni de facturación.
INSERT INTO seguridad.rol_permisos (rol_id, permiso_id)
SELECT 2, id FROM seguridad.permisos WHERE codigo IN (
  'perfil.ver','perfil.editar',
  'clientes.ver',
  'mascotas.ver_todas','mascotas.crear','mascotas.editar',
  'citas.ver_todas','citas.crear','citas.editar','citas.cancelar','citas.confirmar',
  'agenda.gestionar','servicios.ver','veterinarios.ver',
  'historia.ver_todas','consultas.crear','consultas.editar',
  'vacunas.aplicar','examenes.gestionar','cirugias.gestionar','hospitalizacion.gestionar',
  'inventario.ver',
  'notificaciones.ver','notificaciones.enviar','recordatorios.gestionar',
  'archivos.ver','archivos.subir',
  'sedes.ver',
  -- Módulos clínicos nuevos
  'urgencias.ver','urgencias.gestionar',
  'hospitalizacion.ver','habitaciones.gestionar',
  'recetas.ver_todas','recetas.crear','farmacia.dispensar',
  'laboratorio.ver','laboratorio.ordenar','laboratorio.procesar','laboratorio.validar',
  'imagenes.ver','imagenes.gestionar','imagenes.informar',
  'vacunacion.esquemas','desparasitacion.registrar',
  'nutricion.ver','nutricion.gestionar',
  'telemedicina.atender',
  'identidad.gestionar','adopciones.ver','adopciones.gestionar',
  'equipos.ver',
  'bioseguridad.ver','bioseguridad.registrar',
  'tickets.ver_todos','tickets.gestionar',
  'personal.ver','ausencias.solicitar','comisiones.ver',
  'alertas.ver','alertas.gestionar',
  'ia.usar','ia.revisar',
  'reportes.ver','reportes.exportar',
  -- Módulos 39-82: todo lo clínico. Fuera queda lo administrativo
  -- (contratos, finanzas, sedes, reglas del motor y configuración).
  'prevencion.ver','prevencion.gestionar','cronicos.ver','cronicos.gestionar',
  'banco_sangre.ver','banco_sangre.gestionar','donantes.gestionar','transfusiones.registrar',
  'tejidos.ver','tejidos.gestionar',
  'odontologia.ver','odontologia.gestionar',
  'cardiologia.ver','cardiologia.gestionar',
  'dermatologia.ver','dermatologia.gestionar',
  'oftalmologia.ver','oftalmologia.gestionar',
  'rehabilitacion.ver','rehabilitacion.gestionar',
  'dolor.ver','dolor.gestionar',
  'anestesia.ver','anestesia.gestionar',
  'comportamiento.ver','comportamiento.gestionar',
  'genetica.ver','genetica.gestionar',
  'reproduccion.ver','reproduccion.gestionar',
  'neonatologia.ver','neonatologia.gestionar',
  'riesgo.ver','riesgo.reportar',
  'seguridad_paciente.ver','seguridad_paciente.registrar',
  'infecciones.ver','infecciones.gestionar',
  'trazabilidad.ver',
  'opiniones.ver','opiniones.solicitar','opiniones.responder',
  'referencias.ver','referencias.gestionar',
  'colas.ver','colas.operar',
  'experiencia.ver',
  'agenda_inteligente.ver','agenda_inteligente.gestionar',
  'monitoreo.ver','monitoreo.gestionar','iot.ver',
  'residuos.ver',
  'operaciones.tablero',
  'documentos.ver','documentos.firmar',
  'alertas.escalar',
  'ia.aprobar'
);

-- --- Permisos del ADMIN ----------------------------------------------
-- Todos, salvo los que solo tienen sentido para un cliente.
INSERT INTO seguridad.rol_permisos (rol_id, permiso_id)
SELECT 3, id FROM seguridad.permisos
 WHERE codigo NOT IN (
   'mascotas.ver_propias','citas.ver_propias','historia.ver_propia','facturas.ver_propias',
   'recetas.ver_propias','telemedicina.ver_propias','pedidos.ver_propios','tickets.ver_propios',
   'adopciones.solicitar','planes.suscribir','encuestas.responder','perdidas.reportar',
   'domicilios.repartir',
   'monitoreo.ver_propio','lista_espera.inscribirse');


-- =====================================================================
--  USUARIOS
--  Los hash son bcrypt de las contraseñas indicadas en la cabecera.
-- =====================================================================

-- Las contraseñas de estas cuentas son de ejemplo y están en el repositorio,
-- así que todas nacen marcadas con debe_cambiar_password = 1: sirven para
-- entrar la primera vez y obligan a poner una propia antes de poder usar el
-- sistema. Sin la marca, un despliegue publicado con estos datos queda con la
-- cuenta de administración abierta para cualquiera que haya leído el seed.
INSERT INTO usuarios.usuarios (id, rol_id, sede_id, nombre, email, telefono, password_hash, debe_cambiar_password) VALUES
  (1, 3, 1, 'Administración Huellitas', 'admin@huellitas.com',     '3107896780', '$2a$10$f9UZ1oFSjfahouhLXVAeQOZ7mCp0x5Xo/9URr8oZEGWpSX/3YDr6i', 1),
  (2, 2, 1, 'Valentina Ríos',           'valentina@huellitas.com', '3107896781', '$2a$10$XPaLj51uq/ccAAkVpQB9.uMIGqFNErB8UVYiXnAqBTFjSuoC2TT2u', 1),
  (3, 2, 1, 'Andrés Suárez',            'andres@huellitas.com',    '3107896782', '$2a$10$XPaLj51uq/ccAAkVpQB9.uMIGqFNErB8UVYiXnAqBTFjSuoC2TT2u', 1),
  (4, 2, 1, 'Paula Méndez',             'paula@huellitas.com',     '3107896783', '$2a$10$XPaLj51uq/ccAAkVpQB9.uMIGqFNErB8UVYiXnAqBTFjSuoC2TT2u', 1),
  (5, 2, 2, 'Julián Castaño',           'julian@huellitas.com',    '3107896784', '$2a$10$XPaLj51uq/ccAAkVpQB9.uMIGqFNErB8UVYiXnAqBTFjSuoC2TT2u', 1),
  (6, 1, NULL, 'Daniela Ortiz',         'daniela@correo.com',      '3201234567', '$2a$10$Fs7/gEBtq7jopS74r6Zvu.jzLsmbnHaDd338Shc2DAlAqh3FQxkZ2', 1),
  (7, 1, NULL, 'Carlos Peña',           'carlos@correo.com',       '3209876543', '$2a$10$Fs7/gEBtq7jopS74r6Zvu.jzLsmbnHaDd338Shc2DAlAqh3FQxkZ2', 1);

INSERT INTO usuarios.clientes (id, usuario_id, tipo_documento, documento, direccion, ciudad) VALUES
  (1, 6, 'CC', '1052398471', 'Cra. 11 #14-25', 'Sogamoso'),
  (2, 7, 'CC', '1052874390', 'Calle 8 #22-14', 'Sogamoso');

INSERT INTO usuarios.veterinarios (id, usuario_id, licencia, especialidad, descripcion, duracion_slot_min) VALUES
  (1, 2, 'MV-10432', 'medicina_general', 'Medicina general y cirugía de tejidos blandos. 12 años de experiencia.', 30),
  (2, 3, 'MV-9821',  'imagenes',         'Diagnóstico por imágenes: ecografía y radiología digital.', 30),
  (3, 4, 'MV-11207', 'felinos',          'Medicina felina y manejo de pacientes geriátricos.', 30),
  (4, 5, 'MV-10877', 'cirugia',          'Cirugía de urgencias y ortopedia.', 60);

-- El administrador también es personal de la clínica.
INSERT INTO usuarios.empleados (id, usuario_id, sede_id, cargo, documento, fecha_ingreso) VALUES
  (1, 1, 1, 'Administrador', '79541230', (CURRENT_DATE - INTERVAL '3 years')::date);

INSERT INTO usuarios.contactos_emergencia (id, cliente_id, nombre, parentesco, telefono, principal) VALUES
  (1, 1, 'Mónica Ortiz',  'Hermana', '3157894561', 1),
  (2, 2, 'Laura Peña',    'Esposa',  '3125647890', 1);


-- =====================================================================
--  MASCOTAS
-- =====================================================================

INSERT INTO mascotas.especies (id, nombre) VALUES
  (1, 'Perro'), (2, 'Gato'), (3, 'Ave'), (4, 'Conejo'), (5, 'Roedor'), (6, 'Reptil');

INSERT INTO mascotas.razas (especie_id, nombre) VALUES
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

-- El disparador abre la historia clínica de cada mascota.
INSERT INTO mascotas.mascotas (id, cliente_id, nombre, especie_id, raza_id, sexo, fecha_nacimiento, peso_kg, color, microchip, esterilizado, informacion) VALUES
  (1, 1, 'Luna',  1, (SELECT id FROM mascotas.razas WHERE nombre = 'Mestizo' AND especie_id = 1),
      'hembra', (CURRENT_DATE - INTERVAL '2 years')::date,  18.40, 'Café con blanco', '982000123456789', 1,
      'Juguetona y muy apegada. Le encantan los niños y las caminatas largas.'),
  (2, 1, 'Simón', 2, (SELECT id FROM mascotas.razas WHERE nombre = 'Atigrado común' AND especie_id = 2),
      'macho',  (CURRENT_DATE - INTERVAL '1 year')::date,   4.20, 'Atigrado gris', NULL, 1,
      'Tranquilo y curioso, ideal para apartamento.'),
  (3, 2, 'Rocky', 1, (SELECT id FROM mascotas.razas WHERE nombre = 'Criollo' AND especie_id = 1),
      'macho',  (CURRENT_DATE - INTERVAL '5 years')::date,  24.10, 'Negro', '982000987654321', 1,
      'Tranquilo, guardián y noble. Perfecto para una familia con patio.');

INSERT INTO mascotas.mascotas_contactos (mascota_id, contacto_id, autorizado_recoger) VALUES
  (1, 1, 1), (2, 1, 1), (3, 2, 1);

INSERT INTO mascotas.alergias (id, nombre, tipo) VALUES
  (1, 'Penicilina',            'medicamento'),
  (2, 'Pollo',                 'alimento'),
  (3, 'Polen',                 'ambiental'),
  (4, 'Picadura de pulga',     'contacto'),
  (5, 'Sulfas',                'medicamento'),
  (6, 'Lácteos',               'alimento');

INSERT INTO mascotas.mascota_alergias (mascota_id, alergia_id, severidad, reaccion) VALUES
  (1, 4, 'moderada', 'Dermatitis alérgica por picadura de pulga en la base de la cola'),
  (3, 1, 'grave',    'Edema facial tras la aplicación de penicilina');

INSERT INTO mascotas.condiciones_medicas (id, nombre, descripcion) VALUES
  (1, 'Displasia de cadera',     'Malformación de la articulación coxofemoral'),
  (2, 'Enfermedad renal crónica','Pérdida progresiva de la función renal'),
  (3, 'Diabetes mellitus',       'Alteración en la regulación de la glucosa'),
  (4, 'Epilepsia idiopática',    'Convulsiones recurrentes sin causa estructural'),
  (5, 'Obesidad',                'Exceso de peso corporal con riesgo metabólico');

INSERT INTO mascotas.mascota_condiciones (mascota_id, condicion_id, estado, diagnosticada_en, notas) VALUES
  (3, 1, 'controlada', (CURRENT_DATE - INTERVAL '2 years')::date, 'Manejo con condroprotectores y control de peso.');

INSERT INTO mascotas.historial_peso (mascota_id, peso_kg, fecha, origen) VALUES
  (1, 16.80, (CURRENT_DATE - INTERVAL '12 months')::date, 'consulta'),
  (1, 17.60, (CURRENT_DATE - INTERVAL '6 months')::date,  'consulta'),
  (1, 18.40, (CURRENT_DATE - INTERVAL '1 month')::date,   'consulta'),
  (2,  3.90, (CURRENT_DATE - INTERVAL '6 months')::date,  'consulta'),
  (2,  4.20, (CURRENT_DATE - INTERVAL '1 month')::date,   'consulta'),
  (3, 25.30, (CURRENT_DATE - INTERVAL '12 months')::date, 'consulta'),
  (3, 24.10, (CURRENT_DATE - INTERVAL '2 months')::date,  'consulta');


-- =====================================================================
--  AGENDA
-- =====================================================================

INSERT INTO agenda.servicios (id, nombre, slug, descripcion, precio, duracion_min, requisitos, icono) VALUES
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
INSERT INTO agenda.veterinario_servicios (servicio_id, veterinario_id) VALUES
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

-- Horario semanal: 0=domingo … 6=sábado
INSERT INTO agenda.horarios_veterinarios (veterinario_id, sede_id, dia_semana, hora_inicio, hora_fin) VALUES
  -- Valentina: lunes a viernes, jornada partida
  (1, 1, 1, '08:00:00', '12:00:00'), (1, 1, 1, '14:00:00', '18:00:00'),
  (1, 1, 2, '08:00:00', '12:00:00'), (1, 1, 2, '14:00:00', '18:00:00'),
  (1, 1, 3, '08:00:00', '12:00:00'), (1, 1, 3, '14:00:00', '18:00:00'),
  (1, 1, 4, '08:00:00', '12:00:00'), (1, 1, 4, '14:00:00', '18:00:00'),
  (1, 1, 5, '08:00:00', '12:00:00'), (1, 1, 5, '14:00:00', '18:00:00'),
  -- Andrés: lunes, miércoles y viernes en la mañana; sábado completo
  (2, 1, 1, '08:00:00', '13:00:00'),
  (2, 1, 3, '08:00:00', '13:00:00'),
  (2, 1, 5, '08:00:00', '13:00:00'),
  (2, 1, 6, '09:00:00', '15:00:00'),
  -- Paula: martes a sábado en la tarde
  (3, 1, 2, '13:00:00', '19:00:00'),
  (3, 1, 3, '13:00:00', '19:00:00'),
  (3, 1, 4, '13:00:00', '19:00:00'),
  (3, 1, 5, '13:00:00', '19:00:00'),
  (3, 1, 6, '10:00:00', '16:00:00'),
  -- Julián: cirugías de lunes a jueves
  (4, 2, 1, '07:00:00', '13:00:00'),
  (4, 2, 2, '07:00:00', '13:00:00'),
  (4, 2, 3, '07:00:00', '13:00:00'),
  (4, 2, 4, '07:00:00', '13:00:00');

-- --- Citas -----------------------------------------------------------
-- Dos ya atendidas (para que la historia clínica tenga contenido) y una
-- futura, siempre en el próximo día hábil para que caiga dentro del
-- horario de Valentina y el propio sistema la considere válida.
INSERT INTO agenda.citas (id, sede_id, cliente_id, mascota_id, veterinario_id, servicio_id, inicio, fin, estado, motivo, creado_por) VALUES
  (1, 1, 1, 1, 1, 1,
     (CURRENT_DATE - INTERVAL '1 month')::date + TIME '09:00:00',
     (CURRENT_DATE - INTERVAL '1 month')::date + TIME '09:30:00',
     'atendida', 'Control general y revisión de piel', 6),
  (2, 1, 2, 3, 1, 1,
     (CURRENT_DATE - INTERVAL '2 months')::date + TIME '10:00:00',
     (CURRENT_DATE - INTERVAL '2 months')::date + TIME '10:30:00',
     'atendida', 'Cojera en la pata trasera izquierda', 7);

INSERT INTO agenda.citas (id, sede_id, cliente_id, mascota_id, veterinario_id, servicio_id, inicio, fin, estado, motivo, creado_por)
SELECT 3, 1, 1, 1, 1, 1,
       proximo_habil + TIME '09:00:00',
       proximo_habil + TIME '09:30:00',
       'confirmada', 'Control anual y refuerzo de vacunas', 6
  FROM (
    SELECT MIN(d)::date AS proximo_habil
      FROM generate_series(CURRENT_DATE + 1, CURRENT_DATE + 8, INTERVAL '1 day') d
     WHERE EXTRACT(ISODOW FROM d) BETWEEN 1 AND 5
  ) AS habil;


-- =====================================================================
--  HISTORIA CLINICA
-- =====================================================================

INSERT INTO historia_clinica.catalogo_diagnosticos (id, codigo, nombre, categoria, especie_id) VALUES
  (1,  'DER-01', 'Dermatitis alérgica por pulgas', 'Dermatología', NULL),
  (2,  'GAS-01', 'Gastroenteritis aguda',          'Digestivo',    NULL),
  (3,  'PAR-01', 'Parasitosis intestinal',         'Digestivo',    NULL),
  (4,  'ORT-01', 'Displasia de cadera',            'Ortopedia',     1),
  (5,  'ORT-02', 'Ruptura de ligamento cruzado',   'Ortopedia',    NULL),
  (6,  'ODO-01', 'Enfermedad periodontal',         'Odontología',  NULL),
  (7,  'RES-01', 'Traqueobronquitis infecciosa',   'Respiratorio',  1),
  (8,  'URI-01', 'Enfermedad del tracto urinario inferior felino', 'Urinario', 2),
  (9,  'REN-01', 'Enfermedad renal crónica',       'Urinario',     NULL),
  (10, 'OTI-01', 'Otitis externa',                 'Otorrino',     NULL),
  (11, 'MET-01', 'Obesidad',                       'Metabólico',   NULL),
  (12, 'OFT-01', 'Conjuntivitis',                  'Oftalmología', NULL);

INSERT INTO historia_clinica.medicamentos (id, nombre, principio_activo, presentacion, concentracion, via) VALUES
  (1, 'Amoxicilina',   'Amoxicilina + ácido clavulánico', 'Tableta',  '250 mg', 'oral'),
  (2, 'Meloxicam',     'Meloxicam',                       'Solución', '1.5 mg/ml', 'oral'),
  (3, 'Ivermectina',   'Ivermectina',                     'Solución', '1%',     'subcutanea'),
  (4, 'Omeprazol',     'Omeprazol',                       'Cápsula',  '10 mg',  'oral'),
  (5, 'Prednisolona',  'Prednisolona',                    'Tableta',  '5 mg',   'oral'),
  (6, 'Metronidazol',  'Metronidazol',                    'Tableta',  '250 mg', 'oral'),
  (7, 'Condroitina',   'Sulfato de condroitina + glucosamina', 'Tableta', '500 mg', 'oral');

INSERT INTO historia_clinica.vacunas (id, nombre, especie_id, enfermedades, refuerzo_meses, obligatoria) VALUES
  (1, 'Polivalente (Séxtuple)', 1, 'Moquillo, parvovirus, hepatitis, leptospirosis', 12, 1),
  (2, 'Rabia',                  1, 'Rabia',                    12, 1),
  (3, 'Tos de las perreras',    1, 'Bordetella bronchiseptica',12, 0),
  (4, 'Leptospirosis',          1, 'Leptospira spp.',           6, 0),
  (5, 'Triple felina',          2, 'Rinotraqueítis, calicivirus, panleucopenia', 12, 1),
  (6, 'Rabia felina',           2, 'Rabia',                    12, 1),
  (7, 'Leucemia felina',        2, 'Virus de la leucemia felina', 12, 0),
  (8, 'Mixomatosis',            4, 'Mixomatosis',              12, 0);

INSERT INTO historia_clinica.lotes_vacunas (id, vacuna_id, lote, laboratorio, fecha_vencimiento, dosis_totales, dosis_usadas) VALUES
  (1, 1, 'L-2024-A17', 'Zoetis',        (CURRENT_DATE + INTERVAL '8 months')::date,  50, 12),
  (2, 2, 'R-2024-B04', 'MSD Salud Animal', (CURRENT_DATE + INTERVAL '10 months')::date, 60, 20),
  (3, 5, 'F-2025-C09', 'Virbac',        (CURRENT_DATE + INTERVAL '14 months')::date, 30,  4);

INSERT INTO historia_clinica.tipos_examen (id, nombre, categoria, descripcion, precio) VALUES
  (1, 'Hemograma completo',    'laboratorio', 'Recuento celular y fórmula leucocitaria', 55000),
  (2, 'Perfil bioquímico',     'laboratorio', 'Función hepática y renal',                95000),
  (3, 'Coprológico',           'laboratorio', 'Búsqueda de parásitos intestinales',      35000),
  (4, 'Uroanálisis',           'laboratorio', 'Análisis físico-químico de la orina',     45000),
  (5, 'Radiografía simple',    'imagen',      'Placa en dos proyecciones',               95000),
  (6, 'Ecografía abdominal',   'imagen',      'Exploración de órganos abdominales',     130000),
  (7, 'Prueba rápida de parvovirus', 'laboratorio', 'Detección antigénica en heces',     60000);

-- --- Consultas de las citas ya atendidas ------------------------------
INSERT INTO historia_clinica.consultas (id, historia_id, cita_id, veterinario_id, sede_id, fecha, tipo, motivo, anamnesis, sintomas, examen_fisico, observaciones, plan_manejo) VALUES
  (1,
   (SELECT id FROM historia_clinica.historias_clinicas WHERE mascota_id = 1),
   1, 1, 1, (CURRENT_DATE - INTERVAL '1 month')::date + TIME '09:05:00',
   'consulta', 'Control general y revisión de piel',
   'La dueña refiere rascado frecuente en la base de la cola desde hace dos semanas.',
   'Prurito, eritema en región lumbosacra, presencia de deposiciones de pulga.',
   'Paciente alerta, mucosas rosadas, TLC < 2 s. Lesiones costrosas en base de cola.',
   'Buen estado general. Se recomienda control de pulgas mensual.',
   'Antipulgas tópico mensual, corticoide a dosis baja por 5 días y control en un mes.'),
  (2,
   (SELECT id FROM historia_clinica.historias_clinicas WHERE mascota_id = 3),
   2, 1, 1, (CURRENT_DATE - INTERVAL '2 months')::date + TIME '10:05:00',
   'consulta', 'Cojera en la pata trasera izquierda',
   'Cojera intermitente que empeora después del ejercicio, de tres meses de evolución.',
   'Claudicación grado 2/5 en miembro posterior izquierdo, dolor a la extensión de cadera.',
   'Dolor a la manipulación coxofemoral izquierda, masa muscular disminuida.',
   'Compatible con displasia de cadera. Se solicita radiografía de control.',
   'Condroprotector diario, control de peso, ejercicio de bajo impacto y radiografía.');

INSERT INTO historia_clinica.signos_vitales (consulta_id, mascota_id, tomado_por, fecha, peso_kg, temperatura_c, frec_cardiaca, frec_respiratoria, mucosas, hidratacion, condicion_corporal) VALUES
  (1, 1, 2, (CURRENT_DATE - INTERVAL '1 month')::date + TIME '09:06:00', 18.40, 38.5, 96, 24, 'rosadas', 'normal', 5),
  (2, 3, 2, (CURRENT_DATE - INTERVAL '2 months')::date + TIME '10:06:00', 24.10, 38.2, 88, 22, 'rosadas', 'normal', 6);

INSERT INTO historia_clinica.consulta_diagnosticos (consulta_id, diagnostico_id, descripcion, tipo, principal) VALUES
  (1, 1, 'Dermatitis alérgica por picadura de pulga en región lumbosacra', 'definitivo', 1),
  (2, 4, 'Displasia de cadera izquierda, grado moderado',                  'presuntivo', 1);

INSERT INTO historia_clinica.tratamientos (id, consulta_id, descripcion, indicaciones, fecha_inicio, fecha_fin, estado) VALUES
  (1, 1, 'Control de pulgas y manejo del prurito',
        'Aplicar el antipulgas en la nuca, sobre piel limpia y seca. No bañar por 48 horas.',
        (CURRENT_DATE - INTERVAL '1 month')::date, (CURRENT_DATE - INTERVAL '25 days')::date, 'finalizado'),
  (2, 2, 'Manejo conservador de displasia de cadera',
        'Condroprotector diario con la comida. Evitar saltos y superficies resbalosas.',
        (CURRENT_DATE - INTERVAL '2 months')::date, NULL, 'activo');

INSERT INTO historia_clinica.prescripciones (tratamiento_id, medicamento_id, dosis, frecuencia, duracion, via, cantidad) VALUES
  (1, 5, '0.5 mg/kg', 'Cada 24 horas', '5 días',      'oral', 5),
  (1, 2, '0.1 mg/kg', 'Cada 24 horas', '3 días',      'oral', 3),
  (2, 7, '1 tableta', 'Cada 24 horas', 'Indefinido',  'oral', 60);

INSERT INTO historia_clinica.aplicaciones_vacunas (mascota_id, vacuna_id, lote_id, consulta_id, veterinario_id, fecha_aplicacion, proxima_fecha, lote) VALUES
  (1, 1, 1, 1,    1, (CURRENT_DATE - INTERVAL '11 months')::date, (CURRENT_DATE + INTERVAL '20 days')::date, 'L-2024-A17'),
  (1, 2, 2, NULL, 1, (CURRENT_DATE - INTERVAL '11 months')::date, (CURRENT_DATE + INTERVAL '25 days')::date, 'R-2024-B04'),
  (3, 2, 2, NULL, 1, (CURRENT_DATE - INTERVAL '13 months')::date, (CURRENT_DATE - INTERVAL '30 days')::date, 'R-2023-C11'),
  (2, 5, 3, NULL, 3, (CURRENT_DATE - INTERVAL '8 months')::date,  (CURRENT_DATE + INTERVAL '4 months')::date, 'F-2025-C09');

INSERT INTO historia_clinica.examenes (id, mascota_id, consulta_id, tipo_examen_id, solicitado_por, descripcion, fecha_solicitud, fecha_resultado, estado, conclusion) VALUES
  (1, 3, 2, 5, 1, 'Radiografía de cadera, proyección ventrodorsal',
     (CURRENT_DATE - INTERVAL '2 months')::date, (CURRENT_DATE - INTERVAL '2 months')::date, 'listo',
     'Ángulo de Norberg disminuido en cadera izquierda, compatible con displasia moderada.'),
  (2, 1, 1, 1, 1, 'Hemograma de control',
     (CURRENT_DATE - INTERVAL '1 month')::date, (CURRENT_DATE - INTERVAL '1 month')::date, 'listo',
     'Sin alteraciones significativas. Ligera eosinofilia compatible con cuadro alérgico.');

INSERT INTO historia_clinica.resultados_examenes (examen_id, parametro, valor, unidad, referencia, fuera_rango) VALUES
  (2, 'Hematocrito',  '45',   '%',        '37 - 55',   0),
  (2, 'Hemoglobina',  '15.2', 'g/dl',     '12 - 18',   0),
  (2, 'Leucocitos',   '9800', '/µl',      '6000 - 17000', 0),
  (2, 'Eosinófilos',  '1450', '/µl',      '100 - 1250', 1),
  (2, 'Plaquetas',    '310',  'x10³/µl',  '200 - 500', 0);

INSERT INTO historia_clinica.cirugias (id, mascota_id, veterinario_id, consulta_id, sede_id, nombre, fecha, hora_inicio, hora_fin, anestesia, descripcion, resultado, estado) VALUES
  (1, 1, 4, NULL, 1, 'Ovariohisterectomía', (CURRENT_DATE - INTERVAL '18 months')::date,
     '08:00', '09:15', 'Inhalatoria (isoflurano)',
     'Esterilización electiva por línea media. Sin complicaciones.',
     'Recuperación anestésica sin novedad. Retiro de puntos a los 10 días.', 'realizada');

INSERT INTO historia_clinica.cirugia_personal (cirugia_id, usuario_id, funcion) VALUES
  (1, 5, 'cirujano'),
  (1, 2, 'anestesista');


-- =====================================================================
--  INVENTARIO
-- =====================================================================

INSERT INTO inventario.categorias_productos (id, nombre, tipo) VALUES
  (1, 'Medicamentos',    'medicamento'),
  (2, 'Vacunas',         'vacuna'),
  (3, 'Alimentos',       'alimento'),
  (4, 'Accesorios',      'accesorio'),
  (5, 'Material médico', 'insumo');

INSERT INTO inventario.proveedores (id, nombre, nit, contacto, telefono, email) VALUES
  (1, 'Distribuidora VetAndina', '900123456-1', 'Sandra Gómez', '6017778899', 'ventas@vetandina.com'),
  (2, 'Alimentos Patitas S.A.S', '901987654-2', 'Jorge Ruiz',   '6014445566', 'pedidos@patitas.com');

INSERT INTO inventario.ubicaciones_inventario (id, sede_id, nombre, tipo) VALUES
  (1, 1, 'Bodega principal', 'bodega'),
  (2, 1, 'Farmacia',         'farmacia'),
  (3, 1, 'Quirófano',        'quirofano'),
  (4, 2, 'Bodega norte',     'bodega');

-- La cantidad arranca en 0: los movimientos de más abajo la dejan en su
-- valor real, que es como funcionará el inventario de aquí en adelante.
INSERT INTO inventario.productos (id, categoria_id, proveedor_id, nombre, sku, unidad, stock_minimo, precio_compra, precio_venta, requiere_lote) VALUES
  (1, 1, 1, 'Amoxicilina 250 mg x 20 tabletas', 'MED-AMX-250', 'caja',   10, 18000, 32000, 1),
  (2, 1, 1, 'Meloxicam 1.5 mg/ml x 10 ml',      'MED-MLX-15',  'frasco', 10, 24000, 41000, 1),
  (3, 2, 1, 'Vacuna polivalente canina',        'VAC-POLI-C',  'dosis',   8, 22000, 40000, 1),
  (4, 3, 2, 'Alimento balanceado premium 3 kg', 'ALI-PREM-3',  'bulto',   5, 42000, 68000, 0),
  (5, 4, 2, 'Correa y arnés ajustable',         'ACC-ARN-01',  'unidad',  4, 26000, 45000, 0),
  (6, 5, 1, 'Jeringa 3 ml x 100 unidades',      'MAT-JER-3',   'caja',   10, 35000, 55000, 1),
  (7 , 3, 2, 'Hill''s Science Diet Kitten pollo 1,6 kg'           , 'ALI-HSD-KIT16', 'bolsa' , 3, 62000 , 89000 , 0),
  (8 , 3, 2, 'Hill''s Science Diet Indoor gato adulto 1,6 kg'     , 'ALI-HSD-IND16', 'bolsa' , 3, 64000 , 92000 , 0),
  (9 , 3, 2, 'Royal Canin Mother & Babycat 1,5 kg'                , 'ALI-RC-MBC15' , 'bolsa' , 3, 68000 , 97000 , 0),
  (10, 3, 2, 'Royal Canin Kitten Sterilised 1,5 kg'               , 'ALI-RC-KST15' , 'bolsa' , 3, 70000 , 99000 , 0),
  (11, 3, 2, 'Royal Canin X-Small Puppy 4 kg'                     , 'ALI-RC-XSP4'  , 'bolsa' , 3, 98000 , 139000, 0),
  (12, 3, 2, 'Pro Plan Medium Puppy Sensitive Skin 12 kg'         , 'ALI-PPL-MPS12', 'bulto' , 3, 165000, 229000, 0),
  (13, 3, 2, 'Pro Plan Veterinary Diets HA Hydrolyzed 2,7 kg'     , 'ALI-PPL-HA27' , 'bolsa' , 3, 145000, 198000, 0),
  (14, 3, 2, 'Nulo Freestyle Adult Trim perro 2 kg'               , 'ALI-NUL-DAT2' , 'bolsa' , 3, 88000 , 125000, 0),
  (15, 3, 2, 'Nulo Freestyle Adult Trim gato 1,6 kg'              , 'ALI-NUL-CAT16', 'bolsa' , 3, 84000 , 119000, 0),
  (16, 3, 2, 'Agility Gold Grandes Adultos 15 kg'                 , 'ALI-AGY-GA15' , 'bulto' , 3, 118000, 164000, 0),
  (17, 4, 2, 'KONG Classic rellenable talla XL'                   , 'JUG-KON-XL'   , 'unidad', 3, 42000 , 62000 , 0),
  (18, 4, 2, 'Chuckit! Ultra Ball pequeña x2'                     , 'JUG-CHK-UB2'  , 'par'   , 3, 28000 , 42000 , 0),
  (19, 4, 2, 'Nylabone set de 6 huesos masticables'               , 'JUG-NYL-6'    , 'set'   , 3, 46000 , 68000 , 0),
  (20, 4, 2, 'Cuerda de algodón con nudos 45 cm'                  , 'JUG-CUE-45'   , 'unidad', 3, 12000 , 22000 , 0),
  (21, 4, 2, 'Tapete olfativo antiansiedad'                       , 'JUG-TAP-OLF'  , 'unidad', 3, 48000 , 72000 , 0),
  (22, 4, 2, 'JW Hol-ee Roller pelota de caucho'                  , 'JUG-JW-HOL'   , 'unidad', 3, 22000 , 35000 , 0),
  (23, 4, 2, 'Varita con plumas para gato y 8 repuestos'          , 'JUG-VAR-PLU'  , 'set'   , 3, 16000 , 28000 , 0),
  (24, 4, 2, 'Puntero láser LED recargable para gato'             , 'JUG-LAS-LED'  , 'unidad', 3, 18000 , 32000 , 0),
  (25, 4, 2, 'Ratones de yute con catnip x2'                      , 'JUG-RAT-YUT'  , 'par'   , 3, 9000  , 18000 , 0),
  (26, 4, 2, 'Túnel plegable de dos vías'                         , 'JUG-TUN-2V'   , 'unidad', 3, 38000 , 58000 , 0),
  (27, 4, 2, 'Rascador de cartón tipo lounge'                     , 'JUG-RAS-LOU'  , 'unidad', 3, 44000 , 66000 , 0),
  (28, 4, 2, 'Torre de bolas de tres niveles'                     , 'JUG-TOR-3N'   , 'unidad', 3, 34000 , 52000 , 0),
  (29, 4, 2, 'Almohadas de catnip x3'                             , 'JUG-ALM-CAT3' , 'set'   , 3, 15000 , 26000 , 0),
  (30, 4, 2, 'Espirales de plástico para gato x10'                , 'JUG-ESP-10'   , 'set'   , 3, 8000  , 16000 , 0),
  (31, 4, 2, 'Arnés antiescape para gato con correa'              , 'ACC-ARN-GAT'  , 'set'   , 3, 32000 , 49000 , 0),
  (32, 4, 2, 'Collar para gato con cascabel y broche de seguridad', 'ACC-COL-GAT'  , 'unidad', 3, 9000  , 17000 , 0),
  (33, 4, 2, 'Cinturón de paseo manos libres con correa elástica' , 'ACC-CIN-ML'   , 'set'   , 3, 38000 , 58000 , 0),
  (34, 4, 2, 'Correa elástica reflectiva con manija acolchada'    , 'ACC-COR-REF'  , 'unidad', 3, 30000 , 46000 , 0),
  (35, 4, 2, 'Correa retráctil de cordón 5 m'                     , 'ACC-COR-RET5' , 'unidad', 3, 40000 , 62000 , 0),
  (36, 4, 2, 'Cama iglú para gato'                                , 'CAM-IGL-GAT'  , 'unidad', 3, 52000 , 78000 , 0),
  (37, 4, 2, 'Cama redonda acolchada estampada'                   , 'CAM-RED-EST'  , 'unidad', 3, 46000 , 69000 , 0),
  (38, 4, 2, 'Cama dona de pelo largo'                            , 'CAM-DON-PEL'  , 'unidad', 3, 58000 , 86000 , 0),
  (39, 4, 2, 'Cama elevada tipo catre'                            , 'CAM-ELE-CAT'  , 'unidad', 3, 44000 , 68000 , 0),
  (40, 4, 2, 'Cama dona antiestrés para perro grande'             , 'CAM-DON-GDE'  , 'unidad', 3, 78000 , 115000, 0),
  (41, 4, 2, 'Cama sofá rectangular lavable'                      , 'CAM-SOF-REC'  , 'unidad', 3, 68000 , 98000 , 0);

INSERT INTO inventario.lotes (id, producto_id, codigo, fecha_vencimiento, precio_compra) VALUES
  (1, 1, 'AMX-2411',  (CURRENT_DATE + INTERVAL '14 months')::date, 18000),
  (2, 2, 'MLX-2409',  (CURRENT_DATE + INTERVAL '8 months')::date,  24000),
  (3, 3, 'POLI-2501', (CURRENT_DATE + INTERVAL '10 months')::date, 22000),
  (4, 6, 'JER-2408',  (CURRENT_DATE + INTERVAL '2 months')::date,  35000);

INSERT INTO inventario.compras (id, proveedor_id, sede_id, usuario_id, numero, fecha, subtotal, impuestos, total, estado) VALUES
  (1, 1, 1, 1, 'COM-2026-0001', (CURRENT_DATE - INTERVAL '20 days')::date, 1567000, 297730, 1864730, 'recibida'),
  (2, 2, 1, 1, 'COM-2026-0002', (CURRENT_DATE - INTERVAL '10 days')::date,  984000, 186960, 1170960, 'recibida');

INSERT INTO inventario.detalle_compras (compra_id, producto_id, lote_id, cantidad, precio_unit, total_linea) VALUES
  (1, 1, 1, 40, 18000, 720000),
  (1, 2, 2,  8, 24000, 192000),
  (1, 3, 3, 25, 22000, 550000),
  (1, 6, 4,  3, 35000, 105000),
  (2, 4, NULL, 16, 42000, 672000),
  (2, 5, NULL, 12, 26000, 312000);

-- Los movimientos son los que dejan el stock en su sitio (el disparador
-- actualiza productos.cantidad y existencias).
INSERT INTO inventario.movimientos_inventario (producto_id, ubicacion_id, lote_id, usuario_id, tipo, cantidad, motivo, referencia) VALUES
  (1, 2, 1,    1, 'entrada', 40, 'Compra a proveedor', 'COM-2026-0001'),
  (2, 2, 2,    1, 'entrada',  8, 'Compra a proveedor', 'COM-2026-0001'),
  (3, 2, 3,    1, 'entrada', 25, 'Compra a proveedor', 'COM-2026-0001'),
  (6, 1, 4,    1, 'entrada',  3, 'Compra a proveedor', 'COM-2026-0001'),
  (4, 1, NULL, 1, 'entrada', 16, 'Compra a proveedor', 'COM-2026-0002'),
  (5, 1, NULL, 1, 'entrada', 12, 'Compra a proveedor', 'COM-2026-0002'),
  (7 , 1, NULL, 1, 'entrada', 14, 'Carga inicial del catálogo en línea', 'INV-TIENDA-01'),
  (8 , 1, NULL, 1, 'entrada', 12, 'Carga inicial del catálogo en línea', 'INV-TIENDA-01'),
  (9 , 1, NULL, 1, 'entrada', 10, 'Carga inicial del catálogo en línea', 'INV-TIENDA-01'),
  (10, 1, NULL, 1, 'entrada', 9 , 'Carga inicial del catálogo en línea', 'INV-TIENDA-01'),
  (11, 1, NULL, 1, 'entrada', 8 , 'Carga inicial del catálogo en línea', 'INV-TIENDA-01'),
  (12, 1, NULL, 1, 'entrada', 6 , 'Carga inicial del catálogo en línea', 'INV-TIENDA-01'),
  (13, 1, NULL, 1, 'entrada', 5 , 'Carga inicial del catálogo en línea', 'INV-TIENDA-01'),
  (14, 1, NULL, 1, 'entrada', 7 , 'Carga inicial del catálogo en línea', 'INV-TIENDA-01'),
  (15, 1, NULL, 1, 'entrada', 7 , 'Carga inicial del catálogo en línea', 'INV-TIENDA-01'),
  (16, 1, NULL, 1, 'entrada', 6 , 'Carga inicial del catálogo en línea', 'INV-TIENDA-01'),
  (17, 1, NULL, 1, 'entrada', 10, 'Carga inicial del catálogo en línea', 'INV-TIENDA-01'),
  (18, 1, NULL, 1, 'entrada', 14, 'Carga inicial del catálogo en línea', 'INV-TIENDA-01'),
  (19, 1, NULL, 1, 'entrada', 8 , 'Carga inicial del catálogo en línea', 'INV-TIENDA-01'),
  (20, 1, NULL, 1, 'entrada', 20, 'Carga inicial del catálogo en línea', 'INV-TIENDA-01'),
  (21, 1, NULL, 1, 'entrada', 7 , 'Carga inicial del catálogo en línea', 'INV-TIENDA-01'),
  (22, 1, NULL, 1, 'entrada', 12, 'Carga inicial del catálogo en línea', 'INV-TIENDA-01'),
  (23, 1, NULL, 1, 'entrada', 16, 'Carga inicial del catálogo en línea', 'INV-TIENDA-01'),
  (24, 1, NULL, 1, 'entrada', 15, 'Carga inicial del catálogo en línea', 'INV-TIENDA-01'),
  (25, 1, NULL, 1, 'entrada', 22, 'Carga inicial del catálogo en línea', 'INV-TIENDA-01'),
  (26, 1, NULL, 1, 'entrada', 9 , 'Carga inicial del catálogo en línea', 'INV-TIENDA-01'),
  (27, 1, NULL, 1, 'entrada', 8 , 'Carga inicial del catálogo en línea', 'INV-TIENDA-01'),
  (28, 1, NULL, 1, 'entrada', 11, 'Carga inicial del catálogo en línea', 'INV-TIENDA-01'),
  (29, 1, NULL, 1, 'entrada', 18, 'Carga inicial del catálogo en línea', 'INV-TIENDA-01'),
  (30, 1, NULL, 1, 'entrada', 24, 'Carga inicial del catálogo en línea', 'INV-TIENDA-01'),
  (31, 1, NULL, 1, 'entrada', 12, 'Carga inicial del catálogo en línea', 'INV-TIENDA-01'),
  (32, 1, NULL, 1, 'entrada', 25, 'Carga inicial del catálogo en línea', 'INV-TIENDA-01'),
  (33, 1, NULL, 1, 'entrada', 9 , 'Carga inicial del catálogo en línea', 'INV-TIENDA-01'),
  (34, 1, NULL, 1, 'entrada', 13, 'Carga inicial del catálogo en línea', 'INV-TIENDA-01'),
  (35, 1, NULL, 1, 'entrada', 10, 'Carga inicial del catálogo en línea', 'INV-TIENDA-01'),
  (36, 1, NULL, 1, 'entrada', 8 , 'Carga inicial del catálogo en línea', 'INV-TIENDA-01'),
  (37, 1, NULL, 1, 'entrada', 9 , 'Carga inicial del catálogo en línea', 'INV-TIENDA-01'),
  (38, 1, NULL, 1, 'entrada', 10, 'Carga inicial del catálogo en línea', 'INV-TIENDA-01'),
  (39, 1, NULL, 1, 'entrada', 7 , 'Carga inicial del catálogo en línea', 'INV-TIENDA-01'),
  (40, 1, NULL, 1, 'entrada', 6 , 'Carga inicial del catálogo en línea', 'INV-TIENDA-01'),
  (41, 1, NULL, 1, 'entrada', 7 , 'Carga inicial del catálogo en línea', 'INV-TIENDA-01');


-- =====================================================================
--  FACTURACION
--  Una factura pagada de la consulta de Luna y otra pendiente.
-- =====================================================================

INSERT INTO facturacion.facturas (id, numero, sede_id, cliente_id, cita_id, consulta_id, usuario_id, fecha, subtotal, descuento, impuestos, total, estado) VALUES
  (1, 'FAC-2026-0001', 1, 1, 1, 1, 1, (CURRENT_DATE - INTERVAL '1 month')::date,  92000, 0, 6080, 98080, 'pendiente'),
  (2, 'FAC-2026-0002', 1, 2, 2, 2, 1, (CURRENT_DATE - INTERVAL '2 months')::date, 60000, 0,    0, 60000, 'pendiente');

INSERT INTO facturacion.detalle_facturas (factura_id, servicio_id, producto_id, examen_id, descripcion, cantidad, precio_unit, descuento, impuesto, total_linea) VALUES
  (1, 1,    NULL, NULL, 'Consulta veterinaria',              1, 60000, 0,    0, 60000),
  (1, NULL, 1,    NULL, 'Amoxicilina 250 mg x 20 tabletas',  1, 32000, 0, 6080, 38080),
  (2, 1,    NULL, NULL, 'Consulta veterinaria',              1, 60000, 0,    0, 60000);

-- El disparador de pagos deja la factura 1 en 'pagada'.
INSERT INTO facturacion.pagos (factura_id, usuario_id, metodo, valor, referencia) VALUES
  (1, 1, 'efectivo', 98080, 'Caja sede principal');


-- =====================================================================
--  COMUNICACION
-- =====================================================================

INSERT INTO comunicacion.plantillas_notificaciones (id, codigo, canal, asunto, cuerpo) VALUES
  (1, 'cita_creada',     'sistema', 'Tu cita quedó reservada',
      'Hola {{cliente}}: la cita de {{mascota}} quedó reservada para el {{fecha}} a las {{hora}} con {{veterinario}}.'),
  (2, 'cita_confirmada', 'sistema', 'Cita confirmada',
      'La cita de {{mascota}} del {{fecha}} a las {{hora}} está confirmada. Te esperamos.'),
  (3, 'cita_cancelada',  'sistema', 'Cita cancelada',
      'La cita de {{mascota}} del {{fecha}} a las {{hora}} fue cancelada.'),
  (4, 'cita_recordatorio','sistema','Recuerda tu cita de mañana',
      'Te recordamos la cita de {{mascota}} mañana {{fecha}} a las {{hora}}.'),
  (5, 'vacuna_proxima',  'sistema', 'Refuerzo de vacuna próximo',
      '{{mascota}} necesita el refuerzo de {{vacuna}} el {{fecha}}. Agenda la cita cuando quieras.'),
  (6, 'stock_bajo',      'sistema', 'Producto por agotarse',
      'El producto {{producto}} está en {{cantidad}} unidades, por debajo del mínimo.');

INSERT INTO comunicacion.notificaciones (usuario_id, plantilla_id, tipo, titulo, mensaje, enlace, leida) VALUES
  (6, 5, 'vacuna_proxima', 'Refuerzo de vacuna próximo',
      'Luna necesita el refuerzo de la Polivalente (Séxtuple) en menos de un mes.', 'cliente/mascotas.html', 0),
  (6, 2, 'cita_confirmada', 'Cita confirmada',
      'La cita de Luna quedó confirmada. Te esperamos en la sede principal.', 'cliente/citas.html', 0),
  (1, 6, 'stock_bajo', 'Productos por agotarse',
      'Hay dos productos por debajo del stock mínimo.', 'admin/dashboard.html', 0);

INSERT INTO comunicacion.recordatorios (usuario_id, mascota_id, cita_id, tipo, canal, programado_en, estado, mensaje)
SELECT 6, 1, 3, 'cita', 'sistema', c.inicio - INTERVAL '24 hours', 'pendiente',
       'Recuerda la cita de Luna mañana a las 9:00 a.m.'
  FROM agenda.citas c WHERE c.id = 3;

INSERT INTO comunicacion.recordatorios (usuario_id, mascota_id, aplicacion_id, tipo, canal, programado_en, estado, mensaje)
SELECT 6, 1, av.id, 'vacuna', 'sistema', av.proxima_fecha - INTERVAL '7 days', 'pendiente',
       'Se acerca el refuerzo de la vacuna de Luna.'
  FROM historia_clinica.aplicaciones_vacunas av
 WHERE av.mascota_id = 1 AND av.vacuna_id = 1;


-- =====================================================================
--  URGENCIAS
-- =====================================================================

INSERT INTO urgencias.salas_urgencias (id, sede_id, nombre, tipo, capacidad) VALUES
  (1, 1, 'Triage',            'valoracion',  2),
  (2, 1, 'Sala de shock',     'reanimacion', 1),
  (3, 1, 'Observación',       'observacion', 4),
  (4, 1, 'Aislamiento',       'aislamiento', 2),
  (5, 2, 'Triage norte',      'valoracion',  1);


-- =====================================================================
--  HOSPITALIZACION · habitaciones y jaulas
-- =====================================================================

INSERT INTO historia_clinica.habitaciones (id, sede_id, codigo, nombre, tipo, tamano, aislamiento, estado) VALUES
  (1, 1, 'J-01', 'Jaula 1',          'jaula',       'pequeno', 0, 'disponible'),
  (2, 1, 'J-02', 'Jaula 2',          'jaula',       'pequeno', 0, 'disponible'),
  (3, 1, 'J-03', 'Jaula 3',          'jaula',       'mediano', 0, 'disponible'),
  (4, 1, 'J-04', 'Jaula 4',          'jaula',       'mediano', 0, 'disponible'),
  (5, 1, 'J-05', 'Jaula 5',          'jaula',       'grande',  0, 'disponible'),
  (6, 1, 'UCI-1','Cuidados intensivos','uci',       'mediano', 0, 'disponible'),
  (7, 1, 'AIS-1','Aislamiento 1',    'aislamiento', 'mediano', 1, 'disponible'),
  (8, 1, 'HAB-1','Habitación felina','habitacion',  'pequeno', 0, 'disponible'),
  (9, 2, 'J-N1', 'Jaula norte 1',    'jaula',       'mediano', 0, 'disponible');


-- =====================================================================
--  HISTORIA CLINICA AVANZADA
-- =====================================================================

-- Porte de las razas: es lo que decide qué curva de crecimiento aplica.
UPDATE mascotas.razas SET porte = 'pequeno'
 WHERE nombre IN ('Chihuahua','Pug','Yorkshire Terrier','Poodle','Bulldog Francés','Schnauzer');
UPDATE mascotas.razas SET porte = 'grande'
 WHERE nombre IN ('Labrador Retriever','Golden Retriever','Pastor Alemán','Husky Siberiano','Pitbull');
UPDATE mascotas.razas SET porte = 'pequeno' WHERE especie_id IN (2,3,4,5,6);

-- Curva de referencia del perro mediano y del gato, que es lo que cubre a la
-- inmensa mayoría de los pacientes. Los demás portes se cargan igual cuando
-- hagan falta.
INSERT INTO mascotas.referencias_crecimiento (especie_id, porte, sexo, edad_meses, peso_min_kg, peso_ideal_kg, peso_max_kg) VALUES
  (1, 'mediano', 'desconocido',   2,  2.50,  3.50,  4.50),
  (1, 'mediano', 'desconocido',   4,  6.00,  8.00, 10.00),
  (1, 'mediano', 'desconocido',   6,  9.00, 12.00, 15.00),
  (1, 'mediano', 'desconocido',   9, 12.00, 15.50, 19.00),
  (1, 'mediano', 'desconocido',  12, 14.00, 18.00, 22.00),
  (1, 'mediano', 'desconocido',  24, 15.00, 19.00, 23.00),
  (1, 'grande',  'desconocido',   2,  4.00,  6.00,  8.00),
  (1, 'grande',  'desconocido',   6, 16.00, 21.00, 26.00),
  (1, 'grande',  'desconocido',  12, 25.00, 31.00, 38.00),
  (1, 'grande',  'desconocido',  24, 27.00, 33.00, 40.00),
  (1, 'pequeno', 'desconocido',   2,  1.00,  1.60,  2.20),
  (1, 'pequeno', 'desconocido',   6,  3.00,  4.20,  5.50),
  (1, 'pequeno', 'desconocido',  12,  4.00,  5.50,  7.00),
  (2, 'pequeno', 'desconocido',   2,  0.80,  1.10,  1.40),
  (2, 'pequeno', 'desconocido',   6,  2.20,  2.90,  3.60),
  (2, 'pequeno', 'desconocido',  12,  3.20,  4.20,  5.40),
  (2, 'pequeno', 'desconocido',  24,  3.50,  4.50,  5.80);

INSERT INTO historia_clinica.antecedentes (mascota_id, tipo, descripcion, fecha, relevante, registrado_por) VALUES
  (1, 'quirurgico', 'Ovariohisterectomía electiva sin complicaciones.', (CURRENT_DATE - INTERVAL '18 months')::date, 1, 2),
  (1, 'habitat',    'Vive en apartamento, sale a caminar dos veces al día.', NULL, 0, 2),
  (3, 'medico',     'Displasia de cadera diagnosticada hace dos años, en manejo conservador.', (CURRENT_DATE - INTERVAL '2 years')::date, 1, 2),
  (3, 'familiar',   'La madre también presentó displasia de cadera.', NULL, 0, 2);

INSERT INTO historia_clinica.reacciones_medicamentosas (mascota_id, medicamento_id, descripcion, severidad, fecha, desenlace, registrado_por) VALUES
  (3, 1, 'Edema facial y urticaria a los 20 minutos de aplicar penicilina.', 'grave',
      (CURRENT_DATE - INTERVAL '3 years')::date, 'recuperado', 2);

INSERT INTO historia_clinica.evoluciones (mascota_id, consulta_id, veterinario_id, fecha, subjetivo, objetivo, analisis, plan, estado_paciente) VALUES
  (1, 1, 1, (CURRENT_DATE - INTERVAL '25 days')::date + TIME '10:00:00',
      'La dueña refiere que dejó de rascarse a los tres días de iniciar el tratamiento.',
      'Lesiones costrosas en resolución, sin eritema activo. Sin pulgas al peinado.',
      'Buena respuesta al manejo del prurito y al control de pulgas.',
      'Suspender corticoide. Mantener antipulgas mensual. Control en tres meses.',
      'recuperado');

-- --- Esquemas de vacunación ------------------------------------------
INSERT INTO historia_clinica.esquemas_vacunacion (id, especie_id, nombre, descripcion) VALUES
  (1, 1, 'Cachorro canino',  'Plan completo desde las 6 semanas hasta el año'),
  (2, 1, 'Adulto canino',    'Refuerzos anuales del perro adulto'),
  (3, 2, 'Gatito',           'Plan completo desde las 8 semanas'),
  (4, 2, 'Adulto felino',    'Refuerzos anuales del gato adulto');

INSERT INTO historia_clinica.esquema_dosis (esquema_id, vacuna_id, orden, edad_semanas, intervalo_semanas, obligatoria, notas) VALUES
  (1, 1, 1,  6, NULL, 1, 'Primera dosis de polivalente'),
  (1, 1, 2, NULL,  3, 1, 'Segunda dosis, tres semanas después'),
  (1, 1, 3, NULL,  3, 1, 'Tercera dosis, tres semanas después'),
  (1, 4, 4, 12, NULL, 0, 'Leptospirosis, según riesgo de la zona'),
  (1, 2, 5, 16, NULL, 1, 'Rabia, a partir de los cuatro meses'),
  (1, 3, 6, 16, NULL, 0, 'Tos de las perreras, si convive con otros perros'),
  (2, 1, 1, NULL, 52, 1, 'Refuerzo anual de polivalente'),
  (2, 2, 2, NULL, 52, 1, 'Refuerzo anual de rabia'),
  (3, 5, 1,  8, NULL, 1, 'Primera dosis de triple felina'),
  (3, 5, 2, NULL,  3, 1, 'Segunda dosis'),
  (3, 7, 3, 12, NULL, 0, 'Leucemia felina, previa prueba'),
  (3, 6, 4, 16, NULL, 1, 'Rabia felina'),
  (4, 5, 1, NULL, 52, 1, 'Refuerzo anual de triple felina'),
  (4, 6, 2, NULL, 52, 1, 'Refuerzo anual de rabia felina');

-- --- Desparasitación --------------------------------------------------
INSERT INTO historia_clinica.productos_antiparasitarios (id, nombre, principio_activo, tipo, presentacion, via, especie_id, intervalo_meses) VALUES
  (1, 'Praziquantel + Pirantel', 'Praziquantel, pirantel', 'interna', 'Tableta',  'oral',       1, 3),
  (2, 'Fenbendazol',             'Fenbendazol',            'interna', 'Suspensión','oral',      NULL, 3),
  (3, 'Fipronil spot-on',        'Fipronil',               'externa', 'Pipeta',   'topica',     1, 1),
  (4, 'Selamectina',             'Selamectina',            'mixta',   'Pipeta',   'topica',     NULL, 1),
  (5, 'Collar antipulgas',       'Imidacloprid, flumetrina','externa','Collar',   'topica',     1, 8),
  (6, 'Praziquantel felino',     'Praziquantel',           'interna', 'Tableta',  'oral',       2, 3);

INSERT INTO historia_clinica.desparasitaciones (mascota_id, antiparasitario_id, consulta_id, veterinario_id, tipo, producto, dosis, peso_kg, fecha, proxima_fecha, observaciones) VALUES
  (1, 1, 1,    1, 'interna', 'Praziquantel + Pirantel', '1 tableta por 10 kg', 18.40,
      (CURRENT_DATE - INTERVAL '1 month')::date, (CURRENT_DATE + INTERVAL '2 months')::date, 'Bien tolerada'),
  (1, 3, NULL, 1, 'externa', 'Fipronil spot-on',        '1 pipeta',            18.40,
      (CURRENT_DATE - INTERVAL '1 month')::date, (CURRENT_DATE - INTERVAL '2 days')::date,  'Control mensual de pulgas'),
  (3, 1, 2,    1, 'interna', 'Praziquantel + Pirantel', '1 tableta por 10 kg', 24.10,
      (CURRENT_DATE - INTERVAL '4 months')::date, (CURRENT_DATE - INTERVAL '1 month')::date, NULL),
  (2, 6, NULL, 3, 'interna', 'Praziquantel felino',     'Media tableta',        4.20,
      (CURRENT_DATE - INTERVAL '2 months')::date, (CURRENT_DATE + INTERVAL '1 month')::date, NULL);


-- =====================================================================
--  LABORATORIO
-- =====================================================================

INSERT INTO laboratorio.parametros_laboratorio (id, tipo_examen_id, codigo, nombre, unidad, orden, decimales) VALUES
  (1,  1, 'HTO',  'Hematocrito',   '%',        1, 1),
  (2,  1, 'HB',   'Hemoglobina',   'g/dl',     2, 1),
  (3,  1, 'GB',   'Leucocitos',    '/µl',      3, 0),
  (4,  1, 'NEU',  'Neutrófilos',   '/µl',      4, 0),
  (5,  1, 'EOS',  'Eosinófilos',   '/µl',      5, 0),
  (6,  1, 'PLT',  'Plaquetas',     'x10³/µl',  6, 0),
  (7,  2, 'CREA', 'Creatinina',    'mg/dl',    1, 2),
  (8,  2, 'BUN',  'Nitrógeno ureico','mg/dl',  2, 1),
  (9,  2, 'ALT',  'ALT',           'U/l',      3, 0),
  (10, 2, 'FA',   'Fosfatasa alcalina','U/l',  4, 0),
  (11, 2, 'GLU',  'Glucosa',       'mg/dl',    5, 0),
  (12, 2, 'ALB',  'Albúmina',      'g/dl',     6, 1),
  (13, 4, 'DENS', 'Densidad urinaria','',      1, 3),
  (14, 4, 'PH',   'pH urinario',   '',         2, 1),
  (15, 3, 'PARAS','Parásitos',     '',         1, 0);

-- Rangos de referencia. Los que cambian por especie llevan especie_id; los
-- que no, valen para cualquiera.
INSERT INTO laboratorio.rangos_referencia (parametro_id, especie_id, valor_min, valor_max) VALUES
  (1,  1, 37.0, 55.0),   (1,  2, 30.0, 45.0),
  (2,  1, 12.0, 18.0),   (2,  2, 10.0, 15.0),
  (3,  1, 6000, 17000),  (3,  2, 5500, 19500),
  (4,  1, 3000, 11500),  (4,  2, 2500, 12500),
  (5,  1, 100,  1250),   (5,  2, 100,  1500),
  (6,  1, 200,  500),    (6,  2, 300,  800),
  (7,  1, 0.50, 1.50),   (7,  2, 0.80, 2.40),
  (8,  1, 7.0,  27.0),   (8,  2, 16.0, 36.0),
  (9,  1, 10,   100),    (9,  2, 20,   100),
  (10, 1, 20,   150),    (10, 2, 10,   90),
  (11, 1, 70,   120),    (11, 2, 70,   150),
  (12, 1, 2.3,  3.8),    (12, 2, 2.4,  3.9),
  (13, NULL, 1.015, 1.045),
  (14, NULL, 5.5, 7.5);

INSERT INTO laboratorio.ordenes_laboratorio (id, numero, mascota_id, consulta_id, veterinario_id, sede_id, fecha, prioridad, estado, indicaciones, ayuno) VALUES
  (1, 'LAB-2026-0001', 1, 1, 1, 1, (CURRENT_DATE - INTERVAL '1 month')::date + TIME '09:20:00',
      'normal', 'completada', 'Control por cuadro alérgico', 0);

INSERT INTO laboratorio.orden_laboratorio_items (orden_id, tipo_examen_id, examen_id) VALUES
  (1, 1, 2);

INSERT INTO laboratorio.muestras (orden_id, codigo, tipo, tomada_por, tomada_en, recibida_en, estado) VALUES
  (1, 'M-2026-0001', 'sangre', 2,
     (CURRENT_DATE - INTERVAL '1 month')::date + TIME '09:25:00',
     (CURRENT_DATE - INTERVAL '1 month')::date + TIME '09:40:00', 'recibida');

-- El hemograma de ejemplo ya tenía resultados: se enlazan con el catálogo de
-- parámetros para que la gráfica de evolución los pueda seguir en el tiempo.
UPDATE historia_clinica.resultados_examenes r
   SET parametro_id = p.id,
       valor_numerico = NULLIF(regexp_replace(r.valor, '[^0-9.\-]', '', 'g'), '')::numeric
  FROM laboratorio.parametros_laboratorio p
 WHERE p.tipo_examen_id = 1 AND p.nombre = r.parametro AND r.examen_id = 2;

UPDATE historia_clinica.examenes
   SET estado = 'validado', validado_por = 2, validado_en = fecha_resultado + TIME '11:00:00',
       orden_id = 1
 WHERE id = 2;


-- =====================================================================
--  FARMACIA
-- =====================================================================

-- Los que exigen fórmula y libro de registro.
UPDATE historia_clinica.medicamentos SET restringido = 1 WHERE nombre IN ('Prednisolona');
UPDATE historia_clinica.medicamentos SET requiere_receta = 0 WHERE nombre IN ('Condroitina');

-- Interacciones más frecuentes en la clínica de pequeños animales. Es un
-- catálogo de avisos, no una prohibición automática.
INSERT INTO farmacia.interacciones_medicamentosas (principio_a, principio_b, severidad, efecto, recomendacion, fuente) VALUES
  ('Meloxicam', 'Prednisolona', 'grave',
   'Riesgo alto de úlcera y perforación gastrointestinal al sumar AINE y corticoide.',
   'No usar juntos. Dejar al menos 48 horas de lavado entre uno y otro.', 'Plumb''s Veterinary Drug Handbook'),
  ('Meloxicam', 'Furosemida', 'moderada',
   'El AINE reduce el efecto diurético y aumenta el riesgo renal.',
   'Vigilar creatinina e hidratación si deben usarse a la vez.', 'Plumb''s Veterinary Drug Handbook'),
  ('Amoxicilina', 'Doxiciclina', 'moderada',
   'El bacteriostático puede restar eficacia al betalactámico.',
   'Evitar la combinación salvo indicación expresa.', 'BSAVA Formulary'),
  ('Ivermectina', 'Ketoconazol', 'grave',
   'El ketoconazol inhibe la glicoproteína P y eleva la ivermectina en sistema nervioso.',
   'Contraindicado en razas con mutación MDR1. Reducir dosis y vigilar.', 'BSAVA Formulary'),
  ('Omeprazol', 'Ketoconazol', 'moderada',
   'Al subir el pH gástrico se absorbe menos ketoconazol.',
   'Separar las tomas al menos dos horas.', 'Plumb''s Veterinary Drug Handbook'),
  ('Metronidazol', 'Fenobarbital', 'leve',
   'El fenobarbital acelera el metabolismo del metronidazol.',
   'Puede requerir ajuste de dosis en tratamientos largos.', 'BSAVA Formulary');

INSERT INTO farmacia.recetas (id, numero, mascota_id, cliente_id, veterinario_id, consulta_id, tratamiento_id, sede_id, fecha, vigente_hasta, estado, indicaciones) VALUES
  (1, 'REC-2026-0001', 1, 1, 1, 1, 1, 1,
      (CURRENT_DATE - INTERVAL '1 month')::date + TIME '09:35:00',
      (CURRENT_DATE - INTERVAL '1 month')::date + INTERVAL '30 days',
      'dispensada', 'Administrar con alimento. Suspender si hay vómito.'),
  (2, 'REC-2026-0002', 3, 2, 1, 2, 2, 1,
      (CURRENT_DATE - INTERVAL '2 months')::date + TIME '10:30:00',
      (CURRENT_DATE + INTERVAL '4 months')::date,
      'emitida', 'Tratamiento crónico. Repetir la fórmula cada seis meses.');

INSERT INTO farmacia.receta_items (receta_id, medicamento_id, dosis, frecuencia, duracion, via, cantidad, dispensado, indicaciones) VALUES
  (1, 5, '0.5 mg/kg', 'Cada 24 horas', '5 días',     'oral', 5,  5, 'Dar por la mañana'),
  (1, 2, '0.1 mg/kg', 'Cada 24 horas', '3 días',     'oral', 3,  3, 'Después de comer'),
  (2, 7, '1 tableta', 'Cada 24 horas', 'Indefinido', 'oral', 60, 0, 'Con la comida principal');

INSERT INTO farmacia.dispensaciones (id, receta_id, cliente_id, mascota_id, factura_id, sede_id, entregado_por, recibe, fecha, estado) VALUES
  (1, 1, 1, 1, 1, 1, 1, 'Daniela Ortiz', (CURRENT_DATE - INTERVAL '1 month')::date + TIME '09:50:00', 'entregada');

INSERT INTO farmacia.dispensacion_items (dispensacion_id, receta_item_id, producto_id, lote_id, cantidad, precio_unit) VALUES
  (1, 2, 2, 2, 1, 41000);


-- =====================================================================
--  IMAGENOLOGIA
-- =====================================================================

INSERT INTO imagenes.estudios_imagen (id, numero, mascota_id, consulta_id, examen_id, solicitado_por, realizado_por, sede_id, modalidad, region, proyeccion, fecha, estado, sedacion, indicacion) VALUES
  (1, 'IMG-2026-0001', 3, 2, 1, 1, 3, 1, 'radiografia', 'Cadera', 'Ventrodorsal',
      (CURRENT_DATE - INTERVAL '2 months')::date + TIME '11:00:00', 'informado', 1,
      'Cojera crónica del miembro posterior izquierdo');

INSERT INTO imagenes.informes_imagen (estudio_id, radiologo_id, tecnica, hallazgos, conclusion, recomendaciones, estado, firmado_en) VALUES
  (1, 2, 'Proyección ventrodorsal con extensión de miembros posteriores, bajo sedación.',
      'Ángulo de Norberg disminuido en cadera izquierda (95°). Subluxación coxofemoral izquierda '
      'con remodelación del borde acetabular craneal. Cadera derecha dentro de límites normales.',
      'Displasia de cadera izquierda, grado moderado.',
      'Manejo conservador con control de peso y condroprotectores. Repetir control radiográfico en 12 meses.',
      'firmado', (CURRENT_DATE - INTERVAL '2 months')::date + TIME '12:00:00');


-- =====================================================================
--  NUTRICION
-- =====================================================================

INSERT INTO nutricion.tipos_alimento (id, nombre, marca, categoria, especie_id, kcal_por_100g, producto_id, indicaciones) VALUES
  (1, 'Adulto razas medianas',   'Patitas Premium', 'mantenimiento', 1, 365, 4,    'Mantenimiento del perro adulto sano'),
  (2, 'Cachorro crecimiento',    'Patitas Premium', 'cachorro',      1, 410, NULL, 'Desde el destete hasta los 12 meses'),
  (3, 'Senior articulaciones',   'Patitas Premium', 'senior',        1, 330, NULL, 'Perro mayor de 7 años, con condroprotectores'),
  (4, 'Light control de peso',   'Patitas Premium', 'light',         1, 290, NULL, 'Sobrepeso y obesidad'),
  (5, 'Gato adulto',             'Patitas Premium', 'mantenimiento', 2, 380, NULL, 'Mantenimiento del gato adulto'),
  (6, 'Renal veterinario',       'VetDiet',         'medicado',      NULL, 350, NULL, 'Enfermedad renal crónica, bajo prescripción');

INSERT INTO nutricion.evaluaciones_nutricionales (id, mascota_id, consulta_id, veterinario_id, fecha, peso_kg, peso_ideal_kg, condicion_corporal, actividad, requerimiento_kcal, diagnostico, observaciones) VALUES
  (1, 1, 1, 1, (CURRENT_DATE - INTERVAL '1 month')::date, 18.40, 18.00, 5, 'normal',  920, 'ideal',
      'Condición corporal adecuada. Mantener la ración actual.'),
  (2, 3, 2, 1, (CURRENT_DATE - INTERVAL '2 months')::date, 24.10, 22.00, 6, 'baja',  1000, 'sobrepeso',
      'Dos kilos por encima del peso ideal. Bajar peso ayuda a la cadera.');

INSERT INTO nutricion.planes_nutricionales (id, mascota_id, evaluacion_id, veterinario_id, objetivo, kcal_dia, gramos_dia, comidas_dia, fecha_inicio, peso_objetivo_kg, estado, indicaciones) VALUES
  (1, 1, 1, 1, 'mantener',   920, 250, 2, (CURRENT_DATE - INTERVAL '1 month')::date, 18.00, 'activo',
      'Pesar la ración. Sin premios de mesa.'),
  (2, 3, 2, 1, 'bajar_peso', 800, 275, 2, (CURRENT_DATE - INTERVAL '2 months')::date, 22.00, 'activo',
      'Reducción del 15 % del requerimiento. Control de peso cada tres semanas.');

INSERT INTO nutricion.plan_comidas (plan_id, alimento_id, hora, cantidad_g, orden) VALUES
  (1, 1, '07:00', 125, 1),
  (1, 1, '18:00', 125, 2),
  (2, 4, '07:00', 140, 1),
  (2, 4, '18:00', 135, 2);

INSERT INTO nutricion.restricciones_alimentarias (mascota_id, alergia_id, tipo, descripcion, severidad) VALUES
  (1, 2, 'alergia', 'Evitar alimentos con pollo como proteína principal.', 'moderada');


-- =====================================================================
--  COMUNIDAD · identidad digital, perdidas y adopciones
-- =====================================================================

INSERT INTO comunidad.identidades_mascota (mascota_id, token, mensaje) VALUES
  (1, 'hlt-luna-8f3a2c9d41', 'Si me encuentras, llama a mi familia. Soy muy sociable.'),
  (2, 'hlt-simon-5b7e1a6c22', 'Soy un gato casero y asustadizo, no me persigas: llama.'),
  (3, 'hlt-rocky-2d9c4f8b73', 'Tengo displasia de cadera, por favor no me hagas correr.');

INSERT INTO comunidad.publicaciones_adopcion
  (id, sede_id, nombre, especie_id, raza_id, sexo, edad_meses, porte, color, descripcion, historia,
   esterilizado, vacunas_al_dia, desparasitado, compatible_ninos, compatible_mascotas, estado) VALUES
  (1, 1, 'Nube',  2, (SELECT id FROM mascotas.razas WHERE nombre = 'Mestizo' AND especie_id = 2),
      'hembra', 5, 'pequeno', 'Blanca y gris',
      'Gatita tranquila, ideal para apartamento. Usa arenera desde el primer día.',
      'Llegó a la clínica con tres semanas, rescatada de un motor de carro.',
      1, 1, 1, 1, 1, 'disponible'),
  (2, 1, 'Canela', 1, (SELECT id FROM mascotas.razas WHERE nombre = 'Criollo' AND especie_id = 1),
      'hembra', 14, 'mediano', 'Café claro',
      'Muy noble y buena con niños. Camina bien con correa.',
      'La entregó una familia que se mudó fuera del país.',
      1, 1, 1, 1, 1, 'disponible'),
  (3, 1, 'Tomás', 1, (SELECT id FROM mascotas.razas WHERE nombre = 'Mestizo' AND especie_id = 1),
      'macho', 3, 'grande', 'Negro con blanco',
      'Cachorro juguetón, va a ser un perro grande. Necesita espacio.',
      'Rescatado con sus hermanos, ya todos adoptados menos él.',
      0, 1, 1, 1, 1, 'disponible');


-- =====================================================================
--  TIENDA EN LINEA
-- =====================================================================

INSERT INTO tienda.categorias_tienda (id, nombre, slug, icono, orden) VALUES
  (1, 'Alimento',         'alimento',         'icon-caja',   1),
  (2, 'Medicamentos',     'medicamentos',     'icon-shield', 2),
  (3, 'Accesorios',       'accesorios',       'icon-paw',    3),
  (4, 'Higiene',          'higiene',          'icon-drop',   4),
  (5, 'Material médico',  'material-medico',  'icon-cross',  5),
  (6, 'Juguetes',         'juguetes',         'icon-bone',   6),
  (7, 'Camas y descanso', 'camas-y-descanso', 'icon-house',  7);

INSERT INTO tienda.articulos_tienda (id, producto_id, categoria_id, nombre, slug, descripcion, requiere_receta, destacado) VALUES
  (1, 4, 1, 'Alimento balanceado premium 3 kg', 'alimento-balanceado-premium-3kg',
      'Alimento completo para perro adulto de raza mediana. Bolsa de 3 kg.', 0, 1),
  (2, 5, 3, 'Correa y arnés ajustable', 'correa-arnes-ajustable',
      'Arnés acolchado con correa de 1,2 m. Tallas S a L.', 0, 1),
  (3, 1, 2, 'Amoxicilina 250 mg x 20 tabletas', 'amoxicilina-250mg',
      'Antibiótico de amplio espectro. Requiere fórmula del veterinario tratante.', 1, 0),
  (4, 2, 2, 'Meloxicam 1.5 mg/ml x 10 ml', 'meloxicam-15mg-ml',
      'Antiinflamatorio no esteroideo en solución oral. Requiere fórmula.', 1, 0),
  (5, 6, 5, 'Jeringa 3 ml x 100 unidades', 'jeringa-3ml-x100',
      'Caja de 100 jeringas estériles desechables de 3 ml.', 0, 0);

-- Comida, juguetes, paseo y camas: son los que se ven en la tienda de la
-- página pública, cada uno con su foto en frontend/COMIDA Y ACCESO.
INSERT INTO tienda.articulos_tienda (id, producto_id, categoria_id, nombre, slug, descripcion, imagen, requiere_receta, destacado) VALUES
  (6 , 7 , 1, 'Hill''s Science Diet Kitten pollo 1,6 kg'           , 'hill-s-science-diet-kitten-pollo-1-6-kg'            , 'Alimento seco para gatitos hasta 1 año. Desarrollo del cerebro, la vista y las defensas.'      , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC1.jpg' , 0, 1),
  (7 , 8 , 1, 'Hill''s Science Diet Indoor gato adulto 1,6 kg'     , 'hill-s-science-diet-indoor-gato-adulto-1-6-kg'      , 'Para gatos de interior de 1 a 6 años. Digestión fácil y menos bolas de pelo.'                  , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC2.jpg' , 0, 0),
  (8 , 9 , 1, 'Royal Canin Mother & Babycat 1,5 kg'                , 'royal-canin-mother-babycat-1-5-kg'                  , 'Para la gata en gestación y el gatito hasta los 4 meses. Croqueta blanda, fácil de rehidratar.', 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC3.jpg' , 0, 0),
  (9 , 10, 1, 'Royal Canin Kitten Sterilised 1,5 kg'               , 'royal-canin-kitten-sterilised-1-5-kg'               , 'Gatitos esterilizados de 6 a 12 meses. Controla el peso sin frenar el crecimiento.'            , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC4.jpg' , 0, 0),
  (10, 11, 1, 'Royal Canin X-Small Puppy 4 kg'                     , 'royal-canin-x-small-puppy-4-kg'                     , 'Cachorros de razas muy pequeñas hasta los 10 meses. Croqueta diminuta para bocas pequeñas.'    , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC5.jpg' , 0, 0),
  (11, 12, 1, 'Pro Plan Medium Puppy Sensitive Skin 12 kg'         , 'pro-plan-medium-puppy-sensitive-skin-12-kg'         , 'Cachorro de raza mediana con piel sensible. Salmón como fuente principal de proteína.'         , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC6.jpg' , 0, 1),
  (12, 13, 1, 'Pro Plan Veterinary Diets HA Hydrolyzed 2,7 kg'     , 'pro-plan-veterinary-diets-ha-hydrolyzed-2-7-kg'     , 'Dieta veterinaria de proteína hidrolizada para perros con alergia alimentaria.'                , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC7.jpg' , 0, 0),
  (13, 14, 1, 'Nulo Freestyle Adult Trim perro 2 kg'               , 'nulo-freestyle-adult-trim-perro-2-kg'               , 'Alimento sin granos, alto en proteína, para perros adultos con sobrepeso.'                     , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC8.jpg' , 0, 0),
  (14, 15, 1, 'Nulo Freestyle Adult Trim gato 1,6 kg'              , 'nulo-freestyle-adult-trim-gato-1-6-kg'              , 'Sin granos y bajo en calorías, para el gato adulto que necesita bajar de peso.'                , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC9.jpg' , 0, 0),
  (15, 16, 1, 'Agility Gold Grandes Adultos 15 kg'                 , 'agility-gold-grandes-adultos-15-kg'                 , 'Súper premium para perros grandes adultos. Cuida articulaciones y digestión.'                  , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC10.jpg', 0, 0),
  (16, 17, 6, 'KONG Classic rellenable talla XL'                   , 'kong-classic-rellenable-talla-xl'                   , 'Caucho natural resistente. Se rellena con premios y entretiene durante horas.'                 , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC11.jpg', 0, 1),
  (17, 18, 6, 'Chuckit! Ultra Ball pequeña x2'                     , 'chuckit-ultra-ball-pequena-x2'                      , 'Pelotas de caucho de alto rebote que flotan. Compatibles con el lanzador Chuckit!.'            , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC12.jpg', 0, 0),
  (18, 19, 6, 'Nylabone set de 6 huesos masticables'               , 'nylabone-set-de-6-huesos-masticables'               , 'Seis texturas distintas para masticadores medianos. Ayudan a limpiar el sarro.'                , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC13.jpg', 0, 0),
  (19, 20, 6, 'Cuerda de algodón con nudos 45 cm'                  , 'cuerda-de-algodon-con-nudos-45-cm'                  , 'Para jugar a halar y para el hilo dental natural de las encías.'                               , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC14.jpg', 0, 0),
  (20, 21, 6, 'Tapete olfativo antiansiedad'                       , 'tapete-olfativo-antiansiedad'                       , 'Se esconde el alimento entre las tiras: come más despacio y gasta energía mental.'             , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC15.jpg', 0, 0),
  (21, 22, 6, 'JW Hol-ee Roller pelota de caucho'                  , 'jw-hol-ee-roller-pelota-de-caucho'                  , 'Pelota calada de caucho natural: se muerde, se hala y se le meten premios adentro.'            , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC16.jpg', 0, 0),
  (22, 23, 6, 'Varita con plumas para gato y 8 repuestos'          , 'varita-con-plumas-para-gato-y-8-repuestos'          , 'Caña telescópica con plumas de colores. Nueve juguetes en uno para la caza en casa.'           , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC17.jpg', 0, 1),
  (23, 24, 6, 'Puntero láser LED recargable para gato'             , 'puntero-laser-led-recargable-para-gato'             , 'Recargable por USB, con luz blanca y ultravioleta. Nunca apuntar a los ojos.'                  , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC18.jpg', 0, 0),
  (24, 25, 6, 'Ratones de yute con catnip x2'                      , 'ratones-de-yute-con-catnip-x2'                      , 'Yute natural relleno de catnip. Livianos, para perseguir y patear.'                            , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC19.jpg', 0, 0),
  (25, 26, 6, 'Túnel plegable de dos vías'                         , 'tunel-plegable-de-dos-vias'                         , 'Túnel con ventana y forro afelpado. Se dobla y se guarda plano.'                               , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC20.jpg', 0, 0),
  (26, 27, 6, 'Rascador de cartón tipo lounge'                     , 'rascador-de-carton-tipo-lounge'                     , 'Cartón corrugado curvo: sirve de rascador y de cama. Salva los muebles.'                       , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC21.jpg', 0, 0),
  (27, 28, 6, 'Torre de bolas de tres niveles'                     , 'torre-de-bolas-de-tres-niveles'                     , 'Tres pisos con bolas que no se salen. Juego solitario para el gato que se aburre.'             , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC22.jpg', 0, 0),
  (28, 29, 6, 'Almohadas de catnip x3'                             , 'almohadas-de-catnip-x3'                             , 'Tres almohadas de pelo suave con catnip para abrazar y patear.'                                , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC23.jpg', 0, 0),
  (29, 30, 6, 'Espirales de plástico para gato x10'                , 'espirales-de-plastico-para-gato-x10'                , 'Resortes livianos que ruedan y saltan. El juguete más barato y el que más gusta.'              , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC24.jpg', 0, 0),
  (30, 31, 3, 'Arnés antiescape para gato con correa'              , 'arnes-antiescape-para-gato-con-correa'              , 'Arnés acolchado de un solo paso, reflectivo, con correa de 1,5 m. El gato no se zafa.'         , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC25.jpg', 0, 1),
  (31, 32, 3, 'Collar para gato con cascabel y broche de seguridad', 'collar-para-gato-con-cascabel-y-broche-de-seguridad', 'Broche que se suelta solo si el collar se engancha. Con cascabel y anillo para la placa.'      , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC26.jpg', 0, 0),
  (32, 33, 3, 'Cinturón de paseo manos libres con correa elástica' , 'cinturon-de-paseo-manos-libres-con-correa-elastica' , 'Cinturón con bolsillo y correa elástica: para trotar con el perro sin usar las manos.'         , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC27.jpg', 0, 0),
  (33, 34, 3, 'Correa elástica reflectiva con manija acolchada'    , 'correa-elastica-reflectiva-con-manija-acolchada'    , 'Amortigua los tirones y se ve de noche. Manija acolchada y mosquetón de seguridad.'            , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC28.jpg', 0, 0),
  (34, 35, 3, 'Correa retráctil de cordón 5 m'                     , 'correa-retractil-de-cordon-5-m'                     , 'Cordón reflectivo de 5 m con freno y bloqueo de una mano. Hasta 20 kg.'                        , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC29.jpg', 0, 0),
  (35, 36, 7, 'Cama iglú para gato'                                , 'cama-iglu-para-gato'                                , 'Cueva cerrada y afelpada, con cojín removible. Para el gato que duerme escondido.'             , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC30.jpg', 0, 0),
  (36, 37, 7, 'Cama redonda acolchada estampada'                   , 'cama-redonda-acolchada-estampada'                   , 'Borde alto para apoyar la cabeza y base antideslizante. Lavable a máquina.'                    , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC31.jpg', 0, 0),
  (37, 38, 7, 'Cama dona de pelo largo'                            , 'cama-dona-de-pelo-largo'                            , 'Pelo largo que abriga y calma. El borde en dona da la sensación de refugio.'                   , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC32.jpg', 0, 1),
  (38, 39, 7, 'Cama elevada tipo catre'                            , 'cama-elevada-tipo-catre'                            , 'Malla tensada que ventila por debajo. Ideal para el calor y para el piso frío.'                , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC33.jpg', 0, 0),
  (39, 40, 7, 'Cama dona antiestrés para perro grande'             , 'cama-dona-antiestres-para-perro-grande'             , 'Talla grande, hasta 40 kg. Relleno firme que no se aplasta con el uso.'                        , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC34.jpg', 0, 0),
  (40, 41, 7, 'Cama sofá rectangular lavable'                      , 'cama-sofa-rectangular-lavable'                      , 'Tres bordes de apoyo y cojín reversible. Funda exterior desmontable.'                          , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC35.jpg', 0, 0);

INSERT INTO tienda.cupones (id, codigo, descripcion, tipo, valor, minimo_compra, usos_maximos, desde, hasta) VALUES
  (1, 'BIENVENIDA10', 'Diez por ciento en tu primera compra', 'porcentaje', 10, 50000, 200,
      CURRENT_DATE - 30, CURRENT_DATE + 90),
  (2, 'ENVIOGRATIS',  'Envío sin costo por compras desde $120.000', 'envio_gratis', 0, 120000, NULL,
      CURRENT_DATE - 10, CURRENT_DATE + 60);

INSERT INTO tienda.repartidores (id, nombre, documento, telefono, vehiculo, placa, sede_id) VALUES
  (1, 'Miguel Ángel Rojas', '1057893214', '3145678923', 'moto', 'ABC12D', 1),
  (2, 'Laura Restrepo',     '1052367841', '3126547891', 'moto', 'XYZ98E', 1);


-- =====================================================================
--  PLANES DE SALUD Y FIDELIZACION
-- =====================================================================

INSERT INTO fidelizacion.planes_salud (id, nombre, slug, descripcion, precio_mensual, precio_anual, descuento_general_pct, color, orden) VALUES
  (1, 'Plan Básico',   'plan-basico',
      'Lo esencial para tener al día a tu mascota: consultas de control y el esquema de vacunas.',
      45000,  480000,  5, '#7bb3a0', 1),
  (2, 'Plan Premium',  'plan-premium',
      'Todo lo del básico más exámenes, urgencias y descuentos en cirugía y hospitalización.',
      95000, 1020000, 15, '#e8a33d', 2);

INSERT INTO fidelizacion.plan_beneficios (plan_id, tipo, servicio_id, vacuna_id, descripcion, cantidad_incluida, descuento_pct, periodo) VALUES
  (1, 'consulta', 1, NULL, 'Cuatro consultas generales al año',        4, NULL, 'anual'),
  (1, 'vacuna',   NULL, 1, 'Refuerzo anual de polivalente',            1, NULL, 'anual'),
  (1, 'vacuna',   NULL, 2, 'Refuerzo anual de rabia',                  1, NULL, 'anual'),
  (1, 'descuento', NULL, NULL, 'Cinco por ciento en productos',     NULL,    5, 'anual'),
  (2, 'consulta', 1, NULL, 'Consultas generales ilimitadas',        NULL, NULL, 'anual'),
  (2, 'vacuna',   NULL, 1, 'Esquema anual completo de vacunas',        2, NULL, 'anual'),
  (2, 'examen',   NULL, NULL, 'Dos perfiles de laboratorio al año',     2, NULL, 'anual'),
  (2, 'servicio', 9, NULL, 'Urgencias sin costo de valoración',        3, NULL, 'anual'),
  (2, 'descuento', NULL, NULL, 'Quince por ciento en cirugía y hospitalización', NULL, 15, 'anual');

INSERT INTO fidelizacion.niveles_cliente (id, nombre, puntos_minimos, descuento_pct, beneficios, color, orden) VALUES
  (1, 'Huella',  0,    0, 'Acumulas puntos con cada compra',                    '#c8d5cf', 1),
  (2, 'Plata',   500,  3, 'Tres por ciento de descuento y cupones mensuales',   '#b9c2c7', 2),
  (3, 'Oro',     1500, 6, 'Seis por ciento, agenda prioritaria y baño de regalo','#e8a33d', 3),
  (4, 'Platino', 4000, 10,'Diez por ciento, urgencias prioritarias y domicilio gratis','#7d8ea6', 4);

INSERT INTO fidelizacion.recompensas (id, nombre, descripcion, puntos, tipo, servicio_id, producto_id, valor) VALUES
  (1, 'Baño y peluquería',       'Un baño completo con corte según raza', 800, 'servicio', 7, NULL, 45000),
  (2, 'Consulta general gratis', 'Una consulta veterinaria sin costo',    900, 'servicio', 1, NULL, 60000),
  (3, 'Bulto de alimento 3 kg',  'Alimento balanceado premium de 3 kg',  1200, 'producto', NULL, 4, 68000),
  (4, 'Descuento de $20.000',    'Se aplica a cualquier factura',         400, 'descuento', NULL, NULL, 20000);

-- Las cuentas de puntos de los clientes de ejemplo. El disparador de
-- movimientos es el que fija el saldo y el nivel.
INSERT INTO fidelizacion.cuentas_puntos (id, cliente_id, desde) VALUES
  (1, 1, (CURRENT_DATE - INTERVAL '14 months')::date),
  (2, 2, (CURRENT_DATE - INTERVAL '8 months')::date);

INSERT INTO fidelizacion.movimientos_puntos (cuenta_id, tipo, puntos, motivo, factura_id, fecha) VALUES
  (1, 'ganancia', 980, 'Compras y servicios del último año', 1, (CURRENT_DATE - INTERVAL '1 month')::date),
  (1, 'canje',   -400, 'Canje de descuento de $20.000',    NULL, (CURRENT_DATE - INTERVAL '10 days')::date),
  (2, 'ganancia', 600, 'Consulta y control de displasia',      2, (CURRENT_DATE - INTERVAL '2 months')::date);

INSERT INTO fidelizacion.suscripciones_plan (id, cliente_id, plan_id, mascota_id, periodicidad, precio, inicio, fin, estado) VALUES
  (1, 1, 2, 1, 'anual', 1020000,
      (CURRENT_DATE - INTERVAL '3 months')::date, (CURRENT_DATE + INTERVAL '9 months')::date, 'activa');

INSERT INTO fidelizacion.consumo_beneficios (suscripcion_id, beneficio_id, cita_id, factura_id, cantidad, valor_ahorrado, fecha)
SELECT 1, b.id, 1, 1, 1, 60000, (CURRENT_DATE - INTERVAL '1 month')::date
  FROM fidelizacion.plan_beneficios b
 WHERE b.plan_id = 2 AND b.tipo = 'consulta';


-- =====================================================================
--  ATENCION AL CLIENTE
-- =====================================================================

INSERT INTO soporte.encuestas (id, codigo, nombre, descripcion, momento, preguntas) VALUES
  (1, 'satisfaccion_cita', 'Satisfacción tras la consulta',
      'Tres preguntas rápidas después de cada cita atendida.', 'post_cita',
      '[{"id":"trato","texto":"¿Cómo fue el trato del equipo?","tipo":"estrellas"},
        {"id":"espera","texto":"¿Te atendieron a la hora acordada?","tipo":"si_no"},
        {"id":"comentario","texto":"¿Algo que podamos mejorar?","tipo":"texto"}]'::jsonb),
  (2, 'satisfaccion_pedido', 'Satisfacción con el pedido',
      'Se envía al marcar un pedido como entregado.', 'post_pedido',
      '[{"id":"tiempo","texto":"¿Llegó en el tiempo prometido?","tipo":"si_no"},
        {"id":"estado","texto":"¿Los productos llegaron en buen estado?","tipo":"si_no"},
        {"id":"general","texto":"Calificación general","tipo":"estrellas"}]'::jsonb);

INSERT INTO soporte.tickets (id, numero, usuario_id, cliente_id, sede_id, tipo, canal, asunto, descripcion, prioridad, estado, vence_en) VALUES
  (1, 'PQRS-2026-0001', 6, 1, 1, 'sugerencia', 'portal',
      'Sería útil ver los resultados de laboratorio en el portal',
      'Me gustaría poder descargar el hemograma de Luna sin tener que llamar a la clínica.',
      'normal', 'abierto', LOCALTIMESTAMP + INTERVAL '15 days');

INSERT INTO soporte.ticket_mensajes (ticket_id, autor_id, mensaje, interno) VALUES
  (1, 6, 'Me gustaría poder descargar el hemograma de Luna sin tener que llamar a la clínica.', 0),
  (1, 1, 'Gracias por la sugerencia. Ya está en desarrollo y quedará disponible este mes.', 0);


-- =====================================================================
--  PERSONAL
-- =====================================================================

INSERT INTO personal.turnos (id, nombre, sede_id, hora_inicio, hora_fin, color, nocturno) VALUES
  (1, 'Mañana',  1, '07:00', '13:00', '#7bb3a0', 0),
  (2, 'Tarde',   1, '13:00', '20:00', '#e8a33d', 0),
  (3, 'Noche',   1, '20:00', '07:00', '#5c6b7a', 1),
  (4, 'Sábado',  1, '09:00', '16:00', '#a9c3b6', 0),
  (5, 'Mañana norte', 2, '09:00', '14:00', '#7bb3a0', 0);

INSERT INTO personal.reglas_comision (id, nombre, aplica_a, servicio_id, categoria_id, usuario_id, porcentaje, valor_fijo) VALUES
  (1, 'Comisión general por servicio', 'servicio', NULL, NULL, NULL, 8.00, NULL),
  (2, 'Cirugía',                       'servicio', 5,    NULL, NULL, 12.00, NULL),
  (3, 'Peluquería',                    'servicio', 7,    NULL, NULL, 15.00, NULL),
  (4, 'Venta de alimento',             'producto', NULL, 3,    NULL, 4.00, NULL);

INSERT INTO personal.certificaciones (usuario_id, nombre, entidad, tipo, expedida_en, vence_en) VALUES
  (2, 'Medicina Veterinaria',              'Universidad Nacional de Colombia', 'titulo',        (CURRENT_DATE - INTERVAL '12 years')::date, NULL),
  (2, 'Tarjeta profesional COMVEZCOL',     'COMVEZCOL',                        'tarjeta',       (CURRENT_DATE - INTERVAL '12 years')::date, (CURRENT_DATE + INTERVAL '2 years')::date),
  (3, 'Diplomado en diagnóstico por imágenes', 'Universidad de La Salle',      'certificacion', (CURRENT_DATE - INTERVAL '4 years')::date,  NULL),
  (5, 'Especialización en cirugía de tejidos blandos', 'Universidad CES',      'especializacion', (CURRENT_DATE - INTERVAL '6 years')::date, NULL);

INSERT INTO personal.asignaciones_turno (usuario_id, turno_id, sede_id, fecha, estado)
SELECT u.id, t.turno, 1, d::date, 'programado'
  FROM generate_series(CURRENT_DATE, CURRENT_DATE + 6, INTERVAL '1 day') d
  CROSS JOIN (VALUES (2, 1), (3, 1), (4, 2)) AS t(usuario, turno)
  JOIN usuarios.usuarios u ON u.id = t.usuario
 WHERE EXTRACT(ISODOW FROM d) BETWEEN 1 AND 5;


-- =====================================================================
--  EQUIPOS MEDICOS
-- =====================================================================

INSERT INTO equipos.equipos_medicos
  (id, codigo, nombre, marca, modelo, numero_serie, categoria, sede_id, ubicacion, responsable_id,
   fecha_compra, valor_compra, garantia_hasta, estado, requiere_calibracion, frecuencia_meses,
   proximo_mantenimiento, proxima_calibracion) VALUES
  (1, 'EQ-001', 'Equipo de rayos X digital', 'Examion', 'DR-Vet 300', 'EX-DR300-88421', 'imagenologia',
      1, 'Sala de imágenes', 3, (CURRENT_DATE - INTERVAL '3 years')::date, 48000000,
      (CURRENT_DATE - INTERVAL '1 year')::date, 'operativo', 1, 12,
      (CURRENT_DATE + INTERVAL '2 months')::date, (CURRENT_DATE + INTERVAL '20 days')::date),
  (2, 'EQ-002', 'Ecógrafo veterinario', 'Mindray', 'DP-50 Vet', 'MD-DP50-33127', 'imagenologia',
      1, 'Sala de imágenes', 3, (CURRENT_DATE - INTERVAL '2 years')::date, 22000000,
      NULL, 'operativo', 0, 12, (CURRENT_DATE + INTERVAL '4 months')::date, NULL),
  (3, 'EQ-003', 'Analizador hematológico', 'IDEXX', 'ProCyte Dx', 'IDX-PCD-77203', 'laboratorio',
      1, 'Laboratorio', 2, (CURRENT_DATE - INTERVAL '4 years')::date, 61000000,
      NULL, 'operativo', 1, 6, (CURRENT_DATE - INTERVAL '5 days')::date, (CURRENT_DATE + INTERVAL '3 months')::date),
  (4, 'EQ-004', 'Máquina de anestesia inhalatoria', 'Mindray', 'WATO EX-20Vet', 'MD-WATO-51098', 'quirofano',
      1, 'Quirófano', 5, (CURRENT_DATE - INTERVAL '5 years')::date, 18000000,
      NULL, 'operativo', 1, 6, (CURRENT_DATE + INTERVAL '1 month')::date, (CURRENT_DATE + INTERVAL '1 month')::date),
  (5, 'EQ-005', 'Autoclave de vapor 23 L', 'Sturdy', 'SA-232X', 'ST-232X-19844', 'esterilizacion',
      1, 'Central de esterilización', 1, (CURRENT_DATE - INTERVAL '2 years')::date, 7500000,
      NULL, 'operativo', 1, 12, (CURRENT_DATE + INTERVAL '3 months')::date, (CURRENT_DATE + INTERVAL '3 months')::date),
  (6, 'EQ-006', 'Monitor multiparámetros', 'Contec', 'CMS8000Vet', 'CT-8000-60215', 'hospitalizacion',
      1, 'Hospitalización', 5, (CURRENT_DATE - INTERVAL '1 year')::date, 5200000,
      (CURRENT_DATE + INTERVAL '1 year')::date, 'operativo', 0, 12, (CURRENT_DATE + INTERVAL '6 months')::date, NULL);

UPDATE imagenes.estudios_imagen SET equipo_id = 1 WHERE id = 1;

INSERT INTO equipos.mantenimientos_equipo (equipo_id, tipo, fecha, realizado_por, proveedor, descripcion, costo, resultado, proximo) VALUES
  (1, 'preventivo',  (CURRENT_DATE - INTERVAL '10 months')::date, 1, 'Examion Colombia',
      'Limpieza del detector, revisión del generador y verificación de kV y mAs.', 850000, 'satisfactorio',
      (CURRENT_DATE + INTERVAL '2 months')::date),
  (3, 'calibracion', (CURRENT_DATE - INTERVAL '3 months')::date, 1, 'IDEXX Colombia',
      'Calibración con controles de tres niveles y ajuste de la curva de referencia.', 1200000, 'satisfactorio',
      (CURRENT_DATE + INTERVAL '3 months')::date),
  (4, 'preventivo',  (CURRENT_DATE - INTERVAL '5 months')::date, 5, 'Mindray Servicio Técnico',
      'Cambio de cal sodada, prueba de fugas del circuito y verificación del vaporizador.', 640000, 'satisfactorio',
      (CURRENT_DATE + INTERVAL '1 month')::date);


-- =====================================================================
--  BIOSEGURIDAD
-- =====================================================================

INSERT INTO bioseguridad.protocolos_bioseguridad (id, codigo, nombre, categoria, descripcion, pasos, frecuencia, responsable_cargo) VALUES
  (1, 'BIO-01', 'Limpieza y desinfección de consultorios', 'limpieza',
      'Entre paciente y paciente, y limpieza profunda al cierre.',
      E'1. Retirar residuos y material desechable.\n2. Limpiar la mesa con detergente enzimático.\n3. Aplicar desinfectante de amplio espectro y dejar actuar 10 minutos.\n4. Secar con paño limpio.',
      'por_uso', 'Auxiliar de consultorio'),
  (2, 'BIO-02', 'Desinfección de jaulas de hospitalización', 'desinfeccion',
      'Al desocupar cada jaula y una vez al día en las ocupadas.',
      E'1. Retirar ropa de cama y desechar residuos.\n2. Lavar con detergente y enjuagar.\n3. Aplicar amonio cuaternario de quinta generación.\n4. Dejar secar antes de ocupar.',
      'por_uso', 'Auxiliar de hospitalización'),
  (3, 'BIO-03', 'Esterilización de instrumental quirúrgico', 'esterilizacion',
      'Ciclo completo de autoclave con control químico y biológico.',
      E'1. Lavado enzimático y secado.\n2. Empaque con indicador químico.\n3. Ciclo de 121 °C por 20 minutos.\n4. Registrar el ciclo y guardar el testigo.',
      'por_uso', 'Instrumentador'),
  (4, 'BIO-04', 'Manejo y entrega de residuos peligrosos', 'residuos',
      'Segregación en la fuente y entrega al gestor autorizado.',
      E'1. Separar por color: rojo biosanitario, guardián para cortopunzantes.\n2. Pesar y registrar antes de entregar.\n3. Firmar el acta con el gestor.',
      'semanal', 'Coordinador de bioseguridad'),
  (5, 'BIO-05', 'Uso de elementos de protección personal', 'proteccion',
      'Qué se usa en cada área y cada cuánto se cambia.',
      E'1. Bata y guantes en consulta.\n2. Tapabocas y gafas en procedimientos con salpicadura.\n3. Delantal plomado en radiología.',
      'por_uso', 'Todo el personal'),
  (6, 'BIO-06', 'Protocolo ante accidente cortopunzante', 'emergencia',
      'Qué hacer si alguien se pincha o es mordido.',
      E'1. Lavar la herida con agua y jabón por 5 minutos.\n2. Reportar de inmediato.\n3. Registrar el incidente y valorar profilaxis.\n4. Seguimiento a los 7 días.',
      'por_uso', 'Coordinador de bioseguridad');

INSERT INTO bioseguridad.elementos_proteccion (id, nombre, tipo, vida_util_dias) VALUES
  (1, 'Guantes de nitrilo',        'guantes',   1),
  (2, 'Tapabocas quirúrgico',      'tapabocas', 1),
  (3, 'Bata antifluido',           'bata',      30),
  (4, 'Gafas de protección',       'gafas',     180),
  (5, 'Careta facial',             'careta',    180),
  (6, 'Delantal plomado',          'delantal',  1095),
  (7, 'Botas de caucho',           'calzado',   365);

INSERT INTO bioseguridad.residuos (sede_id, tipo, peso_kg, fecha, gestor, numero_acta, entregado_por) VALUES
  (1, 'biosanitario',     18.400, (CURRENT_DATE - INTERVAL '7 days')::date,  'Ecoentorno S.A.S.', 'ACT-2026-0031', 1),
  (1, 'cortopunzante',     3.200, (CURRENT_DATE - INTERVAL '7 days')::date,  'Ecoentorno S.A.S.', 'ACT-2026-0031', 1),
  (1, 'anatomopatologico', 6.750, (CURRENT_DATE - INTERVAL '14 days')::date, 'Ecoentorno S.A.S.', 'ACT-2026-0028', 1),
  (1, 'biosanitario',     21.100, (CURRENT_DATE - INTERVAL '14 days')::date, 'Ecoentorno S.A.S.', 'ACT-2026-0028', 1);


-- =====================================================================
--  CAJA
-- =====================================================================

INSERT INTO facturacion.cajas (id, sede_id, nombre) VALUES
  (1, 1, 'Caja recepción'),
  (2, 2, 'Caja norte');


-- =====================================================================
--  INTEGRACIONES
--
--  Todo queda configurado pero INACTIVO: activar la facturación
--  electrónica o una pasarela exige credenciales reales y un contrato con
--  el proveedor, y hasta entonces el sistema debe seguir facturando en
--  papel sin intentar transmitir nada.
-- =====================================================================

INSERT INTO integraciones.proveedores_facturacion (id, nombre, nit, ambiente, url_base, secreto_env, prefijo, resolucion, rango_desde, rango_hasta, activo) VALUES
  (1, 'Proveedor tecnológico DIAN (por definir)', NULL, 'pruebas', NULL,
      'DIAN_API_TOKEN', 'FAC', NULL, 1, 5000, 0);

INSERT INTO integraciones.pasarelas_pago (id, nombre, metodo, proveedor, ambiente, secreto_env, comision_pct, orden, activo) VALUES
  (1, 'PSE',        'pse',           'Wompi', 'pruebas', 'WOMPI_PRIVATE_KEY', 2.99, 1, 0),
  (2, 'Nequi',      'nequi',         'Wompi', 'pruebas', 'WOMPI_PRIVATE_KEY', 2.99, 2, 0),
  (3, 'Daviplata',  'daviplata',     'Wompi', 'pruebas', 'WOMPI_PRIVATE_KEY', 2.99, 3, 0),
  (4, 'Tarjeta',    'tarjeta',       'Wompi', 'pruebas', 'WOMPI_PRIVATE_KEY', 3.49, 4, 0),
  (5, 'Transferencia bancaria', 'transferencia', NULL, 'produccion', NULL, 0, 5, 1);


-- =====================================================================
--  AUTOMATIZACION Y ALERTAS
-- =====================================================================

INSERT INTO comunicacion.plantillas_notificaciones (id, codigo, canal, asunto, cuerpo) VALUES
  (7,  'resultado_listo',  'sistema', 'Ya está listo el resultado',
       'El resultado de {{examen}} de {{mascota}} ya está disponible en tu portal.'),
  (8,  'desparasitacion_proxima', 'sistema', 'Toca desparasitar',
       'A {{mascota}} le toca la desparasitación {{tipo}} el {{fecha}}.'),
  (9,  'factura_pendiente','sistema', 'Tienes una factura pendiente',
       'La factura {{numero}} por {{valor}} sigue pendiente de pago.'),
  (10, 'cumpleanos',       'sistema', '¡Feliz cumpleaños!',
       'Hoy {{mascota}} cumple {{edad}}. Te dejamos un cupón de regalo en tu portal.'),
  (11, 'cliente_inactivo', 'sistema', 'Hace tiempo que no nos visitas',
       'Hace {{meses}} meses que {{mascota}} no viene a control. Agenda cuando quieras.'),
  (12, 'pedido_estado',    'sistema', 'Tu pedido cambió de estado',
       'El pedido {{numero}} está ahora {{estado}}.'),
  (13, 'plan_por_vencer',  'sistema', 'Tu plan está por vencer',
       'El {{plan}} de {{mascota}} vence el {{fecha}}. Renuévalo para no perder los beneficios.'),
  (14, 'medicamento_toma', 'sistema', 'Toca la siguiente dosis',
       'A {{mascota}} le toca {{medicamento}} a las {{hora}}.');

INSERT INTO comunicacion.reglas_automaticas (codigo, nombre, evento, plantilla_id, canal, desfase_horas, destinatario) VALUES
  ('rec_cita_24h',     'Recordar la cita 24 horas antes',    'cita_proxima',            4,  'sistema', -24, 'cliente'),
  ('rec_vacuna_7d',    'Avisar el refuerzo una semana antes','vacuna_proxima',          5,  'sistema', -168,'cliente'),
  ('rec_vacuna_vencida','Avisar la vacuna vencida',          'vacuna_vencida',          5,  'sistema',  24, 'cliente'),
  ('rec_desparasita',  'Avisar la desparasitación',          'desparasitacion_proxima', 8,  'sistema', -72, 'cliente'),
  ('rec_resultado',    'Avisar cuando el resultado se valida','resultado_listo',        7,  'sistema',   0, 'cliente'),
  ('rec_factura',      'Recordar factura pendiente',         'factura_pendiente',       9,  'sistema', 720, 'cliente'),
  ('rec_cumpleanos',   'Felicitar el cumpleaños',            'cumpleanos',             10,  'sistema',   0, 'cliente'),
  ('rec_inactivo',     'Reactivar clientes sin visita',      'cliente_inactivo',       11,  'sistema',   0, 'cliente'),
  ('rec_pedido',       'Avisar el cambio de estado del pedido','pedido_estado',        12,  'sistema',   0, 'cliente'),
  ('rec_plan',         'Avisar el plan por vencer',          'plan_por_vencer',        13,  'sistema', -720,'cliente'),
  ('rec_medicacion',   'Avisar la siguiente dosis del internado','medicamento_toma',   14,  'sistema',  -1, 'equipo');

INSERT INTO alertas.reglas_alerta (codigo, nombre, categoria, severidad, descripcion, parametros) VALUES
  ('alergia_registrada',    'Alergia registrada',              'clinica',     'critica',
   'El paciente tiene una alergia registrada; se avisa al abrir su historia.', NULL),
  ('medicamento_incompatible','Interacción medicamentosa',     'clinica',     'critica',
   'Dos principios activos del tratamiento tienen interacción conocida.', NULL),
  ('vacuna_pendiente',      'Vacuna vencida o pendiente',      'clinica',     'alta',
   'El paciente tiene el esquema de vacunación incompleto o vencido.',
   '{"dias_aviso": 30}'::jsonb),
  ('examen_pendiente',      'Examen sin resultado',            'clinica',     'media',
   'Un examen lleva demasiado tiempo solicitado sin resultado.',
   '{"dias": 5}'::jsonb),
  ('hospitalizado_sin_control','Paciente internado sin control','clinica',    'alta',
   'Un paciente hospitalizado lleva más horas de las previstas sin control.',
   '{"horas": 8}'::jsonb),
  ('medicacion_vencida',    'Medicación pendiente',            'clinica',     'critica',
   'A un paciente internado le pasó la hora de una dosis programada.', NULL),
  ('urgencia_sin_atender',  'Urgencia sin atender',            'clinica',     'critica',
   'Un paciente lleva demasiados minutos en la sala de urgencias sin que lo atiendan.',
   '{"minutos": 15}'::jsonb),
  ('producto_vencido',      'Producto vencido o por vencer',   'inventario',  'alta',
   'Hay lotes vencidos o a punto de vencer en el inventario.',
   '{"dias_aviso": 30}'::jsonb),
  ('inventario_critico',    'Inventario en mínimos',           'inventario',  'alta',
   'Un producto está en el stock mínimo o por debajo.', NULL),
  ('cita_superpuesta',      'Cita superpuesta',                'agenda',      'media',
   'Se detectaron dos citas del mismo veterinario a la misma hora.', NULL),
  ('factura_vencida',       'Factura vencida',                 'facturacion', 'media',
   'Una factura lleva demasiados días pendiente de pago.',
   '{"dias": 30}'::jsonb),
  ('equipo_mantenimiento',  'Equipo con mantenimiento vencido','equipos',     'alta',
   'Un equipo médico pasó su fecha de mantenimiento o calibración.',
   '{"dias_aviso": 15}'::jsonb),
  ('certificacion_vencida', 'Certificación por vencer',        'personal',    'media',
   'La tarjeta profesional o una certificación del equipo está por vencer.',
   '{"dias_aviso": 60}'::jsonb),
  ('pqrs_por_vencer',       'PQRS cerca del plazo',            'seguridad',   'alta',
   'Una PQRS está cerca de los quince días hábiles de respuesta.',
   '{"dias": 3}'::jsonb);


-- =====================================================================
--  Sincronizar los contadores de identidad
--
--  Los INSERT de arriba traen el id escrito a mano y eso no adelanta la
--  secuencia. Sin esto, el primer registro que cree la aplicación chocaría
--  con un id ya usado. Se recorren todas las tablas de todos los módulos
--  para no tener que mantener la lista a mano.
-- =====================================================================
DO $huellitas$
DECLARE
  r record;
  secuencia text;
BEGIN
  FOR r IN
    SELECT c.table_schema AS esquema, c.table_name AS tabla, c.column_name AS columna
      FROM information_schema.columns c
      JOIN pg_tables t ON t.schemaname = c.table_schema AND t.tablename = c.table_name
     WHERE c.is_identity = 'YES'
       AND c.table_schema = ANY (public.huellitas_esquemas())
  LOOP
    secuencia := pg_get_serial_sequence(format('%I.%I', r.esquema, r.tabla), r.columna);
    IF secuencia IS NOT NULL THEN
      EXECUTE format(
        'SELECT setval(%L, GREATEST(COALESCE((SELECT MAX(%I) FROM %I.%I), 0), 1))',
        secuencia, r.columna, r.esquema, r.tabla);
    END IF;
  END LOOP;
END
$huellitas$;
