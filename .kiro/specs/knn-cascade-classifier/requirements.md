# Requirements Document

## Introduction

El Clasificador KNN en Cascada es una aplicación web educativa que demuestra cómo un algoritmo de K-Vecinos Más Cercanos (KNN) puede encadenarse en una cascada de decisiones de tres etapas para clasificar el perfil de una persona. Cada etapa aplica un clasificador KNN independiente sobre dos variables propias, y el resultado de una etapa determina si la siguiente etapa se ejecuta.

La cascada modela una taxonomía de perfiles:

- **Etapa 1** clasifica entre "Técnico" y "No técnico".
- **Etapa 2** (solo si la Etapa 1 = "Técnico") clasifica entre "Infraestructura/Sistemas", "Desarrollo" y "Datos".
- **Etapa 3** (solo si la Etapa 2 = "Infraestructura/Sistemas") clasifica entre "Sysadmin", "Redes" y "Seguridad".

El cálculo KNN se realiza en un backend Flask sin estado compartido entre peticiones, de modo que varios usuarios puedan usar la aplicación de forma simultánea sin interferencia. La interfaz presenta controles interactivos (sliders) para las variables de entrada, el tamaño del dataset (N) y el valor de K por etapa, un panel de árbol de clases que resalta la rama activa, y una visualización 2D del espacio de características con los vecinos consultados.

## Glossary

- **Sistema**: La aplicación web completa del Clasificador KNN en Cascada (frontend más backend Flask).
- **Backend**: El servidor Flask que ejecuta el cálculo KNN y expone la API de clasificación.
- **Frontend**: La interfaz de usuario en el navegador que muestra controles, panel de árbol y visualización.
- **Clasificador_KNN**: El componente que calcula la distancia Euclidiana, selecciona los K vecinos más cercanos y determina la clase por votación mayoritaria.
- **Etapa**: Cada uno de los tres pasos de clasificación de la cascada. Etapa 1, Etapa 2 y Etapa 3.
- **Cascada**: La secuencia de etapas donde el resultado de una etapa habilita o detiene la ejecución de la siguiente.
- **Variable**: Una característica numérica de entrada. Cada etapa utiliza exactamente dos variables.
- **Punto_Nuevo**: El punto en el espacio 2D definido por las dos variables de entrada de la etapa activa, a clasificar.
- **Dataset_Base**: El conjunto precargado de 20 puntos etiquetados por etapa.
- **N**: Número de puntos precargados usados en el cálculo de una etapa, entre 1 y 20.
- **K**: Número de vecinos más cercanos considerados en la votación, entre 1 y N.
- **Distancia_Euclidiana**: La métrica de distancia usada sobre las dos variables de la etapa activa.
- **Panel_Arbol**: El diagrama fijo a la derecha que muestra las tres etapas y todas sus ramas.
- **Nodo_Activo**: El nodo del Panel_Arbol correspondiente al resultado actual de una etapa.
- **Visualizacion_2D**: El gráfico bidimensional que muestra el dataset, el Punto_Nuevo y las líneas hacia los K vecinos.
- **Tema**: El esquema visual de la interfaz, claro u oscuro.

## Requirements

### Requisito 1: Cascada de 3 etapas

**Historia de Usuario:** Como usuario, quiero que la clasificación se ejecute como una cascada condicional de tres etapas, para que solo se evalúen las etapas relevantes según el perfil detectado.

#### Criterios de Aceptación

1. THE Sistema SHALL ejecutar la Etapa 1 clasificando entre las clases "Técnico" y "No técnico".
2. WHEN el resultado de la Etapa 1 es "Técnico", THE Sistema SHALL ejecutar la Etapa 2 clasificando entre las clases "Infraestructura/Sistemas", "Desarrollo" y "Datos".
3. IF el resultado de la Etapa 1 es "No técnico", THEN THE Sistema SHALL finalizar la cascada y mostrar "No técnico" como resultado final.
4. WHEN el resultado de la Etapa 2 es "Infraestructura/Sistemas", THE Sistema SHALL ejecutar la Etapa 3 clasificando entre las clases "Sysadmin", "Redes" y "Seguridad".
5. IF el resultado de la Etapa 2 es "Desarrollo" o "Datos", THEN THE Sistema SHALL finalizar la cascada y mostrar el resultado de la Etapa 2 como resultado final.
6. WHEN la Etapa 3 se ejecuta, THE Sistema SHALL mostrar el resultado de la Etapa 3 como resultado final de la cascada.

### Requisito 2: Variables por etapa

**Historia de Usuario:** Como usuario, quiero controlar dos variables numéricas por cada etapa dentro de rangos definidos, para que pueda experimentar con distintos perfiles de entrada.

#### Criterios de Aceptación

1. THE Sistema SHALL exponer para la Etapa 1 la variable "horas de pantalla por semana" en el rango de 5 a 70.
2. THE Sistema SHALL exponer para la Etapa 1 la variable "lenguajes de programación conocidos" en el rango de 0 a 8.
3. THE Sistema SHALL exponer para la Etapa 2 la variable "preferencia infraestructura vs. desarrollo" en el rango de -5 a 5.
4. THE Sistema SHALL exponer para la Etapa 2 la variable "tazas de café por semana" en el rango de 0 a 20.
5. THE Sistema SHALL exponer para la Etapa 3 la variable "horas administrando servidores o redes por semana" en el rango de 0 a 40.
6. THE Sistema SHALL exponer para la Etapa 3 la variable "certificaciones técnicas" en el rango de 0 a 6.
7. IF un valor de variable recibido está fuera del rango definido, THEN THE Backend SHALL ajustar el valor al límite más cercano del rango antes de calcular.

### Requisito 3: Cálculo KNN

**Historia de Usuario:** Como usuario, quiero que la clasificación de cada etapa use KNN con distancia Euclidiana y votación mayoritaria, para que el resultado sea predecible y explicable.

#### Criterios de Aceptación

1. WHEN una etapa se ejecuta, THE Clasificador_KNN SHALL calcular la Distancia_Euclidiana entre el Punto_Nuevo y cada punto del dataset activo usando las dos variables de la etapa.
2. WHEN se han calculado las distancias, THE Clasificador_KNN SHALL seleccionar los K puntos con menor Distancia_Euclidiana como vecinos.
3. WHEN se han seleccionado los K vecinos, THE Clasificador_KNN SHALL asignar la clase por votación mayoritaria entre las clases de los K vecinos.
4. IF existe empate en la votación mayoritaria entre dos o más clases, THEN THE Clasificador_KNN SHALL asignar la clase del vecino más cercano al Punto_Nuevo.
5. THE Backend SHALL ejecutar el cálculo KNN sin compartir estado entre peticiones.

### Requisito 4: Dataset seleccionable

**Historia de Usuario:** Como usuario, quiero elegir cuántos puntos precargados se usan por etapa, para que pueda observar el efecto del tamaño del dataset en la clasificación.

#### Criterios de Aceptación

1. THE Sistema SHALL disponer de un Dataset_Base de 20 puntos etiquetados por cada etapa.
2. THE Sistema SHALL exponer un control por etapa para seleccionar N puntos precargados en el rango de 1 a 20.
3. WHEN el usuario selecciona un valor de N, THE Sistema SHALL usar los primeros N puntos del Dataset_Base de esa etapa en el cálculo.

### Requisito 5: K seleccionable

**Historia de Usuario:** Como usuario, quiero elegir el valor de K por etapa dentro de un rango válido, para que pueda ajustar la sensibilidad del clasificador.

#### Criterios de Aceptación

1. THE Sistema SHALL exponer un control de K por etapa con un rango dinámico de 1 a N.
2. WHEN el valor de N cambia, THE Sistema SHALL actualizar el rango máximo permitido del control de K a N.
3. IF el valor actual de K es mayor que N tras una reducción de N, THEN THE Sistema SHALL ajustar automáticamente K al valor de N.

### Requisito 6: Panel de árbol de clases

**Historia de Usuario:** Como usuario, quiero un panel de árbol con las tres etapas y sus ramas, para que pueda ver de un vistazo el camino de clasificación seguido.

#### Criterios de Aceptación

1. THE Panel_Arbol SHALL mostrar de forma fija a la derecha las tres etapas y todas sus ramas de clase.
2. WHEN una etapa produce un resultado, THE Panel_Arbol SHALL resaltar el Nodo_Activo correspondiente a esa clase.
3. WHEN una rama queda descartada por el resultado de una etapa, THE Panel_Arbol SHALL atenuar la rama descartada.
4. WHEN el resultado de una etapa cambia, THE Panel_Arbol SHALL actualizar el Nodo_Activo y las ramas atenuadas en tiempo real.
5. WHILE la cascada se ha detenido en una etapa, THE Panel_Arbol SHALL mantener atenuadas las etapas no ejecutadas.

### Requisito 7: Visualización 2D

**Historia de Usuario:** Como usuario, quiero una visualización 2D del espacio de características por etapa, para que pueda entender cómo se relacionan el punto nuevo y sus vecinos.

#### Criterios de Aceptación

1. THE Visualizacion_2D SHALL mostrar por etapa los puntos del dataset activo coloreados según su clase.
2. THE Visualizacion_2D SHALL mostrar el Punto_Nuevo definido por las dos variables de la etapa activa.
3. THE Visualizacion_2D SHALL mostrar líneas desde el Punto_Nuevo hacia cada uno de los K vecinos consultados.

### Requisito 8: Uso simultáneo

**Historia de Usuario:** Como usuario, quiero poder usar la aplicación al mismo tiempo que otros usuarios, para que mis cálculos no interfieran con los de otras personas.

#### Criterios de Aceptación

1. WHEN varios usuarios envían peticiones de clasificación de forma simultánea, THE Backend SHALL procesar cada petición de forma independiente sin interferencia entre cálculos.

### Requisito 9: Interfaz minimalista y tema

**Historia de Usuario:** Como usuario, quiero una interfaz minimalista con temas claro y oscuro, para que pueda usar la aplicación de forma cómoda según mi preferencia.

#### Criterios de Aceptación

1. THE Frontend SHALL presentar una interfaz minimalista.
2. THE Frontend SHALL ofrecer un Tema claro y un Tema oscuro.
3. WHEN el usuario selecciona un Tema, THE Frontend SHALL aplicar el Tema seleccionado a la interfaz.

### Requisito 10: Recálculo y re-render inmediato

**Historia de Usuario:** Como usuario, quiero que la clasificación y la visualización se actualicen al instante al mover cualquier control, para que pueda explorar los resultados de forma fluida.

#### Criterios de Aceptación

1. WHEN el usuario modifica el valor de cualquier slider, THE Sistema SHALL recalcular la clasificación sin reenviar el formulario completo.
2. WHEN el recálculo finaliza, THE Frontend SHALL re-renderizar la Visualizacion_2D y el Panel_Arbol de forma inmediata.
