// Usuarios, identidades de Google e invitaciones en Postgres.
// Solo acceso a datos: las decisiones (quién entra) están en google.controller.js.
// TRANSICIÓN (paso 3a): las cuentas con contraseña siguen en usuarios.json hasta el paso 3b.
const { obtenerPool, query } = require("../../shared/db");

const CAMPOS = "u.id, u.email, u.nombre, u.rol, u.activo, u.token_version, u.empresa_id, e.nombre AS empresa";
const aUsuario = r => r && {
  id: r.id, email: r.email, nombre: r.nombre, rol: r.rol, activo: r.activo,
  tokenVersion: r.token_version, empresaId: r.empresa_id, empresa: r.empresa
};

async function buscarPorId(id) {
  const { rows } = await query(`SELECT ${CAMPOS} FROM usuarios u JOIN empresas e ON e.id = u.empresa_id WHERE u.id = $1`, [id]);
  return aUsuario(rows[0]) || null;
}

async function buscarPorIdentidad(proveedor, sub) {
  const { rows } = await query(
    `SELECT ${CAMPOS} FROM identidades_externas i
       JOIN usuarios u ON u.id = i.usuario_id
       JOIN empresas e ON e.id = u.empresa_id
      WHERE i.proveedor = $1 AND i.sub = $2`, [proveedor, sub]);
  return aUsuario(rows[0]) || null;
}

// Primer ingreso: si hay una invitación pendiente y vigente para ese email, crea el usuario,
// anota su identidad de Google y marca la invitación como usada. Todo o nada (una transacción).
// Devuelve el usuario, o null si no hay invitación válida.
async function aceptarInvitacion({ proveedor, sub, email, nombre }) {
  const cliente = await obtenerPool().connect();
  try {
    await cliente.query("BEGIN");
    // FOR UPDATE: si llegan dos pedidos a la vez con la misma invitación, el segundo espera y ya la ve usada.
    const inv = (await cliente.query(
      `SELECT id, empresa_id, rol FROM invitaciones
        WHERE email = $1 AND estado = 'pendiente' AND vence_en > now()
        FOR UPDATE`, [email])).rows[0];
    if (!inv) { await cliente.query("ROLLBACK"); return null; }

    // Si ya hay un usuario con ese email (por ejemplo, invitado antes con otra cuenta de Google), no se pisa.
    const existe = (await cliente.query("SELECT 1 FROM usuarios WHERE email = $1", [email])).rows.length > 0;
    if (existe) { await cliente.query("ROLLBACK"); return null; }

    const u = (await cliente.query(
      `INSERT INTO usuarios (empresa_id, email, nombre, rol) VALUES ($1, $2, $3, $4) RETURNING id`,
      [inv.empresa_id, email, nombre || email.split("@")[0], inv.rol])).rows[0];
    await cliente.query(`INSERT INTO identidades_externas (usuario_id, proveedor, sub) VALUES ($1, $2, $3)`, [u.id, proveedor, sub]);
    await cliente.query(`UPDATE invitaciones SET estado = 'usada', usada_por = $1, usada_en = now() WHERE id = $2`, [u.id, inv.id]);
    await cliente.query("COMMIT");
    return buscarPorId(u.id);
  } catch (e) {
    try { await cliente.query("ROLLBACK"); } catch (_) {}
    throw e;
  } finally {
    cliente.release();
  }
}

// Para el script de invitaciones. Crea la empresa si no existe (por nombre exacto).
async function crearInvitacion({ empresa, email, rol, dias = 7, creadaPor = null }) {
  const cliente = await obtenerPool().connect();
  try {
    await cliente.query("BEGIN");
    const empresas = (await cliente.query("SELECT id FROM empresas WHERE nombre = $1", [empresa])).rows;
    if (empresas.length > 1) throw new Error(`Hay más de una empresa llamada "${empresa}".`);
    const empresaId = empresas[0] ? empresas[0].id
      : (await cliente.query("INSERT INTO empresas (nombre) VALUES ($1) RETURNING id", [empresa])).rows[0].id;
    const yaEsUsuario = (await cliente.query("SELECT 1 FROM usuarios WHERE email = $1", [email])).rows.length > 0;
    if (yaEsUsuario) throw new Error("Ese email ya tiene una cuenta en Tutoring.");
    // Las pendientes que ya vencieron dejan de contar, así se puede volver a invitar.
    await cliente.query(`UPDATE invitaciones SET estado = 'vencida' WHERE email = $1 AND estado = 'pendiente' AND vence_en <= now()`, [email]);
    const pendiente = (await cliente.query(`SELECT 1 FROM invitaciones WHERE email = $1 AND estado = 'pendiente'`, [email])).rows.length > 0;
    if (pendiente) throw new Error("Ese email ya tiene una invitación pendiente.");
    const inv = (await cliente.query(
      `INSERT INTO invitaciones (empresa_id, email, rol, vence_en, creada_por)
       VALUES ($1, $2, $3, now() + make_interval(days => $4), $5) RETURNING id, vence_en`,
      [empresaId, email, rol, dias, creadaPor])).rows[0];
    await cliente.query("COMMIT");
    return { ...inv, empresaId, empresaNueva: !empresas[0] };
  } catch (e) {
    try { await cliente.query("ROLLBACK"); } catch (_) {}
    throw e;
  } finally {
    cliente.release();
  }
}

module.exports = { buscarPorId, buscarPorIdentidad, aceptarInvitacion, crearInvitacion };
