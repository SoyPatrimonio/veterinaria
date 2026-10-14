'use strict';

const { consultar, consultarUna, ejecutar, enTransaccion } = require('../config/database');

async function listar({ soloActivos = true } = {}) {
  const where = soloActivos ? 'WHERE s.activo = 1' : '';
  return consultar(
    `SELECT s.id, s.nombre, s.slug, s.descripcion, s.precio, s.duracion_min,
            s.requisitos, s.icono, s.activo,
            COUNT(sv.veterinario_id) AS veterinarios_disponibles
       FROM servicios s
       LEFT JOIN veterinario_servicios sv ON sv.servicio_id = s.id
       ${where}
      GROUP BY s.id
      ORDER BY s.nombre`
  );
}

async function buscarPorId(id) {
  return consultarUna('SELECT * FROM servicios WHERE id = ?', [id]);
}

async function buscarPorSlug(slug) {
  return consultarUna('SELECT * FROM servicios WHERE slug = ?', [slug]);
}

/** Veterinarios habilitados para un servicio (los que puede elegir el cliente). */
async function veterinariosDe(servicioId) {
  return consultar(
    // Sin el correo: esta consulta la sirven /servicios/:id y
    // /servicios/:id/veterinarios, las dos abiertas a quien no tiene sesión.
    `SELECT v.id, v.licencia, v.especialidad, v.foto, v.descripcion, v.duracion_slot_min,
            u.nombre
       FROM veterinario_servicios sv
       JOIN veterinarios v ON v.id = sv.veterinario_id
       JOIN usuarios u     ON u.id = v.usuario_id
      WHERE sv.servicio_id = ? AND v.activo = 1 AND u.estado = 'activo'
      ORDER BY u.nombre`,
    [servicioId]
  );
}

function generarSlug(nombre) {
  return nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita tildes
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

async function crear(datos) {
  return enTransaccion(async (conexion) => {
    const [resultado] = await conexion.execute(
      `INSERT INTO servicios (nombre, slug, descripcion, precio, duracion_min, requisitos, icono, activo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        datos.nombre,
        generarSlug(datos.nombre),
        datos.descripcion,
        datos.precio,
        datos.duracionMin,
        datos.requisitos,
        datos.icono,
        datos.activo ? 1 : 0,
      ]
    );
    const id = resultado.insertId;
    await asignarVeterinarios(id, datos.veterinarios || [], conexion);
    return id;
  });
}

async function actualizar(id, datos) {
  return enTransaccion(async (conexion) => {
    await conexion.execute(
      `UPDATE servicios
          SET nombre = ?, slug = ?, descripcion = ?, precio = ?, duracion_min = ?,
              requisitos = ?, icono = ?, activo = ?
        WHERE id = ?`,
      [
        datos.nombre,
        generarSlug(datos.nombre),
        datos.descripcion,
        datos.precio,
        datos.duracionMin,
        datos.requisitos,
        datos.icono,
        datos.activo ? 1 : 0,
        id,
      ]
    );
    await asignarVeterinarios(id, datos.veterinarios || [], conexion);
  });
}

async function asignarVeterinarios(servicioId, veterinarios, conexion) {
  await conexion.execute('DELETE FROM veterinario_servicios WHERE servicio_id = ?', [servicioId]);
  for (const veterinarioId of veterinarios) {
    await conexion.execute(
      'INSERT INTO veterinario_servicios (servicio_id, veterinario_id) VALUES (?, ?)',
      [servicioId, veterinarioId]
    );
  }
}

async function desactivar(id) {
  const resultado = await ejecutar('UPDATE servicios SET activo = 0 WHERE id = ?', [id]);
  return resultado.affectedRows > 0;
}

module.exports = {
  listar,
  buscarPorId,
  buscarPorSlug,
  veterinariosDe,
  crear,
  actualizar,
  desactivar,
  generarSlug,
};
