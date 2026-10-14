-- =====================================================================
--  Comprar sin cuenta — 26/08/2026
--
--  Para una base que YA está cargada. Un `npm run db:setup` desde cero no
--  la necesita: schema.sql ya trae las columnas.
--
--  Se pega entera en el editor SQL de Supabase. Se puede ejecutar dos
--  veces sin romper nada.
--
--  ORDEN: primero esto, después `npm run deploy`. Si sube antes el
--  código, el pedido de un visitante sin cuenta chocaría contra el NOT
--  NULL de cliente_id y no se podría cerrar ninguna compra desde la
--  página pública.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. El pedido deja de exigir una cuenta
--
--  Hasta ahora todo pedido colgaba de un cliente, y un cliente cuelga de
--  un usuario: comprar obligaba a registrarse. Para la tienda de la
--  página pública eso sobra —quien compra un juguete no tiene por qué
--  abrir una cuenta—, así que cliente_id pasa a ser opcional.
--
--  Lo que NO cambia: sigue habiendo un responsable de cada pedido. Si no
--  hay cuenta, van el nombre y el contacto de quien compró, que es lo que
--  la clínica necesita para entregar y para cobrar.
-- ---------------------------------------------------------------------

ALTER TABLE tienda.pedidos ALTER COLUMN cliente_id DROP NOT NULL;

ALTER TABLE tienda.pedidos
  ADD COLUMN IF NOT EXISTS invitado_nombre   VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS invitado_email    VARCHAR(160) NULL,
  ADD COLUMN IF NOT EXISTS invitado_telefono VARCHAR(30)  NULL;

-- Un pedido sin cliente y sin datos de contacto no lo puede atender nadie:
-- la base no deja que exista.
DO $huellitas$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pedidos_responsable') THEN
    ALTER TABLE tienda.pedidos
      ADD CONSTRAINT chk_pedidos_responsable
      CHECK (cliente_id IS NOT NULL OR (invitado_nombre IS NOT NULL AND invitado_telefono IS NOT NULL));
  END IF;
END
$huellitas$;

CREATE INDEX IF NOT EXISTS idx_pedidos_invitado
  ON tienda.pedidos (invitado_email)
  WHERE invitado_email IS NOT NULL;


-- ---------------------------------------------------------------------
--  2. Comprobación
--
--  Debe devolver: cliente_id nullable = YES y las tres columnas nuevas.
-- ---------------------------------------------------------------------

SELECT column_name, is_nullable, data_type
  FROM information_schema.columns
 WHERE table_schema = 'tienda' AND table_name = 'pedidos'
   AND column_name IN ('cliente_id', 'invitado_nombre', 'invitado_email', 'invitado_telefono')
 ORDER BY column_name;
