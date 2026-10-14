'use strict';

/**
 * Dónde viven los códigos de acceso del personal.
 *
 * En `configuracion.configuraciones`, uno por rol y cifrados. Cifrados y no
 * hasheados porque el administrador tiene que poder volver a leerlos: son
 * códigos que se entregan a la gente, no contraseñas que solo comprueba el
 * servidor. Con la llave fuera de la base, un volcado de la tabla no basta
 * para fabricar cuentas de clínica.
 *
 * Las filas se marcan `editable = 0`: no son parámetros más de la clínica, se
 * cambian por su propia ruta —que además pide la contraseña— y no editando un
 * campo de texto en la pantalla de configuración.
 */

const { consultar, consultarUna, ejecutar } = require('../config/database');
const { cifrar, descifrar } = require('../utils/cifrado');
const codigo = require('../utils/codigoAcceso');

/** La clave de configuración de cada rol. */
function claveDe(rol) {
  if (!codigo.ROLES_CON_CODIGO.includes(rol)) {
    throw new Error(`El rol "${rol}" no lleva código de acceso.`);
  }
  return `seguridad.codigo_${rol}`;
}

const CLAVES = codigo.ROLES_CON_CODIGO.map(claveDe);

/**
 * El código de un rol, o null si todavía no se ha generado.
 *
 * Que no haya no es una avería: es una puerta que la clínica aún no abrió, y
 * mientras siga así el registro con ese rol no acepta a nadie.
 */
async function vigenteDe(rol) {
  const fila = await consultarUna(
    'SELECT valor, actualizado_en FROM configuraciones WHERE sede_id IS NULL AND clave = ?',
    [claveDe(rol)]
  );
  if (!fila) return null;

  return { rol, codigo: descifrar(fila.valor), actualizadoEn: fila.actualizado_en };
}

/**
 * Todos los códigos, en el orden en que se pintan en el panel.
 *
 * Una sola consulta para los dos: son dos filas de la misma tabla y el panel
 * los pide juntos, así que dos viajes a Supabase para eso serían uno de más.
 */
async function todos() {
  const filas = await consultar(
    `SELECT clave, valor, actualizado_en
       FROM configuraciones
      WHERE sede_id IS NULL AND clave IN (${CLAVES.map(() => '?').join(', ')})`,
    CLAVES
  );

  const porClave = new Map(filas.map((fila) => [fila.clave, fila]));

  return codigo.ROLES_CON_CODIGO.map((rol) => {
    const fila = porClave.get(claveDe(rol));

    return {
      rol,
      activo: Boolean(fila),
      codigo: fila ? descifrar(fila.valor) : null,
      actualizadoEn: fila ? fila.actualizado_en : null,
    };
  });
}

/**
 * Cambia el código de un rol por uno nuevo y lo devuelve en claro, una vez.
 *
 * Sirve igual para el primero: la fila se crea si no estaba. Vale la pena
 * decirlo en voz alta: a partir de aquí el anterior deja de servir, así que
 * quien lo tuviera apuntado y no se haya registrado todavía se queda fuera.
 */
async function rotar(rol) {
  const nuevo = codigo.generar(rol);

  const resultado = await ejecutar(
    `INSERT INTO configuraciones (sede_id, clave, valor, tipo, descripcion, editable)
          VALUES (NULL, ?, ?, 'texto', ?, 0)
     ON CONFLICT (sede_id, clave) DO UPDATE
            SET valor = EXCLUDED.valor, actualizado_en = LOCALTIMESTAMP
      RETURNING actualizado_en`,
    [
      claveDe(rol),
      cifrar(nuevo),
      `Código que se escribe en el registro para crear una cuenta de ${rol}. Cifrado en reposo.`,
    ]
  );

  const fila = resultado.rows && resultado.rows[0];
  return { rol, codigo: nuevo, actualizadoEn: fila ? fila.actualizado_en : null };
}

/**
 * ¿Este código es el vigente para ese rol?
 *
 * Se comprueba contra el rol que pidió quien se registra, no contra todos: el
 * código de veterinario no puede servir para pedir una cuenta de
 * administración ni por equivocación.
 */
async function verificar(rol, escrito) {
  const actual = await vigenteDe(rol);
  if (!actual) return false;
  return codigo.coincide(escrito, actual.codigo);
}

module.exports = { vigenteDe, todos, rotar, verificar, claveDe, ROLES: codigo.ROLES_CON_CODIGO };
