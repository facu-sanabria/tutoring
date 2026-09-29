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
    version: 2,
    empresa: "Nodo Software",
    rubro: "Software",
    responsable: { nombre: "Martín Sosa", rol: "Líder técnico" },

    contextos: [
      g("proposito", `Nodo Software es una software factory de San Miguel (18 personas).
Nuestro producto principal es TurnoFácil. Ayudamos a consultorios y peluquerías a llenar su agenda y reducir las ausencias: cada turno perdido es plata que pierde el cliente.`),
      g("oferta", `TurnoFácil: sistema web de turnos. Unos 300 clientes, casi todos PyMEs (consultorios, odontólogos, peluquerías, barberías).
Los pacientes reservan online y reciben un recordatorio por WhatsApp o email 24 h antes.
Los recordatorios bajaron las ausencias un 30%: son la función que más valoran los clientes.`),
      g("trabajo", `Scrum con sprints de 2 semanas. Daily 9:30 (15 min). Tablero en Jira, proyecto TF.
Ramas: feature/TF-123 desde develop. Hotfix solo para prioridad 1.
Definición de terminado: test del caso + review de un senior + probado en staging.
Deploys a producción martes y jueves a las 18 h.
Commits y PRs en español.`),
      g("problemas", `1. Entender el impacto: a cuántos clientes afecta y desde cuándo.
2. Reproducirlo antes de arreglarlo.
3. Buscar la causa, no parchear el síntoma.
4. Primero el cambio más chico y reversible.
5. Escribir un test del caso que falló.
6. PR con: qué cambia, por qué y cómo lo probaste.`),
      g("clientes", `Sin tecnicismos. Primero escuchar y entender, después proponer.
No prometer fechas sin estimar con el equipo: "lo reviso y te aviso a las 15" es mejor que una promesa.
Avisar antes de que el cliente pregunte.`),
      g("calidad", `- ¿Resuelve la causa o solo el síntoma?
- Casos borde: datos vacíos, fechas, zonas horarias (los negocios están en distintas provincias).
- ¿Puede correr dos veces en paralelo sin romper nada?
- Tiene test del caso que falló.
- No rompe otros módulos que usan la misma función.
- Descripción del PR clara: qué, por qué y cómo se probó.`),
      g("restricciones", `api/pagos: solo con un senior.
No se accede a datos reales de pacientes fuera de producción.`),
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
        id: "duplicados",
        titulo: "Recordatorios duplicados",
        resumen: "Una clínica llama molesta: sus pacientes reciben dos mensajes por turno.",
        modalidad: "llamada",
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
        modalidad: "llamada",
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
        modalidad: "llamada",
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

  // ---------------------------------------------------------------- La Esquina (bodegón)
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

  T.EJEMPLOS = {
    nodo: { etiqueta: "Nodo Software · software factory", config: nodo },
    esquina: { etiqueta: "La Esquina · bodegón familiar", config: esquina }
  };
  T.DEFAULTS = nodo;
  T.RUBROS = ["Software", "Gastronomía", "Comercio", "Salud", "Industria", "Servicios", "Otro"];
})();
