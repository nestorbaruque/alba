// alba: cada día, a partir de la hora que elijas, tapa la pantalla con un
// amanecer, un saludo, la cita del día y tu racha, hasta que marcas "Me he levantado".
// Vive en segundo plano con un icono junto al reloj (o en la barra de menús del Mac).

use chrono::{Datelike, Duration, Local, NaiveDate, Timelike};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_dialog::DialogExt;

const CITAS: &str = include_str!("../citas.txt");
const ARG_AUTO: &str = "--al-iniciar";

#[derive(Serialize, Deserialize, Clone, Default)]
struct Ajustes {
    nombre: String,
    hora: u32,
    minuto: u32,
    /// Día (yyyy-mm-dd) en que se pulsó "Hoy no".
    #[serde(default)]
    saltado: Option<String>,
    /// "completa" o "ventana".
    #[serde(default = "completa")]
    modo: String,
    /// Primer día de uso: antes de él el calendario no pinta nada.
    #[serde(default)]
    desde: Option<String>,
    /// Días de la semana en que sale: 0 = lunes … 6 = domingo.
    #[serde(default = "todos")]
    dias_semana: Vec<u32>,
}
fn completa() -> String {
    "completa".into()
}
fn todos() -> Vec<u32> {
    (0..7).collect()
}
impl Ajustes {
    fn toca_el(&self, d: NaiveDate) -> bool {
        self.dias_semana.contains(&d.weekday().num_days_from_monday())
    }
}

#[derive(Serialize)]
struct Estado {
    nombre: String,
    cita: String,
    autor: String,
    racha: u32,
    /// Días marcados (yyyy-mm-dd), para el calendario.
    dias: Vec<String>,
    desde: String,
    dias_semana: Vec<u32>,
    total: usize,
    hecho_hoy: bool,
}

// ---------- Archivos ----------

fn ruta_ajustes(app: &AppHandle) -> PathBuf {
    app.path().app_config_dir().unwrap().join("ajustes.json")
}
fn ruta_registro(app: &AppHandle) -> PathBuf {
    app.path().app_data_dir().unwrap().join("registro.txt")
}

fn leer(app: &AppHandle) -> Option<Ajustes> {
    let t = fs::read_to_string(ruta_ajustes(app)).ok()?;
    serde_json::from_str(&t).ok()
}
fn escribir(app: &AppHandle, a: &Ajustes) {
    let r = ruta_ajustes(app);
    let _ = fs::create_dir_all(r.parent().unwrap());
    let _ = fs::write(r, serde_json::to_string_pretty(a).unwrap());
}

fn clave(d: NaiveDate) -> String {
    d.format("%Y-%m-%d").to_string()
}
fn hoy() -> NaiveDate {
    Local::now().date_naive()
}

fn dias_marcados(app: &AppHandle) -> HashSet<String> {
    fs::read_to_string(ruta_registro(app))
        .unwrap_or_default()
        .lines()
        .filter(|l| l.len() >= 10)
        .map(|l| l[..10].to_string())
        .collect()
}

// Días seguidos hasta hoy (o hasta ayer, si hoy aún no has marcado). Los días de
// descanso no la rompen, y si los marcas también suman.
fn racha(dias: &HashSet<String>, a: &Ajustes) -> u32 {
    let mut d = hoy();
    if !dias.contains(&clave(d)) {
        d -= Duration::days(1);
    }
    let mut n = 0;
    for _ in 0..3700 {
        if dias.contains(&clave(d)) {
            n += 1;
        } else if a.toca_el(d) || a.dias_semana.is_empty() {
            break;
        }
        d -= Duration::days(1);
    }
    n
}
fn marcado_hoy(app: &AppHandle) -> bool {
    dias_marcados(app).contains(&clave(hoy()))
}

// Una cita por línea: "frase<TAB>autor". La del día del año.
fn cita_de_hoy() -> (String, String) {
    let lineas: Vec<(&str, &str)> = CITAS
        .lines()
        .filter(|l| !l.starts_with('#'))
        .filter_map(|l| l.split_once('\t'))
        .collect();
    if lineas.is_empty() {
        return ("Solo amanece el día para el que estamos despiertos.".into(), "Henry David Thoreau".into());
    }
    let (f, a) = lineas[hoy().ordinal() as usize % lineas.len()];
    (f.into(), a.into())
}

// ---------- Ventanas ----------

fn abrir_check(app: &AppHandle, probando: bool) {
    if let Some(v) = app.get_webview_window("check") {
        let _ = v.set_focus();
        return;
    }
    let ventana = leer(app).map(|a| a.modo == "ventana").unwrap_or(false);
    let url = format!("index.html?v={}{}", if probando { "probar" } else { "check" }, if ventana { "&ventana" } else { "" });
    let b = WebviewWindowBuilder::new(app, "check", WebviewUrl::App(url.into()))
        .title("Buenos días")
        .always_on_top(true)
        .focused(true);
    let b = if ventana {
        b.inner_size(1120.0, 700.0).min_inner_size(820.0, 560.0).center()
    } else {
        b.decorations(false).transparent(true).skip_taskbar(true).resizable(false).fullscreen(true)
    };
    let v = b.build();
    if let Ok(v) = v {
        let _ = v.set_focus();
    }
}

fn abrir_ajustes(app: &AppHandle) {
    if let Some(v) = app.get_webview_window("ajustes") {
        let _ = v.unminimize();
        let _ = v.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, "ajustes", WebviewUrl::App("index.html?v=ajustes".into()))
        .title("alba")
        .inner_size(560.0, 740.0)
        .resizable(false)
        .center()
        .focused(true)
        .build()
        .map(|v| v.set_focus());
}

// Ventana normal para mirar la racha a cualquier hora (no cuenta como check).
fn abrir_racha(app: &AppHandle) {
    if let Some(v) = app.get_webview_window("racha") {
        let _ = v.unminimize();
        let _ = v.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, "racha", WebviewUrl::App("index.html?v=racha".into()))
        .title("alba")
        .inner_size(560.0, 780.0)
        .resizable(false)
        .center()
        .focused(true)
        .build()
        .map(|v| v.set_focus());
}

// Al abrirla a mano: la racha si ya está configurada; si no, los ajustes.
fn abrir_principal(app: &AppHandle) {
    if leer(app).is_some() {
        abrir_racha(app)
    } else {
        abrir_ajustes(app)
    }
}

// ¿Toca enseñar el check ahora?
fn toca(app: &AppHandle) -> bool {
    let Some(a) = leer(app) else { return false };
    let ahora = Local::now();
    let hoy = clave(hoy());
    let minutos = ahora.hour() * 60 + ahora.minute();
    minutos >= a.hora * 60 + a.minuto
        && a.toca_el(self::hoy())
        && a.desde.as_deref() != Some(hoy.as_str()) // el día que la instalas no sale
        && a.saltado.as_deref() != Some(hoy.as_str())
        && !dias_marcados(app).contains(&hoy)
}

// ---------- Órdenes desde la página ----------

#[tauri::command]
fn estado(app: AppHandle) -> Estado {
    let (cita, autor) = cita_de_hoy();
    let a = leer(&app).unwrap_or_default();
    let dias = dias_marcados(&app);
    let mut desde = a.desde.clone().unwrap_or_else(|| clave(hoy()));
    if let Some(primero) = dias.iter().min() {
        desde = desde.min(primero.clone());
    }
    let racha = racha(&dias, &a);
    let hecho_hoy = dias.contains(&clave(hoy()));
    let total = dias.len();
    Estado { nombre: a.nombre, cita, autor, racha, dias: dias.into_iter().collect(), desde, dias_semana: a.dias_semana, total, hecho_hoy }
}

#[tauri::command]
fn marcar(app: AppHandle) {
    if marcado_hoy(&app) {
        return;
    }
    let r = ruta_registro(&app);
    let _ = fs::create_dir_all(r.parent().unwrap());
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(r) {
        let _ = writeln!(f, "{}", Local::now().format("%Y-%m-%d %H:%M"));
    }
}

#[tauri::command]
fn hoy_no(app: AppHandle) {
    if let Some(mut a) = leer(&app) {
        a.saltado = Some(clave(hoy()));
        escribir(&app, &a);
    }
}

#[tauri::command]
fn cerrar_check(app: AppHandle) {
    if let Some(v) = app.get_webview_window("check") {
        let _ = v.destroy();
    }
}

// Guarda la imagen de la racha donde elija la persona (por defecto, en Imágenes).
#[tauri::command]
async fn guardar_imagen(app: AppHandle, datos: String) -> bool {
    use base64::Engine;
    let Ok(png) = base64::engine::general_purpose::STANDARD.decode(datos) else { return false };
    let mut d = app.dialog().file()
        .set_file_name(format!("alba-racha-{}.png", clave(hoy())))
        .add_filter("Imagen PNG", &["png"]);
    if let Ok(imagenes) = app.path().picture_dir() {
        d = d.set_directory(imagenes);
    }
    if let Some(v) = app.get_webview_window("racha") {
        d = d.set_parent(&v);
    }
    match d.blocking_save_file().and_then(|r| r.into_path().ok()) {
        Some(ruta) => fs::write(ruta, png).is_ok(),
        None => false,
    }
}

// "Compartir mi racha": copia la imagen al portapapeles para pegarla donde se quiera.
#[tauri::command]
fn copiar_imagen(app: AppHandle, datos: String) -> bool {
    use base64::Engine;
    use tauri_plugin_clipboard_manager::ClipboardExt;
    let Ok(png) = base64::engine::general_purpose::STANDARD.decode(datos) else { return false };
    let Ok(img) = tauri::image::Image::from_bytes(&png) else { return false };
    app.clipboard().write_image(&img).is_ok()
}

#[tauri::command]
fn abrir_ajustes_cmd(app: AppHandle) {
    abrir_ajustes(&app);
}

#[tauri::command]
fn leer_ajustes(app: AppHandle) -> Option<Ajustes> {
    leer(&app)
}

#[tauri::command]
fn guardar_ajustes(app: AppHandle, nombre: String, hora: u32, minuto: u32, modo: String, dias_semana: Vec<u32>) {
    let primera_vez = leer(&app).is_none();
    let antes = leer(&app).unwrap_or_default();
    escribir(&app, &Ajustes {
        nombre: nombre.trim().chars().take(40).collect(),
        hora: hora.min(23),
        minuto: minuto.min(59),
        saltado: antes.saltado,
        modo: if modo == "ventana" { modo } else { completa() },
        desde: antes.desde.or_else(|| Some(clave(hoy()))),
        dias_semana: dias_semana.into_iter().filter(|d| *d < 7).collect(),
    });
    let _ = app.autolaunch().enable();
    if let Some(v) = app.get_webview_window("ajustes") {
        let _ = v.destroy();
    }
    if primera_vez {
        abrir_racha(&app); // para que se vea que ya está en marcha
    }
}

// ---------- Arranque ----------

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Si la abren otra vez estando ya en marcha, enseña la racha.
            abrir_principal(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![ARG_AUTO])))
        .invoke_handler(tauri::generate_handler![
            estado, marcar, hoy_no, cerrar_check, leer_ajustes, guardar_ajustes, guardar_imagen, copiar_imagen, abrir_ajustes_cmd
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory); // sin icono en el Dock

            let h = app.handle().clone();
            let ver = MenuItem::with_id(app, "racha", "Ver mi racha", true, None::<&str>)?;
            let levantado = MenuItem::with_id(app, "levantado", "Ya me he levantado", true, None::<&str>)?;
            let probar = MenuItem::with_id(app, "probar", "Probar ahora (no cuenta)", true, None::<&str>)?;
            let ajustes = MenuItem::with_id(app, "ajustes", "Ajustes…", true, None::<&str>)?;
            let salir = MenuItem::with_id(app, "salir", "Desactivar y salir", true, None::<&str>)?;
            let sep = || PredefinedMenuItem::separator(app);
            let menu = Menu::with_items(app, &[&ver, &levantado, &sep()?, &probar, &ajustes, &sep()?, &salir])?;
            // Pone "Ya me he levantado" o "Hoy ya está hecho" según el día.
            let refrescar = {
                let item = levantado.clone();
                move |app: &AppHandle| {
                    let hecho = marcado_hoy(app);
                    let _ = item.set_text(if hecho { "Hoy ya está hecho ✓" } else { "Ya me he levantado" });
                    let _ = item.set_enabled(!hecho);
                }
            };
            refrescar(&h);
            let refrescar_menu = refrescar.clone();
            TrayIconBuilder::with_id("bandeja")
                .icon(tauri::image::Image::from_bytes(include_bytes!("../icons/bandeja.png"))?)
                .tooltip("alba")
                .menu(&menu)
                .on_menu_event(move |app, e| match e.id.as_ref() {
                    // Para quien se levanta antes de la hora: deja el día hecho y no sale.
                    "levantado" => {
                        marcar(app.clone());
                        cerrar_check(app.clone());
                        refrescar_menu(app);
                    }
                    "racha" => abrir_racha(app),
                    "probar" => abrir_check(app, true),
                    "ajustes" => abrir_ajustes(app),
                    "salir" => {
                        // Deja de abrirse al iniciar sesión. Si la vuelves a abrir, se reactiva.
                        let _ = app.autolaunch().disable();
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            let al_iniciar = std::env::args().any(|a| a == ARG_AUTO);
            if leer(&h).is_none() {
                abrir_ajustes(&h); // primer arranque: pide nombre y hora
            } else {
                let _ = h.autolaunch().enable();
                if !al_iniciar && !toca(&h) {
                    abrir_racha(&h); // abierta a mano: enseña la racha
                }
            }

            // Cada 20 s mira si toca. Así también sale al despertar el ordenador.
            std::thread::spawn(move || loop {
                let h2 = h.clone();
                let r = refrescar.clone();
                let _ = h.run_on_main_thread(move || {
                    r(&h2);
                    if h2.get_webview_window("check").is_none() && toca(&h2) {
                        abrir_check(&h2, false);
                    }
                });
                std::thread::sleep(std::time::Duration::from_secs(20));
            });
            Ok(())
        })
        .on_window_event(|w, e| {
            // La pantalla del check no se cierra con Alt+F4 ni Cmd+W: solo marcando o con "Hoy no".
            if let WindowEvent::CloseRequested { api, .. } = e {
                if w.label() == "check" {
                    api.prevent_close();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("no se pudo arrancar")
        .run(|_app, e| {
            // Cerrar todas las ventanas no cierra la app: sigue esperando a mañana.
            if let tauri::RunEvent::ExitRequested { api, code, .. } = e {
                if code.is_none() {
                    api.prevent_exit();
                }
            }
        });
}
