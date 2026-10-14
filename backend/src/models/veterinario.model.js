'use strict';

const { consultar, consultarUna, ejecutar, enTransaccion } = require('../config/database');

/**
 * Qué se cuenta de un veterinario, y a quién.
 *
 * La ficha completa lleva el correo, el teléfono y el estado de la cuenta:
 * son datos de la persona que trabaja aquí, no del profesional que atiende.
 * Las dos rutas de lectura son públicas —la landing pinta el equipo y el
 * agendamiento deja elegir quién atiende—, así que ahí se responde con la
 * proyección corta y esos campos no salen del servidor. El correo además es
 * el identificador con el que se entra al sistema, y publicar la lista de
 * correos del personal es regalar la mitad de cada credencial.
 *
 * La licencia sí va en la pública, y no es un descuido: es el número de
 * tarjeta profesional, que la landing muestra debajo de cada nombre porque es
 * justamente lo que acredita a quien va a atender a la mascota.
 */
const CAMPOS_PUBLICOS = `v.id, v.licencia, v.especialidad, v.foto, v.descripcion,
         v.duracion_slot_min, v.activo,
         u.nombre`;

const CAMPOS_INTERNOS = `${CAMPOS_PUBLICOS},
         v.usuario_id, u.email, u.telefono, u.estado AS estado_usuario`;

const DESDE = `
    FROM veterinarios v
    JOIN usuarios u ON u.id = v.usuario_id`;

/**
 * `completo` va en true por defecto a propósito: el recorte lo pide solo quien
 * sabe que está respondiendo a alguien sin sesión. Al revés —recortar por
 * defecto— la próxima consulta interna que alguien añada se quedaría sin
 * campos sin que nada avise, y eso se descubre en producción.
 */
function seleccion(completo = true) {
  return `SELECT ${completo ? CAMPOS_INTERNOS : CAMPOS_PUBLICOS}${DESDE}`;
}

async function listar({ soloActivos = true, completo = true } = {}) {
  const where = soloActivos ? "WHERE v.activo = 1 AND u.estado = 'activo'" : '';
  return consultar(`${seleccion(completo)} ${where} ORDER BY u.nombre`);
}

async function buscarPorId(id, { completo = true } = {}) {
  return consultarUna(`${seleccion(completo)} WHERE v.id = ?`, [id]);
}

async function buscarPorUsuario(usuarioId) {
  return consultarUna(`${seleccion()} WHERE v.usuario_id = ?`, [usuarioId]);
}

async function horariosDe(veterinarioId) {
  return consultar(
    `SELECT id, dia_semana, hora_inicio, hora_fin
       FROM horarios_veterinarios
      WHERE veterinario_id = ?
      ORDER BY dia_semana, hora_inicio`,
    [veterinarioId]
  );
}

async function horariosDelDia(veterinarioId, diaSemana) {
  return consultar(
    `SELECT hora_inicio, hora_fin
       FROM horarios_veterinarios
      WHERE veterinario_id = ? AND dia_semana = ?
      ORDER BY hora_inicio`,
    [veterinarioId, diaSemana]
  );
}

async function reemplazarHorarios(veterinarioId, horarios) {
  return enTransaccion(async (conexion) => {
    await conexion.execute('DELETE FROM horarios_veterinarios WHERE veterinario_id = ?', [veterinarioId]);
    for (const h of horarios) {
      await conexion.execute(
        `INSERT INTO horarios_veterinarios (veterinario_id, dia_semana, hora_inicio, hora_fin)
         VALUES (?, ?, ?, ?)`,
        [veterinarioId, h.diaSemana, h.horaInicio, h.horaFin]
      );
    }
  });
}

async function bloqueosEntre(veterinarioId, inicio, fin) {
  return consultar(
    `SELECT id, inicio, fin, motivo
       FROM bloqueos_agenda
      WHERE veterinario_id = ? AND inicio < ? AND fin > ?
      ORDER BY inicio`,
    [veterinarioId, fin, inicio]
  );
}

async function crearBloqueo(veterinarioId, { inicio, fin, motivo }) {
  const resultado = await ejecutar(
    `INSERT INTO bloqueos_agenda (veterinario_id, inicio, fin, motivo)
     VALUES (?, ?, ?, ?)
     RETURNING id`,
    [veterinarioId, inicio, fin, motivo ?? null]
  );
  return resultado.insertId;
}

async function eliminarBloqueo(id, veterinarioId) {
  const resultado = await ejecutar(
    'DELETE FROM bloqueos_agenda WHERE id = ? AND veterinario_id = ?',
    [id, veterinarioId]
  );
  return resultado.affectedRows > 0;
}

async function crear({ usuarioId, licencia, especialidad, descripcion, duracionSlotMin }, conexion = null) {
  const sql = `INSERT INTO veterinarios (usuario_id, licencia, especialidad, descripcion, duracion_slot_min)
               VALUES (?, ?, ?, ?, ?)
            RETURNING id`;
  const params = [usuarioId, licencia, especialidad, descripcion ?? null, duracionSlotMin || 30];
  if (conexion) {
    const [resultado] = await conexion.execute(sql, params);
    return resultado.insertId;
  }
  const resultado = await ejecutar(sql, params);
  return resultado.insertId;
}

async function actualizar(id, datos) {
  await ejecutar(
    `UPDATE veterinarios
        SET especialidad = ?, descripcion = ?, duracion_slot_min = ?, activo = ?
      WHERE id = ?`,
    [datos.especialidad, datos.descripcion ?? null, datos.duracionSlotMin || 30, datos.activo ? 1 : 0, id]
  );
}

module.exports = {
  listar,
  buscarPorId,
  buscarPorUsuario,
  horariosDe,
  horariosDelDia,
  reemplazarHorarios,
  bloqueosEntre,
  crearBloqueo,
  eliminarBloqueo,
  crear,
  actualizar,
};
