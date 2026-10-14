'use strict';

const { Router } = require('express');

const authRoutes = require('./auth.routes');
const mascotasRoutes = require('./mascotas.routes');
const serviciosRoutes = require('./servicios.routes');
const veterinariosRoutes = require('./veterinarios.routes');
const citasRoutes = require('./citas.routes');
const usuariosRoutes = require('./usuarios.routes');
const seguridadRoutes = require('./seguridad.routes');
const historiaRoutes = require('./historia.routes');
const inventarioRoutes = require('./inventario.routes');
const facturasRoutes = require('./facturas.routes');
const notificacionesRoutes = require('./notificaciones.routes');
const reportesRoutes = require('./reportes.routes');
const urgenciasRoutes = require('./urgencias.routes');
const hospitalizacionRoutes = require('./hospitalizacion.routes');
const farmaciaRoutes = require('./farmacia.routes');
const laboratorioRoutes = require('./laboratorio.routes');
const imagenesRoutes = require('./imagenes.routes');
const telemedicinaRoutes = require('./telemedicina.routes');
const comunidadRoutes = require('./comunidad.routes');
const tiendaRoutes = require('./tienda.routes');
const fidelizacionRoutes = require('./fidelizacion.routes');
const soporteRoutes = require('./soporte.routes');
const personalRoutes = require('./personal.routes');
const operacionesRoutes = require('./operaciones.routes');
const integracionesRoutes = require('./integraciones.routes');
const alertasRoutes = require('./alertas.routes');
const iaRoutes = require('./ia.routes');
const reportesPdfRoutes = require('./reportes-pdf.routes');

const { requiereAuth } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { consultar } = require('../config/database');
const { requierePermiso } = require('../middleware/roles');
const { validar } = require('../middleware/validation');
const { emitirSello } = require('../middleware/bots');
const esquemas = require('../utils/esquemas');
const mascotasControlador = require('../controllers/mascotas.controller');
const usuariosControlador = require('../controllers/usuarios.controller');
const dashboardControlador = require('../controllers/dashboard.controller');

const router = Router();

router.get('/salud', (req, res) => {
  res.json({ ok: true, servicio: 'huellitas-api', hora: new Date().toISOString() });
});

/**
 * GET /api/sello — el sello que acompaña a los formularios públicos.
 *
 * Lo pide el frontend al pintar un formulario abierto (registro, recuperación,
 * avistamientos, solicitudes de adopción) y lo devuelve al enviarlo. Es lo que
 * separa a alguien que abrió la página de un guion que descubrió la ruta y la
 * llama directo. Ver middleware/bots.js.
 *
 * No lleva sesión —el formulario es de quien todavía no tiene cuenta— ni deja
 * nada en la base: es una marca de tiempo firmada.
 */
router.get('/sello', (req, res) => {
  res.json({ ok: true, ...emitirSello() });
});

// Catálogos abiertos: los usa el formulario de registro de mascotas.
router.get('/catalogos/especies', mascotasControlador.especies);
router.get('/catalogos/razas', mascotasControlador.razas);

/**
 * GET /api/sedes — el listado que necesitan los selectores del panel.
 *
 * Lo piden equipos, bioseguridad, caja, personal y agenda. Devuelve solo lo
 * que hace falta para elegir una sede (nombre, ciudad y contacto), no los
 * parámetros internos de configuración, que sí van por su módulo.
 */
router.get(
  '/sedes',
  requiereAuth,
  asyncHandler(async (req, res) => {
    const sedes = await consultar(
      `SELECT id, nombre, codigo, ciudad, direccion, telefono, principal
         FROM sedes
        WHERE activo = 1
        ORDER BY principal DESC, nombre`
    );
    res.json({ ok: true, sedes });
  })
);

router.use('/auth', authRoutes);
router.use('/seguridad', seguridadRoutes);
router.use('/servicios', serviciosRoutes);
router.use('/veterinarios', veterinariosRoutes);
router.use('/mascotas', mascotasRoutes);
router.use('/citas', citasRoutes);
router.use('/usuarios', usuariosRoutes);
router.use('/historia', historiaRoutes);
router.use('/inventario', inventarioRoutes);
router.use('/facturas', facturasRoutes);
router.use('/notificaciones', notificacionesRoutes);
router.use('/reportes', reportesRoutes);
router.use('/urgencias', urgenciasRoutes);
router.use('/hospitalizacion', hospitalizacionRoutes);
router.use('/farmacia', farmaciaRoutes);
router.use('/laboratorio', laboratorioRoutes);
router.use('/imagenes', imagenesRoutes);
router.use('/telemedicina', telemedicinaRoutes);
router.use('/comunidad', comunidadRoutes);
router.use('/tienda', tiendaRoutes);
router.use('/fidelizacion', fidelizacionRoutes);
router.use('/soporte', soporteRoutes);
router.use('/personal', personalRoutes);
router.use('/operaciones', operacionesRoutes);
router.use('/integraciones', integracionesRoutes);
router.use('/alertas', alertasRoutes);
router.use('/ia', iaRoutes);
router.use('/reportes/pdf', reportesPdfRoutes);

router.get(
  '/clientes',
  requiereAuth,
  requierePermiso('clientes.ver'),
  validar({ query: esquemas.listarClientes }),
  usuariosControlador.listarClientes
);
router.get('/dashboard', requiereAuth, dashboardControlador.resumen);

module.exports = router;
