-- =====================================================================
--  Código de ingreso por correo — 25/08/2026
--
--  Para una base que YA está cargada. Un `npm run db:setup` desde cero no
--  la necesita: schema.sql ya trae la columna.
--
--  Se pega entera en el editor SQL de Supabase. Se puede ejecutar dos
--  veces sin romper nada.
--
--  ORDEN: primero esto, después el despliegue. Si sube antes el código,
--  cada ingreso de administración intentaría escribir una columna que no
--  existe y nadie podría entrar.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. Dónde se guarda el código que viaja al correo
--
--  Va en el desafío y no en una tabla nueva porque es exactamente lo que
--  es: el otro dato del paso intermedio del ingreso, con la misma vida
--  corta y el mismo dueño. Se guarda hasheado (SHA-256), igual que el
--  token del desafío y que los códigos de recuperación: quien lea la
--  tabla no puede entrar con lo que ve.
--
--  Queda en NULL cuando el ingreso se resuelve con la aplicación de
--  códigos, que sigue funcionando como hasta ahora.
-- ---------------------------------------------------------------------

ALTER TABLE seguridad.mfa_desafios
  ADD COLUMN IF NOT EXISTS codigo_hash CHAR(64) NULL;


-- ---------------------------------------------------------------------
--  2. Sesiones abiertas de administración
--
--  Hasta hoy, un administrador sin la aplicación de códigos configurada
--  entraba con la contraseña sola y el servidor le cerraba el panel con
--  un aviso hasta que la configurara. Desde ahora el segundo factor le
--  llega al correo en cada ingreso, así que ese aviso desaparece: sin
--  esto, una sesión abierta ANTES del cambio —creada sin segundo factor
--  de ninguna clase— se encontraría el panel abierto de par en par.
--
--  Cierra sesiones, no cuentas: se vuelve a entrar con la contraseña de
--  siempre y el código que llega al correo.
-- ---------------------------------------------------------------------

UPDATE seguridad.sesiones s
   SET cerrada_en = LOCALTIMESTAMP,
       motivo_cierre = 'segundo_factor'
  FROM usuarios.usuarios u
  JOIN seguridad.roles r ON r.id = u.rol_id
 WHERE u.id = s.usuario_id
   AND s.cerrada_en IS NULL
   AND r.nombre = 'admin';
