'use strict';

/**
 * Correo saliente.
 *
 * Hoy sale por aquí una sola cosa: el código de seis cifras del segundo paso
 * del ingreso. Es un correo que la persona está esperando con la pantalla
 * abierta, así que el envío se hace en el momento y su resultado sí importa
 * —a diferencia de los avisos internos, que son de cortesía—: si no sale, el
 * ingreso tiene que decirlo en vez de dejar a alguien mirando la bandeja.
 *
 * La cuenta y la contraseña de aplicación viven en el entorno (CORREO_*),
 * nunca en el código.
 */

const nodemailer = require('nodemailer');
const { correo: config, appUrl, puerto } = require('../config/env');

/**
 * El transporte se arma una vez y se reutiliza.
 *
 * En serverless cada instancia tiene el suyo y `pool: false` es lo correcto:
 * la función se congela entre peticiones, y una conexión SMTP guardada para
 * "la próxima" se encuentra muerta cuando esa próxima llega.
 */
let transporte = null;

function transportador() {
  if (transporte) return transporte;

  transporte = nodemailer.createTransport({
    host: config.host,
    port: config.puerto,
    secure: config.seguro,
    auth: { user: config.usuario, pass: config.password },
    // Márgenes cortos: esto corre dentro de la petición de login, y es mejor
    // un aviso de que el correo no salió que un ingreso colgado medio minuto.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  return transporte;
}

/**
 * Deja el correo reconocible sin enseñarlo entero.
 *
 * Se le muestra a quien acaba de escribir la contraseña, así que ya sabe de
 * qué cuenta se trata; taparlo igual evita que una pantalla compartida o una
 * captura de la pantalla de ingreso regale la dirección completa.
 */
function ocultar(email) {
  const texto = String(email || '');
  const arroba = texto.lastIndexOf('@');
  if (arroba < 1) return texto;

  const nombre = texto.slice(0, arroba);
  const dominio = texto.slice(arroba);
  if (nombre.length <= 2) return `${nombre[0]}***${dominio}`;

  return `${nombre.slice(0, 2)}${'*'.repeat(Math.min(nombre.length - 3, 6))}${nombre.slice(-1)}${dominio}`;
}

/** Comprueba que la cuenta y la contraseña de aplicación sirven. No manda nada. */
async function probarConexion() {
  if (!config.configurado) throw new Error('Faltan CORREO_USUARIO y CORREO_PASSWORD.');
  return transportador().verify();
}

/**
 * Manda un correo. Devuelve true si el servidor lo aceptó.
 *
 * No lanza: quien llama decide qué hacer con un false, y en ningún caso una
 * caída del servidor de correo puede subir como error 500 de otra cosa.
 */
async function enviar({ para, asunto, texto, html }) {
  if (!config.configurado) {
    console.warn('[correo] envío apagado: faltan CORREO_USUARIO o CORREO_PASSWORD.');
    return false;
  }

  try {
    await transportador().sendMail({
      from: { name: config.nombre, address: config.remitente },
      to: para,
      subject: asunto,
      text: texto,
      html,
    });
    return true;
  } catch (error) {
    // Sin el detalle en el registro, "no se pudo enviar" no dice si la
    // contraseña de aplicación caducó, si Gmail cortó por volumen o si el
    // puerto está cerrado, que son tres arreglos distintos.
    console.error(`[correo] no se pudo enviar a ${ocultar(para)}: ${error.message}`);
    return false;
  }
}

/* ------------------------------------------------------------------
   Código del segundo factor
   ------------------------------------------------------------------ */

function plantillaCodigo(nombre, codigo, minutos) {
  const saludo = nombre ? `Hola, ${nombre}:` : 'Hola:';

  const texto = [
    saludo,
    '',
    `Tu código para entrar a Huellitas de Amor es: ${codigo}`,
    '',
    `Caduca en ${minutos} minutos y solo sirve una vez.`,
    'Si no fuiste tú quien intentó entrar, cambia tu contraseña: alguien más la conoce.',
    '',
    'Huellitas de Amor',
  ].join('\n');

  // Todo el estilo va en línea: los clientes de correo descartan las hojas de
  // estilo, y varios ni siquiera respetan un <style> en la cabecera.
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;color:#243b53;max-width:480px">
  <p>${saludo}</p>
  <p>Tu código para entrar a <strong>Huellitas de Amor</strong> es:</p>
  <p style="font-size:32px;letter-spacing:8px;font-weight:700;color:#0f766e;margin:24px 0">${codigo}</p>
  <p>Caduca en ${minutos} minutos y solo sirve una vez.</p>
  <p style="color:#627d98;font-size:13px">
    Si no fuiste tú quien intentó entrar, cambia tu contraseña: alguien más la conoce.
  </p>
  <p style="color:#627d98;font-size:13px">Huellitas de Amor</p>
</div>`;

  return { texto, html };
}

/** El correo del segundo paso del ingreso. */
async function enviarCodigoIngreso(usuario, codigo, minutos) {
  const { texto, html } = plantillaCodigo(usuario.nombre, codigo, minutos);

  return enviar({
    para: usuario.email,
    // El código no va en el asunto: se lee en la notificación del teléfono sin
    // desbloquearlo, y ahí lo ve cualquiera que mire la pantalla.
    asunto: 'Tu código para entrar a Huellitas de Amor',
    texto,
    html,
  });
}

/* ------------------------------------------------------------------
   Enlace de recuperación de contraseña
   ------------------------------------------------------------------ */

/**
 * De dónde cuelga el enlace que se manda.
 *
 * APP_URL manda siempre que esté puesta; el origen de la petición es solo el
 * respaldo de desarrollo. El porqué está en config/env.js: el Host lo escribe
 * quien llama, y armar con él un enlace que lleva un token de recuperación es
 * dejar que un tercero elija a dónde apunta.
 */
function baseDelSitio(req) {
  if (appUrl) return appUrl;
  if (req && typeof req.get === 'function') return `${req.protocol}://${req.get('host')}`;
  return `http://localhost:${puerto}`;
}

function plantillaRecuperacion(nombre, enlace, minutos) {
  const saludo = nombre ? `Hola, ${nombre}:` : 'Hola:';

  const texto = [
    saludo,
    '',
    'Pediste restablecer tu contraseña de Huellitas de Amor. Abre este enlace:',
    '',
    enlace,
    '',
    `El enlace caduca en ${minutos} minutos y solo sirve una vez.`,
    'Si no lo pediste tú, no tienes que hacer nada: tu contraseña sigue igual.',
    '',
    'Huellitas de Amor',
  ].join('\n');

  // El enlace va también como texto visible y no solo dentro del botón: los
  // clientes que no pintan HTML dejarían el correo sin nada que abrir.
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;color:#243b53;max-width:480px">
  <p>${saludo}</p>
  <p>Pediste restablecer tu contraseña de <strong>Huellitas de Amor</strong>.</p>
  <p style="margin:24px 0">
    <a href="${enlace}" style="background:#0f766e;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;display:inline-block;font-weight:600">
      Elegir una contraseña nueva
    </a>
  </p>
  <p style="color:#627d98;font-size:13px">Si el botón no funciona, copia esta dirección:<br>
    <span style="word-break:break-all">${enlace}</span>
  </p>
  <p>El enlace caduca en ${minutos} minutos y solo sirve una vez.</p>
  <p style="color:#627d98;font-size:13px">
    Si no lo pediste tú, no tienes que hacer nada: tu contraseña sigue igual.
  </p>
  <p style="color:#627d98;font-size:13px">Huellitas de Amor</p>
</div>`;

  return { texto, html };
}

/**
 * El correo con el enlace para elegir una contraseña nueva.
 *
 * Devuelve false si no salió, y quien llama NO debe cambiar por eso lo que le
 * responde al usuario: la respuesta de /auth/recuperar es siempre la misma
 * exista o no la cuenta, y hacerla depender del envío convertiría el endpoint
 * en un buscador de correos registrados.
 */
async function enviarRecuperacion(usuario, token, minutos, req = null) {
  const enlace = `${baseDelSitio(req)}/login?token=${encodeURIComponent(token)}`;
  const { texto, html } = plantillaRecuperacion(usuario.nombre, enlace, minutos);

  return enviar({
    para: usuario.email,
    asunto: 'Restablece tu contraseña de Huellitas de Amor',
    texto,
    html,
  });
}

module.exports = {
  configurado: config.configurado,
  enviar,
  enviarCodigoIngreso,
  enviarRecuperacion,
  ocultar,
  probarConexion,
};
