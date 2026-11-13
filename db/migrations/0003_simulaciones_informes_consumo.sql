-- Up Migration
-- 0003: simulaciones, transcripción, informes y consumo de IA.
-- Qué es una COPIA CONGELADA y qué es una REFERENCIA:
--  * El escenario y los criterios que se usaron se copian al informe: si la empresa los edita
--    después, los informes viejos no cambian.
--  * El nombre de la empresa NO se copia: se llega por empresa_id. Así renombrar la empresa
--    no hace desaparecer sus informes (hoy pasa con el archivo JSON).

CREATE TABLE simulaciones (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         uuid        NOT NULL REFERENCES empresas (id),
  usuario_id         uuid        NOT NULL REFERENCES usuarios (id),
  escenario_id       uuid        REFERENCES escenarios (id) ON DELETE SET NULL,
  -- copia del escenario tal como estaba al hacer la simulación
  escenario_titulo   text        NOT NULL,
  escenario_resumen  text,
  escenario_cliente  text,
  escenario_objetivo text,
  duracion_seg       integer     NOT NULL CHECK (duracion_seg >= 0),
  realizada_en       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX simulaciones_empresa_fecha_idx ON simulaciones (empresa_id, realizada_en DESC);
CREATE INDEX simulaciones_usuario_idx ON simulaciones (usuario_id);

-- La conversación, un turno por fila. Es dato personal: vive aparte del informe para poder
-- definirle una retención propia o borrarla sin perder el puntaje.
-- rol: 'user' = quien hace la simulación, 'assistant' = el cliente simulado por la IA.
CREATE TABLE transcripcion_turnos (
  simulacion_id uuid    NOT NULL REFERENCES simulaciones (id) ON DELETE CASCADE,
  orden         integer NOT NULL CHECK (orden >= 0),
  rol           text    NOT NULL CHECK (rol IN ('user', 'assistant')),
  texto         text    NOT NULL,
  PRIMARY KEY (simulacion_id, orden)
);

-- Un informe por simulación.
CREATE TABLE informes (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  simulacion_id      uuid        NOT NULL UNIQUE REFERENCES simulaciones (id) ON DELETE CASCADE,
  puntaje            integer     CHECK (puntaje BETWEEN 0 AND 100),  -- NULL si ningún criterio se pudo puntuar
  criterios_puntuados integer    NOT NULL DEFAULT 0 CHECK (criterios_puntuados >= 0),
  resumen            text        NOT NULL DEFAULT '',
  expresion          text        NOT NULL DEFAULT '',
  creado_en          timestamptz NOT NULL DEFAULT now()
);

-- Resultado por criterio. nombre/descripcion/peso/indicadores son la copia congelada de cómo
-- estaba definido el criterio al evaluar; puntaje NULL = no se pudo puntuar.
-- indicadores va en jsonb porque es una foto que nunca se edita ni se consulta por partes.
CREATE TABLE informe_criterios (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  informe_id  uuid          NOT NULL REFERENCES informes (id) ON DELETE CASCADE,
  orden       integer       NOT NULL DEFAULT 0,
  nombre      text          NOT NULL,
  descripcion text          NOT NULL DEFAULT '',
  peso        numeric(6, 2) NOT NULL CHECK (peso >= 0),
  indicadores jsonb,
  puntaje     smallint      CHECK (puntaje BETWEEN 1 AND 5),
  observado   text,
  evidencia   text,
  comentario  text,
  para_subir  text
);
CREATE INDEX informe_criterios_informe_idx ON informe_criterios (informe_id);

-- Las listas de texto del informe (fortalezas, a mejorar, cómo encarar, preguntas de entrevista).
CREATE TABLE informe_observaciones (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  informe_id uuid    NOT NULL REFERENCES informes (id) ON DELETE CASCADE,
  tipo       text    NOT NULL CHECK (tipo IN ('fortaleza', 'a_mejorar', 'como_encaro', 'pregunta_entrevista')),
  orden      integer NOT NULL DEFAULT 0,
  texto      text    NOT NULL CHECK (btrim(texto) <> '')
);
CREATE INDEX informe_observaciones_informe_idx ON informe_observaciones (informe_id);

-- Una fila por consulta a un modelo (llamada de voz, intento de informe o chat del mentor),
-- incluidos los intentos fallidos. usuario_id y simulacion_id pueden ser NULL (scripts de la
-- compu, llamadas sin informe). costo_usd lo calcula la app con los precios de ese momento:
-- si los precios cambian, el historial no se reescribe. NULL = modelo sin precio cargado.
-- se_cobra = false cuando no se paga de verdad (Claude por suscripción, Gemini plan gratuito):
-- el número es lo que costaría por API.
CREATE TABLE consumo_ia (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            uuid          NOT NULL REFERENCES empresas (id),
  usuario_id            uuid          REFERENCES usuarios (id) ON DELETE SET NULL,
  simulacion_id         uuid          REFERENCES simulaciones (id) ON DELETE SET NULL,
  tipo                  text          NOT NULL CHECK (tipo IN ('voz', 'informe', 'chat')),
  proveedor             text          NOT NULL,
  modelo                text          NOT NULL,
  exito                 boolean       NOT NULL DEFAULT true,
  tokens_entrada_texto  bigint        NOT NULL DEFAULT 0 CHECK (tokens_entrada_texto >= 0),
  tokens_entrada_audio  bigint        NOT NULL DEFAULT 0 CHECK (tokens_entrada_audio >= 0),
  tokens_salida_texto   bigint        NOT NULL DEFAULT 0 CHECK (tokens_salida_texto >= 0),
  tokens_salida_audio   bigint        NOT NULL DEFAULT 0 CHECK (tokens_salida_audio >= 0),
  tokens_pensamiento    bigint        NOT NULL DEFAULT 0 CHECK (tokens_pensamiento >= 0),
  tokens_cache_escritos bigint        NOT NULL DEFAULT 0 CHECK (tokens_cache_escritos >= 0),
  tokens_cache_leidos   bigint        NOT NULL DEFAULT 0 CHECK (tokens_cache_leidos >= 0),
  duracion_seg          integer       CHECK (duracion_seg >= 0),
  turnos                integer       CHECK (turnos >= 0),
  costo_usd             numeric(12, 6) CHECK (costo_usd >= 0),
  se_cobra              boolean       NOT NULL DEFAULT true,
  creado_en             timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX consumo_ia_empresa_fecha_idx ON consumo_ia (empresa_id, creado_en);
CREATE INDEX consumo_ia_simulacion_idx ON consumo_ia (simulacion_id);

-- Total por mes y por empresa (el mes se corta en hora de Argentina).
CREATE VIEW consumo_mensual_por_empresa AS
SELECT empresa_id,
       date_trunc('month', creado_en AT TIME ZONE 'America/Argentina/Buenos_Aires') AS mes,
       count(*)                                         AS consultas,
       sum(costo_usd) FILTER (WHERE se_cobra)           AS costo_cobrado_usd,
       sum(costo_usd) FILTER (WHERE NOT se_cobra)       AS costo_equivalente_usd
FROM consumo_ia
GROUP BY empresa_id, date_trunc('month', creado_en AT TIME ZONE 'America/Argentina/Buenos_Aires');
