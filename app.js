const DB = {
  get(key, def) {
    try {
      return JSON.parse(localStorage.getItem(key)) || def;
    } catch {
      return def;
    }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
};

const State = {
  users: DB.get("orto_users", []),
  session: DB.get("orto_session", null),
  pacientes: DB.get("orto_pacientes", []),
  citas: DB.get("orto_citas", []),
  registros: DB.get("orto_registros", []),
  documentos: DB.get("orto_documentos", []),
  facturas: DB.get("orto_facturas", [])
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

function citasEnDia(fecha) {
  return State.citas.filter(c => c.fecha === fecha).length;
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
  return State.citas.filter(c => c.fecha >= inicio && c.fecha <= finISO).length;
}

function validarLimiteCitas(fecha) {
  if (citasEnDia(fecha) >= LIMITE_DIA_CITAS) {
    return `Límite diario alcanzado (${LIMITE_DIA_CITAS} citas ese día).`;
  }
  if (citasEnSemana(fecha) >= LIMITE_SEMANA_CITAS) {
    return `Límite semanal alcanzado (${LIMITE_SEMANA_CITAS} citas en la semana).`;
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

  const tabLogin = document.getElementById("tabLogin");
  const tabRegister = document.getElementById("tabRegister");
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");

  function switchTab(showLogin) {
    tabLogin.classList.toggle("active", showLogin);
    tabRegister.classList.toggle("active", !showLogin);
    loginForm.classList.toggle("hidden", !showLogin);
    registerForm.classList.toggle("hidden", showLogin);
  }

  tabLogin.addEventListener("click", () => switchTab(true));
  tabRegister.addEventListener("click", () => switchTab(false));

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

    const user = { id: Date.now(), name, email, password, createdAt: new Date().toISOString() };
    State.users.push(user);
    saveKey("users");
    msg.textContent = "Usuario creado correctamente. Ya puedes iniciar sesión.";
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

  document.querySelectorAll(".nav-item a").forEach(link => {
    link.addEventListener("click", () => {
      sideMenu.classList.remove("active");
      updateIcon();
    });
  });

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", logout);
}

function genCodigoPaciente() {
  const prefix = "ORT";
  const num = 1000 + State.pacientes.length;
  return prefix + "-" + num;
}

function renderPacientes(filtro = "") {
  const lista = document.getElementById("listaPacientes");
  if (!lista) return;

  const q = filtro.trim().toLowerCase();
  const data = State.pacientes.filter(p => {
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
}

let pacienteActual = null;

function renderPacientesSinCita() {
  const lista = document.getElementById("listaSinCitas");
  const countEl = document.getElementById("countSinCita");
  if (!lista) return;

  const sinCita = State.pacientes.filter(p => !State.citas.some(c => c.pacienteId === p.id));
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

function agendarPacienteSinCita(id) {
  const sel = document.getElementById("citaPaciente");
  if (sel) sel.value = id;
  mostrarSeccion("citas");
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
  el.textContent = `Citas ese día: ${enDia}/${LIMITE_DIA_CITAS} · Citas en la semana: ${enSemana}/${LIMITE_SEMANA_CITAS}`;
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
        ${prox ? `${prox.fecha} · ${prox.hora} — ${prox.motivo}` : "Sin cita programada"}
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
        <tr><td><strong>Próxima cita</strong></td><td>${prox ? `${prox.fecha} · ${prox.hora} — ${prox.motivo}` : "Sin cita programada"}</td></tr>
        <tr><td><strong>Notas</strong></td><td>${p.notas || "Sin notas"}</td></tr>
      </tbody>
    </table>
    <p style="margin-top:8px"><strong>Citas:</strong> ${citas.length} · <strong>Documentos:</strong> ${documentos.length}</p>
  `);
}

function borrarPaciente(id) {
  if (!confirm("¿Eliminar este paciente y sus datos asociados?")) return;
  State.pacientes = State.pacientes.filter(p => p.id !== id);
  State.citas = State.citas.filter(c => c.pacienteId !== id);
  State.registros = State.registros.filter(r => r.pacienteId !== id);
  State.documentos = State.documentos.filter(d => d.pacienteId !== id);
  saveKey("pacientes");
  saveKey("citas");
  saveKey("registros");
  saveKey("documentos");
  renderPacientes(document.getElementById("buscarPaciente").value);
}

function fillSelects() {
  const opts = State.pacientes
    .map(p => `<option value="${p.id}">${p.codigo} — ${p.nombre}</option>`)
    .join("");

  ["citaPaciente", "registroPaciente", "documentoPaciente", "facturaPaciente"].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) {
      sel.innerHTML = opts || `<option value="">Sin pacientes</option>`;
    }
  });
}

function renderCitas() {
  const lista = document.getElementById("listaCitas");
  if (!lista) return;

  const data = [...State.citas].sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));

  if (data.length === 0) {
    lista.innerHTML = `<p class="empty">No hay citas registradas.</p>`;
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
          <span class="tag">${c.fecha} · ${c.hora}</span>
          <span class="tag">Turno ${c.turno || "—"}</span>
        </div>
        <div class="item-sub">${c.motivo || "Sin motivo"} · ${fechaTxt}</div>
        <div class="item-actions">
          <button class="btn-icon danger" data-borrar-cita="${c.id}" title="Eliminar cita">
            <span class="material-symbols-outlined">delete</span>
          </button>
        </div>
      </div>
    `;
  }).join("");

  lista.querySelectorAll("[data-borrar-cita]").forEach(b =>
    b.addEventListener("click", () => {
      State.citas = State.citas.filter(x => x.id !== Number(b.dataset.borrarCita));
      saveKey("citas");
      renderCitas();
      renderHome();
    })
  );
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
        </div>
        <div class="item-sub">${p ? p.nombre : "Paciente eliminado"} — ${r.detalle || ""}</div>
        <div class="item-actions">
          <button class="btn-icon danger" data-borrar-reg="${r.id}" title="Eliminar registro">
            <span class="material-symbols-outlined">delete</span>
          </button>
        </div>
      </div>
    `;
  }).join("");

  lista.querySelectorAll("[data-borrar-reg]").forEach(b =>
    b.addEventListener("click", () => {
      State.registros = State.registros.filter(x => x.id !== Number(b.dataset.borrarReg));
      saveKey("registros");
      renderRegistros();
      renderHome();
    })
  );
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
          <button class="btn-icon danger" data-borrar-doc="${d.id}" title="Eliminar">
            <span class="material-symbols-outlined">delete</span>
          </button>
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

function renderProximasCitas() {
  const cont = document.getElementById("proximasCitas");
  if (!cont) return;

  const hoy = new Date();
  const hoyISO = hoy.toISOString();

  const proximas = State.citas
    .filter(c => (c.fecha + "T" + (c.hora || "23:59")) >= hoyISO)
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
          <span class="tag">${c.fecha} · ${c.hora}</span>
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
        <td>${c.hora}</td>
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
    return `${i + 1}. ${c.fecha} ${c.hora} | Turno ${c.turno || "—"} | ${p ? p.nombre : "Paciente eliminado"}${p && p.cedula ? " (" + p.cedula + ")" : ""} | ${c.motivo || ""}`;
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
    `Próxima cita: ${prox ? `${prox.fecha} · ${prox.hora} — ${prox.motivo}` : "Sin cita programada"}`,
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
  document.getElementById("statPacientes").textContent = State.pacientes.length;
  document.getElementById("statCitas").textContent = State.citas.length;
  document.getElementById("statRegistros").textContent = State.registros.length;
  document.getElementById("statDocumentos").textContent = State.documentos.length;
  document.getElementById("statFacturas").textContent = State.facturas.length;
  document.getElementById("statSinCita").textContent =
    State.pacientes.filter(p => !State.citas.some(c => c.pacienteId === p.id)).length;
  renderProximasCitas();
}

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
          <button class="btn-icon danger" data-borrar-factura="${f.id}" title="Eliminar factura">
            <span class="material-symbols-outlined">delete</span>
          </button>
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

function initApp() {
  if (isLoginPage()) return;

  if (!State.session) {
    window.location.href = "login.html";
    return;
  }

  const userChip = document.getElementById("sidebarUserName");
  if (userChip) userChip.textContent = State.session.name;

  document.getElementById("todayDate").textContent =
    new Date().toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

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

      const proxFecha = document.getElementById("pacienteProxCitaFecha").value;
      const proxHora = document.getElementById("pacienteProxCitaHora").value;
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
        motivo: document.getElementById("citaMotivo").value.trim() || "Consulta",
        turno: genTurno(fecha)
      };
      State.citas.push(cita);
      saveKey("citas");
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
      State.registros.push(registro);
      saveKey("registros");
      registroForm.reset();
      renderRegistros();
      renderHome();
    });
  }

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

  document.querySelectorAll(".nav-item").forEach(item => {
    item.addEventListener("click", () => {
      mostrarSeccion(item.dataset.seccion);
    });
  });

  fillSelects();
  renderPacientes();
  renderPacientesSinCita();
  renderCitas();
  renderRegistros();
  renderDocumentos();
  renderFacturas();
  renderFacturaItems();
  updateCitaLimiteInfo();
  renderHome();
}

function mostrarSeccion(sec) {
  document.querySelectorAll(".seccion").forEach(s => s.classList.remove("active"));
  const target = document.getElementById("seccion-" + sec);
  if (target) target.classList.add("active");
  const title = document.getElementById("pageTitle");
  if (title) {
    const item = document.querySelector(`.nav-item[data-seccion="${sec}"] a`);
    title.textContent = item ? item.textContent.trim() : sec;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const navContainer = document.getElementById("nav-container");

  if (navContainer) {
    const cachedNav = sessionStorage.getItem("navHTML");
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
          sessionStorage.setItem("navHTML", data);
          navContainer.innerHTML = data;
          initApp();
        })
        .catch(error => console.error("Error al cargar el nav:", error));
    }
  } else {
    initLogin();
  }
});