'use strict';

/**
 * Numeración de los documentos con serie propia: PREFIJO-AÑO-0001.
 *
 * El consecutivo se calcula leyendo el mayor del año en curso, y eso dos
 * cajeros a la vez lo romperían: los dos leerían el mismo número y el segundo
 * chocaría contra el índice único. Por eso se toma antes un bloqueo de
 * transacción sobre el nombre de la serie —no sobre la tabla—, que solo
 * retiene a quien esté pidiendo un número de esa misma serie y se suelta solo
 * al terminar la transacción, tanto si confirma como si se deshace.
 *
 * Se usa el año de la fecha del documento y no el actual porque una compra se
 * puede registrar con fecha del año pasado, y su número tiene que caer en la
 * serie de ese año.
 */

// Las tablas se interpolan en el SQL (no admiten parámetro), así que la lista
// es cerrada: cualquier otro nombre es un error de programación, no una
// entrada del usuario.
const TABLAS = {
  facturas: 'FAC',
  compras: 'COM',
  devoluciones: 'DEV',
  recetas: 'REC',
  ordenes_laboratorio: 'LAB',
  muestras: 'M',
  estudios_imagen: 'IMG',
  pedidos: 'PED',
  tickets: 'PQRS',
  contratos_adopcion: 'ADO',
};

// Casi todas guardan el consecutivo en `numero`; las muestras de laboratorio
// lo llaman `codigo`. Como el nombre se interpola en el SQL, también sale de
// una lista cerrada.
const COLUMNAS = {
  muestras: 'codigo',
};

async function siguienteNumero(conexion, tabla, anio = new Date().getFullYear()) {
  const prefijo = TABLAS[tabla];
  if (!prefijo) throw new Error(`No hay serie de numeración definida para "${tabla}".`);

  const columna = COLUMNAS[tabla] || 'numero';
  const serie = `${prefijo}-${anio}`;

  await conexion.execute('SELECT pg_advisory_xact_lock(hashtext(?))', [`huellitas.numeracion.${serie}`]);

  const fila = await conexion.consultarUna(
    `SELECT COALESCE(MAX(regexp_replace(${columna}, '^.*-', '')::bigint), 0) + 1 AS siguiente
       FROM ${tabla}
      WHERE ${columna} LIKE ? AND ${columna} ~ '-[0-9]+$'`,
    [`${serie}-%`]
  );

  return `${serie}-${String(fila.siguiente).padStart(4, '0')}`;
}

module.exports = { siguienteNumero, TABLAS };
