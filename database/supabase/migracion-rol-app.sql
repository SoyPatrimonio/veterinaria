-- =====================================================================
--  Rol de base de datos con privilegios mínimos — 08/11/2026
--
--  Hasta hoy la aplicación se conecta como `postgres`. Si alguien
--  encontrara una inyección SQL, con ese rol podría borrar tablas, crear
--  funciones o leer cualquier cosa del servidor. Con `huellitas_app` solo
--  puede leer y escribir FILAS de las tablas de la aplicación: ni DROP, ni
--  ALTER, ni TRUNCATE, ni crear nada, y tampoco borrar historias clínicas
--  ni el registro de auditoría.
--
--  `postgres` se sigue usando para las migraciones (npm run db:setup y
--  los archivos migracion-*.sql), que sí necesitan crear tablas.
--
--  CÓMO USARLA
--    1. Genera una contraseña larga y aleatoria, por ejemplo:
--         node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
--    2. Ponla en la línea `clave text := ...` de abajo.
--    3. Pega el archivo entero en el editor SQL de Supabase y ejecútalo.
--       Se puede ejecutar dos veces: la segunda solo cambia la contraseña
--       y vuelve a dar los permisos.
--    4. En el .env, cambia el usuario de DATABASE_URL. Con el pooler de
--       Supabase el usuario lleva el id del proyecto detrás:
--         postgresql://huellitas_app.<id-del-proyecto>:<contraseña>@aws-0-....pooler.supabase.com:6543/postgres
--       (antes era postgres.<id-del-proyecto>).
--    5. `npm run deploy` para subir la variable nueva y prueba el sitio.
--
--  Si algo responde "permiso denegado" después, falta un GRANT; para
--  volver atrás basta con poner otra vez el usuario postgres en
--  DATABASE_URL y desplegar.
--
--  TABLAS NUEVAS: las migraciones que creen una tabla tienen que darle la
--  política `app_acceso` (ver el final de este archivo). Los GRANT sí
--  llegan solos por ALTER DEFAULT PRIVILEGES, pero RLS no: sin la
--  política, la aplicación vería la tabla vacía.
-- =====================================================================

DO $$
DECLARE
  clave text := 'CAMBIA-ESTA-CONTRASENA';
BEGIN
  IF clave = 'CAMBIA-ESTA-CONTRASENA' OR length(clave) < 24 THEN
    RAISE EXCEPTION
      'Pon una contraseña aleatoria de al menos 24 caracteres en la línea "clave text := ..." antes de ejecutar.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'huellitas_app') THEN
    EXECUTE format(
      'CREATE ROLE huellitas_app LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT',
      clave);
  ELSE
    EXECUTE format(
      'ALTER ROLE huellitas_app LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT',
      clave);
  END IF;

  EXECUTE format('GRANT CONNECT ON DATABASE %I TO huellitas_app', current_database());
END
$$;


-- ---------------------------------------------------------------------
--  Permisos sobre los datos
--
--  Leer y escribir filas, usar las secuencias de los id y llamar a las
--  funciones. Nada de crear, alterar ni vaciar tablas.
--
--  RLS: las tablas lo tienen activo y SIN políticas, para que las claves
--  del navegador (anon, authenticated) no vean nada. El dueño de la tabla
--  se lo salta, pero huellitas_app no es el dueño: sin una política
--  propia, cada consulta devolvería cero filas. La política `app_acceso`
--  le abre las filas SOLO a este rol; anon y authenticated siguen fuera.
-- ---------------------------------------------------------------------

DO $$
DECLARE
  esquema text;
  t record;
BEGIN
  FOREACH esquema IN ARRAY public.huellitas_esquemas() || ARRAY['public'] LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO huellitas_app', esquema);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO huellitas_app', esquema);
    EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO huellitas_app', esquema);
    EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA %I TO huellitas_app', esquema);

    -- Y lo mismo para lo que se cree después con postgres.
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO huellitas_app', esquema);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT USAGE, SELECT ON SEQUENCES TO huellitas_app', esquema);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT EXECUTE ON FUNCTIONS TO huellitas_app', esquema);
  END LOOP;

  -- Las extensiones de Supabase viven en su propio esquema.
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN
    GRANT USAGE ON SCHEMA extensions TO huellitas_app;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO huellitas_app;
  END IF;

  FOR t IN
    SELECT schemaname, tablename FROM pg_tables
     WHERE schemaname = ANY (public.huellitas_esquemas())
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS app_acceso ON %I.%I', t.schemaname, t.tablename);
    EXECUTE format(
      'CREATE POLICY app_acceso ON %I.%I FOR ALL TO huellitas_app USING (true) WITH CHECK (true)',
      t.schemaname, t.tablename);
  END LOOP;
END
$$;


-- ---------------------------------------------------------------------
--  Lo que la aplicación nunca borra
--
--  Las historias clínicas se desactivan, no se borran, y la auditoría solo
--  crece. Quitar el permiso deja escrito lo que ya hace el código y lo
--  sostiene aunque alguien escriba un DELETE por descuido o por una
--  inyección.
-- ---------------------------------------------------------------------

REVOKE DELETE, TRUNCATE ON historia_clinica.consultas          FROM huellitas_app;
REVOKE DELETE, TRUNCATE ON historia_clinica.historias_clinicas FROM huellitas_app;
REVOKE UPDATE, DELETE, TRUNCATE ON seguridad.auditoria         FROM huellitas_app;


-- ---------------------------------------------------------------------
--  Comprobación
--
--  rolsuper, rolcreatedb, rolcreaterole y rolbypassrls deben salir en
--  false, y tablas_con_politica igual al total de tablas.
-- ---------------------------------------------------------------------

SELECT r.rolname, r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolbypassrls,
       (SELECT COUNT(*) FROM pg_policies WHERE policyname = 'app_acceso') AS tablas_con_politica,
       (SELECT COUNT(*) FROM pg_tables
         WHERE schemaname = ANY (public.huellitas_esquemas()))             AS tablas
  FROM pg_roles r
 WHERE r.rolname = 'huellitas_app';
