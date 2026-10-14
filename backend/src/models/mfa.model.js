'use strict';

/**
 * Segundo factor: secreto, códigos de recuperación y desafíos de ingreso.
 *
 * El reparto es el de siempre en este proyecto: aquí solo se habla con la
 * base. Quién puede activarlo, cuándo se exige y qué pasa si falla lo decide
 * services/auth.service.js.
 */

const crypto = require('crypto');
const { consultar, consultarUna, ejecutar, enTransaccion } = require('../config/database');
const { cifrar, descifrar } = require('../utils/cifrado');

/** Los códigos de recuperación se guardan hasheados, como los tokens. */
function hashCodigo(codigo) {
  return crypto.createHash('sha256').update(String(codigo).toUpperCase().replace(/-/g, '')).digest('hex');
}

/**
 * Códigos de recuperación legibles: cuatro y cuatro, sin caracteres que se
 * confundan al copiarlos a mano de una pantalla a un papel.
 */
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generarCodigo() {
  const bytes = crypto.randomBytes(8);
  const letras = [...bytes].map((b) => ALFABETO[b % ALFABETO.length]).join('');
  return `${letras.slice(0, 4)}-${letras.slice(4, 8)}`;
}

/**
 * El código de seis cifras que se manda al correo en el segundo paso.
 *
 * Es distinto en cada ingreso y de cada persona: sale de `randomInt`, que
 * reparte el millón de combinaciones por igual —un `randomBytes % 1000000`
 * favorecería a las primeras—, y se guarda hasheado junto al desafío, así que
 * ni leyendo la tabla se sabe cuál se envió.
 */
function generarCodigoIngreso() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

/* ------------------------------------------------------------------
   Estado
   ------------------------------------------------------------------ */

async function estadoDe(usuarioId) {
  const fila = await consultarUna(
    `SELECT m.usuario_id, m.secreto, m.activo, m.ultimo_contador, m.confirmado_en,
            (SELECT COUNT(*)::int FROM mfa_codigos c
              WHERE c.usuario_id = m.usuario_id AND c.usado_en IS NULL) AS codigos_disponibles
       FROM mfa m
      WHERE m.usuario_id = ?`,
    [usuarioId]
  );

  return fila ? { ...fila, secreto: descifrar(fila.secreto) } : null;
}

/** ¿Tiene el segundo factor puesto y confirmado? */
async function estaActivo(usuarioId) {
  const fila = await consultarUna('SELECT activo FROM mfa WHERE usuario_id = ?', [usuarioId]);
  return Boolean(fila && fila.activo === 1);
}

/**
 * Guarda un secreto todavía sin confirmar.
 *
 * Reemplaza el que hubiera: si alguien empezó a configurar el segundo factor,
 * cambió de teléfono y vuelve a empezar, el secreto a medias de la primera vez
 * no debe quedarse rondando.
 */
async function guardarSecreto(usuarioId, secreto) {
  await ejecutar(
    `INSERT INTO mfa (usuario_id, secreto, activo)
     VALUES (?, ?, 0)
     ON CONFLICT (usuario_id) DO UPDATE
       SET secreto = EXCLUDED.secreto,
           activo = 0,
           ultimo_contador = NULL,
           confirmado_en = NULL,
           creado_en = LOCALTIMESTAMP`,
    [usuarioId, cifrar(secreto)]
  );
}

/**
 * Activa el segundo factor y deja los códigos de recuperación.
 *
 * Va en una transacción porque activar sin códigos deja a alguien a un
 * teléfono perdido de no poder entrar nunca más, y dejar códigos sin activar
 * los convierte en llaves sueltas de una puerta que no existe.
 */
async function activar(usuarioId, contador, codigos) {
  await enTransaccion(async (conexion) => {
    await conexion.execute(
      `UPDATE mfa
          SET activo = 1, confirmado_en = LOCALTIMESTAMP, ultimo_contador = ?
        WHERE usuario_id = ?`,
      [contador, usuarioId]
    );

    await conexion.execute('DELETE FROM mfa_codigos WHERE usuario_id = ?', [usuarioId]);

    for (const codigo of codigos) {
      await conexion.execute(
        'INSERT INTO mfa_codigos (usuario_id, codigo_hash) VALUES (?, ?)',
        [usuarioId, hashCodigo(codigo)]
      );
    }
  }, usuarioId);
}

/** Quita el segundo factor y sus códigos. */
async function desactivar(usuarioId) {
  await enTransaccion(async (conexion) => {
    await conexion.execute('DELETE FROM mfa_codigos WHERE usuario_id = ?', [usuarioId]);
    await conexion.execute('DELETE FROM mfa WHERE usuario_id = ?', [usuarioId]);
  }, usuarioId);
}

/** Cambia los códigos de recuperación por unos nuevos. */
async function renovarCodigos(usuarioId, codigos) {
  await enTransaccion(async (conexion) => {
    await conexion.execute('DELETE FROM mfa_codigos WHERE usuario_id = ?', [usuarioId]);
    for (const codigo of codigos) {
      await conexion.execute(
        'INSERT INTO mfa_codigos (usuario_id, codigo_hash) VALUES (?, ?)',
        [usuarioId, hashCodigo(codigo)]
      );
    }
  }, usuarioId);
}

/**
 * Marca el último bloque de tiempo aceptado.
 *
 * La condición del WHERE es la que impide reusar un código: solo avanza, así
 * que un código ya gastado —cuyo contador no es mayor que el guardado— no
 * vuelve a pasar aunque siga dentro de su minuto y medio de validez.
 */
async function avanzarContador(usuarioId, contador) {
  const resultado = await ejecutar(
    `UPDATE mfa
        SET ultimo_contador = ?
      WHERE usuario_id = ?
        AND (ultimo_contador IS NULL OR ultimo_contador < ?)`,
    [contador, usuarioId, contador]
  );
  return resultado.affectedRows > 0;
}

/** Gasta un código de recuperación. Devuelve cuántos quedan, o null si no valía. */
async function gastarCodigo(usuarioId, codigo) {
  const fila = await consultarUna(
    `UPDATE mfa_codigos
        SET usado_en = LOCALTIMESTAMP
      WHERE usuario_id = ? AND codigo_hash = ? AND usado_en IS NULL
      RETURNING id`,
    [usuarioId, hashCodigo(codigo)]
  );
  if (!fila) return null;

  const restantes = await consultarUna(
    'SELECT COUNT(*)::int AS total FROM mfa_codigos WHERE usuario_id = ? AND usado_en IS NULL',
    [usuarioId]
  );
  return restantes ? restantes.total : 0;
}

/* ------------------------------------------------------------------
   Desafíos de ingreso
   ------------------------------------------------------------------ */

/**
 * Abre el paso intermedio del ingreso y devuelve el token que lo identifica.
 *
 * De él solo se guarda el hash, igual que con las sesiones: la tabla no sirve
 * para suplantar a nadie aunque se lea entera. Lo mismo vale para el código
 * que se manda al correo, si es que se manda: aquí queda su hash, y comparar
 * es volver a hashear lo que escriba la persona.
 */
async function crearDesafio(usuarioId, { minutos = 5, ip = null, agente = null, codigo = null } = {}) {
  const token = crypto.randomBytes(32).toString('hex');

  await ejecutar(
    `INSERT INTO mfa_desafios (usuario_id, token_hash, codigo_hash, ip, agente, expira_en)
     VALUES (?, ?, ?, ?, ?, LOCALTIMESTAMP + (? || ' minutes')::interval)`,
    [usuarioId, hashCodigo(token), codigo ? hashCodigo(codigo) : null, ip, agente, String(minutos)]
  );

  return token;
}

/** El desafío si sigue vigente, con el secreto del usuario ya cargado. */
async function desafioVigente(token) {
  const fila = await consultarUna(
    `SELECT d.id, d.usuario_id, d.intentos, d.codigo_hash,
            m.secreto, m.activo, m.ultimo_contador,
            u.email
       FROM mfa_desafios d
       LEFT JOIN mfa m ON m.usuario_id = d.usuario_id
       JOIN usuarios u ON u.id = d.usuario_id
      WHERE d.token_hash = ?
        AND d.usado_en IS NULL
        AND d.expira_en > LOCALTIMESTAMP`,
    [hashCodigo(token)]
  );

  return fila ? { ...fila, secreto: descifrar(fila.secreto) } : null;
}

/**
 * Fallos de código de esta cuenta en los últimos minutos, contando todos sus
 * desafíos.
 *
 * El tope por desafío no frenaba nada por sí solo: quien ya tiene la
 * contraseña puede pedir un desafío nuevo cada vez y seguir probando de tres
 * en tres. Con seis cifras son un millón de combinaciones y una ventana que
 * acepta tres a la vez; sin un contador por CUENTA, eso se recorre con
 * paciencia. Este es el freno que de verdad cierra la puerta.
 */
async function fallosRecientes(usuarioId, minutos = 15) {
  const fila = await consultarUna(
    `SELECT COUNT(*)::int AS total
       FROM intentos_login
      WHERE usuario_id = ?
        AND motivo = 'mfa_incorrecto'
        AND creado_en > LOCALTIMESTAMP - (? || ' minutes')::interval`,
    [usuarioId, String(minutos)]
  );
  return fila ? fila.total : 0;
}

/**
 * Códigos que se le mandaron al correo de esta cuenta en los últimos minutos.
 *
 * Se cuentan los desafíos con código, que es exactamente un correo cada uno.
 * Vive en la base y no en la memoria del proceso a propósito: en Vercel cada
 * instancia tiene su propia memoria y un tope guardado ahí se multiplica por
 * el número de instancias despiertas.
 */
async function codigosEnviados(usuarioId, minutos = 15) {
  const fila = await consultarUna(
    `SELECT COUNT(*)::int AS total
       FROM mfa_desafios
      WHERE usuario_id = ?
        AND codigo_hash IS NOT NULL
        AND creado_en > LOCALTIMESTAMP - (? || ' minutes')::interval`,
    [usuarioId, String(minutos)]
  );
  return fila ? fila.total : 0;
}

/** Suma un fallo y devuelve cuántos lleva. */
async function sumarIntento(id) {
  const fila = await consultarUna(
    'UPDATE mfa_desafios SET intentos = intentos + 1 WHERE id = ? RETURNING intentos',
    [id]
  );
  return fila ? fila.intentos : 0;
}

async function cerrarDesafio(id) {
  await ejecutar('UPDATE mfa_desafios SET usado_en = LOCALTIMESTAMP WHERE id = ?', [id]);
}

/** Cuántas cuentas tienen el segundo factor puesto. Para el panel de seguridad. */
async function resumen() {
  return consultarUna(
    `SELECT COUNT(*) FILTER (WHERE m.activo = 1)::int AS con_mfa,
            COUNT(u.id)::int AS cuentas,
            COUNT(*) FILTER (WHERE m.activo = 1 AND r.nombre = 'admin')::int AS admins_con_mfa,
            COUNT(*) FILTER (WHERE r.nombre = 'admin')::int AS admins
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
       LEFT JOIN mfa m ON m.usuario_id = u.id
      WHERE u.estado = 'activo'`
  );
}

/** Quién tiene el segundo factor activo, para el panel de seguridad. */
async function listar() {
  return consultar(
    `SELECT u.id, u.nombre, u.email, r.nombre AS rol,
            COALESCE(m.activo, 0) AS activo, m.confirmado_en,
            (SELECT COUNT(*)::int FROM mfa_codigos c
              WHERE c.usuario_id = u.id AND c.usado_en IS NULL) AS codigos_disponibles
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
       LEFT JOIN mfa m ON m.usuario_id = u.id
      WHERE u.estado = 'activo' AND r.nombre <> 'cliente'
      ORDER BY r.nombre, u.nombre`
  );
}

module.exports = {
  hashCodigo,
  generarCodigo,
  generarCodigoIngreso,
  estadoDe,
  estaActivo,
  guardarSecreto,
  activar,
  desactivar,
  renovarCodigos,
  avanzarContador,
  gastarCodigo,
  fallosRecientes,
  codigosEnviados,
  crearDesafio,
  desafioVigente,
  sumarIntento,
  cerrarDesafio,
  resumen,
  listar,
};
