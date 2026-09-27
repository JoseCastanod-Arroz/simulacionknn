// static/desafio.js — modo desafío (competitivo).
//
// Partida de PERSONAS_POR_PARTIDA personas. Cada persona recorre la cascada
// (etapa 1 -> 2 -> 3 según su clase). Para cada etapa que recorre, el usuario:
//   - ajusta X e Y a las features de la persona (mostradas en la tira),
//   - elige K (con ruido en las fronteras, K importa),
//   - elige a qué grupo cree que pertenece y pulsa "Responder".
// El acierto se evalúa contra la clase que da KNN (dataset con ruido) para las
// features REALES de la persona, usando la K que el usuario eligió.
//
// Puntaje por acierto: BASE * multiplicador_de_racha + bonus_por_tiempo.
// Al terminar la partida se envía el puntaje a la DB (/api/puntaje) y se
// muestra la pantalla final con enlace al dashboard.

const PERSONAS_POR_PARTIDA = 10;
const BASE = 100; // puntos base por acierto
const BONUS_TIEMPO_MAX = 50; // bonus máximo por responder rápido
const SEG_PARA_BONUS = 10; // a partir de este tiempo el bonus es 0

// Costo de agrandar el dataset. Los primeros N_GRATIS puntos no cuestan; por
// cada punto por encima se descuenta COSTO_POR_PUNTO del puntaje del acierto.
const N_GRATIS = 20;
const COSTO_POR_PUNTO = 3;

// Penalización de puntaje por usar un N dado (0 si N <= N_GRATIS).
function penalizacionN(n) {
  return Math.max(0, (n - N_GRATIS) * COSTO_POR_PUNTO);
}

// Rangos y etiquetas por etapa (coinciden con los datasets del backend).
const RANGOS = {
  1: { x: [5, 70], y: [0, 8] },
  2: { x: [0, 40], y: [0, 40] },
  3: { x: [0, 40], y: [0, 6] },
};
const ETIQUETAS = {
  1: {
    x: "Horas de pantalla / semana",
    y: "Lenguajes conocidos",
    titulo: "Etapa 1 — ¿Técnico o No técnico?",
    clases: ["No técnico", "Técnico"],
  },
  2: {
    x: "Horas en infraestructura / semana",
    y: "Horas en datos-ML / semana",
    titulo: "Etapa 2 — ¿Infra, Desarrollo o Datos?",
    clases: ["Infraestructura/Sistemas", "Desarrollo", "Datos"],
  },
  3: {
    x: "Horas servidores-redes / semana",
    y: "Certificaciones",
    titulo: "Etapa 3 — ¿Sysadmin, Redes o Seguridad?",
    clases: ["Sysadmin", "Redes", "Seguridad"],
  },
};
const COLORES_CLASE = {
  "Técnico": "#2563eb", "No técnico": "#9ca3af",
  "Infraestructura/Sistemas": "#0891b2", "Desarrollo": "#16a34a", "Datos": "#d97706",
  "Sysadmin": "#7c3aed", "Redes": "#db2777", "Seguridad": "#dc2626",
};
const MARGEN = 24;
const MARGEN_EJE = 44;

// Lee el N actual del slider (tamaño del dataset a usar).
function nActual() {
  return Number(document.getElementById("d-n").value);
}

// ---------------------------------------------------------------------------
// Estado de la partida.
// ---------------------------------------------------------------------------
const estado = {
  ronda: 0, // persona actual (1..PERSONAS_POR_PARTIDA)
  puntaje: 0,
  racha: 0,
  aciertos: 0,
  persona: null, // persona actual del backend
  etapasPendientes: [], // etapas que faltan por responder de la persona actual
  etapasTotal: 0, // cuántas etapas recorre la persona actual (1..3)
  etapaIndice: 0, // paso actual dentro de la persona (1..etapasTotal)
  personaOk: true, // ¿la persona actual va bien en TODAS sus etapas?
  etapaActual: null,
  inicioEtapa: 0, // timestamp para el bonus por tiempo
  cronometro: null,
};

// ---------------------------------------------------------------------------
// Persistencia del avance (localStorage). Si el jugador cierra o recarga la
// pestaña por accidente, al volver puede continuar la partida donde iba.
//
// Se guarda tras cada respuesta el estado suficiente para reanudar al INICIO de
// la etapa en curso: puntaje, ronda, racha, aciertos, persona actual y las
// etapas que le faltan (incluida la actual). El cronómetro/bonus por tiempo se
// reinicia al reanudar (no se guarda un tiempo "en vuelo"). La partida guardada
// se asocia al nombre del jugador para no mezclar avances entre jugadores.
// ---------------------------------------------------------------------------
const CLAVE_PARTIDA = "knn_desafio_partida";

// Guarda el estado actual justo antes de mostrar una etapa (punto reanudable).
function guardarAvance() {
  // Reconstruir la lista de etapas pendientes INCLUYENDO la actual, para poder
  // reanudar exactamente en la etapa que se está jugando.
  const pendientesConActual = estado.etapaActual != null
    ? [estado.etapaActual, ...estado.etapasPendientes]
    : estado.etapasPendientes.slice();

  const datos = {
    nombre: (typeof obtenerNombre === "function" && obtenerNombre()) || "",
    ronda: estado.ronda,
    puntaje: estado.puntaje,
    racha: estado.racha,
    aciertos: estado.aciertos,
    persona: estado.persona,
    etapasTotal: estado.etapasTotal,
    etapaIndice: estado.etapaIndice - 1, // se recontará al montar la etapa
    personaOk: estado.personaOk,
    pendientes: pendientesConActual,
    inicioEtapa: estado.inicioEtapa, // timestamp absoluto (Date.now) de la etapa
  };
  try {
    localStorage.setItem(CLAVE_PARTIDA, JSON.stringify(datos));
  } catch (e) {
    // Sin persistencia disponible: seguir sin guardar.
  }
}

// Devuelve la partida guardada del jugador actual, o null si no hay/está vieja.
function leerAvance() {
  try {
    const crudo = localStorage.getItem(CLAVE_PARTIDA);
    if (!crudo) return null;
    const datos = JSON.parse(crudo);
    // Solo reanudar si es del mismo jugador y la partida no está terminada.
    const nombre = (typeof obtenerNombre === "function" && obtenerNombre()) || "";
    if (datos.nombre !== nombre) return null;
    if (!datos.pendientes || datos.pendientes.length === 0) return null;
    if (datos.ronda < 1 || datos.ronda > PERSONAS_POR_PARTIDA) return null;
    return datos;
  } catch (e) {
    return null;
  }
}

function limpiarAvance() {
  try {
    localStorage.removeItem(CLAVE_PARTIDA);
  } catch (e) {
    // ignorar
  }
}

// ---------------------------------------------------------------------------
// Dibujo en canvas.
// ---------------------------------------------------------------------------
function escalar(v, min, max, desde, hasta) {
  if (max === min) return (desde + hasta) / 2;
  return desde + ((v - min) / (max - min)) * (hasta - desde);
}
function datoAPixel(etapa, x, y, canvas) {
  const r = RANGOS[etapa];
  const px = escalar(x, r.x[0], r.x[1], MARGEN_EJE, canvas.width - MARGEN);
  const py = escalar(y, r.y[0], r.y[1], canvas.height - MARGEN_EJE, MARGEN);
  return [px, py];
}
function dibujarPunto(ctx, px, py, radio, color) {
  ctx.beginPath();
  ctx.arc(px, py, radio, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}
function dibujarEjes(ctx, etapa, canvas) {
  const izq = MARGEN_EJE, der = canvas.width - MARGEN, arr = MARGEN, aba = canvas.height - MARGEN_EJE;
  ctx.strokeStyle = "#9ca3af";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(izq, arr); ctx.lineTo(izq, aba); ctx.lineTo(der, aba);
  ctx.stroke();
  ctx.fillStyle = "#6b7280";
  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(ETIQUETAS[etapa].x, (izq + der) / 2, canvas.height - 12);
  ctx.save();
  ctx.translate(14, (arr + aba) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(ETIQUETAS[etapa].y, 0, 0);
  ctx.restore();
}
function render(etapa, datos, punto) {
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  dibujarEjes(ctx, etapa, canvas);

  const puntos = (datos && datos.puntos) || [];
  const vecinos = (datos && datos.vecinos) || [];
  const clavesVecinos = new Set(vecinos.map((v) => `${v.x},${v.y}`));
  const [nx, ny] = datoAPixel(etapa, punto.x, punto.y, canvas);

  ctx.strokeStyle = "#9ca3af";
  for (const v of vecinos) {
    const [vx, vy] = datoAPixel(etapa, v.x, v.y, canvas);
    ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(vx, vy); ctx.stroke();
  }
  for (const p of puntos) {
    const [vx, vy] = datoAPixel(etapa, p.x, p.y, canvas);
    const esV = clavesVecinos.has(`${p.x},${p.y}`);
    dibujarPunto(ctx, vx, vy, esV ? 6 : 4, COLORES_CLASE[p.clase] || "#6b7280");
    if (esV) {
      ctx.beginPath(); ctx.arc(vx, vy, 6, 0, Math.PI * 2);
      ctx.lineWidth = 1.5; ctx.strokeStyle = "#111827"; ctx.stroke();
    }
  }
  dibujarPunto(ctx, nx, ny, 7, "#111827");
  ctx.beginPath(); ctx.arc(nx, ny, 7, 0, Math.PI * 2);
  ctx.lineWidth = 2; ctx.strokeStyle = "#fff"; ctx.stroke();
}

// ---------------------------------------------------------------------------
// Comunicación con el backend.
// ---------------------------------------------------------------------------
async function pedirPersona() {
  const r = await fetch("/api/desafio/persona");
  return r.json();
}
async function clasificarDesafio(etapa, x, y, k, n) {
  const r = await fetch("/api/desafio/knn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ etapa, x, y, k, n }),
  });
  if (!r.ok) return null;
  return r.json();
}

// ---------------------------------------------------------------------------
// Flujo de la partida.
// ---------------------------------------------------------------------------
function actualizarHUD() {
  document.getElementById("hud-ronda").textContent = estado.ronda;
  document.getElementById("hud-total").textContent = PERSONAS_POR_PARTIDA;
  document.getElementById("hud-puntaje").textContent = estado.puntaje;
  document.getElementById("hud-racha").textContent = estado.racha;
}

// Inicia (o reanuda) el cronómetro de la etapa. Se usa Date.now() —reloj
// absoluto de pared— en vez de performance.now(), que se reinicia con la
// página: así el tiempo transcurrido SOBREVIVE a una recarga y no se puede
// resetear el bonus recargando. Si se pasa ``inicioPrevio`` (timestamp
// guardado), el cronómetro continúa desde ahí en vez de empezar de cero.
function iniciarCronometro(inicioPrevio) {
  estado.inicioEtapa = inicioPrevio || Date.now();
  const el = document.getElementById("hud-tiempo");
  clearInterval(estado.cronometro);
  estado.cronometro = setInterval(() => {
    const s = (Date.now() - estado.inicioEtapa) / 1000;
    el.textContent = `${s.toFixed(1)}s`;
  }, 100);
}

// Configura los controles y opciones para la etapa actual de la persona.
// ``inicioPrevio`` (opcional): timestamp guardado para reanudar el cronómetro
// desde el tiempo ya transcurrido (evita resetear el bonus recargando).
function montarEtapa(etapa, inicioPrevio) {
  estado.etapaActual = etapa;
  estado.etapaIndice += 1;
  const et = ETIQUETAS[etapa];
  const r = RANGOS[etapa];

  // Título con el paso dentro de la persona (para que se vea el avance aunque
  // el número de persona no cambie hasta terminar sus etapas).
  const paso = estado.etapasTotal > 1
    ? ` (paso ${estado.etapaIndice} de ${estado.etapasTotal})`
    : "";
  document.getElementById("etapa-titulo").textContent = et.titulo + paso;
  document.getElementById("lbl-x").textContent = et.x;
  document.getElementById("lbl-y").textContent = et.y;

  const dx = document.getElementById("d-x");
  const dy = document.getElementById("d-y");
  dx.min = r.x[0]; dx.max = r.x[1]; dx.value = r.x[0];
  dy.min = r.y[0]; dy.max = r.y[1]; dy.value = r.y[0];
  document.getElementById("d-x-val").textContent = dx.value;
  document.getElementById("d-y-val").textContent = dy.value;

  // Opciones de clase de esta etapa.
  const fs = document.getElementById("opciones");
  fs.innerHTML = "<legend>¿A qué grupo pertenece?</legend>";
  for (const clase of et.clases) {
    const label = document.createElement("label");
    label.innerHTML = `<input type="radio" name="opcion" value="${clase}" /> ${clase}`;
    fs.appendChild(label);
  }

  document.getElementById("feedback").textContent = "";
  document.getElementById("feedback").className = "feedback";
  document.getElementById("btn-responder").disabled = false;
  renderLeyenda(etapa);
  redibujar();
  iniciarCronometro(inicioPrevio);
  // Punto reanudable: guardar el avance al inicio de cada etapa (incluye el
  // inicio real del cronómetro para que el tiempo persista entre recargas).
  guardarAvance();
}

// Dibuja la leyenda de colores de las clases de la etapa actual.
function renderLeyenda(etapa) {
  const cont = document.getElementById("leyenda");
  const clases = ETIQUETAS[etapa].clases;
  cont.innerHTML = clases
    .map(
      (c) =>
        `<span class="leyenda-item">
           <span class="leyenda-punto" style="background:${COLORES_CLASE[c] || "#6b7280"}"></span>
           ${c}
         </span>`
    )
    .join("");
}

// Redibuja el canvas usando la posición actual de los sliders y la K elegida.
async function redibujar() {
  const etapa = estado.etapaActual;
  const x = Number(document.getElementById("d-x").value);
  const y = Number(document.getElementById("d-y").value);
  const k = Number(document.getElementById("d-k").value);
  const datos = await clasificarDesafio(etapa, x, y, k, nActual());
  render(etapa, datos, { x, y });
}

// Actualiza el indicador de costo del slider de N.
function actualizarCostoN() {
  const n = nActual();
  const pen = penalizacionN(n);
  const el = document.getElementById("d-n-costo");
  if (pen === 0) {
    el.textContent = "sin costo";
    el.className = "costo sin";
  } else {
    el.textContent = `−${pen} pts por acierto`;
    el.className = "costo con";
  }
}

// Avanza a la siguiente persona (o termina la partida).
async function siguientePersona() {
  if (estado.ronda >= PERSONAS_POR_PARTIDA) {
    return terminarPartida();
  }
  estado.ronda += 1;
  estado.persona = await pedirPersona();
  // Etapas que recorre esta persona, en orden.
  estado.etapasPendientes = Object.keys(estado.persona.etapas)
    .map(Number)
    .sort((a, b) => a - b);
  estado.etapasTotal = estado.etapasPendientes.length;
  estado.etapaIndice = 0;
  estado.personaOk = true; // se marca en false si falla alguna etapa

  document.getElementById("persona-linea").innerHTML =
    `<strong>${estado.persona.nombre}, ${estado.persona.edad} años</strong> — ${estado.persona.descripcion}.`;

  actualizarHUD();
  montarEtapa(estado.etapasPendientes.shift());
}

// Evalúa la respuesta del usuario para la etapa actual.
async function responder() {
  const elegida = document.querySelector('input[name="opcion"]:checked');
  const feedback = document.getElementById("feedback");
  if (!elegida) {
    feedback.textContent = "Elige un grupo primero";
    feedback.className = "feedback";
    return;
  }
  clearInterval(estado.cronometro);
  document.getElementById("btn-responder").disabled = true;

  const etapa = estado.etapaActual;
  const feats = estado.persona.etapas[String(etapa)];
  const k = Number(document.getElementById("d-k").value);
  const n = nActual();
  // Clase real = KNN sobre las features reales de la persona con la K y N
  // elegidas. Un N mayor da más contexto pero penaliza el puntaje del acierto.
  const datos = await clasificarDesafio(etapa, feats.x, feats.y, k, n);
  const claseReal = datos ? datos.clase : null;
  const acierto = elegida.value === claseReal;

  if (acierto) {
    estado.racha += 1;
    const seg = (Date.now() - estado.inicioEtapa) / 1000;
    const bonusTiempo = Math.round(
      Math.max(0, BONUS_TIEMPO_MAX * (1 - seg / SEG_PARA_BONUS))
    );
    const mult = 1 + (estado.racha - 1) * 0.5; // 1x, 1.5x, 2x, ...
    const pen = penalizacionN(n);
    // El acierto nunca baja de 10 puntos por más grande que sea el dataset.
    const ganado = Math.max(10, Math.round(BASE * mult) + bonusTiempo - pen);
    estado.puntaje += ganado;
    const notaPen = pen > 0 ? `, −${pen} por N=${n}` : "";
    feedback.textContent = `¡Correcto! +${ganado} (racha ×${mult.toFixed(1)}${notaPen})`;
    feedback.className = "feedback correcto";
  } else {
    estado.racha = 0;
    estado.personaOk = false; // fallar una etapa "pierde" a la persona
    feedback.textContent = `Incorrecto. Era: ${claseReal}`;
    feedback.className = "feedback incorrecto";
  }

  // Si esta era la última etapa de la persona y acertó TODAS, cuenta como una
  // persona correcta (el denominador del ranking es el número de personas).
  if (estado.etapasPendientes.length === 0 && estado.personaOk) {
    estado.aciertos += 1;
  }
  actualizarHUD();

  // Mostrar dónde cae realmente el punto de la persona un instante (con el
  // mismo dataset N que usó el jugador).
  render(etapa, datos, { x: feats.x, y: feats.y });

  // Pausa breve y avanzar: siguiente etapa de la persona o siguiente persona.
  setTimeout(() => {
    if (estado.etapasPendientes.length > 0) {
      montarEtapa(estado.etapasPendientes.shift());
    } else {
      siguientePersona();
    }
  }, 1400);
}

async function terminarPartida() {
  clearInterval(estado.cronometro);
  limpiarAvance(); // partida terminada: ya no hay nada que reanudar
  const nombre = (typeof obtenerNombre === "function" && obtenerNombre()) || "Anónimo";
  // Guardar el puntaje en la DB.
  try {
    await fetch("/api/puntaje", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre,
        puntaje: estado.puntaje,
        aciertos: estado.aciertos,
        total: PERSONAS_POR_PARTIDA,
      }),
    });
  } catch (e) {
    // Silencioso: si falla el guardado, igual mostramos el resultado.
  }

  const zona = document.getElementById("zona-juego");
  zona.innerHTML = `
    <div class="fin">
      <p>Partida terminada, ${nombre}.</p>
      <div class="puntaje-final">${estado.puntaje}</div>
      <p>${estado.aciertos} de ${PERSONAS_POR_PARTIDA} personas correctas.</p>
      <button type="button" class="btn btn-primario" id="btn-otra">Jugar otra vez</button>
      <a class="btn btn-primario" href="/dashboard">Ver ranking</a>
    </div>
  `;
  document.getElementById("btn-otra").addEventListener("click", () => {
    limpiarAvance();
    location.reload();
  });
}

// Reanuda una partida guardada: restaura el estado y monta la etapa en curso.
function reanudarPartida(datos) {
  estado.ronda = datos.ronda;
  estado.puntaje = datos.puntaje;
  estado.racha = datos.racha;
  estado.aciertos = datos.aciertos;
  estado.persona = datos.persona;
  estado.etapasTotal = datos.etapasTotal;
  estado.etapaIndice = datos.etapaIndice; // montarEtapa hará +1
  estado.personaOk = datos.personaOk;
  // La primera etapa pendiente es la que estaba jugándose; el resto quedan.
  const pendientes = datos.pendientes.slice();
  const etapaEnCurso = pendientes.shift();
  estado.etapasPendientes = pendientes;

  document.getElementById("persona-linea").innerHTML =
    `<strong>${estado.persona.nombre}, ${estado.persona.edad} años</strong> — ${estado.persona.descripcion}.`;
  actualizarHUD();
  // Reanudar el cronómetro desde el inicio real guardado: el tiempo que estuvo
  // fuera cuenta, así que recargar no resetea el bonus por tiempo.
  montarEtapa(etapaEnCurso, datos.inicioEtapa);
}

// ---------------------------------------------------------------------------
// Cableado inicial.
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  for (const [id, out] of [["d-x", "d-x-val"], ["d-y", "d-y-val"], ["d-k", "d-k-val"], ["d-n", "d-n-val"]]) {
    const control = document.getElementById(id);
    control.addEventListener("input", () => {
      document.getElementById(out).textContent = control.value;
      if (id === "d-n") {
        actualizarCostoN();
      }
      redibujar();
    });
  }
  actualizarCostoN();
  document.getElementById("btn-responder").addEventListener("click", responder);

  // Pedir el nombre antes de empezar (solo en el desafío). Tras tener nombre,
  // si hay una partida guardada de ESE jugador sin terminar, se reanuda; si no,
  // empieza una partida nueva.
  const arrancar = () => {
    const guardada = leerAvance();
    if (guardada) {
      reanudarPartida(guardada);
    } else {
      siguientePersona();
    }
  };
  if (typeof asegurarNombre === "function") {
    asegurarNombre().then(arrancar);
  } else {
    arrancar();
  }
});
