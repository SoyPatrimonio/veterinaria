'use strict';

/**
 * Freno para los formularios abiertos al público.
 *
 * El límite por IP de rateLimit.js ya está, pero no alcanza: en serverless
 * cuenta por instancia, y una red de bots reparte las peticiones entre muchas
 * direcciones, así que ninguna llega al tope. Lo de aquí ataca otra cosa: no
 * cuántas peticiones llegan, sino si vienen de alguien que abrió la página.
 *
 * Son tres comprobaciones baratas, y ninguna pretende ser infalible por su
 * cuenta —quien se moleste en programar un navegador de verdad las pasa—.
 * Lo que cortan es el grueso: los guiones que descubren /api/auth/registro y
 * lo llaman a pelo, que es de donde sale casi todo el ruido.
 *
 *   1. Campo trampa. Un input que la persona no ve y el robot sí rellena.
 *   2. Sello del formulario. Firmado por el servidor al pintar la página;
 *      quien llama a la API sin pasar por ella no lo tiene.
 *   3. Identificación del cliente. Sin User-Agent, o con uno de rastreador
 *      declarado, no se aceptan escrituras públicas.
 */

const crypto = require('crypto');
const ApiError = require('../utils/ApiError');
const { jwt: configJwt } = require('../config/env');

/* ------------------------------------------------------------------
   1. Campo trampa
   ------------------------------------------------------------------ */

/**
 * Nombre del campo señuelo. Suena a algo que un formulario podría pedir de
 * verdad —esa es la idea— y no lo pide ninguno.
 *
 * Va con el mismo nombre en el servidor y en el HTML; si cambia aquí, hay que
 * cambiarlo en frontend/js/api.js.
 */
const CAMPO_TRAMPA = 'sitioWeb';

/**
 * Rechaza la petición si el campo trampa viene con algo escrito.
 *
 * Se responde con un error genérico y no con "eres un robot": decirlo sería
 * regalarle al que automatiza la pista de qué campo tiene que dejar vacío.
 *
 * Tiene que ir ANTES de `validar`: zod descarta las claves que no declara, así
 * que después de él el campo ya no existiría y esto no vería nada.
 */
function campoTrampa(req, res, next) {
  const valor = req.body ? req.body[CAMPO_TRAMPA] : undefined;

  if (valor !== undefined && String(valor).trim() !== '') {
    console.warn(`[bots] campo trampa relleno en ${req.method} ${req.originalUrl}`);
    return next(ApiError.badRequest('No pudimos procesar el formulario. Recarga la página e inténtalo otra vez.'));
  }

  // El campo no sigue hacia el controlador. Con `validar` detrás daría igual,
  // pero no todas las rutas lo llevan y un campo fantasma en el cuerpo es
  // justo la clase de cosa que acaba guardada en un registro sin querer.
  if (req.body) delete req.body[CAMPO_TRAMPA];
  next();
}

/* ------------------------------------------------------------------
   2. Sello del formulario
   ------------------------------------------------------------------ */

// Cuánto tarda una persona, como mínimo, en leer un formulario y llenarlo.
// Por debajo de esto no hay nadie escribiendo.
const SEGUNDOS_MINIMO = 3;

// Y cuánto vale un sello antes de quedar viejo. Media hora deja terminar con
// calma un formulario largo sin que el sello sirva para reutilizarlo mañana.
const SEGUNDOS_MAXIMO = 30 * 60;

const CAMPO_SELLO = 'selloFormulario';

function firma(momento) {
  return crypto
    .createHmac('sha256', configJwt.secret)
    .update(`sello:${momento}`)
    .digest('base64url');
}

/**
 * Un sello nuevo: el instante en que se pintó el formulario, firmado.
 *
 * Se firma para que no se pueda inventar una marca de tiempo cómoda. No se
 * guarda nada en la base: la firma se comprueba recalculándola, así que esto
 * funciona igual con la función fría y con varias instancias a la vez.
 */
function emitirSello() {
  const momento = Date.now();
  return { sello: `${momento}.${firma(momento)}`, validoSegundos: SEGUNDOS_MAXIMO };
}

/**
 * Exige un sello válido y con la edad razonable.
 *
 * El mensaje de error es el mismo en los tres casos que pueden fallar —falta,
 * está mal firmado o está viejo— salvo el del formulario caducado, que sí se
 * distingue porque a una persona le puede pasar de verdad y necesita saber que
 * la solución es recargar.
 */
function selloFormulario(req, res, next) {
  const crudo = req.body ? req.body[CAMPO_SELLO] : undefined;
  const generico = ApiError.badRequest(
    'No pudimos verificar el formulario. Recarga la página e inténtalo otra vez.'
  );

  if (!crudo || typeof crudo !== 'string') return next(generico);

  const [momentoTexto, firmaRecibida] = crudo.split('.');
  const momento = Number(momentoTexto);
  if (!Number.isFinite(momento) || !firmaRecibida) return next(generico);

  // Comparación en tiempo constante: la firma se compara byte a byte y salir
  // antes en el primer byte distinto es medible.
  const esperada = Buffer.from(firma(momento));
  const recibida = Buffer.from(firmaRecibida);
  if (esperada.length !== recibida.length || !crypto.timingSafeEqual(esperada, recibida)) {
    console.warn(`[bots] sello inválido en ${req.method} ${req.originalUrl}`);
    return next(generico);
  }

  const segundos = (Date.now() - momento) / 1000;

  if (segundos < SEGUNDOS_MINIMO) {
    console.warn(`[bots] formulario enviado en ${segundos.toFixed(1)} s en ${req.originalUrl}`);
    return next(generico);
  }

  if (segundos > SEGUNDOS_MAXIMO) {
    return next(ApiError.badRequest('El formulario quedó abierto demasiado tiempo. Recárgalo e inténtalo otra vez.'));
  }

  if (req.body) delete req.body[CAMPO_SELLO];
  next();
}

/* ------------------------------------------------------------------
   3. Identificación del cliente
   ------------------------------------------------------------------ */

/**
 * Rastreadores y herramientas que se identifican como tales.
 *
 * Solo se listan los que dicen serlo. Al que miente no lo detecta esto —lo
 * detectan las dos comprobaciones de arriba—, y por eso la lista se queda
 * corta a propósito en vez de intentar adivinar por la forma del texto: un
 * patrón demasiado ancho termina dejando fuera a un navegador raro de verdad.
 */
const AGENTES_ROBOT = /(bot|crawler|spider|scrapy|curl|wget|python-requests|httpie|axios|okhttp|libwww|java\/|go-http)/i;

/**
 * Escrituras públicas: hay que decir quién llama.
 *
 * Solo se aplica a lo que está abierto sin cuenta. La API sigue siendo usable
 * con curl para todo lo demás —el panel, las pruebas, una integración— porque
 * eso pasa por un token, y un token ya dice quién es.
 */
function clienteIdentificado(req, res, next) {
  const agente = req.get('user-agent') || '';

  if (!agente.trim() || AGENTES_ROBOT.test(agente)) {
    console.warn(`[bots] agente rechazado en ${req.method} ${req.originalUrl}: "${agente.slice(0, 80)}"`);
    return next(ApiError.prohibido('Este formulario se envía desde la página de la clínica.'));
  }
  next();
}

/* ------------------------------------------------------------------
   El paquete completo
   ------------------------------------------------------------------ */

/**
 * Las tres cosas juntas, en el orden en que conviene que fallen: primero lo
 * que no cuesta nada de mirar.
 *
 * Se usa así, siempre antes de `validar`:
 *   router.post('/registro', limiteAuth, ...antiBots, validar({...}), controlador)
 */
const antiBots = [clienteIdentificado, campoTrampa, selloFormulario];

/**
 * Lo mismo, pero solo para quien llega sin sesión.
 *
 * Es para las rutas que atienden a los dos: la solicitud de adopción la manda
 * igual un visitante desde la página pública que un cliente desde su panel.
 * A quien ya inició sesión no hay nada que demostrarle —tiene una cuenta, una
 * contraseña y un rastro en la base—, y exigirle un sello de formulario
 * rompería el panel sin ganar nada.
 *
 * Va DESPUÉS de authOpcional, que es quien deja puesto req.usuario.
 */
function antiBotsSiAnonimo(req, res, next) {
  if (req.usuario) return next();

  // Se encadenan a mano para poder pararlas en el primer fallo.
  let i = 0;
  const siguiente = (error) => {
    if (error) return next(error);
    if (i >= antiBots.length) return next();
    antiBots[i++](req, res, siguiente);
  };
  siguiente();
}

module.exports = {
  antiBots,
  antiBotsSiAnonimo,
  campoTrampa,
  selloFormulario,
  clienteIdentificado,
  emitirSello,
  CAMPO_TRAMPA,
  CAMPO_SELLO,
  SEGUNDOS_MINIMO,
  SEGUNDOS_MAXIMO,
};
