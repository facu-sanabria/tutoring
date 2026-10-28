# Escenarios de simulación para Nodo Software, versión 2 (BORRADOR)

> Datos ficticios. Este archivo todavía no está cargado en la app.

## Principios de diseño

1. **Variedad de interlocutores.** Un compañero, un product owner, soporte, la directora y un cliente. Solo uno de los seis es cliente final.
2. **Complejidad real.** Cada escenario tiene un giro a mitad de la conversación (un dato nuevo, una contradicción, un cambio de situación).
3. **Información escondida.** Cada contraparte da datos clave solo si el candidato pregunta. Así se mide la curiosidad.
4. **Duración estimada, no fija.** La duración que se muestra es una estimación. La llamada dura lo que dure la situación: termina cuando se resuelve o cuando el interlocutor se cansa. Hay un tope de seguridad (ver pendientes).
5. **Una contraparte por escenario.** La app tiene una sola voz de IA por llamada. Las reuniones con tres o más personas quedan para una versión posterior.
6. **Briefing para el candidato.** Cada escenario tiene un resumen de la situación que ve el candidato antes de empezar. No revela el giro, la información escondida ni los criterios de evaluación, para que la simulación mida lo que tiene que medir.
7. **Criterios.** Cada escenario indica qué criterios de la propuesta de Jr observa. Todavía no están implementados ni validados con RRHH.

## Resumen

| # | Título | Interlocutor | Tipo | Duración estimada | Dificultad | Criterios que observa |
|---|---|---|---|---|---|---|
| 1 | Un compañero bloquea tu ticket | Tomás Quiroga (dev senior) | Daily / coordinación | 8 min | Media | Receptividad, Criterio y autonomía, Iniciativa, Escucha |
| 2 | Te piden meter tres features antes del cierre | Ignacio Duarte (product owner) | Reunión de planificación | 10 min | Alta | Criterio y autonomía, Claridad, Curiosidad, Cierre |
| 3 | Viernes 19:30: los recordatorios no salieron | Agustina Ferrari (soporte) | Incidente / guardia | 10 min | Alta | Criterio y autonomía, Claridad bajo presión, Escucha, Cierre |
| 4 | Feedback a una compañera sobre su PR | Julieta Peña (dev frontend) | Revisión 1:1 | 10 min | Media | Empatía, Claridad, Escucha, Cierre |
| 5 | La directora pide una estimación | Cecilia Arce (directora) | Llamada con dirección | 8 min | Alta | Curiosidad, Manejo de expectativas, Claridad, Cierre |
| 6 | La clínica pide una integración imposible | Dr. Ariel Montenegro (cliente) | Llamada con cliente | 10 min | Alta | Manejo de expectativas, Empatía, Criterio y autonomía, Cierre |

**Orden sugerido para la demo:** 2 (negociación), 3 (presión) y 6 (cliente). Los demás quedan para la práctica.

## Briefings para el candidato

1. **Un compañero bloquea tu ticket.** Estás en el daily del equipo de Nodo Software. Tu ticket de recordatorios depende de una revisión de Tomás Quiroga, dev senior de backend, que lleva dos días sin responder. El sprint cierra el viernes y necesitás destrabarlo hoy.

2. **Te piden meter tres features antes del cierre.** Ignacio Duarte, product owner de Nodo, te pide una reunión de planificación. Quiere sumar tres pedidos de clientes al sprint que cierra en dos días. Tenés que responderle qué entra, qué no y por qué.

3. **Viernes 19:30: los recordatorios no salieron.** Es viernes a la noche y sos el responsable de guardia. Agustina Ferrari, de soporte, te llama porque varios pacientes de clientes de TurnoFácil no recibieron el recordatorio de los turnos de mañana. Tenés que atender la llamada y decidir qué hacer.

4. **Feedback a una compañera sobre su PR.** Tenés una reunión 1:1 con Julieta Peña, dev frontend de Nodo. Revisaste su PR del panel del negocio y tenés comentarios para darle. Es una conversación de equipo, no una evaluación de desempeño.

5. **La directora pide una estimación.** Cecilia Arce, directora de Nodo, te llama en medio de otra reunión. Quiere saber si se puede migrar la base de pacientes de Clínica Norte antes de fin de mes. Todavía no tenés todos los datos.

6. **La clínica pide una integración imposible.** Ariel Montenegro, director médico de Clínica Norte y cliente de TurnoFácil desde hace dos años, te llama. Quiere conectar el sistema con su software de historias clínicas y dice que está evaluando otros proveedores.

## Detalle de cada escenario

### 1. Un compañero bloquea tu ticket
- **Briefing (lo que ve el candidato):** Estás en el daily del equipo de Nodo Software. Tu ticket de recordatorios depende de una revisión de Tomás Quiroga, dev senior de backend, que lleva dos días sin responder. El sprint cierra el viernes y necesitás destrabarlo hoy.
- **Situación (solo el cliente simulado):** Te acercás a su escritorio durante el daily para pedirle la revisión del PR de recordatorios.
- **Giro (min 4-5):** A mitad de la charla te dice que ya arregló el problema en otra rama, pero no lo comunicó.
- **Información escondida:** El PR tiene 240 líneas; Julieta podría revisar pero no conoce el módulo; tiene reunión con Martín a las 11.
- **Objetivo del candidato:** Desbloquear el ticket sin escalar ni culpar, acordar una revisión concreta y coordinar con quien ya tiene el cambio.
- **Condición de cierre (solo el cliente simulado):** Se resuelve cuando acuerdan quién revisa el PR y en qué plazo, o cuando el candidato propone algo concreto que Tomás puede aceptar. Si el candidato solo pide disculpas o insiste sin proponer nada, Tomás corta con un 'dale, después lo vemos'.

### 2. Te piden meter tres features antes del cierre
- **Briefing (lo que ve el candidato):** Ignacio Duarte, product owner de Nodo, te pide una reunión de planificación. Quiere sumar tres pedidos de clientes al sprint que cierra en dos días. Tenés que responderle qué entra, qué no y por qué.
- **Situación (solo el cliente simulado):** Pide sumar exportación a Excel de la agenda, recordatorio por SMS y zona horaria por sucursal.
- **Giro (min 4-5):** A los 5 minutos te cuenta que uno de los clientes que lo pidió canceló ayer, pero dirección igual quiere el cambio.
- **Información escondida:** El equipo tiene 30 horas disponibles; el sprint ya tiene cuatro tickets comprometidos; la zona horaria toca el módulo de recordatorios.
- **Objetivo del candidato:** Negociar el alcance con datos: explicar qué entra, qué no y por qué, sin decir que sí a todo ni cerrar con un no vacío.
- **Condición de cierre (solo el cliente simulado):** Se resuelve cuando acuerdan qué entra, qué queda para el siguiente sprint y qué hace falta para decidir lo demás. Si el candidato acepta todo sin análisis, Ignacio lo toma como bien pero pide confirmación por escrito. Si rechaza todo sin alternativas, insiste y la conversación queda abierta.

### 3. Viernes 19:30: los recordatorios no salieron
- **Briefing (lo que ve el candidato):** Es viernes a la noche y sos el responsable de guardia. Agustina Ferrari, de soporte, te llama porque varios pacientes de clientes de TurnoFácil no recibieron el recordatorio de los turnos de mañana. Tenés que atender la llamada y decidir qué hacer.
- **Situación (solo el cliente simulado):** Llama al responsable de guardia por un problema con los recordatorios de la noche.
- **Giro (min 4-5):** A los 4 minutos aparece que hubo un deploy a las 18 h que tocó el worker, y Martín no atiende el teléfono.
- **Información escondida:** El worker corre en dos réplicas; hay turnos el sábado a la mañana; el rollback está documentado pero nadie lo probó.
- **Objetivo del candidato:** Triagear el incidente, decidir un primer paso reversible, avisar a quien corresponde y dejar un registro. No improvisar un arreglo en producción.
- **Condición de cierre (solo el cliente simulado):** Se resuelve cuando hay un primer paso concreto (quién hace qué, en cuánto tiempo y cómo se avisa a los clientes afectados). Si el candidato promete arreglar todo sin revisar el impacto, Agustina lo marca y pide una reunión con Martín; la llamada termina con un plan incompleto.

### 4. Feedback a una compañera sobre su PR
- **Briefing (lo que ve el candidato):** Tenés una reunión 1:1 con Julieta Peña, dev frontend de Nodo. Revisaste su PR del panel del negocio y tenés comentarios para darle. Es una conversación de equipo, no una evaluación de desempeño.
- **Situación (solo el cliente simulado):** Tenés que hablar de un bug de zona horaria (la fecha se muestra en UTC), dos componentes sin etiquetas para lectores de pantalla y una variable con nombre confuso.
- **Giro (min 4-5):** A mitad de la revisión te cuenta que Martín le pidió el PR con apuro y que ella ya lo había avisado.
- **Información escondida:** El bug apareció en un negocio de Ushuaia; la accesibilidad es requisito de la página de reservas.
- **Objetivo del candidato:** Dar feedback específico y constructivo, separar lo urgente de lo opcional, escuchar la justificación y acordar qué cambia y cuándo.
- **Condición de cierre (solo el cliente simulado):** Se resuelve cuando Julieta entiende los problemas y acuerdan cuáles son obligatorios y para cuándo. Si el candidato critica a la persona en vez del código, Julieta se cierra y la conversación termina sin acuerdos.

### 5. La directora pide una estimación
- **Briefing (lo que ve el candidato):** Cecilia Arce, directora de Nodo, te llama en medio de otra reunión. Quiere saber si se puede migrar la base de pacientes de Clínica Norte antes de fin de mes. Todavía no tenés todos los datos.
- **Situación (solo el cliente simulado):** Te llama para pedir una estimación de la migración de Clínica Norte.
- **Giro (min 4-5):** A los 5 minutos te dice que el cliente agregó dos sucursales más y quiere saber el costo.
- **Información escondida:** La planilla tiene cuatro formatos de teléfono; hay unos 300 duplicados aproximados; nadie hizo una migración de este tamaño antes.
- **Objetivo del candidato:** Responder con una estimación con rango y nivel de confianza, explicar supuestos y riesgos, y decir qué información falta y cuándo se consigue.
- **Condición de cierre (solo el cliente simulado):** Se resuelve cuando tiene un rango con supuestos y lo que falta. Si el candidato da una fecha sin rango, Cecilia la pide de nuevo; si cede a todo sin análisis, lo dice y corta.

### 6. La clínica pide una integración imposible
- **Briefing (lo que ve el candidato):** Ariel Montenegro, director médico de Clínica Norte y cliente de TurnoFácil desde hace dos años, te llama. Quiere conectar el sistema con su software de historias clínicas y dice que está evaluando otros proveedores.
- **Situación (solo el cliente simulado):** Te llama para plantear la integración con su software de historias clínicas, que no tiene API pública.
- **Giro (min 4-5):** A los 5 minutos menciona que otro proveedor ya le contestó que sí a la integración.
- **Información escondida:** Manejan datos de salud (sensibles); el contrato actual vence en 60 días; el otro proveedor no sabe qué datos se van a intercambiar.
- **Objetivo del candidato:** Mantener la relación sin prometer lo que no se puede, explicar qué sí es posible, derivar a dirección y proponer un próximo paso con fecha.
- **Condición de cierre (solo el cliente simulado):** Se resuelve cuando hay un próximo paso concreto (reunión con dirección y fecha de respuesta). Si el candidato promete la integración, pide confirmación por escrito. Si dice que no sin ofrecer nada, el doctor termina la llamada anunciando el cambio de proveedor.

## Pendientes antes de cargar

- [ ] Implementar el cierre por resolución y el tope de seguridad. Hoy el motor de Gemini Live no tiene corte por tiempo: la llamada termina cuando el cliente simulado llama a colgar. Ver `prompt-duracion-y-cierre.md`.
- [ ] Corregir: el límite de `duración × 60 + 180` solo aplica al camino de Vapi, que no vamos a usar.
- [ ] Verificar que el briefing aparece completo en la pantalla previa a la llamada.
- [ ] Decidir si el escenario 3 se usa con candidatos junior o solo con perfiles de guardia.
- [ ] Validar con RRHH que los criterios de cada escenario tienen sentido.

## Control de nombres

Personas del set de Nodo (equipo más clientes de los escenarios): Martín Sosa, Cecilia Arce, Ramiro Ibarra, Agustina Ferrari, Tomás Quiroga, Julieta Peña, Ignacio Duarte, Ariel Montenegro, Laura Méndez, Diego Paz, Marta Ríos.
Sin nombres ni apellidos repetidos.

## JSON para cargar (cuando lo aprobemos)

```json
[
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
]
```
