"""Clasificador KNN en Cascada — backend Flask minimalista.

Todo el backend vive en este único archivo (según el diseño):
- El diccionario ``DATASETS`` con los 3 datasets precargados (20 puntos por etapa).
- (Próximas tareas) la función ``clasificar()`` y el endpoint ``POST /api/knn``.

Estructura del proyecto (3 archivos):
- ``app.py``               -> Flask + datasets + clasificar() + endpoint
- ``static/main.js``       -> sliders, fetch, canvas, árbol
- ``templates/index.html`` -> 3 formularios + 3 canvas + panel del árbol
"""

import os
import random
import sqlite3
from datetime import datetime, timezone
from math import hypot

from flask import Flask, g, jsonify, render_template, request

app = Flask(__name__)

# Ruta del archivo SQLite (junto a app.py). Guarda los puntajes del modo desafío.
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "puntajes.db")


# ---------------------------------------------------------------------------
# Datasets precargados: 20 puntos etiquetados por etapa.
#
# Cada dataset es una lista de 20 tuplas ``(x, y, "clase")``. Los puntos están
# agrupados (clustering) por clase dentro de los rangos definidos para que la
# clasificación KNN sea significativa.
# ---------------------------------------------------------------------------
DATASETS = {
    # ------------------------------------------------------------------
    # Etapa 1: "Técnico" / "No técnico"
    #   x = horas de pantalla por semana (5–70)
    #   y = lenguajes de programación conocidos (0–8)
    # Técnico -> muchas horas de pantalla y varios lenguajes (arriba-derecha).
    # No técnico -> pocas horas de pantalla y pocos/ningún lenguaje (abajo-izq).
    # ------------------------------------------------------------------
    1: [
        # No técnico (10 puntos): pocas horas, 0–2 lenguajes
        (8.0, 0.0, "No técnico"),
        (12.0, 1.0, "No técnico"),
        (15.0, 0.0, "No técnico"),
        (18.0, 1.0, "No técnico"),
        (10.0, 2.0, "No técnico"),
        (20.0, 1.0, "No técnico"),
        (14.0, 0.0, "No técnico"),
        (22.0, 2.0, "No técnico"),
        (16.0, 1.0, "No técnico"),
        (25.0, 0.0, "No técnico"),
        # Técnico (10 puntos): muchas horas, 4–8 lenguajes
        (50.0, 5.0, "Técnico"),
        (55.0, 6.0, "Técnico"),
        (60.0, 7.0, "Técnico"),
        (48.0, 4.0, "Técnico"),
        (65.0, 8.0, "Técnico"),
        (58.0, 6.0, "Técnico"),
        (52.0, 5.0, "Técnico"),
        (62.0, 7.0, "Técnico"),
        (45.0, 4.0, "Técnico"),
        (70.0, 8.0, "Técnico"),
    ],
    # ------------------------------------------------------------------
    # Etapa 2: "Infraestructura/Sistemas" / "Desarrollo" / "Datos"
    #   x = horas/semana configurando servidores/redes/infraestructura (0–40)
    #   y = horas/semana analizando datos / estadística / ML (0–40)
    # Cada clase ocupa una zona distinta del plano 2D (KNN interpretable):
    #   Infraestructura -> x alto, y bajo (mucha infra, poco análisis de datos).
    #   Datos           -> x bajo, y alto (mucho análisis de datos, poca infra).
    #   Desarrollo      -> x bajo, y bajo (escribe apps; ni infra ni datos).
    # ------------------------------------------------------------------
    2: [
        # Infraestructura/Sistemas (7 puntos): x alto, y bajo
        (34.0, 4.0, "Infraestructura/Sistemas"),
        (38.0, 6.0, "Infraestructura/Sistemas"),
        (36.0, 3.0, "Infraestructura/Sistemas"),
        (40.0, 5.0, "Infraestructura/Sistemas"),
        (33.0, 7.0, "Infraestructura/Sistemas"),
        (37.0, 4.0, "Infraestructura/Sistemas"),
        (35.0, 6.0, "Infraestructura/Sistemas"),
        # Datos (7 puntos): x bajo, y alto
        (4.0, 34.0, "Datos"),
        (6.0, 38.0, "Datos"),
        (3.0, 36.0, "Datos"),
        (5.0, 40.0, "Datos"),
        (7.0, 33.0, "Datos"),
        (4.0, 37.0, "Datos"),
        (6.0, 35.0, "Datos"),
        # Desarrollo (6 puntos): x bajo, y bajo (zona cerca del origen)
        (5.0, 5.0, "Desarrollo"),
        (7.0, 4.0, "Desarrollo"),
        (4.0, 7.0, "Desarrollo"),
        (6.0, 6.0, "Desarrollo"),
        (3.0, 4.0, "Desarrollo"),
        (7.0, 7.0, "Desarrollo"),
    ],
    # ------------------------------------------------------------------
    # Etapa 3: "Sysadmin" / "Redes" / "Seguridad"
    #   x = horas administrando servidores o redes por semana (0–40)
    #   y = certificaciones técnicas (0–6)
    # Sysadmin -> muchas horas, certificaciones medias.
    # Redes -> horas medias, certificaciones bajas.
    # Seguridad -> horas medias-bajas, certificaciones altas.
    # ------------------------------------------------------------------
    3: [
        # Sysadmin (7 puntos): muchas horas, certificaciones medias
        (35.0, 3.0, "Sysadmin"),
        (38.0, 2.0, "Sysadmin"),
        (40.0, 3.0, "Sysadmin"),
        (34.0, 2.0, "Sysadmin"),
        (37.0, 4.0, "Sysadmin"),
        (39.0, 3.0, "Sysadmin"),
        (36.0, 2.0, "Sysadmin"),
        # Redes (7 puntos): horas medias, certificaciones bajas
        (18.0, 1.0, "Redes"),
        (20.0, 0.0, "Redes"),
        (16.0, 1.0, "Redes"),
        (22.0, 0.0, "Redes"),
        (19.0, 1.0, "Redes"),
        (21.0, 0.0, "Redes"),
        (17.0, 1.0, "Redes"),
        # Seguridad (6 puntos): horas medias-bajas, certificaciones altas
        (10.0, 6.0, "Seguridad"),
        (12.0, 5.0, "Seguridad"),
        (8.0, 6.0, "Seguridad"),
        (11.0, 5.0, "Seguridad"),
        (9.0, 6.0, "Seguridad"),
        (13.0, 5.0, "Seguridad"),
    ],
}


# ---------------------------------------------------------------------------
# Lógica de clasificación KNN (única lógica de negocio del backend).
# ---------------------------------------------------------------------------
def clasificar(punto, dataset, k):
    """Clasifica ``punto`` con KNN sobre ``dataset`` usando ``k`` vecinos.

    Args:
        punto: Tupla ``(x, y)`` del punto nuevo a clasificar.
        dataset: Lista de tuplas ``(x, y, "clase")``.
        k: Número de vecinos solicitados.

    Returns:
        Tupla ``(clase, vecinos)`` donde ``vecinos`` es una lista de dicts
        ``{"x": .., "y": .., "clase": ..}`` con los ``min(k, len(dataset))``
        puntos más cercanos (ordenados por distancia ascendente). Si el
        dataset está vacío, devuelve ``(None, [])``.

    La clase se asigna por votación mayoritaria entre los vecinos. En caso de
    empate en votos entre dos o más clases, gana la clase cuyo vecino más
    cercano (de menor distancia) es el más próximo al punto.
    """
    px, py = punto

    # Dataset vacío -> sin clase ni vecinos (Req 5.3, borde N <= 0).
    if not dataset:
        return None, []

    # Distancia Euclidiana del punto a cada elemento (Req 3.1).
    distancias = [
        (hypot(px - x, py - y), x, y, clase) for (x, y, clase) in dataset
    ]

    # Ordenar por distancia ascendente (Req 3.2).
    distancias.sort(key=lambda d: d[0])

    # Clamp de k a los puntos disponibles y selección de los k más cercanos.
    k_efectivo = min(k, len(dataset))
    vecinos_orden = distancias[:k_efectivo]

    # Votación por mayoría (Req 3.3). Como ``vecinos_orden`` ya está ordenado
    # por distancia ascendente, el desempate por vecino más cercano (Req 3.4)
    # se resuelve prefiriendo la clase cuyo primer (más cercano) vecino aparece
    # antes en el recorrido.
    conteo = {}
    primer_orden = {}
    for indice, (_dist, _x, _y, clase) in enumerate(vecinos_orden):
        conteo[clase] = conteo.get(clase, 0) + 1
        if clase not in primer_orden:
            primer_orden[clase] = indice

    # Máximo de votos; empate resuelto por menor posición del vecino más cercano.
    clase = min(
        conteo,
        key=lambda c: (-conteo[c], primer_orden[c]),
    )

    vecinos = [{"x": x, "y": y, "clase": c} for (_dist, x, y, c) in vecinos_orden]
    return clase, vecinos


# ---------------------------------------------------------------------------
# Selección equitativa de N puntos entre clases.
# ---------------------------------------------------------------------------
def seleccionar_n(dataset, n):
    """Devuelve ``n`` puntos del ``dataset`` repartidos equitativamente por clase.

    En lugar de tomar los primeros ``n`` puntos (que, al estar el dataset
    agrupado por clase, dejaría fuera a clases enteras cuando ``n`` es bajo),
    reparte ``n`` entre las clases presentes de forma equilibrada (round-robin):
    a cada clase le toca ``n // num_clases`` puntos y el resto ``n % num_clases``
    se asigna uno a uno a las primeras clases. Se conserva el orden de aparición
    de las clases y, dentro de cada clase, el orden original del dataset.

    Con ``n`` mayor o igual al total, devuelve el dataset completo. Con ``n <= 0``
    devuelve lista vacía.
    """
    if n <= 0 or not dataset:
        return []

    # Agrupar índices por clase, preservando el orden de primera aparición.
    orden_clases = []
    por_clase = {}
    for punto in dataset:
        clase = punto[2]
        if clase not in por_clase:
            por_clase[clase] = []
            orden_clases.append(clase)
        por_clase[clase].append(punto)

    # Cuántos puntos por clase: base + 1 para las primeras (n % num_clases).
    num_clases = len(orden_clases)
    base, extra = divmod(n, num_clases)
    cupos = {
        clase: base + (1 if i < extra else 0)
        for i, clase in enumerate(orden_clases)
    }

    seleccion = []
    for clase in orden_clases:
        seleccion.extend(por_clase[clase][: cupos[clase]])

    # No exceder el dataset (si alguna clase tenía menos puntos que su cupo, ya
    # quedó limitada por el slicing anterior).
    return seleccion[:n]


# ---------------------------------------------------------------------------
# Generación de "personas" aleatorias para el modo juego.
#
# Cada recarga de la página pide una persona nueva para cada etapa. Para que el
# juego tenga siempre una respuesta clara, la persona se genera eligiendo una
# clase al azar y luego un punto dentro de la zona de esa clase (tomando un
# punto base del dataset de esa clase y añadiendo una pequeña dispersión). Así
# KNN casi siempre coincide con la zona de la que se generó.
#
# Además del punto (x, y), la persona lleva un perfil ficticio (nombre, edad) y
# una descripción en una sola línea que redacta sus features de forma legible.
# ---------------------------------------------------------------------------
NOMBRES = [
    "Ana", "Luis", "María", "Carlos", "Sofía", "Diego", "Lucía", "Javier",
    "Valentina", "Andrés", "Camila", "Mateo", "Paula", "Tomás", "Elena",
    "Nicolás", "Daniela", "Sebastián", "Isabela", "Martín",
]
APELLIDOS = [
    "García", "Rodríguez", "Martínez", "López", "Gómez", "Pérez", "Sánchez",
    "Ramírez", "Torres", "Flores", "Rivera", "Vargas", "Castro", "Romero",
    "Herrera", "Medina", "Ríos", "Cruz", "Morales", "Ortega",
]


def _descripcion_persona(etapa, x, y):
    """Redacta en una sola línea las features (x, y) de la persona por etapa."""
    if etapa == 1:
        return (
            f"pasa {x} horas por semana frente a la pantalla y "
            f"conoce {y} lenguajes de programación"
        )
    if etapa == 2:
        return (
            f"dedica {x} horas por semana a infraestructura y "
            f"{y} horas por semana a datos / ML"
        )
    return (
        f"administra servidores o redes {x} horas por semana y "
        f"tiene {y} certificaciones técnicas"
    )


# Hojas del árbol de decisión y la ruta de clases (por etapa) que lleva a cada
# una. Al generar una persona se elige una hoja al azar; esto fija qué clase
# debe dar cada etapa, para que las features de las 3 etapas sean coherentes
# entre sí (una sola persona recorriendo la cascada completa).
#
#   Etapa 1: "No técnico" (hoja) | "Técnico" -> etapa 2
#   Etapa 2: "Desarrollo"/"Datos" (hojas) | "Infraestructura/Sistemas" -> etapa 3
#   Etapa 3: "Sysadmin"/"Redes"/"Seguridad" (hojas)
RUTAS_HOJA = {
    "No técnico": {1: "No técnico"},
    "Desarrollo": {1: "Técnico", 2: "Desarrollo"},
    "Datos": {1: "Técnico", 2: "Datos"},
    "Sysadmin": {1: "Técnico", 2: "Infraestructura/Sistemas", 3: "Sysadmin"},
    "Redes": {1: "Técnico", 2: "Infraestructura/Sistemas", 3: "Redes"},
    "Seguridad": {1: "Técnico", 2: "Infraestructura/Sistemas", 3: "Seguridad"},
}


def _features_en_zona(etapa, clase):
    """Genera features enteras (x, y) dentro de la zona de ``clase`` en ``etapa``.

    Toma un punto del dataset de esa clase como centro y le suma una dispersión
    pequeña, recortando al rango entero visible de la etapa.
    """
    dataset = DATASETS[etapa]
    candidatos = [p for p in dataset if p[2] == clase]
    cx, cy, _ = random.choice(candidatos)

    xs = [p[0] for p in dataset]
    ys = [p[1] for p in dataset]
    x_min, x_max = min(xs), max(xs)
    y_min, y_max = min(ys), max(ys)

    x = int(max(x_min, min(x_max, round(cx + random.uniform(-2, 2)))))
    y = int(max(y_min, min(y_max, round(cy + random.uniform(-2, 2)))))
    return x, y


def generar_persona():
    """Genera UNA persona coherente para toda la cascada.

    Elige una hoja del árbol al azar (p. ej. "Seguridad") y deriva las features
    de cada etapa dentro de la zona de la clase que corresponde en esa ruta, de
    modo que la cascada de KNN lleve a esa hoja. Devuelve un dict con nombre,
    edad, las features por etapa (``etapas[1..3] = {x, y}``, solo las etapas que
    la persona recorre) y una ``descripcion`` de una sola línea que reúne todas
    las features.
    """
    hoja = random.choice(list(RUTAS_HOJA))
    ruta = RUTAS_HOJA[hoja]

    etapas = {}
    for etapa, clase in ruta.items():
        x, y = _features_en_zona(etapa, clase)
        etapas[etapa] = {"x": x, "y": y}

    nombre = f"{random.choice(NOMBRES)} {random.choice(APELLIDOS)}"
    edad = random.randint(18, 60)

    # Descripción de una sola línea: reúne las features de todas las etapas que
    # la persona recorre, en orden.
    partes = [_descripcion_persona(e, etapas[e]["x"], etapas[e]["y"]) for e in sorted(etapas)]
    descripcion = "; ".join(partes)

    return {
        "nombre": nombre,
        "edad": edad,
        "etapas": {str(e): v for e, v in etapas.items()},
        "descripcion": descripcion,
    }


# ---------------------------------------------------------------------------
# Rutas Flask.
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    """Sirve la página principal (interfaz de la cascada)."""
    return render_template("index.html")


@app.route("/api/knn", methods=["POST"])
def api_knn():
    """Endpoint único de clasificación KNN.

    Cuerpo (JSON): ``{etapa, x, y, k, n}``. Selecciona el dataset por ``etapa``,
    usa solo los primeros ``n`` puntos (Req 4.3) y delega en ``clasificar()``.
    La respuesta es función pura del cuerpo, sin estado compartido (Req 3.5, 8.1).

    Errores (HTTP 400 con ``{"error": ..}``): JSON ausente, campos faltantes o
    ``etapa`` fuera de 1–3.
    """
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"error": "Cuerpo JSON ausente o inválido"}), 400

    # Validar presencia de todos los campos requeridos.
    faltantes = [campo for campo in ("etapa", "x", "y", "k", "n") if campo not in body]
    if faltantes:
        return jsonify({"error": f"Campos faltantes: {', '.join(faltantes)}"}), 400

    # ``etapa`` debe estar en 1–3. Las claves de DATASETS son enteros; normalizamos
    # para tolerar un entero recibido como int o como string numérica.
    etapa = body["etapa"]
    try:
        etapa = int(etapa)
    except (TypeError, ValueError):
        return jsonify({"error": "etapa inválida (debe ser 1, 2 o 3)"}), 400
    if etapa not in DATASETS:
        return jsonify({"error": "etapa inválida (debe ser 1, 2 o 3)"}), 400

    # N puntos del dataset repartidos equitativamente entre clases (Req 4.3).
    dataset = seleccionar_n(DATASETS[etapa], body["n"])
    clase, vecinos = clasificar((body["x"], body["y"]), dataset, body["k"])

    # Devolver también los N puntos usados para que el frontend pueda dibujar
    # el dataset completo (no solo los vecinos), incluso antes de mover el
    # punto nuevo. Los vecinos siguen destacándose con líneas en el canvas.
    puntos = [{"x": x, "y": y, "clase": c} for (x, y, c) in dataset]
    return jsonify({"clase": clase, "vecinos": vecinos, "puntos": puntos})


@app.route("/api/persona", methods=["GET"])
def api_persona():
    """Genera UNA persona coherente para toda la cascada (modo juego).

    Devuelve nombre, edad, las features por etapa (``etapas``) y una
    ``descripcion`` de una sola línea. Cada llamada (p. ej. al recargar la
    página) produce una persona distinta, evitando que se repita entre usuarios.
    """
    return jsonify(generar_persona())


# ===========================================================================
# MODO DESAFÍO (competitivo)
# ===========================================================================
#
# El desafío usa datasets con MÁS puntos y con RUIDO en las fronteras entre
# clases, y genera personas cerca de esos bordes. Así el valor de K importa de
# verdad: con K=1 un vecino ruidoso puede arrastrar la clasificación, mientras
# que un K mayor promedia y corrige. El usuario elige K y adivina la clase; el
# acierto se evalúa contra lo que KNN da con el K elegido.
#
# Los datasets del desafío se derivan de los mismos clusters de DATASETS, pero
# se densifican (más puntos por clase, con dispersión) y se les añaden algunos
# outliers cerca de la frontera. Se generan una sola vez al importar el módulo,
# con una semilla fija para que sean estables entre reinicios.
# ---------------------------------------------------------------------------
def _construir_datasets_desafio(semilla=1234):
    rng = random.Random(semilla)
    datasets = {}
    for etapa, base in DATASETS.items():
        clases = sorted({p[2] for p in base})
        xs = [p[0] for p in base]
        ys = [p[1] for p in base]
        x_min, x_max = min(xs), max(xs)
        y_min, y_max = min(ys), max(ys)

        puntos = []
        # Densificar cada clase: por cada punto base, generar varias muestras
        # con dispersión gaussiana alrededor (más puntos = KNN más significativo).
        for (bx, by, clase) in base:
            for _ in range(3):
                nx = round(bx + rng.gauss(0, (x_max - x_min) * 0.04))
                ny = round(by + rng.gauss(0, (y_max - y_min) * 0.04))
                nx = int(max(x_min, min(x_max, nx)))
                ny = int(max(y_min, min(y_max, ny)))
                puntos.append((float(nx), float(ny), clase))

        # Ruido de frontera: unos pocos puntos con la etiqueta de una clase pero
        # ubicados hacia el centroide de OTRA clase (outliers). Esto crea zonas
        # donde K=1 falla y un K mayor acierta.
        centroides = {}
        for clase in clases:
            cxs = [p[0] for p in base if p[2] == clase]
            cys = [p[1] for p in base if p[2] == clase]
            centroides[clase] = (sum(cxs) / len(cxs), sum(cys) / len(cys))

        for clase in clases:
            otras = [c for c in clases if c != clase]
            for _ in range(5):
                destino = rng.choice(otras)
                cx, cy = centroides[clase]
                dx, dy = centroides[destino]
                # Punto bien metido hacia la otra clase, etiquetado como la
                # clase original (outlier que "invade" la frontera). Cuanto más
                # cerca del centroide ajeno, más probable que un K=1 lo tome.
                t = rng.uniform(0.5, 0.75)
                nx = int(max(x_min, min(x_max, round(cx + (dx - cx) * t))))
                ny = int(max(y_min, min(y_max, round(cy + (dy - cy) * t))))
                puntos.append((float(nx), float(ny), clase))

        datasets[etapa] = puntos
    return datasets


DATASETS_DESAFIO = _construir_datasets_desafio()


def generar_persona_desafio():
    """Genera una persona del desafío ubicada CERCA de una frontera.

    Igual que ``generar_persona`` elige una hoja coherente, pero coloca las
    features de cada etapa cerca del borde entre la clase objetivo y una clase
    vecina (mayor dispersión), de modo que la elección de K sea determinante.
    """
    hoja = random.choice(list(RUTAS_HOJA))
    ruta = RUTAS_HOJA[hoja]

    etapas = {}
    for etapa, clase in ruta.items():
        base = DATASETS[etapa]
        clases = sorted({p[2] for p in base})
        xs = [p[0] for p in base]
        ys = [p[1] for p in base]
        x_min, x_max = min(xs), max(xs)
        y_min, y_max = min(ys), max(ys)

        cxs = [p[0] for p in base if p[2] == clase]
        cys = [p[1] for p in base if p[2] == clase]
        cx, cy = sum(cxs) / len(cxs), sum(cys) / len(cys)

        # Empujar el punto un poco hacia otra clase (hacia la frontera) para que
        # quede en zona disputada, pero sin cruzar del todo.
        otras = [c for c in clases if c != clase]
        if otras:
            destino = random.choice(otras)
            dxs = [p[0] for p in base if p[2] == destino]
            dys = [p[1] for p in base if p[2] == destino]
            dx, dy = sum(dxs) / len(dxs), sum(dys) / len(dys)
            t = random.uniform(0.35, 0.48)  # bien cerca del borde disputado
            cx = cx + (dx - cx) * t
            cy = cy + (dy - cy) * t

        x = int(max(x_min, min(x_max, round(cx + random.uniform(-1.5, 1.5)))))
        y = int(max(y_min, min(y_max, round(cy + random.uniform(-1.5, 1.5)))))
        etapas[etapa] = {"x": x, "y": y}

    nombre = f"{random.choice(NOMBRES)} {random.choice(APELLIDOS)}"
    edad = random.randint(18, 60)
    partes = [_descripcion_persona(e, etapas[e]["x"], etapas[e]["y"]) for e in sorted(etapas)]
    return {
        "nombre": nombre,
        "edad": edad,
        "etapas": {str(e): v for e, v in etapas.items()},
        "descripcion": "; ".join(partes),
    }


# ---------------------------------------------------------------------------
# Capa de base de datos (SQLite): puntajes del modo desafío.
# ---------------------------------------------------------------------------
def get_db():
    """Devuelve la conexión SQLite de la petición actual (una por request)."""
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exception=None):
    """Cierra la conexión al terminar la petición."""
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    """Crea la tabla de partidas si no existe."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS partidas (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre   TEXT    NOT NULL,
            puntaje  INTEGER NOT NULL,
            aciertos INTEGER NOT NULL,
            total    INTEGER NOT NULL,
            fecha    TEXT    NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


def guardar_partida(nombre, puntaje, aciertos, total):
    """Inserta una partida terminada en la DB."""
    db = get_db()
    db.execute(
        "INSERT INTO partidas (nombre, puntaje, aciertos, total, fecha) "
        "VALUES (?, ?, ?, ?, ?)",
        (nombre, int(puntaje), int(aciertos), int(total),
         datetime.now(timezone.utc).isoformat(timespec="seconds")),
    )
    db.commit()


def top_partidas(limite=10):
    """Devuelve las mejores partidas por puntaje (desc)."""
    db = get_db()
    filas = db.execute(
        "SELECT nombre, puntaje, aciertos, total, fecha "
        "FROM partidas ORDER BY puntaje DESC, fecha ASC LIMIT ?",
        (limite,),
    ).fetchall()
    return [dict(f) for f in filas]


# Inicializar la DB al importar el módulo (idempotente).
init_db()


# ---------------------------------------------------------------------------
# Rutas del modo desafío y dashboard.
# ---------------------------------------------------------------------------
@app.route("/desafio")
def desafio():
    """Sirve la vista competitiva (modo desafío)."""
    return render_template("desafio.html")


@app.route("/dashboard")
def dashboard():
    """Sirve el dashboard / leaderboard de puntajes."""
    return render_template("dashboard.html")


@app.route("/api/desafio/knn", methods=["POST"])
def api_desafio_knn():
    """Como /api/knn pero usando los datasets del desafío (con ruido)."""
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"error": "Cuerpo JSON ausente o inválido"}), 400
    faltantes = [c for c in ("etapa", "x", "y", "k", "n") if c not in body]
    if faltantes:
        return jsonify({"error": f"Campos faltantes: {', '.join(faltantes)}"}), 400
    try:
        etapa = int(body["etapa"])
    except (TypeError, ValueError):
        return jsonify({"error": "etapa inválida (debe ser 1, 2 o 3)"}), 400
    if etapa not in DATASETS_DESAFIO:
        return jsonify({"error": "etapa inválida (debe ser 1, 2 o 3)"}), 400

    dataset = seleccionar_n(DATASETS_DESAFIO[etapa], body["n"])
    clase, vecinos = clasificar((body["x"], body["y"]), dataset, body["k"])
    puntos = [{"x": x, "y": y, "clase": c} for (x, y, c) in dataset]
    return jsonify({"clase": clase, "vecinos": vecinos, "puntos": puntos})


@app.route("/api/desafio/persona", methods=["GET"])
def api_desafio_persona():
    """Genera una persona del desafío (cerca de frontera)."""
    return jsonify(generar_persona_desafio())


@app.route("/api/puntaje", methods=["POST"])
def api_puntaje():
    """Guarda el puntaje de una partida terminada.

    Cuerpo JSON: ``{nombre, puntaje, aciertos, total}``. Valida tipos básicos.
    """
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"error": "Cuerpo JSON ausente o inválido"}), 400
    nombre = str(body.get("nombre", "")).strip()
    if not nombre:
        return jsonify({"error": "nombre requerido"}), 400
    try:
        puntaje = int(body["puntaje"])
        aciertos = int(body["aciertos"])
        total = int(body["total"])
    except (KeyError, TypeError, ValueError):
        return jsonify({"error": "puntaje/aciertos/total inválidos"}), 400

    guardar_partida(nombre[:40], puntaje, aciertos, total)
    return jsonify({"ok": True})


@app.route("/api/leaderboard", methods=["GET"])
def api_leaderboard():
    """Devuelve el ranking de mejores puntajes."""
    try:
        limite = int(request.args.get("limite", 10))
    except (TypeError, ValueError):
        limite = 10
    limite = max(1, min(100, limite))
    return jsonify({"top": top_partidas(limite)})


if __name__ == "__main__":
    app.run(debug=True)
