'use strict';

const { consultar, consultarUna, ejecutar } = require('../config/database');

const SELECT_BASE = `
  SELECT m.id, m.cliente_id, m.nombre, m.foto, m.especie_id, m.raza_id, m.sexo,
         m.fecha_nacimiento, m.peso_kg, m.color, m.microchip, m.esterilizado,
         m.informacion, m.activo, m.creado_en,
         e.nombre AS especie,
         r.nombre AS raza,
         u.nombre AS cliente_nombre,
         u.telefono AS cliente_telefono,
         -- Equivalente al TIMESTAMPDIFF(MONTH, …) de MySQL: AGE() da el
         -- intervalo exacto y de ahí se sacan los meses cumplidos.
         (EXTRACT(YEAR  FROM AGE(CURRENT_DATE, m.fecha_nacimiento)) * 12
        + EXTRACT(MONTH FROM AGE(CURRENT_DATE, m.fecha_nacimiento)))::int AS edad_meses
    FROM mascotas m
    JOIN especies e  ON e.id = m.especie_id
    LEFT JOIN razas r ON r.id = m.raza_id
    JOIN clientes c  ON c.id = m.cliente_id
    JOIN usuarios u  ON u.id = c.usuario_id`;

async function listarPorCliente(clienteId, incluirInactivas = false) {
  const filtro = incluirInactivas ? '' : ' AND m.activo = 1';
  return consultar(`${SELECT_BASE} WHERE m.cliente_id = ?${filtro} ORDER BY m.nombre`, [clienteId]);
}

/** Listado para veterinarios y admin, con búsqueda por mascota o dueño. */
async function listarTodas({ busqueda = null, limite = 50, desplazamiento = 0 }) {
  const condiciones = ['m.activo = 1'];
  const params = [];

  if (busqueda) {
    condiciones.push('(m.nombre ILIKE ? OR u.nombre ILIKE ? OR m.microchip ILIKE ?)');
    const patron = `%${busqueda}%`;
    params.push(patron, patron, patron);
  }

  const lim = Math.min(Math.max(Number.parseInt(limite, 10) || 50, 1), 200);
  const off = Math.max(Number.parseInt(desplazamiento, 10) || 0, 0);

  return consultar(
    `${SELECT_BASE} WHERE ${condiciones.join(' AND ')} ORDER BY m.nombre LIMIT ${lim} OFFSET ${off}`,
    params
  );
}

async function buscarPorId(id) {
  return consultarUna(`${SELECT_BASE} WHERE m.id = ?`, [id]);
}

async function crear(clienteId, datos) {
  const resultado = await ejecutar(
    `INSERT INTO mascotas
       (cliente_id, nombre, especie_id, raza_id, sexo, fecha_nacimiento,
        peso_kg, color, microchip, esterilizado, informacion)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      clienteId,
      datos.nombre,
      datos.especieId,
      datos.razaId ?? null,
      datos.sexo || 'desconocido',
      datos.fechaNacimiento ?? null,
      datos.pesoKg ?? null,
      datos.color ?? null,
      datos.microchip ?? null,
      datos.esterilizado ? 1 : 0,
      datos.informacion ?? null,
    ]
  );
  return resultado.insertId;
}

async function actualizar(id, datos) {
  await ejecutar(
    `UPDATE mascotas
        SET nombre = ?, especie_id = ?, raza_id = ?, sexo = ?, fecha_nacimiento = ?,
            peso_kg = ?, color = ?, microchip = ?, esterilizado = ?, informacion = ?
      WHERE id = ?`,
    [
      datos.nombre,
      datos.especieId,
      datos.razaId ?? null,
      datos.sexo || 'desconocido',
      datos.fechaNacimiento ?? null,
      datos.pesoKg ?? null,
      datos.color ?? null,
      datos.microchip ?? null,
      datos.esterilizado ? 1 : 0,
      datos.informacion ?? null,
      id,
    ]
  );
}

async function actualizarFoto(id, ruta) {
  await ejecutar('UPDATE mascotas SET foto = ? WHERE id = ?', [ruta, id]);
}

/**
 * No se borra físicamente: la mascota está referenciada por citas e historia
 * clínica, que son registros que la clínica debe conservar.
 */
async function desactivar(id) {
  const resultado = await ejecutar('UPDATE mascotas SET activo = 0 WHERE id = ?', [id]);
  return resultado.affectedRows > 0;
}

async function reactivar(id) {
  const resultado = await ejecutar('UPDATE mascotas SET activo = 1 WHERE id = ?', [id]);
  return resultado.affectedRows > 0;
}

module.exports = {
  listarPorCliente,
  listarTodas,
  buscarPorId,
  crear,
  actualizar,
  actualizarFoto,
  desactivar,
  reactivar,
};
