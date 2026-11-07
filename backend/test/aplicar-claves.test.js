'use strict';

/**
 * scripts/aplicar-claves.js arma la cadena de conexión a la base. Los datos
 * del proyecto de Supabase no pueden vivir en el código: se buscan en el
 * archivo de claves, en el entorno o en el .env anterior, y si faltan se dice
 * cuáles en vez de armar una cadena a medias.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { datosProyecto, refDesdeUrl } = require('../../scripts/aplicar-claves');

const HOST = 'aws-0-us-east-1.pooler.supabase.com';

test('el script no trae escrito ningún proyecto de Supabase', () => {
  const codigo = fs.readFileSync(path.join(__dirname, '../../scripts/aplicar-claves.js'), 'utf8');
  assert.doesNotMatch(codigo, /const\s+(REF|HOST)\s*=\s*'/);
  assert.doesNotMatch(codigo, /aws-0-[a-z]+-[a-z]+-\d\.pooler/, 'ningún servidor concreto');
});

test('toma los datos del archivo de claves', () => {
  const claves = `SUPABASE_REF=abcdefghijklmnop\nSUPABASE_POOLER_HOST=${HOST}\nDB_PASSWORD=x`;
  assert.deepEqual(datosProyecto({ claves }), { ref: 'abcdefghijklmnop', host: HOST, puerto: 6543, faltan: [] });
});

test('acepta la URL del proyecto en vez del identificador', () => {
  assert.equal(refDesdeUrl('https://abcdefghijklmnop.supabase.co'), 'abcdefghijklmnop');
  assert.equal(refDesdeUrl('https://otro.sitio.com'), '');
  const claves = `SUPABASE_URL=https://abcdefghijklmnop.supabase.co\nSUPABASE_POOLER_HOST=${HOST}`;
  assert.equal(datosProyecto({ claves }).ref, 'abcdefghijklmnop');
});

test('una instalación anterior solo necesita la contraseña nueva', () => {
  const envAnterior = `DATABASE_URL=postgresql://postgres.qrstuvwxyz123456:vieja@${HOST}:6543/postgres\n`;
  const datos = datosProyecto({ claves: 'DB_PASSWORD=nueva', envAnterior });
  assert.deepEqual(datos, { ref: 'qrstuvwxyz123456', host: HOST, puerto: 6543, faltan: [] });
});

test('lo del archivo de claves manda sobre el .env anterior', () => {
  const envAnterior = `DATABASE_URL=postgresql://postgres.qrstuvwxyz123456:vieja@${HOST}:6543/postgres\n`;
  const datos = datosProyecto({ claves: 'SUPABASE_REF=nuevoproyecto0001', envAnterior });
  assert.equal(datos.ref, 'nuevoproyecto0001');
});

test('el ejemplo con xxxx del .env.example no cuenta como proyecto', () => {
  const envAnterior = `DATABASE_URL=postgresql://postgres.xxxxxxxxxxxx:TU_CONTRASENA@${HOST}:6543/postgres\n`;
  assert.deepEqual(datosProyecto({ envAnterior }).faltan, ['SUPABASE_REF (o SUPABASE_URL)', 'SUPABASE_POOLER_HOST']);
});

test('sin datos dice exactamente qué falta', () => {
  assert.deepEqual(datosProyecto({}).faltan, ['SUPABASE_REF (o SUPABASE_URL)', 'SUPABASE_POOLER_HOST']);
  assert.deepEqual(
    datosProyecto({ claves: 'SUPABASE_REF=abcdefghijklmnop\nSUPABASE_POOLER_HOST=malicioso.com' }).faltan,
    ['SUPABASE_POOLER_HOST'],
    'un servidor que no es de Supabase no se acepta'
  );
});
