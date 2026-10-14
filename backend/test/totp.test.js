'use strict';

/**
 * Segundo factor: generación y comprobación de los códigos.
 *
 * El TOTP está escrito a mano sobre `crypto`, así que lo primero que hay que
 * demostrar es que produce exactamente lo mismo que cualquier aplicación de
 * autenticación. Para eso están los vectores del RFC 6238: si estos cinco
 * casos coinciden, el código que enseñe Google Authenticator será el que el
 * servidor espera. Si fallan, el segundo factor no dejaría entrar a nadie.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const totp = require('../src/utils/totp');

// El secreto de los vectores del RFC es la cadena ASCII '12345678901234567890'.
const SECRETO_RFC = totp.aBase32(Buffer.from('12345678901234567890'));

test('los códigos coinciden con los vectores del RFC 6238', () => {
  const casos = [
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ];

  for (const [segundos, esperado] of casos) {
    assert.equal(
      totp.codigoPara(SECRETO_RFC, Math.floor(segundos / totp.PASO_SEGUNDOS)),
      esperado,
      `no coincide en t=${segundos}`
    );
  }
});

test('base32 va y vuelve sin perder nada', () => {
  assert.equal(totp.desdeBase32(SECRETO_RFC).toString(), '12345678901234567890');

  for (const largo of [1, 5, 10, 20, 32]) {
    const original = require('node:crypto').randomBytes(largo);
    assert.deepEqual(totp.desdeBase32(totp.aBase32(original)), original, `falla con ${largo} bytes`);
  }
});

test('el secreto se puede pegar con espacios o guiones', () => {
  // La gente lo copia de la pantalla y lo pega como sea.
  const conRuido = SECRETO_RFC.match(/.{1,4}/g).join(' ').toLowerCase();
  assert.equal(totp.desdeBase32(conRuido).toString(), '12345678901234567890');
});

test('un secreto que no es base32 se rechaza en vez de dar un código cualquiera', () => {
  assert.throws(() => totp.desdeBase32('esto NO es base32 (1809)'), /base32/i);
});

test('cada secreto nuevo es distinto y tiene el largo que pide el RFC', () => {
  const uno = totp.generarSecreto();
  const otro = totp.generarSecreto();

  assert.notEqual(uno, otro);
  // 20 bytes en base32 son 32 caracteres.
  assert.equal(uno.length, 32);
  assert.equal(totp.desdeBase32(uno).length, 20);
});

/* ------------------------------------------------------------------
   Comprobación
   ------------------------------------------------------------------ */

test('el código de ahora vale y devuelve su contador', () => {
  const secreto = totp.generarSecreto();
  const ahora = Date.now();

  const contador = totp.verificar(secreto, totp.codigoActual(secreto, ahora), { instanteMs: ahora });
  assert.equal(contador, totp.contadorDe(ahora));
});

test('se acepta el código anterior y el siguiente, pero no más allá', () => {
  // La ventana cubre el reloj desajustado del teléfono. Si fuera más ancha,
  // un código robado serviría durante más tiempo.
  const secreto = totp.generarSecreto();
  const ahora = Date.now();
  const paso = totp.PASO_SEGUNDOS * 1000;

  for (const salto of [-1, 0, 1]) {
    const codigo = totp.codigoActual(secreto, ahora + salto * paso);
    assert.notEqual(totp.verificar(secreto, codigo, { instanteMs: ahora }), null, `salto ${salto}`);
  }

  for (const salto of [-2, 2, 10]) {
    const codigo = totp.codigoActual(secreto, ahora + salto * paso);
    assert.equal(totp.verificar(secreto, codigo, { instanteMs: ahora }), null, `salto ${salto}`);
  }
});

test('un código de otro secreto no vale', () => {
  const ahora = Date.now();
  const mio = totp.generarSecreto();
  const ajeno = totp.generarSecreto();

  assert.equal(totp.verificar(mio, totp.codigoActual(ajeno, ahora), { instanteMs: ahora }), null);
});

test('lo que no sean seis cifras se descarta sin comparar', () => {
  const secreto = totp.generarSecreto();

  for (const basura of ['', '12345', '1234567', 'abcdef', '12 34 56 78', null, undefined, '000000\n']) {
    assert.equal(totp.verificar(secreto, basura), null, `pasó "${basura}"`);
  }
});

test('el contador que devuelve permite no aceptar dos veces el mismo código', () => {
  // Esta es la pieza que impide reusar un código interceptado dentro de su
  // minuto y medio de validez: quien llama guarda el contador y rechaza todo
  // el que no sea mayor.
  const secreto = totp.generarSecreto();
  const ahora = Date.now();
  const codigo = totp.codigoActual(secreto, ahora);

  const primero = totp.verificar(secreto, codigo, { instanteMs: ahora });
  const segundo = totp.verificar(secreto, codigo, { instanteMs: ahora });

  assert.equal(primero, segundo, 'el mismo código tiene que dar siempre el mismo contador');
  assert.equal(typeof primero, 'number');
});

/* ------------------------------------------------------------------
   Dirección otpauth
   ------------------------------------------------------------------ */

test('la dirección otpauth lleva lo que las aplicaciones necesitan', () => {
  const secreto = totp.generarSecreto();
  const direccion = totp.direccionOtpauth(secreto, 'admin@huellitas.com');

  assert.match(direccion, /^otpauth:\/\/totp\//);
  assert.match(direccion, new RegExp(`secret=${secreto}`));
  assert.match(direccion, /algorithm=SHA1/);
  assert.match(direccion, /digits=6/);
  assert.match(direccion, /period=30/);

  // El correo va codificado: una arroba sin escapar rompe la etiqueta.
  assert.ok(!direccion.split('?')[0].includes('@'), 'la etiqueta tiene que ir codificada');
});

/* ------------------------------------------------------------------
   Códigos de recuperación
   ------------------------------------------------------------------ */

const mfa = require('../src/models/mfa.model');

test('los códigos de recuperación no traen caracteres que se confundan', () => {
  // Sin O/0, I/1, L: se copian a mano de la pantalla a un papel.
  for (let i = 0; i < 200; i += 1) {
    assert.match(mfa.generarCodigo(), /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
  }
});

test('el hash del código no depende de mayúsculas ni del guion', () => {
  // Quien lo teclea puede escribirlo en minúsculas o sin el guion.
  const base = mfa.hashCodigo('ABCD-EFGH');

  assert.equal(mfa.hashCodigo('abcd-efgh'), base);
  assert.equal(mfa.hashCodigo('ABCDEFGH'), base);
  assert.equal(mfa.hashCodigo('AbCd-EfGh'), base);
  assert.notEqual(mfa.hashCodigo('ABCD-EFGI'), base);
});

test('dos códigos seguidos no se repiten', () => {
  const generados = new Set(Array.from({ length: 500 }, () => mfa.generarCodigo()));
  assert.ok(generados.size > 495, 'demasiadas repeticiones para ser aleatorio');
});

/* ------------------------------------------------------------------
   Código de ingreso por correo
   ------------------------------------------------------------------ */

test('el código del correo siempre trae seis cifras', () => {
  // Con `randomBytes % 1000000` o con un padStart olvidado saldrían códigos de
  // cinco cifras uno de cada diez: el formulario los rechaza por la forma y
  // esa persona no podría entrar aunque el código fuera el suyo.
  for (let i = 0; i < 1000; i += 1) {
    assert.match(mfa.generarCodigoIngreso(), /^\d{6}$/);
  }
});

test('el código del correo es distinto para cada persona y cada ingreso', () => {
  const generados = new Set(Array.from({ length: 1000 }, () => mfa.generarCodigoIngreso()));
  assert.ok(generados.size > 990, 'demasiadas repeticiones para ser aleatorio');
});

test('del código del correo se guarda el hash, nunca el código', () => {
  // Es lo mismo que se hace con el token del desafío: quien lea la tabla no
  // puede entrar con lo que ve.
  const fuente = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../src/models/mfa.model.js'), 'utf8'
  );
  assert.match(fuente, /codigo \? hashCodigo\(codigo\) : null/,
    'el desafío tiene que guardar el hash del código, no el código');
  assert.match(fuente, /INSERT INTO mfa_desafios \(usuario_id, token_hash, codigo_hash,/,
    'la columna que se escribe es codigo_hash');
});

test('el código del correo no se compara contra la aplicación', () => {
  // Son dos vías distintas: el del correo se comprueba por hash contra ESTE
  // desafío, y el de la aplicación contra el secreto de la cuenta. Mezclarlas
  // dejaría entrar con el código del correo a cuentas sin correo, o al revés.
  const fuente = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../src/services/auth.service.js'), 'utf8'
  );
  assert.match(fuente, /mfa\.hashCodigo\(cifras\) === fila\.codigo_hash/);
  assert.match(fuente, /const conApp = fila\.activo === 1 && Boolean\(fila\.secreto\)/,
    'sin secreto guardado no hay nada contra qué comparar en la aplicación');
});

test('el correo del código no sale sin tope por cuenta', () => {
  // Una respuesta con desafío es un 200 y el límite por IP la deja pasar
  // (skipSuccessfulRequests), así que quien tenga la contraseña podría llamar
  // al login en bucle y agotar el cupo diario de envíos de la cuenta de Gmail,
  // que es lo que deja a TODOS sin poder entrar.
  const fuente = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../src/services/auth.service.js'), 'utf8'
  );
  assert.match(fuente, /codigosEnviados\(usuario\.id, MINUTOS_CODIGOS\)\) >= MAXIMO_CODIGOS/);
});

/* ------------------------------------------------------------------
   Regresiones del segundo factor

   Las tres salieron de atacar el código propio después de escribirlo, y
   las tres eran de estrenar: no existían antes de añadir el MFA.
   ------------------------------------------------------------------ */

test('el paso pendiente de MFA no se cuenta como intento fallido', () => {
  // Se guardaba como fallo con el correo real, y el éxito posterior se
  // guardaba con el correo en blanco. Resultado: la cuenta se bloqueaba sola
  // tras cinco ingresos CORRECTOS, y para siempre, porque el contador nunca
  // se reiniciaba. Bloqueaba justo a quien había activado el segundo factor.
  const sql = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../src/models/usuario.model.js'), 'utf8'
  );
  assert.match(sql, /motivo NOT IN \('mfa_pendiente'[^)]*\)/,
    'el conteo de fallos tiene que excluir el paso intermedio del MFA');

  // La lista de motivos excluidos creció ('codigo_acceso_invalido'), y con
  // NOT IN hay que dejar pasar los nulos a mano: sin el IS NULL delante, un
  // intento sin motivo daría NULL, no contaría, y el bloqueo por fuerza bruta
  // dejaría de funcionar justo con las filas más viejas.
  assert.match(sql, /motivo IS NULL\s+OR i\.motivo NOT IN/,
    'los intentos sin motivo tienen que seguir contando como fallo');
});

test('el éxito del segundo factor se registra con el correo real', () => {
  // Es lo que reinicia el contador de fallos del login.
  const sql = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../src/services/auth.service.js'), 'utf8'
  );
  assert.doesNotMatch(sql, /email:\s*null,\s*usuarioId:\s*fila\.usuario_id,\s*exito:\s*true/,
    'con el correo en blanco el contador de bloqueo nunca se reinicia');
  assert.match(sql, /email:\s*fila\.email,\s*usuarioId:\s*fila\.usuario_id,\s*exito:\s*true/);
});

test('el anti-reuso decide con el UPDATE, no con la lectura previa', () => {
  // Dos peticiones a la vez con el mismo código pasaban las dos: las dos leían
  // el contador viejo. Quien manda es el UPDATE condicional.
  const sql = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../src/services/auth.service.js'), 'utf8'
  );
  assert.match(sql, /!\(await mfa\.avanzarContador\(/,
    'hay que mirar si avanzarContador ganó la carrera');
});

test('hay un tope de códigos fallidos por cuenta, no solo por desafío', () => {
  // Con tope solo por desafío, quien tiene la contraseña pide un desafío nuevo
  // cada vez y recorre el millón de combinaciones de tres en tres.
  const sql = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../src/services/auth.service.js'), 'utf8'
  );
  assert.match(sql, /fallosRecientes\(fila\.usuario_id/);
});
