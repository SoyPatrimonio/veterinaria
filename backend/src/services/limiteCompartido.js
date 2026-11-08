'use strict';

/**
 * Contador de express-rate-limit guardado en PostgreSQL.
 *
 * El contador por defecto vive en la memoria del proceso, y en Vercel cada
 * instancia de la función tiene la suya: con cuatro instancias despiertas,
 * un tope de diez intentos de login son cuarenta, y al enfriarse la función
 * vuelve a cero. Para los límites que protegen algo de verdad (ingreso,
 * formularios públicos, descargas, subidas) eso no sirve.
 *
 * Aquí el contador está en `seguridad.limites_tasa`, que comparten todas las
 * instancias. No hace falta Redis ni otro servicio: la base ya está, y cada
 * paso es una sola sentencia atómica, así que dos instancias que cuentan a la
 * vez no se pisan.
 *
 * Si la tabla no existe todavía (se desplegó antes de correr la migración) o
 * la base falla, se sigue contando en memoria y se avisa una vez en el
 * registro. Preferimos un límite por instancia a tumbar el login por un
 * contador: la base caída ya deja sin servicio por su cuenta, y el bloqueo
 * por cuenta de intentos_login sigue funcionando aparte.
 */

const { MemoryStore } = require('express-rate-limit');
const { ejecutar } = require('../config/database');

// Una de cada tantas escrituras barre las filas viejas. Así la tabla no crece
// sin límite y no hace falta un trabajo programado.
const PROBABILIDAD_LIMPIEZA = 0.01;

class AlmacenCompartido {
  /**
   * @param {string} nombre Distingue los contadores de cada límite: la misma
   *   IP lleva un contador para el login y otro para las descargas.
   */
  constructor(nombre) {
    this.prefix = `${nombre}:`;
    // Le dice a express-rate-limit que el contador no es local al proceso.
    this.localKeys = false;
    this.respaldo = new MemoryStore();
    this.avisado = false;
  }

  init(opciones) {
    this.ventanaMs = opciones.windowMs;
    this.respaldo.init(opciones);
  }

  clave(clave) {
    return `${this.prefix}${clave}`.slice(0, 200);
  }

  /** Pasa al contador en memoria y lo dice una sola vez. */
  caer(error) {
    if (!this.avisado) {
      this.avisado = true;
      console.warn(
        `[limite] no se pudo usar seguridad.limites_tasa (${error.code || error.message}); ` +
        `el límite "${this.prefix.slice(0, -1)}" cuenta por instancia hasta que vuelva. ` +
        '¿Falta correr database/supabase/migracion-limites-tasa.sql?'
      );
    }
  }

  async increment(clave) {
    try {
      // Si la ventana anterior ya terminó, se empieza de cero; si no, se suma.
      // Todo en el mismo INSERT … ON CONFLICT para que sea atómico.
      const resultado = await ejecutar(
        `INSERT INTO limites_tasa (clave, conteo, reinicia_en)
              VALUES (?, 1, now() + (? || ' milliseconds')::interval)
         ON CONFLICT (clave) DO UPDATE SET
           conteo = CASE WHEN limites_tasa.reinicia_en <= now() THEN 1
                         ELSE limites_tasa.conteo + 1 END,
           reinicia_en = CASE WHEN limites_tasa.reinicia_en <= now() THEN EXCLUDED.reinicia_en
                              ELSE limites_tasa.reinicia_en END
         RETURNING conteo, reinicia_en`,
        [this.clave(clave), String(this.ventanaMs)]
      );
      const fila = resultado.rows[0];

      if (Math.random() < PROBABILIDAD_LIMPIEZA) {
        ejecutar("DELETE FROM limites_tasa WHERE reinicia_en < now() - interval '1 day'")
          .catch(() => { /* la limpieza puede esperar a la próxima */ });
      }

      this.avisado = false;
      return { totalHits: Number(fila.conteo), resetTime: new Date(fila.reinicia_en) };
    } catch (error) {
      this.caer(error);
      return this.respaldo.increment(clave);
    }
  }

  /** Lo usa `skipSuccessfulRequests`: un ingreso correcto no cuenta. */
  async decrement(clave) {
    try {
      await ejecutar(
        'UPDATE limites_tasa SET conteo = GREATEST(conteo - 1, 0) WHERE clave = ? AND reinicia_en > now()',
        [this.clave(clave)]
      );
    } catch (error) {
      this.caer(error);
      await this.respaldo.decrement(clave);
    }
  }

  async resetKey(clave) {
    try {
      await ejecutar('DELETE FROM limites_tasa WHERE clave = ?', [this.clave(clave)]);
    } catch (error) {
      this.caer(error);
      await this.respaldo.resetKey(clave);
    }
  }
}

module.exports = { AlmacenCompartido };
