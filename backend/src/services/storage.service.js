'use strict';

/**
 * Guardado de archivos subidos.
 *
 * En Vercel el sistema de archivos es de solo lectura y además efímero: lo que
 * se escriba desaparece al terminar la petición. Por eso las fotos van a
 * Supabase Storage, que es el mismo servicio donde ya vive la base de datos.
 *
 * Si no hay Storage configurado (desarrollo local sin credenciales), se cae al
 * disco de siempre, para poder trabajar sin cuenta de Supabase.
 */

const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const { supabase: config, uploads } = require('../config/env');

const EXTENSIONES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

/**
 * Carpetas del bucket, una por cosa que lleva foto.
 *
 * La lista es cerrada a propósito: el nombre de la carpeta entra tal cual en
 * la ruta del archivo, así que si alguna vez llegara desde la petición, un
 * '..' guardaría la foto fuera de su sitio. Al ser un conjunto fijo, lo único
 * que puede pasar si alguien escribe mal el nombre es un fallo inmediato.
 */
const CARPETAS = new Set(['mascotas', 'productos', 'adopciones']);

// Las fotos se guardan con un nombre aleatorio que nunca se reutiliza, así que
// el navegador puede quedárselas todo un año sin riesgo de mostrar una vieja.
const CACHE_FOTOS_SEGUNDOS = String(365 * 24 * 60 * 60);

const hayStorage = Boolean(config.url && config.serviceKey);

let clienteSupabase = null;
function cliente() {
  if (!clienteSupabase) {
    const { createClient } = require('@supabase/supabase-js');
    // La clave de servicio salta las políticas de Storage. Solo se usa aquí,
    // en el servidor; nunca se envía al navegador.
    clienteSupabase = createClient(config.url, config.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return clienteSupabase;
}

/** Nombre generado por el servidor: nunca el que envía el cliente. */
function nombreSeguro(mimetype) {
  return crypto.randomBytes(16).toString('hex') + (EXTENSIONES[mimetype] || '');
}

/**
 * Sube una foto y devuelve la URL pública que se guarda en la base:
 * `mascotas.foto` para las mascotas, `productos.imagen` para el inventario.
 */
async function guardarFoto(archivo, carpeta) {
  if (!CARPETAS.has(carpeta)) throw new Error(`Carpeta de subida desconocida: ${carpeta}.`);

  const nombre = nombreSeguro(archivo.mimetype);
  const ruta = `${carpeta}/${nombre}`;

  if (!hayStorage) return guardarEnDisco(carpeta, nombre, archivo);

  const { error } = await cliente()
    .storage.from(config.bucket)
    .upload(ruta, archivo.buffer, {
      contentType: archivo.mimetype,
      cacheControl: CACHE_FOTOS_SEGUNDOS,
      upsert: false,
    });

  if (error) {
    throw new Error(`No se pudo guardar la imagen en Supabase Storage: ${error.message}`);
  }

  const { data } = cliente().storage.from(config.bucket).getPublicUrl(ruta);
  return data.publicUrl;
}

/** Borra la foto anterior para no acumular archivos huérfanos. */
async function borrarFoto(referencia) {
  if (!referencia) return;

  if (!hayStorage) {
    // Solo se toca lo que guardamos nosotros y en una carpeta conocida: una
    // URL externa —o una ruta rara— se deja en paz.
    const partes = /^\/uploads\/([^/]+)\/([^/]+)$/.exec(referencia);
    if (!partes || !CARPETAS.has(partes[1])) return;

    const anterior = path.join(uploads.directorio, partes[1], path.basename(partes[2]));
    try {
      await fs.unlink(anterior);
    } catch (error) {
      // Que ya no esté es normal (dos borrados seguidos, o alguien lo quitó a
      // mano); cualquier otro fallo deja un archivo huérfano ocupando disco y
      // conviene verlo antes de que se acumulen.
      if (error.code !== 'ENOENT') {
        console.warn(`[storage] no se pudo borrar ${anterior}: ${error.message}`);
      }
    }
    return;
  }

  // Solo se borra lo que está en nuestro bucket: una URL externa se ignora.
  const marca = `/storage/v1/object/public/${config.bucket}/`;
  const posicion = referencia.indexOf(marca);
  if (posicion === -1) return;

  const ruta = referencia.slice(posicion + marca.length).split('?')[0];

  // El cliente de Supabase no lanza: devuelve el fallo en `error`. Sin mirarlo,
  // un borrado rechazado (permisos, bucket movido) pasaría por bueno y las
  // fotos viejas se irían acumulando sin que nadie se entere.
  const { error } = await cliente().storage.from(config.bucket).remove([decodeURIComponent(ruta)]);
  if (error) {
    console.warn(`[storage] no se pudo borrar ${ruta} del bucket: ${error.message}`);
  }
}

/** Respaldo para desarrollo local sin credenciales de Supabase. */
async function guardarEnDisco(carpeta, nombre, archivo) {
  const destino = path.join(uploads.directorio, carpeta);
  await fs.mkdir(destino, { recursive: true });
  await fs.writeFile(path.join(destino, nombre), archivo.buffer);
  return `/uploads/${carpeta}/${nombre}`;
}

/** Crea el bucket si no existe. Lo usa el script de migración. */
async function asegurarBucket() {
  if (!hayStorage) return { creado: false, motivo: 'sin credenciales de Storage' };

  const { data, error } = await cliente().storage.getBucket(config.bucket);
  if (data && !error) return { creado: false, motivo: 'ya existía' };

  const { error: fallo } = await cliente().storage.createBucket(config.bucket, {
    public: true,
    fileSizeLimit: uploads.maxBytes,
    allowedMimeTypes: Object.keys(EXTENSIONES),
  });
  if (fallo) throw new Error(fallo.message);

  return { creado: true };
}

module.exports = {
  hayStorage,
  guardarFoto,
  borrarFoto,
  asegurarBucket,
  bucket: config.bucket,
};
