'use strict';

const { Pool, types } = require('pg');
const { db } = require('./env');

/* ------------------------------------------------------------------
   Cómo se leen los tipos de PostgreSQL

   El resto de la aplicación (y el frontend) espera fechas como texto
   'YYYY-MM-DD HH:mm:ss' y números como números. Sin estos conversores,
   node-postgres devolvería objetos Date —que al pasar por JSON se
   convierten a UTC y desplazan la hora de la agenda— y los NUMERIC y
   los COUNT() como cadenas.
   ------------------------------------------------------------------ */

const OID = { DATE: 1082, TIME: 1083, TIMESTAMP: 1114, TIMESTAMPTZ: 1184, NUMERIC: 1700, INT8: 20 };

// Fechas y horas: tal cual las escribe PostgreSQL, sin convertir a Date.
types.setTypeParser(OID.DATE, (valor) => valor);
types.setTypeParser(OID.TIME, (valor) => valor);
types.setTypeParser(OID.TIMESTAMP, (valor) => valor);

// DECIMAL/NUMERIC como número (precio, peso). Los valores del proyecto están
// muy lejos del límite de precisión de un double.
types.setTypeParser(OID.NUMERIC, (valor) => (valor === null ? null : Number.parseFloat(valor)));

// COUNT() y SUM() devuelven BIGINT; sin esto llegarían como '0' y las
// comparaciones estrictas del código fallarían.
types.setTypeParser(OID.INT8, (valor) => (valor === null ? null : Number.parseInt(valor, 10)));

/* ------------------------------------------------------------------
   Pool de conexiones
   ------------------------------------------------------------------ */

/* ------------------------------------------------------------------
   Esquemas

   La base está repartida en esquemas, uno por módulo. Mandar el
   search_path en el arranque de la conexión deja que las consultas sigan
   escribiendo `FROM citas` en vez de `FROM agenda.citas`.

   Va como parámetro `options` de la conexión y no como un `SET` posterior
   porque el pooler de Supabase trabaja en modo transacción: un SET suelto
   podría no acompañar a la siguiente consulta, mientras que esto viaja en
   el paquete de arranque y lo aplica el propio PostgreSQL.

   El orden importa: ante dos tablas con el mismo nombre gana la del
   esquema que aparezca antes. Por eso en la base no se repiten nombres de
   tabla entre módulos, y esta lista tiene que ir igual que la de
   schema.sql (public.huellitas_esquemas()).
   ------------------------------------------------------------------ */
const ESQUEMAS = [
  'configuracion', 'seguridad', 'usuarios', 'mascotas', 'agenda',
  'historia_clinica', 'inventario', 'facturacion', 'comunicacion',
  'archivos', 'urgencias', 'farmacia', 'laboratorio', 'imagenes',
  'nutricion', 'telemedicina', 'comunidad', 'tienda', 'fidelizacion',
  'soporte', 'personal', 'equipos', 'bioseguridad', 'integraciones',
  'alertas', 'ia',
  'prevencion', 'banco_sangre', 'banco_tejidos', 'odontologia',
  'cardiologia', 'dermatologia', 'oftalmologia', 'rehabilitacion',
  'anestesia', 'comportamiento', 'genetica', 'reproduccion', 'calidad',
  'interconsulta', 'atencion', 'dispositivos', 'gestion_residuos',
  'contratos', 'sucursales', 'finanzas', 'centro_operaciones',
  'automatizacion', 'documentos', 'continuidad',
  'public', 'extensions',
];

const OPCIONES_CONEXION = `-c search_path=${ESQUEMAS.join(',')}`;

// Cuánto se guarda una conexión sin usar antes de devolverla al pooler.
const MS_CONEXION_INACTIVA = 30_000;

// El pooler de Supabase tarda más de lo normal en el primer arranque en frío,
// que en serverless es frecuente. 20 s deja margen sin agotar el tiempo máximo
// de la función (30 s en vercel.json).
const MS_ESPERA_CONEXION = 20_000;

const pool = new Pool({
  connectionString: db.url,
  max: db.connectionLimit,
  idleTimeoutMillis: MS_CONEXION_INACTIVA,
  options: OPCIONES_CONEXION,
  connectionTimeoutMillis: MS_ESPERA_CONEXION,
  // Supabase exige TLS. No se verifica la cadena porque el pooler presenta un
  // certificado propio que no está en el almacén de Node.
  ssl: db.ssl ? { rejectUnauthorized: false } : false,
  application_name: 'huellitas-api',
});

// Un error en un cliente inactivo no debe tumbar el proceso.
pool.on('error', (error) => {
  console.error('[db] error en una conexión inactiva:', error.message);
});

/* ------------------------------------------------------------------
   Placeholders

   Los modelos siguen escribiendo `?`, como en MySQL, y aquí se traducen
   a la numeración de PostgreSQL ($1, $2, …). El conversor se salta las
   cadenas, los identificadores entrecomillados y los comentarios, para
   no tocar un signo de interrogación que forme parte de un texto.
   ------------------------------------------------------------------ */
function traducirPlaceholders(sql) {
  if (!sql.includes('?')) return sql;

  let salida = '';
  let indice = 0;
  let i = 0;

  while (i < sql.length) {
    const c = sql[i];

    if (c === "'" || c === '"') {
      // Cadena o identificador: se copia entero, respetando '' y "" internos.
      const comilla = c;
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === comilla) {
          if (sql[j + 1] === comilla) { j += 2; continue; }
          break;
        }
        j += 1;
      }
      salida += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }

    if (c === '-' && sql[i + 1] === '-') {
      const fin = sql.indexOf('\n', i);
      const corte = fin === -1 ? sql.length : fin;
      salida += sql.slice(i, corte);
      i = corte;
      continue;
    }

    if (c === '/' && sql[i + 1] === '*') {
      const fin = sql.indexOf('*/', i + 2);
      const corte = fin === -1 ? sql.length : fin + 2;
      salida += sql.slice(i, corte);
      i = corte;
      continue;
    }

    if (c === '?') {
      indice += 1;
      salida += `$${indice}`;
      i += 1;
      continue;
    }

    salida += c;
    i += 1;
  }

  return salida;
}

/** Normaliza la respuesta de pg al formato que ya usaban los modelos. */
function normalizar(resultado) {
  const filas = resultado.rows || [];
  return {
    rows: filas,
    rowCount: resultado.rowCount,
    // Nombres heredados de mysql2 para no tocar los modelos.
    affectedRows: resultado.rowCount,
    // Los INSERT que necesitan el id llevan RETURNING id.
    insertId: filas.length && filas[0].id !== undefined ? filas[0].id : null,
  };
}

/* ------------------------------------------------------------------
   Vigilancia de las consultas

   Todas las consultas del sistema pasan por `correr`, así que es el
   único sitio donde hace falta medir. Lo que se busca ver es esto:

     - la que tarda de más, porque en serverless una consulta lenta se
       come el tiempo de la función y acaba en un 504 que por fuera
       parece "la web no carga";
     - la que falla, con su SQLSTATE, porque un 42501 (permiso
       denegado) o un 42P01 (tabla que no está) son avisos de que algo
       se movió en la base, no errores de la aplicación;
     - cuántas van, para notar de un vistazo si una pantalla dispara
       cien consultas donde debería hacer tres.

   Lo que NO se registra son los parámetros. Ahí viajan correos,
   documentos, diagnósticos y hashes de token: dejarlos en el registro
   sería sacar los datos de la clínica de la base —donde están
   protegidos— y ponerlos en un archivo de texto que ve cualquiera con
   acceso al panel de Vercel. Con la consulta y el tiempo alcanza para
   saber qué pasó.
   ------------------------------------------------------------------ */

// A partir de aquí una consulta se considera lenta y se registra.
const MS_CONSULTA_LENTA = Number(process.env.DB_CONSULTA_LENTA_MS || 1000);

// Cuánto SQL se escribe en el registro. Lo suficiente para reconocer la
// consulta sin llenar el archivo con un SELECT de cuarenta líneas.
const LARGO_SQL_REGISTRO = 300;

const estadisticas = {
  total: 0,
  errores: 0,
  lentas: 0,
  msTotal: 0,
  // La más lenta desde que arrancó esta instancia, para tener un punto de
  // partida cuando alguien pregunta "¿por qué va lento?".
  peor: null,
  ultimoError: null,
};

/** El SQL en una línea y recortado, para que quepa en el registro. */
function resumirSql(sql) {
  const plano = String(sql).replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ').trim();
  return plano.length > LARGO_SQL_REGISTRO ? `${plano.slice(0, LARGO_SQL_REGISTRO)}…` : plano;
}

/**
 * Lo que lleva visto esta instancia.
 *
 * Se reinicia en cada arranque en frío, y en Vercel cada instancia cuenta lo
 * suyo: son números para mirar en caliente, no una métrica histórica. Para eso
 * está el registro, que sí se conserva.
 */
function estadisticasConsultas() {
  return {
    ...estadisticas,
    msPromedio: estadisticas.total ? Math.round(estadisticas.msTotal / estadisticas.total) : 0,
    umbralLentaMs: MS_CONSULTA_LENTA,
  };
}

async function correr(ejecutor, sql, params) {
  const arranque = Date.now();
  estadisticas.total += 1;

  try {
    const resultado = await ejecutor.query(traducirPlaceholders(sql), params);

    const ms = Date.now() - arranque;
    estadisticas.msTotal += ms;

    if (!estadisticas.peor || ms > estadisticas.peor.ms) {
      estadisticas.peor = { ms, sql: resumirSql(sql), cuando: new Date().toISOString() };
    }
    if (ms >= MS_CONSULTA_LENTA) {
      estadisticas.lentas += 1;
      console.warn(`[db] consulta lenta (${ms} ms): ${resumirSql(sql)}`);
    }

    return resultado;
  } catch (error) {
    const ms = Date.now() - arranque;
    estadisticas.msTotal += ms;
    estadisticas.errores += 1;
    estadisticas.ultimoError = {
      codigo: error.code || null,
      mensaje: error.message,
      cuando: new Date().toISOString(),
    };

    // Va aquí y no solo en el manejador de errores porque ahí ya no se sabe
    // qué consulta fue: llega el error de PostgreSQL suelto, sin el SQL.
    console.error(`[db] falló (${error.code || 'sin código'}, ${ms} ms): ${resumirSql(sql)} — ${error.message}`);
    throw error;
  }
}

/** SELECT que devuelve varias filas. */
async function consultar(sql, params = []) {
  const resultado = await correr(pool, sql, params);
  return resultado.rows;
}

/** SELECT que devuelve una fila o null. */
async function consultarUna(sql, params = []) {
  const filas = await consultar(sql, params);
  return filas.length ? filas[0] : null;
}

/** INSERT/UPDATE/DELETE. Devuelve { insertId, affectedRows, rows }. */
async function ejecutar(sql, params = []) {
  return normalizar(await correr(pool, sql, params));
}

/**
 * Envuelve un cliente de pg con la misma interfaz que tenía la conexión de
 * mysql2 (`const [resultado] = await conexion.execute(...)`), para que los
 * modelos que participan en transacciones no cambien.
 */
function envolver(cliente) {
  return {
    cliente,
    async execute(sql, params = []) {
      return [normalizar(await correr(cliente, sql, params)), null];
    },
    async query(sql, params = []) {
      return [normalizar(await correr(cliente, sql, params)), null];
    },
    async consultar(sql, params = []) {
      const resultado = await correr(cliente, sql, params);
      return resultado.rows;
    },
    async consultarUna(sql, params = []) {
      const filas = await this.consultar(sql, params);
      return filas.length ? filas[0] : null;
    },
  };
}

/**
 * Ejecuta varias consultas dentro de una transacción.
 * El callback recibe la conexión; si lanza, se hace ROLLBACK.
 *
 * `usuarioId` es opcional: cuando se pasa, queda disponible dentro de la
 * transacción como `huellitas.usuario_id`, que es lo que leen los
 * disparadores que dejan rastro de quién hizo el cambio (por ejemplo el
 * de agenda.cita_historial). Se usa SET LOCAL para que muera con la
 * transacción y no se filtre a la siguiente que reutilice la conexión.
 */
async function enTransaccion(callback, usuarioId = null) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    if (usuarioId) {
      await cliente.query('SELECT set_config($1, $2, true)', ['huellitas.usuario_id', String(usuarioId)]);
    }
    const resultado = await callback(envolver(cliente));
    await cliente.query('COMMIT');
    return resultado;
  } catch (error) {
    // El error que se propaga es el original, no el del ROLLBACK: es el que
    // explica por qué falló la operación. Pero un ROLLBACK que no funciona
    // significa que la conexión se rompió a mitad de la transacción, y eso hay
    // que poder verlo: en silencio parecería que todo se deshizo bien.
    try {
      await cliente.query('ROLLBACK');
    } catch (fallo) {
      console.error('[db] no se pudo deshacer la transacción:', fallo.message);
    }
    throw error;
  } finally {
    cliente.release();
  }
}

/**
 * Comprueba que la base responde y que su zona horaria coincide con la del
 * proceso. Las citas se guardan como TIMESTAMP sin zona: si la base estuviera
 * en UTC y el servidor en Bogotá, NOW() y las horas guardadas quedarían
 * desfasadas cinco horas. La zona la fija schema.sql con ALTER DATABASE; esto
 * solo avisa si alguien cargó el esquema en otro servidor.
 */
async function verificarConexion() {
  const cliente = await pool.connect();
  try {
    const { rows } = await cliente.query('SHOW TIME ZONE');
    const zonaBase = rows[0].TimeZone;
    if (zonaBase !== db.timezone) {
      console.warn(
        `[db] la base usa la zona ${zonaBase} y el servidor ${db.timezone}. ` +
        'Las horas de la agenda saldrán desfasadas. ' +
        `Ejecuta: ALTER DATABASE <base> SET timezone TO '${db.timezone}';`
      );
    }
    return { zonaBase };
  } finally {
    cliente.release();
  }
}

module.exports = {
  pool,
  ESQUEMAS,
  OPCIONES_CONEXION,
  consultar,
  consultarUna,
  ejecutar,
  enTransaccion,
  verificarConexion,
  traducirPlaceholders,
  estadisticasConsultas,
};
