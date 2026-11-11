-- Up Migration
-- 0002: lo que hoy vive en data/empresa.json, normalizado en tablas.
-- Las vistas siguen pudiendo recibir y devolver el mismo JSON: la conversión
-- tabla <-> JSON se hace en empresa.repository.js, así el frontend no cambia.

-- Datos sueltos de la empresa (antes: responsable, tareaEjemplo, notasEvaluacion, vozTelefonica).
ALTER TABLE empresas
  ADD COLUMN responsable_nombre         text,
  ADD COLUMN responsable_rol            text,
  ADD COLUMN notas_evaluacion           text    NOT NULL DEFAULT '',
  ADD COLUMN voz_telefonica             boolean NOT NULL DEFAULT true,
  ADD COLUMN tarea_ejemplo_entender     text,
  ADD COLUMN tarea_ejemplo_trabajo      text,
  ADD COLUMN tarea_ejemplo_tarea        text,
  ADD COLUMN tarea_ejemplo_revisar      text;

-- Contexto que la empresa carga para entrenar a la IA.
-- clave: proposito, oferta, trabajo... (NULL en los que agrega la empresa por su cuenta).
CREATE TABLE contextos (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid    NOT NULL REFERENCES empresas (id) ON DELETE CASCADE,
  clave       text,
  titulo      text    NOT NULL CHECK (btrim(titulo) <> ''),
  contenido   text    NOT NULL DEFAULT '',
  general     boolean NOT NULL DEFAULT false,
  orden       integer NOT NULL DEFAULT 0,
  UNIQUE (empresa_id, clave)   -- los NULL no chocan entre sí: se pueden agregar varios propios
);
CREATE INDEX contextos_empresa_idx ON contextos (empresa_id);

-- Escenarios de simulación. modalidad queda sin CHECK a propósito: hoy hay 'llamada' y 'presencial'
-- y puede aparecer otra; inicio, voz y dificultad sí tienen valores cerrados en el código.
CREATE TABLE escenarios (
  id           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid    NOT NULL REFERENCES empresas (id) ON DELETE CASCADE,
  titulo       text    NOT NULL CHECK (btrim(titulo) <> ''),
  resumen      text,
  modalidad    text    NOT NULL,
  inicio       text    CHECK (inicio IN ('atiende', 'llama')),   -- NULL = habla primero el cliente
  voz          text    CHECK (voz IN ('femenina', 'masculina')),
  cliente      text,
  personalidad text,
  situacion    text,
  objetivo     text,
  ficha        text,
  cierre       text,
  duracion_min integer CHECK (duracion_min > 0),
  dificultad   text    CHECK (dificultad IN ('Baja', 'Media', 'Alta')),
  orden        integer NOT NULL DEFAULT 0
);
CREATE INDEX escenarios_empresa_idx ON escenarios (empresa_id);

CREATE TABLE escenario_glosario (
  escenario_id uuid    NOT NULL REFERENCES escenarios (id) ON DELETE CASCADE,
  termino      text    NOT NULL,
  significa    text    NOT NULL,
  orden        integer NOT NULL DEFAULT 0,
  PRIMARY KEY (escenario_id, termino)
);

-- Criterios con los que se evalúa. peso >= 0: RR. HH. puede dejarlo en 0 mientras los define.
CREATE TABLE criterios (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid          NOT NULL REFERENCES empresas (id) ON DELETE CASCADE,
  nombre      text          NOT NULL CHECK (btrim(nombre) <> ''),
  descripcion text          NOT NULL DEFAULT '',
  peso        numeric(6, 2) NOT NULL CHECK (peso >= 0),
  orden       integer       NOT NULL DEFAULT 0,
  UNIQUE (empresa_id, nombre)
);
CREATE INDEX criterios_empresa_idx ON criterios (empresa_id);

-- Qué cuenta y qué no cuenta para cada criterio (el evaluador los usa si existen).
CREATE TABLE criterio_indicadores (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  criterio_id uuid    NOT NULL REFERENCES criterios (id) ON DELETE CASCADE,
  tipo        text    NOT NULL CHECK (tipo IN ('cuenta', 'no_cuenta')),
  texto       text    NOT NULL CHECK (btrim(texto) <> ''),
  orden       integer NOT NULL DEFAULT 0
);
CREATE INDEX criterio_indicadores_criterio_idx ON criterio_indicadores (criterio_id);
