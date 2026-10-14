'use strict';

const ApiError = require('../utils/ApiError');

/**
 * Autorización por rol. Se usa siempre después de requiereAuth:
 *   router.get('/', requiereAuth, permitir('admin'), controlador)
 */
function permitir(...rolesPermitidos) {
  return function (req, res, next) {
    if (!req.usuario) return next(ApiError.noAutorizado());
    if (!rolesPermitidos.includes(req.usuario.rol)) {
      return next(ApiError.prohibido());
    }
    next();
  };
}

/**
 * Autorización por permiso, que es la que manda: el rol solo agrupa permisos,
 * y quién tiene cuál se decide en la tabla seguridad.rol_permisos. Así se puede
 * quitar o dar una capacidad sin tocar el código.
 *
 *   router.post('/', requiereAuth, requierePermiso('citas.crear'), controlador)
 *
 * Con varios códigos basta con tener uno de ellos, que es el caso típico de
 * "ver lo mío o verlo todo".
 */
function requierePermiso(...codigos) {
  return function (req, res, next) {
    if (!req.usuario) return next(ApiError.noAutorizado());

    const permisos = req.permisos || [];
    if (!codigos.some((codigo) => permisos.includes(codigo))) {
      return next(ApiError.prohibido('Tu rol no tiene permiso para esta acción.'));
    }
    next();
  };
}

/** ¿Tiene el usuario de la petición este permiso? Para decidir dentro del controlador. */
function tienePermiso(req, codigo) {
  return Boolean(req.permisos && req.permisos.includes(codigo));
}

/**
 * Hasta dónde llega esta sesión en un listado de "lo mío o todo".
 *
 * Muchas rutas admiten dos permisos: el global (recetas.ver_todas) y el propio
 * (recetas.ver_propias). Que la ruta deje pasar a los dos no significa que los
 * dos vean lo mismo, y ese recorte es del servidor: el frontend puede mandar
 * cualquier filtro, o ninguno.
 *
 * Devuelve null cuando la sesión puede verlo todo, y el cliente_id por el que
 * hay que filtrar cuando no. Si el usuario está limitado y su cuenta no tiene
 * ficha de cliente, falla en vez de devolver null: un null se leería como "sin
 * filtro", que es exactamente lo contrario de lo que se pide aquí. Ese caso no
 * es teórico —una cuenta de cliente cuya fila en `clientes` no se creó— y en
 * silencio le entregaría el listado completo de la clínica.
 */
function alcanceCliente(req, ...permisosGlobales) {
  if (!req.usuario) throw ApiError.noAutorizado();
  if (permisosGlobales.some((codigo) => tienePermiso(req, codigo))) return null;

  if (!req.usuario.cliente_id) {
    throw ApiError.prohibido('Tu cuenta no tiene ficha de cliente, así que no puede consultar este listado.');
  }
  return req.usuario.cliente_id;
}

/**
 * Por qué sede se recorta lo que ve esta sesión.
 *
 * La regla no es la misma para todo, y la diferencia es clínica, no técnica:
 *
 *   - Lo CLÍNICO no se aísla. Si un paciente atendido en una sede llega de
 *     urgencia a otra, su historia tiene que estar. Partirla por sede sería
 *     peligroso, no seguro.
 *   - Lo OPERATIVO sí. Las jaulas, las salas de urgencias, la caja y los
 *     turnos son cosas físicas de un local concreto; verlas mezcladas entre
 *     sedes no informa, confunde, y deja tocar lo que pasa en otra ciudad.
 *
 * La administración ve todas las sedes y puede pedir una en concreto. El
 * resto queda atado a la suya, diga lo que diga la consulta.
 *
 * Una cuenta de personal sin sede asignada no se bloquea: no hay nada a lo
 * que atarla, y dejarla sin poder abrir el tablero de urgencias por un dato
 * administrativo que falta sería peor que el riesgo que evita. Queda dicho
 * aquí para que sea una decisión y no un descuido.
 */
function alcanceSede(req, sedePedida = null) {
  if (!req.usuario) throw ApiError.noAutorizado();

  if (req.usuario.rol === 'admin' || tienePermiso(req, 'sucursales.ver')) {
    return sedePedida ?? null;
  }
  return req.usuario.sede_id ?? null;
}

const soloAdmin = permitir('admin');
const soloClinica = permitir('admin', 'veterinario');

module.exports = {
  permitir,
  requierePermiso,
  tienePermiso,
  alcanceCliente,
  alcanceSede,
  soloAdmin,
  soloClinica,
};
