-- =====================================================================
--  Catálogo de la tienda y método de pago del pedido — 26/08/2026
--
--  Para una base que YA está cargada. Un `npm run db:setup` desde cero no
--  la necesita: schema.sql y seed.sql ya traen todo esto.
--
--  Se pega entera en el editor SQL de Supabase. Se puede ejecutar dos
--  veces sin romper nada: los INSERT llevan ON CONFLICT DO NOTHING y la
--  entrada de inventario se salta si ya está su referencia.
--
--  ORDEN: primero esto, después `npm run deploy`. Si sube antes el
--  código, cada pedido intentaría escribir una columna (metodo_pago) que
--  todavía no existe y nadie podría cerrar una compra.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. Con qué se va a pagar el pedido
--
--  Hasta ahora el pedido solo decía si estaba pagado o no, nunca cómo. Sin
--  este dato, quien sale a entregar el domicilio no sabe si tiene que
--  llevar cambio en el bolsillo o si el dinero ya entró por la pasarela.
--
--  Por defecto 'efectivo', que es lo que se cobra contra entrega y lo que
--  corresponde a los pedidos que ya existían cuando se agregó la columna.
-- ---------------------------------------------------------------------

ALTER TABLE tienda.pedidos
  ADD COLUMN IF NOT EXISTS metodo_pago VARCHAR(14) NOT NULL DEFAULT 'efectivo';

DO $huellitas$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pedidos_metodo_pago') THEN
    ALTER TABLE tienda.pedidos
      ADD CONSTRAINT chk_pedidos_metodo_pago
      CHECK (metodo_pago IN ('efectivo','transferencia','tarjeta','en_linea'));
  END IF;
END
$huellitas$;


-- ---------------------------------------------------------------------
--  2. Dos categorías más en la tienda
--
--  El catálogo tenía cinco cajones y todo lo que no era comida ni remedio
--  caía en "Accesorios". Con juguetes y camas dentro, ese cajón pasaba de
--  veinticinco artículos y dejaba de servir para buscar nada.
--
--  "Accesorios" se queda con lo de salir a la calle: collares, correas y
--  arneses.
-- ---------------------------------------------------------------------

INSERT INTO tienda.categorias_tienda (nombre, slug, icono, orden) VALUES
  ('Juguetes',          'juguetes',         'icon-bone',  6),
  ('Camas y descanso',  'camas-y-descanso', 'icon-house', 7)
ON CONFLICT (slug) DO NOTHING;


-- ---------------------------------------------------------------------
--  3. Los productos del inventario
--
--  El artículo de la tienda no guarda precio ni existencias: los toma del
--  producto del inventario (ver tienda.model.js). Así vender por la web y
--  vender en el mostrador descuentan del mismo sitio.
--
--  El proveedor es el 2 del seed, "Alimentos Patitas S.A.S".
-- ---------------------------------------------------------------------

INSERT INTO inventario.productos
  (categoria_id, proveedor_id, nombre, sku, unidad, stock_minimo, precio_compra, precio_venta, requiere_lote)
VALUES
  (3, 2, 'Hill''s Science Diet Kitten pollo 1,6 kg'           , 'ALI-HSD-KIT16', 'bolsa' , 3, 62000 , 89000 , 0),
  (3, 2, 'Hill''s Science Diet Indoor gato adulto 1,6 kg'     , 'ALI-HSD-IND16', 'bolsa' , 3, 64000 , 92000 , 0),
  (3, 2, 'Royal Canin Mother & Babycat 1,5 kg'                , 'ALI-RC-MBC15' , 'bolsa' , 3, 68000 , 97000 , 0),
  (3, 2, 'Royal Canin Kitten Sterilised 1,5 kg'               , 'ALI-RC-KST15' , 'bolsa' , 3, 70000 , 99000 , 0),
  (3, 2, 'Royal Canin X-Small Puppy 4 kg'                     , 'ALI-RC-XSP4'  , 'bolsa' , 3, 98000 , 139000, 0),
  (3, 2, 'Pro Plan Medium Puppy Sensitive Skin 12 kg'         , 'ALI-PPL-MPS12', 'bulto' , 3, 165000, 229000, 0),
  (3, 2, 'Pro Plan Veterinary Diets HA Hydrolyzed 2,7 kg'     , 'ALI-PPL-HA27' , 'bolsa' , 3, 145000, 198000, 0),
  (3, 2, 'Nulo Freestyle Adult Trim perro 2 kg'               , 'ALI-NUL-DAT2' , 'bolsa' , 3, 88000 , 125000, 0),
  (3, 2, 'Nulo Freestyle Adult Trim gato 1,6 kg'              , 'ALI-NUL-CAT16', 'bolsa' , 3, 84000 , 119000, 0),
  (3, 2, 'Agility Gold Grandes Adultos 15 kg'                 , 'ALI-AGY-GA15' , 'bulto' , 3, 118000, 164000, 0),
  (4, 2, 'KONG Classic rellenable talla XL'                   , 'JUG-KON-XL'   , 'unidad', 3, 42000 , 62000 , 0),
  (4, 2, 'Chuckit! Ultra Ball pequeña x2'                     , 'JUG-CHK-UB2'  , 'par'   , 3, 28000 , 42000 , 0),
  (4, 2, 'Nylabone set de 6 huesos masticables'               , 'JUG-NYL-6'    , 'set'   , 3, 46000 , 68000 , 0),
  (4, 2, 'Cuerda de algodón con nudos 45 cm'                  , 'JUG-CUE-45'   , 'unidad', 3, 12000 , 22000 , 0),
  (4, 2, 'Tapete olfativo antiansiedad'                       , 'JUG-TAP-OLF'  , 'unidad', 3, 48000 , 72000 , 0),
  (4, 2, 'JW Hol-ee Roller pelota de caucho'                  , 'JUG-JW-HOL'   , 'unidad', 3, 22000 , 35000 , 0),
  (4, 2, 'Varita con plumas para gato y 8 repuestos'          , 'JUG-VAR-PLU'  , 'set'   , 3, 16000 , 28000 , 0),
  (4, 2, 'Puntero láser LED recargable para gato'             , 'JUG-LAS-LED'  , 'unidad', 3, 18000 , 32000 , 0),
  (4, 2, 'Ratones de yute con catnip x2'                      , 'JUG-RAT-YUT'  , 'par'   , 3, 9000  , 18000 , 0),
  (4, 2, 'Túnel plegable de dos vías'                         , 'JUG-TUN-2V'   , 'unidad', 3, 38000 , 58000 , 0),
  (4, 2, 'Rascador de cartón tipo lounge'                     , 'JUG-RAS-LOU'  , 'unidad', 3, 44000 , 66000 , 0),
  (4, 2, 'Torre de bolas de tres niveles'                     , 'JUG-TOR-3N'   , 'unidad', 3, 34000 , 52000 , 0),
  (4, 2, 'Almohadas de catnip x3'                             , 'JUG-ALM-CAT3' , 'set'   , 3, 15000 , 26000 , 0),
  (4, 2, 'Espirales de plástico para gato x10'                , 'JUG-ESP-10'   , 'set'   , 3, 8000  , 16000 , 0),
  (4, 2, 'Arnés antiescape para gato con correa'              , 'ACC-ARN-GAT'  , 'set'   , 3, 32000 , 49000 , 0),
  (4, 2, 'Collar para gato con cascabel y broche de seguridad', 'ACC-COL-GAT'  , 'unidad', 3, 9000  , 17000 , 0),
  (4, 2, 'Cinturón de paseo manos libres con correa elástica' , 'ACC-CIN-ML'   , 'set'   , 3, 38000 , 58000 , 0),
  (4, 2, 'Correa elástica reflectiva con manija acolchada'    , 'ACC-COR-REF'  , 'unidad', 3, 30000 , 46000 , 0),
  (4, 2, 'Correa retráctil de cordón 5 m'                     , 'ACC-COR-RET5' , 'unidad', 3, 40000 , 62000 , 0),
  (4, 2, 'Cama iglú para gato'                                , 'CAM-IGL-GAT'  , 'unidad', 3, 52000 , 78000 , 0),
  (4, 2, 'Cama redonda acolchada estampada'                   , 'CAM-RED-EST'  , 'unidad', 3, 46000 , 69000 , 0),
  (4, 2, 'Cama dona de pelo largo'                            , 'CAM-DON-PEL'  , 'unidad', 3, 58000 , 86000 , 0),
  (4, 2, 'Cama elevada tipo catre'                            , 'CAM-ELE-CAT'  , 'unidad', 3, 44000 , 68000 , 0),
  (4, 2, 'Cama dona antiestrés para perro grande'             , 'CAM-DON-GDE'  , 'unidad', 3, 78000 , 115000, 0),
  (4, 2, 'Cama sofá rectangular lavable'                      , 'CAM-SOF-REC'  , 'unidad', 3, 68000 , 98000 , 0)
ON CONFLICT (sku) DO NOTHING;


-- ---------------------------------------------------------------------
--  4. La primera entrada de existencias
--
--  El stock no se escribe a mano en productos.cantidad: lo mueve el
--  disparador trg_movimiento_stock a partir de este movimiento, para que
--  el kardex cuadre con lo que hay en la bodega.
--
--  El WHERE NOT EXISTS es lo que deja correr esta migración dos veces sin
--  duplicar la mercancía.
-- ---------------------------------------------------------------------

INSERT INTO inventario.movimientos_inventario
  (producto_id, ubicacion_id, usuario_id, tipo, cantidad, motivo, referencia)
SELECT p.id, 1, NULL, 'entrada', v.cantidad, 'Carga inicial del catálogo en línea', 'INV-TIENDA-01'
  FROM (VALUES
  ('ALI-HSD-KIT16', 14),
  ('ALI-HSD-IND16', 12),
  ('ALI-RC-MBC15' , 10),
  ('ALI-RC-KST15' , 9),
  ('ALI-RC-XSP4'  , 8),
  ('ALI-PPL-MPS12', 6),
  ('ALI-PPL-HA27' , 5),
  ('ALI-NUL-DAT2' , 7),
  ('ALI-NUL-CAT16', 7),
  ('ALI-AGY-GA15' , 6),
  ('JUG-KON-XL'   , 10),
  ('JUG-CHK-UB2'  , 14),
  ('JUG-NYL-6'    , 8),
  ('JUG-CUE-45'   , 20),
  ('JUG-TAP-OLF'  , 7),
  ('JUG-JW-HOL'   , 12),
  ('JUG-VAR-PLU'  , 16),
  ('JUG-LAS-LED'  , 15),
  ('JUG-RAT-YUT'  , 22),
  ('JUG-TUN-2V'   , 9),
  ('JUG-RAS-LOU'  , 8),
  ('JUG-TOR-3N'   , 11),
  ('JUG-ALM-CAT3' , 18),
  ('JUG-ESP-10'   , 24),
  ('ACC-ARN-GAT'  , 12),
  ('ACC-COL-GAT'  , 25),
  ('ACC-CIN-ML'   , 9),
  ('ACC-COR-REF'  , 13),
  ('ACC-COR-RET5' , 10),
  ('CAM-IGL-GAT'  , 8),
  ('CAM-RED-EST'  , 9),
  ('CAM-DON-PEL'  , 10),
  ('CAM-ELE-CAT'  , 7),
  ('CAM-DON-GDE'  , 6),
  ('CAM-SOF-REC'  , 7)
  ) AS v(sku, cantidad)
  JOIN inventario.productos p ON p.sku = v.sku
 WHERE NOT EXISTS (
   SELECT 1 FROM inventario.movimientos_inventario WHERE referencia = 'INV-TIENDA-01'
 );


-- ---------------------------------------------------------------------
--  5. Los artículos de la tienda, con su foto
--
--  La ruta de la imagen es relativa a la raíz del frontend, que es lo que
--  Vercel publica (outputDirectory: "frontend"). El navegador la resuelve
--  con Huella.rutaImagen(), que le antepone "../" cuando la página está
--  dentro de /cliente, /admin o /veterinario.
-- ---------------------------------------------------------------------

INSERT INTO tienda.articulos_tienda
  (producto_id, categoria_id, nombre, slug, descripcion, imagen, requiere_receta, destacado)
SELECT p.id, c.id, v.nombre, v.slug, v.descripcion, v.imagen, 0, v.destacado
  FROM (VALUES
  ('ALI-HSD-KIT16', 'alimento'        , 'Hill''s Science Diet Kitten pollo 1,6 kg'           , 'hill-s-science-diet-kitten-pollo-1-6-kg'            , 'Alimento seco para gatitos hasta 1 año. Desarrollo del cerebro, la vista y las defensas.'      , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC1.jpg' , 1),
  ('ALI-HSD-IND16', 'alimento'        , 'Hill''s Science Diet Indoor gato adulto 1,6 kg'     , 'hill-s-science-diet-indoor-gato-adulto-1-6-kg'      , 'Para gatos de interior de 1 a 6 años. Digestión fácil y menos bolas de pelo.'                  , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC2.jpg' , 0),
  ('ALI-RC-MBC15' , 'alimento'        , 'Royal Canin Mother & Babycat 1,5 kg'                , 'royal-canin-mother-babycat-1-5-kg'                  , 'Para la gata en gestación y el gatito hasta los 4 meses. Croqueta blanda, fácil de rehidratar.', 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC3.jpg' , 0),
  ('ALI-RC-KST15' , 'alimento'        , 'Royal Canin Kitten Sterilised 1,5 kg'               , 'royal-canin-kitten-sterilised-1-5-kg'               , 'Gatitos esterilizados de 6 a 12 meses. Controla el peso sin frenar el crecimiento.'            , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC4.jpg' , 0),
  ('ALI-RC-XSP4'  , 'alimento'        , 'Royal Canin X-Small Puppy 4 kg'                     , 'royal-canin-x-small-puppy-4-kg'                     , 'Cachorros de razas muy pequeñas hasta los 10 meses. Croqueta diminuta para bocas pequeñas.'    , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC5.jpg' , 0),
  ('ALI-PPL-MPS12', 'alimento'        , 'Pro Plan Medium Puppy Sensitive Skin 12 kg'         , 'pro-plan-medium-puppy-sensitive-skin-12-kg'         , 'Cachorro de raza mediana con piel sensible. Salmón como fuente principal de proteína.'         , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC6.jpg' , 1),
  ('ALI-PPL-HA27' , 'alimento'        , 'Pro Plan Veterinary Diets HA Hydrolyzed 2,7 kg'     , 'pro-plan-veterinary-diets-ha-hydrolyzed-2-7-kg'     , 'Dieta veterinaria de proteína hidrolizada para perros con alergia alimentaria.'                , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC7.jpg' , 0),
  ('ALI-NUL-DAT2' , 'alimento'        , 'Nulo Freestyle Adult Trim perro 2 kg'               , 'nulo-freestyle-adult-trim-perro-2-kg'               , 'Alimento sin granos, alto en proteína, para perros adultos con sobrepeso.'                     , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC8.jpg' , 0),
  ('ALI-NUL-CAT16', 'alimento'        , 'Nulo Freestyle Adult Trim gato 1,6 kg'              , 'nulo-freestyle-adult-trim-gato-1-6-kg'              , 'Sin granos y bajo en calorías, para el gato adulto que necesita bajar de peso.'                , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC9.jpg' , 0),
  ('ALI-AGY-GA15' , 'alimento'        , 'Agility Gold Grandes Adultos 15 kg'                 , 'agility-gold-grandes-adultos-15-kg'                 , 'Súper premium para perros grandes adultos. Cuida articulaciones y digestión.'                  , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC10.jpg', 0),
  ('JUG-KON-XL'   , 'juguetes'        , 'KONG Classic rellenable talla XL'                   , 'kong-classic-rellenable-talla-xl'                   , 'Caucho natural resistente. Se rellena con premios y entretiene durante horas.'                 , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC11.jpg', 1),
  ('JUG-CHK-UB2'  , 'juguetes'        , 'Chuckit! Ultra Ball pequeña x2'                     , 'chuckit-ultra-ball-pequena-x2'                      , 'Pelotas de caucho de alto rebote que flotan. Compatibles con el lanzador Chuckit!.'            , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC12.jpg', 0),
  ('JUG-NYL-6'    , 'juguetes'        , 'Nylabone set de 6 huesos masticables'               , 'nylabone-set-de-6-huesos-masticables'               , 'Seis texturas distintas para masticadores medianos. Ayudan a limpiar el sarro.'                , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC13.jpg', 0),
  ('JUG-CUE-45'   , 'juguetes'        , 'Cuerda de algodón con nudos 45 cm'                  , 'cuerda-de-algodon-con-nudos-45-cm'                  , 'Para jugar a halar y para el hilo dental natural de las encías.'                               , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC14.jpg', 0),
  ('JUG-TAP-OLF'  , 'juguetes'        , 'Tapete olfativo antiansiedad'                       , 'tapete-olfativo-antiansiedad'                       , 'Se esconde el alimento entre las tiras: come más despacio y gasta energía mental.'             , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC15.jpg', 0),
  ('JUG-JW-HOL'   , 'juguetes'        , 'JW Hol-ee Roller pelota de caucho'                  , 'jw-hol-ee-roller-pelota-de-caucho'                  , 'Pelota calada de caucho natural: se muerde, se hala y se le meten premios adentro.'            , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC16.jpg', 0),
  ('JUG-VAR-PLU'  , 'juguetes'        , 'Varita con plumas para gato y 8 repuestos'          , 'varita-con-plumas-para-gato-y-8-repuestos'          , 'Caña telescópica con plumas de colores. Nueve juguetes en uno para la caza en casa.'           , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC17.jpg', 1),
  ('JUG-LAS-LED'  , 'juguetes'        , 'Puntero láser LED recargable para gato'             , 'puntero-laser-led-recargable-para-gato'             , 'Recargable por USB, con luz blanca y ultravioleta. Nunca apuntar a los ojos.'                  , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC18.jpg', 0),
  ('JUG-RAT-YUT'  , 'juguetes'        , 'Ratones de yute con catnip x2'                      , 'ratones-de-yute-con-catnip-x2'                      , 'Yute natural relleno de catnip. Livianos, para perseguir y patear.'                            , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC19.jpg', 0),
  ('JUG-TUN-2V'   , 'juguetes'        , 'Túnel plegable de dos vías'                         , 'tunel-plegable-de-dos-vias'                         , 'Túnel con ventana y forro afelpado. Se dobla y se guarda plano.'                               , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC20.jpg', 0),
  ('JUG-RAS-LOU'  , 'juguetes'        , 'Rascador de cartón tipo lounge'                     , 'rascador-de-carton-tipo-lounge'                     , 'Cartón corrugado curvo: sirve de rascador y de cama. Salva los muebles.'                       , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC21.jpg', 0),
  ('JUG-TOR-3N'   , 'juguetes'        , 'Torre de bolas de tres niveles'                     , 'torre-de-bolas-de-tres-niveles'                     , 'Tres pisos con bolas que no se salen. Juego solitario para el gato que se aburre.'             , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC22.jpg', 0),
  ('JUG-ALM-CAT3' , 'juguetes'        , 'Almohadas de catnip x3'                             , 'almohadas-de-catnip-x3'                             , 'Tres almohadas de pelo suave con catnip para abrazar y patear.'                                , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC23.jpg', 0),
  ('JUG-ESP-10'   , 'juguetes'        , 'Espirales de plástico para gato x10'                , 'espirales-de-plastico-para-gato-x10'                , 'Resortes livianos que ruedan y saltan. El juguete más barato y el que más gusta.'              , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC24.jpg', 0),
  ('ACC-ARN-GAT'  , 'accesorios'      , 'Arnés antiescape para gato con correa'              , 'arnes-antiescape-para-gato-con-correa'              , 'Arnés acolchado de un solo paso, reflectivo, con correa de 1,5 m. El gato no se zafa.'         , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC25.jpg', 1),
  ('ACC-COL-GAT'  , 'accesorios'      , 'Collar para gato con cascabel y broche de seguridad', 'collar-para-gato-con-cascabel-y-broche-de-seguridad', 'Broche que se suelta solo si el collar se engancha. Con cascabel y anillo para la placa.'      , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC26.jpg', 0),
  ('ACC-CIN-ML'   , 'accesorios'      , 'Cinturón de paseo manos libres con correa elástica' , 'cinturon-de-paseo-manos-libres-con-correa-elastica' , 'Cinturón con bolsillo y correa elástica: para trotar con el perro sin usar las manos.'         , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC27.jpg', 0),
  ('ACC-COR-REF'  , 'accesorios'      , 'Correa elástica reflectiva con manija acolchada'    , 'correa-elastica-reflectiva-con-manija-acolchada'    , 'Amortigua los tirones y se ve de noche. Manija acolchada y mosquetón de seguridad.'            , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC28.jpg', 0),
  ('ACC-COR-RET5' , 'accesorios'      , 'Correa retráctil de cordón 5 m'                     , 'correa-retractil-de-cordon-5-m'                     , 'Cordón reflectivo de 5 m con freno y bloqueo de una mano. Hasta 20 kg.'                        , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC29.jpg', 0),
  ('CAM-IGL-GAT'  , 'camas-y-descanso', 'Cama iglú para gato'                                , 'cama-iglu-para-gato'                                , 'Cueva cerrada y afelpada, con cojín removible. Para el gato que duerme escondido.'             , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC30.jpg', 0),
  ('CAM-RED-EST'  , 'camas-y-descanso', 'Cama redonda acolchada estampada'                   , 'cama-redonda-acolchada-estampada'                   , 'Borde alto para apoyar la cabeza y base antideslizante. Lavable a máquina.'                    , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC31.jpg', 0),
  ('CAM-DON-PEL'  , 'camas-y-descanso', 'Cama dona de pelo largo'                            , 'cama-dona-de-pelo-largo'                            , 'Pelo largo que abriga y calma. El borde en dona da la sensación de refugio.'                   , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC32.jpg', 1),
  ('CAM-ELE-CAT'  , 'camas-y-descanso', 'Cama elevada tipo catre'                            , 'cama-elevada-tipo-catre'                            , 'Malla tensada que ventila por debajo. Ideal para el calor y para el piso frío.'                , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC33.jpg', 0),
  ('CAM-DON-GDE'  , 'camas-y-descanso', 'Cama dona antiestrés para perro grande'             , 'cama-dona-antiestres-para-perro-grande'             , 'Talla grande, hasta 40 kg. Relleno firme que no se aplasta con el uso.'                        , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC34.jpg', 0),
  ('CAM-SOF-REC'  , 'camas-y-descanso', 'Cama sofá rectangular lavable'                      , 'cama-sofa-rectangular-lavable'                      , 'Tres bordes de apoyo y cojín reversible. Funda exterior desmontable.'                          , 'COMIDA Y ACCESO/ACCESORIOS Y COMIDA/AC35.jpg', 0)
  ) AS v(sku, categoria, nombre, slug, descripcion, imagen, destacado)
  JOIN inventario.productos p     ON p.sku  = v.sku
  JOIN tienda.categorias_tienda c ON c.slug = v.categoria
ON CONFLICT (slug) DO NOTHING;


-- ---------------------------------------------------------------------
--  6. Las secuencias, al día
--
--  Las categorías nuevas entraron sin id escrito a mano, pero el seed sí
--  los escribe, así que en una base cargada desde seed.sql la secuencia
--  puede haber quedado por detrás del último id.
-- ---------------------------------------------------------------------

SELECT setval(
  pg_get_serial_sequence('tienda.categorias_tienda', 'id'),
  GREATEST(COALESCE((SELECT MAX(id) FROM tienda.categorias_tienda), 0), 1));
SELECT setval(
  pg_get_serial_sequence('inventario.productos', 'id'),
  GREATEST(COALESCE((SELECT MAX(id) FROM inventario.productos), 0), 1));
SELECT setval(
  pg_get_serial_sequence('tienda.articulos_tienda', 'id'),
  GREATEST(COALESCE((SELECT MAX(id) FROM tienda.articulos_tienda), 0), 1));
