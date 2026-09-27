# Implementation Plan: Clasificador KNN en Cascada

## Overview

Implementación minimalista de 3 archivos siguiendo el diseño: todo el backend en `app.py`
(Flask + los 3 datasets + `clasificar()` + un único endpoint `POST /api/knn` sin estado),
toda la lógica de interfaz en `static/main.js` (sliders, `fetch`, canvas, árbol) y la
estructura visual en `templates/index.html`. El plan avanza de forma incremental: primero la
lógica pura del backend (más sus tests de propiedades con Hypothesis), luego el endpoint, y
finalmente el frontend cableando la cascada, la visualización 2D y el panel de árbol.

Lenguaje de implementación: **Python** (backend, según el diseño) + **JavaScript/HTML/CSS**
(frontend). Los tests de propiedades usan **Hypothesis** con mínimo 100 iteraciones.

## Tasks

- [x] 1. Preparar estructura del proyecto y los 3 datasets
  - [x] 1.1 Crear la estructura base y los datasets en `app.py`
    - Crear `app.py` con la app Flask y las carpetas `static/` y `templates/`
    - Definir el diccionario `DATASETS` con claves `1`, `2`, `3`, cada una una lista de 20 tuplas `(x, y, "clase")`
    - Etapa 1: clases "Técnico" / "No técnico" (rangos: horas de pantalla 5–70, lenguajes 0–8)
    - Etapa 2: clases "Infraestructura/Sistemas" / "Desarrollo" / "Datos" (rangos: pref. -5–5, café 0–20)
    - Etapa 3: clases "Sysadmin" / "Redes" / "Seguridad" (rangos: horas servidores/redes 0–40, certificaciones 0–6)
    - _Requirements: 4.1, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [x] 2. Implementar la lógica de clasificación KNN
  - [x] 2.1 Escribir la función `clasificar(punto, dataset, k)`
    - Calcular la distancia Euclidiana `sqrt((x1-x2)^2 + (y1-y2)^2)` del punto a cada elemento del dataset
    - Ordenar por distancia ascendente y aplicar clamp `k_efectivo = min(k, len(dataset))`
    - Seleccionar los `k_efectivo` vecinos más cercanos y votar por mayoría
    - Desempate: si dos o más clases empatan en votos, elegir la clase del vecino más cercano entre las empatadas
    - Dataset vacío → devolver `clase = None`, `vecinos = []`
    - Devolver `(clase, [{"x":.., "y":.., "clase":..}, ...])`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 5.3_

  - [ ]* 2.2 Test de propiedad — clasificación correcta (k-más-cercanos + mayoría)
    - **Property 1: Clasificación correcta (k-más-cercanos euclidianos + mayoría)**
    - Etiqueta: `Feature: knn-cascade-classifier, Property 1`
    - Model-based: ordenar por distancia como referencia; verificar que los vecinos son los `min(k, len(dataset))` más cercanos y que `clase` es la mayoría presente en el dataset
    - Hypothesis, mínimo 100 iteraciones
    - **Validates: Requirements 3.1, 3.2, 3.3**

  - [ ]* 2.3 Test de propiedad — cantidad de vecinos = min(K, N)
    - **Property 3: Cantidad de vecinos = min(K, N)**
    - Etiqueta: `Feature: knn-cascade-classifier, Property 3`
    - Verificar que `len(vecinos) == min(k, N_efectivo)` para todo `K` y `N`, sin exceder los puntos disponibles
    - Hypothesis, mínimo 100 iteraciones
    - **Validates: Requirements 5.2, 5.3**

  - [ ]* 2.4 Test de propiedad — desempate por vecino más cercano
    - **Property 4: Desempate por vecino más cercano**
    - Etiqueta: `Feature: knn-cascade-classifier, Property 4`
    - Generadores que fuerzan empates de conteo de votos; verificar que la clase elegida es la empatada con el vecino de menor distancia
    - Hypothesis, mínimo 100 iteraciones
    - **Validates: Requirements 3.4**

- [x] 3. Implementar el endpoint único y su cableado
  - [x] 3.1 Crear el endpoint `POST /api/knn`
    - Leer el JSON `{etapa, x, y, k, n}` del cuerpo
    - Seleccionar `dataset = DATASETS[etapa][:n]` (primeros N puntos)
    - Llamar a `clasificar((x, y), dataset, k)` y devolver `{"clase": .., "vecinos": [..]}`
    - Sin estado compartido: la respuesta es función pura del cuerpo
    - Manejo de errores: `etapa` inválida (fuera de 1–3), JSON ausente o campos faltantes → HTTP 400 con `{"error": ..}`
    - _Requirements: 3.5, 4.3, 8.1_

  - [ ]* 3.2 Test de propiedad — los vecinos pertenecen a los primeros N puntos
    - **Property 2: Los vecinos pertenecen a los primeros N puntos**
    - Etiqueta: `Feature: knn-cascade-classifier, Property 2`
    - Verificar que cada vecino devuelto es uno de los primeros `N` puntos del dataset seleccionado
    - Hypothesis, mínimo 100 iteraciones
    - **Validates: Requirements 4.3**

  - [ ]* 3.3 Test de propiedad — ausencia de estado (idempotencia entre solicitudes)
    - **Property 5: Ausencia de estado (idempotencia entre solicitudes)**
    - Etiqueta: `Feature: knn-cascade-classifier, Property 5`
    - Emitir la misma petición dos veces (con otras peticiones intercaladas) debe producir respuestas idénticas
    - Hypothesis, mínimo 100 iteraciones
    - **Validates: Requirements 3.5, 8.1**

  - [ ]* 3.4 Tests de ejemplo del endpoint y bordes
    - Selección de dataset: un caso por `etapa` (1, 2, 3) y un caso de `etapa` inválida (HTTP 400)
    - Bordes: `n <= 0` (vecinos vacíos, clase `null`), `n` mayor que el dataset, `k` mayor que N
    - Caso de JSON ausente / campos faltantes → HTTP 400
    - _Requirements: 3.5, 4.3, 5.3, 8.1_

- [x] 4. Checkpoint — backend completo
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Construir la estructura HTML
  - [x] 5.1 Armar `templates/index.html`
    - 3 bloques de etapa, cada uno con su formulario de sliders y su `<canvas>`
    - Sliders con rangos correctos por variable (Etapa 1: 5–70 y 0–8; Etapa 2: -5–5 y 0–20; Etapa 3: 0–40 y 0–6)
    - Controles de N (1–20) y K (1–N) por etapa
    - Etapas 2 y 3 ocultas al inicio
    - Cargar `static/main.js`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 4.2, 5.1, 6.1_

  - [x] 5.2 Añadir el panel de árbol de clases en HTML
    - `div`s anidados fijos a la derecha con las 3 etapas y todas sus ramas de clase
    - _Requirements: 6.1_

- [x] 6. Implementar el dibujo en canvas
  - [x] 6.1 Escribir `renderEtapa(numEtapa, datos)` en `static/main.js`
    - Dibujar en el canvas de la etapa los puntos del dataset coloreados por clase
    - Dibujar el punto nuevo (definido por las dos variables de la etapa)
    - Dibujar líneas desde el punto nuevo hacia cada uno de los K vecinos devueltos
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ]* 6.2 Test de ejemplo (canvas) para `renderEtapa`
    - Verificar que emite las operaciones de dibujo esperadas (puntos, punto nuevo, líneas a vecinos) para un resultado dado
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 7. Cablear sliders, fetch y estado de la cascada
  - [x] 7.1 Añadir listeners `input` de los sliders → `fetch` a `/api/knn`
    - Declarar el estado `resultado1 / resultado2 / resultado3`
    - Al mover un slider, armar `{etapa, x, y, k, n}`, hacer `fetch("/api/knn", ..)`, guardar en `resultadoN` y llamar a `renderEtapa(N, datos)` y `actualizarUI()`
    - Si `fetch` falla o la respuesta no es OK, no actualizar `resultadoN` (dejar la interfaz en el estado anterior)
    - _Requirements: 10.1_

  - [x] 7.2 Implementar `actualizarUI()` — cascada y resultado final
    - `resultado1 === null` → etapas 2 y 3 ocultas
    - `resultado1 !== null` → mostrar etapa 2 (o finalizar y mostrar "No técnico" si la clase es "No técnico")
    - `resultado2 !== null` → mostrar etapa 3 solo si la clase es "Infraestructura/Sistemas"; si es "Desarrollo"/"Datos", finalizar mostrando ese resultado
    - Mostrar el resultado final cuando el flujo se detiene o cuando la etapa 3 termina
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 10.2_

  - [ ]* 7.3 Test de ejemplo (DOM) de la cascada
    - Estado `null/null` oculta etapas 2 y 3; con `resultado1` se muestra etapa 2; con `resultado1` + `resultado2` se muestra etapa 3
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 7.4 Ajuste automático de K al reducir N
    - Actualizar el rango máximo del control de K a N cuando N cambia
    - Si el K actual supera el nuevo N, ajustar K a N antes de recalcular
    - _Requirements: 5.1, 5.2_

- [x] 8. Actualizar el panel de árbol en tiempo real
  - [x] 8.1 Marcar nodo activo y atenuar ramas descartadas desde `actualizarUI()`
    - Agregar/quitar `.activo` sobre el nodo correspondiente al resultado de cada etapa
    - Atenuar con `.descartado` las ramas descartadas y las etapas no ejecutadas cuando la cascada se detiene
    - Actualizar en tiempo real cuando el resultado de una etapa cambia
    - _Requirements: 6.2, 6.3, 6.4, 6.5, 10.2_

- [x] 9. Estilos e interfaz minimalista
  - [x] 9.1 Añadir estilos CSS y alternador de tema
    - Layout simple y minimalista con el panel de árbol a la derecha
    - Estilos para nodos `.activo` y ramas `.descartado`
    - Tema claro y tema oscuro con un alternador (aplicado desde `main.js`)
    - _Requirements: 9.1, 9.2, 9.3_

- [x] 10. Checkpoint final — verificar arranque y tests
  - [x] 10.1 Verificar que la app arranca y responde
    - Arrancar Flask y comprobar que `GET /` sirve `index.html` y `POST /api/knn` responde a una petición de ejemplo por etapa
    - Confirmar aislamiento entre peticiones concurrentes mediante los tests automáticos (Property 5) en lugar de pruebas manuales
    - _Requirements: 8.1_

  - [x] 10.2 Checkpoint
    - Ensure all tests pass, ask the user if questions arise.

## Notes

- Las tareas marcadas con `*` son opcionales (tests) y pueden omitirse para un MVP más rápido.
- Cada tarea referencia criterios de aceptación específicos para trazabilidad.
- Los tests de propiedades (Hypothesis, ≥100 iteraciones) cubren las Properties 1–5 de la lógica
  pura del backend; la interfaz (canvas, cascada, árbol) se cubre con tests de ejemplo / DOM.
- La verificación de uso simultáneo (Req 8.1) se cubre con el test de propiedad de ausencia de
  estado (Property 5), evitando pruebas manuales de extremo a extremo.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "5.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "3.1", "5.2", "6.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "3.4", "6.2", "7.1", "8.1", "9.1"] },
    { "id": 4, "tasks": ["7.2", "7.4"] },
    { "id": 5, "tasks": ["7.3", "10.1"] },
    { "id": 6, "tasks": ["10.2"] }
  ]
}
```
