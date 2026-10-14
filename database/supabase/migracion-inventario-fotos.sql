-- =====================================================================
--  Foto del producto en inventario — 27/08/2026
--
--  Para una base que YA está cargada. Un `npm run db:setup` desde cero no
--  la necesita: schema.sql ya trae la columna.
--
--  Se pega entera en el editor SQL de Supabase. Se puede ejecutar dos
--  veces sin romper nada.
--
--  ORDEN: primero esto, después `npm run deploy`. Si sube antes el
--  código, el listado de productos pediría una columna (imagen) que
--  todavía no existe y la pantalla de inventario quedaría en blanco.
-- =====================================================================


-- ---------------------------------------------------------------------
--  Dónde vive la foto
--
--  Igual que en mascotas.foto: en la base solo va la URL pública que
--  devuelve Supabase Storage, nunca el archivo. Los 255 caracteres dan de
--  sobra para la ruta del bucket y dejan margen si algún día se sirve
--  desde otro dominio.
--
--  Queda NULL a propósito: un producto sin foto es lo normal —los insumos
--  de bodega no necesitan una— y así los que ya existen no cambian.
-- ---------------------------------------------------------------------

ALTER TABLE inventario.productos
  ADD COLUMN IF NOT EXISTS imagen VARCHAR(255) NULL;


-- ---------------------------------------------------------------------
--  Comprobación
--
--  Devuelve una fila si la columna quedó puesta.
-- ---------------------------------------------------------------------

SELECT column_name, data_type, character_maximum_length, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'inventario'
   AND table_name   = 'productos'
   AND column_name  = 'imagen';
