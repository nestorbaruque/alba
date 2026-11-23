// ---- Puente con la app (y datos de ejemplo si se abre en un navegador) ----
const T = window.__TAURI__;
const invoke = T ? T.core.invoke : async (orden, args) => {
  console.log("[sin app]", orden, args || "");
  if (orden === "estado") {
    const dias = [], d = new Date();
    for (let i = 1; i <= 12; i++) { d.setDate(d.getDate() - 1); if (i !== 4 && i !== 9) dias.push(clave(d)); }
    const desde = new Date(); desde.setDate(desde.getDate() - 12);
    return { nombre: "Ana", cita: "Solo amanece el día para el que estamos despiertos.", autor: "Henry David Thoreau", racha: 3, dias, desde: clave(desde), dias_semana: [0, 1, 2, 3, 4, 5, 6], total: dias.length, hecho_hoy: false };
  }
  if (orden === "leer_ajustes") return null;
};

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const vista = params.get("v") || "check";
const probando = vista === "probar";
function clave(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }

// ---- Escena: mismo dibujo y misma semilla que la versión de Mac ----
const NS = "http://www.w3.org/2000/svg";
const CAPAS = [ // base, amplitudes, frecuencias, fases, color, pinos [altoMin, altoMax, pasoMin, pasoMax] o null
  [740, [38, 18], [.0042, .011], [6.04, 4.3], "#a9c4b8", null],
  [830, [26, 12], [.006, .017], [2.4, .3], "#86aa92", [32, 62, 14, 24]],
  [905, [22, 10], [.005, .021], [1.1, 3.0], "#5a8468", [55, 105, 20, 34]],
  [980, [18, 8], [.007, .019], [4.0, 1.7], "#335a47", [80, 150, 28, 46]],
];
function azar(semilla) { let s = semilla >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }
function svg(tag, attrs, padre) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); padre && padre.appendChild(e); return e; }
function cresta([base, A, f, p], x) { return base + A[0] * Math.sin(x * f[0] + p[0]) + A[1] * Math.sin(x * f[1] + p[1]); }
function caminoCapa(capa, r) {
  let d = "M-20 1000 L-20 " + cresta(capa, -20).toFixed(1);
  for (let x = 0; x <= 1620; x += 20) d += " L" + x + " " + cresta(capa, x).toFixed(1);
  d += " L1620 1000 Z";
  const pinos = capa[5];
  if (pinos) {
    let x = -10;
    while (x < 1620) {
      const h = pinos[0] + r() * (pinos[1] - pinos[0]), w = h * 0.42, y = cresta(capa, x) + 6;
      d += ` M${(x - w / 2).toFixed(1)} ${y.toFixed(1)} L${x.toFixed(1)} ${(y - h).toFixed(1)} L${(x + w / 2).toFixed(1)} ${y.toFixed(1)} Z`;
      x += pinos[2] + r() * (pinos[3] - pinos[2]);
    }
  }
  return d;
}
function dibujarEscena(raiz) {
  const defs = svg("defs", {}, raiz);
  const g = (id, stops, extra = {}) => { const l = svg(extra.r ? "radialGradient" : "linearGradient", Object.assign({ id }, extra.r ? { cx: .5, cy: .5, r: .5 } : { x1: 0, y1: 0, x2: 0, y2: 1 }), defs); stops.forEach(([o, c, a = 1]) => svg("stop", { offset: o, "stop-color": c, "stop-opacity": a }, l)); };
  g("cielo", [[0, "#bcd8df"], [.55, "#dfe9df"], [.8, "#f4e6c6"]]);
  g("calido", [[0, "#f6d9a8", 0], [.5, "#f7d6a0", .55], [.8, "#f9c98a", .9]]);
  g("disco", [[0, "#fff3cf"], [.6, "#ffd98a"], [1, "#f6b75c"]], { r: 1 });
  g("halo", [[0, "#fff1c4", .85], [.3, "#ffe6aa", .4], [.55, "#ffe6aa", .14], [.8, "#ffe6aa", .03], [1, "#ffe6aa", 0]], { r: 1 });
  g("niebla", [[0, "#ffffff", 0], [1, "#ffffff", .55]]);
  svg("rect", { width: 1600, height: 1000, fill: "url(#cielo)" }, raiz);
  svg("rect", { width: 1600, height: 1000, fill: "url(#calido)", class: "calido" }, raiz);
  const sol = svg("g", { class: "sol" }, raiz);
  svg("circle", { cx: 1180, cy: 740, r: 400, fill: "url(#halo)" }, sol);
  svg("circle", { cx: 1180, cy: 740, r: 130, fill: "url(#disco)" }, sol);
  const r = azar(20270108);
  CAPAS.forEach((capa, i) => {
    svg("path", { d: caminoCapa(capa, r), fill: capa[4] }, raiz);
    if (i < 2) svg("rect", { x: 0, y: capa[0] - 40, width: 1600, height: 140, fill: "url(#niebla)" }, raiz);
  });
}
dibujarEscena($("escena"));

// ---- Calendario del mes: verde los días conseguidos, rojo los que no ----
// Estado de un día: ok (marcado), ko (fallado), descanso (día no elegido), futuro o nada.
function estadoDia(fecha, e) {
  const k = clave(fecha), hoyK = clave(new Date());
  if (e.dias.includes(k)) return "ok";
  if (!e.dias_semana.includes((fecha.getDay() + 6) % 7)) return "descanso";
  if (k < hoyK && k > e.desde) return "ko"; // el día de instalación no cuenta como fallado
  if (k > hoyK) return "futuro";
  return "";
}
function nombreDelMes(f) { const m = f.toLocaleDateString("es-ES", { month: "long" }); return m[0].toUpperCase() + m.slice(1) + " " + f.getFullYear(); }
function pintarCalendario(caja, e, conLeyenda) {
  const hoy = new Date(), hoyK = clave(hoy);
  const año = hoy.getFullYear(), mes = hoy.getMonth();
  caja.textContent = "";
  const titulo = document.createElement("div"); titulo.className = "mes"; titulo.textContent = nombreDelMes(hoy);
  const r = document.createElement("div"); r.className = "rejilla";
  caja.append(titulo, r);
  for (const ds of ["L", "M", "X", "J", "V", "S", "D"]) { const d = document.createElement("div"); d.className = "ds"; d.textContent = ds; r.appendChild(d); }
  const hueco = (new Date(año, mes, 1).getDay() + 6) % 7; // el lunes primero
  for (let i = 0; i < hueco; i++) r.appendChild(document.createElement("div"));
  const total = new Date(año, mes + 1, 0).getDate();
  const titulos = { ok: "Conseguido", ko: "No", descanso: "Día libre" };
  for (let n = 1; n <= total; n++) {
    const f = new Date(año, mes, n), est = estadoDia(f, e);
    const d = document.createElement("div");
    d.className = "dia" + (est ? " " + est : "");
    d.textContent = n;
    if (titulos[est]) d.title = titulos[est];
    if (clave(f) === hoyK) { d.classList.add("hoy"); d.dataset.hoy = "1"; }
    r.appendChild(d);
  }
  if (conLeyenda) {
    const l = document.createElement("div"); l.className = "leyenda";
    l.innerHTML = '<span><i class="punto ok"></i>Conseguido</span><span><i class="punto ko"></i>No</span>';
    caja.appendChild(l);
  }
}

// ---- Racha ----
function lineaRacha(n, nuevo) {
  const d = document.createElement("div");
  if (n === 0) d.textContent = "Hoy empieza tu racha";
  else { const b = document.createElement("b"); b.textContent = n; d.append(b, n === 1 ? "día" : "días seguidos"); }
  if (nuevo) d.setAttribute("aria-live", "polite");
  return d;
}

// ---- Pantalla del check ----
async function iniciarCheck() {
  $("vista-check").hidden = false;
  $("aviso-prueba").hidden = !probando;
  const e = await invoke("estado");
  $("fecha").textContent = new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  $("saludo").textContent = e.nombre ? "Buenos días, " + e.nombre : "Buenos días";
  $("cita").textContent = "«" + e.cita + "»";
  $("autor").textContent = e.autor;
  $("racha").append(lineaRacha(e.racha), lineaRacha(e.racha + 1, true));
  pintarCalendario($("calendario"), e, false);

  let hecho = false;
  const marcar = async () => {
    if (hecho) return;
    hecho = true;
    const c = $("check");
    c.classList.add("hecho"); c.setAttribute("aria-pressed", "true");
    document.body.classList.add("amanece");
    document.querySelector("#calendario [data-hoy]")?.classList.add("ok");
    if (!probando) await invoke("marcar");
    setTimeout(salir, 4000);
  };
  $("check").addEventListener("click", marcar);
  document.addEventListener("keydown", ev => {
    if ((ev.key === "Enter" || ev.key === " ") && document.activeElement?.id !== "hoy-no") { ev.preventDefault(); marcar(); }
  });
  $("hoy-no").addEventListener("click", async () => {
    if (hecho) return;
    hecho = true;
    if (!probando) await invoke("hoy_no");
    salir();
  });
}
function salir() {
  document.body.classList.add("saliendo");
  setTimeout(() => invoke("cerrar_check"), 1300);
}

// ---- Ventana de la racha (mirarla no cuenta como check) ----
async function iniciarRacha() {
  $("vista-racha").hidden = false;
  const e = await invoke("estado");
  $("r-numero").textContent = e.racha;
  $("r-unidad").textContent = e.racha === 1 ? "día seguido" : "días seguidos";
  $("r-estado").textContent = e.hecho_hoy ? "Hoy ya lo has marcado." : "Hoy aún no lo has marcado.";
  $("r-estado").classList.toggle("hecho", e.hecho_hoy);
  $("r-total").textContent = e.total + (e.total === 1 ? " mañana marcada" : " mañanas marcadas") + " en total";
  pintarCalendario($("r-calendario"), e, false);
  $("ir-ajustes").addEventListener("click", () => invoke("abrir_ajustes_cmd"));

  const aviso = t => { $("aviso-imagen").textContent = t; clearTimeout(aviso.t); aviso.t = setTimeout(() => $("aviso-imagen").textContent = "", 5000); };
  const nombre = "alba-racha-" + clave(new Date()) + ".png";
  $("compartir").addEventListener("click", async ev => {
    const b = ev.currentTarget; b.disabled = true;
    try {
      const blob = await imagenRacha(e);
      if (T && await invoke("copiar_imagen", { datos: await base64(blob) })) {
        aviso("Imagen copiada. Pégala donde quieras compartirla.");
      } else {
        await guardar(blob);
      }
    } catch (_) {
      aviso("No se pudo compartir aquí. Usa «Guardar imagen».");
    } finally { b.disabled = false; }
  });
  $("guardar").addEventListener("click", async ev => {
    const b = ev.currentTarget; b.disabled = true;
    try { await guardar(await imagenRacha(e)); } finally { b.disabled = false; }
  });
  const base64 = blob => new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result.split(",")[1]); r.readAsDataURL(blob); });
  async function guardar(blob) {
    if (T) { if (await invoke("guardar_imagen", { datos: await base64(blob) })) aviso("Imagen guardada."); }
    else { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nombre; a.click(); }
  }
}

// ---- Imagen para compartir: formato historia (1080 x 1920) ----
// El bosque con el sol ya fuera, la fecha, la racha grande, el calendario del mes y "alba" abajo.
async function imagenRacha(e) {
  const W = 1080, H = 1920;
  // Escena en SVG: cielo cálido, sol centrado y alto, montes delante.
  const fuente = $("escena");
  const defs = fuente.querySelector("defs").outerHTML;
  const capas = [...fuente.querySelectorAll("path, rect[fill='url(#niebla)']")].map(n => n.outerHTML).join("");
  const lado = 800 * Math.max(W / 1600, H / 1000) * 0.68; // como en la app de Mac
  const svgTxt = `<svg xmlns="${NS}" width="${W}" height="${H}">${defs}
    <svg viewBox="0 0 1600 1000" width="${W}" height="${H}" preserveAspectRatio="xMidYMax slice">
      <rect width="1600" height="1000" fill="url(#cielo)"/><rect width="1600" height="1000" fill="url(#calido)"/></svg>
    <circle cx="${W / 2}" cy="1330" r="${lado / 2}" fill="url(#halo)"/>
    <circle cx="${W / 2}" cy="1330" r="${lado * 130 / 800}" fill="url(#disco)"/>
    <svg viewBox="0 0 1600 1000" width="${W}" height="${H}" preserveAspectRatio="xMidYMax slice">${capas}</svg></svg>`;
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svgTxt], { type: "image/svg+xml" }));
  await new Promise((ok, mal) => { img.onload = ok; img.onerror = mal; img.src = url; });
  await Promise.all(["300 240px Newsreader", "italic 300 48px Newsreader", "400 30px Inter", "500 20px Inter"].map(f => document.fonts.load(f)));

  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d");
  x.drawImage(img, 0, 0, W, H);
  URL.revokeObjectURL(url);
  x.textAlign = "center"; x.textBaseline = "top";
  const tinta = "#22362d", suave = "#4b6156";
  const texto = (t, font, color, y, espacio = 0) => {
    x.font = font; x.fillStyle = color;
    if ("letterSpacing" in x) x.letterSpacing = espacio + "px";
    x.fillText(t, W / 2 + espacio / 2, y);
    if ("letterSpacing" in x) x.letterSpacing = "0px";
  };
  const hoy = new Date();
  texto(hoy.toLocaleDateString("es-ES", { day: "numeric", month: "long" }).toUpperCase(), "400 30px Inter", suave, 110, 6);
  texto(String(e.racha), "300 240px Newsreader", tinta, 172);
  texto(e.racha === 1 ? "día de racha" : "días de racha", "300 76px Newsreader", tinta, 440);
  texto("levantándome sin scrollear", "400 38px Inter", suave, 548, 1);

  // Calendario (mismas medidas que en la app de Mac, a escala 1,9)
  const k = 1.9, cw = (7 * 40 + 32) * k, ch = (56 + 6 * 40 + 16) * k, cx = (W - cw) / 2, cy = 640;
  x.save(); x.translate(cx, cy); x.scale(k, k);
  x.fillStyle = "rgba(255,255,255,.72)";
  x.beginPath(); x.roundRect(0, 0, cw / k, ch / k, 14); x.fill();
  x.textAlign = "left"; x.font = "300 20px Newsreader"; x.fillStyle = tinta; x.fillText(nombreDelMes(hoy), 16, 10);
  x.textAlign = "center"; x.font = "400 11px Inter"; x.fillStyle = suave;
  ["L", "M", "X", "J", "V", "S", "D"].forEach((l, i) => x.fillText(l, 16 + i * 40 + 20, 40));
  const año = hoy.getFullYear(), mes = hoy.getMonth(), hoyK = clave(hoy);
  const hueco = (new Date(año, mes, 1).getDay() + 6) % 7, total = new Date(año, mes + 1, 0).getDate();
  for (let n = 1; n <= total; n++) {
    const f = new Date(año, mes, n), est = estadoDia(f, e), pos = hueco + n - 1;
    const px = 16 + (pos % 7) * 40, py = 56 + Math.floor(pos / 7) * 40;
    let col = suave;
    x.beginPath(); x.arc(px + 20, py + 19, 15, 0, Math.PI * 2);
    if (est === "ok") { x.fillStyle = "#3d6b52"; x.fill(); col = "#fff"; }
    else if (est === "ko") { x.fillStyle = "rgba(201,103,91,.85)"; x.fill(); col = "#fff"; }
    else if (est === "futuro" || est === "descanso") col = "rgba(75,97,86,.45)";
    if (clave(f) === hoyK && est !== "ok") { x.strokeStyle = tinta; x.lineWidth = 1.2; x.stroke(); col = tinta; }
    x.font = "500 13px Inter"; x.fillStyle = col; x.fillText(String(n), px + 20, py + 12);
  }
  x.restore();
  texto("alba", "italic 300 48px Newsreader", "#fff", 1790);
  return await new Promise(ok => c.toBlob(ok, "image/png"));
}

// ---- Ajustes ----
async function iniciarAjustes() {
  $("vista-ajustes").hidden = false;
  const a = await invoke("leer_ajustes");
  if (a) {
    $("nombre").value = a.nombre;
    $("hora").value = String(a.hora).padStart(2, "0") + ":" + String(a.minuto).padStart(2, "0");
    document.querySelector(`input[name=modo][value=${a.modo === "ventana" ? "ventana" : "completa"}]`).checked = true;
    document.querySelectorAll("input[name=dia]").forEach(c => c.checked = a.dias_semana.includes(Number(c.value)));
  }
  $("nombre").focus();
  $("form").addEventListener("submit", async ev => {
    ev.preventDefault();
    const [hora, minuto] = ($("hora").value || "08:00").split(":").map(Number);
    const modo = document.querySelector("input[name=modo]:checked").value;
    const diasSemana = [...document.querySelectorAll("input[name=dia]:checked")].map(c => Number(c.value));
    if (!diasSemana.length) { $("aviso-dias").hidden = false; return; }
    await invoke("guardar_ajustes", { nombre: $("nombre").value, hora, minuto, modo, diasSemana });
  });
}

(vista === "ajustes" ? iniciarAjustes() : vista === "racha" ? iniciarRacha() : iniciarCheck()).finally(() => requestAnimationFrame(() => document.body.classList.add("visible")));
