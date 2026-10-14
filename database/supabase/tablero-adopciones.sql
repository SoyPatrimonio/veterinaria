-- =====================================================================
--  TABLERO DE ADOPCIONES DE LA PORTADA
-- =====================================================================
--
--  Las diez mascotas que se ven en el tablero de frontend/index.html
--  como publicaciones de verdad de comunidad.adopciones.
--
--  Hasta ahora esas tarjetas eran solo HTML: bonitas, pero sin nada
--  detrás. Una solicitud de adopción se guarda siempre contra una
--  publicación (comunidad.solicitudes_adopcion.publicacion_id), así que
--  sin estas filas el botón "Quiero adoptarlo" no tendría a qué mascota
--  apuntar y la administración no sabría por cuál de ellas preguntan.
--
--  Los identificadores van del 101 al 110, lejos del 1, 2, 3 que usa el
--  seed y lejos de los que irá tomando el panel al publicar mascotas
--  nuevas. Son los mismos números que lleva cada tarjeta en el atributo
--  data-publicacion del HTML: si se cambian aquí, hay que cambiarlos
--  allí.
--
--  Cómo se ejecuta (SQL Editor de Supabase, o psql):
--      \i database/supabase/tablero-adopciones.sql
--
--  Se puede volver a ejecutar cuantas veces haga falta: si la fila ya
--  existe se actualiza y no se duplica. Hay que ejecutarlo otra vez
--  después de recargar la base desde schema.sql + seed.sql, porque eso
--  borra y vuelve a crear los esquemas.
-- =====================================================================

SET search_path TO comunidad, mascotas, configuracion, public;

-- Bruno es boyero de Berna y esa raza no estaba en el catálogo.
INSERT INTO mascotas.razas (especie_id, nombre) VALUES (1, 'Boyero de Berna')
  ON CONFLICT (especie_id, nombre) DO NOTHING;

INSERT INTO comunidad.publicaciones_adopcion
  (id, sede_id, nombre, especie_id, raza_id, sexo, edad_meses, porte, color, descripcion, foto,
   esterilizado, vacunas_al_dia, desparasitado, compatible_ninos, compatible_mascotas, estado) VALUES

  -- ---- Perros -------------------------------------------------------
  (101, 1, 'Bruno', 1, (SELECT id FROM mascotas.razas WHERE nombre = 'Boyero de Berna' AND especie_id = 1),
       'macho', 48, 'grande', 'Tricolor',
       'Grandote y sereno. Vive por su pelota y por las siestas al sol en el patio.',
       '/img%20perros/p1.jpg', 1, 1, 1, 1, NULL, 'disponible'),

  (102, 1, 'Kira', 1, (SELECT id FROM mascotas.razas WHERE nombre = 'Golden Retriever' AND especie_id = 1),
       'hembra', 36, 'grande', 'Dorado',
       'Pura energía y sonrisa. Camina bien con correa y se lleva de maravilla con otros perros.',
       '/img%20perros/p2.jpg', 1, 1, 1, 1, 1, 'disponible'),

  (103, 1, 'Nieve', 1, (SELECT id FROM mascotas.razas WHERE nombre = 'Mestizo' AND especie_id = 1),
       'hembra', 108, 'grande', 'Blanco',
       'Labradora mestiza adulta mayor, tranquila y agradecida. Solo pide un sofá y una familia con paciencia.',
       '/img%20perros/p3.jpg', 1, 1, 1, 1, NULL, 'disponible'),

  (104, 1, 'Tuco', 1, (SELECT id FROM mascotas.razas WHERE nombre = 'Criollo' AND especie_id = 1),
       'macho', 3, 'mediano', 'Café con negro',
       'Curioso y sociable, de orejas enormes. Ya tiene su primera vacuna y desparasitación.',
       '/img%20perros/p4.jpg', 0, 1, 1, 1, 1, 'disponible'),

  (105, 1, 'Canela', 1, (SELECT id FROM mascotas.razas WHERE nombre = 'Criollo' AND especie_id = 1),
       'hembra', 2, 'mediano', 'Café claro',
       'La más pequeña del grupo. Dormilona, mimosa y lista para su primer hogar.',
       '/img%20perros/p5.jpg', 0, 1, 1, 1, NULL, 'disponible'),

  -- ---- Gatos --------------------------------------------------------
  (106, 1, 'Milo', 2, (SELECT id FROM mascotas.razas WHERE nombre = 'Atigrado común' AND especie_id = 2),
       'macho', 24, 'pequeno', 'Atigrado',
       'Independiente pero muy cariñoso a su manera. Le encanta el jardín y el sol de la tarde.',
       '/imagenes_gatos/G1.jpg', 1, 1, 1, 1, NULL, 'disponible'),

  (107, 1, 'Pelusa', 2, (SELECT id FROM mascotas.razas WHERE nombre = 'Atigrado común' AND especie_id = 2),
       'hembra', 3, 'pequeno', 'Atigrada',
       'Diminuta y curiosa. Ya come sola y usa el arenero sin que haya que enseñarle.',
       '/imagenes_gatos/G2.jpg', 0, 1, 1, 1, 1, 'disponible'),

  (108, 1, 'Copo', 2, (SELECT id FROM mascotas.razas WHERE nombre = 'Angora' AND especie_id = 2),
       'macho', 48, 'pequeno', 'Blanco',
       'Pelaje largo y ojos azules. Sereno y silencioso: solo pide cepillado y una ventana con sol.',
       '/imagenes_gatos/G3.jpg', 1, 1, 1, 1, NULL, 'disponible'),

  (109, 1, 'Plata', 2, (SELECT id FROM mascotas.razas WHERE nombre = 'Atigrado común' AND especie_id = 2),
       'hembra', 6, 'pequeno', 'Atigrada plateada',
       'Inquieta y juguetona: persigue todo lo que se mueva. Se lleva bien con otros gatos.',
       '/imagenes_gatos/G4.jpg', 0, 1, 1, 1, 1, 'disponible'),

  (110, 1, 'Simón', 2, (SELECT id FROM mascotas.razas WHERE nombre = 'Atigrado común' AND especie_id = 2),
       'macho', 12, 'pequeno', 'Atigrado',
       'Tranquilo y observador, perfecto para apartamento. Ya usa arenero sin problema.',
       '/imagenes_gatos/G5.jpg', 1, 1, 1, 1, NULL, 'disponible')

ON CONFLICT (id) DO UPDATE SET
  sede_id             = EXCLUDED.sede_id,
  nombre              = EXCLUDED.nombre,
  especie_id          = EXCLUDED.especie_id,
  raza_id             = EXCLUDED.raza_id,
  sexo                = EXCLUDED.sexo,
  edad_meses          = EXCLUDED.edad_meses,
  porte               = EXCLUDED.porte,
  color               = EXCLUDED.color,
  descripcion         = EXCLUDED.descripcion,
  foto                = EXCLUDED.foto,
  esterilizado        = EXCLUDED.esterilizado,
  vacunas_al_dia      = EXCLUDED.vacunas_al_dia,
  desparasitado       = EXCLUDED.desparasitado,
  compatible_ninos    = EXCLUDED.compatible_ninos,
  compatible_mascotas = EXCLUDED.compatible_mascotas;
  -- `estado` NO se toca: si la clínica ya reservó o entregó a alguna, volver a
  -- ejecutar esto no puede devolverla al tablero como disponible.

-- El id se puso a mano, así que la secuencia se quedó atrás. Sin esto, la
-- primera mascota que se publique desde el panel intentaría tomar un id que
-- ya existe y fallaría.
SELECT setval(
  pg_get_serial_sequence('comunidad.publicaciones_adopcion', 'id'),
  GREATEST((SELECT MAX(id) FROM comunidad.publicaciones_adopcion), 1)
);
