'use strict';

const crypto = require('crypto');
const { consultar, consultarUna, ejecutar, enTransaccion } = require('../config/database');

/**
 * Telemedicina.
 *
 * El sistema no transporta vídeo: guarda la sala, el consentimiento, el chat y
 * el pago, y deja la consulta escrita en la historia clínica. El enlace de la
 * videollamada lo pone el proveedor configurado en integraciones; aquí solo se
 * almacena.
 */

const SELECCION = `
  s.*, m.nombre AS mascota_nombre, m.foto AS mascota_foto,
  e.nombre AS especie,
  uc.id AS cliente_usuario_id, uc.nombre AS cliente_nombre, uc.telefono AS cliente_telefono,
  uv.id AS veterinario_usuario_id, uv.nombre AS veterinario_nombre, v.especialidad,
  c.inicio AS cita_inicio`;

const DESDE = `
  FROM sesiones_telemedicina s
  JOIN mascotas m       ON m.id = s.mascota_id
  JOIN especies e       ON e.id = m.especie_id
  JOIN clientes cl      ON cl.id = s.cliente_id
  JOIN usuarios uc      ON uc.id = cl.usuario_id
  JOIN veterinarios v   ON v.id = s.veterinario_id
  JOIN usuarios uv      ON uv.id = v.usuario_id
  LEFT JOIN citas c     ON c.id = s.cita_id`;

/** Código de sala: va en la URL, así que no puede derivarse del id. */
function nuevoCodigoSala() {
  return `sala-${crypto.randomBytes(9).toString('base64url')}`;
}

async function listar({ clienteId = null, veterinarioId = null, estado = null, limite = 50 } = {}) {
  const condiciones = [];
  const params = [];

  if (clienteId) { condiciones.push('s.cliente_id = ?'); params.push(clienteId); }
  if (veterinarioId) { condiciones.push('s.veterinario_id = ?'); params.push(veterinarioId); }
  if (estado) { condiciones.push('s.estado = ?'); params.push(estado); }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 50, 1), 200);

  return consultar(
    `SELECT ${SELECCION} ${DESDE} ${where} ORDER BY s.creado_en DESC LIMIT ${lim}`,
    params
  );
}

async function porId(id) {
  return consultarUna(`SELECT ${SELECCION} ${DESDE} WHERE s.id = ?`, [id]);
}

async function porCodigoSala(codigo) {
  return consultarUna(`SELECT ${SELECCION} ${DESDE} WHERE s.codigo_sala = ?`, [codigo]);
}

async function crear(datos) {
  const resultado = await ejecutar(
    `INSERT INTO sesiones_telemedicina
       (cita_id, mascota_id, cliente_id, veterinario_id, codigo_sala, motivo)
     VALUES (?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      datos.citaId ?? null,
      datos.mascotaId,
      datos.clienteId,
      datos.veterinarioId,
      nuevoCodigoSala(),
      datos.motivo ?? null,
    ]
  );
  return resultado.insertId;
}

/** Deja constancia de que el propietario aceptó ser atendido a distancia. */
async function firmarConsentimiento(sesionId, datos, usuarioId, ip) {
  return enTransaccion(async (conexion) => {
    const hash = crypto.createHash('sha256').update(datos.documentoTexto, 'utf8').digest('hex');

    const [firma] = await conexion.execute(
      `INSERT INTO firmas_procedimientos
         (entidad, entidad_id, mascota_id, firmante_id, firmante_nombre, firmante_documento,
          rol_firmante, documento_texto, documento_hash, firma_imagen, ip)
       SELECT 'sesiones_telemedicina', s.id, s.mascota_id, ?, ?, ?, 'propietario', ?, ?, ?, ?
         FROM sesiones_telemedicina s WHERE s.id = ?
       RETURNING id`,
      [
        usuarioId ?? null,
        datos.firmanteNombre,
        datos.firmanteDocumento ?? null,
        datos.documentoTexto,
        hash,
        datos.firmaImagen ?? null,
        ip ?? null,
        sesionId,
      ]
    );

    if (!firma.affectedRows) return null;

    await conexion.execute('UPDATE sesiones_telemedicina SET firma_id = ? WHERE id = ?', [
      firma.insertId,
      sesionId,
    ]);

    return firma.insertId;
  }, usuarioId);
}

async function marcarPagada(sesionId, facturaId = null) {
  const resultado = await ejecutar(
    'UPDATE sesiones_telemedicina SET pagada = 1, factura_id = COALESCE(?, factura_id) WHERE id = ?',
    [facturaId, sesionId]
  );
  return resultado.affectedRows > 0;
}

/**
 * Cambia el estado. Al pasar a 'en_curso' se sella la hora de inicio y al
 * finalizar la de fin: son los dos datos que después permiten cobrar la
 * consulta y auditar cuánto duró.
 */
async function cambiarEstado(id, datos) {
  const resultado = await ejecutar(
    `UPDATE sesiones_telemedicina
        SET estado = ?,
            resumen = COALESCE(?, resumen),
            inicio = CASE WHEN ? = 'en_curso'    THEN COALESCE(inicio, LOCALTIMESTAMP) ELSE inicio END,
            fin    = CASE WHEN ? = 'finalizada'  THEN COALESCE(fin, LOCALTIMESTAMP)    ELSE fin END
      WHERE id = ?`,
    [datos.estado, datos.resumen ?? null, datos.estado, datos.estado, id]
  );
  return resultado.affectedRows > 0;
}

/**
 * Cierra la videoconsulta dejándola escrita en la historia clínica.
 *
 * Una atención que no queda en la historia es una atención que, para efectos
 * prácticos, no ocurrió: por eso la consulta se crea en la misma transacción
 * que cierra la sesión.
 */
async function finalizarConConsulta(sesion, resumen, usuarioId) {
  return enTransaccion(async (conexion) => {
    const historia = await conexion.consultarUna(
      'SELECT id FROM historias_clinicas WHERE mascota_id = ?',
      [sesion.mascota_id]
    );
    if (!historia) throw new Error('Esa mascota no tiene historia clínica abierta.');

    const [consulta] = await conexion.execute(
      `INSERT INTO consultas (historia_id, cita_id, veterinario_id, tipo, motivo, observaciones, estado)
       VALUES (?, ?, ?, 'consulta', ?, ?, 'cerrada')
       RETURNING id`,
      [
        historia.id,
        sesion.cita_id ?? null,
        sesion.veterinario_id,
        sesion.motivo || 'Videoconsulta',
        resumen ?? null,
      ]
    );

    await conexion.execute(
      `UPDATE sesiones_telemedicina
          SET estado = 'finalizada', fin = COALESCE(fin, LOCALTIMESTAMP),
              resumen = COALESCE(?, resumen), consulta_id = ?
        WHERE id = ?`,
      [resumen ?? null, consulta.insertId, sesion.id]
    );

    if (sesion.cita_id) {
      await conexion.execute(
        `UPDATE citas SET estado = 'atendida' WHERE id = ? AND estado NOT IN ('cancelada','no_asistio')`,
        [sesion.cita_id]
      );
    }

    return consulta.insertId;
  }, usuarioId);
}

/* ------------------------------------------------------------------
   Chat
   ------------------------------------------------------------------ */

async function mensajes(sesionId) {
  return consultar(
    `SELECT mt.*, u.nombre AS autor_nombre, r.nombre AS autor_rol
       FROM mensajes_telemedicina mt
       JOIN usuarios u ON u.id = mt.autor_id
       JOIN roles r    ON r.id = u.rol_id
      WHERE mt.sesion_id = ?
      ORDER BY mt.creado_en`,
    [sesionId]
  );
}

async function crearMensaje(sesionId, autorId, datos) {
  const resultado = await ejecutar(
    `INSERT INTO mensajes_telemedicina (sesion_id, autor_id, tipo, texto, archivo, mime)
     VALUES (?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [sesionId, autorId, datos.tipo, datos.texto ?? null, datos.archivo ?? null, datos.mime ?? null]
  );
  return resultado.insertId;
}

/** Marca como leídos los mensajes que escribió la otra parte. */
async function marcarLeidos(sesionId, usuarioId) {
  const resultado = await ejecutar(
    `UPDATE mensajes_telemedicina
        SET leido_en = LOCALTIMESTAMP
      WHERE sesion_id = ? AND autor_id <> ? AND leido_en IS NULL`,
    [sesionId, usuarioId]
  );
  return resultado.affectedRows;
}

module.exports = {
  listar,
  porId,
  porCodigoSala,
  crear,
  firmarConsentimiento,
  marcarPagada,
  cambiarEstado,
  finalizarConConsulta,
  mensajes,
  crearMensaje,
  marcarLeidos,
};
