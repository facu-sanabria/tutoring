-- 0001: empresas, usuarios, identidades de Google e invitaciones.
-- Base: PostgreSQL 15 o superior (gen_random_uuid() viene incluido desde la 13).
-- Los emails se guardan SIEMPRE en minúsculas; la base lo exige con un CHECK.

BEGIN;

-- Cada empresa aliada. Todo lo demás cuelga de acá (un candidato pertenece a UNA sola empresa).
CREATE TABLE empresas (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     text        NOT NULL CHECK (btrim(nombre) <> ''),
  rubro      text,
  creada_en  timestamptz NOT NULL DEFAULT now()
);

-- Personas con cuenta. No hay contraseñas: se entra solo con Google.
-- token_version: al subirlo, todos los JWT anteriores de esa persona dejan de valer.
CREATE TABLE usuarios (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid        NOT NULL REFERENCES empresas (id),
  email          text        NOT NULL UNIQUE CHECK (email = lower(email)),
  nombre         text        NOT NULL CHECK (btrim(nombre) <> ''),
  rol            text        NOT NULL CHECK (rol IN ('estudiante', 'junior', 'empresa')),
  activo         boolean     NOT NULL DEFAULT true,
  token_version  integer     NOT NULL DEFAULT 1,
  creado_en      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX usuarios_empresa_idx ON usuarios (empresa_id);

-- El "padrón": qué cuenta de Google (sub) corresponde a qué usuario nuestro.
-- El sub no cambia nunca; el email sí puede cambiar, por eso se reconoce por sub.
CREATE TABLE identidades_externas (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  uuid        NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  proveedor   text        NOT NULL CHECK (proveedor IN ('google')),
  sub         text        NOT NULL,
  creada_en   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proveedor, sub),          -- una cuenta de Google no puede ser dos usuarios
  UNIQUE (usuario_id, proveedor)    -- un usuario tiene como mucho una cuenta por proveedor
);

-- Permiso para crear una cuenta. Se usa una sola vez.
-- El link solo lleva a "Entrar con Google"; lo que autoriza es que el email verificado por Google coincida.
-- 'vencida' la marca la app (la base no puede comparar con la hora actual dentro de un índice).
CREATE TABLE invitaciones (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid        NOT NULL REFERENCES empresas (id),
  email       text        NOT NULL CHECK (email = lower(email)),
  rol         text        NOT NULL CHECK (rol IN ('estudiante', 'junior', 'empresa')),
  estado      text        NOT NULL DEFAULT 'pendiente'
                          CHECK (estado IN ('pendiente', 'usada', 'revocada', 'vencida')),
  creada_por  uuid        REFERENCES usuarios (id),   -- NULL cuando la crea el script de la primera empresa
  creada_en   timestamptz NOT NULL DEFAULT now(),
  vence_en    timestamptz NOT NULL,
  usada_por   uuid        REFERENCES usuarios (id),
  usada_en    timestamptz,
  CHECK (vence_en > creada_en),
  -- Una invitación usada tiene quién la usó y cuándo; las demás no.
  CHECK ((estado = 'usada') = (usada_por IS NOT NULL AND usada_en IS NOT NULL))
);
CREATE INDEX invitaciones_empresa_idx ON invitaciones (empresa_id);
-- Un mismo email no puede tener dos invitaciones pendientes (ni de empresas distintas):
-- así una persona queda ligada a una sola empresa.
CREATE UNIQUE INDEX invitaciones_una_pendiente_por_email ON invitaciones (email) WHERE estado = 'pendiente';

COMMIT;
