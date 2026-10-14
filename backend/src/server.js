'use strict';

const app = require('./app');
const { puerto, entorno, db, zonaHoraria } = require('./config/env');
const { verificarConexion, pool } = require('./config/database');

// Cuánto se espera a que terminen las peticiones en curso antes de forzar la
// salida. Diez segundos alcanzan para cerrar una consulta normal sin dejar el
// proceso colgado si algo se atascó.
const MS_ESPERA_CIERRE = 10_000;

/** Oculta la contraseña al mostrar la cadena de conexión en el log. */
function describirDestino(url) {
  if (!url) return 'sin configurar';
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || 5432}${u.pathname}`;
  } catch {
    return 'cadena de conexión no válida';
  }
}

async function iniciar() {
  if (!db.url) {
    console.warn('[db] falta DATABASE_URL. Copia .env.example a .env y pega la cadena de Supabase.');
  }

  try {
    const { zonaBase } = await verificarConexion();
    console.log(`[db] conectado a ${describirDestino(db.url)} (zona ${zonaBase}, servidor ${zonaHoraria})`);
  } catch (error) {
    // El servidor arranca igual para poder servir el frontend; las rutas que
    // tocan la base responderán 503 hasta que haya conexión.
    console.warn('[db] no se pudo conectar:', error.code || error.message);
    console.warn('[db] revisa DATABASE_URL en el archivo .env y que el proyecto de Supabase esté activo.');
  }

  const servidor = app.listen(puerto, () => {
    console.log(`[api] Huellitas de Amor escuchando en http://localhost:${puerto} (${entorno})`);
  });

  // Sin este manejador, no poder abrir el puerto termina en una excepción sin
  // atrapar: media pantalla de traza para decir algo que se arregla cambiando
  // un número en el .env o cerrando la otra terminal.
  servidor.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`[api] el puerto ${puerto} ya está ocupado. Cierra el otro servidor o cambia PORT en el .env.`);
    } else if (error.code === 'EACCES') {
      console.error(`[api] no hay permiso para abrir el puerto ${puerto}. Usa uno por encima de 1024.`);
    } else {
      console.error('[api] no se pudo abrir el servidor:', error.message);
    }
    process.exit(1);
  });

  const apagar = (senal) => {
    console.log(`\n[api] ${senal} recibido, cerrando…`);
    servidor.close(async () => {
      // Si el pool no cierra limpio se sale igual —el proceso ya se está
      // apagando—, pero queda dicho: significa que alguna consulta se quedó
      // colgada, y en silencio eso solo se notaría como un cierre lento.
      try {
        await pool.end();
      } catch (error) {
        console.warn('[db] el pool no cerró limpiamente:', error.message);
      }
      process.exit(0);
    });
    // Si algo se queda colgado, se fuerza la salida.
    setTimeout(() => process.exit(1), MS_ESPERA_CIERRE).unref();
  };

  process.on('SIGINT', () => apagar('SIGINT'));
  process.on('SIGTERM', () => apagar('SIGTERM'));
}

// Un fallo al arrancar (una variable de entorno mal puesta, por ejemplo) sale
// como mensaje y con código de salida 1. Sin el catch, Node lo reporta como una
// promesa rechazada sin atender, que dice lo mismo pero enterrado en la traza.
iniciar().catch((error) => {
  console.error('[api] el servidor no pudo arrancar:', error.message);
  process.exit(1);
});
