'use strict';

const { Router } = require('express');
const controlador = require('../controllers/inventario.controller');
const { validar } = require('../middleware/validation');
const { requiereAuth } = require('../middleware/auth');
const { requierePermiso } = require('../middleware/roles');
const { subirFoto } = require('../middleware/upload');
const { limiteSubida } = require('../middleware/rateLimit');
const esquemas = require('../utils/esquemas');

const router = Router();

router.use(requiereAuth);

// El veterinario consulta el inventario (necesita saber si hay una vacuna
// antes de aplicarla); moverlo y comprar es cosa de la administración.
const puedeVer = requierePermiso('inventario.ver');
const puedeGestionar = requierePermiso('inventario.gestionar');

router.get('/catalogos', puedeVer, controlador.catalogos);
router.get('/alertas', puedeVer, controlador.alertas);

router.get('/productos', puedeVer, validar({ query: esquemas.listarProductos }), controlador.listarProductos);
router.post('/productos', puedeGestionar, validar({ body: esquemas.crearProducto }), controlador.crearProducto);
router.get(
  '/productos/:id',
  puedeVer,
  validar({ params: esquemas.paramsId }),
  controlador.detalleProducto
);
router.put(
  '/productos/:id',
  puedeGestionar,
  validar({ params: esquemas.paramsId, body: esquemas.actualizarProducto }),
  controlador.actualizarProducto
);
router.delete(
  '/productos/:id',
  puedeGestionar,
  validar({ params: esquemas.paramsId }),
  controlador.desactivarProducto
);

// La foto va por su propia ruta porque viaja como multipart y no como JSON.
// Quien puede cambiar el precio de un producto puede cambiarle la imagen: es
// el mismo permiso, no uno aparte.
router.post(
  '/productos/:id/foto',
  puedeGestionar,
  limiteSubida,
  validar({ params: esquemas.paramsId }),
  subirFoto,
  controlador.subirFotoProducto
);
router.delete(
  '/productos/:id/foto',
  puedeGestionar,
  validar({ params: esquemas.paramsId }),
  controlador.quitarFotoProducto
);

router.get('/movimientos', puedeVer, validar({ query: esquemas.listarMovimientos }), controlador.listarMovimientos);
router.post(
  '/movimientos',
  puedeGestionar,
  validar({ body: esquemas.movimientoInventario }),
  controlador.registrarMovimiento
);

router.get('/proveedores', puedeVer, controlador.listarProveedores);
router.post(
  '/proveedores',
  requierePermiso('compras.gestionar'),
  validar({ body: esquemas.crearProveedor }),
  controlador.crearProveedor
);
router.put(
  '/proveedores/:id',
  requierePermiso('compras.gestionar'),
  validar({ params: esquemas.paramsId, body: esquemas.crearProveedor }),
  controlador.actualizarProveedor
);

router.get('/compras', requierePermiso('compras.gestionar'), controlador.listarCompras);
router.post(
  '/compras',
  requierePermiso('compras.gestionar'),
  validar({ body: esquemas.crearCompra }),
  controlador.crearCompra
);
router.get(
  '/compras/:id',
  requierePermiso('compras.gestionar'),
  validar({ params: esquemas.paramsId }),
  controlador.detalleCompra
);

module.exports = router;
