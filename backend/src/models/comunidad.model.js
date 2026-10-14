'use strict';

const crypto = require('crypto');
const { consultar, consultarUna, ejecutar, enTransaccion } = require('../config/database');
const { siguienteNumero } = require('../utils/consecutivos');

/**
 * Comunidad: identidad digital, mascotas perdidas y adopciones.
 *
 * Son tres cosas que comparten una idea: sacar información fuera de la clínica
 * de forma controlada. El QR de la placa, el reporte de una mascota perdida y
 * la ficha de adopción los ve gente sin cuenta, así que cada uno decide
 * explícitamente qué enseña y qué no.
 */

/* ------------------------------------------------------------------
   Identidad digital
   ------------------------------------------------------------------ */

/**
 * El token va en la URL del QR, así que no puede ser adivinable ni derivarse
 * del id de la mascota: 16 bytes aleatorios en base64url dan margen de sobra
 * y caben en una placa.
 */
function nuevoToken() {
  return `hlt-${crypto.randomBytes(12).toString('base64url')}`;
}

async function identidadDe(mascotaId) {
  return consultarUna('SELECT * FROM identidades_mascota WHERE mascota_id = ?', [mascotaId]);
}

/** Crea la identidad si no existía; si ya estaba, la devuelve tal cual. */
async function asegurarIdentidad(mascotaId) {
  const existente = await identidadDe(mascotaId);
  if (existente) return existente;

  await ejecutar(
    'INSERT INTO identidades_mascota (mascota_id, token) VALUES (?, ?)',
    [mascotaId, nuevoToken()]
  );
  return identidadDe(mascotaId);
}

async function configurarIdentidad(mascotaId, datos) {
  const resultado = await ejecutar(
    `UPDATE identidades_mascota
        SET mostrar_telefono = ?, mostrar_direccion = ?, mostrar_alergias = ?,
            mostrar_vacunas = ?, mensaje = ?, activo = ?
      WHERE mascota_id = ?`,
    [
      datos.mostrarTelefono ? 1 : 0,
      datos.mostrarDireccion ? 1 : 0,
      datos.mostrarAlergias ? 1 : 0,
      datos.mostrarVacunas ? 1 : 0,
      datos.mensaje ?? null,
      datos.activo ? 1 : 0,
      mascotaId,
    ]
  );
  return resultado.affectedRows > 0;
}

/** Revocar y volver a generar: sirve si la placa se pierde con el QR impreso. */
async function regenerarToken(mascotaId) {
  const token = nuevoToken();
  await ejecutar('UPDATE identidades_mascota SET token = ? WHERE mascota_id = ?', [token, mascotaId]);
  return token;
}

/**
 * Perfil público que ve quien escanea el QR.
 *
 * Devuelve solo lo que el dueño autorizó, nunca la historia clínica. Las
 * alergias sí van cuando están permitidas porque son justo lo que necesita
 * saber un veterinario que atiende a un animal encontrado en la calle.
 */
async function perfilPublico(token) {
  const identidad = await consultarUna(
    `SELECT i.*, m.id AS mascota_id, m.nombre, m.foto, m.sexo, m.color, m.microchip,
            m.fecha_nacimiento, m.esterilizado,
            e.nombre AS especie, r.nombre AS raza,
            u.nombre AS propietario, u.telefono AS propietario_telefono,
            c.direccion, c.ciudad,
            (SELECT rp.id FROM reportes_perdida rp
              WHERE rp.mascota_id = m.id AND rp.estado = 'perdida'
              ORDER BY rp.creado_en DESC LIMIT 1) AS reporte_perdida_id
       FROM identidades_mascota i
       JOIN mascotas m  ON m.id = i.mascota_id
       JOIN especies e  ON e.id = m.especie_id
       LEFT JOIN razas r ON r.id = m.raza_id
       JOIN clientes c  ON c.id = m.cliente_id
       JOIN usuarios u  ON u.id = c.usuario_id
      WHERE i.token = ? AND i.activo = 1`,
    [token]
  );

  if (!identidad) return null;

  await ejecutar(
    'UPDATE identidades_mascota SET visitas = visitas + 1, ultima_visita = LOCALTIMESTAMP WHERE id = ?',
    [identidad.id]
  );

  const perfil = {
    nombre: identidad.nombre,
    foto: identidad.foto,
    especie: identidad.especie,
    raza: identidad.raza,
    sexo: identidad.sexo,
    color: identidad.color,
    microchip: identidad.microchip,
    esterilizado: identidad.esterilizado,
    mensaje: identidad.mensaje,
    propietario: identidad.propietario,
    perdida: Boolean(identidad.reporte_perdida_id),
    reportePerdidaId: identidad.reporte_perdida_id,
  };

  if (identidad.mostrar_telefono) {
    perfil.telefono = identidad.propietario_telefono;
    perfil.contactosEmergencia = await consultar(
      `SELECT ce.nombre, ce.parentesco, ce.telefono
         FROM mascotas_contactos mc
         JOIN contactos_emergencia ce ON ce.id = mc.contacto_id
        WHERE mc.mascota_id = ?
        ORDER BY ce.principal DESC`,
      [identidad.mascota_id]
    );
  }

  if (identidad.mostrar_direccion) {
    perfil.direccion = identidad.direccion;
    perfil.ciudad = identidad.ciudad;
  }

  if (identidad.mostrar_alergias) {
    perfil.alergias = await consultar(
      `SELECT a.nombre, a.tipo, ma.severidad, ma.reaccion
         FROM mascota_alergias ma
         JOIN alergias a ON a.id = ma.alergia_id
        WHERE ma.mascota_id = ?
        ORDER BY CASE ma.severidad WHEN 'grave' THEN 1 WHEN 'moderada' THEN 2 ELSE 3 END`,
      [identidad.mascota_id]
    );
  }

  if (identidad.mostrar_vacunas) {
    perfil.vacunas = await consultar(
      `SELECT v.nombre, av.fecha_aplicacion, av.proxima_fecha,
              (av.proxima_fecha IS NOT NULL AND av.proxima_fecha < CURRENT_DATE) AS vencida
         FROM aplicaciones_vacunas av
         JOIN vacunas v ON v.id = av.vacuna_id
        WHERE av.mascota_id = ?
          AND av.fecha_aplicacion = (
            SELECT MAX(a2.fecha_aplicacion) FROM aplicaciones_vacunas a2
             WHERE a2.mascota_id = av.mascota_id AND a2.vacuna_id = av.vacuna_id)
        ORDER BY v.nombre`,
      [identidad.mascota_id]
    );
  }

  return perfil;
}

/* ------------------------------------------------------------------
   Mascotas perdidas
   ------------------------------------------------------------------ */

async function listarPerdidas({ estado = 'perdida', ciudad = null, soloPublicados = true, limite = 50 } = {}) {
  const condiciones = [];
  const params = [];

  if (estado) { condiciones.push('rp.estado = ?'); params.push(estado); }
  if (ciudad) { condiciones.push('rp.ciudad ILIKE ?'); params.push(`%${ciudad}%`); }
  if (soloPublicados) condiciones.push('rp.publicado = 1');

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 50, 1), 200);

  return consultar(
    `SELECT rp.id, rp.estado, rp.fecha_perdida, rp.ultima_direccion, rp.ciudad,
            rp.latitud, rp.longitud, rp.descripcion, rp.senas, rp.telefono_contacto,
            rp.recompensa, rp.creado_en,
            COALESCE(rp.foto, m.foto) AS foto,
            m.id AS mascota_id, m.nombre AS mascota, m.sexo, m.color,
            e.nombre AS especie, r.nombre AS raza,
            (SELECT COUNT(*) FROM avistamientos a
              WHERE a.reporte_id = rp.id AND a.estado <> 'descartado') AS avistamientos
       FROM reportes_perdida rp
       JOIN mascotas m ON m.id = rp.mascota_id
       JOIN especies e ON e.id = m.especie_id
       LEFT JOIN razas r ON r.id = m.raza_id
       ${where}
      ORDER BY rp.creado_en DESC
      LIMIT ${lim}`,
    params
  );
}

async function perdidaPorId(id) {
  return consultarUna(
    `SELECT rp.*, COALESCE(rp.foto, m.foto) AS foto_mostrada,
            m.nombre AS mascota, m.sexo, m.color, m.microchip,
            e.nombre AS especie, r.nombre AS raza,
            u.nombre AS propietario, cl.id AS cliente_id
       FROM reportes_perdida rp
       JOIN mascotas m  ON m.id = rp.mascota_id
       JOIN especies e  ON e.id = m.especie_id
       LEFT JOIN razas r ON r.id = m.raza_id
       JOIN clientes cl ON cl.id = rp.cliente_id
       JOIN usuarios u  ON u.id = cl.usuario_id
      WHERE rp.id = ?`,
    [id]
  );
}

async function reportarPerdida(datos, usuarioId) {
  const resultado = await ejecutar(
    `INSERT INTO reportes_perdida
       (mascota_id, cliente_id, fecha_perdida, ultima_direccion, ciudad, latitud, longitud,
        descripcion, senas, telefono_contacto, recompensa, foto, publicado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      datos.mascotaId,
      datos.clienteId,
      datos.fechaPerdida,
      datos.ultimaDireccion ?? null,
      datos.ciudad ?? null,
      datos.latitud ?? null,
      datos.longitud ?? null,
      datos.descripcion ?? null,
      datos.senas ?? null,
      datos.telefonoContacto,
      datos.recompensa ?? null,
      datos.foto ?? null,
      datos.publicado ? 1 : 0,
    ]
  );
  void usuarioId;
  return resultado.insertId;
}

async function actualizarPerdida(id, datos) {
  const resultado = await ejecutar(
    `UPDATE reportes_perdida
        SET estado = COALESCE(?, estado),
            publicado = COALESCE(?, publicado),
            descripcion = COALESCE(?, descripcion),
            telefono_contacto = COALESCE(?, telefono_contacto),
            encontrada_en = CASE WHEN ? = 'encontrada' THEN COALESCE(encontrada_en, LOCALTIMESTAMP)
                                 ELSE encontrada_en END
      WHERE id = ?`,
    [
      datos.estado ?? null,
      datos.publicado === undefined ? null : Number(datos.publicado),
      datos.descripcion ?? null,
      datos.telefonoContacto ?? null,
      datos.estado ?? null,
      id,
    ]
  );
  return resultado.affectedRows > 0;
}

async function avistamientosDe(reporteId) {
  return consultar(
    'SELECT * FROM avistamientos WHERE reporte_id = ? ORDER BY fecha DESC',
    [reporteId]
  );
}

async function crearAvistamiento(reporteId, datos, ip) {
  const resultado = await ejecutar(
    `INSERT INTO avistamientos
       (reporte_id, nombre, telefono, direccion, latitud, longitud, descripcion, foto, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      reporteId,
      datos.nombre ?? null,
      datos.telefono,
      datos.direccion ?? null,
      datos.latitud ?? null,
      datos.longitud ?? null,
      datos.descripcion ?? null,
      datos.foto ?? null,
      ip ?? null,
    ]
  );
  return resultado.insertId;
}

async function cambiarEstadoAvistamiento(id, estado) {
  const resultado = await ejecutar('UPDATE avistamientos SET estado = ? WHERE id = ?', [estado, id]);
  return resultado.affectedRows > 0;
}

/* ------------------------------------------------------------------
   Adopciones
   ------------------------------------------------------------------ */

/**
 * Listado de publicaciones.
 *
 * Por defecto solo las disponibles, que es lo que ve quien entra a adoptar.
 * `estado: 'todos'` es para la clínica: necesita ver también las reservadas y
 * las adoptadas, y con el filtro por defecto no aparecerían nunca.
 */
async function listarAdopciones({
  estado = 'disponible', especieId = null, porte = null, sexo = null, busqueda = null, limite = 50,
} = {}) {
  const condiciones = [];
  const params = [];

  if (estado && estado !== 'todos') { condiciones.push('p.estado = ?'); params.push(estado); }
  if (especieId) { condiciones.push('p.especie_id = ?'); params.push(especieId); }
  if (porte) { condiciones.push('p.porte = ?'); params.push(porte); }
  if (sexo) { condiciones.push('p.sexo = ?'); params.push(sexo); }

  if (busqueda) {
    // Se busca por nombre, raza y descripción: quien adopta no sabe cómo se
    // llama el animal, busca "cachorro negro" o "labrador".
    condiciones.push('(p.nombre ILIKE ? OR r.nombre ILIKE ? OR p.descripcion ILIKE ?)');
    const patron = `%${busqueda}%`;
    params.push(patron, patron, patron);
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 50, 1), 200);

  return consultar(
    `SELECT p.*, e.nombre AS especie, r.nombre AS raza, s.nombre AS sede_nombre,
            (SELECT COUNT(*) FROM solicitudes_adopcion sa
              WHERE sa.publicacion_id = p.id AND sa.estado NOT IN ('rechazada','completada')) AS solicitudes
       FROM publicaciones_adopcion p
       JOIN especies e ON e.id = p.especie_id
       LEFT JOIN razas r ON r.id = p.raza_id
       LEFT JOIN sedes s ON s.id = p.sede_id
       ${where}
      ORDER BY p.publicado_en DESC
      LIMIT ${lim}`,
    params
  );
}

async function adopcionPorId(id) {
  return consultarUna(
    `SELECT p.*, e.nombre AS especie, r.nombre AS raza, s.nombre AS sede_nombre
       FROM publicaciones_adopcion p
       JOIN especies e ON e.id = p.especie_id
       LEFT JOIN razas r ON r.id = p.raza_id
       LEFT JOIN sedes s ON s.id = p.sede_id
      WHERE p.id = ?`,
    [id]
  );
}

async function crearPublicacion(datos) {
  const resultado = await ejecutar(
    `INSERT INTO publicaciones_adopcion
       (mascota_id, sede_id, nombre, especie_id, raza_id, sexo, edad_meses, porte, color,
        descripcion, historia, foto, esterilizado, vacunas_al_dia, desparasitado,
        compatible_ninos, compatible_mascotas, estado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      datos.mascotaId ?? null,
      datos.sedeId ?? null,
      datos.nombre,
      datos.especieId,
      datos.razaId ?? null,
      datos.sexo,
      datos.edadMeses ?? null,
      datos.porte,
      datos.color ?? null,
      datos.descripcion ?? null,
      datos.historia ?? null,
      datos.foto ?? null,
      datos.esterilizado ? 1 : 0,
      datos.vacunasAlDia ? 1 : 0,
      datos.desparasitado ? 1 : 0,
      datos.compatibleNinos === null || datos.compatibleNinos === undefined ? null : Number(datos.compatibleNinos),
      datos.compatibleMascotas === null || datos.compatibleMascotas === undefined ? null : Number(datos.compatibleMascotas),
      datos.estado,
    ]
  );
  return resultado.insertId;
}

/**
 * La foto va aparte del resto de la publicación: llega por su propia
 * petición (multipart) y no por el JSON del formulario. Con `null` se quita.
 *
 * Por eso actualizarPublicacion() ya no toca la columna: si la tocara, editar
 * cualquier dato de la mascota borraría su foto, porque el formulario no la
 * manda de vuelta.
 */
async function actualizarFotoAdopcion(id, url) {
  const resultado = await ejecutar('UPDATE publicaciones_adopcion SET foto = ? WHERE id = ?', [url, id]);
  return resultado.affectedRows > 0;
}

async function actualizarPublicacion(id, datos) {
  const resultado = await ejecutar(
    `UPDATE publicaciones_adopcion
        SET nombre = ?, especie_id = ?, raza_id = ?, sexo = ?, edad_meses = ?, porte = ?,
            color = ?, descripcion = ?, historia = ?, esterilizado = ?,
            vacunas_al_dia = ?, desparasitado = ?, compatible_ninos = ?, compatible_mascotas = ?,
            estado = ?, sede_id = ?,
            adoptado_en = CASE WHEN ? = 'adoptado' THEN COALESCE(adoptado_en, LOCALTIMESTAMP) ELSE adoptado_en END
      WHERE id = ?`,
    [
      datos.nombre,
      datos.especieId,
      datos.razaId ?? null,
      datos.sexo,
      datos.edadMeses ?? null,
      datos.porte,
      datos.color ?? null,
      datos.descripcion ?? null,
      datos.historia ?? null,
      datos.esterilizado ? 1 : 0,
      datos.vacunasAlDia ? 1 : 0,
      datos.desparasitado ? 1 : 0,
      datos.compatibleNinos === null || datos.compatibleNinos === undefined ? null : Number(datos.compatibleNinos),
      datos.compatibleMascotas === null || datos.compatibleMascotas === undefined ? null : Number(datos.compatibleMascotas),
      datos.estado,
      datos.sedeId ?? null,
      datos.estado,
      id,
    ]
  );
  return resultado.affectedRows > 0;
}

async function solicitudesDe(publicacionId) {
  return consultar(
    `SELECT sa.*, u.nombre AS evaluador_nombre,
            (SELECT COUNT(*) FROM entrevistas_adopcion en WHERE en.solicitud_id = sa.id) AS entrevistas
       FROM solicitudes_adopcion sa
       LEFT JOIN usuarios u ON u.id = sa.evaluado_por
      WHERE sa.publicacion_id = ?
      ORDER BY sa.creado_en`,
    [publicacionId]
  );
}

async function solicitudPorId(id) {
  return consultarUna(
    `SELECT sa.*, p.nombre AS mascota, p.estado AS estado_publicacion, p.id AS publicacion_id
       FROM solicitudes_adopcion sa
       JOIN publicaciones_adopcion p ON p.id = sa.publicacion_id
      WHERE sa.id = ?`,
    [id]
  );
}

async function crearSolicitud(publicacionId, datos, usuarioId) {
  const resultado = await ejecutar(
    `INSERT INTO solicitudes_adopcion
       (publicacion_id, usuario_id, nombre, documento, email, telefono, direccion, ciudad,
        tipo_vivienda, tiene_patio, otras_mascotas, personas_hogar, motivo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      publicacionId,
      usuarioId ?? null,
      datos.nombre,
      datos.documento ?? null,
      datos.email,
      datos.telefono,
      datos.direccion ?? null,
      datos.ciudad ?? null,
      datos.tipoVivienda ?? null,
      datos.tienePatio === null || datos.tienePatio === undefined ? null : Number(datos.tienePatio),
      datos.otrasMascotas ?? null,
      datos.personasHogar ?? null,
      datos.motivo ?? null,
    ]
  );
  return resultado.insertId;
}

/**
 * ¿Esta persona ya tiene una solicitud viva por esta mascota?
 *
 * Se mira por cuenta y por correo, porque la misma familia puede escribir sin
 * sesión y luego con ella. Las rechazadas y las completadas no cuentan: si le
 * dijeron que no y cambian de casa, tiene sentido que vuelvan a intentarlo.
 */
async function solicitudAbiertaDe(publicacionId, { usuarioId = null, email = null } = {}) {
  const condiciones = [];
  const params = [publicacionId];

  if (usuarioId) { condiciones.push('sa.usuario_id = ?'); params.push(usuarioId); }
  if (email) { condiciones.push('LOWER(sa.email) = LOWER(?)'); params.push(email); }
  if (!condiciones.length) return null;

  return consultarUna(
    `SELECT sa.id, sa.estado
       FROM solicitudes_adopcion sa
      WHERE sa.publicacion_id = ?
        AND sa.estado NOT IN ('rechazada', 'completada')
        AND (${condiciones.join(' OR ')})
      LIMIT 1`,
    params
  );
}

/**
 * Las solicitudes de quien las hizo, para que pueda seguir su propio caso.
 *
 * Trae el estado, la próxima entrevista y el motivo del rechazo: es justo lo
 * que la familia pregunta por teléfono. No trae la evaluación interna ni el
 * puntaje, que son notas de la clínica.
 */
async function solicitudesDeUsuario(usuarioId) {
  return consultar(
    `SELECT sa.id, sa.publicacion_id, sa.estado, sa.motivo_rechazo, sa.creado_en,
            p.nombre AS mascota, p.foto, p.estado AS estado_publicacion,
            e.nombre AS especie, r.nombre AS raza,
            (SELECT MIN(en.fecha) FROM entrevistas_adopcion en
              WHERE en.solicitud_id = sa.id AND en.fecha >= LOCALTIMESTAMP) AS proxima_entrevista
       FROM solicitudes_adopcion sa
       JOIN publicaciones_adopcion p ON p.id = sa.publicacion_id
       JOIN especies e ON e.id = p.especie_id
       LEFT JOIN razas r ON r.id = p.raza_id
      WHERE sa.usuario_id = ?
      ORDER BY sa.creado_en DESC`,
    [usuarioId]
  );
}

/**
 * Evaluación. Aprobar una solicitud reserva la publicación, y completarla la
 * marca como adoptada: así dos familias no pueden llevarse el mismo animal.
 */
async function evaluarSolicitud(id, datos, usuarioId) {
  return enTransaccion(async (conexion) => {
    const [resultado] = await conexion.execute(
      `UPDATE solicitudes_adopcion
          SET estado = ?, puntaje = COALESCE(?, puntaje), motivo_rechazo = ?,
              evaluado_por = ?
        WHERE id = ?
        RETURNING publicacion_id`,
      [datos.estado, datos.puntaje ?? null, datos.motivoRechazo ?? null, usuarioId ?? null, id]
    );

    if (!resultado.affectedRows) return null;
    const publicacionId = resultado.rows[0].publicacion_id;

    if (datos.estado === 'aprobada') {
      await conexion.execute(
        `UPDATE publicaciones_adopcion SET estado = 'reservado'
          WHERE id = ? AND estado = 'disponible'`,
        [publicacionId]
      );
    } else if (datos.estado === 'completada') {
      await conexion.execute(
        `UPDATE publicaciones_adopcion
            SET estado = 'adoptado', adoptado_en = COALESCE(adoptado_en, LOCALTIMESTAMP)
          WHERE id = ?`,
        [publicacionId]
      );
      // Las demás solicitudes de esa mascota se cierran solas: el animal ya
      // tiene casa y dejarlas abiertas solo genera falsas expectativas.
      await conexion.execute(
        `UPDATE solicitudes_adopcion
            SET estado = 'rechazada',
                motivo_rechazo = COALESCE(motivo_rechazo, 'La mascota fue adoptada por otra familia.')
          WHERE publicacion_id = ? AND id <> ? AND estado NOT IN ('rechazada','completada')`,
        [publicacionId, id]
      );
    } else if (datos.estado === 'rechazada') {
      // Si era la única aprobada, la mascota vuelve a estar disponible.
      await conexion.execute(
        `UPDATE publicaciones_adopcion p
            SET estado = 'disponible'
          WHERE p.id = ? AND p.estado = 'reservado'
            AND NOT EXISTS (
              SELECT 1 FROM solicitudes_adopcion s
               WHERE s.publicacion_id = p.id AND s.estado = 'aprobada')`,
        [publicacionId]
      );
    }

    return publicacionId;
  }, usuarioId);
}

async function entrevistasDe(solicitudId) {
  return consultar(
    `SELECT en.*, u.nombre AS entrevistador_nombre
       FROM entrevistas_adopcion en
       LEFT JOIN usuarios u ON u.id = en.entrevistador_id
      WHERE en.solicitud_id = ?
      ORDER BY en.fecha DESC`,
    [solicitudId]
  );
}

async function crearEntrevista(solicitudId, datos, usuarioId) {
  const resultado = await ejecutar(
    `INSERT INTO entrevistas_adopcion (solicitud_id, entrevistador_id, fecha, modalidad, resultado, notas)
     VALUES (?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [solicitudId, usuarioId ?? null, datos.fecha, datos.modalidad, datos.resultado ?? null, datos.notas ?? null]
  );
  return resultado.insertId;
}

async function crearContrato(solicitudId, datos, usuarioId) {
  return enTransaccion(async (conexion) => {
    const numero = await siguienteNumero(conexion, 'contratos_adopcion');

    const [resultado] = await conexion.execute(
      `INSERT INTO contratos_adopcion (solicitud_id, numero, firma_id, archivo, compromisos)
       VALUES (?, ?, ?, ?, ?)
       RETURNING id`,
      [solicitudId, numero, datos.firmaId ?? null, datos.archivo ?? null, datos.compromisos ?? null]
    );

    return { id: resultado.insertId, numero };
  }, usuarioId);
}

async function contratoDe(solicitudId) {
  return consultarUna('SELECT * FROM contratos_adopcion WHERE solicitud_id = ?', [solicitudId]);
}

async function seguimientosDe(solicitudId) {
  return consultar(
    `SELECT sg.*, u.nombre AS realizado_por_nombre
       FROM seguimientos_adopcion sg
       LEFT JOIN usuarios u ON u.id = sg.realizado_por
      WHERE sg.solicitud_id = ?
      ORDER BY sg.fecha_programada`,
    [solicitudId]
  );
}

async function crearSeguimiento(solicitudId, datos) {
  const resultado = await ejecutar(
    `INSERT INTO seguimientos_adopcion (solicitud_id, fecha_programada, medio, notas)
     VALUES (?, ?, ?, ?)
     RETURNING id`,
    [solicitudId, datos.fechaProgramada, datos.medio, datos.notas ?? null]
  );
  return resultado.insertId;
}

async function registrarSeguimiento(id, datos, usuarioId) {
  const resultado = await ejecutar(
    `UPDATE seguimientos_adopcion
        SET estado = ?, estado_mascota = ?, notas = COALESCE(?, notas),
            fecha_realizado = CURRENT_DATE, realizado_por = ?
      WHERE id = ? AND estado = 'pendiente'`,
    [datos.estado, datos.estadoMascota ?? null, datos.notas ?? null, usuarioId ?? null, id]
  );
  return resultado.affectedRows > 0;
}

/** Seguimientos que ya tocaban y siguen pendientes. */
async function seguimientosVencidos() {
  return consultar(
    `SELECT sg.*, sa.nombre AS adoptante, sa.telefono, p.nombre AS mascota
       FROM seguimientos_adopcion sg
       JOIN solicitudes_adopcion sa ON sa.id = sg.solicitud_id
       JOIN publicaciones_adopcion p ON p.id = sa.publicacion_id
      WHERE sg.estado = 'pendiente' AND sg.fecha_programada <= CURRENT_DATE
      ORDER BY sg.fecha_programada`
  );
}

/* ------------------------------------------------------------------
   Testimonios

   El comentario que deja un cliente en la página pública. Se publica sin
   revisión previa —quien escribe ve su testimonio en el sitio al instante—,
   así que lo que decide si entra o no es el filtro de palabras del
   controlador, no un moderador.
   ------------------------------------------------------------------ */

/** Los que salen en la landing: publicados, del más nuevo al más viejo. */
async function listarTestimonios(limite = 6) {
  return consultar(
    `SELECT id, nombre, mensaje, creado_en
       FROM testimonios
      WHERE publicado = 1
      ORDER BY creado_en DESC, id DESC
      LIMIT ?`,
    [limite]
  );
}

/**
 * Guarda el comentario y lo devuelve ya publicado, para que la página pueda
 * ponerlo arriba del todo sin volver a pedir la lista entera.
 *
 * usuarioId va con lo que haya: quien comenta desde su cuenta queda enlazado y
 * quien pasaba por la página se guarda igual, con su nombre y nada más.
 */
async function crearTestimonio(datos, usuarioId, ip) {
  return consultarUna(
    `INSERT INTO testimonios (usuario_id, nombre, mensaje, ip)
     VALUES (?, ?, ?, ?)
     RETURNING id, nombre, mensaje, creado_en`,
    [usuarioId ?? null, datos.nombre, datos.mensaje, ip ?? null]
  );
}

module.exports = {
  identidadDe,
  asegurarIdentidad,
  configurarIdentidad,
  regenerarToken,
  perfilPublico,
  listarPerdidas,
  perdidaPorId,
  reportarPerdida,
  actualizarPerdida,
  avistamientosDe,
  crearAvistamiento,
  cambiarEstadoAvistamiento,
  listarAdopciones,
  adopcionPorId,
  crearPublicacion,
  actualizarPublicacion,
  actualizarFotoAdopcion,
  solicitudesDe,
  solicitudPorId,
  crearSolicitud,
  solicitudAbiertaDe,
  solicitudesDeUsuario,
  evaluarSolicitud,
  entrevistasDe,
  crearEntrevista,
  crearContrato,
  contratoDe,
  seguimientosDe,
  crearSeguimiento,
  registrarSeguimiento,
  seguimientosVencidos,
  listarTestimonios,
  crearTestimonio,
};
