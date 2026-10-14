'use strict';

/**
 * Configuración de ESLint (formato plano, ESLint 9).
 *
 *     npm run lint        revisa todo el proyecto
 *     npm run lint:fix    arregla lo que se pueda solo
 *
 * El proyecto tiene tres entornos distintos y cada uno necesita sus propias
 * variables globales: el backend y los scripts corren en Node con CommonJS,
 * y el frontend se carga como <script> clásico en el navegador, sin módulos.
 *
 * Las reglas elegidas son las que atrapan errores de verdad, no las de estilo:
 * un formateador discute sangrías, un linter debería avisar de un `catch` vacío
 * o de una variable que ya nadie usa.
 */

const globals = require('globals');

/** Reglas comunes a todo el proyecto. */
const reglasBase = {
  // --- Manejo de errores ------------------------------------------------
  // La regla de la casa: un catch vacío se traga el fallo y deja el problema
  // sin rastro. Si de verdad hay que ignorarlo, se escribe por qué dentro.
  'no-empty': ['error', { allowEmptyCatch: false }],
  'no-throw-literal': 'error',
  'prefer-promise-reject-errors': 'error',
  'no-unsafe-finally': 'error',

  // require-atomic-updates queda apagada a propósito. Marca como carrera todo
  // `objeto.propiedad = valor` que venga después de un await, y en este
  // proyecto eso es el patrón normal de Express: cada petición tiene su propio
  // `req` y nadie más lo toca. Daba dieciocho avisos, todos falsos; un linter
  // que avisa de lo que no es enseña a no leer sus avisos.
  'require-atomic-updates': 'off',

  // --- Errores silenciosos ----------------------------------------------
  'no-unused-vars': ['error', {
    // Los middleware de error de Express reciben cuatro parámetros aunque no
    // usen `next`: quitarlo cambiaría la firma y Express dejaría de llamarlos.
    args: 'after-used',
    argsIgnorePattern: '^_|^next$',
    caughtErrors: 'all',
    caughtErrorsIgnorePattern: '^_',
  }],
  'no-undef': 'error',
  'no-unreachable': 'error',
  'no-fallthrough': 'error',
  'no-dupe-keys': 'error',
  'no-duplicate-case': 'error',
  'no-self-compare': 'error',
  'no-unmodified-loop-condition': 'error',

  // --- Claridad ---------------------------------------------------------
  eqeqeq: ['error', 'smart'],
  'no-var': 'error',
  'prefer-const': 'error',
  'no-shadow': 'error',
  'no-else-return': 'warn',
  'no-lonely-if': 'warn',

  // console es el registro del proyecto: no hay servicio de logs y los errores
  // tienen que verse en la consola del servidor o del navegador.
  'no-console': 'off',
};

module.exports = [
  {
    // Nada de esto es código propio.
    ignores: [
      'node_modules/**',
      'backend/node_modules/**',
      '.vercel/**',
      'uploads/**',
      'database/**',
    ],
  },

  /* ---------------- Backend, API y scripts: Node + CommonJS ------------- */
  {
    files: ['backend/src/**/*.js', 'backend/scripts/**/*.js', 'scripts/**/*.js', 'api/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: reglasBase,
  },

  /* ---------------- Pruebas: Node + el runner de node:test -------------- */
  {
    files: ['backend/test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: reglasBase,
  },

  /* ---------------- Frontend: navegador, script clásico ----------------- */
  {
    files: ['frontend/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      // `script`, no `module`: las páginas cargan estos archivos con <script>
      // para que funcionen igual servidas por Express o abiertas con Live Server.
      sourceType: 'script',
      globals: {
        ...globals.browser,
        // Objeto compartido que define api.js y usan las demás páginas.
        Huella: 'readonly',
      },
    },
    rules: reglasBase,
  },
];
