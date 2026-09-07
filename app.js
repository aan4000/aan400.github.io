const MODELOS = {
  orto_users: "usuarios",
  orto_pacientes: "pacientes",
  orto_citas: "citas",
  orto_registros: "registros",
  orto_documentos: "documentos",
  orto_facturas: "facturas",
  orto_citas_sin_consulta: "citasSinConsulta",
  orto_recetas: "recetas"
};

const traductorModelo = {
  usuarios: "users",
  pacientes: "pacientes",
  citas: "citas",
  registros: "registros",
  documentos: "documentos",
  facturas: "facturas",
  citasSinConsulta: "citasSinConsulta",
  recetas: "recetas"
};

const BD = (() => {
  const cache = {
    colecciones: {
      usuarios: [],
      pacientes: [],
      citas: [],
      registros: [],
      documentos: [],
      facturas: [],
      citasSinConsulta: [],
      recetas: []
    },
    config: {}
  };
  let cargado = false;
  let modo = "local";
  let cola = Promise.resolve();

  const SESION_BACKUP = "orto_backup";
  const COOKIE_MARCA = "orto_backup_ok=1";

  function respaldarLocal() {
    if (!cargado) return;
    try {
      sessionStorage.setItem(SESION_BACKUP, JSON.stringify(instante()));
    } catch (err) {}
    try {
      document.cookie = COOKIE_MARCA + "; path=/; max-age=604800; SameSite=Lax";
    } catch (err) {}
  }

  function leerRespaldoSesion() {
    try {
      const raw = sessionStorage.getItem(SESION_BACKUP);
      if (!raw) return null;
      const val = JSON.parse(raw);
      return val && typeof val === "object" ? val : null;
    } catch (err) {
      return null;
    }
  }

  function restaurarBackup(backup) {
    for (const [claveLegacy, modelo] of Object.entries(MODELOS)) {
      if (Array.isArray(backup[modelo]) && backup[modelo].length) {
        cache.colecciones[modelo] = backup[modelo];
      }
    }
    if (backup.config && typeof backup.config === "object") {
      cache.config = backup.config;
    }
  }

  async function cargar() {
    let restaurado = false;
    try {
      const res = await fetch("/api/datos");
      if (res.ok) {
        const datos = await res.json();
        const vacio = Object.values(MODELOS).every(m => !(datos[m] && datos[m].length));
        const respaldo = leerRespaldoSesion();
        if (vacio && respaldo) {
          restaurarBackup(respaldo);
          restaurado = true;
        } else {
          for (const [claveLegacy, modelo] of Object.entries(MODELOS)) {
            cache.colecciones[modelo] = Array.isArray(datos[modelo]) ? datos[modelo] : [];
          }
          cache.config = datos.config && typeof datos.config === "object" ? datos.config : {};
        }
        modo = "servidor";
      }
    } catch (err) {
      const respaldo = leerRespaldoSesion();
      if (respaldo) {
        restaurarBackup(respaldo);
        restaurado = true;
        modo = "local";
      } else {
        console.error("Sin conexión con la base local:", err);
      }
    }

    let migrado = false;
    for (const claveLegacy of Object.keys(MODELOS)) {
      const modelo = MODELOS[claveLegacy];
      const raw = localStorage.getItem(claveLegacy);
      if (raw != null && cache.colecciones[modelo].length === 0) {
        try {
          const val = JSON.parse(raw);
          if (Array.isArray(val) && val.length) {
            cache.colecciones[modelo] = val;
            migrado = true;
          }
        } catch (err) {}
      }
    }
    for (const clave of ["orto_config", "orto_session", "orto_dark"]) {
      const raw = localStorage.getItem(clave);
      if (raw != null && cache.config[clave] === undefined) {
        try {
          cache.config[clave] = JSON.parse(raw);
          migrado = true;
        } catch (err) {}
      }
    }

    cargado = true;
    sincronizarState();
    if (modo === "servidor" && (migrado || restaurado)) guardar();
    respaldarLocal();
    return cache;
  }

  function sincronizarState() {
    State.users = cache.colecciones.usuarios;
    State.pacientes = cache.colecciones.pacientes;
    State.citas = cache.colecciones.citas;
    State.registros = cache.colecciones.registros;
    State.documentos = cache.colecciones.documentos;
    State.facturas = cache.colecciones.facturas;
    State.citasSinConsulta = cache.colecciones.citasSinConsulta;
    State.recetas = cache.colecciones.recetas;
    State.config = cache.config["orto_config"] ?? null;
    State.session = cache.config["orto_session"] ?? null;
  }

  function instante() {
    return {
      usuarios: cache.colecciones.usuarios,
      pacientes: cache.colecciones.pacientes,
      citas: cache.colecciones.citas,
      registros: cache.colecciones.registros,
      documentos: cache.colecciones.documentos,
      facturas: cache.colecciones.facturas,
      citasSinConsulta: cache.colecciones.citasSinConsulta,
      recetas: cache.colecciones.recetas,
      config: cache.config
    };
  }

  function guardar() {
    if (!cargado || modo !== "servidor") return;
    const cuerpo = instante();
    cola = cola
      .catch(() => {})
      .then(() =>
        fetch("/api/datos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cuerpo)
        })
      )
      .then(res => {
        if (!res.ok) console.error("No se pudo guardar en la base local:", res.status);
      })
      .catch(err => console.error("No se pudo guardar en la base local:", err));
  }

  function guardarColeccion(modelo) {
    if (!cargado || modo !== "servidor") return;
    cola = cola
      .catch(() => {})
      .then(() =>
        fetch("/api/datos/" + modelo, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cache.colecciones[modelo])
        })
      )
      .then(res => {
        if (!res.ok) console.error("No se pudo guardar la colección:", modelo, res.status);
      })
      .catch(err => console.error("No se pudo guardar la colección:", modelo, err));
  }

  function guardarConfigRemoto() {
    if (!cargado || modo !== "servidor") return;
    cola = cola
      .catch(() => {})
      .then(() =>
        fetch("/api/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cache.config)
        })
      )
      .then(res => {
        if (!res.ok) console.error("No se pudo guardar la configuración:", res.status);
      })
      .catch(err => console.error("No se pudo guardar la configuración:", err));
  }

  function guardarAntesDeSalir() {
    if (!cargado || modo !== "servidor") return;
    fetch("/api/datos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(instante()),
      keepalive: true
    }).catch(() => {});
  }

  function get(clave, def) {
    const modelo = MODELOS[clave];
    if (modelo) return cache.colecciones[modelo];
    const valor = cache.config[clave];
    return valor === undefined ? def : valor;
  }

  function set(clave, valor) {
    const modelo = MODELOS[clave];
    if (modelo) {
      cache.colecciones[modelo] = valor;
    } else {
      cache.config[clave] = valor;
    }
    sincronizarStateCache(clave);
    if (modo === "local") {
      try {
        localStorage.setItem(clave, JSON.stringify(valor));
      } catch (err) {}
    }
    if (modelo) {
      guardarColeccion(modelo);
    } else {
      guardarConfigRemoto();
    }
    respaldarLocal();
  }

  function sincronizarStateCache(clave) {
    const modelo = MODELOS[clave];
    if (modelo) {
      State[traductorModelo[modelo]] = cache.colecciones[modelo];
    } else if (clave === "orto_config") {
      State.config = cache.config[clave];
    } else if (clave === "orto_session") {
      State.session = cache.config[clave];
    }
  }

  return {
    cargar,
    get,
    set,
    guardarAntesDeSalir
  };
})();

const State = {
  users: [],
  session: null,
  pacientes: [],
  citas: [],
  registros: [],
  documentos: [],
  facturas: [],
  citasSinConsulta: [],
  recetas: [],
  config: null
};

const DB = {
  get: (clave, def) => BD.get(clave, def),
  set: (clave, valor) => BD.set(clave, valor)
};

const PROCEDIMIENTOS = [
  { nombre: "Consulta general", precio: 50 },
  { nombre: "Consulta de control", precio: 40 },
  { nombre: "Radiografía", precio: 80 },
  { nombre: "Infiltración", precio: 90 },
  { nombre: "Terapia física", precio: 60 },
  { nombre: "Yeso / Inmovilización", precio: 100 },
  { nombre: "Colocación de órtesis", precio: 150 },
  { nombre: "Cirugía menor", precio: 300 }
];

function genTurno(fecha) {
  return State.citas.filter(c => c.fecha === fecha).length + 1;
}

const LIMITE_DIA_CITAS = 30;
const LIMITE_SEMANA_CITAS = 150;

const CONFIG_DEFECTO = {
  seccionFacturacion: true,
  seccionDocumentos: true,
  seccionRegistros: true,
  seccionCitas: true,
  seccionRecetas: true,
  seccionPacientesEliminados: true,
  seccionPacientes: true,
  estadisticas: true,
  calendario: true,
  citasSinConsulta: true,
  modoOscuro: true,
  recuperarContrasena: true,
  registroPublico: true,
  limiteDiaCitas: 30,
  limiteSemanaCitas: 150
};

function configuracion() {
  return State.config || CONFIG_DEFECTO;
}

function limiteDia() {
  return Number(configuracion().limiteDiaCitas) || LIMITE_DIA_CITAS;
}

function limiteSemana() {
  return Number(configuracion().limiteSemanaCitas) || LIMITE_SEMANA_CITAS;
}

function migrarDatos() {
  const users = State.users || [];
  let changed = false;
  users.forEach(u => {
    if (!u.role) {
      u.role = users.length === 1 ? "admin" : "usuario";
      changed = true;
    }
  });
  if (users.length && !users.some(u => u.role === "admin")) {
    const target = users.find(u => State.session && u.id === State.session.id) || users[0];
    target.role = "admin";
    changed = true;
  }
  if (changed) saveKey("users");
  if (State.session && Array.isArray(State.users)) {
    const fresh = State.users.find(u => u.id === State.session.id);
    if (fresh) {
      State.session = fresh;
      DB.set("orto_session", fresh);
    }
  }
  if (!State.config) {
    State.config = { ...CONFIG_DEFECTO };
    saveKey("config");
  }
}

function migrateOnLoad() {
  migrarDatos();
}

function citasEnDia(fecha) {
  return State.citas.filter(c => c.fecha === fecha && !c.completada).length;
}

function inicioSemana(fechaStr) {
  const d = new Date(fechaStr + "T00:00:00");
  const diff = (d.getDay() === 0 ? -6 : 1 - d.getDay());
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

function citasEnSemana(fechaStr) {
  const inicio = inicioSemana(fechaStr);
  const fin = new Date(inicio + "T00:00:00");
  fin.setDate(fin.getDate() + 6);
  const finISO = fin.toISOString().split("T")[0];
  return State.citas.filter(c => c.fecha >= inicio && c.fecha <= finISO && !c.completada).length;
}

function validarLimiteCitas(fecha) {
  if (citasEnDia(fecha) >= limiteDia()) {
    return `Límite diario alcanzado (${limiteDia()} citas ese día).`;
  }
  if (citasEnSemana(fecha) >= limiteSemana()) {
    return `Límite semanal alcanzado (${limiteSemana()} citas en la semana).`;
  }
  return null;
}

function saveKey(key) {
  DB.set("orto_" + key, State[key]);
}

function isLoginPage() {
  return document.getElementById("loginForm") !== null;
}

function initLogin() {
  if (!isLoginPage()) return;

  migrateOnLoad();
  initDarkMode();

  const cfg = configuracion();

  const tabLogin = document.getElementById("tabLogin");
  const tabRegister = document.getElementById("tabRegister");
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const recoverForm = document.getElementById("recoverForm");
  const btnMostrarRecuperar = document.getElementById("btnMostrarRecuperar");
  const btnVolverLogin = document.getElementById("btnVolverLogin");

  if (cfg.registroPublico === false && tabRegister) tabRegister.classList.add("hidden");
  if (cfg.recuperarContrasena === false && btnMostrarRecuperar) btnMostrarRecuperar.closest(".login-recover-toggle").classList.add("hidden");

  function switchTab(showLogin) {
    tabLogin.classList.toggle("active", showLogin);
    tabRegister.classList.toggle("active", !showLogin);
    loginForm.classList.toggle("hidden", !showLogin);
    registerForm.classList.toggle("hidden", showLogin);
    if (recoverForm) recoverForm.classList.add("hidden");
  }

  tabLogin.addEventListener("click", () => switchTab(true));
  tabRegister.addEventListener("click", () => switchTab(false));

  if (btnMostrarRecuperar) {
    btnMostrarRecuperar.addEventListener("click", () => {
      loginForm.classList.add("hidden");
      recoverForm.classList.remove("hidden");
    });
  }
  if (btnVolverLogin) {
    btnVolverLogin.addEventListener("click", () => {
      recoverForm.classList.add("hidden");
      loginForm.classList.remove("hidden");
    });
  }
  if (recoverForm) {
    recoverForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = document.getElementById("recoverEmail").value.trim().toLowerCase();
      const msg = document.getElementById("recoverMsg");
      const user = State.users.find(u => u.email === email);
      if (!user) {
        msg.textContent = "No existe ninguna cuenta con ese correo.";
        msg.className = "form-msg error";
        return;
      }
      msg.textContent = `Contraseña de tu cuenta: ${user.password}`;
      msg.className = "form-msg ok";
    });
  }

  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value.trim().toLowerCase();
    const password = document.getElementById("loginPassword").value;
    const msg = document.getElementById("loginMsg");

    const user = State.users.find(u => u.email === email && u.password === password);
    if (!user) {
      msg.textContent = "Correo o contraseña incorrectos.";
      msg.className = "form-msg error";
      return;
    }
    State.session = user;
    DB.set("orto_session", user);
    window.location.href = "index.html";
  });

  registerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("regName").value.trim();
    const email = document.getElementById("regEmail").value.trim().toLowerCase();
    const password = document.getElementById("regPassword").value;
    const msg = document.getElementById("regMsg");

    if (!name || !email || !password) {
      msg.textContent = "Completa todos los campos.";
      msg.className = "form-msg error";
      return;
    }
    if (State.users.some(u => u.email === email)) {
      msg.textContent = "Ese correo ya tiene una cuenta.";
      msg.className = "form-msg error";
      return;
    }

    const esPrimerUsuario = (State.users || []).length === 0;
    const user = {
      id: Date.now(),
      name,
      email,
      password,
      role: esPrimerUsuario ? "admin" : "usuario",
      createdAt: new Date().toISOString()
    };
    State.users.push(user);
    saveKey("users");
    msg.textContent = esPrimerUsuario
      ? "Administrador creado correctamente. Ya puedes iniciar sesión."
      : "Usuario creado correctamente. Ya puedes iniciar sesión.";
    msg.className = "form-msg ok";
    registerForm.reset();
    switchTab(true);
  });
}

function logout() {
  State.session = null;
  DB.set("orto_session", null);
  window.location.href = "login.html";
}

function esAdmin() {
  return !!(State.session && State.session.role === "admin");
}

function actualizarAccesosAdmin() {
  const admin = esAdmin();
  const btnAdmin = document.getElementById("btnAdmin");
  if (btnAdmin) {
    btnAdmin.hidden = !admin;
    btnAdmin.classList.toggle("hidden", !admin);
  }
  const btnAyuda = document.getElementById("btnAyuda");
  if (btnAyuda) {
    btnAyuda.hidden = !admin;
    btnAyuda.classList.toggle("hidden", !admin);
  }
  const subElim = document.querySelector('.nav-sub-item[data-seccion="pacientes-eliminados"]');
  if (subElim) subElim.classList.toggle("hidden", !admin);
  const regItem = document.querySelector('.nav-item[data-seccion="registros"]');
  if (regItem) {
    const caret = regItem.querySelector(".nav-caret");
    const sub = regItem.querySelector(".nav-sub");
    if (!admin) {
      if (caret) caret.remove();
      if (sub) sub.remove();
    }
  }
}

function abrirAdmin() {
  actualizarAccesosAdmin();
  renderUsuarios();
  cargarOpcionesConfig();
  mostrarSeccion("admin");
  const title = document.getElementById("pageTitle");
  if (title) title.textContent = "Administración";
}

function renderUsuarios() {
  const lista = document.getElementById("listaUsuarios");
  const countEl = document.getElementById("countUsuarios");
  if (!lista) return;

  const users = State.users || [];
  if (countEl) countEl.textContent = users.length;

  if (users.length === 0) {
    lista.innerHTML = `<p class="empty">No hay usuarios registrados.</p>`;
    return;
  }

  lista.innerHTML = users.map(u => {
    const yo = State.session && u.id === State.session.id;
    return `
      <div class="list-item">
        <div class="item-main">
          <strong>${u.name}${yo ? " (tú)" : ""}</strong>
          <span class="tag tag-role">${u.role === "admin" ? "Administrador" : "Usuario"}</span>
        </div>
        <div class="item-sub">${u.email}</div>
        <div class="item-actions">
          ${yo ? "" : `<select class="sel-role" data-rol="${u.id}" title="Cambiar rol">
            <option value="usuario" ${u.role === "usuario" ? "selected" : ""}>Usuario</option>
            <option value="admin" ${u.role === "admin" ? "selected" : ""}>Administrador</option>
          </select>`}
          <button class="btn btn--ghost-dark btn-small" data-reset-pass="${u.id}" title="Restablecer contraseña">
            <span class="material-symbols-outlined">key</span> Contraseña
          </button>
          ${yo ? "" : `<button class="btn-icon danger" data-borrar-user="${u.id}" title="Eliminar usuario">
            <span class="material-symbols-outlined">delete</span>
          </button>`}
        </div>
      </div>
    `;
  }).join("");

  lista.querySelectorAll("[data-rol]").forEach(sel =>
    sel.addEventListener("change", () => cambiarRol(Number(sel.dataset.rol), sel.value))
  );
  lista.querySelectorAll("[data-reset-pass]").forEach(b =>
    b.addEventListener("click", () => resetearPassword(Number(b.dataset.resetPass)))
  );
  lista.querySelectorAll("[data-borrar-user]").forEach(b =>
    b.addEventListener("click", () => eliminarUsuario(Number(b.dataset.borrarUser)))
  );
}

function cambiarRol(id, role) {
  const u = State.users.find(x => x.id === id);
  if (!u) return;
  const admins = State.users.filter(x => x.role === "admin").length;
  if (u.role === "admin" && role !== "admin" && admins <= 1) {
    alert("No se puede quitar el rol de administrador al último administrador.");
    renderUsuarios();
    return;
  }
  u.role = role;
  saveKey("users");
  renderUsuarios();
}

function resetearPassword(id) {
  const u = State.users.find(x => x.id === id);
  if (!u) return;
  const nueva = prompt(`Nueva contraseña para ${u.name}:`, u.password);
  if (nueva === null) return;
  if (!nueva || nueva.length < 4) {
    alert("La contraseña debe tener al menos 4 caracteres.");
    return;
  }
  u.password = nueva;
  saveKey("users");
  alert("Contraseña restablecida correctamente.");
  renderUsuarios();
}

function eliminarUsuario(id) {
  const u = State.users.find(x => x.id === id);
  if (!u || (State.session && u.id === State.session.id)) return;
  if (u.role === "admin" && State.users.filter(x => x.role === "admin").length <= 1) {
    alert("No se puede eliminar al último administrador.");
    return;
  }
  if (!confirm(`¿Eliminar al usuario "${u.name}"?`)) return;
  State.users = State.users.filter(x => x.id !== id);
  saveKey("users");
  renderUsuarios();
}

function crearUsuarioAdmin(e) {
  e.preventDefault();
  const name = document.getElementById("auNombre").value.trim();
  const email = document.getElementById("auEmail").value.trim().toLowerCase();
  const password = document.getElementById("auPassword").value;
  const role = document.getElementById("auRol").value;
  const msg = document.getElementById("auMsg");

  if (!name || !email || !password) {
    msg.textContent = "Completa todos los campos.";
    msg.className = "form-msg error";
    return;
  }
  if (State.users.some(u => u.email === email)) {
    msg.textContent = "Ese correo ya tiene una cuenta.";
    msg.className = "form-msg error";
    return;
  }
  State.users.push({ id: Date.now(), name, email, password, role, createdAt: new Date().toISOString() });
  saveKey("users");
  msg.textContent = role === "admin" ? "Administrador creado correctamente." : "Usuario creado correctamente.";
  msg.className = "form-msg ok";
  document.getElementById("auNombre").value = "";
  document.getElementById("auEmail").value = "";
  document.getElementById("auPassword").value = "";
  renderUsuarios();
}

const OPCIONES_SISTEMA = [
  ["seccionPacientes", "Mostrar sección Pacientes"],
  ["seccionPacientesEliminados", "Mostrar sección Pacientes eliminados"],
  ["seccionCitas", "Mostrar sección Citas"],
  ["seccionRecetas", "Mostrar sección Recetas médicas"],
  ["seccionRegistros", "Mostrar sección Registros"],
  ["seccionDocumentos", "Mostrar sección Documentos"],
  ["seccionFacturacion", "Mostrar sección Facturación"],
  ["estadisticas", "Mostrar estadísticas (Pacientes atendidos)"],
  ["calendario", "Mostrar calendario de citas"],
  ["citasSinConsulta", "Mostrar panel de citas sin consulta"],
  ["citasCompletadas", "Mostrar panel de citas completadas y diagnósticos"],
  ["modoOscuro", "Permitir modo oscuro"],
  ["recuperarContrasena", "Permitir recuperar contraseña en el login"],
  ["registroPublico", "Permitir crear usuarios desde el login"]
];

function cargarOpcionesConfig() {
  const cont = document.getElementById("configOpciones");
  if (!cont) return;
  const cfg = configuracion();
  cont.innerHTML = OPCIONES_SISTEMA.map(([key, label]) => `
    <label class="list-item toggle-row">
      <input type="checkbox" data-cfg="${key}" ${cfg[key] !== false ? "checked" : ""} />
      <span>${label}</span>
    </label>
  `).join("");
  const limD = document.getElementById("cfgLimiteDia");
  const limS = document.getElementById("cfgLimiteSemana");
  if (limD) limD.value = cfg.limiteDiaCitas;
  if (limS) limS.value = cfg.limiteSemanaCitas;
}

function guardarConfig() {
  const cfg = configuracion();
  document.querySelectorAll("[data-cfg]").forEach(cb => {
    cfg[cb.dataset.cfg] = cb.checked;
  });
  const limD = document.getElementById("cfgLimiteDia");
  const limS = document.getElementById("cfgLimiteSemana");
  if (limD && Number(limD.value) >= 1) cfg.limiteDiaCitas = Number(limD.value);
  if (limS && Number(limS.value) >= 1) cfg.limiteSemanaCitas = Number(limS.value);
  State.config = cfg;
  saveKey("config");
  aplicarConfig();
  actualizarAccesosAdmin();
  const msg = document.getElementById("cfgMsg");
  if (msg) {
    msg.textContent = "Opciones guardadas y aplicadas.";
    msg.className = "form-msg ok";
    setTimeout(() => { msg.textContent = ""; msg.className = "form-msg"; }, 2500);
  }
}

function aplicarConfig() {
  const cfg = configuracion();
  const navMap = {
    pacientes: "seccionPacientes",
    citas: "seccionCitas",
    recetas: "seccionRecetas",
    registros: "seccionRegistros",
    documentos: "seccionDocumentos",
    facturacion: "seccionFacturacion"
  };
  document.querySelectorAll(".nav-item").forEach(item => {
    const key = navMap[item.dataset.seccion];
    const oculto = key && cfg[key] === false;
    item.classList.toggle("hidden", !!oculto);
    if (oculto) {
      const sec = document.getElementById("seccion-" + item.dataset.seccion);
      if (sec && sec.classList.contains("active")) mostrarSeccion("inicio");
    }
  });

  const subCompletadas = document.querySelector('.nav-sub-item[data-seccion="citas-completadas"]');
  if (subCompletadas) subCompletadas.classList.toggle("hidden", cfg.citasCompletadas === false);
  const secCompletadas = document.getElementById("seccion-citas-completadas");
  if (cfg.citasCompletadas === false && secCompletadas && secCompletadas.classList.contains("active")) mostrarSeccion("inicio");

  const subSinConsulta = document.querySelector('.nav-sub-item[data-seccion="citas-sin-consulta"]');
  if (subSinConsulta) subSinConsulta.classList.toggle("hidden", cfg.citasSinConsulta === false);
  const secSinConsulta = document.getElementById("seccion-citas-sin-consulta");
  if (cfg.citasSinConsulta === false && secSinConsulta && secSinConsulta.classList.contains("active")) mostrarSeccion("inicio");

  const subEliminados = document.querySelector('.nav-sub-item[data-seccion="pacientes-eliminados"]');
  if (subEliminados) subEliminados.classList.toggle("hidden", cfg.seccionPacientesEliminados === false);
  const secEliminados = document.getElementById("seccion-pacientes-eliminados");
  if (cfg.seccionPacientesEliminados === false && secEliminados && secEliminados.classList.contains("active")) mostrarSeccion("inicio");

  const porId = {
    btnAbrirStatsPanel: "estadisticas",
    btnCalendario: "calendario",
    panelCitasSinConsulta: "citasSinConsulta",
    panelCitasCompletadas: "citasCompletadas",
    dashPanelSinConsulta: "citasSinConsulta",
    dashPanelCompletadas: "citasCompletadas"
  };
  for (const id in porId) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("hidden", cfg[porId[id]] === false);
  }
  const btnModo = document.getElementById("btnModoOscuro");
  if (btnModo) btnModo.classList.toggle("hidden", cfg.modoOscuro === false);
}

function initNavigation() {
  const sideMenu = document.getElementById("lateral");
  const rotador = document.getElementById("rotador");
  const rotadorIcon = document.getElementById("rotadorIcon");

  if (!rotador || !sideMenu) return;

  function updateIcon() {
    const isOpen = sideMenu.classList.contains("active");
    rotadorIcon.textContent = isOpen ? "folder_open" : "folder";
    rotadorIcon.classList.toggle("abierta", isOpen);
    rotador.setAttribute("aria-expanded", String(isOpen));
    document.body.classList.toggle("menu-open", isOpen);
  }

  rotador.addEventListener("click", () => {
    sideMenu.classList.toggle("active");
    updateIcon();
  });

  document.querySelectorAll(".nav-item > a").forEach(link => {
    link.addEventListener("click", () => {
      const item = link.closest(".nav-item");
      const sub = item ? item.querySelector(".nav-sub") : null;
      if (sub) {
        item.classList.toggle("open");
        sub.classList.toggle("open");
        return;
      }
      sideMenu.classList.remove("active");
      updateIcon();
    });
  });

  document.querySelectorAll(".nav-sub-item > a").forEach(link => {
    link.addEventListener("click", () => {
      sideMenu.classList.remove("active");
      updateIcon();
    });
  });

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", logout);
}

function pacientesActivos() {
  return State.pacientes.filter(p => !p.eliminado);
}

function pacienteEliminadoDe(pacienteId) {
  const p = State.pacientes.find(x => x.id === pacienteId);
  return !!(p && p.eliminado);
}

function genCodigoPaciente() {
  const prefix = "ORT";
  const num = 1000 + pacientesActivos().length;
  return prefix + "-" + num;
}

function renderPacientes(filtro = "") {
  const lista = document.getElementById("listaPacientes");
  if (!lista) return;

  const q = filtro.trim().toLowerCase();
  const data = pacientesActivos().filter(p => {
    if (!q) return true;
    return (
      p.nombre.toLowerCase().includes(q) ||
      p.codigo.toLowerCase().includes(q) ||
      (p.telefono || "").toLowerCase().includes(q)
    );
  });

  if (data.length === 0) {
    lista.innerHTML = `<p class="empty">No se encontraron pacientes.</p>`;
    return;
  }

  lista.innerHTML = data.map(p => `
    <div class="list-item" data-id="${p.id}">
      <div class="item-main">
        <strong>${p.nombre}</strong>
        <span class="tag">${p.codigo}</span>
        ${p.cedula ? `<span class="tag">Cédula: ${p.cedula}</span>` : ""}
      </div>
      <div class="item-sub">Edad: ${p.edad || "-"} · Sexo: ${p.sexo || "-"} · Seguro: ${p.seguro || "-"} · Tel: ${p.telefono || "-"}</div>
      <div class="item-actions">
        <button class="btn-icon" data-ver="${p.id}" title="Ver ficha">
          <span class="material-symbols-outlined">visibility</span>
        </button>
        <button class="btn-icon danger" data-borrar="${p.id}" title="Eliminar">
          <span class="material-symbols-outlined">delete</span>
        </button>
      </div>
    </div>
  `).join("");

  lista.querySelectorAll("[data-ver]").forEach(b =>
    b.addEventListener("click", () => verPaciente(Number(b.dataset.ver)))
  );
  lista.querySelectorAll("[data-borrar]").forEach(b =>
    b.addEventListener("click", () => borrarPaciente(Number(b.dataset.borrar)))
  );

  renderPacientesSinCita();
  renderCitasAux();
}

let pacienteActual = null;

function renderPacientesSinCita() {
  const lista = document.getElementById("listaSinCitas");
  const countEl = document.getElementById("countSinCita");
  if (!lista) return;

  const sinCita = pacientesActivos().filter(p => !State.citas.some(c => c.pacienteId === p.id && !c.completada));
  if (countEl) countEl.textContent = sinCita.length;

  if (sinCita.length === 0) {
    lista.innerHTML = `<p class="empty">Todos los pacientes tienen al menos una cita.</p>`;
    return;
  }

  lista.innerHTML = sinCita.map(p => `
    <div class="list-item">
      <div class="item-main">
        <strong>${p.nombre}</strong>
        <span class="tag">${p.codigo}</span>
      </div>
      <div class="item-sub">Cédula: ${p.cedula || "-"} · Seguro: ${p.seguro || "-"}</div>
      <div class="item-actions">
        <button class="btn btn--primary btn-small" data-agendar="${p.id}">
          <span class="material-symbols-outlined">event</span> Agendar cita
        </button>
      </div>
    </div>
  `).join("");

  lista.querySelectorAll("[data-agendar]").forEach(b =>
    b.addEventListener("click", () => agendarPacienteSinCita(Number(b.dataset.agendar)))
  );
}

let agendarCitaId = null;

function agendarPacienteSinCita(id) {
  const p = State.pacientes.find(x => x.id === id);
  agendarCitaId = id;
  const nombre = document.getElementById("agendarPacienteNombre");
  if (nombre) nombre.textContent = p ? `${p.codigo} — ${p.nombre}` : "Paciente desconocido";
  const fecha = document.getElementById("agendarFecha");
  if (fecha) fecha.valueAsDate = new Date();
  const hora = document.getElementById("agendarHora");
  if (hora) hora.value = "09:00";
  const motivo = document.getElementById("agendarMotivo");
  if (motivo) motivo.value = "";
  updateLimiteAgendar(fecha ? fecha.value : "");
  abrirModal("modalAgendar");
}

function updateLimiteAgendar(fecha) {
  const el = document.getElementById("agendarLimiteInfo");
  if (!el) return;
  if (!fecha) {
    el.textContent = "";
    return;
  }
  el.textContent = `Citas ese día: ${citasEnDia(fecha)}/${limiteDia()} · Citas en la semana: ${citasEnSemana(fecha)}/${limiteSemana()}`;
  el.classList.toggle("limite-error", validarLimiteCitas(fecha) !== null);
}

function abrirModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add("open");
}

function cerrarModales() {
  document.querySelectorAll(".modal-backdrop.open").forEach(m => m.classList.remove("open"));
}

function mostrarNotificacion(mensaje) {
  let cont = document.getElementById("toast-container");
  if (!cont) {
    cont = document.createElement("div");
    cont.className = "toast-container";
    cont.id = "toast-container";
    document.body.appendChild(cont);
  }
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `
    <span class="material-symbols-outlined toast-check">check_circle</span>
    <div class="toast-msg">
      <strong>${mensaje}</strong>
      <span>Guardado correctamente</span>
    </div>`;
  cont.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.add("hide");
    setTimeout(() => toast.remove(), 350);
  }, 3400);
}

function renderCitasAux() {
  const listaSin = document.getElementById("listaSinCitasCitas");
  const countSin = document.getElementById("countSinCitaCitas");
  const listaSeg = document.getElementById("listaSeguimiento");
  const countSeg = document.getElementById("countSeguimiento");

  const sinCita = pacientesActivos().filter(p => !State.citas.some(c => c.pacienteId === p.id && !c.completada));
  if (countSin) countSin.textContent = sinCita.length;

  if (listaSin) {
    if (sinCita.length === 0) {
      listaSin.innerHTML = `<p class="empty">Todos los pacientes tienen al menos una cita.</p>`;
    } else {
      listaSin.innerHTML = sinCita.map(p => `
        <div class="list-item">
          <div class="item-main">
            <strong>${p.nombre}</strong>
            <span class="tag">${p.codigo}</span>
          </div>
          <div class="item-sub">Cédula: ${p.cedula || "-"} · Seguro: ${p.seguro || "-"}</div>
          <div class="item-actions">
            <button class="btn btn--primary btn-small" data-agendar-cita="${p.id}">
              <span class="material-symbols-outlined">event</span> Agendar cita
            </button>
          </div>
        </div>
      `).join("");
    }
    listaSin.querySelectorAll("[data-agendar-cita]").forEach(b =>
      b.addEventListener("click", () => agendarPacienteSinCita(Number(b.dataset.agendarCita)))
    );
  }

  const hoy = new Date().toISOString().split("T")[0];
  const enSeguimiento = pacientesActivos().filter(p => {
    const tieneRegistros = State.registros.some(r => r.pacienteId === p.id);
    const tieneProximaCita = State.citas.some(c => c.pacienteId === p.id && c.fecha >= hoy && !c.completada);
    return tieneRegistros || tieneProximaCita;
  });
  if (countSeg) countSeg.textContent = enSeguimiento.length;

  if (listaSeg) {
    if (enSeguimiento.length === 0) {
      listaSeg.innerHTML = `<p class="empty">No hay pacientes en seguimiento.</p>`;
    } else {
      listaSeg.innerHTML = enSeguimiento.map(p => {
        const nRegistros = State.registros.filter(r => r.pacienteId === p.id).length;
        const prox = State.citas
          .filter(c => c.pacienteId === p.id && c.fecha >= hoy && !c.completada)
          .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora))[0];
        return `
          <div class="list-item">
            <div class="item-main">
              <strong>${p.nombre}</strong>
              <span class="tag">${p.codigo}</span>
            </div>
            <div class="item-sub">Registros: ${nRegistros}${prox ? ` · Próxima cita: ${prox.fecha} ${fmtHora12(prox.hora, prox.amPm)}` : ""}</div>
            <div class="item-actions">
              <button class="btn btn--ghost-dark btn-small" data-ver-registros="${p.id}">
                <span class="material-symbols-outlined">folder_open</span> Ver registros
              </button>
            </div>
          </div>
        `;
      }).join("");
    }
    listaSeg.querySelectorAll("[data-ver-registros]").forEach(b =>
      b.addEventListener("click", () => mostrarSeccion("registros"))
    );
  }
}

function updateCitaLimiteInfo() {
  const el = document.getElementById("citaLimiteInfo");
  if (!el) return;
  const fecha = document.getElementById("citaFecha") ? document.getElementById("citaFecha").value : "";
  if (!fecha) {
    el.textContent = "";
    el.classList.remove("limite-error");
    return;
  }
  const enDia = citasEnDia(fecha);
  const enSemana = citasEnSemana(fecha);
  el.textContent = `Citas ese día: ${enDia}/${limiteDia()} · Citas en la semana: ${enSemana}/${limiteSemana()}`;
  el.classList.toggle("limite-error", validarLimiteCitas(fecha) !== null);
}

function verPaciente(id) {
  const p = State.pacientes.find(x => x.id === id);
  const panel = document.getElementById("detallePacientePanel");
  const cont = document.getElementById("detallePaciente");
  if (!p || !panel || !cont) return;
  pacienteActual = id;

  const citas = State.citas.filter(c => c.pacienteId === id);
  const documentos = State.documentos.filter(d => d.pacienteId === id);
  const hoy = new Date().toISOString().split("T")[0];
  const proximas = State.citas
    .filter(c => c.pacienteId === id && c.fecha >= hoy)
    .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
  const prox = proximas[0];

  cont.innerHTML = `
    <div class="ficha">
      <div class="ficha-head">
        <span class="tag">${p.codigo}</span>
        <h3>${p.nombre}</h3>
      </div>
      <p><strong>Cédula:</strong> ${p.cedula || "-"} · <strong>Seguro:</strong> ${p.seguro || "-"}</p>
      <p><strong>Edad:</strong> ${p.edad || "-"} · <strong>Sexo:</strong> ${p.sexo || "-"}</p>
      <p><strong>Teléfono:</strong> ${p.telefono || "-"} · <strong>Correo:</strong> ${p.email || "-"}</p>
      <p><strong>Notas:</strong> ${p.notas || "Sin notas"}</p>
      <div class="prox-cita">
        <strong>Próxima cita:</strong>
        ${prox ? `${prox.fecha} · ${fmtHora12(prox.hora, prox.amPm)} — ${prox.motivo}` : "Sin cita programada"}
      </div>
      <div class="ficha-stats">
        <span>${citas.length} citas</span>
        <span>${documentos.length} documentos</span>
      </div>
    </div>
  `;
  panel.hidden = false;
  panel.scrollIntoView({ behavior: "smooth" });
}

function imprimirFichaPaciente(id) {
  const p = State.pacientes.find(x => x.id === id);
  if (!p) return;
  const citas = State.citas.filter(c => c.pacienteId === id);
  const documentos = State.documentos.filter(d => d.pacienteId === id);
  const hoy = new Date().toISOString().split("T")[0];
  const proximas = State.citas
    .filter(c => c.pacienteId === id && c.fecha >= hoy)
    .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
  const prox = proximas[0];

  abrirImpresion("Ficha del paciente", `
    <div class="ficha-print-head">
      <h3>${p.nombre}</h3>
      <span>Código: ${p.codigo}</span>
    </div>
    <table>
      <tbody>
        <tr><td><strong>Cédula</strong></td><td>${p.cedula || "-"}</td></tr>
        <tr><td><strong>Seguro</strong></td><td>${p.seguro || "-"}</td></tr>
        <tr><td><strong>Edad</strong></td><td>${p.edad || "-"}</td></tr>
        <tr><td><strong>Sexo</strong></td><td>${p.sexo || "-"}</td></tr>
        <tr><td><strong>Teléfono</strong></td><td>${p.telefono || "-"}</td></tr>
        <tr><td><strong>Correo</strong></td><td>${p.email || "-"}</td></tr>
        <tr><td><strong>Próxima cita</strong></td><td>${prox ? `${prox.fecha} · ${fmtHora12(prox.hora, prox.amPm)} — ${prox.motivo}` : "Sin cita programada"}</td></tr>
        <tr><td><strong>Notas</strong></td><td>${p.notas || "Sin notas"}</td></tr>
      </tbody>
    </table>
    <p style="margin-top:8px"><strong>Citas:</strong> ${citas.length} · <strong>Documentos:</strong> ${documentos.length}</p>
  `);
}

function borrarPaciente(id) {
  const p = State.pacientes.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`¿Eliminar a "${p.nombre}" de la lista de pacientes?\n\nSus registros se conservarán en la sección Registros. Podrás eliminarlos definitivamente desde ahí con tu contraseña.`)) return;
  p.eliminado = true;
  p.fechaEliminado = isoLocal(new Date());
  const hoy = isoLocal(new Date());
  State.citas = State.citas.filter(c => c.pacienteId !== id || c.fecha < hoy);
  saveKey("pacientes");
  saveKey("citas");
  renderPacientes(document.getElementById("buscarPaciente").value);
  renderCitas();
  renderDocumentos();
  renderFacturas();
  renderRecetas();
  renderRegistros();
  renderCitasAux();
  renderPacientesEliminados();
  renderHome();
}

function renderPacientesEliminados() {
  const lista = document.getElementById("listaEliminados");
  const countEl = document.getElementById("countEliminados");
  if (!lista) return;

  const eliminados = State.pacientes.filter(p => p.eliminado);
  if (countEl) countEl.textContent = eliminados.length;

  if (eliminados.length === 0) {
    lista.innerHTML = `<p class="empty">No hay pacientes eliminados. Cuando elimines un paciente de la sección Pacientes, aparecerá aquí para quitar sus datos definitivamente con tu contraseña.</p>`;
    return;
  }

  lista.innerHTML = eliminados.map(p => {
    const nRegistros = State.registros.filter(r => r.pacienteId === p.id).length;
    const nDoc = State.documentos.filter(d => d.pacienteId === p.id).length;
    const nFact = State.facturas.filter(f => f.pacienteId === p.id).length;
    return `
      <div class="list-item">
        <div class="item-main">
          <strong>${p.nombre}</strong>
          <span class="tag">${p.codigo}</span>
          <span class="tag tag-elim">Eliminado</span>
        </div>
        <div class="item-sub">Eliminado el ${p.fechaEliminado || "-"} · ${nRegistros} registros · ${nDoc} documentos · ${nFact} facturas</div>
        <div class="item-actions">
          <button class="btn btn--ghost-dark btn-small" data-borrar-def="${p.id}">
            <span class="material-symbols-outlined">delete_forever</span> Eliminar definitivamente
          </button>
        </div>
      </div>
    `;
  }).join("");

  lista.querySelectorAll("[data-borrar-def]").forEach(b =>
    b.addEventListener("click", () => pedirEliminacionDefinitiva(Number(b.dataset.borrarDef)))
  );
}

let pendienteEliminarDef = null;

function pedirEliminacionDefinitiva(id) {
  const p = State.pacientes.find(x => x.id === id);
  if (!p) return;
  pendienteEliminarDef = id;
  const pass = document.getElementById("confPassword");
  if (pass) pass.value = "";
  const msg = document.getElementById("confElimMsg");
  if (msg) {
    msg.textContent = "";
    msg.className = "form-msg";
  }
  const texto = document.getElementById("confElimTexto");
  if (texto) texto.textContent = `Se eliminarán definitivamente las citas, citas sin consulta, registros, documentos, facturas y recetas de "${p.nombre}" (${p.codigo}). Esta acción no se puede deshacer.`;
  abrirModal("modalConfirmarEliminacion");
  if (pass) setTimeout(() => pass.focus(), 50);
}

function confirmarEliminacionDefinitiva() {
  if (pendienteEliminarDef === null) return;
  const id = pendienteEliminarDef;
  const p = State.pacientes.find(x => x.id === id);
  const pass = document.getElementById("confPassword");
  const passVal = pass ? pass.value : "";
  const user = State.users.find(u => u.id === (State.session && State.session.id));
  const msg = document.getElementById("confElimMsg");
  const ok = user && user.password === passVal;
  if (msg) {
    if (!ok) {
      msg.textContent = "Contraseña incorrecta. Introduce tu contraseña de usuario.";
      msg.className = "form-msg error";
      if (pass) { pass.value = ""; setTimeout(() => pass.focus(), 50); }
      return;
    }
    msg.textContent = "";
    msg.className = "form-msg";
  }
  State.pacientes = State.pacientes.filter(x => x.id !== id);
  State.citas = State.citas.filter(c => c.pacienteId !== id);
  State.registros = State.registros.filter(r => r.pacienteId !== id);
  State.documentos = State.documentos.filter(d => d.pacienteId !== id);
  State.facturas = State.facturas.filter(f => f.pacienteId !== id);
  State.citasSinConsulta = State.citasSinConsulta.filter(c => c.pacienteId !== id);
  State.recetas = State.recetas.filter(r => r.pacienteId !== id);
  ["pacientes", "citas", "registros", "documentos", "facturas", "citasSinConsulta", "recetas"].forEach(saveKey);
  pendienteEliminarDef = null;
  cerrarModales();
  renderPacientes(document.getElementById("buscarPaciente").value);
  renderCitas();
  renderCitasSinConsulta();
  renderDocumentos();
  renderFacturas();
  renderRecetas();
  renderRegistros();
  renderCitasAux();
  renderPacientesEliminados();
  renderHome();
}

function fillSelects() {
  const opts = pacientesActivos()
    .map(p => `<option value="${p.id}">${p.codigo} — ${p.nombre}</option>`)
    .join("");

  ["citaPaciente", "registroPaciente", "documentoPaciente", "facturaPaciente", "regEPaciente", "cscPaciente"].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) {
      sel.innerHTML = opts || `<option value="">Sin pacientes</option>`;
    }
  });

  const recetaSel = document.getElementById("recetaPaciente");
  if (recetaSel) {
    recetaSel.innerHTML = pacientesActivos()
      .map(p => `<option value="${p.id}">${p.codigo} — ${p.nombre} · ${p.edad ? p.edad + " años" : "s/e"}</option>`)
      .join("") || `<option value="">Sin pacientes</option>`;
  }
  updateRecetaEdad();
}

function renderCitas() {
  const lista = document.getElementById("listaCitas");
  if (!lista) return;

  const data = State.citas
    .filter(c => !c.completada)
    .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));

  if (data.length === 0) {
    lista.innerHTML = `<p class="empty">No hay citas pendientes registradas.</p>`;
    return;
  }

  lista.innerHTML = data.map(c => {
    const p = State.pacientes.find(x => x.id === c.pacienteId);
    const fecha = new Date(c.fecha + "T" + (c.hora || "00:00"));
    const opciones = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
    const fechaTxt = isNaN(fecha) ? c.fecha : fecha.toLocaleDateString("es-ES", opciones);
    return `
      <div class="list-item">
        <div class="item-main">
          <strong>${p ? p.nombre : "Paciente eliminado"}</strong>
          <span class="tag">${c.fecha} · ${fmtHora12(c.hora, c.amPm)}</span>
          <span class="tag">Turno ${c.turno || "—"}</span>
        </div>
        <div class="item-sub">${c.motivo || "Sin motivo"} · ${fechaTxt}</div>
        <div class="item-actions">
          <button class="btn-icon" data-completar-cita="${c.id}" title="Marcar como completada">
            <span class="material-symbols-outlined">check_circle</span>
          </button>
          ${pacienteEliminadoDe(c.pacienteId) ? "" : `<button class="btn-icon danger" data-borrar-cita="${c.id}" title="Eliminar cita">
            <span class="material-symbols-outlined">delete</span>
          </button>`}
        </div>
      </div>
    `;
  }).join("");

  lista.querySelectorAll("[data-completar-cita]").forEach(b =>
    b.addEventListener("click", () => abrirModalCompletarCita(Number(b.dataset.completarCita)))
  );

  lista.querySelectorAll("[data-borrar-cita]").forEach(b =>
    b.addEventListener("click", () => {
      State.citas = State.citas.filter(x => x.id !== Number(b.dataset.borrarCita));
      saveKey("citas");
      renderCitas();
      renderHome();
    })
  );
  renderCitasAux();
}

function renderCitasCompletadas() {
  const lista = document.getElementById("listaCitasCompletadas");
  if (!lista) return;
  const countEl = document.getElementById("countCitasCompletadas");

  const data = State.citas
    .filter(c => c.completada)
    .sort((a, b) => (b.fechaCompletada || b.fecha || "").localeCompare(a.fechaCompletada || a.fecha || ""));

  if (countEl) countEl.textContent = data.length;

  if (data.length === 0) {
    lista.innerHTML = `<p class="empty">No hay citas completadas todavía.</p>`;
    return;
  }

  lista.innerHTML = data.map(c => {
    const p = State.pacientes.find(x => x.id === c.pacienteId);
    const fechaComp = fmtFechaES(c.fechaCompletada || c.fecha);
    return `
      <div class="list-item">
        <div class="item-main">
          <strong>${p ? p.nombre : "Paciente eliminado"}</strong>
          <span class="tag">Completada ${fechaComp}</span>
          <span class="tag">Turno ${c.turno || "—"}</span>
        </div>
        <div class="item-sub"><strong class="diag-label">Diagnóstico:</strong> ${c.diagnostico || "—"}</div>
        ${c.tratamiento ? `<div class="item-sub"><strong class="diag-label">Tratamiento:</strong> ${c.tratamiento}</div>` : ""}
        <div class="item-actions">
          <button class="btn-icon" data-reabrir-cita="${c.id}" title="Reabrir cita">
            <span class="material-symbols-outlined">undo</span>
          </button>
          ${pacienteEliminadoDe(c.pacienteId) ? "" : `<button class="btn-icon danger" data-borrar-completada="${c.id}" title="Eliminar cita completada">
            <span class="material-symbols-outlined">delete</span>
          </button>`}
        </div>
      </div>
    `;
  }).join("");

  lista.querySelectorAll("[data-reabrir-cita]").forEach(b =>
    b.addEventListener("click", () => {
      const c = State.citas.find(x => x.id === Number(b.dataset.reabrirCita));
      if (!c) return;
      c.completada = false;
      delete c.diagnostico;
      delete c.tratamiento;
      delete c.fechaCompletada;
      saveKey("citas");
      renderCitas();
      renderCitasCompletadas();
      renderHome();
    })
  );

  lista.querySelectorAll("[data-borrar-completada]").forEach(b =>
    b.addEventListener("click", () => {
      if (!confirm("¿Eliminar esta cita completada?")) return;
      State.citas = State.citas.filter(x => x.id !== Number(b.dataset.borrarCompletada));
      saveKey("citas");
      renderCitas();
      renderCitasCompletadas();
      renderHome();
    })
  );
}

function renderCitasSinConsulta() {
  const lista = document.getElementById("listaCitasSinConsulta");
  const countEl = document.getElementById("countCitasSinConsulta");
  if (!lista) return;

  const data = [...State.citasSinConsulta].sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
  if (countEl) countEl.textContent = data.length;

  if (data.length === 0) {
    lista.innerHTML = `<p class="empty">No hay citas sin consulta. Usa el botón "Agregar" para registrar una.</p>`;
    return;
  }

  lista.innerHTML = data.map(c => {
    const p = State.pacientes.find(x => x.id === c.pacienteId);
    return `
      <div class="list-item">
        <div class="item-main">
          <strong>${p ? p.nombre : "Paciente eliminado"}</strong>
          <span class="tag">${c.fecha} · ${fmtHora12(c.hora, c.amPm)}</span>
          <span class="tag">Turno ${c.turno || "—"}</span>
        </div>
        <div class="item-sub">${c.motivo || "Sin motivo"}</div>
        <div class="item-actions">
          ${pacienteEliminadoDe(c.pacienteId) ? "" : `<button class="btn-icon danger" data-borrar-csc="${c.id}" title="Eliminar cita sin consulta">
            <span class="material-symbols-outlined">delete</span>
          </button>`}
        </div>
      </div>
    `;
  }).join("");

  lista.querySelectorAll("[data-borrar-csc]").forEach(b =>
    b.addEventListener("click", () => {
      State.citasSinConsulta = State.citasSinConsulta.filter(x => x.id !== Number(b.dataset.borrarCsc));
      saveKey("citasSinConsulta");
      renderCitasSinConsulta();
    })
  );
}

function abrirModalCitaSinConsulta() {
  fillSelects();
  const fecha = document.getElementById("cscFecha");
  if (fecha) fecha.valueAsDate = new Date();
  const hora = document.getElementById("cscHora");
  if (hora) hora.value = "09:00";
  const motivo = document.getElementById("cscMotivo");
  if (motivo) motivo.value = "";
  const sel = document.getElementById("cscPaciente");
  if (sel) sel.selectedIndex = 0;
  abrirModal("modalCitaSinConsulta");
}

let completandoCitaId = null;

function abrirModalCompletarCita(id) {
  const c = State.citas.find(x => x.id === id);
  if (!c) return;
  completandoCitaId = id;
  const p = State.pacientes.find(x => x.id === c.pacienteId);
  const t = document.getElementById("ccPacienteTexto");
  if (t) t.textContent = p ? `${p.nombre} · ${fmtFechaES(c.fecha)} · ${fmtHora12(c.hora, c.amPm)}` : "Paciente eliminado";
  const diag = document.getElementById("ccDiagnostico");
  const tra = document.getElementById("ccTratamiento");
  if (diag) diag.value = c.diagnostico || "";
  if (tra) tra.value = c.tratamiento || "";
  abrirModal("modalCompletarCita");
}

function guardarCitaCompletada(e) {
  e.preventDefault();
  if (!completandoCitaId) return;
  const c = State.citas.find(x => x.id === completandoCitaId);
  if (!c) return;
  c.completada = true;
  c.fechaCompletada = isoLocal(new Date());
  c.diagnostico = document.getElementById("ccDiagnostico").value.trim();
  c.tratamiento = document.getElementById("ccTratamiento").value.trim();
  saveKey("citas");
  const p = State.pacientes.find(x => x.id === c.pacienteId);
  mostrarNotificacion(`Cita de <b>${p ? p.nombre : "el paciente"}</b> completada correctamente`);
  completandoCitaId = null;
  cerrarModales();
  renderCitas();
  renderCitasCompletadas();
  renderHome();
}

function guardarCitaSinConsulta(e) {
  e.preventDefault();
  const pacienteId = Number(document.getElementById("cscPaciente").value);
  const fecha = document.getElementById("cscFecha").value;
  const hora = document.getElementById("cscHora").value;
  const amPm = document.getElementById("cscAmPm").value;
  const motivo = document.getElementById("cscMotivo").value.trim();
  if (!pacienteId || !fecha || !hora) return;
  const turno = State.citasSinConsulta.filter(c => c.fecha === fecha).length + 1;
  State.citasSinConsulta.push({ id: Date.now(), pacienteId, fecha, hora, amPm, motivo, turno });
  saveKey("citasSinConsulta");
  const pacCsc = State.pacientes.find(x => x.id === pacienteId);
  mostrarNotificacion(`Cita sin consulta para <b>${pacCsc ? pacCsc.nombre : "el paciente"}</b> agregada correctamente`);
  cerrarModales();
  renderCitasSinConsulta();
}

function renderRegistros(filtro = "") {
  const lista = document.getElementById("listaRegistros");
  if (!lista) return;

  const q = filtro.trim().toLowerCase();
  const data = [...State.registros].sort((a, b) => b.fecha.localeCompare(a.fecha));

  const filtrados = data.filter(r => {
    if (!q) return true;
    const p = State.pacientes.find(x => x.id === r.pacienteId);
    return (p && p.nombre.toLowerCase().includes(q)) || r.titulo.toLowerCase().includes(q);
  });

  if (filtrados.length === 0) {
    lista.innerHTML = `<p class="empty">No hay registros.</p>`;
    return;
  }

  lista.innerHTML = filtrados.map(r => {
    const p = State.pacientes.find(x => x.id === r.pacienteId);
    return `
      <div class="list-item">
        <div class="item-main">
          <strong>${r.titulo}</strong>
          <span class="tag">${r.fecha}</span>
          ${r.archivo ? `<span class="tag">📎 adjunto</span>` : ""}
        </div>
        <div class="item-sub">${p ? p.nombre : "Paciente eliminado"} — ${r.detalle || ""}</div>
        <div class="item-actions">
          ${r.archivo ? `<button class="btn-icon" data-ver-archivo="${r.id}" title="Ver documento adjunto">
            <span class="material-symbols-outlined">download</span>
          </button>` : ""}
          <button class="btn-icon" data-editar-reg="${r.id}" title="Editar registro">
            <span class="material-symbols-outlined">edit</span>
          </button>
          ${pacienteEliminadoDe(r.pacienteId) ? "" : `<button class="btn-icon danger" data-borrar-reg="${r.id}" title="Eliminar registro">
            <span class="material-symbols-outlined">delete</span>
          </button>`}
        </div>
      </div>
    `;
  }).join("");

  lista.querySelectorAll("[data-ver-archivo]").forEach(b =>
    b.addEventListener("click", () => {
      const r = State.registros.find(x => x.id === Number(b.dataset.verArchivo));
      if (r && r.archivo) {
        const a = document.createElement("a");
        a.href = r.archivo.dataUrl;
        a.download = r.archivo.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    })
  );
  lista.querySelectorAll("[data-editar-reg]").forEach(b =>
    b.addEventListener("click", () => abrirModalEditarRegistro(Number(b.dataset.editarReg)))
  );
  lista.querySelectorAll("[data-borrar-reg]").forEach(b =>
    b.addEventListener("click", () => {
      State.registros = State.registros.filter(x => x.id !== Number(b.dataset.borrarReg));
      saveKey("registros");
      renderRegistros();
      renderHome();
    })
  );

  renderCitasAux();
}

function renderDocumentos() {
  const lista = document.getElementById("listaDocumentos");
  if (!lista) return;

  if (State.documentos.length === 0) {
    lista.innerHTML = `<p class="empty">No hay documentos subidos.</p>`;
    return;
  }

  lista.innerHTML = State.documentos.map(d => {
    const p = State.pacientes.find(x => x.id === d.pacienteId);
    const icono = d.type.startsWith("image/") ? "image" : "description";
    return `
      <div class="list-item">
        <div class="item-main">
          <span class="material-symbols-outlined doc-icon">${icono}</span>
          <strong>${d.descripcion || d.name}</strong>
        </div>
        <div class="item-sub">${p ? p.nombre : "Paciente eliminado"} · ${d.name}</div>
        <div class="item-actions">
          <button class="btn-icon" data-ver-doc="${d.id}" title="Ver archivo">
            <span class="material-symbols-outlined">download</span>
          </button>
          ${pacienteEliminadoDe(d.pacienteId) ? "" : `<button class="btn-icon danger" data-borrar-doc="${d.id}" title="Eliminar">
            <span class="material-symbols-outlined">delete</span>
          </button>`}
        </div>
      </div>
    `;
  }).join("");

  lista.querySelectorAll("[data-ver-doc]").forEach(b =>
    b.addEventListener("click", () => {
      const d = State.documentos.find(x => x.id === Number(b.dataset.verDoc));
      if (d) verDocumento(d);
    })
  );
  lista.querySelectorAll("[data-borrar-doc]").forEach(b =>
    b.addEventListener("click", () => {
      if (!confirm("¿Eliminar este documento?")) return;
      State.documentos = State.documentos.filter(x => x.id !== Number(b.dataset.borrarDoc));
      saveKey("documentos");
      renderDocumentos();
      renderHome();
    })
  );
}

function verDocumento(d) {
  const a = document.createElement("a");
  a.href = d.dataUrl;
  a.download = d.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

let editarRegistroId = null;

function fechaESaISO(es) {
  if (!es) return "";
  return /^\d{2}\/\d{2}\/\d{4}$/.test(es) ? es.split("/").reverse().join("-") : es;
}

function abrirModalEditarRegistro(id) {
  const r = State.registros.find(x => x.id === id);
  if (!r) return;
  editarRegistroId = id;
  const sel = document.getElementById("regEPaciente");
  if (sel) sel.value = r.pacienteId;
  document.getElementById("regETitulo").value = r.titulo;
  document.getElementById("regEFecha").value = fechaESaISO(r.fecha);
  document.getElementById("regEDetalle").value = r.detalle || "";
  document.getElementById("regEArchivo").value = "";
  const actual = document.getElementById("regEArchivoActual");
  if (actual) actual.textContent = r.archivo ? `Adjunto actual: ${r.archivo.name}` : "Sin documento adjunto";
  const quitar = document.getElementById("regEQuitarArchivo");
  if (quitar) quitar.checked = false;
  abrirModal("modalEditarRegistro");
}

function guardarRegistroEditado() {
  if (!editarRegistroId) return;
  const r = State.registros.find(x => x.id === editarRegistroId);
  if (!r) return;
  const titulo = document.getElementById("regETitulo").value.trim();
  if (!titulo) { alert("El título es obligatorio."); return; }

  r.pacienteId = Number(document.getElementById("regEPaciente").value);
  r.titulo = titulo;
  const fechaEl = document.getElementById("regEFecha").value;
  r.fecha = fechaEl ? fmtFechaES(fechaEl) : new Date().toLocaleDateString("es-ES");
  r.detalle = document.getElementById("regEDetalle").value.trim();

  const file = document.getElementById("regEArchivo").files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = () => {
      r.archivo = { name: file.name, type: file.type, size: file.size, dataUrl: reader.result };
      finalizarRegistroEditado(r);
    };
    reader.readAsDataURL(file);
    return;
  }
  if (document.getElementById("regEQuitarArchivo").checked) delete r.archivo;
  finalizarRegistroEditado(r);
}

function finalizarRegistroEditado(r) {
  saveKey("registros");
  editarRegistroId = null;
  cerrarModales();
  renderRegistros();
  renderHome();
}

function renderProximasCitas() {
  const cont = document.getElementById("proximasCitas");
  if (!cont) return;

  const hoy = new Date();
  const hoyISO = hoy.toISOString();

  const proximas = State.citas
    .filter(c => !c.completada && (c.fecha + "T" + (c.hora || "23:59")) >= hoyISO)
    .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora))
    .slice(0, 5);

  if (proximas.length === 0) {
    cont.innerHTML = `<p class="empty">No hay citas próximas.</p>`;
    return;
  }

  cont.innerHTML = proximas.map(c => {
    const p = State.pacientes.find(x => x.id === c.pacienteId);
    return `
      <div class="list-item">
        <div class="item-main">
          <strong>${p ? p.nombre : "Paciente eliminado"}</strong>
          <span class="tag">${c.fecha} · ${fmtHora12(c.hora, c.amPm)}</span>
          <span class="tag">Turno ${c.turno || "—"}</span>
        </div>
        <div class="item-sub">${c.motivo || "Consulta"}</div>
      </div>
    `;
  }).join("");
}

function abrirImpresion(titulo, cuerpo) {
  const area = document.getElementById("printArea");
  if (!area) return;
  const emitido = new Date().toLocaleString("es-ES", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit"
  });
  area.innerHTML = `
    <h1>${titulo}</h1>
    <div class="print-meta">Emitido: ${emitido} · Usuario: ${State.session ? State.session.name : ""}</div>
    ${cuerpo}
  `;
  window.print();
}

function imprimirTurnos() {
  const data = [...State.citas].sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
  if (data.length === 0) {
    alert("No hay citas para imprimir.");
    return;
  }

  const filas = data.map((c, i) => {
    const p = State.pacientes.find(x => x.id === c.pacienteId);
    return `
      <tr>
        <td>${i + 1}</td>
        <td>${c.fecha}</td>
        <td>${fmtHora12(c.hora, c.amPm)}</td>
        <td>${c.turno || "—"}</td>
        <td>${p ? p.nombre : "Paciente eliminado"}${p && p.cedula ? ` (${p.cedula})` : ""}</td>
        <td>${c.motivo || ""}</td>
      </tr>
    `;
  }).join("");

  abrirImpresion("Tabla de turnos — Citas", `
    <table>
      <thead>
        <tr><th>#</th><th>Fecha</th><th>Hora</th><th>Turno</th><th>Paciente</th><th>Motivo</th></tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>
  `);
}

function imprimirResultados() {
  const data = [...State.registros].sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (data.length === 0) {
    alert("No hay resultados para imprimir.");
    return;
  }

  const items = data.map(r => {
    const p = State.pacientes.find(x => x.id === r.pacienteId);
    return `
      <div class="print-item">
        <h3>${r.titulo} — ${p ? p.nombre : "Paciente eliminado"}</h3>
        <span class="print-fecha">${r.fecha}</span>
        <p>${r.detalle || "Sin detalle"}</p>
      </div>
    `;
  }).join("");

  abrirImpresion("Resultados / Registros médicos", items);
}

function textoTurnos() {
  const data = [...State.citas].sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
  if (data.length === 0) {
    alert("No hay citas para compartir.");
    return null;
  }
  return data.map((c, i) => {
    const p = State.pacientes.find(x => x.id === c.pacienteId);
    return `${i + 1}. ${c.fecha} ${fmtHora12(c.hora, c.amPm)} | Turno ${c.turno || "—"} | ${p ? p.nombre : "Paciente eliminado"}${p && p.cedula ? " (" + p.cedula + ")" : ""} | ${c.motivo || ""}`;
  }).join("\n");
}

function textoResultados() {
  const data = [...State.registros].sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (data.length === 0) {
    alert("No hay resultados para compartir.");
    return null;
  }
  return data.map(r => {
    const p = State.pacientes.find(x => x.id === r.pacienteId);
    return `${r.titulo} — ${p ? p.nombre : "Paciente eliminado"} (${r.fecha})\n${r.detalle || "Sin detalle"}`;
  }).join("\n\n");
}

function textoFichaPaciente(id) {
  const p = State.pacientes.find(x => x.id === id);
  if (!p) return null;
  const citas = State.citas.filter(c => c.pacienteId === id);
  const documentos = State.documentos.filter(d => d.pacienteId === id);
  const hoy = new Date().toISOString().split("T")[0];
  const proximas = State.citas
    .filter(c => c.pacienteId === id && c.fecha >= hoy)
    .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
  const prox = proximas[0];

  return [
    `Código: ${p.codigo}`,
    `Cédula: ${p.cedula || "-"}`,
    `Seguro: ${p.seguro || "-"}`,
    `Edad: ${p.edad || "-"} · Sexo: ${p.sexo || "-"}`,
    `Teléfono: ${p.telefono || "-"}`,
    `Correo: ${p.email || "-"}`,
    `Próxima cita: ${prox ? `${prox.fecha} · ${fmtHora12(prox.hora, prox.amPm)} — ${prox.motivo}` : "Sin cita programada"}`,
    `Notas: ${p.notas || "Sin notas"}`,
    `Citas: ${citas.length} · Documentos: ${documentos.length}`
  ].join("\n");
}

function compartirWhatsApp(titulo, texto, telefono) {
  const enc = encodeURIComponent(`${titulo}\n\n${texto}`);
  const num = (telefono || "").replace(/[^\d]/g, "");
  const url = num
    ? `https://wa.me/${num}?text=${enc}`
    : `https://wa.me/?text=${enc}`;
  window.open(url, "_blank");
}

function compartirCorreo(titulo, texto) {
  const url = `mailto:?subject=${encodeURIComponent(titulo)}&body=${encodeURIComponent(texto)}`;
  window.open(url, "_blank");
}

function renderHome() {
  document.getElementById("statPacientes").textContent = pacientesActivos().length;
  document.getElementById("statCitas").textContent = State.citas.length;
  document.getElementById("statRegistros").textContent = State.registros.length;
  document.getElementById("statDocumentos").textContent = State.documentos.length;
  document.getElementById("statFacturas").textContent = State.facturas.length;
  document.getElementById("statSinCita").textContent =
    pacientesActivos().filter(p => !State.citas.some(c => c.pacienteId === p.id && !c.completada)).length;
  renderProximasCitas();
  renderDashboardCitas();
}

function renderDashboardCitas() {
  const comp = document.getElementById("dashCitasCompletadas");
  const compCount = document.getElementById("dashCountCompletadas");
  if (comp) {
    const completadas = State.citas.filter(c => c.completada);
    const data = [...completadas]
      .sort((a, b) => (b.fechaCompletada || b.fecha || "").localeCompare(a.fechaCompletada || a.fecha || ""))
      .slice(0, 5);
    if (compCount) compCount.textContent = completadas.length;
    comp.innerHTML = data.length === 0
      ? `<p class="empty">Aún no hay citas completadas.</p>`
      : data.map(c => {
        const p = State.pacientes.find(x => x.id === c.pacienteId);
        return `
          <div class="list-item item-compact">
            <div class="item-main">
              <strong>${p ? p.nombre : "Paciente eliminado"}</strong>
              <span class="tag">${fmtFechaES(c.fechaCompletada || c.fecha)}</span>
            </div>
            <div class="item-sub">${c.diagnostico || "Sin diagnóstico"}</div>
          </div>`;
      }).join("");
  }

  const csc = document.getElementById("dashCitasSinConsulta");
  const cscCount = document.getElementById("dashCountSinConsulta");
  if (csc) {
    const data = [...State.citasSinConsulta]
      .sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora))
      .slice(0, 5);
    if (cscCount) cscCount.textContent = State.citasSinConsulta.length;
    csc.innerHTML = data.length === 0
      ? `<p class="empty">No hay citas sin consulta.</p>`
      : data.map(c => {
        const p = State.pacientes.find(x => x.id === c.pacienteId);
        return `
          <div class="list-item item-compact">
            <div class="item-main">
              <strong>${p ? p.nombre : "Paciente eliminado"}</strong>
              <span class="tag">${c.fecha} · ${fmtHora12(c.hora, c.amPm)}</span>
            </div>
            <div class="item-sub">${c.motivo || "Sin motivo"}</div>
          </div>`;
      }).join("");
  }

  const sc = document.getElementById("dashPacientesSinCita");
  const scCount = document.getElementById("dashCountSinCita");
  if (sc) {
    const sinCita = pacientesActivos().filter(p => !State.citas.some(c => c.pacienteId === p.id && !c.completada)).slice(0, 5);
    if (scCount) scCount.textContent = pacientesActivos().filter(p => !State.citas.some(c => c.pacienteId === p.id && !c.completada)).length;
    sc.innerHTML = sinCita.length === 0
      ? `<p class="empty">Todos los pacientes tienen al menos una cita.</p>`
      : sinCita.map(p => `
          <div class="list-item item-compact">
            <div class="item-main">
              <strong>${p.nombre}</strong>
              <span class="tag">${p.codigo}</span>
            </div>
            <div class="item-sub">Cédula: ${p.cedula || "-"} · Seguro: ${p.seguro || "-"}</div>
            <div class="item-actions">
              <button class="btn btn--primary btn-small" data-dash-agendar="${p.id}">
                <span class="material-symbols-outlined">event</span> Agendar cita
              </button>
            </div>
          </div>`).join("");
    sc.querySelectorAll("[data-dash-agendar]").forEach(b =>
      b.addEventListener("click", () => agendarPacienteSinCita(Number(b.dataset.dashAgendar)))
    );
  }
}

function isoLocal(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function fmtHora12(hora, amPm) {
  let [h, m] = (hora || "00:00").split(":").map(Number);
  if (isNaN(h)) return hora || "";
  const suf = amPm || (h >= 12 ? "PM" : "AM");
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, "0")}:${String(m == null ? 0 : m).padStart(2, "0")} ${suf}`;
}

function fmtFechaES(iso) {
  if (!iso) return "—";
  const partes = iso.split("-");
  return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : iso;
}

function rangoStatsDefecto() {
  const hoy = new Date();
  const hoyIso = isoLocal(hoy);
  return {
    desde: hoy.getFullYear() + "-" + String(hoy.getMonth() + 1).padStart(2, "0") + "-01",
    hasta: hoyIso
  };
}

function abrirModalEstadisticas() {
  const r = rangoStatsDefecto();
  const desdeEl = document.getElementById("estDesde");
  const hastaEl = document.getElementById("estHasta");
  if (desdeEl) { desdeEl.value = r.desde; desdeEl.max = r.hasta; }
  if (hastaEl) { hastaEl.value = r.hasta; hastaEl.max = r.hasta; hastaEl.min = r.desde; }
  calcularEstadisticas();
  abrirModal("modalStats");
}

function calcularEstadisticas() {
  const desde = document.getElementById("estDesde").value;
  const hasta = document.getElementById("estHasta").value;
  const rangoTxt = document.getElementById("estRangoTexto");
  if (rangoTxt) rangoTxt.textContent = `Rango analizado: ${fmtFechaES(desde)} al ${fmtFechaES(hasta)}`;

  const citas = State.citas.filter(c => c.fecha && c.fecha >= desde && c.fecha <= hasta);
  const pacientesUnicos = new Set(citas.map(c => c.pacienteId));
  const registros = State.registros.filter(r => {
    const iso = fechaESaISO(r.fecha);
    return iso && iso >= desde && iso <= hasta;
  });
  const docs = State.documentos.filter(d => {
    const iso = fechaESaISO(d.fecha);
    return iso && iso >= desde && iso <= hasta;
  });
  const facturas = State.facturas.filter(f => {
    const iso = fechaESaISO(f.fecha);
    return iso && iso >= desde && iso <= hasta;
  });
  const dias = Math.max(1, Math.round((new Date(hasta + "T00:00:00") - new Date(desde + "T00:00:00")) / 86400000) + 1);

  const cont = document.getElementById("estTotales");
  if (cont) {
    cont.innerHTML = `
      <div class="est-card"><strong>${citas.length}</strong><span>Citas atendidas</span></div>
      <div class="est-card"><strong>${pacientesUnicos.size}</strong><span>Pacientes únicos</span></div>
      <div class="est-card"><strong>${registros.length}</strong><span>Registros creados</span></div>
      <div class="est-card"><strong>${docs.length}</strong><span>Documentos subidos</span></div>
      <div class="est-card"><strong>${facturas.length}</strong><span>Facturas emitidas</span></div>
      <div class="est-card"><strong>${(citas.length / dias).toFixed(2)}</strong><span>Promedio / día</span></div>
    `;
  }

  const pie = document.getElementById("estPie");
  if (pie) {
    pie.innerHTML = citas.length === 0
      ? `<p class="empty">Sin datos para el gráfico de pastel.</p>`
      : generarDonaSVG(serieSemana(citas), "Citas por día de la semana");
  }

  const periodo = document.getElementById("estPeriodo");
  if (periodo) {
    periodo.innerHTML = citas.length === 0
      ? `<p class="empty">Sin datos para el gráfico de pastel.</p>`
      : generarDonaSVG(seriePeriodo(desde, hasta, citas), "Citas por período");
  }
}

function serieDiaria(desde, hasta, citas) {
  const d1 = new Date(desde + "T00:00:00");
  const d2 = new Date(hasta + "T00:00:00");
  const dias = Math.max(1, Math.round((d2 - d1) / 86400000) + 1);

  const count = {};
  const porDia = dias <= 62;

  citas.forEach(c => {
    const clave = porDia ? c.fecha : c.fecha.slice(0, 7);
    count[clave] = (count[clave] || 0) + 1;
  });

  const datos = [];
  if (porDia) {
    const step = dias > 20 ? Math.ceil(dias / 15) : 1;
    for (let k = 0; k < dias; k++) {
      const iso = isoLocal(new Date(d1.getTime() + k * 86400000));
      datos.push({ label: iso.slice(8), val: count[iso] || 0, mostrar: k % step === 0 || k === dias - 1 });
    }
    return { tipo: "Citas por día", datos };
  }

  const cur = new Date(d1.getFullYear(), d1.getMonth(), 1);
  const end = new Date(d2.getFullYear(), d2.getMonth(), 1);
  while (cur <= end) {
    const mk = cur.getFullYear() + "-" + String(cur.getMonth() + 1).padStart(2, "0");
    datos.push({ label: mk, val: count[mk] || 0, mostrar: true });
    cur.setMonth(cur.getMonth() + 1);
  }
  return { tipo: "Citas por mes", datos };
}

function generarSVG(serie) {
  const W = 700, H = 260, padL = 48, padR = 12, padT = 26, padB = 38;
  const max = Math.max(1, ...serie.datos.map(d => d.val));
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const bw = innerW / serie.datos.length;

  let grid = "";
  for (let g = 0; g <= 4; g++) {
    const v = Math.max(1, Math.round(max * g / 4));
    const gy = padT + innerH * (1 - g / 4);
    grid += `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" stroke="#e3dcd4" stroke-width="1"/>`;
    grid += `<text x="${padL - 6}" y="${gy + 4}" text-anchor="end" font-size="10" fill="#888">${v}</text>`;
  }

  const bars = serie.datos.map((d, i) => {
    const bh = d.val > 0 ? Math.max(2, (d.val / max) * innerH) : 0;
    const x = padL + i * bw;
    const y = padT + innerH - bh;
    const label = d.mostrar ? `<text x="${x + bw / 2}" y="${padT + innerH + 16}" text-anchor="middle" font-size="9.5" fill="#777">${d.label}</text>` : "";
    const valor = d.val > 0 ? `<text x="${x + bw / 2}" y="${y - 4}" text-anchor="middle" font-size="9.5" font-weight="700" fill="#1b2a4a">${d.val}</text>` : "";
    return `<rect x="${x + 1}" y="${y}" width="${Math.max(2, bw - 3)}" height="${bh}" rx="2.5" fill="${d.val > 0 ? "#c95d3a" : "#ddd6cf"}"/>${label}${valor}`;
  }).join("");

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${serie.tipo}">
  <text x="${padL}" y="${padT - 10}" font-size="12" font-weight="700" fill="#1b2a4a">${serie.tipo}</text>
  ${grid}${bars}
</svg>`;
}

function generarDonaSVG(serie, titulo) {
  const slices = serie.datos.filter(d => d.val > 0);
  if (slices.length === 0) return `<p class="empty">Sin datos para el gráfico de pastel.</p>`;
  const cx = 120, cy = 120, rOut = 96, rIn = 58;
  let a0 = 0;
  const paths = slices.map((d, i) => {
    const a1 = a0 + (d.val / serie.total) * 360;
    const p = slicePath(cx, cy, rOut, rIn, a0, a1);
    a0 = a1;
    return `<path d="${p}" fill="${PALETA_PIE[i % PALETA_PIE.length]}" stroke="#fff" stroke-width="2.5"/>`;
  }).join("");
  const leyenda = slices.map((d, i) => `
    <li>
      <span class="dot" style="background:${PALETA_PIE[i % PALETA_PIE.length]}"></span>
      <span class="pie-label">${d.label}</span>
      <span class="pie-val">${d.val} (${d.pct}%)</span>
    </li>`).join("");
  return `
    <div class="pie-block">
      <svg width="240" height="240" viewBox="0 0 240 240" role="img" aria-label="${titulo}">
        ${paths}
        <text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="22" font-weight="800" fill="#1b2a4a">${serie.total}</text>
        <text x="${cx}" y="${cy + 18}" text-anchor="middle" font-size="10" fill="#888">citas</text>
      </svg>
      <div class="pie-info">
        <p class="pie-titulo">${titulo}</p>
        <ul class="pie-legend">${leyenda}</ul>
      </div>
    </div>`;
}

function slicePath(cx, cy, rOut, rIn, a0, a1) {
  const rad0 = (a0 - 90) * Math.PI / 180;
  const rad1 = (a1 - 90) * Math.PI / 180;
  const x0 = cx + rOut * Math.cos(rad0);
  const y0 = cy + rOut * Math.sin(rad0);
  const x1 = cx + rOut * Math.cos(rad1);
  const y1 = cy + rOut * Math.sin(rad1);
  const xi0 = cx + rIn * Math.cos(rad1);
  const yi0 = cy + rIn * Math.sin(rad1);
  const xi1 = cx + rIn * Math.cos(rad0);
  const yi1 = cy + rIn * Math.sin(rad0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${rOut} ${rOut} 0 ${large} 1 ${x1} ${y1} L ${xi0} ${yi0} A ${rIn} ${rIn} 0 ${large} 0 ${xi1} ${yi1} Z`;
}

const PALETA_PIE = ["#c95d3a", "#e07a5a", "#ef8f6d", "#3d648a", "#5c87ad", "#93b4cf", "#7a9a5b", "#b58a5b"];

function serieSemana(citas) {
  const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const acc = [0, 0, 0, 0, 0, 0, 0];
  citas.forEach(c => {
    const d = new Date(c.fecha + "T00:00:00");
    if (!isNaN(d)) acc[d.getDay()]++;
  });
  const total = acc.reduce((a, b) => a + b, 0);
  return {
    total,
    datos: dias.map((label, i) => ({
      label,
      val: acc[i],
      pct: total ? Math.round(acc[i] * 100 / total) : 0
    }))
  };
}

const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function seriePeriodo(desde, hasta, citas) {
  const d1 = new Date(desde + "T00:00:00");
  const d2 = new Date(hasta + "T00:00:00");
  const dias = Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
  const porMes = dias > 62;
  const count = {};

  if (porMes) {
    citas.forEach(c => {
      const mk = c.fecha.slice(0, 7);
      count[mk] = (count[mk] || 0) + 1;
    });
  } else {
    citas.forEach(c => {
      const d = parseInt(c.fecha.slice(8, 10), 10);
      const k = Math.ceil(d / 7);
      count[k] = (count[k] || 0) + 1;
    });
  }

  const claves = Object.keys(count).sort();
  const total = claves.reduce((a, k) => a + count[k], 0);

  if (porMes) {
    const cur = new Date(d1.getFullYear(), d1.getMonth(), 1);
    const end = new Date(d2.getFullYear(), d2.getMonth(), 1);
    while (cur <= end) {
      const mk = cur.getFullYear() + "-" + String(cur.getMonth() + 1).padStart(2, "0");
      if (!count[mk]) claves.push(mk);
      cur.setMonth(cur.getMonth() + 1);
    }
  } else {
    for (let k = 1; k <= 5; k++) {
      if (!count[k]) claves.push(k);
    }
  }
  claves.sort(porMes
    ? (a, b) => String(a).localeCompare(String(b))
    : (a, b) => a - b);

  const datos = claves.map(k => {
    const label = porMes
      ? `${MESES_CORTOS[parseInt(k.slice(5, 7), 10) - 1]}`
      : `${((k - 1) * 7) + 1}-${Math.min(k * 7, 31)}`;
    const val = count[k] || 0;
    return { label, val, pct: total ? Math.round(val * 100 / total) : 0 };
  });

  return { total, datos };
}

function imprimirEstadisticas() {
  const desde = document.getElementById("estDesde").value;
  const hasta = document.getElementById("estHasta").value;
  const citas = State.citas
    .filter(c => c.fecha && c.fecha >= desde && c.fecha <= hasta)
    .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
  if (citas.length === 0) {
    alert("No hay datos en el rango seleccionado.");
    return;
  }
  const pacientesUnicos = new Set(citas.map(c => c.pacienteId));

  const filas = citas.map(c => {
    const p = State.pacientes.find(x => x.id === c.pacienteId);
    return `<tr><td>${c.fecha}</td><td>${c.hora}</td><td>${c.turno || "—"}</td><td>${p ? p.nombre : "Paciente eliminado"}</td><td>${c.motivo || ""}</td></tr>`;
  }).join("");

  abrirImpresion(`Estadísticas de pacientes atendidos (${fmtFechaES(desde)} al ${fmtFechaES(hasta)})`,
    `
    <p class="print-resumen"><strong>Citas atendidas:</strong> ${citas.length} &nbsp;·&nbsp; <strong>Pacientes únicos:</strong> ${pacientesUnicos.size}</p>
    ${generarDonaSVG(seriePeriodo(desde, hasta, citas), "Citas por período")}
    <p class="print-resumen"><strong>Citas por día de la semana:</strong></p>
    ${generarDonaSVG(serieSemana(citas), "Citas por día de la semana")}
    <table>
      <thead><tr><th>Fecha</th><th>Hora</th><th>Turno</th><th>Paciente</th><th>Motivo</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
  `
  );
}

function exportarEstadisticas() {
  const desde = document.getElementById("estDesde").value;
  const hasta = document.getElementById("estHasta").value;
  const citas = State.citas
    .filter(c => c.fecha && c.fecha >= desde && c.fecha <= hasta)
    .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
  const pacientesUnicos = new Set(citas.map(c => c.pacienteId));

  const esc = v => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const filas = [
    `Tipo,Dato,Valor`,
    `Resumen,Rango,${fmtFechaES(desde)} al ${fmtFechaES(hasta)}`,
    `Resumen,Citas atendidas,${citas.length}`,
    `Resumen,Pacientes unicos,${pacientesUnicos.size}`,
    ``,
    `Fecha,Hora,Turno,Codigo,Paciente,Cedula,Seguro,Motivo`
  ];
  citas.forEach(c => {
    const p = State.pacientes.find(x => x.id === c.pacienteId);
    filas.push([c.fecha, c.hora, c.turno || "", p ? p.codigo : "", p ? p.nombre : "Paciente eliminado", p ? p.cedula : "", p ? p.seguro : "", c.motivo || ""].map(esc).join(","));
  });

  const blob = new Blob(["\uFEFF" + filas.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "estadisticas_atendidos_" + isoLocal(new Date()).replace(/-/g, "") + ".csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

const NOMBRES_MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const NOMBRES_DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

let calendarioVista = null;
let calendarioDia = null;
let calendarioEditando = null;

function abrirCalendario() {
  const hoy = new Date();
  calendarioVista = { anio: hoy.getFullYear(), mes: hoy.getMonth() };
  calendarioDia = null;
  calendarioEditando = null;
  const ed = document.getElementById("calEditor");
  if (ed) ed.classList.remove("open");
  renderCalendario();
  abrirModal("modalCalendario");
}

function cambiarMes(dir) {
  calendarioVista.mes += dir;
  if (calendarioVista.mes < 0) { calendarioVista.mes = 11; calendarioVista.anio--; }
  if (calendarioVista.mes > 11) { calendarioVista.mes = 0; calendarioVista.anio++; }
  calendarioDia = null;
  renderCalendario();
}

function renderCalendario() {
  const { anio, mes } = calendarioVista;
  if (!anio) return;

  const titulo = document.getElementById("calTitulo");
  if (titulo) titulo.textContent = `${NOMBRES_MESES[mes]} ${anio}`;

  const primer = new Date(anio, mes, 1);
  const offset = (primer.getDay() + 6) % 7;
  const totalDias = new Date(anio, mes + 1, 0).getDate();
  const hoyIso = isoLocal(new Date());

  let celdas = "";
  for (let i = 0; i < offset; i++) celdas += `<div class="cal-vacio"></div>`;
  for (let d = 1; d <= totalDias; d++) {
    const iso = `${anio}-${String(mes + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const n = State.citas.filter(c => c.fecha === iso && !c.completada).length;
    const clases = ["cal-dia"];
    if (iso === hoyIso) clases.push("hoy");
    if (iso === calendarioDia) clases.push("sel");
    if (n > 0) clases.push("tiene");
    celdas += `<div class="${clases.join(" ")}" data-dia="${iso}" title="${fmtFechaES(iso)}">
      <span class="cal-num">${d}</span>
      ${n > 0 ? `<span class="cal-count">${n}</span>` : ""}
    </div>`;
  }

  const grid = document.getElementById("calGrid");
  if (grid) {
    grid.innerHTML = NOMBRES_DIAS.map(d => `<div class="cal-dow">${d}</div>`).join("") + celdas;
    grid.querySelectorAll(".cal-dia").forEach(cel =>
      cel.addEventListener("click", () => { calendarioDia = cel.dataset.dia; renderCalendario(); })
    );
  }

  renderCalDetalle();
  const ed = document.getElementById("calEditor");
  if (ed) ed.classList.remove("open");
  calendarioEditando = null;
}

function renderCalDetalle() {
  const cont = document.getElementById("calDetalle");
  if (!cont) return;
  if (!calendarioDia) {
    cont.innerHTML = `<p class="empty">Selecciona un día en el calendario para ver sus citas.</p>`;
    return;
  }
  const citas = State.citas
    .filter(c => c.fecha === calendarioDia && !c.completada)
    .sort((a, b) => (a.hora || "").localeCompare(b.hora || ""));
  if (citas.length === 0) {
    cont.innerHTML = `<p class="empty">Sin citas el ${fmtFechaES(calendarioDia)}.</p>`;
    return;
  }
  cont.innerHTML = `<h3 class="cal-detalle-titulo">Citas · ${fmtFechaES(calendarioDia)}</h3>` + citas.map(c => {
    const p = State.pacientes.find(x => x.id === c.pacienteId);
    return `
      <div class="list-item">
        <div class="item-main">
          <strong>${fmtHora12(c.hora, c.amPm)}</strong>
          <span class="tag">Turno ${c.turno || "—"}</span>
        </div>
        <div class="item-sub">${p ? p.nombre : "Paciente eliminado"} — ${c.motivo || "Consulta"}</div>
        <div class="item-actions">
          <button class="btn-icon" data-editar-cal="${c.id}" title="Editar fecha y hora">
            <span class="material-symbols-outlined">edit</span>
          </button>
          ${pacienteEliminadoDe(c.pacienteId) ? "" : `<button class="btn-icon danger" data-borrar-cal="${c.id}" title="Eliminar cita">
            <span class="material-symbols-outlined">delete</span>
          </button>`}
        </div>
      </div>
    `;
  }).join("");

  cont.querySelectorAll("[data-editar-cal]").forEach(b =>
    b.addEventListener("click", () => abrirEditorCita(Number(b.dataset.editarCal)))
  );
  cont.querySelectorAll("[data-borrar-cal]").forEach(b =>
    b.addEventListener("click", () => {
      if (!confirm("¿Eliminar esta cita?")) return;
      State.citas = State.citas.filter(x => x.id !== Number(b.dataset.borrarCal));
      saveKey("citas");
      renderCalendario();
      renderCitas();
      renderHome();
    })
  );
}

function abrirEditorCita(id) {
  const c = State.citas.find(x => x.id === id);
  if (!c) return;
  calendarioEditando = id;
  document.getElementById("calFecha").value = c.fecha || "";
  document.getElementById("calHora").value = c.hora || "09:00";
  document.getElementById("calAmPm").value = c.amPm || "PM";
  document.getElementById("calMotivo").value = c.motivo || "";
  const ed = document.getElementById("calEditor");
  if (ed) ed.classList.add("open");
}

function guardarEdicionCalendario() {
  if (!calendarioEditando) return;
  const c = State.citas.find(x => x.id === calendarioEditando);
  if (!c) return;
  const nuevaFecha = document.getElementById("calFecha").value;
  if (!nuevaFecha) { alert("Selecciona la fecha."); return; }

  if (nuevaFecha !== c.fecha) {
    const error = validarLimiteCitas(nuevaFecha);
    if (error) { alert(error); return; }
  }

  c.fecha = nuevaFecha;
  c.hora = document.getElementById("calHora").value;
  c.amPm = document.getElementById("calAmPm") ? document.getElementById("calAmPm").value : "PM";
  c.motivo = document.getElementById("calMotivo").value.trim() || c.motivo;
  State.citas
    .filter(x => x.fecha === c.fecha)
    .sort((a, b) => (a.hora || "").localeCompare(b.hora || "") || a.id - b.id)
    .forEach((x, i) => x.turno = i + 1);

  saveKey("citas");
  calendarioEditando = null;
  calendarioDia = c.fecha;
  renderCalendario();
  renderCitas();
  renderHome();
}

let recetaMedsBus = [];
let recetaIndsBus = [];
let recetaActualId = null;

const INDICACIONES_GRUPOS = [
  {
    grupo: "SONOGRAFÍA",
    items: ["SONOGRAFIA DE PARTES BLANDAS DE:", "SONOGRAFIA MUSCULOESQUELETICA DE:"]
  },
  {
    grupo: "RADIOGRAFÍA",
    items: [
      "RADIOGRAFIA DE COLUMNA CERVICAL AP/LAT",
      "RADIOGRAFIA DE COLUMNA DORSOLUMBAR AP/LAT",
      "RADIOGRAFIA DE COLUMNA DORSAL AP/LAT",
      "RADIOGRAFIA DE COLUMNA LUMBAR AP/LAT",
      "RADIOGRAFIA DE COLUMNA LUMBARSACRA AP/LAT",
      "RADIOGRAFIA DE HOMBRO",
      "RADIOGRAFIA DE BRAZO DERECHO AP/LAT",
      "RADIOGRAFIA DE BRAZO IZQUIERDO AP/LAT",
      "RADIOGRAFIA DE CODO DERECHO AP/LAT",
      "RADIOGRAFIA DE CODO IZQUIERDO AP/LAT",
      "RADIOGRAFIA DE ANTEBRAZO DERECHO AP/LAT",
      "RADIOGRAFIA DE ANTEBRAZO IZQUIERDO AP/LAT",
      "RADIOGRAFIA DE MUÑECA DERECHA AP/LAT",
      "RADIOGRAFIA DE MUÑECA IZQUIERDA AP/LAT",
      "RADIOGRAFIA DE MANO DERECHA AP/OBLICUA",
      "RADIOGRAFIA DE MANO IZQUIERDA AP/OBLICUA",
      "RADIOGRAFIA DE PELVIS AP",
      "RADIOGRAFIA DE MUSLO DERECHO AP/LAT",
      "RADIOGRAFIA DE MUSLO IZQUIERDO AP/LAT",
      "RADIOGRAFIA DE RODILLA DERECHA AP/LAT",
      "RADIOGRAFIA DE RODILLA IZQUIERDA AP/LAT",
      "RADIOGRAFIA DE PIERNA DERECHA AP/LAT",
      "RADIOGRAFIA DE PIERNA IZQUIERDA AP/LAT",
      "RADIOGRAFIA DE TOBILLO DERECHO AP/LAT",
      "RADIOGRAFIA DE TOBILLO IZQUIERDO AP/LAT",
      "RADIOGRAFIA DE PIE DERECHO AP/OBLICUA",
      "RADIOGRAFIA DE PIE IZQUIERDO AP/OBLICUA"
    ]
  },
  {
    grupo: "RESONANCIA MAGNÉTICA",
    items: [
      "RESONANCIA MAGNETICA CERVICAL",
      "RESONANCIA MAGNETICA HOMBRO DERECHO",
      "RESONANCIA MAGNETICA HOMBRO IZQUIERDO",
      "RESONANCIA MAGNETICA CODO DERECHO",
      "RESONANCIA MAGNETICA CODO IZQUIERDO",
      "RESONANCIA MAGNETICA MUÑECA DERECHA",
      "RESONANCIA MAGNETICA MUÑECA IZQUIERDA",
      "RESONANCIA MAGNETICA RODILLA DERECHA",
      "RESONANCIA MAGNETICA RODILLA IZQUIERDA",
      "RESONANCIA MAGNETICA TOBILLO DERECHO",
      "RESONANCIA MAGNETICA TOBILLO IZQUIERDO"
    ]
  },
  {
    grupo: "ELECTROMIOGRAFÍA",
    items: [
      "ELECTROMIOGRAFIA DE MIEMBROS SUPERIORES",
      "ELECTROMIOGRAFIA DE MIEMBROS INFERIORES"
    ]
  },
  {
    grupo: "ANALÍTICAS PREQUIRÚRGICAS",
    items: [
      "HEMOGRAMA",
      "TIPIFICACION",
      "GLICEMIA",
      "UREA-CREATININA",
      "TGO-TGP",
      "TP,TPT,INR",
      "EXAMEN DE ORINA",
      "HIV",
      "HVC",
      "HBSAG",
      "VDRL"
    ]
  },
  {
    grupo: "EVALUACIÓN PREQUIRÚRGICA / REFERIDO A",
    items: [
      "CARDIOLOGIA",
      "NEUMOLOGIA",
      "ENDOCRINOLOGIA/DIABETOLOGIA",
      "HEMATOLOGIA",
      "NEUROLOGIA",
      "INFECTOLOGIA"
    ]
  },
  {
    grupo: "PERFIL INFLAMATORIO BÁSICO",
    items: [
      "Hemograma completo",
      "VSG",
      "Proteína C reactiva (PCR)"
    ]
  },
  {
    grupo: "PERFIL AUTOINMUNE",
    items: [
      "Hemograma completo",
      "VSG",
      "Proteína C reactiva (PCR)",
      "Factor reumatoide (FR)",
      "Anticuerpos antinucleares (ANA)",
      "Anti-CCP / anticuerpos antipéptido cíclico citrulinado"
    ]
  }
];

let facturaCarrito = [];

function fillProcedimientos() {
  const sel = document.getElementById("facturaProcedimiento");
  if (!sel) return;
  sel.innerHTML = PROCEDIMIENTOS
    .map((p, i) => `<option value="${i}">${p.nombre} — $${p.precio}</option>`)
    .join("");
}

function calcFactura() {
  const subtotal = facturaCarrito.reduce((sum, it) => sum + it.precio, 0);
  const porcentaje = Math.min(100, Math.max(0, Number(document.getElementById("facturaPorcentaje").value) || 0));
  const honorarios = subtotal * porcentaje / 100;
  const neto = subtotal - honorarios;
  return { subtotal, porcentaje, honorarios, neto };
}

function fmtMoney(n) {
  return "$" + n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderFacturaItems() {
  const cont = document.getElementById("facturaItems");
  if (!cont) return;

  if (facturaCarrito.length === 0) {
    cont.innerHTML = `<p class="empty">Sin procedimientos. Agrega al menos uno.</p>`;
  } else {
    cont.innerHTML = facturaCarrito.map((it, i) => `
      <div class="list-item item-compact">
        <div class="item-main">
          <strong>${it.nombre}</strong>
          <span class="item-price">${fmtMoney(it.precio)}</span>
        </div>
        <div class="item-actions">
          <button class="btn-icon danger" data-quitar="${i}" title="Quitar">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
      </div>
    `).join("");
  }

  cont.querySelectorAll("[data-quitar]").forEach(b =>
    b.addEventListener("click", () => {
      facturaCarrito.splice(Number(b.dataset.quitar), 1);
      renderFacturaItems();
    })
  );

  updateFacturaResumen();
}

function updateFacturaResumen() {
  const { subtotal, porcentaje, honorarios, neto } = calcFactura();
  document.getElementById("resumenSubtotal").textContent = fmtMoney(subtotal);
  document.getElementById("resumenHonorarios").textContent = fmtMoney(honorarios);
  document.getElementById("resumenNeto").textContent = fmtMoney(neto);
  document.getElementById("resumenTotal").textContent = fmtMoney(subtotal);
}

function renderFacturas() {
  const lista = document.getElementById("listaFacturas");
  if (!lista) return;

  if (State.facturas.length === 0) {
    lista.innerHTML = `<p class="empty">No hay facturas emitidas.</p>`;
    return;
  }

  lista.innerHTML = [...State.facturas].reverse().map(f => {
    const p = State.pacientes.find(x => x.id === f.pacienteId);
    return `
      <div class="list-item">
        <div class="item-main">
          <strong>${f.codigo}</strong>
          <span class="tag">${f.fecha}</span>
          <span class="tag tag-price">${fmtMoney(f.total)}</span>
        </div>
        <div class="item-sub">${p ? p.nombre : "Paciente eliminado"} · Dr(a). ${f.doctor}</div>
        <div class="item-sub">Honorarios: ${fmtMoney(f.honorarios)} (${f.porcentaje}%) · Neto clínica: ${fmtMoney(f.neto)}</div>
        <div class="item-sub detalles-factura" id="detFactura-${f.id}" hidden>
          ${f.items.map(it => `<span>· ${it.nombre}: ${fmtMoney(it.precio)}</span>`).join("<br>")}
        </div>
        <div class="item-actions">
          <button class="btn-icon" data-det-factura="${f.id}" title="Ver detalle">
            <span class="material-symbols-outlined">expand_more</span>
          </button>
          ${pacienteEliminadoDe(f.pacienteId) ? "" : `<button class="btn-icon danger" data-borrar-factura="${f.id}" title="Eliminar factura">
            <span class="material-symbols-outlined">delete</span>
          </button>`}
        </div>
      </div>
    `;
  }).join("");

  lista.querySelectorAll("[data-det-factura]").forEach(b =>
    b.addEventListener("click", () => {
      const det = document.getElementById("detFactura-" + b.dataset.detFactura);
      if (det) det.hidden = !det.hidden;
    })
  );
  lista.querySelectorAll("[data-borrar-factura]").forEach(b =>
    b.addEventListener("click", () => {
      if (!confirm("¿Eliminar esta factura?")) return;
      State.facturas = State.facturas.filter(x => x.id !== Number(b.dataset.borrarFactura));
      saveKey("facturas");
      renderFacturas();
      renderHome();
    })
  );
}

function agregarFilaMed() {
  recetaMedsBus.push({
    nombre: "",
    tipo: "Generico",
    via: "Oral",
    dosis: "",
    frecuencia: "",
    frecuenciaUnidad: "horas",
    duracion: "",
    duracionUnidad: "dias"
  });
  renderRecetaMeds();
}

function quitarFilaMed(idx) {
  recetaMedsBus.splice(idx, 1);
  renderRecetaMeds();
}

function renderRecetaMeds() {
  const cont = document.getElementById("recetaMeds");
  if (!cont) return;
  if (recetaMedsBus.length === 0) {
    cont.innerHTML = `<p class="empty">Aún no has agregado medicamentos.</p>`;
    return;
  }
  cont.innerHTML = recetaMedsBus.map((m, i) => `
    <div class="rec-med-row">
      <div class="rec-med-grid">
        <label class="rec-med-fill">Medicamento
          <input type="text" class="recMedNombre" value="${m.nombre}" placeholder="Ej: Ibuprofeno, Amoxicilina" required />
        </label>
        <label>Tipo
          <select class="recMedTipo">
            <option value="Generico" ${m.tipo === "Generico" ? "selected" : ""}>Genérico</option>
            <option value="Comercial" ${m.tipo === "Comercial" ? "selected" : ""}>Comercial</option>
          </select>
        </label>
        <label>Vía
          <select class="recMedVia">
            <option value="Oral" ${m.via === "Oral" ? "selected" : ""}>Oral</option>
            <option value="Topica" ${m.via === "Topica" ? "selected" : ""}>Tópica</option>
          </select>
        </label>
        <label class="rec-med-fill">Dosis exacta
          <input type="text" class="recMedDosis" value="${m.dosis}" placeholder="Ej: 1 tableta de 500 mg en cada toma" />
        </label>
        <label>Cada
          <div class="num-unidad">
            <input type="number" class="recMedFrec" min="1" value="${m.frecuencia}" placeholder="Cant." />
            <select class="recMedFrecUnidad">
              <option value="horas" ${m.frecuenciaUnidad === "horas" ? "selected" : ""}>horas</option>
              <option value="dias" ${m.frecuenciaUnidad === "dias" ? "selected" : ""}>días</option>
            </select>
          </div>
        </label>
        <label>Durante
          <div class="num-unidad">
            <input type="number" class="recMedDur" min="1" value="${m.duracion}" placeholder="Cant." />
            <select class="recMedDurUnidad">
              <option value="dias" ${m.duracionUnidad === "dias" ? "selected" : ""}>días</option>
              <option value="semanas" ${m.duracionUnidad === "semanas" ? "selected" : ""}>semanas</option>
              <option value="meses" ${m.duracionUnidad === "meses" ? "selected" : ""}>meses</option>
            </select>
          </div>
        </label>
        <button type="button" class="btn-icon danger rec-med-quitar" data-quitar-med="${i}" title="Quitar medicamento">
          <span class="material-symbols-outlined">delete</span>
        </button>
      </div>
    </div>
  `).join("");

  cont.querySelectorAll("[data-quitar-med]").forEach(b =>
    b.addEventListener("click", () => quitarFilaMed(Number(b.dataset.quitarMed)))
  );
}

function leerRecetaMeds() {
  return [...document.querySelectorAll("#recetaMeds .rec-med-row")].map(r => ({
    nombre: r.querySelector(".recMedNombre").value.trim(),
    tipo: r.querySelector(".recMedTipo").value,
    via: r.querySelector(".recMedVia").value,
    dosis: r.querySelector(".recMedDosis").value.trim(),
    frecuencia: r.querySelector(".recMedFrec").value.trim(),
    frecuenciaUnidad: r.querySelector(".recMedFrecUnidad").value,
    duracion: r.querySelector(".recMedDur").value.trim(),
    duracionUnidad: r.querySelector(".recMedDurUnidad").value
  })).filter(m => m.nombre || m.dosis || m.frecuencia || m.duracion);
}

function agregarFilaInd() {
  recetaIndsBus.push({ detalle: "" });
  renderRecetaInds();
}

function quitarFilaInd(idx) {
  recetaIndsBus.splice(idx, 1);
  renderRecetaInds();
}

function renderRecetaInds() {
  const cont = document.getElementById("recetaInds");
  if (!cont) return;
  if (recetaIndsBus.length === 0) {
    cont.innerHTML = `<p class="empty">Aún no has agregado indicaciones.</p>`;
    return;
  }
  const opciones = INDICACIONES_GRUPOS.map(g => `
    <optgroup label="${g.grupo}">
      ${g.items.map((it, j) => `<option value="${j}">${it}</option>`).join("")}
    </optgroup>
  `).join("");
  cont.innerHTML = recetaIndsBus.map((m, i) => `
    <div class="rec-ind-row rec-med-row">
      <div class="rec-med-grid">
        <label class="rec-med-fill">Indicación / estudio
          <select class="recIndNombre">${opciones}</select>
        </label>
        <label class="rec-med-fill">Detalle
          <input type="text" class="recIndDetalle" value="${m.detalle}" placeholder="Opcional: completa el estudio (ej: rodilla izquierda)" />
        </label>
        <button type="button" class="btn-icon danger rec-med-quitar" data-quitar-ind="${i}" title="Quitar indicación">
          <span class="material-symbols-outlined">delete</span>
        </button>
      </div>
    </div>
  `).join("");

  cont.querySelectorAll("[data-quitar-ind]").forEach(b =>
    b.addEventListener("click", () => quitarFilaInd(Number(b.dataset.quitarInd)))
  );
}

function leerRecetaInds() {
  return [...document.querySelectorAll("#recetaInds .rec-ind-row")].map(r => ({
    nombre: r.querySelector(".recIndNombre").selectedOptions[0].textContent.trim(),
    detalle: r.querySelector(".recIndDetalle").value.trim()
  }));
}

function fmtRecetaInd(ind) {
  return [ind.nombre, ind.detalle].filter(Boolean).join(" ");
}

function updateRecetaEdad() {
  const sel = document.getElementById("recetaPaciente");
  const edadEl = document.getElementById("recetaEdad");
  if (!sel || !edadEl) return;
  const p = State.pacientes.find(x => x.id === Number(sel.value));
  edadEl.value = p ? (p.edad || "") : "";
}

function fmtRecetaMed(m) {
  const partes = [];
  if (m.nombre) partes.push(m.nombre + (m.tipo && m.tipo !== "Generico" ? ` (${m.tipo})` : ""));
  if (m.via) partes.push("vía " + m.via.toLowerCase());
  if (m.dosis) partes.push("dosis: " + m.dosis);
  if (m.frecuencia) partes.push("cada " + m.frecuencia + " " + m.frecuenciaUnidad);
  if (m.duracion) partes.push("durante " + m.duracion + " " + m.duracionUnidad);
  return partes.join(" · ");
}

function guardarReceta(e) {
  e.preventDefault();
  const pacienteId = Number(document.getElementById("recetaPaciente").value);
  if (!pacienteId) {
    alert("Selecciona un paciente.");
    return;
  }
  const meds = leerRecetaMeds();
  const inds = leerRecetaInds();
  if (meds.length === 0 && inds.length === 0) {
    alert("Agrega al menos un medicamento o una indicación a la receta.");
    return;
  }
  const p = State.pacientes.find(x => x.id === pacienteId);
  const receta = {
    id: Date.now(),
    codigo: "REC-" + (1000 + State.recetas.length),
    pacienteId,
    fecha: document.getElementById("recetaFecha").value,
    edad: p ? (p.edad || "") : "",
    doctor: State.session ? State.session.name : "Doctor",
    medicamentos: meds,
    indicaciones: inds
  };
  State.recetas.push(receta);
  saveKey("recetas");
  recetaMedsBus = [];
  renderRecetaMeds();
  recetaIndsBus = [];
  renderRecetaInds();
  const form = document.getElementById("recetaForm");
  form.reset();
  document.getElementById("recetaFecha").valueAsDate = new Date();
  if (p) document.getElementById("recetaPaciente").value = String(p.id);
  updateRecetaEdad();
  renderRecetas();
  renderHome();
  mostrarNotificacion(`Receta <b>${receta.codigo}</b> guardada correctamente`);
}

function cuerpoRecetaHTML(r) {
  const p = State.pacientes.find(x => x.id === r.pacienteId);
  const filas = (r.medicamentos || []).map((m, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${m.nombre || "-"}${m.tipo && m.tipo !== "Generico" ? `<br><span class="rec-print-tipo">${m.tipo}</span>` : ""}</td>
      <td>${m.via || "-"}</td>
      <td>${m.dosis || "-"}</td>
      <td>${m.frecuencia ? "cada " + m.frecuencia + " " + m.frecuenciaUnidad : "-"}</td>
      <td>${m.duracion ? m.duracion + " " + m.duracionUnidad : "-"}</td>
    </tr>
  `).join("");
  const indsHTML = (r.indicaciones || []).map(ind =>
    `<li>${fmtRecetaInd(ind)}</li>`
  ).join("");

  return `
    <div class="receta-head">
      <h3>${r.codigo} — Receta médica</h3>
      <p><strong>${p ? p.nombre : "Paciente eliminado"}</strong>${r.edad ? ` · Edad: ${r.edad}` : ""}</p>
      <p>Fecha: ${fmtFechaES(r.fecha)} · Dr(a). ${r.doctor}</p>
    </div>
    <table>
      <thead>
        <tr><th>#</th><th>Medicamento</th><th>Vía</th><th>Dosis</th><th>Frecuencia</th><th>Duración</th></tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>
    ${(r.indicaciones || []).length ? `
      <h4 class="receta-subtitulo">Indicaciones y estudios</h4>
      <ul class="rec-ind-print">${indsHTML}</ul>` : ""}
  `;
}

function verReceta(id) {
  const r = State.recetas.find(x => x.id === id);
  if (!r) return;
  recetaActualId = id;
  const vista = document.getElementById("recetaVista");
  if (vista) vista.innerHTML = cuerpoRecetaHTML(r);
  abrirModal("modalReceta");
}

function imprimirReceta(id) {
  const r = State.recetas.find(x => x.id === id);
  if (!r) return;
  abrirImpresion("Receta médica — " + r.codigo, cuerpoRecetaHTML(r));
}

function renderRecetas() {
  const lista = document.getElementById("listaRecetas");
  if (!lista) return;
  const countEl = document.getElementById("countRecetas");
  if (countEl) countEl.textContent = State.recetas.length;

  if (State.recetas.length === 0) {
    lista.innerHTML = `<p class="empty">No hay recetas emitidas.</p>`;
    return;
  }

  lista.innerHTML = [...State.recetas].reverse().map(r => {
    const p = State.pacientes.find(x => x.id === r.pacienteId);
    const meds = r.medicamentos || [];
    const inds = r.indicaciones || [];
    return `
      <div class="list-item">
        <div class="item-main">
          <strong>${r.codigo}</strong>
          <span class="tag">${fmtFechaES(r.fecha)}</span>
          <span class="tag">${meds.length} medicamento(s)</span>
          ${inds.length ? `<span class="tag">${inds.length} indicación(es)</span>` : ""}
        </div>
        <div class="item-sub">${p ? p.nombre : "Paciente eliminado"}${r.edad ? ` · Edad: ${r.edad}` : ""} · Dr(a). ${r.doctor}</div>
        <div class="item-sub">${[...meds.map(fmtRecetaMed), ...inds.map(fmtRecetaInd)].join(" | ")}</div>
        <div class="item-actions">
          <button class="btn-icon" data-ver-receta="${r.id}" title="Ver receta">
            <span class="material-symbols-outlined">visibility</span>
          </button>
          <button class="btn-icon" data-imprimir-receta="${r.id}" title="Imprimir receta">
            <span class="material-symbols-outlined">print</span>
          </button>
          ${pacienteEliminadoDe(r.pacienteId) ? "" : `<button class="btn-icon danger" data-borrar-receta="${r.id}" title="Eliminar receta">
            <span class="material-symbols-outlined">delete</span>
          </button>`}
        </div>
      </div>
    `;
  }).join("");

  lista.querySelectorAll("[data-ver-receta]").forEach(b =>
    b.addEventListener("click", () => verReceta(Number(b.dataset.verReceta)))
  );
  lista.querySelectorAll("[data-imprimir-receta]").forEach(b =>
    b.addEventListener("click", () => imprimirReceta(Number(b.dataset.imprimirReceta)))
  );
  lista.querySelectorAll("[data-borrar-receta]").forEach(b =>
    b.addEventListener("click", () => {
      if (!window.confirm("¿Eliminar esta receta?")) return;
      State.recetas = State.recetas.filter(x => x.id !== Number(b.dataset.borrarReceta));
      saveKey("recetas");
      renderRecetas();
    })
  );
}

function applyDark(activado) {
  document.body.classList.toggle("dark", activado);
  document.querySelectorAll("[data-toggle-dark] .material-symbols-outlined").forEach(ic => {
    ic.textContent = activado ? "light_mode" : "dark_mode";
  });
}

function initDarkMode() {
  applyDark(DB.get("orto_dark", false));
  document.querySelectorAll("[data-toggle-dark]").forEach(btn => {
    btn.addEventListener("click", () => {
      const on = !document.body.classList.contains("dark");
      DB.set("orto_dark", on);
      applyDark(on);
    });
  });
}

function initApp() {
  if (isLoginPage()) return;

  if (!State.session) {
    window.location.href = "login.html";
    return;
  }

  migrateOnLoad();
  initDarkMode();
  cargarPerfil();
  aplicarConfig();
  actualizarAccesosAdmin();

  document.getElementById("todayDate").textContent =
    new Date().toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const fotoInput = document.getElementById("fotoInput");
  if (fotoInput) {
    fotoInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        alert("Solo se permiten archivos de imagen.");
        fotoInput.value = "";
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        alert("La imagen es muy grande (máx. 2 MB).");
        fotoInput.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const foto = reader.result;
        if (State.session) {
          State.session.foto = foto;
          DB.set("orto_session", State.session);
          const user = State.users.find(u => u.id === State.session.id);
          if (user) {
            user.foto = foto;
            saveKey("users");
          }
        }
        cargarPerfil();
      };
      reader.readAsDataURL(file);
    });
  }

  ["btnFotoAccion"].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener("click", () => {
      if (State.session && State.session.foto) {
        quitarFotoPerfil();
      } else {
        const fi = document.getElementById("fotoInput");
        if (fi) fi.click();
      }
    });
  });

  initNavigation();

  const pacienteForm = document.getElementById("pacienteForm");
  if (pacienteForm) {
    document.getElementById("pacienteCodigo").value = genCodigoPaciente();

    pacienteForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const paciente = {
        id: Date.now(),
        codigo: document.getElementById("pacienteCodigo").value,
        nombre: document.getElementById("pacienteNombre").value.trim(),
        cedula: document.getElementById("pacienteCedula").value.trim(),
        seguro: document.getElementById("pacienteSeguro").value.trim(),
        edad: document.getElementById("pacienteEdad").value.trim(),
        sexo: document.getElementById("pacienteSexo").value,
        telefono: document.getElementById("pacienteTelefono").value.trim(),
        email: document.getElementById("pacienteEmail").value.trim(),
        notas: document.getElementById("pacienteNotas").value.trim()
      };
      State.pacientes.push(paciente);
      saveKey("pacientes");
      mostrarNotificacion(`Paciente <b>${paciente.nombre}</b> agregado correctamente`);

      const proxFecha = document.getElementById("pacienteProxCitaFecha").value;
      const proxHora = document.getElementById("pacienteProxCitaHora").value;
      const proxAmPm = document.getElementById("pacienteProxCitaAmPm") ? document.getElementById("pacienteProxCitaAmPm").value : "PM";
      if (proxFecha) {
        const error = validarLimiteCitas(proxFecha);
        if (error) {
          alert("El paciente se guardó, pero no se pudo agendar su próxima cita: " + error);
        } else {
          State.citas.push({
            id: Date.now() + 1,
            pacienteId: paciente.id,
            fecha: proxFecha,
            hora: proxHora || "09:00",
            amPm: proxAmPm,
            motivo: "Próxima cita",
            turno: genTurno(proxFecha)
          });
          saveKey("citas");
          renderCitas();
        }
      }

      pacienteForm.reset();
      document.getElementById("pacienteCodigo").value = genCodigoPaciente();
      renderPacientes();
      fillSelects();
      renderHome();
    });
  }

  const buscarPaciente = document.getElementById("buscarPaciente");
  if (buscarPaciente) {
    buscarPaciente.addEventListener("input", () => renderPacientes(buscarPaciente.value));
  }

  const btnImprimirFicha = document.getElementById("btnImprimirFicha");
  if (btnImprimirFicha) {
    btnImprimirFicha.addEventListener("click", () => {
      if (pacienteActual) imprimirFichaPaciente(pacienteActual);
    });
  }

  const btnWhatsappFicha = document.getElementById("btnWhatsappFicha");
  if (btnWhatsappFicha) {
    btnWhatsappFicha.addEventListener("click", () => {
      if (!pacienteActual) return;
      const texto = textoFichaPaciente(pacienteActual);
      const p = State.pacientes.find(x => x.id === pacienteActual);
      if (texto != null) compartirWhatsApp("Ficha del paciente", texto, p ? p.telefono : "");
    });
  }

  const btnCorreoFicha = document.getElementById("btnCorreoFicha");
  if (btnCorreoFicha) {
    btnCorreoFicha.addEventListener("click", () => {
      if (!pacienteActual) return;
      const texto = textoFichaPaciente(pacienteActual);
      if (texto != null) compartirCorreo("Ficha del paciente", texto);
    });
  }

  const btnImprimirTurnos = document.getElementById("btnImprimirTurnos");
  if (btnImprimirTurnos) btnImprimirTurnos.addEventListener("click", imprimirTurnos);

  const btnWhatsappTurnos = document.getElementById("btnWhatsappTurnos");
  if (btnWhatsappTurnos) {
    btnWhatsappTurnos.addEventListener("click", () => {
      const texto = textoTurnos();
      if (texto != null) compartirWhatsApp("Tabla de turnos — Citas", texto);
    });
  }

  const btnCorreoTurnos = document.getElementById("btnCorreoTurnos");
  if (btnCorreoTurnos) {
    btnCorreoTurnos.addEventListener("click", () => {
      const texto = textoTurnos();
      if (texto != null) compartirCorreo("Tabla de turnos — Citas", texto);
    });
  }

  const btnImprimirResultados = document.getElementById("btnImprimirResultados");
  if (btnImprimirResultados) btnImprimirResultados.addEventListener("click", imprimirResultados);

  const btnWhatsappResultados = document.getElementById("btnWhatsappResultados");
  if (btnWhatsappResultados) {
    btnWhatsappResultados.addEventListener("click", () => {
      const texto = textoResultados();
      if (texto != null) compartirWhatsApp("Resultados / Registros médicos", texto);
    });
  }

  const btnCorreoResultados = document.getElementById("btnCorreoResultados");
  if (btnCorreoResultados) {
    btnCorreoResultados.addEventListener("click", () => {
      const texto = textoResultados();
      if (texto != null) compartirCorreo("Resultados / Registros médicos", texto);
    });
  }

  const agendarForm = document.getElementById("agendarForm");
  if (agendarForm) {
    agendarForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!agendarCitaId) return;
      const fecha = document.getElementById("agendarFecha").value;
      const error = validarLimiteCitas(fecha);
      if (error) {
        alert(error);
        updateLimiteAgendar(fecha);
        return;
      }
      State.citas.push({
        id: Date.now(),
        pacienteId: agendarCitaId,
        fecha,
        hora: document.getElementById("agendarHora").value,
        amPm: document.getElementById("agendarAmPm") ? document.getElementById("agendarAmPm").value : "PM",
        motivo: document.getElementById("agendarMotivo").value.trim() || "Consulta",
        turno: genTurno(fecha)
      });
      saveKey("citas");
      const pacAgendar = State.pacientes.find(x => x.id === agendarCitaId);
      mostrarNotificacion(`Cita para <b>${pacAgendar ? pacAgendar.nombre : "el paciente"}</b> agendada correctamente`);
      agendarCitaId = null;
      cerrarModales();
      renderCitas();
      renderPacientesSinCita();
      renderHome();
      fillSelects();
    });
    const agFecha = document.getElementById("agendarFecha");
    if (agFecha) agFecha.addEventListener("change", () => updateLimiteAgendar(agFecha.value));
  }

  const citaForm = document.getElementById("citaForm");
  if (citaForm) {
    const today = new Date();
    document.getElementById("citaFecha").valueAsDate = today;
    document.getElementById("citaFecha").min = today.toISOString().split("T")[0];

    citaForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const fecha = document.getElementById("citaFecha").value;
      const error = validarLimiteCitas(fecha);
      if (error) {
        alert(error);
        updateCitaLimiteInfo();
        return;
      }
      const cita = {
        id: Date.now(),
        pacienteId: Number(document.getElementById("citaPaciente").value),
        fecha,
        hora: document.getElementById("citaHora").value,
        amPm: document.getElementById("citaAmPm") ? document.getElementById("citaAmPm").value : "PM",
        motivo: document.getElementById("citaMotivo").value.trim() || "Consulta",
        turno: genTurno(fecha)
      };
      State.citas.push(cita);
      saveKey("citas");
      const pacCita = State.pacientes.find(x => x.id === cita.pacienteId);
      mostrarNotificacion(`Cita para <b>${pacCita ? pacCita.nombre : "el paciente"}</b> agendada correctamente`);
      citaForm.reset();
      document.getElementById("citaFecha").valueAsDate = today;
      renderCitas();
      renderPacientesSinCita();
      renderHome();
    });

  const citaFecha = document.getElementById("citaFecha");
  if (citaFecha) {
    citaFecha.addEventListener("change", updateCitaLimiteInfo);
  }
  }

  const btnCitaSinConsulta = document.getElementById("btnCitaSinConsulta");
  if (btnCitaSinConsulta) btnCitaSinConsulta.addEventListener("click", abrirModalCitaSinConsulta);
  const citaSinConsultaForm = document.getElementById("citaSinConsultaForm");
  if (citaSinConsultaForm) citaSinConsultaForm.addEventListener("submit", guardarCitaSinConsulta);

  const completarCitaForm = document.getElementById("completarCitaForm");
  if (completarCitaForm) completarCitaForm.addEventListener("submit", guardarCitaCompletada);

  const registroForm = document.getElementById("registroForm");
  if (registroForm) {
    registroForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const registro = {
        id: Date.now(),
        pacienteId: Number(document.getElementById("registroPaciente").value),
        titulo: document.getElementById("registroTitulo").value.trim(),
        detalle: document.getElementById("registroDetalle").value.trim(),
        fecha: new Date().toLocaleDateString("es-ES")
      };
      const file = document.getElementById("registroArchivo").files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => {
          registro.archivo = { name: file.name, type: file.type, size: file.size, dataUrl: reader.result };
          pushRegistro(registro, registroForm);
        };
        reader.readAsDataURL(file);
      } else {
        pushRegistro(registro, registroForm);
      }
    });
  }

  function pushRegistro(registro, form) {
    State.registros.push(registro);
    saveKey("registros");
    mostrarNotificacion(`Registro <b>${registro.titulo}</b> agregado correctamente`);
    if (form) form.reset();
    renderRegistros();
    renderHome();
  }

  const regEForm = document.getElementById("regEForm");
  if (regEForm) regEForm.addEventListener("submit", (e) => {
    e.preventDefault();
    guardarRegistroEditado();
  });

  const buscarRegistro = document.getElementById("buscarRegistro");
  if (buscarRegistro) {
    buscarRegistro.addEventListener("input", () => renderRegistros(buscarRegistro.value));
  }

  const documentoForm = document.getElementById("documentoForm");
  if (documentoForm) {
    documentoForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const file = document.getElementById("documentoArchivo").files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const doc = {
          id: Date.now(),
          pacienteId: Number(document.getElementById("documentoPaciente").value),
          descripcion: document.getElementById("documentoDescripcion").value.trim() || file.name,
          name: file.name,
          type: file.type,
          size: file.size,
          dataUrl: reader.result,
          fecha: new Date().toLocaleDateString("es-ES")
        };
        State.documentos.push(doc);
        saveKey("documentos");
        documentoForm.reset();
        renderDocumentos();
        renderHome();
      };
      reader.readAsDataURL(file);
    });
  }

  const facturaForm = document.getElementById("facturaForm");
  if (facturaForm) {
    fillProcedimientos();

    document.getElementById("agregarConcepto").addEventListener("click", () => {
      const sel = document.getElementById("facturaProcedimiento");
      const idx = Number(sel.value);
      const proc = PROCEDIMIENTOS[idx];
      if (proc) {
        facturaCarrito.push({ nombre: proc.nombre, precio: proc.precio });
        renderFacturaItems();
      }
    });

    document.getElementById("facturaPorcentaje").addEventListener("input", () => {
      updateFacturaResumen();
    });

    facturaForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const pacienteId = Number(document.getElementById("facturaPaciente").value);
      if (!pacienteId) {
        alert("Selecciona un paciente.");
        return;
      }
      if (facturaCarrito.length === 0) {
        alert("Agrega al menos un procedimiento.");
        return;
      }

      const { subtotal, porcentaje, honorarios, neto } = calcFactura();
      const factura = {
        id: Date.now(),
        codigo: "FAC-" + (1000 + State.facturas.length),
        pacienteId,
        items: facturaCarrito.map(it => ({ ...it })),
        subtotal,
        porcentaje,
        honorarios,
        neto,
        total: subtotal,
        doctor: State.session ? State.session.name : "Doctor",
        fecha: new Date().toLocaleDateString("es-ES")
      };

      State.facturas.push(factura);
      saveKey("facturas");
      facturaCarrito = [];
      renderFacturaItems();
      renderFacturas();
      renderHome();
      alert("Factura " + factura.codigo + " emitida: total " + fmtMoney(factura.total));
    });
  }

  const recetaFormEl = document.getElementById("recetaForm");
  if (recetaFormEl) {
    const recetaFechaEl = document.getElementById("recetaFecha");
    if (recetaFechaEl) recetaFechaEl.valueAsDate = new Date();
    const recetaPacienteSel = document.getElementById("recetaPaciente");
    if (recetaPacienteSel) recetaPacienteSel.addEventListener("change", updateRecetaEdad);
    const btnAgregarMed = document.getElementById("btnAgregarMed");
    if (btnAgregarMed) btnAgregarMed.addEventListener("click", agregarFilaMed);
    const btnAgregarInd = document.getElementById("btnAgregarInd");
    if (btnAgregarInd) btnAgregarInd.addEventListener("click", agregarFilaInd);
    recetaFormEl.addEventListener("submit", guardarReceta);
  }

  const btnImprimirRecetaVista = document.getElementById("btnImprimirReceta");
  if (btnImprimirRecetaVista) {
    btnImprimirRecetaVista.addEventListener("click", () => {
      if (recetaActualId) imprimirReceta(recetaActualId);
    });
  }

  document.querySelectorAll("[data-seccion]").forEach(item => {
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      mostrarSeccion(item.dataset.seccion);
    });
  });

  document.querySelectorAll("[data-cerrar]").forEach(btn => {
    btn.addEventListener("click", () => {
      const m = document.getElementById(btn.dataset.cerrar);
      if (m) m.classList.remove("open");
    });
  });

  document.querySelectorAll(".modal-backdrop").forEach(bk => {
    bk.addEventListener("click", (e) => {
      if (e.target === bk) bk.classList.remove("open");
    });
  });

  const btnAbrirStats = document.getElementById("btnAbrirStatsPanel");
  if (btnAbrirStats) btnAbrirStats.addEventListener("click", abrirModalEstadisticas);

  const estDesde = document.getElementById("estDesde");
  const estHasta = document.getElementById("estHasta");
  if (estDesde && estHasta) {
    estDesde.addEventListener("change", () => {
      estHasta.min = estDesde.value;
      if (estHasta.value < estDesde.value) estHasta.value = estDesde.value;
      calcularEstadisticas();
    });
    estHasta.addEventListener("change", () => {
      if (estDesde.value > estHasta.value) estDesde.value = estHasta.value;
      calcularEstadisticas();
    });
  }

  const btnCalcularStats = document.getElementById("btnCalcularStats");
  if (btnCalcularStats) btnCalcularStats.addEventListener("click", calcularEstadisticas);

  const btnImprimirStats = document.getElementById("btnImprimirStats");
  if (btnImprimirStats) btnImprimirStats.addEventListener("click", imprimirEstadisticas);

  const btnExportarStats = document.getElementById("btnExportarStats");
  if (btnExportarStats) btnExportarStats.addEventListener("click", exportarEstadisticas);

  const btnCalendario = document.getElementById("btnCalendario");
  if (btnCalendario) btnCalendario.addEventListener("click", abrirCalendario);

  const calPrev = document.getElementById("calPrev");
  const calNext = document.getElementById("calNext");
  if (calPrev) calPrev.addEventListener("click", () => cambiarMes(-1));
  if (calNext) calNext.addEventListener("click", () => cambiarMes(1));

  const btnGuardarCal = document.getElementById("btnGuardarCal");
  if (btnGuardarCal) btnGuardarCal.addEventListener("click", guardarEdicionCalendario);

  const btnCancelarCal = document.getElementById("btnCancelarCal");
  if (btnCancelarCal) btnCancelarCal.addEventListener("click", () => {
    calendarioEditando = null;
    const ed = document.getElementById("calEditor");
    if (ed) ed.classList.remove("open");
  });

  const btnAdminBtn = document.getElementById("btnAdmin");
  if (btnAdminBtn) btnAdminBtn.addEventListener("click", abrirAdmin);

  const btnAyuda = document.getElementById("btnAyuda");
  if (btnAyuda) btnAyuda.addEventListener("click", () => abrirModal("modalAyuda"));

  const adminUserForm = document.getElementById("adminUserForm");
  if (adminUserForm) adminUserForm.addEventListener("submit", crearUsuarioAdmin);

  const btnGuardarConfig = document.getElementById("btnGuardarConfig");
  if (btnGuardarConfig) btnGuardarConfig.addEventListener("click", guardarConfig);

  fillSelects();
  renderPacientes();
  renderPacientesSinCita();
  renderCitas();
  renderCitasCompletadas();
  renderCitasSinConsulta();
  renderRegistros();
  renderDocumentos();
  renderFacturas();
  renderFacturaItems();
  renderRecetas();
  updateCitaLimiteInfo();
  renderPacientesEliminados();
  renderHome();
}

document.addEventListener("submit", (e) => {
  if (e.target.contains(document.getElementById("confPassword"))) {
    e.preventDefault();
    confirmarEliminacionDefinitiva();
  }
});

function mostrarSeccion(sec) {
  if (sec === "pacientes-eliminados" && !esAdmin()) sec = "inicio";
  document.querySelectorAll(".seccion").forEach(s => s.classList.remove("active"));
  const target = document.getElementById("seccion-" + sec);
  if (target) target.classList.add("active");
  if (sec === "inicio") renderHome();
  const title = document.getElementById("pageTitle");
  if (title) {
    const item = document.querySelector(`.nav-item[data-seccion="${sec}"] > a, .nav-sub-item[data-seccion="${sec}"] > a`);
    const label = item ? item.querySelector(".nav-label") : null;
    title.textContent = label ? label.textContent.trim() : (item ? item.textContent.trim() : sec);
  }
}

function setAvatar(imgEl, iconEl, foto) {
  if (!imgEl || !iconEl) return;
  if (foto) {
    imgEl.src = foto;
    imgEl.hidden = false;
    iconEl.hidden = true;
  } else {
    imgEl.removeAttribute("src");
    imgEl.hidden = true;
    iconEl.hidden = false;
  }
}

function cargarPerfil() {
  const u = State.session;
  if (!u) return;

  const nameEl = document.getElementById("sidebarUserName");
  if (nameEl) nameEl.textContent = u.name;

  const nombreEl = document.getElementById("perfilNombre");
  const emailEl = document.getElementById("perfilEmail");
  if (nombreEl) nombreEl.textContent = u.name;
  if (emailEl) emailEl.textContent = u.email;

  setAvatar(
    document.getElementById("sidebarAvatar"),
    document.getElementById("sidebarAvatarIcon"),
    u.foto
  );
  setAvatar(
    document.getElementById("perfilAvatar"),
    document.getElementById("perfilAvatarIcon"),
    u.foto
  );

  actualizarBotonesFoto();
}

function actualizarBotonesFoto() {
  const tieneFoto = !!(State.session && State.session.foto);
  const defs = [
    ["btnFotoAccion", "add_a_photo", "Subir foto"]
  ];
  defs.forEach(([id, icono, texto]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const ic = btn.querySelector(".foto-btn-icon");
    const tx = btn.querySelector(".foto-btn-text");
    if (ic) ic.textContent = tieneFoto ? "no_photography" : icono;
    if (tx) tx.textContent = tieneFoto ? "Remover foto" : texto;
  });
}

function quitarFotoPerfil() {
  if (State.session) {
    delete State.session.foto;
    DB.set("orto_session", State.session);
    const user = State.users.find(u => u.id === State.session.id);
    if (user) {
      delete user.foto;
      saveKey("users");
    }
  }
  cargarPerfil();
}

window.addEventListener("pagehide", () => {
  BD.guardarAntesDeSalir();
});

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await BD.cargar();
  } catch (err) {
    console.error("No se pudo cargar la base local:", err);
  }

  const navContainer = document.getElementById("nav-container");

  if (navContainer) {
    const cachedNav = sessionStorage.getItem("navHTML_v10");
    if (cachedNav) {
      navContainer.innerHTML = cachedNav;
      initApp();
    } else {
      fetch("nav.html")
        .then(response => {
          if (!response.ok) throw new Error("No se pudo cargar la barra de navegación.");
          return response.text();
        })
        .then(data => {
          sessionStorage.setItem("navHTML_v10", data);
          navContainer.innerHTML = data;
          initApp();
        })
        .catch(error => console.error("Error al cargar el nav:", error));
    }
  } else {
    initLogin();
  }
});