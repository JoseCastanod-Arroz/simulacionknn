// static/nombre.js — modal de nombre obligatorio + barra de navegación.
//
// Se incluye en TODAS las vistas (práctica, desafío, dashboard). Al cargar:
//   1. Inserta una barra de navegación con enlaces a las 3 vistas y el nombre.
//   2. Si no hay nombre guardado en sessionStorage, muestra un modal que lo
//      pide y bloquea la interacción hasta que se ingrese uno válido.
//
// El nombre se guarda en sessionStorage (por pestaña); "siempre" se pide al
// entrar porque sessionStorage se limpia al cerrar la pestaña. El modo desafío
// lee el nombre con obtenerNombre() para asociarlo al puntaje.

const CLAVE_NOMBRE = "knn_nombre";

// Devuelve el nombre guardado (o cadena vacía si no hay).
function obtenerNombre() {
  return sessionStorage.getItem(CLAVE_NOMBRE) || "";
}

// Guarda el nombre y refresca la barra.
function guardarNombre(nombre) {
  sessionStorage.setItem(CLAVE_NOMBRE, nombre);
  const etiqueta = document.getElementById("nav-nombre");
  if (etiqueta) {
    etiqueta.textContent = nombre;
  }
}

// Inserta la barra de navegación al inicio del <body>.
function insertarNav() {
  const nav = document.createElement("nav");
  nav.className = "nav-top";
  nav.innerHTML = `
    <div class="nav-links">
      <a href="/">Práctica</a>
      <a href="/desafio">Desafío</a>
      <a href="/dashboard">Dashboard</a>
    </div>
    <div class="nav-usuario">
      <span class="nav-usuario-etq">Jugador:</span>
      <strong id="nav-nombre">${obtenerNombre() || "—"}</strong>
      <button type="button" id="nav-cambiar">Cambiar</button>
    </div>
  `;
  document.body.insertBefore(nav, document.body.firstChild);

  // Marcar el enlace de la vista actual.
  for (const a of nav.querySelectorAll(".nav-links a")) {
    if (a.getAttribute("href") === window.location.pathname) {
      a.classList.add("activo");
    }
  }

  const cambiar = document.getElementById("nav-cambiar");
  if (cambiar) {
    cambiar.addEventListener("click", () => mostrarModalNombre());
  }
}

// Muestra el modal que pide el nombre. Bloquea hasta ingresar uno válido
// (salvo que ya exista uno y el usuario cancele desde "Cambiar").
function mostrarModalNombre(alConfirmar) {
  const existente = obtenerNombre();

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-titulo">
      <h2 id="modal-titulo">¿Cómo te llamas?</h2>
      <p>Ingresa tu nombre para jugar y aparecer en el ranking.</p>
      <input type="text" id="modal-input" maxlength="40" placeholder="Tu nombre"
             value="${existente}" autocomplete="off" />
      <p class="modal-error" id="modal-error"></p>
      <button type="button" id="modal-aceptar">Continuar</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = document.getElementById("modal-input");
  const error = document.getElementById("modal-error");
  const aceptar = document.getElementById("modal-aceptar");
  input.focus();

  function confirmar() {
    const valor = input.value.trim();
    if (valor.length < 2) {
      error.textContent = "Escribe al menos 2 caracteres.";
      return;
    }
    guardarNombre(valor);
    overlay.remove();
    if (typeof alConfirmar === "function") {
      alConfirmar(valor);
    }
  }

  aceptar.addEventListener("click", confirmar);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      confirmar();
    }
  });
}

// Asegura que exista un nombre: si no hay, abre el modal y resuelve cuando el
// usuario lo ingresa. Devuelve una promesa con el nombre. Lo usa el desafío.
function asegurarNombre() {
  return new Promise((resolve) => {
    const actual = obtenerNombre();
    if (actual) {
      resolve(actual);
      return;
    }
    mostrarModalNombre(() => resolve(obtenerNombre()));
  });
}

document.addEventListener("DOMContentLoaded", () => {
  insertarNav();
  // El modal NO se muestra automáticamente. Solo la vista Desafío pide el
  // nombre (llamando a asegurarNombre); Práctica y Dashboard no lo requieren.
});
