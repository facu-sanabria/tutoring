/* Configuración de ejemplo de la empresa. El senior la edita desde la app
   (pestaña Empresa) y se guarda en data/empresa.json. */
window.T = window.T || {};

T.DEFAULTS = {
  empresa: "Nodo Software",
  senior: "Martín Sosa",

  contexto: {
    proposito: `Nodo Software es una software factory de San Miguel (18 personas).
Nuestro producto principal es TurnoFácil. Ayudamos a consultorios y peluquerías a llenar su agenda y reducir las ausencias: cada turno perdido es plata que pierde el cliente.`,

    producto: `TurnoFácil: sistema web de turnos. Unos 300 clientes, casi todos PyMEs (consultorios, odontólogos, peluquerías, barberías).
Los pacientes reservan online y reciben un recordatorio por WhatsApp o email 24 h antes.
Los recordatorios bajaron las ausencias un 30%: son la función que más valoran los clientes.`,

    arquitectura: `api/ (Node.js + Express): turnos, clientes, negocios, pagos. Base PostgreSQL.
web/ (React): panel del negocio y página de reservas.
jobs/recordatorios.js: corre cada 15 minutos y envía los recordatorios. Existe porque los recordatorios son lo que reduce las ausencias.
api/pagos (Mercado Pago): señas y cobros. Es dinero de los clientes: no se toca sin un senior.
Desde septiembre, el worker de jobs corre en 2 réplicas para soportar más carga.`,

    metodologia: `Scrum con sprints de 2 semanas. Daily 9:30 (15 min). Tablero en Jira, proyecto TF.
Ramas: feature/TF-123 desde develop. Hotfix solo para prioridad 1.
Definición de terminado: test del caso + review de un senior + probado en staging.
Deploys a producción martes y jueves a las 18 h.
Commits y PRs en español.`,

    problemas: `1. Entender el impacto: a cuántos clientes afecta y desde cuándo.
2. Reproducirlo antes de arreglarlo.
3. Buscar la causa, no parchear el síntoma.
4. Primero el cambio más chico y reversible.
5. Escribir un test del caso que falló.
6. PR con: qué cambia, por qué y cómo lo probaste.`,

    revision: `- ¿Resuelve la causa o solo el síntoma?
- Casos borde: datos vacíos, fechas, zonas horarias (los negocios están en distintas provincias).
- ¿Puede correr dos veces en paralelo sin romper nada?
- Tiene test del caso que falló.
- No rompe otros módulos que usan la misma función.
- Descripción del PR clara: qué, por qué y cómo se probó.`,

    clientes: `Sin tecnicismos. Primero escuchar y entender, después proponer.
No prometer fechas sin estimar con el equipo: "lo reviso y te aviso a las 15" es mejor que una promesa.
Avisar antes de que el cliente pregunte.`,

    restricciones: `api/pagos: solo con un senior.
No se accede a datos reales de pacientes fuera de producción.`
  },

  archivos: [
    {
      nombre: "jobs/recordatorios.js",
      contenido: `// jobs/recordatorios.js
// Corre cada 15 minutos (cron). En producción hay 2 réplicas del worker.
const db = require("../api/db");
const whatsapp = require("../api/servicios/whatsapp");
const email = require("../api/servicios/email");

async function enviarRecordatorios() {
  const turnos = await db.query(\`
    SELECT t.id, t.fecha_hora, c.nombre, c.telefono, c.email,
           n.nombre AS negocio, n.zona_horaria
    FROM turnos t
    JOIN clientes c ON c.id = t.cliente_id
    JOIN negocios n ON n.id = t.negocio_id
    WHERE t.estado = 'confirmado'
      AND t.recordatorio_enviado = false
      AND t.fecha_hora BETWEEN now() AND now() + interval '24 hours'
  \`);

  for (const turno of turnos.rows) {
    const mensaje = armarMensaje(turno);
    if (turno.telefono) await whatsapp.enviar(turno.telefono, mensaje);
    else await email.enviar(turno.email, "Recordatorio de turno", mensaje);

    await db.query(
      "UPDATE turnos SET recordatorio_enviado = true WHERE id = $1",
      [turno.id]
    );
  }
}

function armarMensaje(turno) {
  const hora = new Date(turno.fecha_hora).toLocaleString("es-AR", {
    timeZone: turno.zona_horaria
  });
  return \`Hola \${turno.nombre}, te recordamos tu turno en \${turno.negocio} el \${hora}. Respondé 1 para confirmar o 2 para cancelar.\`;
}

module.exports = { enviarRecordatorios };`
    }
  ],

  escenarios: [
    {
      id: "duplicados",
      titulo: "Recordatorios duplicados",
      resumen: "Una clínica llama molesta: sus pacientes reciben dos mensajes por turno.",
      cliente: "Laura Méndez, administrativa de Clínica Norte (San Miguel). Usa TurnoFácil hace dos años.",
      personalidad: "Educada pero molesta y apurada: tiene la sala de espera llena. Si la escuchan, se calma. Si le hablan en difícil o la apuran, se enoja más.",
      situacion: "Desde hace unas dos semanas, varios pacientes reciben el recordatorio del turno dos veces. Ayer un paciente se quejó en la recepción y otro canceló pensando que era spam.\nDatos que solo da si le preguntan: pasa con WhatsApp, no con email; no les pasa a todos, más o menos a 1 de cada 5; la clínica tiene unos 40 turnos por día; ya lo había comentado por mail y nadie le respondió.",
      objetivo: "Entender el problema, contener a la clienta, no prometer lo que no sabés y acordar próximos pasos claros.",
      duracion: 5,
      dificultad: "Media"
    },
    {
      id: "urgente",
      titulo: "Pedido urgente sin detalles",
      resumen: "El dueño de una barbería quiere \"algo para cobrar seña\" para mañana.",
      cliente: "Diego Paz, dueño de Barbería Paz (Bella Vista).",
      personalidad: "Acelerado y entusiasta. Habla rápido, no sabe de tecnología y cambia de idea sobre la marcha.",
      situacion: "Quiere que sus clientes paguen una seña al reservar porque los sábados tiene muchas ausencias. Lo quiere \"para mañana\".\nDatos que solo da si le preguntan: los sábados falta un 30% de los clientes; quiere una seña del 20%; ya cobra con Mercado Pago en el local; si alguien cancela con 24 h de anticipación, quiere devolverle la seña.",
      objetivo: "Hacer preguntas para entender la necesidad real, manejar el apuro sin prometer fechas y resumir lo acordado.",
      duracion: 5,
      dificultad: "Media"
    },
    {
      id: "demora",
      titulo: "Comunicar una demora",
      resumen: "Tenés que avisarle a una clienta que la función que pidió se atrasa una semana.",
      cliente: "Marta Ríos, dueña del Consultorio Odontológico Ríos (Muñiz).",
      personalidad: "Tranquila pero firme. Le molesta quedar mal con sus pacientes.",
      situacion: "El estudiante la llama para avisarle que la reserva online con pago se atrasa una semana por un problema en la integración de pagos. Ella ya les anunció a sus pacientes que desde el viernes podían reservar online.\nDatos que solo da si le preguntan: aceptaría una solución parcial (reservas online sin pago); necesita un texto para avisarles a sus pacientes; lo que más le importa es no quedar mal.",
      objetivo: "Dar la mala noticia con claridad y empatía, hacerte cargo y proponer alternativas concretas.",
      duracion: 5,
      dificultad: "Alta"
    }
  ],

  criterios: [
    { nombre: "Escucha activa", descripcion: "Deja hablar al cliente, retoma lo que dijo y no interrumpe.", peso: 3 },
    { nombre: "Preguntas para entender", descripcion: "Hace preguntas concretas antes de proponer: qué pasa, desde cuándo, a quién afecta.", peso: 3 },
    { nombre: "Claridad", descripcion: "Se expresa en frases simples, ordenadas y sin tecnicismos.", peso: 2 },
    { nombre: "Empatía", descripcion: "Reconoce el malestar del cliente y lo contiene sin ponerse a la defensiva.", peso: 2 },
    { nombre: "Manejo de expectativas", descripcion: "No promete fechas ni soluciones que no puede garantizar.", peso: 3 },
    { nombre: "Cierre y próximos pasos", descripcion: "Resume lo acordado y deja claro qué va a pasar y cuándo avisa.", peso: 2 }
  ],

  notasEvaluacion: "Valoramos más la honestidad que la velocidad. Un \"no sé, lo averiguo y te aviso a las 15\" vale más que una promesa sin fundamento."
};

T.CONTEXT_SECTIONS = [
  { key: "proposito", titulo: "Propósito del negocio", ayuda: "Qué hace la empresa y para qué existe." },
  { key: "producto", titulo: "Producto y clientes", ayuda: "Qué usan los clientes y qué valoran." },
  { key: "arquitectura", titulo: "Arquitectura y módulos", ayuda: "Cada módulo con su porqué de negocio." },
  { key: "metodologia", titulo: "Metodología de trabajo", ayuda: "Sprints, ramas, reviews, deploys." },
  { key: "problemas", titulo: "Cómo encaramos un problema", ayuda: "El orden de trabajo que esperás." },
  { key: "revision", titulo: "Criterios de revisión (PR)", ayuda: "Lo que mirás en un code review." },
  { key: "clientes", titulo: "Trato con clientes", ayuda: "Cómo se habla con un cliente." },
  { key: "restricciones", titulo: "Restricciones", ayuda: "Lo que no se toca sin un senior." }
];
