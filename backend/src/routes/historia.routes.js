'use strict';

const { Router } = require('express');
const controlador = require('../controllers/historia.controller');
const { validar } = require('../middleware/validation');
const { requiereAuth } = require('../middleware/auth');
const { requierePermiso } = require('../middleware/roles');
const esquemas = require('../utils/esquemas');

const router = Router();

router.use(requiereAuth);

// Con uno de los dos basta: el cliente ve la historia de sus mascotas y la
// clínica la de todas. Qué filas concretas devuelve cada quien lo decide el
// controlador con el cliente_id de la sesión.
const puedeVer = requierePermiso('historia.ver_propia', 'historia.ver_todas');

router.get('/catalogos', requierePermiso('consultas.crear', 'historia.ver_todas'), controlador.catalogos);
router.get('/refuerzos', requierePermiso('historia.ver_todas'), controlador.refuerzos);

router.get(
  '/mascota/:id',
  puedeVer,
  validar({ params: esquemas.paramsId }),
  controlador.porMascota
);

router.get(
  '/consultas',
  puedeVer,
  validar({ query: esquemas.listarConsultas }),
  controlador.listarConsultas
);
router.post(
  '/consultas',
  requierePermiso('consultas.crear'),
  validar({ body: esquemas.crearConsulta }),
  controlador.crearConsulta
);
router.get(
  '/consultas/:id',
  puedeVer,
  validar({ params: esquemas.paramsId }),
  controlador.detalleConsulta
);
router.put(
  '/consultas/:id',
  requierePermiso('consultas.editar'),
  validar({ params: esquemas.paramsId, body: esquemas.editarConsulta }),
  controlador.editarConsulta
);

router.post(
  '/vacunas',
  requierePermiso('vacunas.aplicar'),
  validar({ body: esquemas.aplicarVacuna }),
  controlador.aplicarVacuna
);

router.post(
  '/examenes',
  requierePermiso('examenes.gestionar'),
  validar({ body: esquemas.solicitarExamen }),
  controlador.solicitarExamen
);
router.put(
  '/examenes/:id/resultados',
  requierePermiso('examenes.gestionar'),
  validar({ params: esquemas.paramsId, body: esquemas.resultadosExamen }),
  controlador.guardarResultados
);

module.exports = router;
