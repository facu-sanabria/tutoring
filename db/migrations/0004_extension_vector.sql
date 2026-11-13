-- Up Migration
-- 0004: activa pgvector (búsqueda por significado) para el mentor.
-- Todavía no hay tablas vectoriales: la dimensión del vector depende del modelo de embeddings,
-- que no está elegido. RDS for PostgreSQL y la imagen pgvector/pgvector de Docker la traen.
CREATE EXTENSION IF NOT EXISTS vector;
