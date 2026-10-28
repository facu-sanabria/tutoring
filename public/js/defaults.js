/* Empresas de ejemplo. La persona responsable las carga desde Empresa → Contexto →
   "Cargar ejemplo" y las edita; se guardan en data/empresa.json.
   OJO: el código de Nodo Software y el cambio de ejemplo del junior tienen bugs
   A PROPÓSITO (son el material de la demo). No los corrijas. */
window.T = window.T || {};

(function () {
  const g = (clave, contenido) => ({ id: "g-" + clave, clave, titulo: T.core.GENERALES.find(x => x.clave === clave).titulo, contenido, general: true });
  const p = (id, titulo, contenido) => ({ id, titulo, contenido, general: false });

  // ---------------------------------------------------------------- Nodo Software
  const nodo = {
    version: 3,
    empresa: "Nodo Software",
    rubro: "Software",
    responsable: { nombre: "Cecilia Arce", rol: "Dirección general" },

    contextos: [
      g("proposito", `Nodo Software es una software factory de San Miguel con 18 personas. Fue fundada hace seis años por Martín Sosa y Cecilia Arce, que empezaron haciendo sistemas de turnos para un consultorio de su familia.
Nuestro producto principal es TurnoFácil: un sistema web de turnos para consultorios, peluquerías, barberías y otros negocios de servicios. Tiene unos 300 clientes, casi todos PyMEs de uno a cinco empleados. Cada turno perdido es plata que pierde el cliente final.`),
      g("oferta", `TurnoFácil: reservas online desde un enlace del negocio (Instagram, Google o WhatsApp); recordatorios 24 horas antes por WhatsApp o email, donde el paciente responde 1 para confirmar o 2 para cancelar (bajaron las ausencias un 30 % en promedio); agenda diaria y semanal con bloqueos; señas opcionales cobradas con Mercado Pago; multisucursal en el plan Clínica.
Planes (precios de ejemplo, se actualizan por inflación): Básico, para un profesional y un local, $ 45.000 por mes; Pro, hasta cinco profesionales, con WhatsApp y señas, $ 89.000 por mes; Clínica, varias sucursales, a convenir.
Prueba gratis de 30 días, sin tarjeta. Se puede cambiar de plan en cualquier momento; el cambio se aplica al mes siguiente. Los aumentos se avisan con 30 días de anticipación, por email y en el panel.`),
      g("trabajo", `Scrum con sprints de 2 semanas. Daily 9:30 (15 min). Tablero en Jira, proyecto TF.
Ramas: feature/TF-123 desde develop. Hotfix solo para prioridad 1.
Definición de terminado: test del caso + review de un senior + probado en staging.
Deploys a producción martes y jueves a las 18 h.
Commits y PRs en español.

Equipo (solo para el mentor y la evaluación, no para el cliente):
Martín Sosa, líder técnico: arquitectura y prioridades técnicas.
Cecilia Arce, dirección general: decisiones de negocio, precios y clientes grandes.
Ignacio Duarte, product owner: prioridades de cada sprint y alcance de los pedidos de clientes.
Ramiro Ibarra, senior de pagos: todo lo que toca Mercado Pago. Único que toca api/pagos.
Agustina Ferrari, soporte de primer nivel.
Tomás Quiroga, dev senior de backend: recordatorios, jobs e integración con WhatsApp.
Julieta Peña, dev frontend: panel del negocio y página de reservas.`),
      g("problemas", `1. Entender el impacto: a cuántos clientes afecta y desde cuándo.
2. Reproducirlo antes de arreglarlo.
3. Buscar la causa, no parchear el síntoma.
4. Primero el cambio más chico y reversible.
5. Escribir un test del caso que falló.
6. PR con: qué cambia, por qué y cómo lo probaste.`),
      g("clientes", `Sin tecnicismos. Primero escuchar y entender, después proponer.
No prometer fechas sin estimar con el equipo: "lo reviso y te aviso a las 15" es mejor que una promesa.
Avisar antes de que el cliente pregunte. Nunca culpar a un compañero ni a otro proveedor delante del cliente: se dice "estamos revisando".
Reconocer el impacto: si un paciente canceló por el error, eso es lo primero que se nombra.
Quién decide qué: soporte resuelve el uso del sistema; pagos, señas y devoluciones van a Ramiro (confirmar recepción en 2 horas hábiles, resolver en 48); cambios de precio o descuentos los autoriza Cecilia; las migraciones grandes se estiman con un senior antes de dar fecha.`),
      g("calidad", `- ¿Resuelve la causa o solo el síntoma?
- Casos borde: datos vacíos, fechas, zonas horarias (los negocios están en distintas provincias).
- ¿Puede correr dos veces en paralelo sin romper nada?
- Tiene test del caso que falló.
- No rompe otros módulos que usan la misma función.
- Descripción del PR clara: qué, por qué y cómo se probó.`),
      g("restricciones", `api/pagos: solo con un senior (Ramiro).
No se accede a datos reales de pacientes fuera de producción.
Antes de modificar jobs/recordatorios.js, tener en cuenta que el worker corre en dos réplicas.`),
      p("p-arquitectura", "Arquitectura y módulos", `api/ (Node.js + Express): turnos, clientes, negocios, pagos. Base PostgreSQL.
web/ (React): panel del negocio y página de reservas.
jobs/recordatorios.js: corre cada 15 minutos y envía los recordatorios. Existe porque los recordatorios son lo que reduce las ausencias.
api/pagos (Mercado Pago): señas y cobros. Es dinero de los clientes: no se toca sin un senior.
Desde septiembre, el worker de jobs corre en 2 réplicas para soportar más carga.`)
    ],

    documentos: [
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
      },
      {
        nombre: "playbook-soporte",
        contenido: `Incidentes típicos y cómo se resuelven (uso interno del mentor y de la evaluación).

1. Recordatorios duplicados (clínica). Síntoma: pacientes reciben dos mensajes por WhatsApp. Causa típica: el job corre en dos réplicas y el marcado de enviado llega tarde. Qué hacer: no prometer fecha; confirmar impacto (cuántos pacientes, desde cuándo); dev reproduce en staging; avisar cuando hay fix. Qué no hacer: tocar api/pagos ni desactivar recordatorios sin avisar.
2. Turno que no aparece (peluquería). Causa típica: zona horaria mal configurada o turno cargado en otra sucursal. Qué hacer: pedir captura del mail de confirmación y el enlace de reserva; revisar en el panel si el turno existe y en qué sucursal.
3. Pago aprobado, turno sin confirmar (estética). Causa típica: el aviso de Mercado Pago llegó tarde o se perdió. Qué hacer: escalar a Ramiro con el número de operación; no prometer plazo hasta que Ramiro confirme; decir que el dinero no se pierde y que se avisa en 48 horas hábiles.
4. Baja por aumento de precio (barbería). Qué hacer: escuchar el motivo; reconocer si el aviso llegó con poca anticipación; mostrar el plan Básico como alternativa; descuentos solo si Cecilia los autorizó.
5. Migración de clientes desde una planilla (peluquería). Qué hacer: pedir una planilla de muestra; normalizar teléfonos sin código de área; unificar clientes repetidos por teléfono; estimar con un dev senior antes de dar fecha.
6. Respuestas de WhatsApp no registradas. Causa típica: el mensaje llegó fuera de la ventana de 24 horas o con texto extra ("1 gracias"). Qué hacer: explicar al negocio que el paciente puede llamar para confirmar; registrar el caso para revisar el parser.`
      }
    ],

    // Textos que precargan las tarjetas del junior.
    tareaEjemplo: {
      entender: "Explicame qué hace jobs/recordatorios.js y por qué existe.",
      trabajo: "¿Cómo trabaja el equipo? Contame el proceso desde que tomo un ticket hasta que llega a producción.",
      tarea: "Me asignaron este ticket:\n\nTF-142 · Prioridad 2\nAlgunos clientes reciben el recordatorio del turno dos veces por WhatsApp. Lo reportaron Clínica Norte y 3 peluquerías. Empezó a mediados de septiembre.\n\n¿Cómo lo encaro?",
      revisar: "Revisá mi cambio antes de abrir el PR (ticket TF-142):\n\n```js\n// jobs/recordatorios.js\nfor (const turno of turnos.rows) {\n  // Marco el turno antes de enviar para que no se repita\n  await db.query(\n    \"UPDATE turnos SET recordatorio_enviado = true WHERE id = $1\",\n    [turno.id]\n  );\n  const mensaje = armarMensaje(turno);\n  await whatsapp.enviar(turno.telefono, mensaje);\n}\n```"
    },

    escenarios: [
          {
                "id": "bloqueo-compañero",
                "titulo": "Un compañero bloquea tu ticket",
                "resumen": "Estás en el daily del equipo de Nodo Software. Tu ticket de recordatorios depende de una revisión de Tomás Quiroga, dev senior de backend, que lleva dos días sin responder. El sprint cierra el viernes y necesitás destrabarlo hoy.",
                "modalidad": "llamada",
                "cliente": "Tomás Quiroga, dev senior de backend de Nodo. Muy bueno y muy ocupado.",
                "personalidad": "Cortante y con prisa. No es hostil, pero se cierra si lo presionan. Responde mejor a pedidos concretos.",
                "situacion": "Te acercás a su escritorio durante el daily para pedirle la revisión del PR de recordatorios. A mitad de la charla te dice que ya arregló el problema en otra rama, pero no lo comunicó. Solo si preguntan: El PR tiene 240 líneas; Julieta podría revisar pero no conoce el módulo; tiene reunión con Martín a las 11.",
                "objetivo": "Desbloquear el ticket sin escalar ni culpar, acordar una revisión concreta y coordinar con quien ya tiene el cambio.",
                "cierre": "Se resuelve cuando acuerdan quién revisa el PR y en qué plazo, o cuando el candidato propone algo concreto que Tomás puede aceptar. Si el candidato solo pide disculpas o insiste sin proponer nada, Tomás corta con un 'dale, después lo vemos'.",
                "duracion": 8,
                "dificultad": "Media"
          },
          {
                "id": "alcance-sprint",
                "titulo": "Te piden meter tres features antes del cierre",
                "resumen": "Ignacio Duarte, product owner de Nodo, te pide una reunión de planificación. Quiere sumar tres pedidos de clientes al sprint que cierra en dos días. Tenés que responderle qué entra, qué no y por qué.",
                "modalidad": "llamada",
                "cliente": "Ignacio Duarte, product owner de Nodo. Tiene presión de dirección y de clientes.",
                "personalidad": "Entusiasta y rápido. Cree que todo es un cambio chico. Cambia de opinión si ve datos.",
                "situacion": "Pide sumar exportación a Excel de la agenda, recordatorio por SMS y zona horaria por sucursal. A los 5 minutos te cuenta que uno de los clientes que lo pidió canceló ayer, pero dirección igual quiere el cambio. Solo si preguntan: El equipo tiene 30 horas disponibles; el sprint ya tiene cuatro tickets comprometidos; la zona horaria toca el módulo de recordatorios.",
                "objetivo": "Negociar el alcance con datos: explicar qué entra, qué no y por qué, sin decir que sí a todo ni cerrar con un no vacío.",
                "cierre": "Se resuelve cuando acuerdan qué entra, qué queda para el siguiente sprint y qué hace falta para decidir lo demás. Si el candidato acepta todo sin análisis, Ignacio lo toma como bien pero pide confirmación por escrito. Si rechaza todo sin alternativas, insiste y la conversación queda abierta.",
                "duracion": 10,
                "dificultad": "Alta"
          },
          {
                "id": "incidente-viernes",
                "titulo": "Viernes 19:30: los recordatorios no salieron",
                "resumen": "Es viernes a la noche y sos el responsable de guardia. Agustina Ferrari, de soporte, te llama porque varios pacientes de clientes de TurnoFácil no recibieron el recordatorio de los turnos de mañana. Tenés que atender la llamada y decidir qué hacer.",
                "modalidad": "llamada",
                "cliente": "Agustina Ferrari, soporte de Nodo. Preocupada pero no entra en pánico; necesita saber qué hacer.",
                "personalidad": "Ansiosa al principio. Se calma si ve un plan. Hace varias preguntas seguidas.",
                "situacion": "Llama al responsable de guardia por un problema con los recordatorios de la noche. A los 4 minutos aparece que hubo un deploy a las 18 h que tocó el worker, y Martín no atiende el teléfono. Solo si preguntan: El worker corre en dos réplicas; hay turnos el sábado a la mañana; el rollback está documentado pero nadie lo probó.",
                "objetivo": "Triagear el incidente, decidir un primer paso reversible, avisar a quien corresponde y dejar un registro. No improvisar un arreglo en producción.",
                "cierre": "Se resuelve cuando hay un primer paso concreto (quién hace qué, en cuánto tiempo y cómo se avisa a los clientes afectados). Si el candidato promete arreglar todo sin revisar el impacto, Agustina lo marca y pide una reunión con Martín; la llamada termina con un plan incompleto.",
                "duracion": 10,
                "dificultad": "Alta"
          },
          {
                "id": "feedback-pr",
                "titulo": "Feedback a una compañera sobre su PR",
                "resumen": "Tenés una reunión 1:1 con Julieta Peña, dev frontend de Nodo. Revisaste su PR del panel del negocio y tenés comentarios para darle. Es una conversación de equipo, no una evaluación de desempeño.",
                "modalidad": "llamada",
                "cliente": "Julieta Peña, dev frontend de Nodo. Buena y sensible a las críticas, sobre todo si la sienten pública.",
                "personalidad": "Cordial al principio. Se pone a la defensiva si siente que la juzgan. Cede si le explican el porqué con ejemplos.",
                "situacion": "Tenés que hablar de un bug de zona horaria (la fecha se muestra en UTC), dos componentes sin etiquetas para lectores de pantalla y una variable con nombre confuso. A mitad de la revisión te cuenta que Martín le pidió el PR con apuro y que ella ya lo había avisado. Solo si preguntan: El bug apareció en un negocio de Ushuaia; la accesibilidad es requisito de la página de reservas.",
                "objetivo": "Dar feedback específico y constructivo, separar lo urgente de lo opcional, escuchar la justificación y acordar qué cambia y cuándo.",
                "cierre": "Se resuelve cuando Julieta entiende los problemas y acuerdan cuáles son obligatorios y para cuándo. Si el candidato critica a la persona en vez del código, Julieta se cierra y la conversación termina sin acuerdos.",
                "duracion": 10,
                "dificultad": "Media"
          },
          {
                "id": "estimacion-direccion",
                "titulo": "La directora pide una estimación",
                "resumen": "Cecilia Arce, directora de Nodo, te llama en medio de otra reunión. Quiere saber si se puede migrar la base de pacientes de Clínica Norte antes de fin de mes. Todavía no tenés todos los datos.",
                "modalidad": "llamada",
                "cliente": "Cecilia Arce, directora de Nodo. Va directo al punto y no le gustan los rodeos.",
                "personalidad": "Impaciente, exigente y justa. Si detecta una respuesta inflada o vaga, la pide de nuevo.",
                "situacion": "Te llama para pedir una estimación de la migración de Clínica Norte. A los 5 minutos te dice que el cliente agregó dos sucursales más y quiere saber el costo. Solo si preguntan: La planilla tiene cuatro formatos de teléfono; hay unos 300 duplicados aproximados; nadie hizo una migración de este tamaño antes.",
                "objetivo": "Responder con una estimación con rango y nivel de confianza, explicar supuestos y riesgos, y decir qué información falta y cuándo se consigue.",
                "cierre": "Se resuelve cuando tiene un rango con supuestos y lo que falta. Si el candidato da una fecha sin rango, Cecilia la pide de nuevo; si cede a todo sin análisis, lo dice y corta.",
                "duracion": 8,
                "dificultad": "Alta"
          },
          {
                "id": "integracion-imposible",
                "titulo": "La clínica pide una integración imposible",
                "resumen": "Ariel Montenegro, director médico de Clínica Norte y cliente de TurnoFácil desde hace dos años, te llama. Quiere conectar el sistema con su software de historias clínicas y dice que está evaluando otros proveedores.",
                "modalidad": "llamada",
                "cliente": "Dr. Ariel Montenegro, director médico de Clínica Norte. Formal, poco tiempo y con un proveedor anterior que lo defraudó.",
                "personalidad": "Formal y con tono de autoridad. Respeta a quien admite lo que no sabe y desconfía de quien promete todo.",
                "situacion": "Te llama para plantear la integración con su software de historias clínicas, que no tiene API pública. A los 5 minutos menciona que otro proveedor ya le contestó que sí a la integración. Solo si preguntan: Manejan datos de salud (sensibles); el contrato actual vence en 60 días; el otro proveedor no sabe qué datos se van a intercambiar.",
                "objetivo": "Mantener la relación sin prometer lo que no se puede, explicar qué sí es posible, derivar a dirección y proponer un próximo paso con fecha.",
                "cierre": "Se resuelve cuando hay un próximo paso concreto (reunión con dirección y fecha de respuesta). Si el candidato promete la integración, pide confirmación por escrito. Si dice que no sin ofrecer nada, el doctor termina la llamada anunciando el cambio de proveedor.",
                "duracion": 10,
                "dificultad": "Alta"
          }
    ],

    criterios: [
      { nombre: "Escucha y claridad", descripcion: "Deja hablar, retoma lo que dijo el otro sin pedir que lo repita y se expresa en frases simples y ordenadas.", peso: 15, indicadores: {"cuenta": ["retoma con palabras propias lo que dijo el otro, para confirmar que entendió", "pregunta por lo que no entendió, sin pedir que repita lo que ya dijo", "explica en frases cortas y ordenadas, y define los términos técnicos que usa"], "noCuenta": ["pide que le repitan algo que ya se dijo", "responde a otra pregunta distinta de la que le hicieron", "habla largo sin pausas ni espacio para el otro, o usa jerga sin explicarla"]} },
      { nombre: "Empatía y contención", descripcion: "Reconoce el malestar o la presión del otro y lo contiene sin ponerse a la defensiva ni culpar a nadie.", peso: 10, indicadores: {"cuenta": ["nombra, con sus palabras, el sentimiento o la presión que nota en el otro", "deja que el otro termine y espera antes de proponer una solución", "reconoce el impacto que el problema tiene en el otro, sin culpar a nadie ni a nada", "la contención se nota en la conducta posterior: el otro se siente escuchado y sigue la conversación"], "noCuenta": ["tranquiliza sin contenido ('no te preocupes', 'todo va a estar bien') como única respuesta", "minimiza lo que siente el otro", "culpa a una persona, un proceso o un sistema para protegerse", "promete una solución sin plan: una promesa no es empatía"]} },
      { nombre: "Cierre y próximos pasos", descripcion: "Resume lo acordado, dice qué va a pasar, quién lo hace y cuándo vuelve a comunicarse.", peso: 10, indicadores: {"cuenta": ["resume lo que quedó acordado antes de cortar", "dice quién hace cada cosa, para cuándo y cómo se avisa", "confirma que el otro está de acuerdo con el plan"], "noCuenta": ["se despide sin acuerdo concreto", "deja 'hablamos después' o 'te aviso' sin fecha ni canal", "no nombra a quién le corresponde cada paso"]} },
      { nombre: "Criterio y autonomía", descripcion: "Averigua antes de prometer, resuelve lo que le corresponde y deriva lo que no. No promete fechas ni soluciones que no puede garantizar.", peso: 20, indicadores: {"cuenta": ["distingue qué puede resolver él y qué necesita que decida o haga otra persona", "verifica antes de prometer: pide datos o hace la pregunta de diagnóstico", "propone un primer paso acotado y reversible", "deriva con nombre de la persona y motivo concreto"], "noCuenta": ["promete una resolución o una fecha sin datos que la respalden", "le asigna a otro una tarea que le corresponde a él", "decide cambios en producción sin verificar el impacto"]} },
      { nombre: "Receptividad", descripcion: "Incorpora lo que dice el cliente, el compañero o el equipo, y ajusta su propuesta cuando recibe información nueva.", peso: 10, indicadores: {"cuenta": ["cambia su propuesta cuando aparece un dato nuevo, y lo dice en voz alta", "integra en el plan lo que dijo el otro, en vez de repetir su plan original"], "noCuenta": ["repite el plan original aunque el otro aportó un dato que lo cambia", "ignora la información que le dieron"]} },
      { nombre: "Curiosidad", descripcion: "Pregunta para entender lo que no sabe: desde cuándo, a quién afecta, qué se intentó antes. No da por sentado lo que no se dijo.", peso: 20, indicadores: {"cuenta": ["pregunta desde cuándo pasa, a quién afecta y qué cambió antes", "pregunta qué se intentó antes de proponer algo", "profundiza: sigue la respuesta con una pregunta más precisa"], "noCuenta": ["hace preguntas genéricas que no se conectan con lo que dijo el otro", "asume causas o antecedentes que nadie mencionó"]} },
      { nombre: "Iniciativa", descripcion: "Propone alternativas o próximos pasos sin que se lo pidan y se ofrece a hacer algo concreto dentro de lo que le corresponde.", peso: 15, indicadores: {"cuenta": ["propone alternativas o próximos pasos sin que se los pidan", "se ofrece a algo concreto dentro de lo que le corresponde", "anticipa un riesgo o una consecuencia y lo nombra"], "noCuenta": ["espera instrucciones antes de moverse", "ofrece ayuda vaga ('avisame si necesitás algo')"]} }
    ],

    notasEvaluacion: "Valorá la confiabilidad (cumple lo que promete), el pensamiento crítico (distingue lo que sabe de lo que supone), la curiosidad (pregunta lo que no sabe) y la receptividad (incorpora lo que dice el otro). Preferimos un 'lo consulto y te confirmo' antes que una respuesta rápida inventada. Con datos de pacientes y pagos no hay margen de error."
  };

  // ---------------------------------------------------------------- La Esquina (bodegón)
  // Palabras técnicas que aparecen en cada escenario, explicadas en una línea para el briefing.
  const GLOSARIO = {
    "bloqueo-compañero": [
      { termino: "Daily", significa: "reunión corta de pie, de 15 minutos, en la que cada uno cuenta qué hizo, qué hará y qué lo traba." },
      { termino: "Ticket", significa: "tarea registrada en el tablero del equipo, con su descripción y su responsable." },
      { termino: "Revisión (PR)", significa: "un compañero lee tu cambio de código antes de sumarlo al proyecto." },
      { termino: "Sprint", significa: "el período de trabajo (acá, dos semanas) con lo que el equipo se comprometió a entregar." }
    ],
    "alcance-sprint": [
      { termino: "Sprint", significa: "el período de trabajo con lo que el equipo se comprometió a entregar." },
      { termino: "Product owner", significa: "la persona que decide qué se construye primero." },
      { termino: "Feature", significa: "una funcionalidad nueva que ve el usuario." },
      { termino: "Backlog", significa: "la lista de pedidos pendientes, ordenada por prioridad." }
    ],
    "incidente-viernes": [
      { termino: "Guardia", significa: "la persona que atiende los problemas urgentes fuera del horario de trabajo." },
      { termino: "Deploy", significa: "subir a producción una versión nueva del sistema." },
      { termino: "Worker", significa: "programa que corre solo, sin pantalla (acá, el que manda los recordatorios)." },
      { termino: "Rollback", significa: "volver a la versión anterior, la que funcionaba." }
    ],
    "feedback-pr": [
      { termino: "PR (pull request)", significa: "propuesta de cambio de código que otro revisa antes de sumarla." },
      { termino: "Merge", significa: "aprobar y sumar el cambio al código principal." },
      { termino: "Feedback", significa: "devolución sobre cómo hizo algo, para que lo mejore." }
    ],
    "estimacion-direccion": [
      { termino: "Estimación", significa: "cuánto tiempo calculás que lleva algo, dando un rango." },
      { termino: "Deuda técnica", significa: "partes del código que quedaron mal hechas y hacen más lento el trabajo." },
      { termino: "Sprint", significa: "el período de trabajo con lo que el equipo se comprometió a entregar." }
    ],
    "integracion-imposible": [
      { termino: "Integración", significa: "conectar nuestro sistema con el software de otra empresa." },
      { termino: "API", significa: "la forma en que dos sistemas se hablan entre sí." },
      { termino: "Sandbox", significa: "un entorno de prueba separado de los datos reales." }
    ]
  };
  nodo.escenarios.forEach(e => { e.glosario = GLOSARIO[e.id] || []; });

  const esquina = {
    version: 2,
    empresa: "La Esquina",
    rubro: "Gastronomía",
    responsable: { nombre: "Ana Gómez", rol: "Encargada de salón" },

    contextos: [
      g("proposito", `La Esquina es un bodegón familiar del centro de San Miguel, a dos cuadras de la estación. Lo abrió la familia Gómez en 1987 y hoy somos 25 personas.
Queremos que la gente coma rico, abundante y a buen precio, y que se sienta como en casa: muchos clientes vienen hace años y nos conocen por el nombre. Un cliente mal atendido no vuelve y se lo cuenta a diez.`),
      g("oferta", `Cocina casera de bodegón: milanesas, pastas caseras, minutas, parrilla los fines de semana y postres de la casa (flan, budín de pan).
Menú ejecutivo de lunes a viernes al mediodía (plato + bebida + postre o café).
Salón para 90 personas en 3 sectores (salón principal, fondo y vereda). Tomamos reservas por teléfono y WhatsApp. Delivery propio en un radio de 20 cuadras.
Clientes: familias los fines de semana, oficinistas y comerciantes al mediodía, estudiantes de la zona y grupos que festejan cumpleaños.
Lo que más valoran: las porciones, la atención cálida y que la comida salga rápido al mediodía.`),
      g("trabajo", `Dos turnos: mediodía (11:30 a 16) y noche (19:30 a 0:30). De martes a domingo; los lunes cerramos a la noche.
Roles: encargada de salón (Ana), jefe de cocina (Rubén), 6 mozos por turno con sector asignado, 2 ayudantes de cocina, bachero y cajera.
Antes de cada turno hay una reunión de 10 minutos: platos del día, qué se terminó, reservas y grupos.
Las comandas se cargan en la tablet del salón y salen impresas en cocina. Todo pedido especial (alergias, sin sal, punto de la carne) se escribe en el campo "Observaciones".
Las propinas se juntan y se reparten por igual al cierre de cada turno.`),
      g("problemas", `1. Escuchar al cliente hasta el final, sin interrumpir ni justificarse.
2. Disculparse por la situación (no hace falta echarle la culpa a nadie).
3. Averiguar qué pasó de verdad (en cocina, en la comanda o en caja) antes de prometer nada.
4. Ofrecer una solución concreta dentro de lo que el mozo puede dar solo.
5. Si hace falta algo más, llamar a la encargada.
6. Anotarlo en el cuaderno de novedades al final del turno, para que no se repita.`),
      g("clientes", `Saludar en menos de un minuto desde que se sientan, aunque sea para decir "ya estoy con ustedes".
Nunca decir "no es mi mesa": si te llaman, te hacés cargo o avisás al compañero.
Tiempos reales: si la cocina está demorada, se avisa al tomar el pedido.
No se discute con un cliente enojado delante de otras mesas: se escucha y se resuelve.
A los clientes de siempre se los saluda por el nombre.`),
      g("calidad", `- El plato sale de la pasa en menos de 20 minutos al mediodía y 30 a la noche.
- Caliente lo caliente: si el plato espera más de 2 minutos en la pasa, se avisa a cocina.
- La comanda está completa: mesa, cubiertos, observaciones y alergias.
- La mesa se limpia y se vuelve a armar en menos de 3 minutos cuando se va un cliente.
- El ticket coincide con lo que se consumió antes de llevarlo a la mesa.`),
      g("restricciones", `Descuentos o invitaciones más allá de una bebida o un postre: solo la encargada.
Grupos de más de 12 personas o que llegan sin reserva: siempre consultar a la encargada antes de confirmar.
Alergias: nunca decir "no tiene" sin confirmarlo con el jefe de cocina.
La caja la maneja solo la cajera o la encargada.`),
      p("p-salon", "Atención en el salón", `Cada mozo tiene su sector y lo recorre con la mirada cada vez que pasa: vasos vacíos, platos terminados, alguien que levanta la mano.
Orden de servicio: saludo y carta, bebidas, pedido (ofrecer el plato del día), entradas, principales, retirar, postre y café, cuenta.
La cuenta se lleva solo cuando la piden. Se cobra en la mesa con el posnet o en caja con efectivo.
Si un plato se termina en cocina, avisan por la pasa y los mozos lo informan antes de tomar el pedido.`),
      p("p-reclamos", "Reclamos", `Lo que puede resolver el mozo solo: reponer un plato que salió mal, invitar una bebida o un postre, priorizar el pedido en cocina.
Lo que resuelve la encargada: descuentos, no cobrar un plato, reclamos por cobros o por el trato de un compañero.
Todo reclamo se anota en el cuaderno de novedades: mesa, qué pasó y cómo se resolvió.
Si la cocina dice que el plato salió bien y el cliente dice que no, gana el cliente: se repone y después se revisa internamente qué pasó.`),
      p("p-caja", "Cierre de caja", `Al final de cada turno la cajera cuenta el efectivo, imprime el cierre Z de la registradora y el resumen del posnet.
Efectivo contado + tarjetas + transferencias tiene que dar igual al total del Z.
Diferencia de hasta $2.000: se anota y se explica. Más de $2.000: se avisa a la encargada antes de irse.
Todo retiro de efectivo (proveedores, cambio) va con un vale firmado.
El sobre con el efectivo se entrega cerrado y con la planilla, nunca suelto.`)
    ],

    documentos: [
      {
        nombre: "carta-con-alergenos.txt",
        contenido: `LA ESQUINA · Carta (actualizada en septiembre)
Referencias: [TACC] contiene gluten · [L] lácteos · [H] huevo · [FS] frutos secos · [*] se cocina en la freidora compartida

ENTRADAS
- Empanadas de carne cortada a cuchillo (unidad) ........ $2.200 [TACC] [H]
- Provoleta con orégano .................................. $7.800 [L]
- Rabas .................................................. $12.500 [TACC] [H] [*]

PRINCIPALES
- Milanesa de ternera con papas fritas ................... $16.900 [TACC] [H] [*]
- Milanesa napolitana con papas fritas ................... $19.500 [TACC] [H] [L] [*]
- Ravioles de ricota con salsa a elección ................ $14.800 [TACC] [H] [L]
- Ñoquis de papa con estofado ............................ $15.200 [TACC] [H]
- Bife de chorizo con papas al horno ..................... $22.000 (sin TACC si se pide sin salsa)
- Pollo al horno con puré ................................ $15.900 [L]
- Ensalada completa (lechuga, tomate, huevo, zanahoria) .. $8.500 [H]

POSTRES
- Flan casero con dulce de leche ......................... $6.200 [L] [H] (sin TACC)
- Budín de pan ........................................... $6.200 [TACC] [L] [H]
- Panqueque con dulce de leche ........................... $6.800 [TACC] [L] [H]
- Helado de nuez (2 bochas) .............................. $5.900 [L] [FS]

MENÚ EJECUTIVO (lunes a viernes, mediodía) ............... $13.500
Plato del día + bebida sin alcohol + postre o café.

IMPORTANTE PARA CELÍACOS
Las papas fritas y todo lo empanado se cocinan en la misma freidora: NO son aptas.
La cocina puede preparar papas al horno en bandeja aparte. Siempre confirmar con Rubén antes de asegurar que un plato es apto.`
      }
    ],

    tareaEjemplo: {
      entender: "¿Cómo funciona el circuito de una comanda, desde que tomo el pedido hasta que el plato llega a la mesa? ¿Por qué se hace así?",
      trabajo: "¿Cómo es un turno de noche? Contame desde que llego hasta que me voy, y por qué existe cada paso.",
      tarea: "Tengo esta situación:\n\nMesa 12, turno mediodía. Un cliente reclama que su milanesa llegó fría. Rubén, de cocina, dice que salió bien y caliente. El cliente está molesto y la mesa de al lado está mirando.\n\n¿Cómo lo resuelvo?",
      revisar: "Revisá mi cierre de caja antes de entregarlo (turno mediodía, sábado):\n\nTotal cierre Z: $912.400\nTarjetas (posnet): $548.000\nTransferencias: $96.300\nEfectivo contado: $263.100\n\nRetiré $6.000 de la caja para pagarle al verdulero, pero no me dio factura.\nDiferencia: me faltan $5.000, supongo que di mal un vuelto. Lo dejo así y el lunes le aviso a Ana."
    },

    escenarios: [
      {
        id: "demora-mesa",
        titulo: "Cliente molesto por la demora",
        resumen: "Una familia espera su comida hace 40 minutos y el padre te llama, enojado.",
        modalidad: "presencial",
        cliente: "Roberto Díaz, 58 años, cliente de La Esquina desde hace años. Vino con su familia a almorzar un domingo.",
        personalidad: "Enojado pero razonable. Si le dan una explicación real y una solución concreta, se calma. Si le dicen \"ya sale\" sin saber, se enoja más y levanta la voz.",
        situacion: "Pidieron hace 40 minutos y todavía no les llegó nada. La mesa de al lado llegó después y ya está comiendo.\nDatos que solo da si le preguntan: son 5 personas; pidieron 2 milanesas napolitanas, 1 ravioles y 2 bifes de chorizo; es el cumpleaños número 80 de su suegra; tienen que irse a las 15 porque viaja.",
        objetivo: "Contener al cliente, averiguar el estado real del pedido antes de prometer, dar un tiempo honesto y ofrecer algo que esté a tu alcance.",
        duracion: 4,
        dificultad: "Media"
      },
      {
        id: "grupo-sin-aviso",
        titulo: "Grupo grande sin reserva",
        resumen: "Un viernes a la noche llegan 14 personas sin reserva y el salón está casi lleno.",
        modalidad: "presencial",
        cliente: "Sofía Benítez, 24 años, organiza el festejo de egresados de su grupo de la facultad.",
        personalidad: "Simpática pero insistente. Está nerviosa porque el grupo la espera en la vereda. Si le prometen algo y después no se cumple, se ofende mucho.",
        situacion: "Llega a las 21:15 y pide una mesa para 14. Asegura que \"alguien llamó el martes\", pero no hay ninguna reserva anotada.\nDatos que solo da si le preguntan: pueden dividirse en dos mesas; tienen un presupuesto de unos veinte mil pesos por persona; pueden esperar hasta media hora; dos personas son vegetarianas.",
        objetivo: "No confirmar sin consultar (regla de grupos grandes), ofrecer alternativas reales con tiempos honestos y mantener un buen trato aunque no haya lugar enseguida.",
        duracion: 4,
        dificultad: "Alta"
      },
      {
        id: "alergia",
        titulo: "Clienta celíaca",
        resumen: "Una clienta te pregunta qué puede comer: es celíaca y le preocupa la contaminación cruzada.",
        modalidad: "presencial",
        cliente: "Martina López, 35 años, primera vez en La Esquina. Vino con una amiga.",
        personalidad: "Amable pero desconfiada: ya la pasó mal en otros restaurantes. Hace preguntas precisas. Si le contestan \"sí, todo bien\" sin averiguar, se pone tensa y pregunta más.",
        situacion: "Pregunta si la milanesa puede ser sin gluten y si las papas fritas son aptas.\nDatos que solo da si le preguntan: es celíaca diagnosticada, estricta; la contaminación cruzada le hace mal; no quiere comer solo una ensalada; le encantan los postres.",
        objetivo: "No asegurar nada sin confirmar con cocina, explicar con claridad el riesgo de la freidora compartida, ofrecer alternativas seguras y dejar registrada la alergia en la comanda.",
        duracion: 4,
        dificultad: "Media"
      }
    ],

    criterios: [
      { nombre: "Escucha y contención", descripcion: "Deja hablar, reconoce el malestar o la preocupación y no se pone a la defensiva.", peso: 3 },
      { nombre: "Averigua antes de prometer", descripcion: "Consulta en cocina, en la comanda o con la encargada antes de dar tiempos o garantías.", peso: 3 },
      { nombre: "Seguridad del cliente", descripcion: "Con alergias o pedidos especiales no improvisa: pregunta, informa riesgos y lo registra.", peso: 3 },
      { nombre: "Soluciones a su alcance", descripcion: "Ofrece soluciones concretas que puede dar y deriva a la encargada lo que no le corresponde.", peso: 2 },
      { nombre: "Claridad y calidez", descripcion: "Habla simple, con tono amable, sin excusas ni culpar a compañeros delante del cliente.", peso: 2 },
      { nombre: "Cierre", descripcion: "Confirma lo acordado y deja claro qué va a pasar y cuándo vuelve a la mesa.", peso: 2 }
    ],

    notasEvaluacion: "Preferimos un \"lo consulto con cocina y vuelvo en dos minutos\" a una respuesta rápida inventada. Con las alergias no hay margen de error."
  };

  // ================================================================ Empresas para la reunión con UTEC
  // Empresas FICTICIAS, armadas a partir del rubro de quienes vienen a la reunión, para que cada uno vea una
  // simulación de su propio mundo. Nombres de empresas y personas inventados.
  // Los 7 criterios son los mismos de Nodo (sustento de RRHH); cambia cuánto pesa cada uno según el negocio.
  const criteriosCon = (pesos, ajustes = {}) => nodo.criterios.map((c, i) => ({
    ...JSON.parse(JSON.stringify(c)), peso: pesos[i], ...(ajustes[c.nombre] ? { descripcion: ajustes[c.nombre] } : {})
  }));

  // ---------------------------------------------------------------- Puerta a Puerta (importación B2B)
  const puerta = {
    version: 2,
    empresa: "Puerta a Puerta Importaciones",
    rubro: "Comercio",
    responsable: { nombre: "Martín Ledesma", rol: "Gerente general" },

    contextos: [
      g("proposito", `Puerta a Puerta trae de Estados Unidos insumos, herramientas y equipamiento para empresas y PyMEs argentinas que no los consiguen acá o los consiguen mucho más caros.
El cliente elige el producto y nosotros nos ocupamos de todo lo demás: compra, flete, aduana, impuestos y entrega en su puerta.
Nuestra promesa es un precio final cerrado y sin sorpresas, con Factura A. Si un cliente se entera de un costo extra al final, perdimos su confianza.
Somos 18 personas en Bella Vista (Provincia de Buenos Aires) y un depósito propio en Miami.`),
      g("oferta", `Productos: herramientas eléctricas y de taller, repuestos de maquinaria, equipamiento para laboratorios y consultorios, insumos de impresión y electrónica.
Precio final "puerta a puerta": valor del producto + flete internacional + nacionalización e impuestos de aduana + envío a destino en todo el país.
Plazos habituales: courier, de 10 a 15 días hábiles; carga general, de 25 a 40 días hábiles.
Clientes: talleres metalúrgicos, estudios de arquitectura, consultorios odontológicos, laboratorios, pymes industriales del conurbano y del interior.
Lo que más valoran: que el precio no cambie, saber en qué estado está su pedido y que alguien les conteste rápido.`),
      g("trabajo", `Cada cliente tiene un ejecutivo de cuentas que lo acompaña de la cotización a la entrega.
Circuito: consulta → cotización (en 24 h hábiles) → seña del 50% → compra en EE.UU. → envío al depósito de Miami → embarque → aduana → entrega → saldo.
Operaciones (Paula y su equipo) maneja embarques y aduana con un despachante externo. Compras en Miami confirma stock y medidas.
Todo queda en el CRM: cada llamada, cada promesa y cada cambio de estado del pedido.
Weekly de pedidos los lunes a las 9; los pedidos en riesgo se revisan con gerencia.`),
      g("problemas", `1. Escuchar al cliente completo y anotar qué necesita y para cuándo de verdad.
2. Revisar el estado real del pedido en el CRM y con Operaciones antes de dar una respuesta.
3. Ser honesto con los plazos: dar un rango, nunca una fecha exacta que no depende de nosotros.
4. Ofrecer alternativas reales (otro modelo en stock, otra vía de envío, entrega parcial).
5. Si cambia el precio o el plazo, avisar antes de que el cliente lo descubra solo.
6. Dejar registrado en el CRM lo que se habló y el próximo contacto.`),
      g("clientes", `Tuteamos a los clientes de siempre, pero con respeto profesional.
Respondemos en el día, aunque sea para decir "lo estoy averiguando, te escribo mañana a las 11".
Nunca le echamos la culpa a la aduana, al courier ni a un compañero: el pedido es nuestro.
Explicamos los costos sin palabras de comercio exterior: si usamos una, la traducimos.
Si no sabemos algo, lo decimos y nos comprometemos a una hora de respuesta.`),
      g("calidad", `- Toda cotización se entrega en 24 h hábiles, con precio final y plazo en rango.
- El precio cotizado no cambia, salvo que el cliente cambie el pedido.
- El cliente recibe una actualización de estado al menos una vez por semana.
- Cada pedido tiene en el CRM: modelo exacto, voltaje, cantidad, CUIT y dirección de entrega.
- Cero facturas con error de datos fiscales.`),
      g("restricciones", `No prometer fechas exactas de entrega: siempre en rango y aclarando de qué depende.
Descuentos, cambios de precio o devolución de seña: solo gerencia.
No se aceptan productos que requieren permisos especiales (medicamentos, armas, alimentos) sin consultar a Operaciones.
Un ejecutivo junior no confirma compras de más de USD 5.000 sin que las revise su supervisor.`),
      p("p-aduana", "Pedidos demorados en aduana", `Las demoras más comunes: falta un certificado (por ejemplo, de seguridad eléctrica), la factura del proveedor no coincide con el producto o el producto cae en un control.
Lo primero es preguntarle a Operaciones qué falta exactamente y cuánto tarda conseguirlo.
Al cliente se le explica qué pasó, qué estamos haciendo y cuándo le volvemos a escribir. Nunca "está en aduana, no sabemos".
Si la demora genera costos de almacenaje, los absorbemos nosotros cuando el error fue nuestro: lo confirma gerencia.`)
    ],

    tareaEjemplo: {
      entender: "¿Qué incluye exactamente nuestro precio \"puerta a puerta\" y por qué lo cotizamos así?",
      trabajo: "Contame el circuito de un pedido, desde que entra la consulta hasta que cobramos el saldo. ¿Quién hace cada cosa?",
      tarea: "Un cliente pide traer 3 amoladoras DeWalt y un compresor. No dijo voltaje ni si necesita Factura A. ¿Qué le pregunto antes de cotizar?",
      revisar: "Revisá este mensaje antes de mandárselo a un cliente:\n\n\"Hola Raúl, tu pedido está en aduana. No sabemos cuándo sale, depende de ellos. Apenas sepamos algo te aviso. Saludos.\""
    },

    escenarios: [
      {
        id: "pap-cotizacion",
        titulo: "Cotización con datos que faltan",
        resumen: "El dueño de un taller metalúrgico te llama para que le traigas un equipo que vio en internet. Antes de cotizar, tenés que entender qué necesita de verdad.",
        modalidad: "llamada",
        cliente: "Raúl Ferreyra, dueño de un taller metalúrgico en Pilar. Cliente nuevo, lo recomendó otro taller.",
        personalidad: "Amable y conversador, pero no sabe de importación y da por obvias cosas que no lo son. Si le preguntan bien, colabora; si lo llenan de términos técnicos, se pierde y se pone desconfiado.",
        situacion: "Quiere \"un compresor como el que vio en un video\" y tres amoladoras. Pide el precio \"más o menos\" para hoy.\nDatos que solo da si le preguntan: no sabe el modelo exacto del compresor, pero tiene el link; el taller tiene corriente trifásica de 380 V; necesita Factura A a nombre de su empresa; le urge el compresor, las amoladoras no; su presupuesto tope es de unos cuatro millones de pesos.",
        objetivo: "Hacer las preguntas necesarias antes de cotizar (modelo, voltaje, urgencia, facturación) y explicar en simple qué incluye el precio final y el plazo en rango.",
        cierre: "Se resuelve cuando el candidato junta los datos clave y le dice qué le va a mandar y cuándo. Si le tira un precio sin preguntar el voltaje o el modelo, Raúl lo acepta contento, pero se despide diciendo \"entonces queda en ese precio, ¿no?\".",
        duracion: 5,
        dificultad: "Baja",
        glosario: [
          { termino: "Cotización", significa: "el presupuesto con precio final y plazo que se le pasa al cliente." },
          { termino: "Factura A", significa: "la factura que necesita una empresa para descontar el IVA." },
          { termino: "Voltaje", significa: "el tipo de corriente que usa el equipo; en EE.UU. es distinto que acá." }
        ]
      },
      {
        id: "pap-urgente",
        titulo: "Un repuesto \"para el lunes\"",
        resumen: "Una clínica odontológica necesita un repuesto para un equipo parado y te pide que llegue en cinco días. El plazo real es mucho más largo.",
        modalidad: "llamada",
        cliente: "Carolina Ruiz, administradora de una clínica odontológica en San Miguel. Ya compró dos veces con Puerta a Puerta.",
        personalidad: "Apurada y práctica. Tiene a los odontólogos encima. Si le dicen la verdad con alternativas, se ordena y decide rápido; si le dan vueltas o le prometen algo que suena imposible, se pone tensa y pide hablar con alguien más.",
        situacion: "El autoclave (el equipo que esteriliza el instrumental) se rompió y el repuesto solo se consigue en EE.UU. Pide que llegue el lunes.\nDatos que solo da si le preguntan: tiene un autoclave viejo que funciona a media máquina; pueden sacar la mitad de los turnos; el técnico le dijo que el repuesto exacto es el código 4021-B; puede pagar un envío más caro si llega antes.",
        objetivo: "No prometer un plazo imposible, dar un rango honesto según la vía de envío, ofrecer la opción más rápida con su costo y acordar cuándo confirma.",
        cierre: "Se resuelve cuando Carolina sabe qué opción tiene, cuánto tarda en rango y cuándo le confirman stock. Si el candidato le promete el lunes, ella dice \"perfecto, lo anoto\" y corta conforme (es el error que se evalúa).",
        duracion: 5,
        dificultad: "Media",
        glosario: [
          { termino: "Courier", significa: "envío rápido puerta a puerta para paquetes chicos; es más caro." },
          { termino: "Días hábiles", significa: "días de semana, sin contar sábados, domingos ni feriados." },
          { termino: "Stock", significa: "si el proveedor tiene el producto disponible para mandar ya." }
        ]
      },
      {
        id: "pap-aduana",
        titulo: "Pedido trabado en aduana",
        resumen: "El pedido de un cliente quedó demorado en aduana porque falta un certificado. Te toca avisarle, y él tiene una obra esperando ese equipo.",
        modalidad: "llamada",
        cliente: "Hernán Gallo, socio de un estudio de arquitectura que hace obras en Tigre. Pagó la seña hace 30 días.",
        personalidad: "Molesto desde el principio: ya le dijeron dos veces que \"estaba por salir\". Si le explican qué pasó de verdad y le dan un plan con fecha de contacto, baja el tono. Si le dicen \"es la aduana\" o lo culpan a él, se enoja y pide la devolución de la seña.",
        situacion: "Las tres hidrolavadoras industriales que pidió están retenidas porque falta el certificado de seguridad eléctrica. Operaciones dice que conseguirlo lleva entre 7 y 10 días hábiles.\nDatos que solo da si le preguntan: la obra arranca la semana que viene; podría arreglarse con una sola máquina al principio; el año pasado le pasó algo parecido con otro importador y nunca le devolvieron la plata; si le cobran almacenaje, no lo va a pagar.",
        objetivo: "Comunicar la mala noticia sin culpar a nadie, explicar qué falta y qué se está haciendo, no prometer una fecha que no depende de nosotros y acordar el próximo contacto. Derivar a gerencia lo de la seña o el almacenaje.",
        cierre: "Se resuelve cuando Hernán entiende qué pasó, qué se hace y cuándo lo vuelven a llamar. Si el candidato promete que sale \"esta semana\" o acepta devolver la seña por su cuenta, Hernán pide que se lo manden por escrito y corta frío.",
        duracion: 5,
        dificultad: "Alta",
        glosario: [
          { termino: "Aduana", significa: "el control del Estado sobre lo que entra al país." },
          { termino: "Certificado de seguridad eléctrica", significa: "papel que prueba que un equipo eléctrico es seguro para usar acá." },
          { termino: "Seña", significa: "la parte del precio que el cliente pagó por adelantado." },
          { termino: "Almacenaje", significa: "lo que cobra el depósito de la aduana por cada día que la mercadería queda ahí." }
        ]
      },
      {
        id: "pap-weekly",
        titulo: "Weekly de pedidos: uno está en riesgo",
        resumen: "Es lunes, weekly de pedidos por videollamada. Tu supervisora repasa tus pedidos y uno está en riesgo, pero en el CRM no lo actualizaste.",
        modalidad: "llamada",
        cliente: "Laura Méndez, supervisora comercial de Puerta a Puerta. Tu jefa directa desde que entraste hace un mes.",
        personalidad: "Ordenada, directa y justa. Le molesta enterarse tarde de los problemas, no que existan. Si le contás la situación con datos y le pedís ayuda concreta, te apoya; si minimizás o das vueltas, repregunta seco y se pone más exigente.",
        situacion: "Laura repasa tus seis pedidos abiertos. Cuando llega al de las hidrolavadoras de un estudio de arquitectura, ve en el CRM \"en tránsito\", pero vos sabés desde el viernes que está trabado en aduana.\nDatos que solo da si le preguntan: gerencia revisa los pedidos en riesgo los martes; Operaciones puede averiguar hoy cuánto tarda el certificado; el cliente ya reclamó dos veces por WhatsApp a la cuenta general; ella prefiere un aviso con \"todavía no sé\" antes que el silencio.",
        objetivo: "Contar el problema con honestidad y datos, reconocer que no actualizó el CRM, pedir ayuda concreta y acordar los próximos pasos con fecha.",
        cierre: "Se resuelve cuando Laura sabe el estado real, quién habla con el cliente y cuándo, y qué se lleva a gerencia. Si el candidato dice que está todo bien o culpa a Operaciones, Laura cierra la weekly con un \"después lo hablamos vos y yo\".",
        duracion: 5,
        dificultad: "Media",
        glosario: [
          { termino: "Weekly", significa: "reunión semanal del equipo para repasar el estado de los pedidos." },
          { termino: "CRM", significa: "el sistema donde se registra cada cliente, cada llamada y el estado de cada pedido." },
          { termino: "Pedido en riesgo", significa: "un pedido que puede no llegar en el plazo que se le dijo al cliente." }
        ]
      }
    ],

    criterios: criteriosCon([15, 15, 15, 20, 10, 15, 10]),
    notasEvaluacion: "Valoramos la honestidad con los plazos y los costos por encima de cerrar rápido. Preferimos un \"lo confirmo con Operaciones y te escribo a las 11\" antes que una fecha inventada. Ningún cliente se tiene que enterar de un costo extra al final."
  };

  // ---------------------------------------------------------------- Andamio (consultora de proyectos IT)
  const andamio = {
    version: 2,
    empresa: "Andamio Consultora",
    rubro: "Servicios de tecnología",
    responsable: { nombre: "Lucía Ferraro", rol: "Cofundadora y product manager" },

    contextos: [
      g("proposito", `Andamio es una consultora de gestión de proyectos tecnológicos. Ayudamos a organismos públicos y empresas a convertir una necesidad en un sistema que funciona, en tiempo y con un alcance claro.
Nacimos hace tres años con una premisa: el trato, las formas y el profesionalismo no se negocian, y nadie en el equipo es un número.
Creemos que sin juniors no hay seniors: formamos gente y la acompañamos.
Somos 35 personas, con oficina en Palermo y trabajo híbrido.`),
      g("oferta", `Servicios: gestión de proyectos (project managers y PMO), desarrollo de software a medida (backend .NET, frontend web), tableros de datos (Power BI) y consultoría de procesos.
Clientes: ministerios y secretarías provinciales, municipios del conurbano, y empresas medianas que digitalizan trámites o áreas internas.
Proyectos típicos: sistema de expedientes digitales, turnos para trámites, tablero de indicadores para un ministro, migración de un sistema viejo.
Lo que más valoran los clientes: que les digan la verdad sobre el avance, informes ejecutivos claros y que el sistema salga andando.`),
      g("trabajo", `Trabajamos con Scrum: sprints de dos semanas, daily de 15 minutos a las 9:30, review con el cliente al final de cada sprint y retrospectiva interna.
Cada proyecto tiene un project manager, un tech lead y el equipo de desarrollo. El PM es el que habla con el cliente.
Herramientas: Jira para tareas, Notion para documentación, Teams con los clientes públicos y Slack interno.
Cada viernes el PM manda un informe ejecutivo de una página: avance, riesgos y próximos pasos.
Algunos proyectos piden viajar a provincia para relevamientos y capacitaciones.`),
      g("problemas", `1. Entender bien el problema antes de proponer: qué pasa, a quién afecta y qué se intentó.
2. Separar lo urgente de lo importante con datos (horas disponibles, impacto, dependencias).
3. Hablarlo con el tech lead antes de comprometer algo con el cliente.
4. Proponer opciones con su costo: qué entra, qué sale y qué se mueve.
5. Dejar por escrito lo acordado (minuta o Jira) y con quién se acordó.
6. En la retro, revisar qué hacer distinto la próxima.`),
      g("clientes", `Con organismos públicos, trato formal y de usted hasta que el cliente proponga otra cosa.
Las malas noticias se dan temprano y con un plan: un atraso que el cliente descubre solo es mucho peor que uno avisado.
Nunca se habla mal del equipo ni de otro proveedor delante del cliente.
Se traduce lo técnico: el cliente no tiene por qué saber qué es un endpoint.
Toda reunión con el cliente termina con próximos pasos, responsables y fechas.`),
      g("calidad", `- Cada historia de usuario tiene criterios de aceptación antes de entrar al sprint.
- Ningún cambio de alcance entra al sprint sin pasar por el PM y el tech lead.
- El informe ejecutivo sale todos los viernes antes de las 17.
- Los riesgos se informan apenas aparecen, con su impacto en días.
- Todo lo que se entrega pasa por revisión de código y pruebas.`),
      g("restricciones", `Un PM junior no compromete fechas de entrega ni cambios de alcance sin el tech lead.
Presupuesto, horas extra facturables y contratos: solo dirección.
No se comparten datos de un cliente con otro, ni se usan datos reales de ciudadanos en ambientes de prueba.
Con organismos públicos, todo acuerdo importante queda por escrito (mail o minuta firmada).`)
    ],

    tareaEjemplo: {
      entender: "¿Para qué sirve el informe ejecutivo de los viernes y qué tiene que tener sí o sí?",
      trabajo: "Contame cómo es un sprint en Andamio, desde la planificación hasta la retro. ¿Qué hace el PM en cada ceremonia?",
      tarea: "El cliente del Municipio me pide por mail \"un tablero con todo lo de turnos\" para la semana que viene. ¿Cómo encaro el relevamiento?",
      revisar: "Revisá esta minuta antes de mandarla:\n\n\"Reunión con Producción. Se habló del módulo de expedientes. Hay algunos atrasos. Se va a ver. Próxima reunión a definir.\""
    },

    escenarios: [
      {
        id: "and-relevamiento",
        titulo: "Un pedido ambiguo: \"queremos un tablero\"",
        resumen: "La referente de un municipio cliente te llama para pedir \"un tablero con todo lo de turnos\". Tenés que entender qué necesita antes de comprometer nada.",
        modalidad: "llamada",
        cliente: "Silvina Acosta, coordinadora de Atención Ciudadana del Municipio de Villa Arroyo (cliente de Andamio desde hace un año).",
        personalidad: "Colaboradora y con buena onda, pero habla en general y mezcla lo que quiere con lo que vio en otro municipio. Si le preguntan bien, ordena la idea; si le proponen soluciones antes de entender, se entusiasma con cualquier cosa.",
        situacion: "Quiere \"un tablero con todo lo de turnos\" para mostrarle al intendente.\nDatos que solo da si le preguntan: lo quiere ver el intendente una vez por semana; lo que más le preocupa es cuánta gente falta a los turnos; los datos están en el sistema de turnos que hizo Andamio y en una planilla de Excel aparte; la reunión con el intendente es en tres semanas.",
        objetivo: "Hacer preguntas para entender para qué es, quién lo usa y con qué datos, y cerrar con un próximo paso concreto sin prometer el tablero completo.",
        cierre: "Se resuelve cuando quedan claros el objetivo, el usuario y los datos, y se acuerda un próximo paso (por ejemplo, una reunión de relevamiento con fecha). Si el candidato promete \"todo\" para la semana que viene, Silvina se va contenta y eso es justamente lo que se evalúa.",
        duracion: 5,
        dificultad: "Baja",
        glosario: [
          { termino: "Tablero", significa: "una pantalla con gráficos e indicadores para ver cómo va algo." },
          { termino: "Relevamiento", significa: "reunión para entender qué necesita el cliente antes de diseñar." },
          { termino: "Indicador", significa: "un número que muestra cómo va algo (por ejemplo, el % de ausentismo)." }
        ]
      },
      {
        id: "and-alcance",
        titulo: "\"Lo necesitamos para el lunes, viene el ministro\"",
        resumen: "A mitad de sprint, el director del ministerio cliente te pide sumar una función nueva para una visita del ministro. El equipo ya está al tope.",
        modalidad: "llamada",
        cliente: "Gabriel Sosa, director de Modernización del Ministerio de Producción de la provincia (cliente).",
        personalidad: "Ejecutivo, apurado y con presión política. Cree que es \"un cambio chiquito\". Respeta a quien le habla con datos y opciones; si le dicen solo que no, sube el tono y menciona que \"hay otras consultoras\".",
        situacion: "Pide que el sistema de expedientes permita descargar un reporte en PDF para mostrarle al ministro el lunes.\nDatos que solo da si le preguntan: al ministro le alcanza con ver tres números (expedientes ingresados, resueltos y demorados); la visita es el lunes a las 10; podría servir un reporte armado a mano por única vez; el pedido formal todavía no está por escrito.",
        objetivo: "Entender qué necesita de verdad el ministro, no comprometer el cambio sin consultar al tech lead y proponer una alternativa realista para el lunes, dejando por escrito lo acordado.",
        cierre: "Se resuelve cuando Gabriel tiene una propuesta concreta para el lunes y sabe cuándo le confirman. Si el candidato dice que sí a todo, Gabriel corta conforme pidiendo \"mandámelo por mail\". Si dice que no sin alternativa, insiste y la llamada termina tensa.",
        duracion: 5,
        dificultad: "Media",
        glosario: [
          { termino: "Sprint", significa: "período de dos semanas con tareas ya comprometidas." },
          { termino: "Alcance", significa: "qué incluye y qué no incluye lo que se entrega." },
          { termino: "Tech lead", significa: "el responsable técnico del equipo de desarrollo." }
        ]
      },
      {
        id: "and-atraso",
        titulo: "Avisar un atraso de dos semanas",
        resumen: "En la weekly con el cliente tenés que comunicar que el módulo de expedientes se atrasa dos semanas. El cliente no lo sabe todavía.",
        modalidad: "llamada",
        cliente: "Mariela Quiroga, subsecretaria de Gestión Pública de la provincia. Responsable del proyecto del lado del cliente.",
        personalidad: "Seria y exigente; ya le prometió la fecha al ministro. Se enoja si siente que le ocultaron algo o si le echan la culpa a su equipo. Se calma con un plan claro, con fechas de control y con alguien que se haga cargo.",
        situacion: "El módulo de expedientes iba a estar en producción el día 15 y ahora es el 29.\nDatos que solo da si le preguntan (o que aparecen si el candidato explica bien): el equipo del ministerio tardó 8 días en dar los accesos al servidor; una desarrolladora del proyecto se fue de la consultora; se puede entregar el día 15 una parte (la carga de expedientes) y el resto el 29; Mariela tiene reunión con el ministro el jueves.",
        objetivo: "Dar la mala noticia temprano y sin vueltas, explicar las causas sin culpar al cliente, proponer un plan (entrega parcial, fechas de control) y acordar cómo se informa al ministro.",
        cierre: "Se resuelve cuando hay una nueva fecha en rango, una entrega parcial acordada y un próximo contacto antes del jueves. Si el candidato culpa al ministerio por los accesos o minimiza el atraso, Mariela pide hablar con dirección y la llamada termina mal.",
        duracion: 5,
        dificultad: "Alta",
        glosario: [
          { termino: "Weekly", significa: "reunión semanal de seguimiento con el cliente." },
          { termino: "Producción", significa: "el sistema real, el que usan los usuarios todos los días." },
          { termino: "Entrega parcial", significa: "entregar una parte que ya funciona mientras se termina el resto." }
        ]
      },
      {
        id: "and-daily",
        titulo: "Daily: un bloqueo que nadie levantó",
        resumen: "Estás en la daily del equipo por Meet. Hace tres días que el cliente no manda los datos de prueba y el equipo está trabado. Te toca plantearlo al tech lead.",
        modalidad: "llamada",
        cliente: "Julián Ortega, tech lead del proyecto de expedientes en Andamio. Muy bueno técnicamente y con poca paciencia para las dailies largas.",
        personalidad: "Rápido y cortante en la daily: quiere qué hiciste, qué vas a hacer y qué te traba, en un minuto. No es mala onda: si le planteás el bloqueo concreto y una propuesta, se suma y ayuda; si das vueltas o contás todo el detalle, te corta con un \"eso lo hablamos después\".",
        situacion: "Hace tres días que el ministerio no manda los datos de prueba anonimizados y dos desarrolladores no pueden probar la carga de expedientes. Vos pediste los datos por mail dos veces y no contestaron.\nDatos que solo da si le preguntan: Julián tiene el teléfono del referente técnico del ministerio; se podrían armar datos ficticios en medio día para no frenar; el sprint termina el viernes; la review con el cliente es el lunes.",
        objetivo: "Plantear el bloqueo en forma breve y clara, pedir ayuda concreta, proponer una alternativa para no frenar al equipo y acordar quién hace qué hoy.",
        cierre: "Se resuelve cuando queda claro quién contacta al ministerio, qué se hace mientras tanto y cuándo se revisa. Si el candidato no menciona el bloqueo o lo cuenta sin proponer nada, Julián pasa al siguiente y el problema queda sin dueño.",
        duracion: 5,
        dificultad: "Media",
        glosario: [
          { termino: "Daily", significa: "reunión diaria de 15 minutos: qué hice, qué voy a hacer y qué me traba." },
          { termino: "Bloqueo", significa: "algo que impide avanzar y que no depende de uno." },
          { termino: "Datos de prueba", significa: "datos para probar el sistema sin usar información real de personas." }
        ]
      }
    ],

    criterios: criteriosCon([15, 10, 15, 20, 15, 15, 10]),
    notasEvaluacion: "Valoramos que la mala noticia se dé temprano y con un plan, y que no se comprometa alcance ni fechas sin consultar. Un buen PM pregunta antes de proponer y deja todo por escrito. El buen trato no se negocia, ni siquiera bajo presión."
  };

  // ---------------------------------------------------------------- Mostrador (gestión comercial y listas de precios)
  const mostrador = {
    version: 2,
    empresa: "Mostrador Gestión",
    rubro: "Software de gestión comercial",
    responsable: { nombre: "Diego Ferreyra", rol: "Socio gerente" },

    contextos: [
      g("proposito", `Mostrador Gestión hace un sistema de gestión para comercios con miles de artículos: ferreterías, librerías, cotillones y casas de repuestos.
Hace más de 15 años que ayudamos al comerciante a tener los precios al día, facturar sin trabas y saber qué vende.
Nuestro diferencial es ListaYa: el comerciante nos reenvía la lista de precios que le manda su distribuidor y nosotros la dejamos lista para que el sistema la actualice sola.
Con inflación y listas que cambian cada semana, un precio viejo es plata que el comerciante pierde.`),
      g("oferta", `Mostrador Gestión (sistema de escritorio con base de datos SQL Server): artículos, listas de precios, facturación electrónica y con controlador fiscal, cuentas corrientes, caja y estadísticas.
ListaYa (servicio mensual): el cliente reenvía la lista del distribuidor a actualizaciones@mostradorgestion.com.ar; el equipo la normaliza (columnas, códigos, IVA) y el sistema la descarga y actualiza los precios.
Soporte de software por teléfono, WhatsApp y acceso remoto; soporte de hardware (impresoras fiscales, lectores) en zona norte del conurbano.
Clientes: unos 400 comercios, la mayoría de 1 a 10 empleados, en todo el país.
Lo que más valoran: que el sistema no se caiga en horario de atención y que los precios estén bien.`),
      g("trabajo", `Soporte atiende de lunes a viernes de 8 a 19 y los sábados de 9 a 13 (los comercios abren los sábados).
Cada consulta se carga como ticket con: comercio, contacto, qué pasa, desde cuándo y qué se hizo.
Las listas de ListaYa se procesan en el día si llegan antes de las 15; si no, al día siguiente a la mañana.
Antes de publicar una lista normalizada, se controla una muestra de 20 artículos contra la lista original.
Los problemas de facturación electrónica los ve el técnico de turno; el soporte junior hace el primer diagnóstico.`),
      g("problemas", `1. Escuchar qué ve el comerciante en la pantalla, con sus palabras.
2. Preguntar desde cuándo pasa, qué cambió y si le pasa en una o en todas las computadoras.
3. Pedir permiso para conectarse por acceso remoto antes de tocar nada.
4. Si hay ventas trabadas, buscar primero una forma de que pueda seguir vendiendo.
5. Si no lo resolvés en 15 minutos, pasarlo al técnico de turno con el ticket completo.
6. Volver a llamar al cliente para confirmar que quedó andando.`),
      g("clientes", `El comerciante suele estar atendiendo gente: hablale corto, claro y sin tecnicismos.
Nunca decir "eso es un problema de tu computadora" sin haberlo revisado.
Si el error fue nuestro, se reconoce y se arregla primero; las explicaciones vienen después.
Damos una hora concreta de respuesta y la cumplimos.
Con los clientes de muchos años, mucho respeto: varios nos conocen desde que empezamos.`),
      g("calidad", `- Toda llamada de soporte queda en un ticket completo.
- Un comercio sin poder facturar se atiende primero que cualquier otra consulta.
- Las listas de ListaYa se publican solo después del control de muestra.
- El cliente recibe un aviso cuando su lista ya está actualizada.
- Cero accesos remotos sin permiso del cliente.`),
      g("restricciones", `Un soporte junior no borra datos ni modifica la base de datos de un cliente.
Bonificaciones del abono o compensaciones: solo los socios.
No se toca la configuración fiscal (punto de venta, certificados) sin el técnico de turno.
No se les dice a los clientes qué precios pone la competencia ni se comparten listas de un comercio con otro.`)
    ],

    tareaEjemplo: {
      entender: "¿Cómo funciona ListaYa, desde que el comerciante reenvía la lista hasta que ve los precios nuevos?",
      trabajo: "¿Cómo es un sábado de soporte? ¿Qué priorizo si entran tres llamadas a la vez?",
      tarea: "Una ferretería dice que \"el sistema anda lento\" desde ayer. ¿Qué le pregunto primero?",
      revisar: "Revisá este ticket antes de pasárselo al técnico:\n\n\"Llamó un cliente, no puede facturar. Le dije que reinicie.\""
    },

    escenarios: [
      {
        id: "mos-lista",
        titulo: "\"Mandé la lista y los precios no cambiaron\"",
        resumen: "La dueña de una librería mandó la lista nueva de su distribuidor hace dos días y sigue viendo los precios viejos. Tenés que entender qué pasó.",
        modalidad: "llamada",
        cliente: "Norma Benítez, dueña de una librería escolar en José C. Paz. Clienta de ListaYa hace cuatro años.",
        personalidad: "Amable y paciente, pero no es de la computación y describe todo a su manera. Si le preguntan con calma, colabora; si le hablan rápido o en difícil, se confunde y dice que sí a todo.",
        situacion: "Mandó la lista del distribuidor de útiles el martes y hoy, jueves, ve los precios viejos.\nDatos que solo da si le preguntan: la mandó desde el mail personal de su hija, no desde el de la librería; el archivo era una foto de la lista en papel; los precios que no cambiaron son solo los de ese distribuidor; la semana que viene empiezan las compras de útiles para las vacaciones de invierno.",
        objetivo: "Hacer preguntas simples para encontrar la causa, explicar sin tecnicismos qué hay que hacer y acordar cuándo queda actualizado.",
        cierre: "Se resuelve cuando Norma sabe qué pasó, qué tiene que hacer (o qué hace Mostrador) y cuándo le avisan. Si el candidato no pregunta desde dónde la mandó, Norma se despide sin resolver y dice \"bueno, la vuelvo a mandar igual\".",
        duracion: 5,
        dificultad: "Baja",
        glosario: [
          { termino: "Lista de precios", significa: "el archivo que manda el distribuidor con los precios nuevos de cada artículo." },
          { termino: "Normalizar", significa: "acomodar la lista para que el sistema la entienda (columnas, códigos, IVA)." }
        ]
      },
      {
        id: "mos-factura",
        titulo: "Sábado a la mañana: no puede facturar",
        resumen: "Un sábado a las 11, una ferretería con el mostrador lleno no puede emitir facturas. El dueño te llama apurado.",
        modalidad: "llamada",
        cliente: "Jorge Romero, dueño de una ferretería grande en San Miguel, con tres empleados en el mostrador.",
        personalidad: "Apurado y nervioso: tiene gente esperando. Habla rápido y corta. Si le dan una salida concreta para seguir vendiendo y una hora de respuesta, se calma; si le preguntan cosas que no entiende o le dicen \"esperá\", se impacienta.",
        situacion: "Desde las 10:30 el sistema le dice \"error al obtener CAE\" cada vez que quiere facturar.\nDatos que solo da si le preguntan: le pasa en las tres computadoras; ayer facturó sin problemas; el contador le dijo hace un mes que \"había que renovar algo\" y no le dio importancia; puede anotar las ventas a mano y facturarlas después si alguien le dice que está bien.",
        objetivo: "Hacer un diagnóstico rápido con preguntas simples, darle una forma de seguir vendiendo dentro de lo permitido, derivar al técnico de turno con el caso completo y comprometer una hora de llamado.",
        cierre: "Se resuelve cuando Jorge sabe qué hacer mientras tanto y cuándo lo llama el técnico. Si el candidato intenta tocar la configuración fiscal por su cuenta o le dice \"no sé, esperá\", Jorge corta diciendo que va a llamar a su contador.",
        duracion: 5,
        dificultad: "Media",
        glosario: [
          { termino: "Factura electrónica", significa: "la factura que se autoriza por internet con el organismo de recaudación." },
          { termino: "CAE", significa: "el código que autoriza cada factura electrónica; sin él, la factura no vale." },
          { termino: "Certificado digital", significa: "la credencial que vence cada tanto y permite facturar electrónicamente." }
        ]
      },
      {
        id: "mos-precios-mal",
        titulo: "Vendió todo el día con precios mal",
        resumen: "Una casa de repuestos vendió todo el día con precios 21% más bajos por un error en la lista que normalizó Mostrador. El dueño está furioso.",
        modalidad: "llamada",
        cliente: "Claudio Medina, dueño de una casa de repuestos para autos en Moreno. Cliente desde hace nueve años.",
        personalidad: "Furioso y dolido: siente que perdió plata por culpa de otro. Levanta la voz al principio. Si lo escuchan sin interrumpir, le reconocen el error y le proponen algo concreto, va bajando; si le explican cómo funciona la lista o le hablan de \"un error del sistema\", amenaza con dar de baja el servicio.",
        situacion: "La lista de su distribuidor principal traía los precios con IVA incluido y en la normalización se tomaron como sin IVA: todos los artículos de esa marca quedaron 21% más baratos. Vendió así todo el día.\nDatos que solo da si le preguntan: fueron unas 60 ventas de esa marca; tiene la lista original en papel; tres ventas fueron a un taller amigo que le puede devolver la diferencia; es el primer error en nueve años; quiere que se lo arreglen antes de abrir mañana.",
        objetivo: "Contener sin justificarse, reconocer el error de Mostrador, explicar qué se va a corregir y cuándo, no prometer compensaciones que no le corresponden (las deciden los socios) y acordar un próximo contacto.",
        cierre: "Se resuelve cuando Claudio sabe que la lista queda corregida antes de que abra, quién lo llama por la compensación y cuándo. Si el candidato culpa al distribuidor o promete devolverle la plata por su cuenta, Claudio pide hablar con Diego y corta.",
        duracion: 5,
        dificultad: "Alta",
        glosario: [
          { termino: "IVA incluido", significa: "el precio ya tiene sumado el impuesto; si se le vuelve a sumar o se lo toma mal, el precio queda mal." },
          { termino: "Compensación", significa: "algo que se le da al cliente para reparar un daño (por ejemplo, un mes sin cargo)." }
        ]
      },
      {
        id: "mos-escalar",
        titulo: "Pasarle un caso al técnico de turno",
        resumen: "Una ferretería no puede facturar y no lo pudiste resolver. Tenés que pasarle el caso al técnico de turno, que está tapado de trabajo.",
        modalidad: "llamada",
        cliente: "Sergio Paz, técnico senior de Mostrador Gestión, de turno este sábado. Lleva doce años en la empresa.",
        personalidad: "Ocupado y medio gruñón, pero generoso con quien llega preparado. Hace preguntas precisas, una atrás de otra. Si el caso viene completo, lo toma y te explica; si le llega a medias (\"no factura, no sé qué tiene\"), se fastidia y te manda a averiguar.",
        situacion: "Le pasás el caso de una ferretería que desde las 10:30 recibe \"error al obtener CAE\" en las tres computadoras.\nDatos que solo da si le preguntan (o que le tenés que contar vos): lo más probable para él es que se venció el certificado digital; necesita saber si el error es en todas las máquinas y desde qué hora; necesita el teléfono del contador del cliente; él puede llamar al cliente en 30 minutos, no antes.",
        objetivo: "Escalar el caso de forma clara y completa (qué pasa, desde cuándo, qué se probó, a quién afecta), aceptar las preguntas sin ponerse a la defensiva y acordar quién le avisa al cliente y a qué hora.",
        cierre: "Se resuelve cuando Sergio toma el caso con lo que necesita y queda claro quién llama al cliente y cuándo. Si el candidato no sabe qué se probó o desde cuándo pasa, Sergio le pide que vuelva a llamar al cliente y que después le pase el caso.",
        duracion: 5,
        dificultad: "Baja",
        glosario: [
          { termino: "Escalar", significa: "pasarle un caso a alguien con más experiencia cuando uno no lo puede resolver." },
          { termino: "Técnico de turno", significa: "el técnico senior que atiende los casos complicados ese día." },
          { termino: "CAE", significa: "el código que autoriza cada factura electrónica." }
        ]
      }
    ],

    criterios: criteriosCon([15, 15, 10, 20, 10, 20, 10]),
    notasEvaluacion: "El comerciante está atendiendo gente: valoramos preguntas cortas y precisas, y una salida para que pueda seguir vendiendo. Si el error fue nuestro, se reconoce primero. Un junior no toca la configuración fiscal ni promete compensaciones."
  };

  // ---------------------------------------------------------------- Corral Data (software para feedlots)
  // El contexto principal para la reunión con UTEC: más completo que los demás ejemplos.
  const corral = {
    version: 2,
    empresa: "Corral Data",
    rubro: "Software para el agro",
    responsable: { nombre: "Graciela Pereyra", rol: "Directora" },

    contextos: [
      g("proposito", `Corral Data es un software argentino de gestión para feedlots. Hace más de 20 años que conectamos los datos del corral con las decisiones del productor.
Queremos que el encargado cargue el dato una sola vez, en el campo y en el momento, y que el dueño vea en la oficina cuánto le cuesta engordar cada animal y dónde está perdiendo plata.
Nacimos en el campo y seguimos cerca: capacitamos, visitamos y atendemos el teléfono. Para nosotros, si alguien de campo no entiende el sistema, el problema es nuestro.
Somos 22 personas: soporte (6), desarrollo y producto (9), implementación y técnicos de campo (4) y administración y ventas (3). Oficina en Buenos Aires y técnicos que viajan a los establecimientos.`),
      g("oferta", `Un solo sistema para todo el ciclo del feedlot: ingresos de hacienda, sanidad, alimentación (dietas, raciones y consumo), costos, stock, movimientos entre corrales, salidas a frigorífico y trazabilidad.
Se integra con lectores de caravanas electrónicas, balanzas y mixers. Se usa desde la computadora (oficina), la tablet o el celular (campo). En el corral funciona sin señal: los datos se guardan en el equipo y se sincronizan cuando vuelve la conexión.
Planes: Básico (hasta 2.000 cabezas, sin integraciones), Profesional (hasta 10.000, con balanza y lector) y Empresa (sin límite, con mixer, varios establecimientos e informes a medida).
Clientes: unos 140 feedlots de 500 a 20.000 cabezas en Buenos Aires, Córdoba, Santa Fe y La Pampa. También algunos consignatarios y frigoríficos que reciben los datos de las tropas.
Lo que más valoran: datos confiables para decidir, que el sistema sea fácil para la gente de campo, informes que les sirvan para el banco y un soporte que responde.`),
      g("trabajo", `Cada cliente nuevo tiene una implementación de 30 días: instalación, carga inicial del stock, configuración de dietas, capacitación en el campo y acompañamiento las primeras semanas.
Soporte atiende de lunes a sábado de 7 a 19 (en el campo se empieza temprano) por teléfono y WhatsApp. Cada consulta se registra con establecimiento, quién llama, qué pasa, desde cuándo y próximo paso.
Desarrollo trabaja en ciclos de dos semanas. Cada ciclo arranca con una reunión de planificación y termina con una demo interna los viernes. Una vez por mes sale una versión nueva, que primero se prueba en un feedlot piloto.
Lo que piden los clientes llega por soporte o por los técnicos de campo y se anota en el tablero de pedidos. Producto decide qué entra en cada ciclo.
Los martes hay reunión de soporte para revisar casos abiertos; los lunes, reunión de producto para ordenar los pedidos.`),
      g("problemas", `1. Entender quién está del otro lado y qué está intentando hacer en el campo (no es lo mismo un encargado que un veterinario o el dueño).
2. Preguntar desde qué equipo, en qué pantalla, desde cuándo y si tuvo señal.
3. Pedir una foto o una captura antes de suponer.
4. Si hay un embarque, una carga de hacienda o un tema sanitario en juego, eso va primero.
5. Si es de integración (balanza, lector, mixer), derivar al técnico de campo con el caso completo. Si es un error del sistema, pasarlo a desarrollo con los pasos para repetirlo.
6. Volver a contactar para confirmar que el dato quedó bien y anotar qué se aprendió.`),
      g("clientes", `La gente de campo habla claro y directo: contestamos igual, sin palabras de sistemas.
Nunca se le hace sentir a nadie que "no sabe usar el sistema".
Se respeta el horario del campo: si quedamos en llamar a las 7, se llama a las 7.
Con dueños y administradores, datos concretos y opciones; con encargados y peones, pasos simples y de a uno; con veterinarios y nutricionistas, precisión en los números.
Nunca se promete un dato que todavía no está cargado ni una función que todavía no existe.`),
      g("calidad", `- Toda consulta queda registrada con establecimiento, contacto y próximo paso.
- Un problema que afecta un embarque, una salida a frigorífico o un tema sanitario se atiende en menos de 30 minutos.
- Antes de cerrar un caso, se verifica con el cliente que el dato quedó bien.
- Ningún cambio en el sistema llega a los clientes sin probarse antes en el feedlot piloto.
- Las pantallas de campo se tienen que poder usar con una mano, al sol y sin señal.
- Las capacitaciones terminan con el encargado cargando un dato real solo.`),
      g("restricciones", `Nadie modifica ni borra datos de hacienda (caravanas, pesadas, tropas) sin autorización escrita del cliente.
Los temas sanitarios los decide el veterinario del establecimiento, no Corral Data.
Visitas al campo, cambios de plan y bonificaciones: solo la directora o el responsable comercial.
Los cambios del sistema se prueban con una copia de datos del feedlot piloto, nunca con datos reales de otro cliente.
Las notificaciones nuevas a los clientes (por WhatsApp o mail) las aprueba producto antes de activarse.
La documentación oficial de trazabilidad la firma el productor: nosotros solo la dejamos lista.`),
      p("p-modulos", "Módulos del sistema", `Hacienda: ingresos (compra, origen, peso de entrada, tropa), caravanas y movimientos entre corrales.
Alimentación: dietas por etapa (recepción, acostumbramiento, engorde y terminación), lectura de comederos a la mañana, raciones del mixer y consumo diario por corral.
Sanidad: vacunas, tratamientos, enfermos y muertes. El veterinario carga las indicaciones y el encargado registra lo que se hizo.
Pesadas: pesadas parciales y de salida desde la balanza; calcula el aumento diario de peso por animal y por corral.
Costos y resultados: costo de alimento, sanidad y estructura; costo por animal, conversión y costo por kilo producido. Es lo que más mira el dueño y lo que pide el banco.
Salidas y trazabilidad: armado de tropas para frigorífico, documentación de salida y el historial de cada animal.
App de campo: la versión para celular y tablet. Funciona sin señal y sincroniza cuando hay conexión.`),
      p("p-dia", "Un día en un feedlot cliente", `6:00 El encargado recorre y lee los comederos: anota si quedó comida o si el comedero está vacío. Con eso se ajusta la ración del día.
7:00 El mixer prepara y reparte la comida, corral por corral. Si el mixer está integrado, la cantidad entregada se registra sola.
8:30 Recorrida sanitaria: se apartan los animales que se ven decaídos y el veterinario indica tratamientos.
10:00 Ingresos o salidas de hacienda: se pesa, se leen las caravanas y se asigna corral.
15:00 Segunda entrega de comida.
En la oficina, el administrador revisa consumos, costos y lo que se compró, y una vez por semana arma el informe para el dueño.`),
      p("p-usuarios", "Quién usa Corral Data en cada feedlot", `Dueño o productor: mira costos, resultados y el informe semanal. Decide compras y ventas.
Administrador: carga compras y gastos, arma informes para el dueño y para el banco.
Encargado de corrales: lectura de comederos, movimientos, ingresos y salidas, casi siempre desde el celular.
Veterinario: indicaciones sanitarias y seguimiento de enfermos.
Nutricionista (a veces externo): arma las dietas y mira consumo y conversión.
Peones y mixeros: cargan datos puntuales desde la app de campo.`),
      p("p-desarrollo", "Cómo trabaja el equipo de producto y desarrollo", `El equipo de producto lo coordina Hernán Bustos, líder de proyecto; antes fue encargado de un feedlot, así que piensa todo desde el campo. Mónica Ríos es la product owner: ordena los pedidos de los clientes y decide qué entra en cada ciclo.
Desarrollo: 6 personas (2 seniors, 2 semi seniors y 2 juniors). Carla Domínguez es la dev senior de referencia para la app de campo.
Ciclos de dos semanas: planificación el lunes, demo interna el viernes de la segunda semana. Cada tarea está en el tablero con su descripción, quién la hace y el estado.
Antes de dar algo por terminado: lo revisa otro desarrollador y se prueba con los datos de copia del feedlot piloto (Don Aníbal, en Lincoln).
Un junior arranca con tareas acotadas y siempre tiene a quién preguntar. Preferimos diez preguntas a una suposición.`),
      p("p-glosario", "Palabras del feedlot", `Feedlot: establecimiento donde se engorda ganado a corral con comida preparada.
Corral: cada lote de animales que come y se maneja junto.
Tropa: grupo de animales que entra o sale junto.
Caravana electrónica: identificación en la oreja con un chip que lee un lector.
Lectura de comederos: ver a la mañana cuánta comida quedó para ajustar la ración.
Ración: la cantidad de comida que se le da a un corral en el día.
Conversión: cuántos kilos de alimento hacen falta para que el animal aumente un kilo.
Aumento diario: cuántos kilos gana un animal por día.
Costo por kilo producido: lo que cuesta cada kilo que ganó el animal en el feedlot.`)
    ],

    documentos: [
      {
        nombre: "manual-carga-en-campo.txt",
        contenido: `CORRAL DATA · App de campo · Guía rápida para encargados

ANTES DE SALIR AL CORRAL
- Abrí la app con señal (en la oficina o la casa) para que baje lo último: corrales, dietas y animales.
- Fijate que arriba diga "Datos al día". Si dice "Pendiente de sincronizar", esperá a que termine.

LECTURA DE COMEDEROS
1. Entrá a "Comederos" y elegí el corral.
2. Marcá cómo quedó: Vacío / Poco / Normal / Sobró mucho.
3. Pasá al siguiente corral. No hace falta señal.

PESADAS
1. Conectá la balanza (o cargá el peso a mano).
2. Leé la caravana con el lector o escribí el número.
3. Confirmá el peso. La app avisa si el peso es raro comparado con la pesada anterior.

CUANDO VUELVE LA SEÑAL
- La app sincroniza sola. Si después de 10 minutos con señal sigue "Pendiente", tocá "Sincronizar ahora".
- Si el celular se apagó, los datos NO se pierden: quedan guardados y se mandan cuando se prende con señal.

¿PROBLEMAS?
Soporte: lunes a sábado de 7 a 19, por teléfono o WhatsApp. Tené a mano el nombre del establecimiento y una foto de la pantalla.`
      },
      {
        nombre: "informe-semanal-ejemplo.txt",
        contenido: `CORRAL DATA · Informe semanal · Feedlot La Aurora (ejemplo con datos ficticios)
Semana del 6 al 12 de octubre

STOCK
- Cabezas en el feedlot: 4.820 (ingresaron 310, salieron 280)
- Corrales activos: 38

ALIMENTACIÓN
- Consumo promedio: 9,8 kg de materia seca por animal por día
- Conversión del feedlot: 6,4 kg de alimento por kg ganado
- Corrales con consumo más bajo que su promedio de 7 días: 12 (-18%), 27 (-9%)

PESO
- Aumento diario promedio: 1,32 kg por animal por día
- Peso promedio de salida: 412 kg

COSTOS
- Costo de alimento por animal por día: $4.150
- Sanidad por animal en la semana: $610
- Costo por kilo producido: $3.380

SANIDAD
- Animales en tratamiento: 46 (31 en el corral 12, cuadro respiratorio)
- Muertes: 3

Nota del administrador: el corral 12 venía comiendo menos desde el martes y recién se vio el viernes en la recorrida.`
      },
      {
        nombre: "tablero-de-pedidos.txt",
        contenido: `CORRAL DATA · Tablero de pedidos de clientes (resumen, octubre)

PRIORIDAD ALTA (próximo ciclo)
- AL-212 · Aviso cuando un corral come bastante menos que su promedio. Lo pidieron La Aurora, Don Aníbal y otros 6 feedlots. Motivo: detectar a tiempo animales enfermos o problemas de comedero.
- AL-215 · Informe de costos: agregar "costo por kilo producido" por tropa. Lo piden administradores para presentar al banco.

PRIORIDAD MEDIA
- AL-198 · Exportar las pesadas a Excel desde el celular.
- AL-220 · Foto adjunta en los tratamientos sanitarios.

EN ANÁLISIS
- AL-230 · Avisos por WhatsApp al dueño (requiere aprobación de producto y revisar costos).`
      }
    ],

    tareaEjemplo: {
      entender: "¿Qué es la lectura de comederos y por qué es tan importante para el resto del sistema?",
      trabajo: "Contame cómo trabaja el equipo de desarrollo: desde que un cliente pide algo hasta que le llega en una versión nueva.",
      tarea: "Me asignaron el pedido AL-212: avisar cuando un corral come bastante menos que su promedio. ¿Cómo lo encaro y qué tendría que preguntarle a Hernán antes de arrancar?",
      revisar: "Revisá mi cálculo antes de pedir la revisión (pedido AL-212):\n\n```js\n// Cuánto bajó el consumo de hoy respecto del promedio de los últimos 7 días, en %\nfunction caidaDeConsumo(consumoHoy, promedio7dias) {\n  return (promedio7dias - consumoHoy) / consumoHoy * 100;\n}\n\n// Aviso si cae más de 15%\nfor (const corral of corrales) {\n  if (caidaDeConsumo(corral.hoy, corral.promedio7) > 15) avisar(corral);\n}\n```"
    },

    escenarios: [
      {
        id: "cd-tarea-alerta",
        rol: "lider",
        titulo: "Tu primera tarea: avisar cuando un corral come menos",
        resumen: "Hernán, tu líder de proyecto, te llama por videollamada para darte tu primera tarea en el equipo de la app de campo. Escuchá, preguntá lo que necesites y acordá cómo la vas a encarar.",
        modalidad: "llamada",
        cliente: "Hernán Bustos, líder de proyecto del equipo de producto de Corral Data. Antes de pasar al software fue encargado de un feedlot durante diez años.",
        personalidad: "Cercano, paciente y con buena onda. Explica con ejemplos del campo, nunca con palabras de sistemas. Está ocupado, pero le encanta que le pregunten: si el junior pregunta, se entusiasma y cuenta más; si solo dice \"ok\", lo frena y le pregunta qué entendió. Valora que le digan \"no sé\" antes que suponer.",
        situacion: "La tarea es el pedido AL-212 del tablero: que el sistema avise cuando un corral está comiendo bastante menos de lo normal.\nCómo la explicás, de a una parte por vez:\n1) El porqué: en el feedlot La Aurora, el corral 12 venía comiendo menos desde el martes y recién lo vieron el viernes; para entonces había 31 animales con un cuadro respiratorio. Si el sistema avisaba el martes, se agarraba antes.\n2) Qué hay que lograr: que en la pantalla de inicio del encargado y del veterinario aparezca un aviso cuando un corral come un 15% menos que su promedio de los últimos 7 días.\n3) Los pasos: primero mirar cómo se calcula hoy el consumo diario en el módulo de Alimentación; después armar el cálculo de cuánto bajó; después mostrar el aviso en la pantalla de inicio; y al final probarlo con la copia de datos del feedlot piloto Don Aníbal.\n4) Lo que no tiene que hacer: no mandar avisos por WhatsApp (eso lo decide producto) y no probar con datos reales de clientes.\nDatos que solo da si le preguntan: los corrales recién ingresados (los primeros 10 días) siempre comen menos, así que no tienen que avisar; si un día no hay lectura de comederos, no se avisa, se muestra \"sin dato\"; Carla Domínguez, la dev senior, conoce bien el módulo de Alimentación y es a quien puede preguntarle; la demo interna es el viernes de la semana que viene; no hace falta que quede perfecto para la demo, sí que funcione con un corral real del piloto.",
        objetivo: "Recibir la tarea haciendo preguntas para entender (para qué sirve, qué casos raros hay, con qué datos probar), confirmar con sus palabras lo que entendió, proponer cómo arrancar y acordar cuándo muestra un primer avance y a quién recurre si se traba.",
        cierre: "Termina cuando el junior resumió la tarea con sus palabras y acordaron cuándo le muestra un avance (y a quién le pregunta si se traba). Si el junior no hizo ninguna pregunta, antes de despedirse Hernán le pregunta \"¿y qué hacés con un corral que entró ayer?\" para ver si lo pensó. Si el junior se compromete a tenerlo todo terminado en un día, Hernán le baja la ansiedad y acuerdan un avance parcial.",
        duracion: 6,
        dificultad: "Media",
        glosario: [
          { termino: "Corral", significa: "cada lote de animales que come y se maneja junto." },
          { termino: "Lectura de comederos", significa: "ver a la mañana cuánta comida quedó, para ajustar la ración del día." },
          { termino: "Feedlot piloto", significa: "un cliente que prueba primero los cambios antes de que lleguen a todos." },
          { termino: "Demo interna", significa: "reunión del viernes donde el equipo muestra lo que hizo en el ciclo." }
        ]
      },
      {
        id: "cd-sincro",
        titulo: "\"No me aparecen las pesadas de ayer\"",
        resumen: "El encargado de corrales de un feedlot cliente no ve en la tablet las pesadas que cargó ayer. Tenés que ayudarlo sin palabras de sistemas.",
        modalidad: "llamada",
        cliente: "Ramón Gutiérrez, encargado de corrales de un feedlot de 3.000 cabezas en Lincoln, Buenos Aires. Usa el sistema hace dos meses.",
        personalidad: "Tranquilo y de pocas palabras. Desconfía de \"la computadora\". Si le hablan simple y lo guían paso a paso, colabora; si le hablan con términos técnicos, se calla y dice \"bueno, después lo veo\".",
        situacion: "Ayer pesó 140 animales en la manga y hoy en la tablet de la oficina no aparecen.\nDatos que solo da si le preguntan: cargó las pesadas en el celular, no en la tablet; en la manga no hay señal; el celular quedó en la camioneta toda la noche, apagado; el dueño quiere ver las pesadas hoy a la tarde.",
        objetivo: "Hacer preguntas simples para encontrar la causa (en qué equipo cargó, si tuvo señal) y guiarlo con pasos claros, sin hacerlo sentir mal.",
        cierre: "Se resuelve cuando Ramón sabe qué hacer para que aparezcan las pesadas y a quién llamar si no funciona. Si el candidato le habla en términos técnicos, Ramón corta con un \"bueno, después lo veo\" sin resolver.",
        duracion: 5,
        dificultad: "Baja",
        glosario: [
          { termino: "Pesada", significa: "el registro del peso de cada animal en la balanza." },
          { termino: "Sincronizar", significa: "pasar los datos del celular o la tablet al sistema central cuando hay señal." },
          { termino: "Manga", significa: "el pasillo del corral donde se pesa y se trabaja a los animales de a uno." }
        ]
      },
      {
        id: "cd-informe",
        titulo: "Un informe de costos para mañana",
        resumen: "La administradora de un feedlot necesita para mañana un informe de costo por animal para el banco, pero faltan cargar dos semanas de consumo.",
        modalidad: "llamada",
        cliente: "Valeria Sánchez, administradora de un feedlot de 8.000 cabezas en Marcos Juárez, Córdoba.",
        personalidad: "Organizada y apurada. Sabe lo que necesita y no tiene tiempo para vueltas. Si le explican qué se puede y qué no con datos, decide rápido; si le prometen el informe completo sin revisar, después se enoja mucho.",
        situacion: "Mañana a las 11 tiene una reunión con el banco por un crédito y necesita el costo por animal y la conversión del último trimestre.\nDatos que solo da si le preguntan: el consumo de las últimas dos semanas está anotado en papel, no en el sistema; el mixer se rompió hace quince días y por eso no se registró solo; al banco le alcanza con el trimestre hasta hace dos semanas si se aclara; ella puede cargar los datos hoy a la tarde si alguien le explica cómo.",
        objetivo: "Entender qué necesita el banco, ser honesto con que el informe no va a estar completo sin esos datos, proponer alternativas concretas y acordar quién hace qué y para cuándo.",
        cierre: "Se resuelve cuando Valeria sabe qué informe va a tener para mañana, con qué aclaración, y quién la ayuda a cargar los datos. Si el candidato le promete el informe completo, ella agradece y corta (es el error que se evalúa).",
        duracion: 5,
        dificultad: "Media",
        glosario: [
          { termino: "Conversión", significa: "cuántos kilos de alimento hacen falta para que el animal aumente un kilo." },
          { termino: "Consumo", significa: "cuánto alimento se le dio a cada corral." },
          { termino: "Mixer", significa: "el carro que mezcla y reparte la comida; puede registrar solo lo que entrega." }
        ]
      },
      {
        id: "cd-tarea-informe",
        rol: "lider",
        titulo: "Un cambio en el informe de costos",
        resumen: "Mónica, la product owner, te explica un cambio que piden los administradores en el informe de costos. Tenés que entender bien qué quieren antes de ponerte a hacerlo.",
        modalidad: "llamada",
        cliente: "Mónica Ríos, product owner de Corral Data. Habla todas las semanas con administradores y dueños de feedlots.",
        personalidad: "Clara, ordenada y amable. Explica desde lo que necesita el cliente, no desde lo técnico. Le gusta que le repregunten porque así descubre lo que se olvidó de decir. Si el junior no pregunta nada, se preocupa y le pide que le cuente cómo lo haría.",
        situacion: "La tarea es el pedido AL-215: agregar al informe de costos el \"costo por kilo producido\" separado por tropa.\nCómo la explicás, de a una parte por vez:\n1) El porqué: los administradores lo calculan a mano en Excel para presentarle al banco, tardan horas y a veces se equivocan.\n2) Qué hay que lograr: que el informe muestre, para cada tropa que está en el feedlot, cuánto costó cada kilo que ganaron los animales.\n3) Los pasos: entender de dónde salen los costos (alimento, sanidad y estructura); armar el cálculo; mostrarlo en el informe; y revisarlo con un administrador del piloto.\nDatos que solo da si le preguntan: el cálculo es el costo total de la tropa dividido los kilos que ganó desde que entró; las tropas que ya salieron no van; el administrador del piloto se llama Omar y está dispuesto a revisarlo; lo necesitan antes de fin de mes, que es cuando presentan al banco; si una tropa no tiene pesada intermedia, se usa el peso de entrada y se avisa con una nota.",
        objetivo: "Hacer preguntas para entender bien el pedido (qué se calcula, con qué datos, casos especiales), confirmar con sus palabras y acordar un primer paso y una fecha de revisión.",
        cierre: "Termina cuando el junior resumió qué va a hacer y acordaron cuándo lo revisan juntos o con Omar. Si el junior no preguntó cómo se calcula, Mónica se lo pregunta antes de cerrar.",
        duracion: 5,
        dificultad: "Baja",
        glosario: [
          { termino: "Product owner", significa: "la persona que ordena los pedidos de los clientes y decide qué se hace primero." },
          { termino: "Tropa", significa: "el grupo de animales que entró junto al feedlot." },
          { termino: "Costo por kilo producido", significa: "lo que cuesta cada kilo que ganó el animal en el feedlot." }
        ]
      },
      {
        id: "cd-embarque",
        titulo: "Caravanas duplicadas antes de un embarque",
        resumen: "Mañana a las 6 sale un embarque a frigorífico y el sistema muestra caravanas duplicadas. El productor está furioso y te llama a última hora.",
        modalidad: "llamada",
        cliente: "Osvaldo Peralta, productor y dueño de un feedlot de 5.000 cabezas en General Villegas. Cliente desde hace siete años.",
        personalidad: "Enojado y preocupado: si no sale el embarque pierde la venta y el camión. Levanta la voz al principio y dice que \"el sistema le hizo perder plata\". Si lo escuchan y le dan un plan concreto con horarios, se calma; si le dicen que el problema es de su balanza o de su gente, se pone peor.",
        situacion: "Son las 19. Al armar la tropa para mañana, el sistema muestra 12 caravanas repetidas y no deja cerrar el documento para el embarque.\nDatos que solo da si le preguntan: el lector de caravanas se reinició ayer en medio de una lectura; los animales de esas caravanas están físicamente en el corral 7; el camión llega a las 5:30; el técnico de campo lo visitó hace dos semanas por otro tema.",
        objetivo: "Contener sin culpar a nadie, entender qué pasó, no tocar ni borrar datos de hacienda sin autorización, derivar al técnico de campo con prioridad y acordar un plan con horarios antes del embarque.",
        cierre: "Se resuelve cuando Osvaldo sabe quién lo llama, a qué hora y qué tiene que hacer su gente mientras tanto. Si el candidato le propone borrar las caravanas repetidas por su cuenta o culpa al lector, Osvaldo pide hablar con la directora y corta.",
        duracion: 5,
        dificultad: "Alta",
        glosario: [
          { termino: "Caravana electrónica", significa: "la identificación del animal en la oreja, con un chip que lee un lector." },
          { termino: "Tropa", significa: "el grupo de animales que sale junto en un embarque." },
          { termino: "Embarque", significa: "la carga de los animales en el camión que va al frigorífico." },
          { termino: "Trazabilidad", significa: "poder seguir a cada animal desde que entra hasta que sale." }
        ]
      },
      {
        id: "cd-reunion-error",
        titulo: "Reunión de casos: contar un error propio",
        resumen: "En la reunión de soporte de los martes tenés que contarle a la directora que ayer le prometiste a un cliente una visita técnica sin autorización.",
        modalidad: "llamada",
        cliente: "Graciela Pereyra, directora de Corral Data. Conoce a todos los clientes por el nombre.",
        personalidad: "Exigente pero justa. Valora mucho que le cuenten los errores a tiempo. Si le contás lo que pasó sin vueltas y llevás una propuesta, te ayuda a arreglarlo; si te justificás o le restás importancia, se pone seria y hace preguntas incómodas.",
        situacion: "Ayer un productor de General Villegas insistió mucho y le prometiste que el técnico de campo iba a ir el jueves. Las visitas las autoriza solo Graciela, y el técnico ya tiene el jueves ocupado en Córdoba.\nDatos que solo da si le preguntan: el productor es uno de los clientes más grandes; el problema se podría revisar por videollamada con el encargado; el técnico tiene libre el lunes; el productor no sabe todavía que la visita no está confirmada.",
        objetivo: "Contar el error con honestidad y sin justificarse, entender por qué la regla existe, proponer cómo arreglarlo con el cliente y acordar quién lo llama y cuándo.",
        cierre: "Se resuelve cuando hay un plan para hablar con el productor (quién, cuándo y qué alternativa se le ofrece). Si el candidato culpa al cliente o minimiza el error, Graciela cierra con un \"lo resuelvo yo\" y se nota la desconfianza.",
        duracion: 5,
        dificultad: "Alta",
        glosario: [
          { termino: "Técnico de campo", significa: "el técnico que viaja a los establecimientos a instalar y revisar equipos." },
          { termino: "Reunión de casos", significa: "reunión semanal de soporte donde se repasan los casos abiertos." }
        ]
      }
    ],

    criterios: criteriosCon([20, 10, 15, 15, 10, 20, 10], {
      "Escucha y claridad": "Deja hablar, retoma lo que dijo el otro y explica con palabras simples, sin términos de sistemas, en pasos cortos y ordenados. Cuando recibe una tarea, confirma con sus palabras lo que entendió."
    }),
    notasEvaluacion: "En el campo valoramos la claridad: si el encargado no entendió, el problema es nuestro. Cuando alguien recibe una tarea, preferimos diez preguntas a una suposición: valoramos que pregunte el para qué, los casos raros y con qué datos probar, y que acuerde cuándo muestra avance. Con embarques y datos de hacienda no se improvisa: no se toca nada sin autorización y se deriva rápido."
  };

  // ---------------------------------------------------------------- MKT Contact Center (borrador, ver docs/escenarios-mkt.md)
  // La campaña (ConectAR) es inventada: se reemplaza cuando MKT nos cuente una real.
  const mkt = {
    version: 2,
    empresa: "MKT Contact Center",
    rubro: "Servicios",
    responsable: { nombre: "Equipo de capacitación", rol: "Recursos Humanos" },

    contextos: [
      g("proposito", `MKT Contact Center atiende por teléfono a los clientes de otras empresas. En esta campaña somos la atención al cliente de ConectAR, un proveedor de internet y TV.
Cada llamada es la cara de ConectAR: el cliente no sabe que habla con un call center, sabe que habla con "su" empresa.
Queremos que el cliente corte sabiendo qué va a pasar, cuándo y con un número para seguirlo.`),
      g("oferta", `ConectAR vende internet por fibra y TV a hogares y comercios chicos.
Los motivos de llamada más comunes: el servicio no anda, dudas o errores en la factura, pedidos de baja y reclamos que se repiten.
Lo que más valora el cliente: que lo escuchen sin hacerle repetir todo, que le hablen claro y que no le prometan lo que después no pasa.`),
      g("trabajo", `Llamadas entrantes: el operador atiende con el saludo de la campaña ("ConectAR, buen día, te habla (nombre). ¿En qué te puedo ayudar?").
Llamadas salientes (por ejemplo, cobranzas): el operador se presenta con nombre y empresa y valida que habla con el titular antes de decir para qué llama.
Cada grupo de operadores tiene una team leader que escucha llamadas grabadas (monitoreo de calidad) y da feedback.
Al cortar, el operador tipifica la llamada: registra el motivo en el sistema.`),
      g("problemas", `1. Saludar y validar la identidad: DNI del titular y fecha de nacimiento, antes de dar o pedir datos de la cuenta.
2. Escuchar el problema completo sin interrumpir y sin hacer repetir lo que ya se dijo.
3. Preguntar lo necesario para entender (desde cuándo, qué se probó, qué ve el cliente).
4. Ofrecer la solución que corresponde o la alternativa posible, sin prometer lo que no depende de nosotros.
5. Cerrar: resumir lo acordado, dar el número de gestión, decir qué pasa y cuándo, y preguntar si hay algo más.`),
      g("clientes", `Tuteamos al cliente con respeto; a una persona mayor, si lo prefiere, de usted.
Nunca discutimos ni nos ponemos a la defensiva: el enojo del cliente no es con nosotros.
Si el cliente insulta: primera advertencia amable; si sigue, segunda advertencia avisando que se va a cortar; a la tercera se corta con un saludo y se registra.
Hablamos simple: si usamos una palabra técnica, la explicamos.
Si no sabemos algo, lo decimos y averiguamos; no inventamos.`),
      g("calidad", `En cada llamada se revisa:
- Saludo de la campaña y validación de identidad.
- Que no se le hizo repetir datos al cliente.
- Que la información dada sea correcta y dentro de lo permitido.
- Número de gestión dado y confirmado.
- Cierre con resumen y "¿hay algo más en lo que te pueda ayudar?".
- Tipificación correcta al cortar.`),
      g("restricciones", `No dar datos de la cuenta ni de deudas a quien no validó ser el titular.
No prometer devoluciones en el momento: Facturación las resuelve en hasta 72 horas hábiles.
No prometer visitas técnicas "hoy": la primera fecha disponible es en 48 horas hábiles.
La promoción de retención (30 % por 6 meses) se ofrece una sola vez y solo si tiene sentido para el cliente; no se insiste.
Planes de pago: hasta 3 cuotas para deudas de hasta 2 facturas. Lo demás, con la team leader.
Nunca se amenaza a un cliente (por ejemplo, con el Veraz).`),
      p("p-tecnica", "Problemas de conexión", `Pruebas que el operador puede hacer con el cliente: revisar que el módem tenga luz, reiniciarlo una vez y mirar las luces.
Luz LOS en rojo: no llega la señal de la fibra; no se arregla desde el módem y hace falta una visita técnica.
Si el cliente ya reinició el módem, no se le pide de nuevo.`),
      p("p-baja", "Pedidos de baja", `Primero se pregunta el motivo. Si tiene sentido, se ofrece una vez la retención.
Si el cliente sigue decidido, se respeta y se explican los pasos: fecha de la baja, devolución del módem (es en comodato: se lleva a una sucursal o lo pasan a buscar sin costo) y última factura proporcional.`)
    ],

    tareaEjemplo: {
      entender: "¿Por qué tengo que validar la identidad del cliente antes de cualquier cosa, aunque me diga su nombre?",
      trabajo: "Contame cómo es una llamada entrante de punta a punta, desde el saludo hasta la tipificación. ¿Qué no me puedo olvidar?",
      tarea: "Me llama un cliente que dice que le cobraron de más, pero no tiene la factura a mano. ¿Cómo encaro la llamada?",
      revisar: "Revisá cómo cerré esta llamada:\n\n\"Bueno, listo, ya está el reclamo. Cualquier cosa volvé a llamar. Chau.\""
    },

    escenarios: [
      {
        id: "mkt-sin-internet",
        titulo: "Hace dos días que no tengo internet",
        resumen: "Atendés una llamada entrante. Una clienta lleva dos días sin internet y trabaja desde su casa.",
        modalidad: "llamada",
        inicio: "atiende",
        voz: "femenina",
        cliente: "Mariela Ríos, 45 años, contadora, trabaja desde su casa. Es la titular de la cuenta.",
        personalidad: "Cansada y apurada, pero no agresiva. Ya llamó ayer y siente que no le solucionaron nada. Si la escuchan y le explican qué va a pasar, se calma y colabora. Si le leen un guion sin escucharla o le hacen repetir lo que ya contó, se impacienta y lo dice.",
        situacion: "La conexión se corta desde el lunes. Ayer llamó y le dijeron que reinicie el módem, cosa que ya había hecho.\nDatos que solo da si le preguntan: la luz \"LOS\" del módem está en rojo; el corte empezó después de una tormenta el domingo a la noche; el reclamo de ayer no tiene número porque no se lo dieron; el jueves a las 10 tiene una reunión muy importante.\nSi te piden validar la identidad: DNI 23.456.789, nacida el 3 de mayo de 1979.",
        objetivo: "Saludar, validar la identidad, escuchar sin hacerle repetir lo que ya contó, preguntar por las luces del módem, explicar que hace falta una visita técnica con la primera fecha disponible (sin prometer \"hoy\") y dar el número de gestión.",
        ficha: "Saludo de la campaña: \"ConectAR, buen día, te habla (tu nombre). ¿En qué te puedo ayudar?\"\nAntes de hablar de la cuenta: pedí DNI y fecha de nacimiento del titular. El sistema te confirma si coinciden.\nEn el sistema: cuenta de internet por fibra, al día con los pagos. Ayer hubo una llamada por \"sin conexión\" que se cerró sin número de gestión.\nPodés hacer: pruebas con el módem (mirar las luces, un reinicio) y pedir una visita técnica.\nPlazos: la primera visita técnica disponible es en 48 horas hábiles. No se puede prometer para hoy.\nAl cargar el reclamo, el sistema te da el número de gestión: 4471-208.",
        cierre: "Se resuelve cuando Mariela tiene número de gestión y fecha de la visita. Si le prometen que \"hoy se arregla\", preguntá \"¿me lo asegurás?\"; si lo sostienen, cortá conforme.",
        duracion: 5,
        dificultad: "Baja",
        glosario: [
          { termino: "Luz LOS", significa: "la luz del módem que indica que no llega señal de la fibra." },
          { termino: "Visita técnica", significa: "un técnico va al domicilio del cliente." },
          { termino: "Número de gestión", significa: "el código del reclamo que se le da al cliente para hacer el seguimiento." }
        ]
      },
      {
        id: "mkt-doble-cobro",
        titulo: "Me cobraron dos veces",
        resumen: "Atendés a un cliente jubilado al que le debitaron dos veces la factura del mes.",
        modalidad: "llamada",
        inicio: "atiende",
        voz: "masculina",
        cliente: "Héctor Galván, 72 años, jubilado. Es el titular de la cuenta.",
        personalidad: "Educado y paciente, pero desconfiado (\"a mí ya me pasó con el banco\"). Habla despacio y a veces no entiende los términos. Si le hablan claro y le confirman los pasos, queda tranquilo. Si le hablan con palabras técnicas o lo apuran, pregunta \"¿cómo, cómo?\" y se pone nervioso. Prefiere que lo traten de usted.",
        situacion: "En el resumen del banco ve dos débitos de ConectAR del mismo día, por el mismo monto. Quiere que le devuelvan la plata ya.\nDatos que solo da si le preguntan: cada débito es de 18.500 pesos; es la primera vez que le pasa con ConectAR; no tiene mail, así que la respuesta tiene que ser por teléfono.\nSi te piden validar la identidad: DNI 8.765.432, nacido el 12 de junio de 1953.",
        objetivo: "Saludar, validar la identidad, explicar sin tecnicismos que se abre un reclamo y que Facturación lo resuelve en hasta 72 horas hábiles, dictar despacio el número de gestión confirmando que lo anotó y acordar que lo llamen por teléfono.",
        ficha: "Saludo de la campaña: \"ConectAR, buen día, te habla (tu nombre). ¿En qué te puedo ayudar?\"\nAntes de hablar de la cuenta: pedí DNI y fecha de nacimiento del titular. El sistema te confirma si coinciden.\nEn el sistema: este mes hay dos débitos automáticos del mismo día, de 18.500 pesos cada uno.\nPodés hacer: abrir un reclamo a Facturación por el débito duplicado.\nPlazos: Facturación resuelve las devoluciones en hasta 72 horas hábiles. No se puede devolver en el momento.\nAl abrir el reclamo, el sistema te da el número de gestión: 5120-733.",
        cierre: "Se resuelve cuando Héctor anotó el número y sabe cuándo y cómo le avisan. Si le prometen la devolución \"ahora mismo\", agradecé y cortá.",
        duracion: 5,
        dificultad: "Baja",
        glosario: [
          { termino: "Débito automático", significa: "el banco paga la factura solo, todos los meses." },
          { termino: "Días hábiles", significa: "días de semana, sin contar sábados, domingos ni feriados." }
        ]
      },
      {
        id: "mkt-baja",
        titulo: "Quiero dar de baja el servicio",
        resumen: "Una clienta llama decidida a dar de baja el servicio.",
        modalidad: "llamada",
        inicio: "atiende",
        voz: "femenina",
        cliente: "Sofía Benítez, 28 años, diseñadora. Es la titular de la cuenta.",
        personalidad: "Amable pero firme: ya lo pensó. Escucha una oferta, pero si le insisten más de una vez se molesta (\"te dije que no, ¿me la podés dar de baja?\"). Valora que la traten como adulta y le expliquen los pasos.",
        situacion: "Pide la baja porque, dice, está muy caro.\nDatos que solo da si le preguntan: el 30 de este mes se muda a la casa de su pareja, que ya tiene otro proveedor; el mes pasado la factura le subió un 20 %; tiene el módem en comodato y no sabe cómo devolverlo.\nSi te piden validar la identidad: DNI 36.112.908, nacida el 14 de agosto de 1997.",
        objetivo: "Saludar, validar la identidad, preguntar el motivo real antes de ofrecer nada, ofrecer como mucho una vez la retención (con la mudanza no tiene sentido), respetar la decisión y explicar los pasos de la baja: fecha, devolución del módem, última factura y número de gestión.",
        ficha: "Saludo de la campaña: \"ConectAR, buen día, te habla (tu nombre). ¿En qué te puedo ayudar?\"\nAntes de hablar de la cuenta: pedí DNI y fecha de nacimiento del titular. El sistema te confirma si coinciden.\nEn el sistema: clienta desde hace 3 años, internet por fibra, módem en comodato.\nPodés ofrecer: una sola vez, la promoción de retención (30 % de descuento por 6 meses), si tiene sentido para la clienta.\nSi mantiene la baja: se respeta. Explicale la fecha de la baja, la devolución del módem (en una sucursal o lo pasan a buscar sin costo) y la última factura proporcional.\nAl registrar la baja, el sistema te da el número de gestión: 6034-512.",
        cierre: "Se resuelve cuando Sofía sabe cómo sigue la baja. Si le insisten dos veces o más con la oferta, decí que vas a hacer un reclamo en Defensa del Consumidor y cortá.",
        duracion: 6,
        dificultad: "Media",
        glosario: [
          { termino: "Retención", significa: "el intento de que el cliente no se dé de baja, por ejemplo con una promoción." },
          { termino: "Comodato", significa: "el módem es de la empresa y se presta mientras dura el servicio." }
        ]
      },
      {
        id: "mkt-cliente-agresivo",
        titulo: "Un cliente que insulta",
        resumen: "Atendés a un cliente muy enojado que arranca a los gritos.",
        modalidad: "llamada",
        inicio: "atiende",
        voz: "masculina",
        cliente: "Ricardo Paz, 50 años, dueño de un kiosco. Es el titular de la cuenta.",
        personalidad: "Enojado y descargándose (\"son todos unos inútiles\"). Insulta una vez al principio. Si el operador mantiene la calma, pone un límite con respeto y muestra que lo va a ayudar, baja el tono. Si se pone a la defensiva, se ríe o se enoja, Ricardo sube el tono y vuelve a insultar.",
        situacion: "La TV no anda desde hace una semana y es la tercera vez que llama. Quiere hablar con alguien que sepa.\nDatos que solo da si le preguntan: tiene el kiosco con la TV prendida para los clientes; en las dos llamadas anteriores le dijeron que ya estaba solucionado; tiene anotados los números de gestión anteriores (3302-118 y 3390-045).\nSi te piden validar la identidad: DNI 20.334.556, nacido el 2 de febrero de 1975.",
        objetivo: "Saludar, no responder al insulto con enojo y poner un límite con respeto, validar la identidad, reconocer que es la tercera vez que llama, pedir los números de gestión anteriores y ofrecer escalar el caso con un próximo paso concreto (quién lo llama y cuándo).",
        ficha: "Saludo de la campaña: \"ConectAR, buen día, te habla (tu nombre). ¿En qué te puedo ayudar?\"\nAntes de hablar de la cuenta: pedí DNI y fecha de nacimiento del titular. El sistema te confirma si coinciden.\nEn el sistema: el servicio de TV tiene dos reclamos de la última semana, cerrados como \"solucionado\".\nSi el cliente insulta: primera advertencia amable; si sigue, segunda advertencia avisando que vas a cortar; a la tercera se corta con un saludo.\nPodés hacer: escalar el caso a Soporte de nivel 2, que llama al cliente en el día.\nAl escalar, el sistema te da el número de gestión: 7781-090.",
        cierre: "Se resuelve cuando Ricardo acepta la derivación o el próximo paso. Si el operador te insulta o te corta sin advertir, terminá la llamada ahí.",
        duracion: 5,
        dificultad: "Alta",
        glosario: [
          { termino: "Escalar un caso", significa: "pasarlo a un supervisor o a un área con más herramientas para resolverlo." }
        ]
      },
      {
        id: "mkt-cobranza",
        titulo: "Llamada de cobranza",
        resumen: "Llamás vos a un cliente que debe dos facturas.",
        modalidad: "llamada",
        inicio: "llama",
        voz: "masculina",
        cliente: "Diego Sosa, 34 años, albañil. Es el titular de la cuenta.",
        personalidad: "Avergonzado y a la defensiva al principio (\"ya sé, ya sé\"). Perdió un trabajo hace dos meses. Si no lo juzgan y le ofrecen una salida posible, colabora. Si lo presionan o lo amenazan (por ejemplo, con el Veraz), se cierra y dice que no puede pagar nada.",
        situacion: "Debe dos facturas, 38.000 pesos en total. Atiende el celular en la obra, con ruido de fondo.\nDatos que solo da si le preguntan: a fin de mes le entra plata; puede pagar una parte ahora, pero no todo; prefiere pagar por transferencia.\nSi le hablan de la deuda antes de confirmar que sos el titular, preguntá \"¿y vos cómo sabés que soy yo?\".\nSi te piden validar la identidad: DNI 33.221.004, nacido el 9 de noviembre de 1991.",
        objetivo: "Presentarse con nombre y empresa, validar que habla con el titular antes de mencionar la deuda, no amenazar ni juzgar, preguntar qué puede pagar y cuándo, ofrecer el plan de pagos (hasta 3 cuotas), acordar fecha y monto y dar el número de gestión.",
        ficha: "Presentación: decí tu nombre y que llamás de ConectAR.\nAntes de hablar de la deuda: confirmá que hablás con el titular, Diego Sosa, y validá su identidad con DNI y fecha de nacimiento. El sistema te confirma si coinciden.\nEn el sistema: dos facturas impagas (agosto y septiembre), 38.000 pesos en total.\nPodés ofrecer: un plan de pagos de hasta 3 cuotas. Acordá el monto y la fecha de cada pago.\nNo podés: amenazar ni presionar (por ejemplo, con el Veraz).\nAl registrar el acuerdo, el sistema te da el número de gestión: 8812-461.",
        cierre: "Se resuelve cuando hay un acuerdo de pago con fecha.",
        duracion: 6,
        dificultad: "Alta",
        glosario: [
          { termino: "Plan de pagos", significa: "dividir la deuda en cuotas (en esta campaña, hasta 3)." }
        ]
      },
      {
        id: "mkt-feedback-tl",
        titulo: "Feedback de tu team leader",
        resumen: "Tu team leader te llama para darte el feedback del monitoreo de calidad de una de tus llamadas.",
        modalidad: "llamada",
        voz: "femenina",
        cliente: "Carla Funes, team leader de tu grupo en MKT. Es tu supervisora directa desde que entraste hace dos semanas.",
        personalidad: "Cálida y directa. Empieza por lo que salió bien. Si el operador escucha y pregunta cómo mejorar, le da ideas concretas. Si se justifica o culpa al sistema, repregunta: \"entiendo, pero ¿qué podrías hacer distinto vos?\".",
        situacion: "Escuchaste una llamada grabada del operador del martes: fue muy amable, pero le dio el saldo de la cuenta a la clienta antes de validar su identidad, y la llamada duró 14 minutos cuando el promedio es de 6.\nDatos que solo da si le preguntan: lo de la identidad es lo grave y lo de la duración es secundario; hay una guía de validación de una página; puede escuchar llamadas de una compañera con muy buen puntaje.",
        objetivo: "Escuchar sin justificarse, reconocer el error de la validación, preguntar cómo mejorar y comprometerse con algo concreto (por ejemplo, leer la guía o escuchar llamadas de una compañera).",
        cierre: "Se resuelve cuando hay un compromiso concreto. Si el operador se justifica todo el tiempo, cerrá con un \"lo seguimos hablando la semana que viene\".",
        duracion: 5,
        dificultad: "Media",
        glosario: [
          { termino: "Team leader", significa: "la supervisora directa del grupo de operadores." },
          { termino: "Monitoreo de calidad", significa: "la escucha de llamadas grabadas para dar feedback." },
          { termino: "TMO", significa: "tiempo medio de operación: cuánto dura en promedio una llamada." }
        ]
      }
    ],

    // Criterios propuestos para RR. HH. Los pesos son iguales y provisorios: los define RR. HH.
    criterios: [
      { nombre: "Escucha activa", descripcion: "Deja hablar, retoma lo que dijo el cliente y no le hace repetir datos que ya dio.", peso: 1 },
      { nombre: "Empatía y control emocional", descripcion: "Reconoce el malestar del cliente, mantiene la calma con un cliente enojado y pone límites con respeto.", peso: 1 },
      { nombre: "Claridad", descripcion: "Habla simple, sin tecnicismos, y confirma que el cliente entendió (números, fechas).", peso: 1 },
      { nombre: "Procedimiento", descripcion: "Saluda como pide la campaña, valida la identidad antes de hablar de la cuenta, no promete lo que no puede dar y sigue las reglas de la campaña.", peso: 1 },
      { nombre: "Resolución", descripcion: "Pregunta para entender el problema y ofrece la solución o la alternativa que corresponde.", peso: 1 },
      { nombre: "Cierre", descripcion: "Resume lo acordado, da el número de gestión, dice qué pasa y cuándo, y pregunta si hay algo más.", peso: 1 }
    ],
    notasEvaluacion: "Es el primer trabajo de quien hace la simulación: puede no saber el saludo exacto ni los plazos de la campaña. Valoramos más que escuche, que no prometa lo que no puede y que sea honesto, que la velocidad o el guion perfecto."
  };

  T.EJEMPLOS = {
    nodo: { etiqueta: "Nodo Software · software factory", config: nodo },
    mkt: { etiqueta: "MKT Contact Center · atención al cliente (borrador)", config: mkt },
    esquina: { etiqueta: "La Esquina · bodegón familiar", config: esquina },
    puerta: { etiqueta: "Puerta a Puerta · importación para empresas", config: puerta },
    andamio: { etiqueta: "Andamio · consultora de proyectos IT", config: andamio },
    mostrador: { etiqueta: "Mostrador Gestión · sistema para comercios y listas de precios", config: mostrador },
    corral: { etiqueta: "Corral Data · software para feedlots (completo)", config: corral }
  };
  T.DEFAULTS = nodo;
  T.RUBROS = ["Software", "Gastronomía", "Comercio", "Salud", "Industria", "Servicios", "Otro"];
})();
