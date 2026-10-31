/* LocalDock — Android companion launcher v2.
 *
 * Architecture:
 *   Three full-screen views: Discover → Pair (2-step wizard) → Connecting.
 *   The 6-box code input is handled entirely in JS (no native keyboard
 *   dependencies). Pairing navigates the webview to /?pair=CODE, which
 *   is the product's own pairing flow — it stores the device token and
 *   the Launcher never needs to handle it.
 *
 * Tauri commands:
 *   discover_hosts({ timeoutMs }) → { subnet, scanned, hosts: [...] }
 *   probe_host({ baseUrl })       → { reachable, name, serverId, version }
 */
"use strict";

/* ─────────────────────────── i18n ──────────────────────────────────── */

const LANG_META = [
  ["en", "English"],
  ["ar", "العربية"],
  ["es", "Español"],
  ["fr", "Français"],
  ["de", "Deutsch"],
  ["pt", "Português"],
  ["ru", "Русский"],
  ["zh", "简体中文"],
  ["hi", "हिन्दी"],
  ["ja", "日本語"],
];

const I18N = {
  en: {
    tagline: "Your personal local cloud",
    discoveryTitle: "Servers on this network",
    looking: "Looking for LocalDock servers…",
    lookingHint: "Make sure LocalDock is running on your computer and connected to the same Wi-Fi.",
    rescan: "Rescan",
    online: "Online",
    offline: "No response",
    open: "Open",
    pairCard: "Pair",
    pairCta: "＋  Pair a new server",
    forget: "Forget",
    saved: "Saved",
    sourceMdns: "mDNS",
    sourceScan: "Scan",
    noneFound: "No servers found yet",
    noneFoundHint: "Check that LocalDock runs on the computer on the same network.",
    stepServer: "Server",
    stepCode: "Code",
    chooseServerTitle: "Choose a server",
    chooseServerHint: "Select the LocalDock server you want to pair with, or enter its address manually.",
    manualTitle: "Enter address manually",
    manualHint: "e.g. 192.168.1.3:3000",
    next: "Next →",
    enterCodeTitle: "Enter pairing code",
    pairHint: "On the computer: Devices → Add device → copy the 6-character code.",
    pairGo: "Pair & Open",
    errBadCode: "Enter the 6-character code shown on the computer.",
    errNoServer: "Select or enter a server first.",
    errProbe: "Server didn't respond. Check it is reachable on your network.",
    connecting: "Connecting…",
    connectingHint: "Opening the server and completing pairing.",
    cancel: "Cancel",
    browserNotice: "Opened outside the LocalDock app — discovery unavailable. Use manual address.",
    footerHint: "Works only on your local network — nothing ever leaves it.",
    footerCompanion: "Companion app",
    emptyServersHint: "Scan found no servers. Add one manually below.",
    scanQrBtn: "Scan QR code",
    qrTitle: "Scan QR code",
    qrHint: "Point your camera at the QR code shown on your computer screen to pair instantly.",
    qrPickImage: "Scan from image",
    qrCameraError: "Unable to access camera. Check permissions or pick an image.",
    qrFound: "Pairing QR recognized!",
  },
  ar: {
    tagline: "سحابتك المحلية الخاصة",
    discoveryTitle: "الخوادم على هذه الشبكة",
    looking: "أبحث عن خوادم LocalDock…",
    lookingHint: "تأكد من تشغيل LocalDock على حاسوبك ومن اتصاله بنفس شبكة Wi-Fi.",
    rescan: "إعادة البحث",
    online: "متصل",
    offline: "لا يستجيب",
    open: "فتح",
    pairCard: "اقتران",
    pairCta: "＋  اقتران بخادم جديد",
    forget: "نسيان",
    saved: "محفوظ",
    sourceMdns: "mDNS",
    sourceScan: "مسح الشبكة",
    noneFound: "لا خوادم حتى الآن",
    noneFoundHint: "تحقق من تشغيل LocalDock على الحاسوب وعلى نفس الشبكة.",
    stepServer: "الخادم",
    stepCode: "الرمز",
    chooseServerTitle: "اختر خادماً",
    chooseServerHint: "اختر خادم LocalDock الذي تريد الاقتران به، أو أدخل عنوانه يدوياً.",
    manualTitle: "إدخال العنوان يدوياً",
    manualHint: "مثال: 192.168.1.3:3000",
    next: "التالي ←",
    enterCodeTitle: "أدخل رمز الاقتران",
    pairHint: "على الحاسوب: الأجهزة ← إضافة جهاز ← انسخ الرمز المكوّن من 6 أحرف.",
    pairGo: "اقتران وفتح",
    errBadCode: "أدخل الرمز المكوّن من 6 أحرف المعروض على الحاسوب.",
    errNoServer: "اختر خادماً أو أدخله أولاً.",
    errProbe: "الخادم لم يستجب. تحقق من إمكانية الوصول إليه على شبكتك.",
    connecting: "جارٍ الاتصال…",
    connectingHint: "فتح الخادم وإتمام الاقتران.",
    cancel: "إلغاء",
    browserNotice: "فُتح التطبيق خارج بيئة LocalDock — الاكتشاف غير متاح. استخدم العنوان اليدوي.",
    footerHint: "يعمل على شبكتك المحلية فقط — لا شيء يخرج منها أبداً.",
    footerCompanion: "التطبيق المرافق",
    emptyServersHint: "لم يعثر المسح على خوادم. أضف واحداً يدوياً بالأسفل.",
    scanQrBtn: "مسح رمز QR",
    qrTitle: "مسح رمز QR للإقران",
    qrHint: "وجّه الكاميرا نحو رمز QR الظاهر على شاشة الحاسوب للإقران فوراً.",
    qrPickImage: "مسح من صورة",
    qrCameraError: "تعذر تشغيل الكاميرا. تحقق من الصلاحيات أو اختر صورة.",
    qrFound: "تم التعرف على رمز الاقتران!",
  },
  es: {
    tagline: "Tu nube local personal",
    discoveryTitle: "Servidores en esta red",
    looking: "Buscando servidores de LocalDock…",
    lookingHint: "Asegúrate de que LocalDock esté en ejecución en tu ordenador y conectado a la misma Wi-Fi.",
    rescan: "Volver a buscar",
    online: "En línea",
    offline: "Sin respuesta",
    open: "Abrir",
    pairCta: "＋  Vincular nuevo servidor",
    forget: "Olvidar",
    saved: "Guardado",
    sourceMdns: "mDNS",
    sourceScan: "Escaneo",
    noneFound: "Aún no hay servidores",
    noneFoundHint: "Comprueba que LocalDock se ejecute en el ordenador y en la misma red.",
    stepServer: "Servidor",
    stepCode: "Código",
    chooseServerTitle: "Elige un servidor",
    chooseServerHint: "Selecciona el servidor LocalDock con el que quieres vincularte, o introduce su dirección manualmente.",
    manualTitle: "Introducir dirección manual",
    manualHint: "Ej: 192.168.1.3:3000",
    next: "Siguiente →",
    enterCodeTitle: "Introduce el código de vinculación",
    pairHint: "En el ordenador: Dispositivos → Añadir dispositivo → copia el código de 6 caracteres.",
    pairGo: "Vincular y abrir",
    errBadCode: "Introduce el código de 6 caracteres que muestra el ordenador.",
    errNoServer: "Elige o introduce un servidor primero.",
    errProbe: "El servidor no respondió. Comprueba que es accesible en tu red.",
    connecting: "Conectando…",
    connectingHint: "Abriendo el servidor y completando la vinculación.",
    cancel: "Cancelar",
    browserNotice: "Abierto fuera de la app LocalDock; el descubrimiento no está disponible. Usa la dirección manual.",
    footerHint: "Funciona solo en tu red local — nada sale de ella.",
    footerCompanion: "Aplicación complementaria",
    emptyServersHint: "El escaneo no encontró servidores. Añade uno manualmente abajo.",
  },
  fr: {
    tagline: "Votre cloud local personnel",
    discoveryTitle: "Serveurs sur ce réseau",
    looking: "Recherche de serveurs LocalDock…",
    lookingHint: "Assurez-vous que LocalDock tourne sur l'ordinateur et qu'il est connecté au même Wi-Fi.",
    rescan: "Relancer la recherche",
    online: "En ligne",
    offline: "Injoignable",
    open: "Ouvrir",
    pairCta: "＋  Associer un nouveau serveur",
    forget: "Oublier",
    saved: "Enregistré",
    sourceMdns: "mDNS",
    sourceScan: "Analyse",
    noneFound: "Aucun serveur pour l'instant",
    noneFoundHint: "Vérifiez que LocalDock tourne sur l'ordinateur et sur le même réseau.",
    stepServer: "Serveur",
    stepCode: "Code",
    chooseServerTitle: "Choisissez un serveur",
    chooseServerHint: "Sélectionnez le serveur LocalDock avec lequel vous souhaitez vous associer, ou saisissez son adresse manuellement.",
    manualTitle: "Saisir l'adresse manuellement",
    manualHint: "Ex : 192.168.1.3:3000",
    next: "Suivant →",
    enterCodeTitle: "Saisissez le code d'association",
    pairHint: "Sur l'ordinateur : Appareils → Ajouter un appareil → copiez le code à 6 caractères.",
    pairGo: "Associer et ouvrir",
    errBadCode: "Saisissez le code à 6 caractères affiché sur l'ordinateur.",
    errNoServer: "Choisissez ou saisissez d'abord un serveur.",
    errProbe: "Le serveur n'a pas répondu. Vérifiez qu'il est accessible sur votre réseau.",
    connecting: "Connexion…",
    connectingHint: "Ouverture du serveur et finalisation de l'association.",
    cancel: "Annuler",
    browserNotice: "Ouvert hors de l'application LocalDock ; la découverte n'est pas disponible. Utilisez l'adresse manuelle.",
    footerHint: "Fonctionne uniquement sur votre réseau local — rien n'en sort jamais.",
    footerCompanion: "Application compagne",
    emptyServersHint: "L'analyse n'a trouvé aucun serveur. Ajoutez-en un manuellement ci-dessous.",
  },
  de: {
    tagline: "Deine persönliche lokale Cloud",
    discoveryTitle: "Server in diesem Netzwerk",
    looking: "Suche nach LocalDock-Servern…",
    lookingHint: "Stelle sicher, dass LocalDock auf dem Computer läuft und im selben WLAN angemeldet ist.",
    rescan: "Erneut suchen",
    online: "Online",
    offline: "Keine Antwort",
    open: "Öffnen",
    pairCta: "＋  Neuen Server koppeln",
    forget: "Vergessen",
    saved: "Gespeichert",
    sourceMdns: "mDNS",
    sourceScan: "Scan",
    noneFound: "Noch keine Server gefunden",
    noneFoundHint: "Prüfe, ob LocalDock auf dem Computer im selben Netzwerk läuft.",
    stepServer: "Server",
    stepCode: "Code",
    chooseServerTitle: "Server auswählen",
    chooseServerHint: "Wähle den LocalDock-Server, mit dem du koppeln möchtest, oder gib seine Adresse manuell ein.",
    manualTitle: "Adresse manuell eingeben",
    manualHint: "z. B. 192.168.1.3:3000",
    next: "Weiter →",
    enterCodeTitle: "Kopplungscode eingeben",
    pairHint: "Am Computer: Geräte → Gerät hinzufügen → 6-stelligen Code kopieren.",
    pairGo: "Koppeln und öffnen",
    errBadCode: "Gib den 6-stelligen Code ein, der am Computer angezeigt wird.",
    errNoServer: "Wähle oder gib zuerst einen Server ein.",
    errProbe: "Der Server hat nicht geantwortet. Prüfe die Erreichbarkeit im Netzwerk.",
    connecting: "Verbinde…",
    connectingHint: "Server öffnen und Kopplung abschließen.",
    cancel: "Abbrechen",
    browserNotice: "Außerhalb der LocalDock-App geöffnet; Suche nicht verfügbar. Nutze die manuelle Adresse.",
    footerHint: "Funktioniert nur in deinem lokalen Netzwerk — nichts verlässt es.",
    footerCompanion: "Begleit-App",
    emptyServersHint: "Der Scan hat keine Server gefunden. Füge einen manuell unten hinzu.",
  },
  pt: {
    tagline: "Sua nuvem local pessoal",
    discoveryTitle: "Servidores nesta rede",
    looking: "Procurando servidores do LocalDock…",
    lookingHint: "Verifique se o LocalDock está em execução no computador e conectado ao mesmo Wi-Fi.",
    rescan: "Buscar de novo",
    online: "On-line",
    offline: "Sem resposta",
    open: "Abrir",
    pairCta: "＋  Parear novo servidor",
    forget: "Esquecer",
    saved: "Salvo",
    sourceMdns: "mDNS",
    sourceScan: "Varredura",
    noneFound: "Nenhum servidor por enquanto",
    noneFoundHint: "Confira se o LocalDock está em execução no computador e na mesma rede.",
    stepServer: "Servidor",
    stepCode: "Código",
    chooseServerTitle: "Escolha um servidor",
    chooseServerHint: "Selecione o servidor LocalDock com o qual deseja parear, ou insira o endereço manualmente.",
    manualTitle: "Inserir endereço manualmente",
    manualHint: "Ex.: 192.168.1.3:3000",
    next: "Próximo →",
    enterCodeTitle: "Digite o código de pareamento",
    pairHint: "No computador: Dispositivos → Adicionar dispositivo → copie o código de 6 caracteres.",
    pairGo: "Parear e abrir",
    errBadCode: "Digite o código de 6 caracteres mostrado no computador.",
    errNoServer: "Escolha ou insira um servidor primeiro.",
    errProbe: "O servidor não respondeu. Verifique se é acessível na sua rede.",
    connecting: "Conectando…",
    connectingHint: "Abrindo o servidor e concluindo o pareamento.",
    cancel: "Cancelar",
    browserNotice: "Aberto fora do app LocalDock; a descoberta não está disponível. Use o endereço manual.",
    footerHint: "Funciona apenas na sua rede local — nada sai dela.",
    footerCompanion: "Aplicativo complementar",
    emptyServersHint: "A varredura não encontrou servidores. Adicione um manualmente abaixo.",
  },
  ru: {
    tagline: "Ваше личное локальное облако",
    discoveryTitle: "Серверы в этой сети",
    looking: "Поиск серверов LocalDock…",
    lookingHint: "Убедитесь, что LocalDock запущен на компьютере и подключён к той же сети Wi-Fi.",
    rescan: "Искать снова",
    online: "В сети",
    offline: "Нет ответа",
    open: "Открыть",
    pairCta: "＋  Связать новый сервер",
    forget: "Забыть",
    saved: "Сохранено",
    sourceMdns: "mDNS",
    sourceScan: "Сканирование",
    noneFound: "Пока серверов нет",
    noneFoundHint: "Проверьте, что LocalDock запущен на компьютере в той же сети.",
    stepServer: "Сервер",
    stepCode: "Код",
    chooseServerTitle: "Выберите сервер",
    chooseServerHint: "Выберите сервер LocalDock для сопряжения или введите адрес вручную.",
    manualTitle: "Ввести адрес вручную",
    manualHint: "Например: 192.168.1.3:3000",
    next: "Далее →",
    enterCodeTitle: "Введите код сопряжения",
    pairHint: "На компьютере: Устройства → Добавить устройство → скопируйте 6-символьный код.",
    pairGo: "Связать и открыть",
    errBadCode: "Введите 6-символьный код, показанный на компьютере.",
    errNoServer: "Сначала выберите или введите сервер.",
    errProbe: "Сервер не ответил. Проверьте доступность в сети.",
    connecting: "Подключение…",
    connectingHint: "Открываем сервер и завершаем сопряжение.",
    cancel: "Отмена",
    browserNotice: "Открыто вне приложения LocalDock; обнаружение недоступно. Используйте ручной адрес.",
    footerHint: "Работает только в вашей локальной сети — ничего не выходит за её пределы.",
    footerCompanion: "Сопутствующее приложение",
    emptyServersHint: "Сканирование не нашло серверов. Добавьте один вручную ниже.",
  },
  zh: {
    tagline: "你的专属本地云",
    discoveryTitle: "此网络中的服务器",
    looking: "正在查找 LocalDock 服务器…",
    lookingHint: "请确保电脑正在运行 LocalDock，并且连接到同一个 Wi-Fi。",
    rescan: "重新扫描",
    online: "在线",
    offline: "无响应",
    open: "打开",
    pairCta: "＋  配对新服务器",
    forget: "忽略",
    saved: "已保存",
    sourceMdns: "mDNS",
    sourceScan: "扫描",
    noneFound: "暂未发现服务器",
    noneFoundHint: "请确认电脑上的 LocalDock 正在运行并处于同一网络。",
    stepServer: "服务器",
    stepCode: "配对码",
    chooseServerTitle: "选择服务器",
    chooseServerHint: "选择要配对的 LocalDock 服务器，或手动输入其地址。",
    manualTitle: "手动输入地址",
    manualHint: "如：192.168.1.3:3000",
    next: "下一步 →",
    enterCodeTitle: "输入配对码",
    pairHint: "在电脑上：设备 → 添加设备 → 复制 6 位配对码。",
    pairGo: "配对并打开",
    errBadCode: "请输入电脑上显示的 6 位配对码。",
    errNoServer: "请先选择或输入服务器。",
    errProbe: "服务器没有响应。请检查网络连接。",
    connecting: "正在连接…",
    connectingHint: "打开服务器并完成配对。",
    cancel: "取消",
    browserNotice: "在 LocalDock 应用外部打开，无法自动发现。请使用手动地址。",
    footerHint: "仅在本地网络内工作——数据绝不离开你的网络。",
    footerCompanion: "伴侣应用",
    emptyServersHint: "扫描未发现服务器。请在下方手动添加。",
  },
  hi: {
    tagline: "आपका निजी लोकल क्लाउड",
    discoveryTitle: "इस नेटवर्क पर सर्वर",
    looking: "LocalDock सर्वर खोजे जा रहे हैं…",
    lookingHint: "सुनिश्चित करें कि आपके कंप्यूटर पर LocalDock चल रहा है और वह उसी Wi-Fi से जुड़ा है।",
    rescan: "फिर खोजें",
    online: "ऑनलाइन",
    offline: "कोई जवाब नहीं",
    open: "खोलें",
    pairCta: "＋  नया सर्वर जोड़ें",
    forget: "भूलें",
    saved: "सहेजा गया",
    sourceMdns: "mDNS",
    sourceScan: "स्कैन",
    noneFound: "अभी कोई सर्वर नहीं मिला",
    noneFoundHint: "जाँचें कि कंप्यूटर पर LocalDock चल रहा है और वही नेटवर्क है।",
    stepServer: "सर्वर",
    stepCode: "कोड",
    chooseServerTitle: "सर्वर चुनें",
    chooseServerHint: "वह LocalDock सर्वर चुनें जिससे आप जोड़ना चाहते हैं, या पता मैन्युअल रूप से दर्ज करें।",
    manualTitle: "पता मैन्युअल रूप से दर्ज करें",
    manualHint: "जैसे: 192.168.1.3:3000",
    next: "अगला →",
    enterCodeTitle: "पेयरिंग कोड दर्ज करें",
    pairHint: "कंप्यूटर पर: डिवाइस → डिवाइस जोड़ें → 6 अक्षरों का कोड कॉपी करें।",
    pairGo: "जोड़ें और खोलें",
    errBadCode: "कंप्यूटर पर दिखाया गया 6 अक्षरों का कोड दर्ज करें।",
    errNoServer: "पहले कोई सर्वर चुनें या दर्ज करें।",
    errProbe: "सर्वर ने जवाब नहीं दिया। नेटवर्क कनेक्शन जाँचें।",
    connecting: "कनेक्ट हो रहा है…",
    connectingHint: "सर्वर खोल रहे हैं और पेयरिंग पूरी कर रहे हैं।",
    cancel: "रद्द करें",
    browserNotice: "LocalDock ऐप के बाहर खोला गया; खोज उपलब्ध नहीं है। मैन्युअल पता उपयोग करें।",
    footerHint: "केवल आपके लोकल नेटवर्क पर काम करता है — कुछ भी बाहर नहीं जाता।",
    footerCompanion: "साथी ऐप",
    emptyServersHint: "स्कैन में कोई सर्वर नहीं मिला। नीचे मैन्युअल रूप से एक जोड़ें।",
  },
  ja: {
    tagline: "あなた専用のローカルクラウド",
    discoveryTitle: "このネットワーク上のサーバー",
    looking: "LocalDock サーバーを探しています…",
    lookingHint: "パソコンで LocalDock が起動し、同じ Wi-Fi に接続していることを確認してください。",
    rescan: "再スキャン",
    online: "オンライン",
    offline: "応答なし",
    open: "開く",
    pairCta: "＋  新しいサーバーをペアリング",
    forget: "削除",
    saved: "保存済み",
    sourceMdns: "mDNS",
    sourceScan: "スキャン",
    noneFound: "サーバーはまだ見つかりません",
    noneFoundHint: "パソコンで LocalDock が同じネットワークで動作しているか確認してください。",
    stepServer: "サーバー",
    stepCode: "コード",
    chooseServerTitle: "サーバーを選択",
    chooseServerHint: "ペアリングする LocalDock サーバーを選択するか、アドレスを手動で入力してください。",
    manualTitle: "アドレスを手動入力",
    manualHint: "例：192.168.1.3:3000",
    next: "次へ →",
    enterCodeTitle: "ペアリングコードを入力",
    pairHint: "パソコン側：デバイス → デバイスを追加 → 6 文字のコードをコピー。",
    pairGo: "ペアリングして開く",
    errBadCode: "パソコンに表示された 6 文字のコードを入力してください。",
    errNoServer: "先にサーバーを選択または入力してください。",
    errProbe: "サーバーが応答しません。ネットワーク接続を確認してください。",
    connecting: "接続中…",
    connectingHint: "サーバーを開いてペアリングを完了しています。",
    cancel: "キャンセル",
    browserNotice: "LocalDock アプリの外で開かれたため、検出は利用できません。手動アドレスをご利用ください。",
    footerHint: "ローカルネットワーク内でのみ動作します — データは外に出ません。",
    footerCompanion: "コンパニオンアプリ",
    emptyServersHint: "スキャンでサーバーが見つかりませんでした。下から手動で追加してください。",
  },
};

/* ─────────────────────────── helpers ───────────────────────────────── */

const $ = (sel) => document.querySelector(sel);

const LANG_KEY  = "localdock.launcher.lang";
const HOSTS_KEY = "localdock.launcher.hosts";
const CODE_RE   = /^[A-HJ-NP-Z2-9]{6}$/i;

function store(key, fallback) {
  try { return window.localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function saveStore(key, val) {
  try { window.localStorage.setItem(key, val); } catch { /* private */ }
}

function loadHosts() {
  try { return JSON.parse(store(HOSTS_KEY, "[]")) ?? []; } catch { return []; }
}
function saveHosts(list) { saveStore(HOSTS_KEY, JSON.stringify(list)); }

function saveHost(url, name) {
  const list = loadHosts().filter((h) => h.url !== url);
  list.unshift({ url, name: name || "LocalDock" });
  saveStore(HOSTS_KEY, JSON.stringify(list.slice(0, 8)));
}

function forgetHost(url) {
  saveStore(HOSTS_KEY, JSON.stringify(loadHosts().filter((h) => h.url !== url)));
}

function t(key) { return I18N[lang]?.[key] ?? I18N.en[key] ?? key; }

function getInvokeFn() {
  return (
    window.__TAURI__?.core?.invoke ??
    window.__TAURI_INTERNALS__?.invoke ??
    window.__TAURI?.core?.invoke ??
    null
  );
}

async function invoke(cmd, args) {
  let fn = getInvokeFn();
  if (!fn) {
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 100));
      fn = getInvokeFn();
      if (fn) break;
    }
  }
  if (typeof fn !== "function") return Promise.reject(new Error("no-tauri"));
  return fn(cmd, args);
}

let toastTimer = null;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 3200);
}

function normalizeHost(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : `http://${s}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname || u.protocol !== "http:") return null;
    const port = u.port || "3000";
    return { url: `http://${u.hostname}:${port}`, name: u.hostname };
  } catch { return null; }
}

/* ─────────────────────────── state ─────────────────────────────────── */

let lang = "en";
let noticeShown = false;

/** url → { url, name, version?, source, state: online|offline|unknown } */
const hostMap = new Map();
let scanning  = false;

/** Selected server for pairing (step 1 → step 2) */
let pairTarget = null;   // { url, name }

/* ─────────────────────────── i18n apply ────────────────────────────── */

function detectLang() {
  const saved = store(LANG_KEY, "");
  if (saved && I18N[saved]) return saved;
  const candidates = navigator.languages ?? [navigator.language];
  for (const c of candidates) {
    const base = String(c || "").toLowerCase().split("-")[0];
    if (I18N[base]) return base;
  }
  return "en";
}

function applyLang() {
  document.documentElement.lang = lang;
  document.documentElement.dir  = lang === "ar" ? "rtl" : "ltr";
  document.querySelectorAll("[data-i]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i"));
  });
  const notice = $("#notice");
  notice.textContent = noticeShown ? t("browserNotice") : "";
  notice.classList.toggle("hidden", !noticeShown);
  buildLangSelect();
  renderHosts();
}

function buildLangSelect() {
  const sel = $("#lang");
  sel.innerHTML = "";
  for (const [code, label] of LANG_META) {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = label;
    sel.appendChild(opt);
  }
  sel.value = lang;
}

/* ─────────────────────────── views ─────────────────────────────────── */

function showView(id) {
  ["view-discover", "view-pair", "view-connecting"].forEach((v) => {
    const el = $(`#${v}`);
    el.classList.toggle("active", v === id);
    el.classList.toggle("hidden", v !== id);
  });
}

/* ─────────────────────────── discover view ─────────────────────────── */

function chipLabel(source) {
  if (source === "mdns")         return t("sourceMdns");
  if (source === "network-scan") return t("sourceScan");
  return t("saved");
}

function renderHosts() {
  const wrap  = $("#hosts");
  const hosts = [...hostMap.values()];
  wrap.classList.toggle("hidden", hosts.length === 0 && !scanning);

  if (!scanning && hosts.length === 0) {
    wrap.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "card";
    empty.innerHTML = `<h3></h3><p class="muted"></p>`;
    empty.querySelector("h3").textContent = t("noneFound");
    empty.querySelector("p").textContent  = t("noneFoundHint");
    wrap.appendChild(empty);
    return;
  }
  if (hosts.length === 0) return;

  wrap.innerHTML = "";
  for (const host of hosts) {
    const card = document.createElement("article");
    card.className = "card host";

    const head = document.createElement("div");
    head.className = "host-head";

    const title = document.createElement("div");
    title.className = "host-title";

    const name = document.createElement("span");
    name.className   = "host-name";
    name.textContent = host.name || "LocalDock";

    const src = document.createElement("span");
    src.className   = "chip";
    src.textContent = chipLabel(host.source);
    title.append(name, src);

    if (host.version) {
      const ver = document.createElement("span");
      ver.className   = "chip";
      ver.textContent = `v${host.version}`;
      title.append(ver);
    }

    const state = document.createElement("span");
    state.className = `chip state ${host.state === "online" ? "online" : host.state === "offline" ? "offline" : ""}`;
    state.textContent = host.state === "online" ? t("online") : host.state === "offline" ? t("offline") : "…";
    head.append(title, state);
    card.appendChild(head);

    const urlEl = document.createElement("p");
    urlEl.className   = "url";
    urlEl.textContent = host.url;
    card.appendChild(urlEl);

    const actions = document.createElement("div");
    actions.className = "host-actions";

    const openBtn = document.createElement("button");
    openBtn.className   = "btn primary";
    openBtn.type        = "button";
    openBtn.textContent = t("open");
    openBtn.addEventListener("click", () => {
      saveHost(host.url, host.name);
      navigateTo(host.url, null);
    });

    const pairBtn = document.createElement("button");
    pairBtn.className   = "btn ghost";
    pairBtn.type        = "button";
    pairBtn.textContent = t("pairCard");
    pairBtn.addEventListener("click", () => {
      openPairView(host);
    });

    const spacer = document.createElement("span");
    spacer.className = "spacer";

    const forgetBtn = document.createElement("button");
    forgetBtn.className   = "btn icon";
    forgetBtn.type        = "button";
    forgetBtn.title       = t("forget");
    forgetBtn.textContent = "✕";
    forgetBtn.addEventListener("click", () => {
      forgetHost(host.url);
      hostMap.delete(host.url);
      renderHosts();
      buildStep1ServerList();
    });

    actions.append(openBtn, pairBtn, spacer, forgetBtn);
    card.appendChild(actions);
    wrap.appendChild(card);
  }
}

/* ─────────────────────────── scanning ──────────────────────────────── */

function setScanning(active) {
  scanning = active;
  document.body.classList.toggle("scanning", active);
  $("#radar").classList.toggle("hidden", !active);
  $("#rescan").disabled = active;
  $("#scanHint").textContent = t("looking");
  if (active) renderHosts();
}

async function scan() {
  if (scanning) return;
  setScanning(true);
  hostMap.clear();
  for (const saved of loadHosts()) {
    hostMap.set(saved.url, { ...saved, source: "saved", state: "unknown" });
  }
  renderHosts();

  let discovered = [];
  try {
    const result = await invoke("discover_hosts", { timeoutMs: 4500 });
    noticeShown = false;
    $("#notice").classList.add("hidden");
    discovered = (result?.hosts ?? []).map((h) => ({
      url: h.baseUrl, name: h.name, version: h.version,
      source: h.source, state: "online",
    }));
  } catch (err) {
    if (String(err).includes("no-tauri")) {
      noticeShown = true;
      const notice = $("#notice");
      notice.textContent = t("browserNotice");
      notice.classList.remove("hidden");
    }
  }

  for (const host of discovered) {
    hostMap.set(host.url, host);
  }

  // Refresh saved hosts not found by discovery.
  const savedOnly = loadHosts().filter((h) => !hostMap.has(h.url));
  await Promise.allSettled(
    savedOnly.map(async (saved) => {
      try {
        const probe = await invoke("probe_host", { baseUrl: saved.url });
        const state = probe?.reachable ? "online" : "offline";
        hostMap.set(saved.url, {
          ...saved,
          name: probe?.name || saved.name,
          version: probe?.version,
          source: "saved",
          state,
        });
      } catch { /* outside app — leave unknown */ }
    })
  );

  setScanning(false);
  renderHosts();
  buildStep1ServerList();
}

/* ─────────────────────────── navigation ────────────────────────────── */

let connectCancelled = false;

function navigateTo(baseUrl, pairCode) {
  connectCancelled = false;
  showView("view-connecting");
  const url = pairCode
    ? `${baseUrl.replace(/\/$/, "")}/?pair=${encodeURIComponent(pairCode)}`
    : `${baseUrl.replace(/\/$/, "")}/`;

  // Small delay so the connecting animation is visible.
  setTimeout(async () => {
    if (!connectCancelled) {
      try {
        await invoke("navigate_to", { url });
      } catch {
        window.location.href = url;
      }
    }
  }, 400);
}

/* ─────────────────────────── pair view ─────────────────────────────── */

/** Open the pair wizard, optionally pre-selecting a host. */
function openPairView(preselect) {
  pairTarget = null;
  buildStep1ServerList(preselect);
  goStep(1);
  showView("view-pair");
}

function goStep(n) {
  const s1 = $("#step1");
  const s2 = $("#step2");
  const d1 = $("#step-dot-1");
  const d2 = $("#step-dot-2");
  const line = document.querySelector(".step-line");

  if (n === 1) {
    s1.classList.remove("hidden");
    s2.classList.add("hidden");
    d1.classList.add("active");
    d1.classList.remove("done");
    d2.classList.remove("active", "done");
    line.classList.remove("done");
    clearCodeBoxes();
    $("#pairError").classList.add("hidden");
  } else {
    s1.classList.add("hidden");
    s2.classList.remove("hidden");
    d1.classList.remove("active");
    d1.classList.add("done");
    d2.classList.add("active");
    d2.classList.remove("done");
    line.classList.add("done");
    renderSelectedServerPreview();
    // Focus first code box.
    setTimeout(() => codeBoxes()[0]?.focus(), 100);
  }
}

/* ── Step 1: server list ── */

function buildStep1ServerList(preselect) {
  const list  = $("#pairServerList");
  const hosts = [...hostMap.values()];
  list.innerHTML = "";

  if (hosts.length === 0) {
    const empty = document.createElement("div");
    empty.className   = "empty-servers";
    empty.innerHTML   = `<div class="empty-icon">🔍</div><p></p>`;
    empty.querySelector("p").textContent = t("emptyServersHint");
    list.appendChild(empty);
    // Auto-show manual entry.
    showManualEntry(true);
  } else {
    hideManualEntry();
    for (const host of hosts) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "server-item";
      item.dataset.url = host.url;
      item.innerHTML = `
        <div class="server-item-icon">🖥</div>
        <div class="server-item-info">
          <div class="server-item-name"></div>
          <div class="server-item-url"></div>
        </div>
        <div class="server-item-badge">
          <span class="chip ${host.state === "online" ? "state online" : host.state === "offline" ? "state offline" : ""}"></span>
          <span class="server-check">✓</span>
        </div>
      `;
      item.querySelector(".server-item-name").textContent = host.name || "LocalDock";
      item.querySelector(".server-item-url").textContent  = host.url.replace("http://", "");
      const stateChip = item.querySelector(".chip");
      stateChip.textContent = host.state === "online" ? t("online") : host.state === "offline" ? t("offline") : "…";
      item.addEventListener("click", () => selectServerItem(host, item));

      if (preselect && preselect.url === host.url) {
        item.classList.add("selected");
        pairTarget = { url: host.url, name: host.name };
      }
      list.appendChild(item);
    }

    // Auto-select first online if nothing preselected.
    if (!pairTarget) {
      const first = list.querySelector(".server-item");
      if (first) {
        const firstHost = hosts[0];
        first.classList.add("selected");
        pairTarget = { url: firstHost.url, name: firstHost.name };
      }
    }
  }
}

function selectServerItem(host, itemEl) {
  document.querySelectorAll(".server-item").forEach((i) => i.classList.remove("selected"));
  itemEl.classList.add("selected");
  pairTarget = { url: host.url, name: host.name };
  hideManualEntry();
  $("#step1Next").disabled = false;
}

function showManualEntry(autoShow) {
  $("#manualEntry").classList.remove("hidden");
  const btn = $("#toggleManual");
  btn.querySelector(".toggle-icon").textContent = "－";
}

function hideManualEntry() {
  if (document.querySelectorAll(".server-item").length > 0) {
    $("#manualEntry").classList.add("hidden");
    $("#toggleManual").querySelector(".toggle-icon").textContent = "＋";
  }
}

/* ── Step 2: code boxes ── */

function codeBoxes() {
  return [...document.querySelectorAll(".code-box")];
}

function clearCodeBoxes() {
  codeBoxes().forEach((box) => {
    box.value = "";
    box.classList.remove("filled", "error-shake");
  });
}

function getCode() {
  return codeBoxes().map((b) => b.value.toUpperCase()).join("");
}

function renderSelectedServerPreview() {
  const preview = $("#selectedServerPreview");
  if (!pairTarget) { preview.innerHTML = ""; return; }
  preview.innerHTML = `
    <div class="selected-server-icon">🖥</div>
    <div class="selected-server-info">
      <div class="selected-server-name"></div>
      <div class="selected-server-url"></div>
    </div>
  `;
  preview.querySelector(".selected-server-name").textContent = pairTarget.name || "LocalDock";
  preview.querySelector(".selected-server-url").textContent  = pairTarget.url.replace("http://", "");
}

function wireCodeBoxes() {
  const boxes = codeBoxes();
  boxes.forEach((box, idx) => {
    box.addEventListener("input", (e) => {
      // Allow only alphanumeric.
      const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      e.target.value = val.slice(-1);
      e.target.classList.toggle("filled", e.target.value !== "");
      if (val && idx < boxes.length - 1) {
        boxes[idx + 1].focus();
      }
      $("#pairError").classList.add("hidden");
    });

    box.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !box.value && idx > 0) {
        boxes[idx - 1].focus();
        boxes[idx - 1].value = "";
        boxes[idx - 1].classList.remove("filled");
        e.preventDefault();
      }
      if (e.key === "ArrowLeft" && idx > 0) {
        boxes[idx - 1].focus();
        e.preventDefault();
      }
      if (e.key === "ArrowRight" && idx < boxes.length - 1) {
        boxes[idx + 1].focus();
        e.preventDefault();
      }
    });

    // Paste support.
    box.addEventListener("paste", (e) => {
      e.preventDefault();
      const paste = (e.clipboardData || window.clipboardData)
        .getData("text")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 6);
      paste.split("").forEach((ch, i) => {
        if (boxes[idx + i]) {
          boxes[idx + i].value = ch;
          boxes[idx + i].classList.add("filled");
        }
      });
      const next = idx + paste.length;
      if (next < boxes.length) boxes[next].focus();
      else boxes[boxes.length - 1].focus();
    });
  });
}

function shakeCodeBoxes() {
  codeBoxes().forEach((b) => {
    b.classList.remove("error-shake");
    void b.offsetWidth; // reflow
    b.classList.add("error-shake");
    setTimeout(() => b.classList.remove("error-shake"), 400);
  });
}

/* ─────────────────────────── wire events ───────────────────────────── */

function wire() {
  /* Language switcher */
  $("#lang").addEventListener("change", (e) => {
    lang = e.target.value;
    saveStore(LANG_KEY, lang);
    applyLang();
  });

  /* Discover view */
  $("#rescan").addEventListener("click", () => scan());

  $("#openPair").addEventListener("click", () => {
    openPairView(null);
  });

  /* Pair view — step 1 */
  $("#backToDiscover").addEventListener("click", () => {
    showView("view-discover");
  });

  $("#toggleManual").addEventListener("click", () => {
    const entry = $("#manualEntry");
    const isHidden = entry.classList.contains("hidden");
    entry.classList.toggle("hidden", !isHidden);
    $("#toggleManual").querySelector(".toggle-icon").textContent = isHidden ? "－" : "＋";
    if (isHidden) {
      $("#manualHost").focus();
      // Deselect server items when manual is open.
      document.querySelectorAll(".server-item").forEach((i) => i.classList.remove("selected"));
      pairTarget = null;
    }
  });

  $("#step1Next").addEventListener("click", async () => {
    // Check if manual entry is being used.
    const manualEntry = $("#manualEntry");
    const isManualVisible = !manualEntry.classList.contains("hidden");
    const manualVal = $("#manualHost").value.trim();

    if (isManualVisible && manualVal) {
      // Manual address mode.
      const normalized = normalizeHost(manualVal);
      if (!normalized) {
        $("#manualError").textContent = t("errProbe");
        $("#manualError").classList.remove("hidden");
        return;
      }
      $("#step1Next").disabled = true;
      $("#step1Next").textContent = "…";
      try {
        const probe = await invoke("probe_host", { baseUrl: normalized.url });
        if (probe?.reachable) {
          const name = probe.name || normalized.name;
          saveHost(normalized.url, name);
          hostMap.set(normalized.url, { url: normalized.url, name, source: "saved", state: "online" });
          pairTarget = { url: normalized.url, name };
          buildStep1ServerList(pairTarget);
          renderHosts();
        } else {
          pairTarget = { url: normalized.url, name: normalized.name };
        }
      } catch {
        // Outside Tauri — use as-is.
        pairTarget = { url: normalized.url, name: normalized.name };
      } finally {
        $("#step1Next").disabled = false;
        $("#step1Next").textContent = t("next");
      }
    }

    if (!pairTarget) {
      toast(t("errNoServer"));
      return;
    }
    goStep(2);
  });

  /* Pair view — step 2 */
  $("#backToStep1").addEventListener("click", () => {
    goStep(1);
  });

  wireCodeBoxes();

  $("#pairGo").addEventListener("click", () => {
    const code = getCode();
    if (!CODE_RE.test(code)) {
      shakeCodeBoxes();
      $("#pairError").textContent = t("errBadCode");
      $("#pairError").classList.remove("hidden");
      return;
    }
    if (!pairTarget) {
      toast(t("errNoServer"));
      goStep(1);
      return;
    }
    $("#pairError").classList.add("hidden");
    saveHost(pairTarget.url, pairTarget.name);
    navigateTo(pairTarget.url, code);
  });

  /* Connecting view */
  $("#cancelConnect").addEventListener("click", () => {
    connectCancelled = true;
    showView("view-discover");
  });

  /* QR Scanner wiring */
  $("#openQrScan")?.addEventListener("click", () => openQrScanner());
  $("#step2QrScan")?.addEventListener("click", () => openQrScanner());
  $("#closeQr")?.addEventListener("click", () => closeQrScanner());
  $("#qrBackdrop")?.addEventListener("click", () => closeQrScanner());
  $("#qrTorchBtn")?.addEventListener("click", () => toggleTorch());
  $("#qrFileInput")?.addEventListener("change", handleQrFileInput);

  /* Android back button handler */
  window.addEventListener("popstate", () => {
    const modal = $("#qrModal");
    if (modal && !modal.classList.contains("hidden")) {
      closeQrScanner(true);
      return;
    }
    const pairView = $("#view-pair");
    if (pairView && pairView.classList.contains("active")) {
      const step2 = $("#step2");
      if (step2 && !step2.classList.contains("hidden")) {
        goStep(1);
        return;
      }
      showView("view-discover");
      return;
    }
  });
}

/* ─────────────────────────── QR Scanner ────────────────────────────── */

let qrStream = null;
let qrScanActive = false;
let torchEnabled = false;

async function openQrScanner() {
  const modal = $("#qrModal");
  const errorEl = $("#qrError");
  const feedback = $("#qrFeedback");
  modal.classList.remove("hidden");
  errorEl.classList.add("hidden");
  feedback.classList.add("hidden");

  try {
    try { window.history.pushState({ modal: "qr" }, ""); } catch {}
    qrStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    const video = $("#qrVideo");
    video.srcObject = qrStream;
    await video.play();
    qrScanActive = true;
    requestAnimationFrame(scanQrTick);
  } catch (err) {
    errorEl.textContent = t("qrCameraError");
    errorEl.classList.remove("hidden");
  }
}

async function toggleTorch() {
  if (!qrStream) return;
  const track = qrStream.getVideoTracks()[0];
  if (!track) return;
  try {
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    if (!caps.torch) {
      toast("مصباح الفلاش غير مدعوم على هذه الكاميرا");
      return;
    }
    torchEnabled = !torchEnabled;
    await track.applyConstraints({
      advanced: [{ torch: torchEnabled }],
    });
    const btn = $("#qrTorchBtn");
    if (btn) btn.classList.toggle("active", torchEnabled);
  } catch {
    /* torch error */
  }
}

function closeQrScanner(fromPopstate = false) {
  qrScanActive = false;
  torchEnabled = false;
  const torchBtn = $("#qrTorchBtn");
  if (torchBtn) torchBtn.classList.remove("active");

  if (qrStream) {
    qrStream.getTracks().forEach((tr) => tr.stop());
    qrStream = null;
  }
  const video = $("#qrVideo");
  if (video) video.srcObject = null;
  $("#qrModal").classList.add("hidden");

  if (!fromPopstate) {
    try {
      if (window.history.state && window.history.state.modal === "qr") {
        window.history.back();
      }
    } catch {}
  }
}

function scanQrTick() {
  if (!qrScanActive) return;
  const video = $("#qrVideo");
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    const canvas = $("#qrCanvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    let decoded = null;
    if (typeof window.jsQR === "function") {
      decoded = window.jsQR(imgData.data, imgData.width, imgData.height, {
        inversionAttempts: "dontInvert",
      });
    }

    if (decoded && decoded.data) {
      onQrDecoded(decoded.data);
      return;
    }
  }
  requestAnimationFrame(scanQrTick);
}

function onQrDecoded(content) {
  qrScanActive = false;
  const feedback = $("#qrFeedback");
  feedback.textContent = "✓";
  feedback.classList.remove("hidden");

  setTimeout(() => {
    closeQrScanner();
    processQrContent(content);
  }, 350);
}

function processQrContent(raw) {
  const str = String(raw || "").trim();
  if (!str) return;

  // Pattern 1: URL with ?pair=CODE (standard LocalDock pairing QR)
  try {
    const urlObj = new URL(str);
    const code = urlObj.searchParams.get("pair");
    if (code) {
      const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
      saveHost(baseUrl, "LocalDock");
      toast(t("qrFound"));
      navigateTo(baseUrl, code);
      return;
    }
    // URL without pair code: select host and open Step 2
    const normalized = normalizeHost(urlObj.origin);
    if (normalized) {
      saveHost(normalized.url, normalized.name);
      openPairView(normalized);
      toast(t("qrFound"));
      return;
    }
  } catch {
    /* not a full URL */
  }

  // Pattern 2: standalone 6-character code
  if (CODE_RE.test(str)) {
    toast(t("qrFound"));
    openPairView(pairTarget);
    goStep(2);
    fillCodeBoxes(str);
    return;
  }

  toast(str.slice(0, 30));
}

function handleQrFileInput(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      const canvas = $("#qrCanvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let decoded = null;
      if (typeof window.jsQR === "function") {
        decoded = window.jsQR(imgData.data, imgData.width, imgData.height);
      }
      if (decoded && decoded.data) {
        onQrDecoded(decoded.data);
      } else {
        toast("لم يتم العثور على رمز QR في الصورة");
      }
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
  e.target.value = "";
}

/* ─────────────────────────── boot ──────────────────────────────────── */

lang = detectLang();
applyLang();
wire();
setTimeout(() => scan(), 150);
setTimeout(() => checkAppUpdates(), 1200);


/* ─────────────────────────── Auto-Updater ──────────────────────────── */

const CURRENT_APP_VERSION = "1.2.0";

async function checkAppUpdates() {
  try {
    const res = await fetch("https://api.github.com/repos/yalaahamdy/LocalDock/releases/latest", {
      headers: { Accept: "application/vnd.github.v3+json" }
    });
    if (!res.ok) return;
    const data = await res.json();
    const tagName = String(data.tag_name || "").replace(/^v/, "").trim();
    if (!tagName) return;

    const p1 = tagName.split(".").map(n => parseInt(n, 10) || 0);
    const p2 = CURRENT_APP_VERSION.split(".").map(n => parseInt(n, 10) || 0);
    let hasNew = false;
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
      if ((p1[i] || 0) > (p2[i] || 0)) { hasNew = true; break; }
      if ((p1[i] || 0) < (p2[i] || 0)) break;
    }

    if (hasNew) {
      const assets = Array.isArray(data.assets) ? data.assets : [];
      const apk = assets.find(a => String(a.name || "").toLowerCase().endsWith(".apk"));
      const banner = $("#updateBanner");
      if (banner && apk) {
        banner.innerHTML = `<span style="display:flex;align-items:center;gap:6px;">✨ <span><strong>تحديث متوفر:</strong> v${tagName}</span></span><button type="button" class="btn primary compact" style="margin:0;padding:5px 12px;font-size:0.75rem;border-radius:10px;">تحديث وتثبيت</button>`;
        banner.classList.remove("hidden");
        banner.onclick = () => {
          if (window.LocalDockAndroid && typeof window.LocalDockAndroid.downloadDirect === "function") {
            window.LocalDockAndroid.downloadDirect(apk.browser_download_url, apk.name, apk.size || -1, "", "");
            toast("جارٍ تنزيل التحديث... سيتم فتح التثبيت فور الانتهاء.");
          } else {
            window.open(apk.browser_download_url, "_blank");
          }
        };
      }
    }
  } catch (err) {
    /* non-blocking background check */
  }
}
