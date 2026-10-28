# Escenarios de call center para MKT Contact Center (borrador)

**Estado:** borrador para revisar con el equipo y con RR. HH. Ya están **cargados en la app como empresa de ejemplo**, para poder probarlos: *Empresa → Contexto → Cargar ejemplo → "MKT Contact Center · atención al cliente (borrador)"*. Están en `public/js/defaults.js` (`mkt`). Si se cambia algo acá, hay que cambiarlo también ahí.

**Quién arranca la llamada.** En las llamadas entrantes (escenarios 1 a 4) atiende el candidato y saluda primero. En la cobranza (5) llama el candidato: el cliente atiende con un "¿Hola?" y espera que se presente. En el feedback (6) arranca la team leader. Se configura en *Empresa → Escenarios → "Quién arranca la llamada"*.

**Datos para validar la identidad.** Cada cliente tiene un DNI y una fecha de nacimiento que solo conoce la IA: los dice si el candidato se los pide. El candidato no los ve en la pantalla previa, pero sí sabe que los tiene que pedir: lo dice "Lo que tenés a mano".

**Lo que tenés a mano.** En los escenarios 1 a 5, el brief muestra lo que un operador vería en el sistema y las reglas de la campaña: el saludo, cómo validar la identidad, qué puede ofrecer, los plazos y el número de gestión. Por ejemplo, en la cobranza dice que la deuda es de 38.000 pesos y que se puede ofrecer hasta 3 cuotas. Sin esto, lo evaluábamos por reglas que nunca le dijimos. El texto exacto está en el campo `ficha` de cada escenario en `defaults.js`. **[confirmar con MKT]** qué ve realmente un operador antes de cada llamada.

**Para quién:** jóvenes de 18 años del programa, en su primer trabajo. Son llamadas que podría atender o hacer un operador recién entrado, sin conocimiento técnico previo.

**Campaña ficticia.** Para no inventar datos de MKT, todos los escenarios usan una campaña inventada: la atención al cliente de **ConectAR**, un proveedor de internet y TV. Si MKT nos cuenta una campaña real (o un rubro: telefonía, bancos, servicios), se reemplazan los nombres y las reglas. Lo marcado con **[confirmar con MKT]** es una suposición nuestra.

Cada escenario tiene los mismos campos que usa la app:

| Campo | Qué es |
|---|---|
| **Cliente** | A quién interpreta la IA. |
| **Personalidad** | Cómo reacciona la IA según lo que haga el candidato. |
| **Situación** | Lo que pasa. Los "datos que solo da si le preguntan" sirven para ver si el candidato indaga. |
| **Objetivo** | Lo que se espera que logre el candidato. No se le muestra antes de la llamada. |
| **Lo que tiene a mano** | Lo que vería un operador en el sistema y las reglas de la campaña. Se muestra antes de la llamada. |
| **Cierre** | Cuándo la IA termina la llamada y cómo reacciona si el candidato no lo logra. |

---

## Contexto de la campaña (para la sección *Contexto* de la empresa)

> Todo esto es una suposición razonable de cómo trabaja una campaña de atención. **[confirmar con MKT]**

- **Saludo:** "ConectAR, buen día, te habla (nombre). ¿En qué te puedo ayudar?"
- **Validación de identidad:** antes de dar o pedir cualquier dato de la cuenta, se pide **DNI del titular y fecha de nacimiento**. Si quien llama no es el titular, solo se dan datos generales (precios, cobertura), nunca datos de la cuenta ni de la deuda.
- **Lo que el operador puede hacer:**
  - Pruebas básicas de conexión con el cliente (reiniciar el módem, revisar cables y luces).
  - Abrir un reclamo con número de gestión.
  - Pedir una visita técnica: la primera fecha disponible es en 48 horas hábiles; nunca "hoy".
  - Ofrecer la promoción de retención vigente: 30 % de descuento por 6 meses, una sola vez por cliente.
  - Ofrecer un plan de pagos de hasta 3 cuotas para deudas de hasta 2 facturas.
- **Lo que el operador no puede hacer:**
  - Prometer devoluciones de dinero en el momento: el área de Facturación las resuelve en hasta 72 horas hábiles.
  - Dar fechas que el sistema no le muestra.
  - Dar de baja sin ofrecer antes, una vez, la retención.
- **Cliente agresivo:** si insulta, se hace una primera advertencia amable. Si vuelve a insultar, una segunda advertencia avisando que se va a cortar. A la tercera, se corta con un saludo y se registra. Si el cliente pide un supervisor, se deriva.
- **Cierre de cada llamada:** resumir lo acordado, dar el **número de gestión**, decir qué pasa y cuándo, y preguntar si hay algo más.
- **Tipificación:** al cortar, el operador registra el motivo de la llamada en el sistema.
- **Glosario de la campaña:**
  - **TMO:** tiempo medio de operación, cuánto dura en promedio una llamada.
  - **Tipificar:** registrar el motivo de la llamada en el sistema.
  - **Número de gestión:** el código del reclamo que se le da al cliente para hacer el seguimiento.
  - **Retención:** el intento de que el cliente no se dé de baja.
  - **Monitoreo de calidad:** la escucha de llamadas grabadas para dar feedback.
  - **Team leader (TL):** el supervisor directo del grupo de operadores.

---

## 1. "Hace dos días que no tengo internet"

- **id:** `mkt-sin-internet`
- **Dificultad:** Baja · **Duración:** 5 min · **Voz:** femenina
- **Resumen:** Atendés una llamada entrante. Una clienta lleva dos días sin internet y trabaja desde su casa.
- **Cliente:** Mariela Ríos, 45 años, contadora, trabaja desde su casa. Titular de la cuenta.
- **Personalidad:** Cansada y apurada, pero no agresiva. Ya llamó ayer y "no le solucionaron nada". Si el operador la escucha y le explica qué va a pasar, se calma y colabora con las pruebas. Si le leen un guion sin escucharla o le piden repetir lo que ya contó, se impacienta y lo dice.
- **Situación:** La conexión se corta desde el lunes. Ayer llamó y le dijeron que reinicie el módem, cosa que ya había hecho.
  - **Datos que solo da si le preguntan:**
    - La luz "LOS" del módem está en rojo.
    - El corte empezó después de una tormenta.
    - El reclamo de ayer no tiene número porque no se lo dieron.
    - Tiene una reunión importante el jueves a las 10.
- **Objetivo:**
  - Validar su identidad.
  - Escuchar sin hacerle repetir lo que ya contó y hacer las preguntas de diagnóstico (luces del módem).
  - Explicar que hace falta una visita técnica y dar la primera fecha disponible sin prometer "hoy".
  - Dar el número de gestión.
- **Cierre:** Termina cuando Mariela tiene número de gestión y fecha de la visita. Si el operador le promete que "hoy se arregla", ella pregunta "¿me lo asegurás?" y, si lo sostiene, corta conforme. Esa promesa es lo que se evalúa después.
- **Glosario:**
  - **Luz LOS:** la luz del módem que indica que no llega señal de la fibra.
  - **Visita técnica:** un técnico va al domicilio.

## 2. "Me cobraron dos veces"

- **id:** `mkt-doble-cobro`
- **Dificultad:** Baja · **Duración:** 5 min · **Voz:** masculina
- **Resumen:** Atendés a un cliente jubilado al que le debitaron dos veces la factura del mes.
- **Cliente:** Héctor Galván, 72 años, jubilado. Titular de la cuenta.
- **Personalidad:** Educado y paciente, pero desconfiado: "a mí ya me pasó con el banco". Habla despacio y a veces no entiende los términos. Si el operador le habla claro y le confirma los pasos, queda tranquilo. Si usa palabras técnicas o lo apura, pregunta "¿cómo, cómo?" y se pone nervioso.
- **Situación:** Ve en el resumen del banco dos débitos de ConectAR del mismo día por el mismo monto. Quiere que le devuelvan la plata "ya".
  - **Datos que solo da si le preguntan:**
    - El monto de cada débito.
    - Que es la primera vez que le pasa con ConectAR.
    - Que no tiene mail, así que la respuesta tiene que ser por teléfono.
- **Objetivo:**
  - Validar su identidad.
  - Explicar sin tecnicismos que se abre un reclamo y que Facturación lo resuelve en hasta 72 horas hábiles.
  - Dar el número de gestión, dictado despacio, y confirmar que lo anotó.
  - Acordar que lo contacten por teléfono.
- **Cierre:** Termina cuando Héctor anotó el número y sabe cuándo y cómo le avisan. Si el operador le promete la devolución "ahora mismo", Héctor agradece y corta.

## 3. "Quiero dar de baja el servicio"

- **id:** `mkt-baja`
- **Dificultad:** Media · **Duración:** 6 min · **Voz:** femenina
- **Resumen:** Una clienta llama decidida a dar de baja el servicio.
- **Cliente:** Sofía Benítez, 28 años, diseñadora. Titular de la cuenta.
- **Personalidad:** Amable pero firme. Ya lo pensó. Escucha una oferta, pero si el operador insiste más de una vez se molesta: "te dije que no, ¿me la podés dar de baja?". Valora que la traten como adulta y le expliquen los pasos.
- **Situación:** Pide la baja porque, dice, "está muy caro".
  - **Datos que solo da si le preguntan:**
    - Se muda en un mes a la casa de su pareja, que ya tiene otro proveedor.
    - Le subieron la factura un 20 % el mes pasado.
    - Tiene el módem en comodato y no sabe cómo devolverlo.
- **Objetivo:**
  - Validar su identidad.
  - Preguntar el motivo real antes de ofrecer.
  - Ofrecer una vez la retención, si tiene sentido (con la mudanza, no lo tiene).
  - Respetar la decisión y explicar los pasos de la baja: fecha, devolución del módem y última factura.
  - Dar el número de gestión.
- **Cierre:** Termina cuando Sofía sabe cómo sigue la baja. Si el operador insiste dos veces o más con la oferta, Sofía dice que va a hacer un reclamo en Defensa del Consumidor y corta.
- **Glosario:**
  - **Comodato:** el módem es de la empresa y se presta mientras dura el servicio.

## 4. Un cliente que insulta

- **id:** `mkt-cliente-agresivo`
- **Dificultad:** Alta · **Duración:** 5 min · **Voz:** masculina
- **Resumen:** Atendés a un cliente muy enojado que empieza a los gritos.
- **Cliente:** Ricardo Paz, 50 años, dueño de un kiosco. Titular de la cuenta.
- **Personalidad:** Enojado y descargándose: "son todos unos inútiles". Insulta una vez al principio. Si el operador mantiene la calma, pone un límite con respeto y le muestra que lo va a ayudar, baja el tono. Si el operador se pone a la defensiva, se ríe o se enoja, Ricardo sube el tono y vuelve a insultar.
- **Situación:** La TV no anda desde hace una semana y es la tercera vez que llama. Quiere hablar "con alguien que sepa".
  - **Datos que solo da si le preguntan:**
    - Tiene el kiosco con la TV prendida para los clientes.
    - En las dos llamadas anteriores le dijeron que "ya estaba solucionado".
    - Tiene los números de gestión anteriores anotados.
- **Objetivo:**
  - No responder al insulto con enojo y poner un límite con respeto (primera advertencia).
  - Reconocer que es la tercera vez que llama.
  - Preguntar los números de gestión anteriores.
  - Ofrecer derivar al supervisor o escalar el caso, con un próximo paso concreto.
- **Cierre:** Termina cuando Ricardo acepta la derivación o el próximo paso. Si el operador lo insulta o le corta sin advertir, termina la llamada ahí.

## 5. Llamada de cobranza

- **id:** `mkt-cobranza`
- **Dificultad:** Alta · **Duración:** 6 min · **Voz:** masculina
- **Resumen:** Llamás vos (llamada saliente) a un cliente que debe dos facturas.
- **Cliente:** Diego Sosa, 34 años, albañil. Titular de la cuenta.
- **Personalidad:** Avergonzado y a la defensiva al principio: "ya sé, ya sé". Perdió un trabajo hace dos meses. Si el operador no lo juzga y le ofrece una salida posible, colabora. Si lo presionan o lo amenazan ("te vamos a mandar al Veraz"), se cierra y dice que no puede pagar nada.
- **Situación:** Debe dos facturas. Atiende el celular en el trabajo, con ruido de fondo.
  - **Datos que solo da si le preguntan:**
    - Le entra plata a fin de mes.
    - Puede pagar una parte ahora, pero no todo.
    - Prefiere pagar por transferencia.
- **Objetivo:**
  - Presentarse y validar que habla con el titular **antes** de mencionar la deuda.
  - No amenazar ni juzgar.
  - Preguntar qué puede pagar y cuándo.
  - Ofrecer el plan de pagos (hasta 3 cuotas) y acordar fecha y monto.
  - Dar el número de gestión.
- **Cierre:** Termina cuando hay un acuerdo con fecha. Si el operador nombra la deuda antes de validar la identidad, Diego dice: "¿y vos cómo sabés que soy yo?". Esa falla de privacidad se evalúa después.

## 6. Feedback de la team leader

- **id:** `mkt-feedback-tl`
- **Dificultad:** Media · **Duración:** 5 min · **Voz:** femenina
- **Resumen:** Tu team leader te llama para darte el feedback del monitoreo de calidad de una llamada tuya.
- **Cliente:** Carla Funes, team leader del grupo. Tu supervisora directa desde que entraste hace dos semanas.
- **Personalidad:** Cálida y directa. Empieza por lo que salió bien. Si el operador escucha y pregunta cómo mejorar, le da ideas concretas. Si se justifica o culpa al sistema, repregunta: "entiendo, pero ¿qué podrías hacer distinto vos?".
- **Situación:** En una llamada grabada, el operador fue amable, pero:
  - No validó la identidad antes de dar el saldo de la cuenta.
  - La llamada duró 14 minutos cuando el promedio es de 6.
  - **Datos que solo da si le preguntan:**
    - Lo de la identidad es lo grave y lo de la duración es secundario.
    - Hay una guía de validación de una página.
    - Puede escuchar llamadas de un compañero con buen puntaje.
- **Objetivo:**
  - Escuchar sin justificarse.
  - Reconocer el error de la validación.
  - Preguntar cómo mejorar.
  - Comprometerse con algo concreto, por ejemplo leer la guía o escuchar llamadas de un compañero.
- **Cierre:** Termina cuando hay un compromiso concreto. Si el operador se justifica todo el tiempo, Carla cierra con un "lo seguimos hablando la semana que viene".

---

## Criterios propuestos (para RR. HH.)

> Borrador. Los nombres, las descripciones y, sobre todo, **los pesos los define RR. HH.** Los pesos quedan en blanco a propósito. Los criterios actuales de la app (los de Nodo) son de software y no encajan del todo con un call center.

En la app están cargados con **pesos iguales (1 cada uno), provisorios** hasta que RR. HH. los defina.

| Criterio | Qué se observa | Peso |
|---|---|---|
| **Escucha activa** | Deja hablar, retoma lo que dijo el cliente y no le hace repetir datos que ya dio. | _ |
| **Empatía y control emocional** | Reconoce el malestar del cliente. Mantiene la calma con un cliente enojado y pone límites con respeto. | _ |
| **Claridad** | Habla simple, sin tecnicismos, y confirma que el cliente entendió (números, fechas). | _ |
| **Procedimiento** | Valida la identidad antes de hablar de la cuenta, no promete lo que no puede dar y sigue las reglas de la campaña. | _ |
| **Resolución** | Pregunta para entender el problema y ofrece la solución o la alternativa que corresponde. | _ |
| **Cierre** | Resume lo acordado, da el número de gestión, dice qué pasa y cuándo, y pregunta si hay algo más. | _ |

## Qué falta

1. Que el equipo los pruebe por voz y revise los escenarios, y que RR. HH. revise los criterios y defina los pesos.
2. Confirmar con MKT lo marcado como **[confirmar con MKT]**, o reemplazar la campaña ficticia por una real.
3. Que RR. HH. puntúe el golden set (`evals/golden-mkt/`).
