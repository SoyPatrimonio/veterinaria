-- =====================================================================
--  Límite de peticiones compartido entre instancias — 07/11/2026
--
--  Para una base que YA está cargada. Un `npm run db:setup` desde cero no
--  la necesita: schema.sql ya trae la tabla.
--
--  Se pega entera en el editor SQL de Supabase. Se puede ejecutar dos
--  veces sin romper nada.
--
--  ORDEN: da igual. Si el código sube antes, los límites siguen contando
--  en la memoria de cada instancia (como hasta ahora) y el registro avisa
--  una vez por límite. En cuanto la tabla existe, pasan a contar aquí.
-- =====================================================================

CREATE TABLE IF NOT EXISTS seguridad.limites_tasa (
  clave       VARCHAR(200) PRIMARY KEY,
  conteo      INTEGER NOT NULL DEFAULT 0,
  reinicia_en TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_limites_tasa_reinicia ON seguridad.limites_tasa (reinicia_en);

-- Igual que el resto de tablas: fuera del alcance de las claves del
-- navegador. Solo la API (rol del backend) la lee y la escribe.
ALTER TABLE seguridad.limites_tasa ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON seguridad.limites_tasa FROM %I', r);
    END IF;
  END LOOP;

  -- Si ya existe el rol de mínimo privilegio (migracion-rol-app.sql), se le
  -- da lo justo para contar. La política hace falta además del GRANT: con
  -- RLS activo y sin ella, ese rol vería la tabla vacía.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'huellitas_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON seguridad.limites_tasa TO huellitas_app;
    DROP POLICY IF EXISTS app_acceso ON seguridad.limites_tasa;
    CREATE POLICY app_acceso ON seguridad.limites_tasa
      FOR ALL TO huellitas_app USING (true) WITH CHECK (true);
  END IF;
END
$$;

-- Comprobación: debe devolver una fila con rls = true.
SELECT relname, relrowsecurity AS rls
  FROM pg_class
 WHERE oid = 'seguridad.limites_tasa'::regclass;
