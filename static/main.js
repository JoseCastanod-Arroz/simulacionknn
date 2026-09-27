// static/main.js — lógica de interfaz (sliders, fetch, canvas, árbol).
// El resto del contenido (fetch, actualizarUI, árbol, CSS) se implementa en
// las tareas 7–9. Aquí solo vive el dibujo en canvas (tarea 6.1).

// ---------------------------------------------------------------------------
// Rangos de las dos variables por etapa (deben coincidir con los sliders de
// index.html y con los datasets de app.py). Se usan para escalar coordenadas
// de datos a píxeles del canvas. _Requirements: 2.1–2.6_
// ---------------------------------------------------------------------------
const RANGOS = {
  1: { x: [5, 70], y: [0, 8] },
  2: { x: [0, 40], y: [0, 40] },
  3: { x: [0, 40], y: [0, 6] },
};

// Nombres descriptivos de cada eje por etapa (para las etiquetas del canvas).
const ETIQUETAS_EJES = {
  1: { x: "Horas de pantalla / semana", y: "Lenguajes conocidos" },
  2: { x: "Horas infra / semana", y: "Horas datos / semana" },
  3: { x: "Horas servidores/redes / semana", y: "Certificaciones" },
};

// Mapa de color por clase (todas las clases de las 3 etapas).
const COLORES_CLASE = {
  // Etapa 1
  "Técnico": "#2563eb",
  "No técnico": "#9ca3af",
  // Etapa 2
  "Infraestructura/Sistemas": "#0891b2",
  "Desarrollo": "#16a34a",
  "Datos": "#d97706",
  // Etapa 3
  "Sysadmin": "#7c3aed",
  "Redes": "#db2777",
  "Seguridad": "#dc2626",
};

const COLOR_POR_DEFECTO = "#6b7280"; // clase desconocida / null
// Márgenes interiores del canvas. Se deja más espacio abajo y a la izquierda
// para dibujar las etiquetas de los ejes X e Y.
const MARGEN = 24;
const MARGEN_EJE_X = 44; // espacio inferior para la etiqueta del eje X
const MARGEN_EJE_Y = 44; // espacio izquierdo para la etiqueta del eje Y

// Devuelve el color asociado a una clase, con un color por defecto seguro.
function colorDeClase(clase) {
  return COLORES_CLASE[clase] || COLOR_POR_DEFECTO;
}

// Escala un valor de datos [min, max] a un rango de píxeles [desde, hasta].
function escalar(valor, min, max, desde, hasta) {
  if (max === min) {
    return (desde + hasta) / 2; // rango degenerado: centrar
  }
  const t = (valor - min) / (max - min);
  return desde + t * (hasta - desde);
}

// Convierte un punto (x, y) en coordenadas de datos a píxeles del canvas de la
// etapa. El eje Y se invierte para que los valores mayores queden arriba.
function datoAPixel(numEtapa, x, y, canvas) {
  const rango = RANGOS[numEtapa];
  // Área de dibujo: se reserva MARGEN_EJE_Y a la izquierda y MARGEN_EJE_X abajo
  // para las etiquetas de los ejes; MARGEN normal arriba y a la derecha.
  const izquierda = MARGEN_EJE_Y;
  const derecha = canvas.width - MARGEN;
  const arriba = MARGEN;
  const abajo = canvas.height - MARGEN_EJE_X;
  const px = escalar(x, rango.x[0], rango.x[1], izquierda, derecha);
  const py = escalar(y, rango.y[0], rango.y[1], abajo, arriba);
  return [px, py];
}

// Dibuja los ejes (líneas) y sus etiquetas descriptivas para una etapa.
function dibujarEjes(ctx, numEtapa, canvas) {
  const izquierda = MARGEN_EJE_Y;
  const derecha = canvas.width - MARGEN;
  const arriba = MARGEN;
  const abajo = canvas.height - MARGEN_EJE_X;

  // Ejes: línea inferior (X) y línea izquierda (Y).
  ctx.strokeStyle = COLOR_POR_DEFECTO;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(izquierda, arriba);
  ctx.lineTo(izquierda, abajo);
  ctx.lineTo(derecha, abajo);
  ctx.stroke();

  // Etiquetas de los ejes.
  const etq = ETIQUETAS_EJES[numEtapa];
  ctx.fillStyle = COLOR_POR_DEFECTO;
  ctx.font = "12px system-ui, sans-serif";

  // Eje X: centrado bajo el área de dibujo.
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(etq.x, (izquierda + derecha) / 2, canvas.height - 12);

  // Eje Y: rotado 90° a la izquierda.
  ctx.save();
  ctx.translate(14, (arriba + abajo) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillText(etq.y, 0, 0);
  ctx.restore();
}

// Dibuja un punto relleno (círculo) en coordenadas de píxeles.
function dibujarPunto(ctx, px, py, radio, color) {
  ctx.beginPath();
  ctx.arc(px, py, radio, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

// Lee la posición actual del punto nuevo desde los dos sliders de la etapa.
function leerPuntoNuevo(numEtapa) {
  const ex = document.getElementById(`e${numEtapa}-x`);
  const ey = document.getElementById(`e${numEtapa}-y`);
  return { x: Number(ex.value), y: Number(ey.value) };
}

// ---------------------------------------------------------------------------
// renderEtapa(numEtapa, datos) — dibuja la Visualización_2D de una etapa.
//   datos = { clase, vecinos: [{ x, y, clase }, ...] }  (respuesta del endpoint)
// Dibuja: los vecinos del dataset coloreados por clase, el punto nuevo (según
// los dos sliders de la etapa) y una línea desde el punto nuevo a cada vecino.
// _Requirements: 7.1, 7.2, 7.3_
// ---------------------------------------------------------------------------
function renderEtapa(numEtapa, datos) {
  const canvas = document.getElementById(`canvas-${numEtapa}`);
  if (!canvas) {
    return;
  }
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Ejes con etiquetas descriptivas (se dibujan primero, debajo de los puntos).
  dibujarEjes(ctx, numEtapa, canvas);

  // Todos los puntos del dataset usado (los primeros N). Se dibujan siempre,
  // incluso antes de que el punto nuevo tenga vecinos calculados. Si por
  // alguna razón no llegan `puntos`, caemos a los vecinos como respaldo.
  const puntos = (datos && datos.puntos) || (datos && datos.vecinos) || [];
  const vecinos = (datos && datos.vecinos) || [];
  const puntoNuevo = leerPuntoNuevo(numEtapa);
  const [nx, ny] = datoAPixel(numEtapa, puntoNuevo.x, puntoNuevo.y, canvas);

  // Conjunto de vecinos por coordenada para destacarlos entre el dataset.
  const claveVecinos = new Set(vecinos.map((v) => `${v.x},${v.y}`));

  // Líneas desde el punto nuevo hacia cada vecino consultado (Req 7.3).
  ctx.strokeStyle = COLOR_POR_DEFECTO;
  ctx.lineWidth = 1;
  for (const vecino of vecinos) {
    const [vx, vy] = datoAPixel(numEtapa, vecino.x, vecino.y, canvas);
    ctx.beginPath();
    ctx.moveTo(nx, ny);
    ctx.lineTo(vx, vy);
    ctx.stroke();
  }

  // Todos los puntos del dataset coloreados por clase (Req 7.1). Los vecinos
  // (los K más cercanos) se dibujan un poco más grandes y con borde para
  // distinguirlos del resto de los puntos del dataset.
  for (const punto of puntos) {
    const [vx, vy] = datoAPixel(numEtapa, punto.x, punto.y, canvas);
    const esVecino = claveVecinos.has(`${punto.x},${punto.y}`);
    dibujarPunto(ctx, vx, vy, esVecino ? 6 : 4, colorDeClase(punto.clase));
    if (esVecino) {
      ctx.beginPath();
      ctx.arc(vx, vy, 6, 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#111827";
      ctx.stroke();
    }
  }

  // Punto nuevo (Req 7.2): círculo mayor con borde para destacarlo.
  dibujarPunto(ctx, nx, ny, 7, "#111827");
  ctx.beginPath();
  ctx.arc(nx, ny, 7, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Estado de la cascada (tarea 7.1). Cada resultadoN guarda la última respuesta
// OK del endpoint para la etapa N, o null si aún no se ha clasificado (o si el
// último intento falló). actualizarUI() (tarea 7.2) lee estas variables para
// decidir qué etapas mostrar. _Requirements: 10.1_
// ---------------------------------------------------------------------------
let resultado1 = null;
let resultado2 = null;
let resultado3 = null;

// Asigna el resultado a la variable de estado correspondiente a la etapa.
function guardarResultado(numEtapa, datos) {
  if (numEtapa === 1) {
    resultado1 = datos;
  } else if (numEtapa === 2) {
    resultado2 = datos;
  } else if (numEtapa === 3) {
    resultado3 = datos;
  }
}

// ---------------------------------------------------------------------------
// actualizarUI() — aplica la cascada y muestra el resultado final.
// _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 10.2_
//
// Reglas de la cascada (leyendo resultado1 / resultado2 / resultado3):
//   - resultado1 === null                → etapas 2 y 3 ocultas.
//   - resultado1.clase === "No técnico"  → finaliza; etapas 2 y 3 ocultas;
//                                          resultado final = "No técnico".
//   - resultado1.clase === "Técnico"     → mostrar etapa 2.
//   - resultado2 === null                → etapa 3 oculta.
//   - resultado2.clase ∈ {Desarrollo,    → finaliza; etapa 3 oculta;
//                          Datos}           resultado final = esa clase.
//   - resultado2.clase === "Infraestructura/Sistemas" → mostrar etapa 3.
//   - resultado3 !== null                → resultado final = resultado3.clase.
//
// Para que la cascada se re-colapse correctamente cuando un resultado cambia
// (p. ej. la etapa 1 pasa de "Técnico" a "No técnico"), se resetea a null el
// estado de las etapas que dejan de ser válidas, de modo que no quede estado
// obsoleto de una rama que ya no se recorre.
// ---------------------------------------------------------------------------

// Muestra u oculta una sección de etapa alternando el atributo `hidden`.
function mostrarEtapa(numEtapa, visible) {
  const seccion = document.getElementById(`etapa-${numEtapa}`);
  if (seccion) {
    seccion.hidden = !visible;
  }
}

// Escribe el texto de resultado de una etapa en su párrafo resultado-N.
function escribirResultadoEtapa(numEtapa, texto) {
  const p = document.getElementById(`resultado-${numEtapa}`);
  if (p) {
    p.textContent = texto;
  }
}

// Muestra el resultado final de la cascada. Usa #resultado-final si existe;
// si no, reutiliza el párrafo resultado-N de la etapa que produjo el resultado.
function mostrarResultadoFinal(texto, numEtapaOrigen) {
  const dedicado = document.getElementById("resultado-final");
  if (dedicado) {
    dedicado.textContent = texto;
    return;
  }
  escribirResultadoEtapa(numEtapaOrigen, texto);
}

// ---------------------------------------------------------------------------
// actualizarArbol() — refleja el estado de la cascada sobre el Panel_Arbol.
// _Requirements: 6.2, 6.3, 6.4, 6.5, 10.2_
//
// Recomputa por completo desde resultado1 / resultado2 / resultado3 (es
// idempotente): primero limpia todo .activo/.descartado y luego, según los
// resultados actuales, marca el Nodo_Activo de cada etapa decidida, atenúa las
// ramas hermanas no elegidas y atenúa las etapas aguas abajo no ejecutadas.
//
// Ramas por etapa (deben coincidir con los data-clase de index.html):
//   Etapa 1: "No técnico", "Técnico"
//   Etapa 2: "Infraestructura/Sistemas", "Desarrollo", "Datos"
//   Etapa 3: "Sysadmin", "Redes", "Seguridad"
// ---------------------------------------------------------------------------
const RAMAS_ARBOL = {
  1: ["No técnico", "Técnico"],
  2: ["Infraestructura/Sistemas", "Desarrollo", "Datos"],
  3: ["Sysadmin", "Redes", "Seguridad"],
};

// Devuelve el nodo del árbol correspondiente a una clase (o null si no existe).
// El selector por atributo tolera la "/" de "Infraestructura/Sistemas".
function nodoDeClase(clase) {
  return document.querySelector(`.arbol-nodo[data-clase="${clase}"]`);
}

// Marca una etapa decidida: .activo sobre el nodo elegido y .descartado sobre
// las ramas hermanas no elegidas de esa etapa.
function marcarEtapaArbol(numEtapa, claseElegida) {
  for (const clase of RAMAS_ARBOL[numEtapa]) {
    const nodo = nodoDeClase(clase);
    if (!nodo) {
      continue;
    }
    if (clase === claseElegida) {
      nodo.classList.add("activo");
    } else {
      nodo.classList.add("descartado");
    }
  }
}

// Atenúa (descartado) todas las ramas de una etapa no ejecutada.
function descartarEtapaArbol(numEtapa) {
  for (const clase of RAMAS_ARBOL[numEtapa]) {
    const nodo = nodoDeClase(clase);
    if (nodo) {
      nodo.classList.add("descartado");
    }
  }
}

function actualizarArbol() {
  // Recompute limpio: quitar cualquier marca previa para reflejar el estado
  // actual en tiempo real (Req 6.4).
  for (const numEtapa of [1, 2, 3]) {
    for (const clase of RAMAS_ARBOL[numEtapa]) {
      const nodo = nodoDeClase(clase);
      if (nodo) {
        nodo.classList.remove("activo", "descartado");
      }
    }
  }

  // Etapa 1 sin resultado: nada marcado todavía.
  if (resultado1 === null) {
    return;
  }

  // Etapa 1 decidida: activo el elegido, descartada la otra rama (Req 6.2, 6.3).
  marcarEtapaArbol(1, resultado1.clase);

  if (resultado1.clase === "No técnico") {
    // Cascada detenida en la etapa 1: etapas 2 y 3 no ejecutadas (Req 6.5).
    descartarEtapaArbol(2);
    descartarEtapaArbol(3);
    return;
  }

  // resultado1.clase === "Técnico" → la etapa 2 es la rama activa.
  if (resultado2 === null) {
    // Etapa 2 aún sin decidir: etapa 3 no ejecutada.
    descartarEtapaArbol(3);
    return;
  }

  marcarEtapaArbol(2, resultado2.clase);

  if (resultado2.clase === "Desarrollo" || resultado2.clase === "Datos") {
    // Cascada detenida en la etapa 2: etapa 3 no ejecutada (Req 6.5).
    descartarEtapaArbol(3);
    return;
  }

  // resultado2.clase === "Infraestructura/Sistemas" → la etapa 3 es la rama activa.
  if (resultado3 === null) {
    return;
  }

  marcarEtapaArbol(3, resultado3.clase);
}

function actualizarUI() {
  // --- Etapa 1: raíz de la cascada -------------------------------------
  if (resultado1 === null) {
    // Sin resultado de la etapa 1: nada aguas abajo es válido.
    resultado2 = null;
    resultado3 = null;
    escribirResultadoEtapa(1, "");
    mostrarEtapa(2, false);
    mostrarEtapa(3, false);
    actualizarArbol();
    return;
  }

  escribirResultadoEtapa(1, `Clase: ${resultado1.clase}`);

  if (resultado1.clase === "No técnico") {
    // Rama hoja: la cascada se detiene en la etapa 1.
    resultado2 = null;
    resultado3 = null;
    mostrarEtapa(2, false);
    mostrarEtapa(3, false);
    mostrarResultadoFinal("Resultado final: No técnico", 1);
    actualizarArbol();
    return;
  }

  // resultado1.clase === "Técnico" → se abre la etapa 2.
  mostrarEtapa(2, true);

  // --- Etapa 2 ----------------------------------------------------------
  if (resultado2 === null) {
    // Etapa 2 aún sin clasificar: la etapa 3 no es válida.
    resultado3 = null;
    escribirResultadoEtapa(2, "");
    mostrarEtapa(3, false);
    actualizarArbol();
    return;
  }

  escribirResultadoEtapa(2, `Clase: ${resultado2.clase}`);

  if (resultado2.clase === "Desarrollo" || resultado2.clase === "Datos") {
    // Ramas hoja: la cascada se detiene en la etapa 2.
    resultado3 = null;
    mostrarEtapa(3, false);
    mostrarResultadoFinal(`Resultado final: ${resultado2.clase}`, 2);
    actualizarArbol();
    return;
  }

  // resultado2.clase === "Infraestructura/Sistemas" → se abre la etapa 3.
  mostrarEtapa(3, true);

  // --- Etapa 3: hoja final de la cascada --------------------------------
  if (resultado3 === null) {
    // Etapa 3 aún sin clasificar: no hay resultado final todavía.
    escribirResultadoEtapa(3, "");
    actualizarArbol();
    return;
  }

  escribirResultadoEtapa(3, `Clase: ${resultado3.clase}`);
  mostrarResultadoFinal(`Resultado final: ${resultado3.clase}`, 3);
  actualizarArbol();
}

// Arma el cuerpo de la petición {etapa, x, y, k, n} leyendo los sliders de la
// etapa. Reutiliza leerPuntoNuevo para x/y y toma k/n directamente.
function armarCuerpo(numEtapa) {
  const punto = leerPuntoNuevo(numEtapa);
  const ek = document.getElementById(`e${numEtapa}-k`);
  const en = document.getElementById(`e${numEtapa}-n`);
  return {
    etapa: numEtapa,
    x: punto.x,
    y: punto.y,
    k: Number(ek.value),
    n: Number(en.value),
  };
}

// Clasifica la etapa: pide al endpoint y, solo si la respuesta es OK, guarda el
// resultado y re-renderiza. Si fetch falla o la respuesta no es OK, no se toca
// resultadoN y la interfaz se queda en el estado anterior. _Requirements: 10.1_
async function clasificarEtapa(numEtapa) {
  const cuerpo = armarCuerpo(numEtapa);
  try {
    const respuesta = await fetch("/api/knn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    if (!respuesta.ok) {
      return; // respuesta no OK: no actualizar estado
    }
    const datos = await respuesta.json();
    guardarResultado(numEtapa, datos);
    renderEtapa(numEtapa, datos);
    actualizarUI();
  } catch (error) {
    // fetch falló (red, JSON inválido, etc.): dejar el estado anterior.
  }
}

// Refleja el valor actual de un slider en su <output> asociado (e{N}-<campo>-val).
function actualizarValorMostrado(numEtapa, campo) {
  const control = document.getElementById(`e${numEtapa}-${campo}`);
  const salida = document.getElementById(`e${numEtapa}-${campo}-val`);
  if (control && salida) {
    salida.textContent = control.value;
  }
}

// Ajusta el control de K al valor actual de N: fija el `max` del slider de K a
// N y, si el K actual supera N, lo baja a N (y refresca su <output>). Se llama
// cuando N cambia, antes de recalcular, para que la clasificación use un K
// válido dentro del rango 1–N. _Requirements: 5.1, 5.2_
function ajustarKaN(numEtapa) {
  const en = document.getElementById(`e${numEtapa}-n`);
  const ek = document.getElementById(`e${numEtapa}-k`);
  if (!en || !ek) {
    return;
  }
  const n = Number(en.value);
  ek.max = String(n);
  if (Number(ek.value) > n) {
    ek.value = String(n);
    actualizarValorMostrado(numEtapa, "k");
  }
}

// Cablea los listeners `input` de los 4 sliders de una etapa: al mover
// cualquiera se actualiza el display y se recalcula la clasificación.
function cablearEtapa(numEtapa) {
  for (const campo of ["x", "y", "n", "k"]) {
    const control = document.getElementById(`e${numEtapa}-${campo}`);
    if (!control) {
      continue;
    }
    control.addEventListener("input", () => {
      actualizarValorMostrado(numEtapa, campo);
      // Al cambiar N, reajustar el rango de K (y bajar K si excede N) antes de
      // recalcular, para no clasificar con un K fuera del rango 1–N.
      if (campo === "n") {
        ajustarKaN(numEtapa);
      }
      clasificarEtapa(numEtapa);
    });
  }
}

// ---------------------------------------------------------------------------
// Alternador de tema (tarea 9.1). El tema se aplica poniendo data-tema="oscuro"
// sobre <html> (document.documentElement); el tema claro es el estado por
// defecto (sin atributo). El botón #tema-toggle alterna entre ambos y refleja
// el estado en su texto y en aria-pressed. _Requirements: 9.2, 9.3_
// ---------------------------------------------------------------------------

// Aplica un tema ("claro" | "oscuro") a la interfaz y sincroniza el botón.
function aplicarTema(tema) {
  const raiz = document.documentElement;
  const oscuro = tema === "oscuro";
  if (oscuro) {
    raiz.setAttribute("data-tema", "oscuro");
  } else {
    raiz.removeAttribute("data-tema"); // tema claro = sin atributo (por defecto)
  }
  const boton = document.getElementById("tema-toggle");
  if (boton) {
    boton.setAttribute("aria-pressed", String(oscuro));
    boton.textContent = oscuro ? "☀️ Tema claro" : "🌙 Tema oscuro";
  }
}

// Cablea el botón #tema-toggle para alternar entre tema claro y oscuro.
function cablearTema() {
  const boton = document.getElementById("tema-toggle");
  if (!boton) {
    return;
  }
  boton.addEventListener("click", () => {
    const yaOscuro = document.documentElement.getAttribute("data-tema") === "oscuro";
    aplicarTema(yaOscuro ? "claro" : "oscuro");
  });
}

// ---------------------------------------------------------------------------
// Modo juego (etapa 1). Al cargar la página se pide una persona aleatoria al
// backend; sus features se muestran a la izquierda de la gráfica. El usuario
// las mete en los sliders y elige un grupo; "Calificar" compara la clase
// elegida contra la clase que KNN da para las features REALES de la persona
// (no la posición del slider), y muestra solo "correcto" / "incorrecto".
// ---------------------------------------------------------------------------

// Una sola persona para toda la cascada. Guarda su perfil y las features por
// etapa (persona.etapas["1".."3"] = {x, y}), solo de las etapas que recorre.
let personaActual = null;

// Pide UNA persona aleatoria y muestra sus datos en la tira única de arriba.
async function cargarPersona() {
  try {
    const respuesta = await fetch("/api/persona");
    if (!respuesta.ok) {
      return;
    }
    const persona = await respuesta.json();
    personaActual = persona;
    // Perfil en una sola línea: "Nombre, N años — descripción de features".
    const linea = document.getElementById("persona-linea");
    if (linea) {
      linea.innerHTML =
        `<strong>${persona.nombre}, ${persona.edad} años</strong> — ` +
        `${persona.descripcion}.`;
    }
  } catch (error) {
    // Silencioso: si falla, la tira queda con el guion por defecto.
  }
}

// Clasifica con KNN las features reales de la persona en esa etapa (con la N y
// K actuales) y devuelve la clase, o null si algo falla o la persona no recorre
// esa etapa.
async function claseRealDePersona(numEtapa) {
  const features = personaActual && personaActual.etapas
    ? personaActual.etapas[String(numEtapa)]
    : null;
  if (!features) {
    return null;
  }
  const en = document.getElementById(`e${numEtapa}-n`);
  const ek = document.getElementById(`e${numEtapa}-k`);
  const cuerpo = {
    etapa: numEtapa,
    x: features.x,
    y: features.y,
    k: Number(ek.value),
    n: Number(en.value),
  };
  try {
    const respuesta = await fetch("/api/knn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    if (!respuesta.ok) {
      return null;
    }
    const datos = await respuesta.json();
    return datos.clase;
  } catch (error) {
    return null;
  }
}

// Cablea el botón "Calificar" de una etapa: compara la clase elegida por el
// usuario con la clase real de KNN y muestra correcto/incorrecto.
function cablearCalificar(numEtapa) {
  const boton = document.getElementById(`calificar-${numEtapa}`);
  const veredicto = document.getElementById(`veredicto-${numEtapa}`);
  if (!boton || !veredicto) {
    return;
  }
  boton.addEventListener("click", async () => {
    const elegida = document.querySelector(
      `input[name="opcion-${numEtapa}"]:checked`
    );
    if (!elegida) {
      veredicto.textContent = "Elige un grupo primero";
      veredicto.className = "veredicto";
      return;
    }
    const real = await claseRealDePersona(numEtapa);
    if (real === null) {
      veredicto.textContent = "No se pudo calificar";
      veredicto.className = "veredicto";
      return;
    }
    const acierto = elegida.value === real;
    veredicto.textContent = acierto ? "Correcto" : "Incorrecto";
    veredicto.className = `veredicto ${acierto ? "correcto" : "incorrecto"}`;
  });
}

// Inicialización: cablear las 3 etapas y lanzar una primera clasificación de la
// etapa 1 para arrancar la cascada.
document.addEventListener("DOMContentLoaded", () => {
  // Tema claro por defecto + cableado del alternador (Req 9.2, 9.3).
  aplicarTema("claro");
  cablearTema();

  cablearEtapa(1);
  cablearEtapa(2);
  cablearEtapa(3);
  // Alinear el rango de K con el N inicial de cada etapa (max de K = N).
  ajustarKaN(1);
  ajustarKaN(2);
  ajustarKaN(3);
  clasificarEtapa(1);

  // Modo juego: UNA sola persona para toda la cascada. Se carga una vez al
  // iniciar (tira única arriba) y cada etapa conserva su botón "Calificar".
  for (const numEtapa of [1, 2, 3]) {
    cablearCalificar(numEtapa);
  }
  cargarPersona();
});
