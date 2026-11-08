'use strict';

/**
 * Corre las pruebas de integración conectadas como `huellitas_app`, el rol
 * de privilegios mínimos (database/supabase/migracion-rol-app.sql).
 *
 *     npm run test:integracion:rol
 *
 * Es un archivo y no una variable delante del comando porque `VAR=1 cmd` no
 * funciona en la terminal de Windows.
 */

const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const carpeta = path.join(__dirname, '../test-integracion');
const archivos = fs.readdirSync(carpeta)
  .filter((f) => f.endsWith('.test.js'))
  .map((f) => path.join(carpeta, f));

const { status } = spawnSync(process.execPath, ['--test', ...archivos], {
  stdio: 'inherit',
  env: { ...process.env, PRUEBA_ROL_APP: '1' },
});
process.exit(status ?? 1);
