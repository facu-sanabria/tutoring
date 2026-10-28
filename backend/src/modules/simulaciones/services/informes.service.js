const crypto = require("crypto");
const { isObj } = require("../../../shared/utils/validacion");
const repo = require("../repositories/informes.repository");

// Informes de simulaciones: la empresa ve todos; estudiante y junior, solo los suyos.
const loVe = (yo, r) => yo.rol === "empresa" || (Boolean(r.usuarioId) && r.usuarioId === yo.id);

function listar(yo) {
  return repo.listar().map(r =>
    isObj(r) && r.id && loVe(yo, r) ? { id: r.id, candidato: r.candidato, escenario: r.escenario && r.escenario.titulo, empresa: r.empresa, fecha: r.fecha, puntaje: r.puntaje } : null
  ).filter(Boolean).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
}

// Devuelve { error: { status, message } } o { id }.
function crear(r, yo) {
  // El nombre sale de la sesión, no de lo que manda el navegador. Los scripts locales lo traen en el pedido.
  if (!yo.local) { r.candidato = yo.nombre; r.usuarioId = yo.id; }
  if (typeof r.candidato !== "string" || !r.candidato.trim()) return { error: { status: 400, message: "El informe no tiene candidato." } };
  if (!isObj(r.evaluacion)) return { error: { status: 400, message: "El informe no trae la evaluación." } };
  r.id = crypto.randomUUID();
  if (!r.fecha) r.fecha = new Date().toISOString();
  try { repo.guardar(r); }
  catch (_) { return { error: { status: 500, message: "No se pudo escribir el informe en data/informes." } }; }
  return { id: r.id };
}

// Devuelve { informe } o { error: { status, message } }.
function obtener(id, yo, sinPermiso) {
  const r = repo.leer(id);
  if (!isObj(r)) return { error: { status: 404, message: "El informe no existe" } };
  return loVe(yo, r) ? { informe: r } : { error: { status: 403, message: sinPermiso } };
}

const borrar = id => repo.borrar(id);

module.exports = { listar, crear, obtener, borrar };
