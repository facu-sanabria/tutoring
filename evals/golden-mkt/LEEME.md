# Golden set de MKT (en armado)

Son conversaciones de prueba de los escenarios de call center de `docs/escenarios-mkt.md`, para medir si el evaluador de la app puntúa como puntuaría RR. HH.

## Qué hay y qué falta

- **Hay 9 conversaciones sintéticas** (`*.json`), escritas a mano para cubrir conductas distintas:
  - Validar o no la identidad.
  - Prometer lo que no se puede.
  - Insistir con una oferta.
  - Mantener la calma con un cliente que insulta.
  - Hablar de la deuda antes de validar.
  - Responder con monosílabos.
  - Pedirle al evaluador el puntaje máximo (caso de borde).
- **La `descripcion` de cada caso dice solo qué hace el candidato**, sin juzgar si está bien o mal.
- **Falta el `esperado` de todos los casos**: está en `null` a propósito. El rango esperado de cada criterio lo decide RR. HH., no quien escribió las conversaciones ni la IA. Si lo pusiéramos nosotros, el evaluador se estaría comparando contra nuestra propia opinión.

## Cómo se puntúa (para RR. HH.)

1. Abrir `planilla-rrhh.csv` en Excel o Google Sheets. Tiene una fila por caso y criterio.
2. **Dos personas puntúan cada caso por separado**, sin ver el puntaje de la otra. Ponen de 1 a 5 cada criterio, o `NO` si en esa conversación no se puede observar, y anotan la frase de la conversación que justifica el puntaje.
3. Después se juntan y acuerdan un **rango** por criterio (por ejemplo, de 3 a 4). Si estuvieron muy lejos (2 puntos o más), conviene revisar la descripción del criterio: probablemente no está clara.
4. Ese rango se pasa al campo `esperado` del JSON, con el mismo formato que `evals/transcripciones/01_excelente.json`.

Los criterios de la planilla son los propuestos en `docs/escenarios-mkt.md`. Si RR. HH. los cambia, hay que actualizar la planilla antes de puntuar.

## Lo que más falta

Las conversaciones sintéticas sirven para arrancar, pero un buen golden set tiene **entre 40 y 50 casos, la mayoría conversaciones reales** de un piloto con los chicos del programa (con su consentimiento y sin datos personales). Las sintéticas suelen ser más "prolijas" que las reales.

## Cómo correrlo (cuando esté listo)

Los casos usan `"empresa": "mkt"`, la empresa de ejemplo de `public/js/defaults.js`, y los `id` de sus escenarios. Las conversaciones arrancan como en la app: en las entrantes saluda primero el candidato y en la cobranza el cliente atiende con un "¿Hola?". Para correrlos:

```
python evals/run_evals.py evals/golden-mkt -n 3 --levantar-servidor
```

Mientras un caso no tenga `esperado`, el resumen muestra el puntaje, pero no dice si cae en el rango.
