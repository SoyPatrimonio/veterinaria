'use strict';

const { Router } = require('express');
const { z } = require('zod');
const controlador = require('../controllers/tienda.controller');
const { validar } = require('../middleware/validation');
const { requiereAuth, authOpcional } = require('../middleware/auth');
const { requierePermiso } = require('../middleware/roles');
const { limitePublico } = require('../middleware/rateLimit');
const { antiBotsSiAnonimo } = require('../middleware/bots');
const esquemas = require('../utils/esquemas');

const router = Router();

const id = esquemas.paramsId.shape.id;

const filtroArticulos = z.object({
  categoriaId: id.optional(),
  busqueda: z.string().trim().max(80).optional(),
  destacados: z.coerce.boolean().optional().default(false),
  limite: z.coerce.number().int().min(1).max(200).optional().default(60),
});

const cantidadCarrito = z.object({
  cantidad: z.coerce.number().int().min(0, 'La cantidad no puede ser negativa.').max(999),
});

const pagoPedido = z.object({ referencia: z.string().trim().max(60).optional().nullable() });

/* ---- Catálogo público: la landing lo lee sin sesión ---- */

router.get('/categorias', controlador.categorias);
router.get('/articulos', validar({ query: filtroArticulos }), controlador.articulos);
router.get('/articulos/:id', validar({ params: esquemas.paramsId }), controlador.detalleArticulo);

/**
 * Comprar sin cuenta.
 *
 * El carrito de la landing vive en el navegador, así que aquí llegan los
 * artículos en la petición y no hay carrito en la base que convertir. Se
 * protege como los demás formularios abiertos —tope por IP, campo trampa y
 * sello del formulario—, y `authOpcional` va antes para que a un cliente que
 * ya entró no se le pida el sello y su pedido quede a su nombre.
 *
 * El precio no viaja en la petición: lo pone el controlador leyendo el
 * catálogo. Ver crearPedidoDirecto.
 */
router.post(
  '/pedidos/directo',
  limitePublico,
  authOpcional,
  antiBotsSiAnonimo,
  validar({ body: esquemas.pedidoDirecto }),
  controlador.crearPedidoDirecto
);

/* ---- A partir de aquí, con sesión ---- */

router.use(requiereAuth);

const puedeComprar = requierePermiso('tienda.comprar');
const puedeGestionar = requierePermiso('tienda.gestionar');
const puedeGestionarPedidos = requierePermiso('pedidos.gestionar');

/* Carrito */
router.get('/carrito', puedeComprar, controlador.verCarrito);
router.post('/carrito', puedeComprar, validar({ body: esquemas.itemCarrito }), controlador.agregarAlCarrito);
router.post('/carrito/cupon', puedeComprar, validar({ body: esquemas.aplicarCupon }), controlador.aplicarCupon);
router.delete('/carrito', puedeComprar, controlador.vaciarCarrito);
router.patch(
  '/carrito/:id',
  puedeComprar,
  validar({ params: esquemas.paramsId, body: cantidadCarrito }),
  controlador.cambiarCantidad
);

/* Pedidos */
router.get(
  '/pedidos',
  requierePermiso('pedidos.ver_propios', 'pedidos.ver_todos'),
  validar({ query: esquemas.listarPedidos }),
  controlador.listarPedidos
);
router.post('/pedidos', puedeComprar, validar({ body: esquemas.crearPedido }), controlador.crearPedido);
router.get(
  '/pedidos/:id',
  requierePermiso('pedidos.ver_propios', 'pedidos.ver_todos'),
  validar({ params: esquemas.paramsId }),
  controlador.detallePedido
);
router.patch(
  '/pedidos/:id',
  puedeGestionarPedidos,
  validar({ params: esquemas.paramsId, body: esquemas.estadoPedido }),
  controlador.cambiarEstadoPedido
);
// Marcar un pedido como pagado es registrar un cobro, así que es del personal.
// Con 'pagos.en_linea' —que tiene cualquier cliente— este endpoint dejaba que
// el comprador se diera por pagado a sí mismo, y encima el pedido de otro,
// porque el controlador no comprueba de quién es. El pago en línea del cliente
// no pasa por aquí: va por /api/integraciones/pagos, donde el valor lo pone el
// servidor y la confirmación exige 'pagos.registrar'.
router.post(
  '/pedidos/:id/pago',
  requierePermiso('pedidos.gestionar', 'pagos.registrar'),
  validar({ params: esquemas.paramsId, body: pagoPedido }),
  controlador.registrarPagoPedido
);
router.post(
  '/pedidos/:id/domicilio',
  requierePermiso('domicilios.gestionar'),
  validar({ params: esquemas.paramsId, body: esquemas.asignarDomicilio }),
  controlador.asignarDomicilio
);

/* Domicilios */
router.get('/repartidores', requierePermiso('domicilios.gestionar'), controlador.repartidores);
router.post(
  '/repartidores',
  requierePermiso('domicilios.gestionar'),
  validar({ body: esquemas.crearRepartidor }),
  controlador.crearRepartidor
);
router.patch(
  '/domicilios/:id',
  requierePermiso('domicilios.gestionar', 'domicilios.repartir'),
  validar({ params: esquemas.paramsId, body: esquemas.estadoDomicilio }),
  controlador.actualizarDomicilio
);

/* Gestión del catálogo */
router.post('/categorias', puedeGestionar, validar({ body: esquemas.crearCategoriaTienda }), controlador.crearCategoria);
router.post('/articulos', puedeGestionar, validar({ body: esquemas.crearArticulo }), controlador.crearArticulo);
router.put(
  '/articulos/:id',
  puedeGestionar,
  validar({ params: esquemas.paramsId, body: esquemas.crearArticulo }),
  controlador.actualizarArticulo
);

router.get('/cupones', puedeGestionar, controlador.cupones);
router.post('/cupones', puedeGestionar, validar({ body: esquemas.crearCupon }), controlador.crearCupon);

module.exports = router;
