# Nodo Software: contexto enriquecido (BORRADOR)

> Datos ficticios para la demo. Nada de esto es información real de una empresa.
> Este archivo es un borrador para revisar. Todavía no está cargado en la app
> (la app usa `public/js/defaults.js`).

---

## 1. Empresa

Nodo Software es una software factory de San Miguel con 18 personas. Fue fundada hace seis años por Martín Sosa y Cecilia Arce, que empezaron haciendo sistemas de turnos para un consultorio de su familia.

Su producto principal es **TurnoFácil**, un sistema web de turnos para consultorios, peluquerías, barberías y otros negocios de servicios. Tiene unos 300 clientes, casi todos PyMEs de 1 a 5 empleados. El negocio se gana porque cada turno perdido es plata que pierde el cliente final.

### Equipo

| Persona | Rol | Qué resuelve |
|---|---|---|
| Martín Sosa | Líder técnico | Arquitectura, prioridades técnicas, aprobación de cambios grandes |
| Cecilia Arce | Dirección general | Decisiones de negocio, precios y relación con clientes grandes |
| Ignacio Duarte | Product owner | Prioridades de cada sprint y alcance de los pedidos de clientes |
| Ramiro Ibarra | Senior de pagos | Todo lo que toca Mercado Pago, señas y cobros. Único que toca `api/pagos` |
| Agustina Ferrari | Soporte (primer nivel) | Atiende a los clientes, reproduce problemas, escala a dev |
| Tomás Quiroga | Dev senior (backend) | Recordatorios, jobs, integración con WhatsApp |
| Julieta Peña | Dev (frontend) | Panel del negocio y página de reservas |

---

## 2. Producto: TurnoFácil

### Qué hace

- **Reservas online.** El cliente final reserva desde un enlace del negocio (Instagram, Google, WhatsApp).
- **Recordatorios.** 24 horas antes del turno, el sistema manda un mensaje por WhatsApp o email. El paciente responde 1 para confirmar o 2 para cancelar. Bajaron las ausencias un 30 % en promedio (dato ficticio de la demo).
- **Agenda del negocio.** Vista diaria y semanal, con bloqueos para descansos y feriados.
- **Señas.** Opcional. El negocio puede pedir una seña del 10 % al 50 % al reservar, cobrada con Mercado Pago. Ver sección 4.
- **Múltiples sucursales** (plan Clínica).

### Planes (precios ficticios, actualizados cada mes por inflación)

| Plan | Para quién | Incluye | Precio mensual (ejemplo) |
|---|---|---|---|
| Básico | Un profesional, un local | Agenda, reservas, recordatorios por email | $ 45.000 |
| Pro | Hasta 5 profesionales | Todo lo anterior + WhatsApp + señas | $ 89.000 |
| Clínica | Varias sucursales | Todo lo anterior + multisucursal + reportes | a convenir |

- Prueba gratis de 30 días, sin tarjeta.
- Facturación mensual. Se puede cambiar de plan en cualquier momento. El cambio se aplica al mes siguiente.
- Aviso de aumento: **siempre con 30 días de anticipación, por email y en el panel**. Este punto generó quejas en el último aumento (ver incidentes).

---

## 3. Cómo trabajamos (lo que el mentor necesita saber)

- Scrum con sprints de 2 semanas. Daily a las 9:30 (15 minutos). Tablero en Jira, proyecto TF.
- Ramas: `feature/TF-123` desde `develop`. Hotfix solo para prioridad 1.
- Definición de terminado: test del caso que falló, review de un senior y probado en staging.
- Deploys a producción martes y jueves a las 18 h.
- Commits y PRs en español.

---

## 4. Reglas de atención al cliente

### Quién decide qué

| Tipo de pedido | Quién responde | Plazo de respuesta |
|---|---|---|
| Cómo usar el sistema, dudas de agenda | Soporte (Agustina) | Mismo día hábil |
| Un turno que no aparece o un recordatorio que no sale | Soporte reproduce; si es bug, pasa a dev | Confirmar en 2 horas hábiles; fecha de fix solo si dev la estimó |
| Pagos, señas, cobros, devoluciones | Ramiro (senior de pagos) | Confirmar que recibió el caso en 2 horas; resolver en 48 horas hábiles |
| Cambios de precio o descuentos | Cecilia | No se prometen sin autorización |
| Pedidos de migración de datos grandes | Soporte + dev senior | Se estima antes de prometer fecha |

### Reglas de oro

1. **No prometer fechas sin estimar.** Lo que se dice al cliente es "lo reviso y te aviso a las 15". Una promesa sin estimar con el equipo genera más enojo que una demora.
2. **Avisar antes de que el cliente pregunte.** Si un problema afecta a varios clientes, el mensaje sale primero.
3. **Sin tecnicismos.** Los clientes son dueños de negocios que trabajan en el local, no técnicos. Se explica qué pasa, qué se está haciendo y cuándo habrá novedades.
4. **Nunca culpar a un compañero ni a otro proveedor delante del cliente.** Se dice "estamos revisando".
5. **Reconocer el impacto.** Si un paciente canceló por el error, eso es lo primero que se nombra.

---

## 5. Incidentes típicos (playbook)

Estos casos se usan para simulaciones y para que el mentor conozca la operación.

### 5.1 Recordatorios duplicados (Clínica Norte)
- **Síntoma:** pacientes reciben el recordatorio dos veces por WhatsApp.
- **Causa típica:** se corre el job en dos réplicas y el marcado de "enviado" llega tarde. Ver `jobs/recordatorios.js`.
- **Qué hacer:** no prometer fecha. Confirmar el impacto (cuántos pacientes, desde cuándo). Dev reproduce en staging. Se avisa cuando hay fix y se confirma con el cliente.
- **Qué no hacer:** tocar `api/pagos` ni desactivar recordatorios sin avisar al cliente.

### 5.2 Turno que no aparece (salón de peluquería)
- **Síntoma:** la clienta reservó online, tiene confirmación por mail, pero el turno no está en la agenda.
- **Causas típicas:** zona horaria mal configurada en el negocio, o turno cargado en otra sucursal.
- **Qué hacer:** pedir captura del mail de confirmación y el enlace de reserva. Revisar en el panel si el turno existe y en qué sucursal.

### 5.3 Pago aprobado, turno sin confirmar (centro de estética)
- **Síntoma:** Mercado Pago aprobó la seña pero el turno sigue pendiente.
- **Causa típica:** el webhook de Mercado Pago llegó tarde o se perdió.
- **Qué hacer:** escalar a Ramiro con el número de operación. **No prometer que se va a resolver en un plazo** hasta que Ramiro lo confirme. Informar al cliente que el dinero no se pierde y que se le avisa en 48 horas hábiles.

### 5.4 Baja por el aumento de precio (barbería)
- **Síntoma:** el cliente quiere cancelar porque el plan subió.
- **Qué hacer:** escuchar el motivo. Reconocer que el aviso llegó con poca anticipación (si ese fue el caso). Mostrar el plan Básico como alternativa. Descuentos solo si Cecilia los autorizó.
- **Qué no hacer:** prometer un descuento que no existe o amenazar con la baja de datos.

### 5.5 Migración de clientes desde una planilla (peluquería)
- **Síntoma:** el negocio quiere pasar 300 clientes de un Excel a TurnoFácil.
- **Qué hacer:** pedir la planilla de muestra. Revisar teléfonos sin código de área (se normalizan con el código de la zona). Clientes repetidos se unifican por teléfono. Estimar con dev senior antes de dar fecha.

### 5.6 Consultas sobre turnos repetidos en WhatsApp
- **Síntoma:** el cliente final responde 1 o 2, pero el sistema no lo registra.
- **Causa típica:** el mensaje llegó fuera de la ventana de 24 horas o con texto extra ("1 gracias").
- **Qué hacer:** explicar al negocio que el paciente puede llamar para confirmar. Registrar el caso para revisar el parser.

---

## 6. Clientes (cómo hablan)

- Son dueños de negocios chicos. Suelen atender mientras hacen otra cosa: cortan el pelo, atienden un paciente, cobran una mesa.
- Hablan en voseo, con frases cortas y muletillas ("mirá", "bueno", "a ver").
- Desconfían de lo que suena a tecnología y prefieren que les digan qué pasa con sus clientes, no cómo funciona el sistema.
- Usan WhatsApp como canal principal y el mail como respaldo.
- No conocen los procesos internos de Nodo: no saben quién decide qué, ni los plazos de soporte, ni cómo se hacen los deploys.

---

## 7. Lo que el mentor tiene que cuidar (junior)

- Antes de tocar `jobs/recordatorios.js`, entender que corre en 2 réplicas.
- Antes de tocar `api/pagos`, avisar a Ramiro: no se modifica sin un senior.
- Nunca usar datos reales de pacientes fuera de producción.
- Antes de abrir un PR, explicar qué cambia, por qué y cómo se probó.

---

## Pendiente antes de cargar en la app

- [x] Nombres revisados: no hay nombres repetidos en el set de Nodo (ver lista al final de este archivo).
- [ ] Redactar `docs/politica-reembolsos.md` y `docs/faq-clientes.md` para cargarlos como documentos.
- [ ] Revisar que los incidentes no contradigan los escenarios de la demo.
