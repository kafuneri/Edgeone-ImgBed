import { compressImage } from "./compress.js?v=1.5.0";
import { ICONS, icon } from "./icons.js?v=1.5.0";
import { t, formatRelativeTime, getGreeting } from "./i18n.js?v=1.5.0";

const ALL_FORMATS = ["webp", "png", "jpg", "jpeg", "gif", "avif", "jxl", "svg", "ico", "mp4", "mkv", "mp3", "m4a", "txt", "sh", "zip"];
const COMMON_FORMATS = ["webp", "png", "jpg", "jpeg", "gif", "avif", "jxl"];

const DEFAULT_SETTINGS = {
  uploadFormatLimitEnabled: true,
  formatLimitMode: "common",
  allowedFormats: [...COMMON_FORMATS],
  targetFormat: "avif",
  enableCompress: true,
  compressThresholdMB: 0.5,
  compressTargetMB: 0.95,
  maxDimension: 2048,
  namingMode: "original",
  defaultUploadFolder: "",
  quickFolders: "",
  dedupEnabled: true,
  wallpaper: true,
  themeMode: "dark",
  language: "zh",
  defaultTab: "dashboard",
  pageSize: 24,
  defaultCopyFormat: "url",
};

function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem("eo_settings") || "{}");
    const legacyTheme = localStorage.getItem("eo_theme");
    const legacyWp = localStorage.getItem("eo_wallpaper");
    const migratedTargetFormat =
      raw.targetFormat ||
      (raw.convertToWebp === false ? "original" : DEFAULT_SETTINGS.targetFormat);
    const mode = raw.formatLimitMode || DEFAULT_SETTINGS.formatLimitMode;
    const migratedAllowedFormats =
      mode === "common"
        ? [...COMMON_FORMATS]
        : mode === "all"
          ? [...ALL_FORMATS]
          : Array.isArray(raw.allowedFormats)
            ? raw.allowedFormats
            : [...COMMON_FORMATS];
    return {
      ...DEFAULT_SETTINGS,
      ...raw,
      targetFormat: migratedTargetFormat,
      allowedFormats: migratedAllowedFormats,
      ...(legacyTheme && !raw.themeMode ? { themeMode: legacyTheme } : {}),
      ...(legacyWp && raw.wallpaper === undefined ? { wallpaper: legacyWp !== "off" } : {}),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

const settings = loadSettings();

const state = {
  authenticated: false,
  activeTab: localStorage.getItem("eo_active_tab") || settings.defaultTab || "dashboard",
  settingsSubTab: "status",
  sidebarCollapsed: false,
  viewMode: localStorage.getItem("eo_view_mode") || "grid",
  statusFilter: "all",
  fileTypeFilter: "all",
  sortBy: "date_desc",
  currentFolder: "",
  searchKeyword: "",
  loadingFiles: false,
  allFiles: [],
  allFolders: [],
  manifestUpdatedAt: null,
  selectedPaths: new Set(),
  page: 1,
  pageSize: Number(settings.pageSize) || 24,
  movingFile: null,
  detailFile: null,
  uploadQueue: [],
  inlineUploads: [],
  lightboxList: [],
  lightboxIndex: 0,
  lbScale: 1,
  lbRotate: 0,
  clockTimer: null,
};

const el = {
  toastContainer: document.getElementById("toastContainer"),
  fileInput: document.getElementById("fileInput"),
  directFileInput: document.getElementById("directFileInput"),
  authWrapper: document.getElementById("authWrapper"),
  loginGithubLink: document.getElementById("loginGithubLink"),
  loginGithubIcon: document.getElementById("loginGithubIcon"),
  loginLangToggle: document.getElementById("loginLangToggle"),
  loginThemeToggle: document.getElementById("loginThemeToggle"),
  loginLockIcon: document.getElementById("loginLockIcon"),
  loginForm: document.getElementById("loginForm"),
  loginPassword: document.getElementById("loginPassword"),
  togglePwdBtn: document.getElementById("togglePwdBtn"),
  loginError: document.getElementById("loginError"),
  loginSubmitBtn: document.getElementById("loginSubmitBtn"),
  appShell: document.getElementById("appShell"),
  pageSwitcher: document.getElementById("pageSwitcher"),
  pageSwitcherCurrent: document.getElementById("pageSwitcherCurrent"),
  pageSwitcherMenu: document.getElementById("pageSwitcherMenu"),
  currentTabIcon: document.getElementById("currentTabIcon"),
  currentTabLabel: document.getElementById("currentTabLabel"),
  pageSwitcherArrow: document.getElementById("pageSwitcherArrow"),
  themeToggle: document.getElementById("themeToggle"),
  langToggle: document.getElementById("langToggle"),
  headerSearchWrap: document.getElementById("headerSearchWrap"),
  headerSearchIcon: document.getElementById("headerSearchIcon"),
  searchInput: document.getElementById("searchInput"),
  clearSearchBtn: document.getElementById("clearSearchBtn"),
  filterDropdownWrap: document.getElementById("filterDropdownWrap"),
  filterToggleBtn: document.getElementById("filterToggleBtn"),
  filterDropdownMenu: document.getElementById("filterDropdownMenu"),
  clearFilterBtn: document.getElementById("clearFilterBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  dashboardView: document.getElementById("dashboardView"),
  uploadHubView: document.getElementById("uploadHubView"),
  settingsView: document.getElementById("settingsView"),
  selectAllBtn: document.getElementById("selectAllBtn"),
  selectAllMark: document.getElementById("selectAllMark"),
  viewModeGroup: document.getElementById("viewModeGroup"),
  sortBtn: document.getElementById("sortBtn"),
  sortIconWrap: document.getElementById("sortIconWrap"),
  sortLabel: document.getElementById("sortLabel"),
  breadcrumbs: document.getElementById("breadcrumbs"),
  directUploadBtn: document.getElementById("directUploadBtn"),
  directUploadIcon: document.getElementById("directUploadIcon"),
  newFolderBtn: document.getElementById("newFolderBtn"),
  newFolderIcon: document.getElementById("newFolderIcon"),
  deleteFolderBtn: document.getElementById("deleteFolderBtn"),
  deleteFolderIcon: document.getElementById("deleteFolderIcon"),
  statTotal: document.getElementById("statTotal"),
  statArchived: document.getElementById("statArchived"),
  statStaging: document.getElementById("statStaging"),
  statPendingDelete: document.getElementById("statPendingDelete"),
  foldersSection: document.getElementById("foldersSection"),
  foldersGrid: document.getElementById("foldersGrid"),
  galleryContainer: document.getElementById("galleryContainer"),
  paginationBar: document.getElementById("paginationBar"),
  inlineUploadDock: document.getElementById("inlineUploadDock"),
  inlineDockTitle: document.getElementById("inlineDockTitle"),
  inlineDockClose: document.getElementById("inlineDockClose"),
  inlineDockList: document.getElementById("inlineDockList"),
  batchBar: document.getElementById("batchBar"),
  batchCount: document.getElementById("batchCount"),
  batchCopyUrlBtn: document.getElementById("batchCopyUrlBtn"),
  batchCopyMdBtn: document.getElementById("batchCopyMdBtn"),
  batchCopyHtmlBtn: document.getElementById("batchCopyHtmlBtn"),
  batchDeleteBtn: document.getElementById("batchDeleteBtn"),
  batchUndoDeleteBtn: document.getElementById("batchUndoDeleteBtn"),
  batchClearBtn: document.getElementById("batchClearBtn"),
  triggerArchiveBtn: document.getElementById("triggerArchiveBtn"),
  triggerArchiveIcon: document.getElementById("triggerArchiveIcon"),
  uploadFolderSelect: document.getElementById("uploadFolderSelect"),
  hubNewFolderBtn: document.getElementById("hubNewFolderBtn"),
  hubQuickFolders: document.getElementById("hubQuickFolders"),
  uploadCustomName: document.getElementById("uploadCustomName"),
  uploadCompressCheck: document.getElementById("uploadCompressCheck"),
  dropzone: document.getElementById("dropzone"),
  uploadGlow: document.getElementById("uploadGlow"),
  uploadPlusIcon: document.getElementById("uploadPlusIcon"),
  uploadListCard: document.getElementById("uploadListCard"),
  qTotalIcon: document.getElementById("qTotalIcon"),
  qOkIcon: document.getElementById("qOkIcon"),
  qErrIcon: document.getElementById("qErrIcon"),
  qTotalCount: document.getElementById("qTotalCount"),
  qSuccessCount: document.getElementById("qSuccessCount"),
  qFailCount: document.getElementById("qFailCount"),
  copyAllUrlsBtn: document.getElementById("copyAllUrlsBtn"),
  copyAllMdBtn: document.getElementById("copyAllMdBtn"),
  retryFailedBtn: document.getElementById("retryFailedBtn"),
  clearQueueBtn: document.getElementById("clearQueueBtn"),
  uploadQueueList: document.getElementById("uploadQueueList"),
  settingsSidebar: document.getElementById("settingsSidebar"),
  settingsMain: document.getElementById("settingsMain"),
  settingsSidebarToggle: document.getElementById("settingsSidebarToggle"),
  sidebarToggleIcon: document.getElementById("sidebarToggleIcon"),
  settingsStatusPanel: document.getElementById("settingsStatusPanel"),
  settingsUploadPanel: document.getElementById("settingsUploadPanel"),
  settingsWebPanel: document.getElementById("settingsWebPanel"),
  statusGreeting: document.getElementById("statusGreeting"),
  statusHeroDate: document.getElementById("statusHeroDate"),
  statusSummary: document.getElementById("statusSummary"),
  statusClock: document.getElementById("statusClock"),
  statusTimezone: document.getElementById("statusTimezone"),
  statusTotalCard: document.getElementById("statusTotalCard"),
  statusTotalIcon: document.getElementById("statusTotalIcon"),
  statusTotalValue: document.getElementById("statusTotalValue"),
  statusIndexIcon: document.getElementById("statusIndexIcon"),
  statusIndexTime: document.getElementById("statusIndexTime"),
  statusIndexRel: document.getElementById("statusIndexRel"),
  statusVerIcon: document.getElementById("statusVerIcon"),
  trendChartTitle: document.getElementById("trendChartTitle"),
  trendChartBody: document.getElementById("trendChartBody"),
  channelChartTitle: document.getElementById("channelChartTitle"),
  channelChartBody: document.getElementById("channelChartBody"),
  formatChartTitle: document.getElementById("formatChartTitle"),
  formatChartBody: document.getElementById("formatChartBody"),
  cfgFormatLimit: document.getElementById("cfgFormatLimit"),
  cfgLimitModeGroup: document.getElementById("cfgLimitModeGroup"),
  cfgAllowedFormats: document.getElementById("cfgAllowedFormats"),
  cfgTargetFormatGroup: document.getElementById("cfgTargetFormatGroup"),
  cfgEnableCompress: document.getElementById("cfgEnableCompress"),
  cfgThresholdRange: document.getElementById("cfgThresholdRange"),
  cfgThresholdNum: document.getElementById("cfgThresholdNum"),
  cfgTargetRange: document.getElementById("cfgTargetRange"),
  cfgTargetNum: document.getElementById("cfgTargetNum"),
  cfgMaxDim: document.getElementById("cfgMaxDim"),
  cfgNamingModeGroup: document.getElementById("cfgNamingModeGroup"),
  cfgDefaultFolder: document.getElementById("cfgDefaultFolder"),
  cfgQuickFolders: document.getElementById("cfgQuickFolders"),
  cfgDedupEnabled: document.getElementById("cfgDedupEnabled"),
  cfgApiSnippetBox: document.getElementById("cfgApiSnippetBox"),
  cfgCopyPicgoBtn: document.getElementById("cfgCopyPicgoBtn"),
  cfgSaveUploadBtn: document.getElementById("cfgSaveUploadBtn"),
  cfgResetUploadBtn: document.getElementById("cfgResetUploadBtn"),
  maintRefreshBtn: document.getElementById("maintRefreshBtn"),
  maintArchiveBtn: document.getElementById("maintArchiveBtn"),
  maintDupScanBtn: document.getElementById("maintDupScanBtn"),
  maintExportBtn: document.getElementById("maintExportBtn"),
  statusRecentList: document.getElementById("statusRecentList"),
  dupModal: document.getElementById("dupModal"),
  dupModalBody: document.getElementById("dupModalBody"),
  cfgWallpaper: document.getElementById("cfgWallpaper"),
  cfgThemeGroup: document.getElementById("cfgThemeGroup"),
  cfgLangGroup: document.getElementById("cfgLangGroup"),
  cfgDefaultTab: document.getElementById("cfgDefaultTab"),
  cfgPageSize: document.getElementById("cfgPageSize"),
  cfgCopyFmt: document.getElementById("cfgCopyFmt"),
  detailModal: document.getElementById("detailModal"),
  detailTitle: document.getElementById("detailTitle"),
  detailPreviewWrap: document.getElementById("detailPreviewWrap"),
  detailMetaTable: document.getElementById("detailMetaTable"),
  detailLinksList: document.getElementById("detailLinksList"),
  detailFooter: document.getElementById("detailFooter"),
  folderModal: document.getElementById("folderModal"),
  folderForm: document.getElementById("folderForm"),
  folderNameInput: document.getElementById("folderNameInput"),
  moveModal: document.getElementById("moveModal"),
  moveForm: document.getElementById("moveForm"),
  moveFromPath: document.getElementById("moveFromPath"),
  moveToFolderSelect: document.getElementById("moveToFolderSelect"),
  moveToNameInput: document.getElementById("moveToNameInput"),
  lightbox: document.getElementById("lightbox"),
  lightboxImg: document.getElementById("lightboxImg"),
  lbClose: document.getElementById("lbClose"),
  lbPrev: document.getElementById("lbPrev"),
  lbNext: document.getElementById("lbNext"),
  lbZoomOut: document.getElementById("lbZoomOut"),
  lbZoomIn: document.getElementById("lbZoomIn"),
  lbReset: document.getElementById("lbReset"),
  lbRotateLeft: document.getElementById("lbRotateLeft"),
  lbRotateRight: document.getElementById("lbRotateRight"),
  lbCopyUrl: document.getElementById("lbCopyUrl"),
};

function saveSettings() {
  localStorage.setItem("eo_settings", JSON.stringify(settings));
}

function lang() {
  return settings.language === "en" ? "en" : "zh";
}

function tr(key, params = {}) {
  return t(lang(), key, params);
}

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function initStaticIcons() {
  el.loginGithubIcon.innerHTML = icon("github");
  el.loginLangToggle.innerHTML = icon("globe");
  el.loginThemeToggle.innerHTML = icon("themeContrast");
  el.loginLockIcon.innerHTML = icon("lock");
  el.togglePwdBtn.innerHTML = icon("eye");

  el.themeToggle.innerHTML = icon("themeContrast");
  el.langToggle.innerHTML = icon("globe");
  el.pageSwitcherArrow.innerHTML = icon("chevronDown");
  el.headerSearchIcon.innerHTML = icon("search");
  el.clearSearchBtn.innerHTML = icon("x");
  el.filterToggleBtn.innerHTML = icon("filter");
  el.refreshBtn.innerHTML = icon("refresh");
  el.logoutBtn.innerHTML = icon("logout");

  el.selectAllMark.innerHTML = icon("check");
  el.viewModeGroup.querySelector('[data-mode="grid"]').innerHTML = icon("grid");
  el.viewModeGroup.querySelector('[data-mode="list"]').innerHTML = icon("list");
  el.viewModeGroup.querySelector('[data-mode="waterfall"]').innerHTML = icon("waterfall");
  el.sortIconWrap.innerHTML = icon("sort");
  el.directUploadIcon.innerHTML = icon("upload");
  el.newFolderIcon.innerHTML = icon("folderPlus");
  el.deleteFolderIcon.innerHTML = icon("trash");

  el.triggerArchiveIcon.innerHTML = icon("gitBranch");
  el.hubNewFolderBtn.innerHTML = icon("plus");
  el.uploadPlusIcon.innerHTML = icon("plus");
  el.qTotalIcon.innerHTML = icon("list");
  el.qOkIcon.innerHTML = icon("checkCircle");
  el.qErrIcon.innerHTML = icon("xCircle");
  el.inlineDockClose.innerHTML = icon("x");

  el.batchDeleteBtn.innerHTML = icon("trash");
  if (el.batchUndoDeleteBtn) el.batchUndoDeleteBtn.innerHTML = icon("rotateCcw");
  el.batchClearBtn.innerHTML = icon("x");

  el.statusTotalIcon.innerHTML = icon("database");
  el.statusIndexIcon.innerHTML = icon("clock");
  el.statusVerIcon.innerHTML = icon("gitBranch");
  el.sidebarToggleIcon.innerHTML = icon("panelLeft");

  document.querySelectorAll("[data-icon]").forEach((node) => {
    node.innerHTML = icon(node.dataset.icon);
  });
  document.querySelectorAll(".modal-close").forEach((btn) => {
    btn.innerHTML = icon("x");
  });

  el.lbClose.innerHTML = icon("x");
  el.lbPrev.innerHTML = icon("chevronLeft");
  el.lbNext.innerHTML = icon("chevronRight");
  el.lbZoomOut.innerHTML = icon("zoomOut");
  el.lbZoomIn.innerHTML = icon("zoomIn");
  el.lbRotateLeft.innerHTML = icon("rotateCcw");
  el.lbRotateRight.innerHTML = icon("rotateCw");
}

function applyTheme(mode) {
  settings.themeMode = mode || "dark";
  let effectiveDark = true;
  if (settings.themeMode === "light") effectiveDark = false;
  else if (settings.themeMode === "auto") {
    effectiveDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  document.documentElement.classList.toggle("dark", effectiveDark);
  document.documentElement.setAttribute("data-theme", effectiveDark ? "dark" : "light");
  localStorage.setItem("eo_theme", settings.themeMode);
  saveSettings();
}

function applyWallpaper(enabled) {
  settings.wallpaper = !!enabled;
  document.body.classList.toggle("wallpaper-active", settings.wallpaper);
  localStorage.setItem("eo_wallpaper", settings.wallpaper ? "on" : "off");
  saveSettings();
}

function applyI18n() {
  document.documentElement.lang = lang() === "en" ? "en" : "zh-CN";
  document.title = tr("app.title");

  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = tr(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.placeholder = tr(node.dataset.i18nPlaceholder);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((node) => {
    node.title = tr(node.dataset.i18nTitle);
  });

  el.loginGithubLink.title = tr("login.githubRepo");
  el.loginLangToggle.title = tr("login.toggleLang");
  el.langToggle.title = tr("login.toggleLang");
  el.loginThemeToggle.title = tr("login.toggleTheme");
  el.themeToggle.title = tr("login.toggleTheme");

  el.retryFailedBtn.innerHTML = `${icon("refresh")} <span>${escapeHtml(tr("upload.retry"))}</span>`;
  el.clearQueueBtn.innerHTML = `${icon("trash")} <span>${escapeHtml(tr("upload.clear"))}</span>`;
  el.lbCopyUrl.innerHTML = `${icon("copy")} <span>${escapeHtml(tr("lb.copyUrl"))}</span>`;

  const sortMap = { date_desc: "dash.sortLatest", name_asc: "dash.sortName", size_desc: "dash.sortSize" };
  el.sortLabel.textContent = tr(sortMap[state.sortBy] || "dash.sortLatest");

  updateCurrentTabBadge();
  updateStatsPills();
  updateFolderDropdowns();

  if (state.authenticated) {
    renderDashboard();
    renderUploadQueue();
    if (state.activeTab === "settings") {
      renderSettingsPanels();
    }
  }
}

function showToast(message, type = "info") {
  const iconMap = {
    success: "checkCircle",
    warning: "alertTriangle",
    error: "xCircle",
    info: "info",
  };
  const toast = document.createElement("div");
  toast.className = `toast-item ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icon(iconMap[type] || "info")}</span><span>${escapeHtml(message)}</span>`;
  el.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("is-leaving");
    setTimeout(() => toast.remove(), 220);
  }, 2600);
}

function authFetch(url, options = {}) {
  const token = localStorage.getItem("eo_token");
  const headers = new Headers(options.headers || {});
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(url, { ...options, headers });
}

async function parseJsonSafe(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 120)}` };
  }
}

async function copyText(text, label = "URL") {
  try {
    await navigator.clipboard.writeText(text);
    showToast(tr("copy.done", { label }), "success");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      showToast(tr("copy.done", { label }), "success");
    } catch {
      showToast(tr("copy.fail"), "error");
    }
    ta.remove();
  }
}

function buildLinkFormats(file) {
  const url = file.url;
  const name = file.name || file.path.split("/").pop();
  const kind = getFileVisualKind({ name, mime: file.mime || file.contentType });

  if (kind === "video") {
    return {
      url,
      markdown: `<video src="${url}" controls width="100%"></video>`,
      html: `<video src="${url}" controls playsinline></video>`,
      bbcode: `[url=${url}]${name}[/url]`,
    };
  }
  if (kind === "audio") {
    return {
      url,
      markdown: `<audio src="${url}" controls></audio>`,
      html: `<audio src="${url}" controls></audio>`,
      bbcode: `[url=${url}]${name}[/url]`,
    };
  }
  if (kind === "text" || kind === "archive") {
    return {
      url,
      markdown: `[${name}](${url})`,
      html: `<a href="${url}" target="_blank" rel="noopener">${name}</a>`,
      bbcode: `[url=${url}]${name}[/url]`,
    };
  }
  return {
    url,
    markdown: `![${name}](${url})`,
    html: `<img src="${url}" alt="${name}" />`,
    bbcode: `[img]${url}[/img]`,
  };
}

function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  return `${i === 0 ? Math.round(val) : Number(val.toFixed(decimals))} ${sizes[i]}`;
}

function formatDate(isoStr) {
  if (!isoStr) return "-";
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateTimeFull(isoStr) {
  if (!isoStr) return "-";
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function inferMimeFromName(name = "") {
  const ext = (name.split(".").pop() || "").toLowerCase();
  const map = {
    webp: "image/webp",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    avif: "image/avif",
    jxl: "image/jxl",
    svg: "image/svg+xml",
    ico: "image/x-icon",
    mp4: "video/mp4",
    mkv: "video/x-matroska",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    txt: "text/plain",
    sh: "text/x-shellscript",
    zip: "application/zip",
  };
  return map[ext] || "application/octet-stream";
}

function inferMimeFromFile(file) {
  const ext = (file.name?.split(".").pop() || "").toLowerCase();
  // Always keep shell script MIME distinct from text/plain so backend preserves .sh extension.
  if (ext === "sh") return "text/x-shellscript";
  return file.type || inferMimeFromName(file.name);
}

// ==================== AUTH ====================
function setAuthenticated(isAuth) {
  state.authenticated = isAuth;
  if (isAuth) {
    el.authWrapper.style.display = "none";
    el.appShell.style.display = "flex";
    switchTab(state.activeTab);
  } else {
    stopClock();
    el.authWrapper.style.display = "flex";
    el.appShell.style.display = "none";
    el.loginPassword.value = "";
    el.loginPassword.focus();
  }
}

async function checkAuth() {
  try {
    const res = await authFetch("/api/auth/me");
    if (res.ok) {
      const data = await res.json();
      if (data.authenticated) {
        setAuthenticated(true);
        loadFiles();
        return;
      }
    }
  } catch (err) {
    console.error("Auth check failed:", err);
  }
  setAuthenticated(false);
}

async function handleLogin(e) {
  e.preventDefault();
  const password = el.loginPassword.value.trim();
  if (!password) return;

  el.loginError.style.display = "none";
  el.loginSubmitBtn.classList.add("is-loading");
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await parseJsonSafe(res);
    if (res.ok && data.ok) {
      if (data.token) localStorage.setItem("eo_token", data.token);
      setAuthenticated(true);
      showToast(tr("login.success"), "success");
      loadFiles();
    } else {
      el.loginError.textContent = data.error || tr("login.failed");
      el.loginError.style.display = "block";
    }
  } catch {
    el.loginError.textContent = tr("login.networkError");
    el.loginError.style.display = "block";
  } finally {
    el.loginSubmitBtn.classList.remove("is-loading");
  }
}

async function handleLogout() {
  localStorage.removeItem("eo_token");
  try {
    await authFetch("/api/auth/logout", { method: "POST" });
  } finally {
    setAuthenticated(false);
    showToast(tr("header.loggedOut"), "info");
  }
}

// ==================== TAB SWITCHING ====================
function updateCurrentTabBadge() {
  const meta = {
    dashboard: { iconName: "image", labelKey: "nav.dashboard" },
    upload: { iconName: "cloudUpload", labelKey: "nav.upload" },
    settings: { iconName: "settings", labelKey: "nav.settings" },
  }[state.activeTab] || { iconName: "image", labelKey: "nav.dashboard" };

  el.currentTabIcon.innerHTML = icon(meta.iconName);
  el.currentTabLabel.textContent = tr(meta.labelKey);
}

function switchTab(tab) {
  const valid = ["dashboard", "upload", "settings"];
  state.activeTab = valid.includes(tab) ? tab : "dashboard";
  localStorage.setItem("eo_active_tab", state.activeTab);

  el.dashboardView.style.display = state.activeTab === "dashboard" ? "block" : "none";
  el.uploadHubView.style.display = state.activeTab === "upload" ? "flex" : "none";
  el.settingsView.style.display = state.activeTab === "settings" ? "block" : "none";

  const showSearch = state.activeTab === "dashboard";
  el.headerSearchWrap.style.display = showSearch ? "flex" : "none";
  el.filterDropdownWrap.style.display = showSearch ? "inline-flex" : "none";
  if (!showSearch) closeFilterDropdown();
  el.batchBar.style.display = showSearch && state.selectedPaths.size > 0 ? "flex" : "none";

  el.pageSwitcher.classList.remove("is-open");
  updateCurrentTabBadge();

  if (state.activeTab === "upload") {
    stopClock();
    const preferredDir = (settings.defaultUploadFolder || "").trim().replace(/^\/+|\/+$/g, "");
    const fallbackDir = preferredDir || state.currentFolder || "";
    const hasOption = Array.from(el.uploadFolderSelect.options).some((opt) => opt.value === fallbackDir);
    el.uploadFolderSelect.value = hasOption ? fallbackDir : (state.currentFolder || "");
    el.uploadCompressCheck.checked = settings.enableCompress;
    renderQuickFolders();
    renderUploadQueue();
  } else if (state.activeTab === "settings") {
    renderSettingsPanels();
  } else {
    stopClock();
  }
}

// ==================== DATA LOADING ====================
function renderSkeleton() {
  const cards = Array.from({ length: 8 })
    .map(() => `<div class="skeleton-card"><div class="skeleton-shimmer"></div></div>`)
    .join("");
  el.galleryContainer.innerHTML = `<div class="gallery-grid">${cards}</div>`;
}

async function loadFiles() {
  state.loadingFiles = true;
  if (state.allFiles.length === 0 && state.activeTab === "dashboard") {
    renderSkeleton();
  }
  try {
    const res = await authFetch("/api/files");
    if (!res.ok) {
      if (res.status === 401) {
        setAuthenticated(false);
        return;
      }
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    state.allFiles = data.files || [];
    state.allFolders = data.folders || [];
    state.manifestUpdatedAt = data.manifestUpdatedAt || null;

    updateStatsPills();
    updateFolderDropdowns();
    renderDashboard();
    if (state.activeTab === "settings") {
      renderStatusPanel();
    }
  } catch (err) {
    showToast(tr("dash.loadFailed", { err: err.message }), "error");
  } finally {
    state.loadingFiles = false;
  }
}

function updateStatsPills() {
  const total = state.allFiles.length;
  const archived = state.allFiles.filter((f) => f.status === "archived").length;
  const staging = state.allFiles.filter((f) => f.status === "staging").length;
  const pendingDelete = state.allFiles.filter((f) => f.status === "pending_delete").length;

  el.statTotal.innerHTML = `${icon("database")} <span>${escapeHtml(tr("dash.statTotal", { count: total }))}</span>`;
  el.statArchived.innerHTML = `${icon("checkCircle")} <span>${escapeHtml(tr("dash.statArchived", { count: archived }))}</span>`;
  el.statStaging.innerHTML = `${icon("clock")} <span>${escapeHtml(tr("dash.statStaging", { count: staging }))}</span>`;
  if (el.statPendingDelete) {
    el.statPendingDelete.innerHTML = `${icon("trash")} <span>${escapeHtml(tr("dash.statPendingDelete", { count: pendingDelete }))}</span>`;
    el.statPendingDelete.style.display =
      pendingDelete > 0 || state.statusFilter === "pending_delete" ? "inline-flex" : "none";
  }
}

const IMAGE_EXTS = new Set(["webp", "png", "jpg", "jpeg", "gif", "avif", "jxl", "svg", "ico", "bmp", "tiff", "heic", "heif"]);
const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "avi", "mkv", "m4v", "ogv"]);
const AUDIO_EXTS = new Set(["mp3", "wav", "ogg", "flac", "aac", "m4a", "opus", "weba"]);
const TEXT_EXTS = new Set(["txt", "sh", "md", "json", "log", "csv", "yaml", "yml", "xml", "ini", "conf"]);
const ARCHIVE_EXTS = new Set(["zip", "7z", "rar", "tar", "gz", "bz2", "xz"]);

function getFileExt(name = "") {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : "";
}

function getFileCategory(file) {
  const name = (file?.name || "").toLowerCase();
  const ext = getFileExt(name);
  const mime = (file?.mime || inferMimeFromName(name) || "").toLowerCase();
  if (IMAGE_EXTS.has(ext) || mime.startsWith("image/")) return "image";
  if (VIDEO_EXTS.has(ext) || mime.startsWith("video/")) return "video";
  if (AUDIO_EXTS.has(ext) || mime.startsWith("audio/")) return "audio";
  return "other";
}

function getFileVisualKind(file) {
  const name = file?.name || "";
  const ext = getFileExt(name);
  const mime = (file?.mime || file?.type || inferMimeFromName(name) || "").toLowerCase();
  if (AUDIO_EXTS.has(ext) || mime.startsWith("audio/")) return "audio";
  if (VIDEO_EXTS.has(ext) || mime.startsWith("video/")) return "video";
  if (TEXT_EXTS.has(ext) || mime.startsWith("text/")) return "text";
  if (ARCHIVE_EXTS.has(ext) || mime === "application/zip" || mime === "application/x-zip-compressed") return "archive";
  return "image";
}

function getGenericCoverUrl(kind) {
  const map = {
    audio: "/assets/file-audio.svg?v=1.5.0",
    text: "/assets/file-text.svg?v=1.5.0",
    archive: "/assets/file-archive.svg?v=1.5.0",
  };
  return map[kind] || "/assets/file-text.svg?v=1.5.0";
}

function applyNamingRule(origName, mode = "original") {
  const dotIdx = origName.lastIndexOf(".");
  const base = dotIdx > 0 ? origName.slice(0, dotIdx) : origName;
  const ext = dotIdx > 0 ? origName.slice(dotIdx) : "";
  if (mode === "timestamp") {
    return `${Date.now()}${ext}`;
  }
  if (mode === "date_prefix") {
    const now = new Date();
    const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    return `${ymd}_${base}${ext}`;
  }
  if (mode === "short_id") {
    const id = Math.random().toString(36).slice(2, 10);
    return `${id}${ext}`;
  }
  return origName;
}

async function computeBlobShortSha256(blob) {
  if (!blob || typeof crypto === "undefined" || !crypto.subtle) return "";
  try {
    const buf = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buf);
    const bytes = new Uint8Array(digest);
    let hex = "";
    for (let i = 0; i < 8; i++) {
      hex += bytes[i].toString(16).padStart(2, "0");
    }
    return hex;
  } catch {
    return "";
  }
}

function renderQuickFolders() {
  if (!el.hubQuickFolders) return;
  const list = String(settings.quickFolders || "")
    .split(",")
    .map((s) => s.trim().replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);
  if (list.length === 0) {
    el.hubQuickFolders.style.display = "none";
    el.hubQuickFolders.innerHTML = "";
    return;
  }
  el.hubQuickFolders.style.display = "flex";
  const curDir = el.uploadFolderSelect.value || "";
  el.hubQuickFolders.innerHTML = list
    .map((dir) => {
      const active = curDir === dir ? "active" : "";
      return `<button type="button" class="hub-quick-folder-pill ${active}" data-qdir="${escapeHtml(dir)}">${icon("folder")} <span>${escapeHtml(dir)}</span></button>`;
    })
    .join("");
  el.hubQuickFolders.querySelectorAll("[data-qdir]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.qdir;
      const hasOpt = Array.from(el.uploadFolderSelect.options).some((opt) => opt.value === target);
      if (!hasOpt) {
        const opt = document.createElement("option");
        opt.value = target;
        opt.textContent = target;
        el.uploadFolderSelect.appendChild(opt);
      }
      el.uploadFolderSelect.value = target;
      renderQuickFolders();
    });
  });
}

async function triggerArchiveFlow(btnEl, labelSelector = null) {
  if (!confirm(tr("upload.archiveConfirm"))) return;
  const labelNode = labelSelector ? btnEl?.querySelector(labelSelector) : btnEl;
  const prevText = labelNode ? labelNode.textContent : "";
  if (btnEl) btnEl.disabled = true;
  if (labelNode) labelNode.textContent = tr("upload.archiveRunning");
  try {
    const res = await authFetch("/api/archive/trigger", { method: "POST" });
    const data = await parseJsonSafe(res);
    if (res.ok && data.ok) {
      showToast(tr("upload.archiveTriggered"), "success");
    } else {
      showToast(tr("upload.archiveFailed", { err: data?.error || `HTTP ${res.status}` }), "error");
    }
  } catch (err) {
    showToast(tr("upload.archiveFailed", { err: err.message || "Network error" }), "error");
  } finally {
    if (btnEl) btnEl.disabled = false;
    if (labelNode) labelNode.textContent = prevText || tr("upload.archiveNow");
  }
}

function renderFileVisual(file, opts = {}) {
  const { muted = true, playsinline = true, lazy = true, controls = false, className = "", id = "" } = opts;
  const kind = getFileVisualKind(file);
  const safeUrl = escapeHtml(file?.url || "");
  const safeName = escapeHtml(file?.name || "");
  const idAttr = id ? ` id="${escapeHtml(id)}"` : "";
  if (kind === "video") {
    return `<video${idAttr} src="${safeUrl}" preload="metadata"${muted ? " muted" : ""}${playsinline ? " playsinline" : ""}${controls ? " controls" : ""}${className ? ` class="${escapeHtml(className)}"` : ""}></video>`;
  }
  if (kind === "audio" || kind === "text" || kind === "archive") {
    const coverUrl = getGenericCoverUrl(kind);
    const cls = ["generic-file-cover", className].filter(Boolean).join(" ");
    return `<img${idAttr} src="${coverUrl}" alt="${safeName}" class="${escapeHtml(cls)}"${lazy ? ' loading="lazy"' : ""} />`;
  }
  return `<img${idAttr} src="${safeUrl}" alt="${safeName}"${className ? ` class="${escapeHtml(className)}"` : ""}${lazy ? ' loading="lazy"' : ""} />`;
}

function matchesFileFilters(file) {
  const matchStatus = state.statusFilter === "all" || file.status === state.statusFilter;
  const matchType = state.fileTypeFilter === "all" || getFileCategory(file) === state.fileTypeFilter;
  return matchStatus && matchType;
}

function getFilteredAndSortedFiles() {
  let list = state.allFiles;
  if (state.searchKeyword) {
    const kw = state.searchKeyword.toLowerCase();
    list = state.allFiles.filter((f) => {
      const inFolder = !state.currentFolder || f.dir === state.currentFolder || f.dir.startsWith(`${state.currentFolder}/`);
      return inFolder && matchesFileFilters(f) && (f.name.toLowerCase().includes(kw) || f.path.toLowerCase().includes(kw));
    });
  } else {
    list = list.filter((f) => {
      const inDir = state.currentFolder === "" || f.dir === state.currentFolder;
      return inDir && matchesFileFilters(f);
    });
  }

  const sorted = [...list];
  if (state.sortBy === "date_desc") {
    sorted.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  } else if (state.sortBy === "name_asc") {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
  } else if (state.sortBy === "size_desc") {
    sorted.sort((a, b) => (b.size || 0) - (a.size || 0));
  }
  return sorted;
}

function getChildFolders(parentDir) {
  const prefix = parentDir ? `${parentDir}/` : "";
  const children = new Set();
  for (const folder of state.allFolders) {
    if (parentDir === "") {
      const top = folder.split("/")[0];
      if (top) children.add(top);
    } else if (folder.startsWith(prefix)) {
      const rest = folder.slice(prefix.length);
      const nextSeg = rest.split("/")[0];
      if (nextSeg) children.add(`${prefix}${nextSeg}`);
    }
  }
  return Array.from(children).sort();
}

function closeFilterDropdown() {
  if (!el.filterDropdownWrap) return;
  el.filterDropdownWrap.classList.remove("is-open");
  el.filterToggleBtn?.setAttribute("aria-expanded", "false");
}

function syncFilterUI() {
  el.filterDropdownMenu?.querySelectorAll("[data-filter-channel]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.filterChannel === state.statusFilter);
  });
  el.filterDropdownMenu?.querySelectorAll("[data-filter-type]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.filterType === state.fileTypeFilter);
  });
  document.querySelectorAll("[data-status-pill]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.statusPill === state.statusFilter);
  });
  const hasActive = state.statusFilter !== "all" || state.fileTypeFilter !== "all";
  el.filterToggleBtn?.classList.toggle("has-active-filter", hasActive);
  if (el.clearFilterBtn) el.clearFilterBtn.disabled = !hasActive;
}

function setStatusFilter(status) {
  state.statusFilter = status;
  state.page = 1;
  syncFilterUI();
  renderDashboard();
}

function setFileTypeFilter(type) {
  state.fileTypeFilter = type;
  state.page = 1;
  syncFilterUI();
  renderDashboard();
}

function clearAllFilters() {
  state.statusFilter = "all";
  state.fileTypeFilter = "all";
  state.page = 1;
  syncFilterUI();
  renderDashboard();
}

// ==================== DASHBOARD RENDERING ====================
function renderBreadcrumbs() {
  let html = `<span class="breadcrumb-item ${state.currentFolder === "" ? "current" : ""}" data-folder="">${icon("home")} <span>${escapeHtml(tr("dash.allFiles"))}</span></span>`;
  if (state.currentFolder) {
    const segments = state.currentFolder.split("/");
    let acc = "";
    segments.forEach((seg, idx) => {
      acc = acc ? `${acc}/${seg}` : seg;
      const isLast = idx === segments.length - 1;
      html += `<span class="breadcrumb-sep">/</span>`;
      html += `<span class="breadcrumb-item ${isLast ? "current" : ""}" data-folder="${escapeHtml(acc)}">${escapeHtml(seg)}</span>`;
    });
  }
  el.breadcrumbs.innerHTML = html;

  el.breadcrumbs.querySelectorAll(".breadcrumb-item:not(.current)").forEach((node) => {
    node.addEventListener("click", () => {
      state.currentFolder = node.dataset.folder || "";
      state.page = 1;
      renderDashboard();
    });
  });

  if (state.currentFolder) {
    const hasFiles = state.allFiles.some((f) => f.dir === state.currentFolder || f.dir.startsWith(`${state.currentFolder}/`));
    const hasSub = getChildFolders(state.currentFolder).length > 0;
    el.deleteFolderBtn.style.display = !hasFiles && !hasSub ? "inline-flex" : "none";
  } else {
    el.deleteFolderBtn.style.display = "none";
  }
}

function renderFolders() {
  if (state.searchKeyword) {
    el.foldersSection.style.display = "none";
    return;
  }
  const childFolders = getChildFolders(state.currentFolder);
  const visibleFolders = childFolders.filter((folderPath) => {
    if (state.statusFilter === "all" && state.fileTypeFilter === "all") return true;
    return state.allFiles.some(
      (f) => matchesFileFilters(f) && (f.dir === folderPath || f.dir.startsWith(`${folderPath}/`))
    );
  });

  if (visibleFolders.length === 0) {
    el.foldersSection.style.display = "none";
    return;
  }

  el.foldersSection.style.display = "block";
  el.foldersGrid.innerHTML = visibleFolders
    .map((folderPath) => {
      const name = folderPath.split("/").pop();
      const count = state.allFiles.filter(
        (f) =>
          matchesFileFilters(f) &&
          (f.dir === folderPath || f.dir.startsWith(`${folderPath}/`))
      ).length;
      return `
        <div class="folder-card" data-folder="${escapeHtml(folderPath)}">
          <div class="folder-card-icon">${icon("folder")}</div>
          <div class="folder-card-info">
            <div class="folder-card-name" title="${escapeHtml(folderPath)}">${escapeHtml(name)}</div>
            <div class="folder-card-count">${escapeHtml(tr("dash.folderFileCount", { count }))}</div>
          </div>
        </div>
      `;
    })
    .join("");

  el.foldersGrid.querySelectorAll(".folder-card").forEach((card) => {
    card.addEventListener("click", () => {
      state.currentFolder = card.dataset.folder;
      state.page = 1;
      renderDashboard();
    });
  });
}

function renderDashboard() {
  renderBreadcrumbs();
  renderFolders();

  const allMatching = getFilteredAndSortedFiles();
  const totalPages = Math.max(1, Math.ceil(allMatching.length / state.pageSize));
  if (state.page > totalPages) state.page = totalPages;

  const start = (state.page - 1) * state.pageSize;
  const pageItems = allMatching.slice(start, start + state.pageSize);
  state.lightboxList = allMatching.filter((f) => getFileVisualKind(f) === "image");

  updateSelectAllButton(pageItems);
  updateBatchBar();

  if (pageItems.length === 0) {
    el.galleryContainer.innerHTML = `
      <div class="empty-state-box">
        <div class="empty-state-icon">${icon("image")}</div>
        <div>${escapeHtml(tr("dash.empty"))}</div>
      </div>
    `;
    el.paginationBar.style.display = "none";
    return;
  }

  if (state.viewMode === "list") {
    renderListView(pageItems);
  } else if (state.viewMode === "waterfall") {
    renderWaterfallView(pageItems);
  } else {
    renderGridView(pageItems);
  }

  bindGalleryEvents();
  renderPagination(totalPages);
}

function getStatusBadgeMeta(status) {
  if (status === "pending_delete") {
    return {
      cls: "pending_delete",
      badgeText: tr("dash.pendingDeleteBadge"),
      fullText: tr("dash.pendingDeleteText"),
    };
  }
  if (status === "archived") {
    return {
      cls: "archived",
      badgeText: tr("dash.staticBadge"),
      fullText: tr("dash.archivedText"),
    };
  }
  return {
    cls: "staging",
    badgeText: tr("dash.blobBadge"),
    fullText: tr("dash.stagingText"),
  };
}

function renderGridView(items) {
  const html = items
    .map((file) => {
      const isStaging = file.status === "staging";
      const isPendingDelete = file.status === "pending_delete";
      const statusMeta = getStatusBadgeMeta(file.status);
      const kind = getFileVisualKind(file);
      const ext = getFileExt(file.name);
      const selected = state.selectedPaths.has(file.path);
      const safePath = escapeHtml(file.path);
      const safeName = escapeHtml(file.name);

      return `
        <div class="img-card ${selected ? "is-selected" : ""} ${isPendingDelete ? "is-pending-delete" : ""}" data-path="${safePath}">
          <div class="file-short-info">
            <span class="channel-tag ${statusMeta.cls}">${escapeHtml(statusMeta.badgeText)}</span>
            ${kind !== "image" && ext ? `<span class="file-ext-tag">${escapeHtml(ext.toUpperCase())}</span>` : ""}
          </div>
          <button type="button" class="card-select-btn ${selected ? "checked" : ""}" data-select="${safePath}" aria-label="Select">${selected ? icon("check") : ""}</button>
          <div class="img-card-media" data-detail="${safePath}">
            ${renderFileVisual(file)}
          </div>
          <div class="card-bottom-overlay">
            <div class="card-file-name" title="${safePath}">${safeName}</div>
            <div class="card-file-sub">${formatBytes(file.size)} · ${formatDate(file.updatedAt)}</div>
            <div class="card-action-bar">
              <div class="card-action-group">
                <button type="button" class="card-act-btn copy-fmt-btn" data-path="${safePath}" data-fmt="url">URL</button>
                <button type="button" class="card-act-btn copy-fmt-btn" data-path="${safePath}" data-fmt="markdown">MD</button>
                <button type="button" class="card-act-btn copy-fmt-btn" data-path="${safePath}" data-fmt="html">HTML</button>
              </div>
              <div class="card-action-group">
                ${
                  kind === "image"
                    ? `<button type="button" class="card-act-btn preview-lb-btn" data-path="${safePath}" title="${escapeHtml(tr("dash.preview"))}">${icon("search")}</button>`
                    : ""
                }
                ${
                  isStaging
                    ? `<button type="button" class="card-act-btn move-btn" data-path="${safePath}" title="${escapeHtml(tr("dash.move"))}">${icon("edit")}</button>
                       <button type="button" class="card-act-btn danger delete-btn" data-path="${safePath}" title="${escapeHtml(tr("dash.delete"))}">${icon("trash")}</button>`
                    : isPendingDelete
                    ? `<button type="button" class="card-act-btn undo-delete-btn" data-path="${safePath}" title="${escapeHtml(tr("dash.undoDelete"))}">${icon("rotateCcw")}</button>`
                    : `<button type="button" class="card-act-btn danger mark-delete-btn" data-path="${safePath}" title="${escapeHtml(tr("dash.delete"))}">${icon("trash")}</button>`
                }
              </div>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  el.galleryContainer.innerHTML = `<div class="gallery-grid">${html}</div>`;
}

function renderListView(items) {
  const rows = items
    .map((file) => {
      const isStaging = file.status === "staging";
      const isPendingDelete = file.status === "pending_delete";
      const statusMeta = getStatusBadgeMeta(file.status);
      const selected = state.selectedPaths.has(file.path);
      const safePath = escapeHtml(file.path);

      return `
        <div class="list-row" data-path="${safePath}">
          <div>
            <button type="button" class="card-select-btn ${selected ? "checked" : ""}" style="position: static;" data-select="${safePath}">${selected ? icon("check") : ""}</button>
          </div>
          <div class="list-thumb" data-detail="${safePath}">
            ${renderFileVisual(file, { playsinline: false })}
          </div>
          <div class="list-name-cell" data-detail="${safePath}" title="${safePath}">${escapeHtml(file.name)}</div>
          <div class="list-sub-cell" title="${escapeHtml(file.dir || "/")}">${escapeHtml(file.dir || "/")}</div>
          <div><span class="channel-tag ${statusMeta.cls}">${escapeHtml(statusMeta.fullText)}</span></div>
          <div class="list-sub-cell">${formatBytes(file.size)}</div>
          <div class="list-sub-cell">${formatDate(file.updatedAt)}</div>
          <div class="list-actions-cell">
            <button type="button" class="mini-pill-btn copy-fmt-btn" data-path="${safePath}" data-fmt="url">URL</button>
            <button type="button" class="mini-pill-btn copy-fmt-btn" data-path="${safePath}" data-fmt="markdown">MD</button>
            ${
              isStaging
                ? `<button type="button" class="mini-pill-btn move-btn" data-path="${safePath}">${escapeHtml(tr("dash.move"))}</button>
                   <button type="button" class="mini-pill-btn danger delete-btn" data-path="${safePath}">${escapeHtml(tr("dash.delete"))}</button>`
                : isPendingDelete
                ? `<button type="button" class="mini-pill-btn" data-detail="${safePath}">${escapeHtml(tr("dash.detail"))}</button>
                   <button type="button" class="mini-pill-btn undo-delete-btn" data-path="${safePath}">${escapeHtml(tr("dash.undoDelete"))}</button>`
                : `<button type="button" class="mini-pill-btn" data-detail="${safePath}">${escapeHtml(tr("dash.detail"))}</button>
                   <button type="button" class="mini-pill-btn danger mark-delete-btn" data-path="${safePath}">${escapeHtml(tr("dash.delete"))}</button>`
            }
          </div>
        </div>
      `;
    })
    .join("");

  el.galleryContainer.innerHTML = `
    <div class="list-view-table">
      <div class="list-row list-head">
        <div></div>
        <div>${escapeHtml(tr("dash.colPreview"))}</div>
        <div>${escapeHtml(tr("dash.colName"))}</div>
        <div>${escapeHtml(tr("dash.colDir"))}</div>
        <div>${escapeHtml(tr("dash.colStatus"))}</div>
        <div>${escapeHtml(tr("dash.colSize"))}</div>
        <div>${escapeHtml(tr("dash.colDate"))}</div>
        <div>${escapeHtml(tr("dash.colActions"))}</div>
      </div>
      ${rows}
    </div>
  `;
}

function renderWaterfallView(items) {
  const width = window.innerWidth;
  const colCount = width >= 1200 ? 4 : width >= 768 ? 3 : 2;
  const cols = Array.from({ length: colCount }, () => []);
  items.forEach((item, idx) => cols[idx % colCount].push(item));

  const colsHtml = cols
    .map((colItems) => {
      const inner = colItems
        .map((file) => {
          const safePath = escapeHtml(file.path);
          return `
            <div class="waterfall-item" data-detail="${safePath}">
              ${renderFileVisual(file)}
              <div class="waterfall-overlay">
                <span class="wf-name" title="${safePath}">${escapeHtml(file.name)}</span>
                <div class="card-action-group">
                  <button type="button" class="card-act-btn copy-fmt-btn" data-path="${safePath}" data-fmt="url">URL</button>
                  <button type="button" class="card-act-btn copy-fmt-btn" data-path="${safePath}" data-fmt="markdown">MD</button>
                </div>
              </div>
            </div>
          `;
        })
        .join("");
      return `<div class="waterfall-col">${inner}</div>`;
    })
    .join("");

  el.galleryContainer.innerHTML = `<div class="waterfall-grid">${colsHtml}</div>`;
}

function bindGalleryEvents() {
  el.galleryContainer.querySelectorAll("[data-select]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const path = btn.dataset.select;
      if (state.selectedPaths.has(path)) state.selectedPaths.delete(path);
      else state.selectedPaths.add(path);
      renderDashboard();
    });
  });

  el.galleryContainer.querySelectorAll("[data-detail]").forEach((node) => {
    node.addEventListener("click", (e) => {
      const closestBtn = e.target.closest("button");
      if (closestBtn && closestBtn !== node) return;
      e.stopPropagation();
      const file = state.allFiles.find((f) => f.path === node.dataset.detail);
      if (file) openDetailModal(file);
    });
  });

  el.galleryContainer.querySelectorAll(".copy-fmt-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const file = state.allFiles.find((f) => f.path === btn.dataset.path);
      if (!file) return;
      const formats = buildLinkFormats(file);
      const fmt = btn.dataset.fmt || settings.defaultCopyFormat || "url";
      copyText(formats[fmt], fmt.toUpperCase());
    });
  });

  el.galleryContainer.querySelectorAll(".preview-lb-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const file = state.allFiles.find((f) => f.path === btn.dataset.path);
      if (file) openLightbox(file);
    });
  });

  el.galleryContainer.querySelectorAll(".move-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openMoveModal(btn.dataset.path);
    });
  });

  el.galleryContainer.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      confirmDelete(btn.dataset.path);
    });
  });

  el.galleryContainer.querySelectorAll(".mark-delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      confirmMarkPendingDelete(btn.dataset.path);
    });
  });

  el.galleryContainer.querySelectorAll(".undo-delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      undoPendingDelete(btn.dataset.path);
    });
  });
}

function renderPagination(totalPages) {
  if (totalPages <= 1) {
    el.paginationBar.style.display = "none";
    return;
  }
  el.paginationBar.style.display = "flex";

  const pages = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - state.page) <= 2) {
      pages.push(p);
    } else if (pages[pages.length - 1] !== "...") {
      pages.push("...");
    }
  }

  let html = `<button type="button" class="page-btn" id="pgPrev" ${state.page <= 1 ? "disabled" : ""}>${icon("chevronLeft")}</button>`;
  for (const p of pages) {
    if (p === "...") {
      html += `<span style="color: var(--text-placeholder); padding: 0 4px;">...</span>`;
    } else {
      html += `<button type="button" class="page-btn ${p === state.page ? "active" : ""}" data-page="${p}">${p}</button>`;
    }
  }
  html += `<button type="button" class="page-btn" id="pgNext" ${state.page >= totalPages ? "disabled" : ""}>${icon("chevronRight")}</button>`;
  html += `
    <div class="page-jump-wrap">
      <span>${escapeHtml(tr("page.summary", { total: totalPages }))}</span>
      <input type="number" id="pgJumpInput" class="page-jump-input" min="1" max="${totalPages}" value="${state.page}" />
      <button type="button" id="pgJumpBtn" class="page-jump-go">${escapeHtml(tr("page.go"))}</button>
    </div>
  `;

  el.paginationBar.innerHTML = html;

  el.paginationBar.querySelectorAll("[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.page = Number(btn.dataset.page);
      renderDashboard();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  const pgPrev = document.getElementById("pgPrev");
  const pgNext = document.getElementById("pgNext");
  const pgJumpBtn = document.getElementById("pgJumpBtn");
  const pgJumpInput = document.getElementById("pgJumpInput");

  if (pgPrev) pgPrev.addEventListener("click", () => { state.page--; renderDashboard(); });
  if (pgNext) pgNext.addEventListener("click", () => { state.page++; renderDashboard(); });
  if (pgJumpBtn && pgJumpInput) {
    pgJumpBtn.addEventListener("click", () => {
      const target = Math.min(totalPages, Math.max(1, Number(pgJumpInput.value) || 1));
      state.page = target;
      renderDashboard();
    });
  }
}

// ==================== SELECTION & BATCH DOCK ====================
function updateSelectAllButton(pageItems) {
  const allSelected = pageItems.length > 0 && pageItems.every((f) => state.selectedPaths.has(f.path));
  el.selectAllBtn.classList.toggle("checked", allSelected);
}

function updateBatchBar() {
  const count = state.selectedPaths.size;
  if (count === 0 || state.activeTab !== "dashboard") {
    el.batchBar.style.display = "none";
    return;
  }
  el.batchBar.style.display = "flex";
  el.batchCount.textContent = String(count);
  if (el.batchUndoDeleteBtn) {
    const hasPendingDelete = getSelectedFiles().some((f) => f.status === "pending_delete");
    el.batchUndoDeleteBtn.style.display = hasPendingDelete ? "inline-flex" : "none";
  }
}

function getSelectedFiles() {
  return state.allFiles.filter((f) => state.selectedPaths.has(f.path));
}

async function handleBatchDelete() {
  const selected = getSelectedFiles();
  const stagingTargets = selected.filter((f) => f.status === "staging");
  const archivedTargets = selected.filter((f) => f.status === "archived");

  if (stagingTargets.length === 0 && archivedTargets.length === 0) {
    showToast(tr("batch.noDeletable"), "warning");
    return;
  }
  if (
    !confirm(
      tr("batch.confirmDeleteMixed", {
        staging: stagingTargets.length,
        archived: archivedTargets.length,
      })
    )
  ) {
    return;
  }

  let stagingOk = 0;
  for (const item of stagingTargets) {
    try {
      const res = await authFetch("/api/blob/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: item.path }),
      });
      if (res.ok) {
        stagingOk++;
        state.selectedPaths.delete(item.path);
      }
    } catch {}
  }

  let archivedOk = 0;
  if (archivedTargets.length > 0) {
    try {
      const res = await authFetch("/api/archive/delete-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          paths: archivedTargets.map((f) => f.path),
        }),
      });
      const data = await parseJsonSafe(res);
      if (res.ok && data.ok) {
        archivedOk = archivedTargets.length;
        archivedTargets.forEach((f) => state.selectedPaths.delete(f.path));
      }
    } catch {}
  }

  const totalOk = stagingOk + archivedOk;
  showToast(
    tr("batch.deleteMixedDone", { staging: stagingOk, archived: archivedOk }),
    totalOk > 0 ? "success" : "error"
  );
  loadFiles();
}

async function handleBatchUndoDelete() {
  const targets = getSelectedFiles().filter((f) => f.status === "pending_delete");
  if (targets.length === 0) return;

  try {
    const res = await authFetch("/api/archive/delete-queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "remove",
        paths: targets.map((f) => f.path),
      }),
    });
    const data = await parseJsonSafe(res);
    if (res.ok && data.ok) {
      targets.forEach((f) => state.selectedPaths.delete(f.path));
      showToast(tr("batch.undoneDone", { count: targets.length }), "success");
      loadFiles();
    } else {
      showToast(data.error || "Batch undo failed", "error");
    }
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ==================== DETAIL MODAL & LIGHTBOX ====================
function openDetailModal(file) {
  state.detailFile = file;
  const isStaging = file.status === "staging";
  const isPendingDelete = file.status === "pending_delete";
  const isStatic = !isStaging;
  const statusMeta = getStatusBadgeMeta(file.status);
  const kind = getFileVisualKind(file);
  const formats = buildLinkFormats(file);
  const mimeType = inferMimeFromName(file.name);

  el.detailTitle.textContent = file.name;
  if (kind === "video") {
    el.detailPreviewWrap.innerHTML = `<video src="${escapeHtml(file.url)}" controls playsinline></video>`;
  } else if (kind === "audio") {
    el.detailPreviewWrap.innerHTML = `
      <div class="detail-audio-wrap">
        <img src="${getGenericCoverUrl("audio")}" alt="${escapeHtml(file.name)}" class="generic-file-cover detail-generic-cover" />
        <audio src="${escapeHtml(file.url)}" controls preload="metadata" class="detail-audio-player"></audio>
      </div>
    `;
  } else if (kind === "text" || kind === "archive") {
    el.detailPreviewWrap.innerHTML = `<img src="${getGenericCoverUrl(kind)}" alt="${escapeHtml(file.name)}" class="generic-file-cover detail-generic-cover" />`;
  } else {
    el.detailPreviewWrap.innerHTML = `<img src="${escapeHtml(file.url)}" alt="${escapeHtml(file.name)}" id="detailPreviewImg" />`;
  }

  el.detailMetaTable.innerHTML = `
    <div class="meta-row"><div class="meta-key">${escapeHtml(tr("detail.fileName"))}</div><div class="meta-val">${escapeHtml(file.name)}</div></div>
    <div class="meta-row"><div class="meta-key">${escapeHtml(tr("detail.fileType"))}</div><div class="meta-val">${escapeHtml(mimeType)}</div></div>
    <div class="meta-row"><div class="meta-key">${escapeHtml(tr("detail.fileSize"))}</div><div class="meta-val">${escapeHtml(formatBytes(file.size, 2))}</div></div>
    <div class="meta-row"><div class="meta-key">${escapeHtml(tr("detail.dimensions"))}</div><div class="meta-val" id="detailDimsVal">-</div></div>
    <div class="meta-row"><div class="meta-key">${escapeHtml(tr("detail.uploadedAt"))}</div><div class="meta-val">${escapeHtml(formatDateTimeFull(file.updatedAt))}</div></div>
    <div class="meta-row"><div class="meta-key">${escapeHtml(tr("detail.expiry"))}</div><div class="meta-val"><span class="channel-tag ${statusMeta.cls}">${escapeHtml(isPendingDelete ? tr("detail.expiryPendingDelete") : isStatic ? tr("detail.expiryPermanent") : tr("detail.expiryStaging"))}</span></div></div>
    <div class="meta-row"><div class="meta-key">${escapeHtml(tr("detail.channel"))}</div><div class="meta-val">${escapeHtml(isStatic ? tr("detail.channelStatic") : tr("detail.channelBlob"))}</div></div>
    <div class="meta-row"><div class="meta-key">${escapeHtml(tr("detail.folder"))}</div><div class="meta-val"><span class="meta-folder-link" id="detailFolderJump">${escapeHtml(file.dir || tr("detail.rootDir"))}</span></div></div>
  `;

  if (kind === "image") {
    const imgNode = document.getElementById("detailPreviewImg");
    const dimsNode = document.getElementById("detailDimsVal");
    if (imgNode) {
      imgNode.addEventListener("click", () => openLightbox(file));
      const updateDims = () => {
        if (imgNode.naturalWidth && imgNode.naturalHeight && dimsNode) {
          const w = imgNode.naturalWidth;
          const h = imgNode.naturalHeight;
          const orient =
            w > h ? tr("detail.orientLandscape") : h > w ? tr("detail.orientPortrait") : tr("detail.orientSquare");
          dimsNode.innerHTML = `<span>${w} × ${h}</span><span class="orient-badge">${escapeHtml(orient)}</span>`;
        }
      };
      if (imgNode.complete) updateDims();
      else imgNode.addEventListener("load", updateDims, { once: true });
    }
  }

  const folderJump = document.getElementById("detailFolderJump");
  if (folderJump) {
    folderJump.addEventListener("click", () => {
      state.currentFolder = file.dir || "";
      state.page = 1;
      closeModal(el.detailModal);
      renderDashboard();
    });
  }

  const linkDefs = [
    ["URL", formats.url],
    ["MarkDown", formats.markdown],
    ["HTML", formats.html],
    ["BBCode", formats.bbcode],
  ];

  el.detailLinksList.innerHTML = linkDefs
    .map(
      ([label, val]) => `
        <div class="detail-link-row">
          <span class="detail-link-badge">${label}</span>
          <input type="text" class="detail-link-input" readonly value="${escapeHtml(val)}" />
          <button type="button" class="mini-pill-btn detail-copy-btn" data-val="${escapeHtml(val)}" data-label="${label}">${escapeHtml(tr("detail.copy"))}</button>
        </div>
      `
    )
    .join("");

  el.detailLinksList.querySelectorAll(".detail-copy-btn").forEach((btn) => {
    btn.addEventListener("click", () => copyText(btn.dataset.val, btn.dataset.label));
  });

  el.detailFooter.innerHTML = isPendingDelete
    ? `<span style="font-size: 12px; color: #f87171; margin-right: auto; display: inline-flex; align-items: center; gap: 6px;">${icon("trash")} <span>${escapeHtml(tr("detail.pendingDeleteTip"))}</span></span>
       <button type="button" class="btn btn-secondary" id="detailUndoDelBtn">${escapeHtml(tr("dash.undoDelete"))}</button>
       <button type="button" class="btn btn-primary" id="detailCloseBtn">${escapeHtml(tr("detail.close"))}</button>`
    : isStatic
    ? `<span style="font-size: 12px; color: var(--text-secondary); margin-right: auto; display: inline-flex; align-items: center; gap: 6px;">${icon("shieldLock")} <span>${escapeHtml(tr("detail.readonlyTip"))}</span></span>
       <button type="button" class="btn btn-danger" id="detailMarkDelBtn">${escapeHtml(tr("dash.delete"))}</button>
       <button type="button" class="btn btn-secondary" id="detailCloseBtn">${escapeHtml(tr("detail.close"))}</button>`
    : `<button type="button" class="btn btn-secondary" id="detailMoveBtn">${escapeHtml(tr("dash.move"))}</button>
       <button type="button" class="btn btn-danger" id="detailDelBtn">${escapeHtml(tr("dash.delete"))}</button>
       <button type="button" class="btn btn-primary" id="detailCloseBtn">${escapeHtml(tr("detail.close"))}</button>`;

  document.getElementById("detailCloseBtn").addEventListener("click", () => closeModal(el.detailModal));
  const detailMoveBtn = document.getElementById("detailMoveBtn");
  const detailDelBtn = document.getElementById("detailDelBtn");
  const detailMarkDelBtn = document.getElementById("detailMarkDelBtn");
  const detailUndoDelBtn = document.getElementById("detailUndoDelBtn");
  if (detailMoveBtn) {
    detailMoveBtn.addEventListener("click", () => {
      closeModal(el.detailModal);
      openMoveModal(file.path);
    });
  }
  if (detailDelBtn) {
    detailDelBtn.addEventListener("click", () => {
      closeModal(el.detailModal);
      confirmDelete(file.path);
    });
  }
  if (detailMarkDelBtn) {
    detailMarkDelBtn.addEventListener("click", () => {
      closeModal(el.detailModal);
      confirmMarkPendingDelete(file.path);
    });
  }
  if (detailUndoDelBtn) {
    detailUndoDelBtn.addEventListener("click", () => {
      closeModal(el.detailModal);
      undoPendingDelete(file.path);
    });
  }

  openModal(el.detailModal);
}

function updateLightboxTransform() {
  el.lightboxImg.style.transform = `scale(${state.lbScale}) rotate(${state.lbRotate}deg)`;
}

function openLightbox(file) {
  const idx = state.lightboxList.findIndex((f) => f.path === file.path);
  state.lightboxIndex = idx >= 0 ? idx : 0;
  if (state.lightboxList.length === 0) state.lightboxList = [file];
  state.lbScale = 1;
  state.lbRotate = 0;
  el.lightboxImg.src = file.url;
  updateLightboxTransform();
  el.lightbox.style.display = "flex";
}

function stepLightbox(delta) {
  if (state.lightboxList.length === 0) return;
  state.lightboxIndex = (state.lightboxIndex + delta + state.lightboxList.length) % state.lightboxList.length;
  state.lbScale = 1;
  state.lbRotate = 0;
  el.lightboxImg.src = state.lightboxList[state.lightboxIndex].url;
  updateLightboxTransform();
}

// ==================== DUAL-CHANNEL UPLOAD (WORKBENCH + INLINE FOLDER UPLOAD) ====================
function isFileAllowed(file) {
  if (!settings.uploadFormatLimitEnabled) return true;
  const rawExt = (file.name.split(".").pop() || "").toLowerCase();
  const ext = rawExt === "jpeg" ? "jpg" : rawExt;
  const allowed = settings.allowedFormats || ALL_FORMATS;
  return allowed.includes(ext) || allowed.includes(rawExt);
}

function renderInlineDock() {
  if (state.inlineUploads.length === 0) {
    el.inlineUploadDock.style.display = "none";
    return;
  }
  el.inlineUploadDock.style.display = "block";
  const active = state.inlineUploads.some((x) => x.status === "uploading");
  el.inlineDockTitle.textContent = active
    ? tr("inline.uploading", { dir: state.currentFolder || "/" })
    : tr("inline.done");

  el.inlineDockList.innerHTML = state.inlineUploads
    .map((item) => {
      const fmtKey = settings.defaultCopyFormat || "url";
      const formats = item.status === "done" ? buildLinkFormats({ url: item.url, name: item.finalName, path: item.relPath }) : null;
      return `
        <div class="inline-dock-item">
          <div class="inline-dock-row">
            <span class="inline-dock-name" title="${escapeHtml(item.finalName)}">${escapeHtml(item.finalName)}</span>
            ${
              item.status === "done"
                ? `<button type="button" class="mini-pill-btn inline-copy-btn" data-val="${escapeHtml(formats[fmtKey])}" data-label="${fmtKey.toUpperCase()}">${icon("copy")} <span>${fmtKey.toUpperCase()}</span></button>`
                : item.status === "error"
                ? `<span style="color: var(--danger-color);">${escapeHtml(item.error)}</span>`
                : `<span>${item.progress}%</span>`
            }
          </div>
          ${
            item.status === "uploading"
              ? `<div class="upload-item-progress"><div class="upload-item-progress-inner" style="width:${item.progress}%"></div></div>`
              : ""
          }
        </div>
      `;
    })
    .join("");

  el.inlineDockList.querySelectorAll(".inline-copy-btn").forEach((btn) => {
    btn.addEventListener("click", () => copyText(btn.dataset.val, btn.dataset.label));
  });
}

function renderUploadQueue() {
  const total = state.uploadQueue.length;
  const success = state.uploadQueue.filter((q) => q.status === "done").length;
  const failed = state.uploadQueue.filter((q) => q.status === "error").length;
  const uploading = state.uploadQueue.some((q) => q.status === "uploading");

  el.qTotalCount.textContent = String(total);
  el.qSuccessCount.textContent = String(success);
  el.qFailCount.textContent = String(failed);
  el.retryFailedBtn.style.display = failed > 0 ? "inline-flex" : "none";

  el.dropzone.classList.toggle("upload-card-busy", total > 0);
  el.dropzone.classList.toggle("is-uploading", uploading);

  if (total === 0) {
    el.uploadQueueList.innerHTML = `<div class="upload-queue-empty">${escapeHtml(tr("upload.emptyQueue"))}</div>`;
    return;
  }

  el.uploadQueueList.innerHTML = state.uploadQueue
    .map((item) => {
      const isDone = item.status === "done";
      const isErr = item.status === "error";
      const formats = isDone ? buildLinkFormats({ url: item.url, name: item.finalName, path: item.relPath }) : null;
      const sizeText = item.compressed && item.finalSize < item.originalSize
        ? `${formatBytes(item.finalSize)} (${tr("upload.originalSize", { size: formatBytes(item.originalSize) })})`
        : formatBytes(item.finalSize || item.originalSize);

      return `
        <div class="upload-list-item">
          <div class="upload-list-item-preview">
            ${renderFileVisual({ name: item.finalName, url: item.previewUrl, mime: item.contentType }, { lazy: false })}
          </div>
          <div class="upload-list-item-content">
            <div class="upload-item-heading">
              <span class="upload-item-name" title="${escapeHtml(item.finalName)}">${escapeHtml(item.finalName)}</span>
              <span class="upload-badge">${escapeHtml(item.contentType)}</span>
              <span class="upload-badge ${item.compressed ? "compressed" : ""}">${escapeHtml(sizeText)}</span>
              ${item.duplicate ? `<span class="upload-badge duplicate">${escapeHtml(tr("upload.duplicateBadge"))}</span>` : ""}
              ${item.fallbackUsed ? `<span class="upload-badge fallback">${escapeHtml(tr("upload.avifFallbackTip"))}</span>` : ""}
              ${isErr ? `<span class="upload-badge error">${escapeHtml(item.error)}</span>` : ""}
            </div>
            ${
              !isDone && !isErr
                ? `<div class="upload-item-progress"><div class="upload-item-progress-inner" style="width: ${item.progress}%;"></div></div>`
                : ""
            }
            ${
              isDone && formats
                ? `
                  <div class="format-matrix">
                    <div class="format-cell q-copy" data-val="${escapeHtml(formats.url)}" data-label="URL"><span class="format-tag">URL</span><span class="format-val">${escapeHtml(formats.url)}</span></div>
                    <div class="format-cell q-copy" data-val="${escapeHtml(formats.markdown)}" data-label="MarkDown"><span class="format-tag">MD</span><span class="format-val">${escapeHtml(formats.markdown)}</span></div>
                    <div class="format-cell q-copy" data-val="${escapeHtml(formats.html)}" data-label="HTML"><span class="format-tag">HTML</span><span class="format-val">${escapeHtml(formats.html)}</span></div>
                    <div class="format-cell q-copy" data-val="${escapeHtml(formats.bbcode)}" data-label="BBCode"><span class="format-tag">BB</span><span class="format-val">${escapeHtml(formats.bbcode)}</span></div>
                  </div>
                `
                : ""
            }
          </div>
          <div class="upload-item-actions">
            ${
              isDone
                ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener" class="mini-pill-btn" style="text-decoration: none;">${icon("externalLink")} <span>${escapeHtml(tr("upload.open"))}</span></a>`
                : ""
            }
          </div>
        </div>
      `;
    })
    .join("");

  el.uploadQueueList.querySelectorAll(".q-copy").forEach((cell) => {
    cell.addEventListener("click", () => copyText(cell.dataset.val, cell.dataset.label));
  });
}

async function processSingleUploadItem(item, targetDir, customName, enableCompress, isSingle, onProgress) {
  item.status = "uploading";
  item.progress = 15;
  item.error = "";
  onProgress();

  try {
    let fileToSend = item.file;
    let contentType = inferMimeFromFile(item.file);
    let nameToSend =
      isSingle && customName
        ? customName
        : applyNamingRule(item.file.name, settings.namingMode || "original");

    if (enableCompress || settings.targetFormat !== "original") {
      try {
        const result = await compressImage(item.file, {
          targetFormat: settings.targetFormat,
          enableCompress,
          thresholdBytes: (Number(settings.compressThresholdMB) || 0) * 1024 * 1024,
          targetBytes: (Number(settings.compressTargetMB) || 0.95) * 1024 * 1024,
          maxDimension: Number(settings.maxDimension) || 2048,
        });
        fileToSend = result.blob;
        item.compressed = result.compressed;
        item.finalSize = result.finalSize;
        item.fallbackUsed = Boolean(result.fallbackUsed);
        const extMimeMap = { avif: "image/avif", webp: "image/webp" };
        if (extMimeMap[result.ext]) {
          contentType = extMimeMap[result.ext];
          const baseName = nameToSend.includes(".") ? nameToSend.replace(/\.[^.]+$/, "") : nameToSend;
          nameToSend = `${baseName}.${result.ext}`;
        }
      } catch (compErr) {
        console.warn("Compression failed, falling back to raw file:", compErr);
      }
    }

    if (settings.dedupEnabled && state.allFiles.length > 0) {
      const shortHash = await computeBlobShortSha256(fileToSend);
      if (shortHash) {
        const dup = state.allFiles.find((f) => f.sha256 && f.sha256 === shortHash);
        if (dup) {
          item.status = "done";
          item.progress = 100;
          item.duplicate = true;
          item.duplicateOf = dup.path;
          item.url = dup.url;
          item.relPath = dup.path;
          item.finalName = dup.name;
          item.finalSize = dup.size || fileToSend.size;
          item.contentType = inferMimeFromName(dup.name);
          onProgress();
          return;
        }
      }
    }

    item.finalName = nameToSend;
    item.contentType = contentType;
    item.progress = 35;
    onProgress();

    let uploadSuccess = false;
    let presignData = null;
    let putFailureReason = "";
    let finalUrl = "";
    let finalRelPath = "";

    try {
      const presignRes = await authFetch("/api/upload/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dir: targetDir,
          name: nameToSend,
          contentType,
          size: fileToSend.size,
          overwrite: false,
        }),
      });
      presignData = await parseJsonSafe(presignRes);
      if (presignRes.ok && presignData.ok && presignData.uploadUrl) {
        item.progress = 60;
        onProgress();
        try {
          const putRes = await fetch(presignData.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": contentType },
            body: fileToSend,
          });
          if (putRes.ok) {
            uploadSuccess = true;
            finalUrl = presignData.url;
            finalRelPath = presignData.path;
          } else {
            putFailureReason = `HTTP ${putRes.status}`;
          }
        } catch (putErr) {
          putFailureReason = putErr.message || "CORS/Network";
        }
      } else {
        putFailureReason = presignData?.error || `HTTP ${presignRes.status}`;
      }
    } catch (presignErr) {
      putFailureReason = presignErr.message || "Presign failed";
    }

    if (!uploadSuccess) {
      if (fileToSend.size <= 950 * 1024) {
        item.progress = 80;
        onProgress();
        const fallbackUrl = `/api/upload?dir=${encodeURIComponent(targetDir)}&name=${encodeURIComponent(nameToSend)}&overwrite=false`;
        const fallbackRes = await authFetch(fallbackUrl, {
          method: "POST",
          headers: { "Content-Type": contentType },
          body: fileToSend,
        });
        const fallbackData = await parseJsonSafe(fallbackRes);
        if (fallbackRes.ok && fallbackData.ok) {
          uploadSuccess = true;
          finalUrl = fallbackData.url;
          finalRelPath = fallbackData.path;
        } else {
          throw new Error(fallbackData.error || putFailureReason || "Upload failed");
        }
      } else {
        throw new Error(putFailureReason || "Direct upload failed (> 950 KB)");
      }
    }

    item.status = "done";
    item.progress = 100;
    item.url = finalUrl;
    item.relPath = finalRelPath;
    onProgress();
  } catch (err) {
    item.status = "error";
    item.error = err.message || "Error";
    onProgress();
    showToast(tr("upload.failed", { name: item.file.name, err: item.error }), "error");
  }
}

async function handleFileUpload(files, mode = "workbench") {
  if (!files || files.length === 0) return;

  const validFiles = [];
  for (const file of files) {
    if (!isFileAllowed(file)) {
      const ext = (file.name.split(".").pop() || "").toLowerCase();
      showToast(tr("upload.formatRejected", { name: file.name, ext }), "warning");
      continue;
    }
    validFiles.push(file);
  }
  if (validFiles.length === 0) return;

  const isInline = mode === "inline";
  const targetDir = isInline ? state.currentFolder : el.uploadFolderSelect.value;
  const customName = isInline ? "" : el.uploadCustomName.value.trim();
  const enableCompress = isInline ? settings.enableCompress : el.uploadCompressCheck.checked;

  const newItems = validFiles.map((file) => {
    const kind = getFileVisualKind(file);
    return {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      file,
      previewUrl: kind === "image" || kind === "video" ? URL.createObjectURL(file) : "",
      finalName: validFiles.length === 1 && customName ? customName : file.name,
      contentType: inferMimeFromFile(file),
      originalSize: file.size,
      finalSize: file.size,
      compressed: false,
      progress: 0,
      status: "uploading",
      error: "",
      url: "",
      relPath: "",
    };
  });

  const targetList = isInline ? state.inlineUploads : state.uploadQueue;
  targetList.unshift(...newItems);
  const redraw = isInline ? renderInlineDock : renderUploadQueue;
  redraw();

  for (const item of newItems) {
    await processSingleUploadItem(item, targetDir, customName, enableCompress, validFiles.length === 1, redraw);
  }

  if (!isInline) el.uploadCustomName.value = "";
  const dupCount = newItems.filter((x) => x.duplicate).length;
  const okCount = newItems.filter((x) => x.status === "done" && !x.duplicate).length;
  if (dupCount > 0) {
    showToast(tr("upload.duplicateSkipped", { count: dupCount }), "info");
  }
  if (okCount > 0) {
    showToast(tr("upload.successCount", { count: okCount }), "success");
    loadFiles();
  }
}

// ==================== SYSTEM SETTINGS & PURE SVG CHARTS ====================
function stopClock() {
  if (state.clockTimer) {
    clearInterval(state.clockTimer);
    state.clockTimer = null;
  }
}

function updateClockOnce() {
  const now = new Date();
  el.statusGreeting.textContent = getGreeting(lang(), now);
  el.statusHeroDate.textContent = now.toLocaleDateString(lang() === "en" ? "en-US" : "zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  el.statusClock.textContent = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Local";
  const offsetMin = -now.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const offsetHr = String(Math.floor(Math.abs(offsetMin) / 60));
  el.statusTimezone.textContent = `${tz} UTC${sign}${offsetHr}`;
}

function startClock() {
  stopClock();
  updateClockOnce();
  state.clockTimer = setInterval(updateClockOnce, 1000);
}

function renderDonutChart(container, entries, centerValue, centerLabel) {
  const total = entries.reduce((sum, e) => sum + e.value, 0);
  if (total === 0) {
    container.innerHTML = `<span style="color: var(--text-placeholder); font-size: 13px;">${escapeHtml(tr("status.noData"))}</span>`;
    return;
  }

  const r = 54;
  const cx = 70;
  const cy = 70;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  const circles = entries
    .map((e) => {
      const len = (e.value / total) * circ;
      const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${e.color}" stroke-width="18" stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})" />`;
      offset += len;
      return seg;
    })
    .join("");

  const legend = entries
    .map((e) => {
      const pct = Math.round((e.value / total) * 100);
      return `
        <div class="legend-row">
          <span class="legend-left"><span class="legend-dot" style="background:${e.color}"></span><span>${escapeHtml(e.label)}</span></span>
          <span class="legend-val">${e.value} (${pct}%)</span>
        </div>
      `;
    })
    .join("");

  container.innerHTML = `
    <div class="donut-layout">
      <svg width="140" height="140" viewBox="0 0 140 140" aria-hidden="true">
        ${circles}
        <text x="${cx}" y="${cy - 4}" text-anchor="middle" fill="var(--text-primary)" font-size="20" font-weight="700">${centerValue}</text>
        <text x="${cx}" y="${cy + 14}" text-anchor="middle" fill="var(--text-secondary)" font-size="10">${escapeHtml(centerLabel)}</text>
      </svg>
      <div class="donut-legend">${legend}</div>
    </div>
  `;
}

function renderTrendChart(container, files) {
  if (!files || files.length === 0) {
    container.innerHTML = `<span style="color: var(--text-placeholder); font-size: 13px;">${escapeHtml(tr("status.noData"))}</span>`;
    return;
  }

  const countsByDay = new Map();
  for (const f of files) {
    const day = formatDate(f.updatedAt);
    if (day && day !== "-") countsByDay.set(day, (countsByDay.get(day) || 0) + 1);
  }

  const days = Array.from(countsByDay.keys()).sort().slice(-10);
  if (days.length === 0) {
    container.innerHTML = `<span style="color: var(--text-placeholder); font-size: 13px;">${escapeHtml(tr("status.noData"))}</span>`;
    return;
  }

  const vals = days.map((d) => countsByDay.get(d));
  const maxVal = Math.max(...vals, 1);
  const w = 640;
  const h = 150;
  const padL = 32;
  const padR = 20;
  const padT = 18;
  const padB = 28;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  const pts = vals.map((v, idx) => {
    const x = days.length === 1 ? padL + innerW / 2 : padL + (idx / (days.length - 1)) * innerW;
    const y = padT + innerH - (v / maxVal) * innerH;
    return { x, y, v, label: days[idx].slice(5) };
  });

  const polyline = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const dots = pts
    .map(
      (p) => `
      <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#f97316" />
      <text x="${p.x.toFixed(1)}" y="${(p.y - 8).toFixed(1)}" text-anchor="middle" fill="var(--text-secondary)" font-size="10">${p.v}</text>
      <text x="${p.x.toFixed(1)}" y="${h - 6}" text-anchor="middle" fill="var(--text-secondary)" font-size="10">${p.label}</text>
    `
    )
    .join("");

  container.innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" style="width: 100%; max-height: 180px;">
      <line x1="${padL}" y1="${padT}" x2="${w - padR}" y2="${padT}" stroke="var(--border-light)" stroke-dasharray="3 3" />
      <line x1="${padL}" y1="${padT + innerH / 2}" x2="${w - padR}" y2="${padT + innerH / 2}" stroke="var(--border-light)" stroke-dasharray="3 3" />
      <line x1="${padL}" y1="${padT + innerH}" x2="${w - padR}" y2="${padT + innerH}" stroke="var(--border-light)" />
      ${pts.length > 1 ? `<polyline fill="none" stroke="#f97316" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${polyline}" />` : ""}
      ${dots}
    </svg>
  `;
}

function renderStatusPanel() {
  startClock();

  const total = state.allFiles.length;
  const archived = state.allFiles.filter((f) => f.status === "archived").length;
  const staging = state.allFiles.filter((f) => f.status === "staging").length;
  const pendingDelete = state.allFiles.filter((f) => f.status === "pending_delete").length;

  el.statusSummary.textContent = tr("status.summary", { total, archived, staging });
  el.statusTotalValue.textContent = String(total);
  el.statusIndexTime.textContent = state.manifestUpdatedAt ? formatDateTimeFull(state.manifestUpdatedAt) : "-";
  el.statusIndexRel.textContent = formatRelativeTime(lang(), state.manifestUpdatedAt);

  el.trendChartTitle.innerHTML = `${icon("activity")} <span>${escapeHtml(tr("status.trendTitle"))}</span>`;
  el.channelChartTitle.innerHTML = `${icon("layers")} <span>${escapeHtml(tr("status.channelDist"))}</span>`;
  el.formatChartTitle.innerHTML = `${icon("image")} <span>${escapeHtml(tr("status.formatDist"))}</span>`;

  renderTrendChart(el.trendChartBody, state.allFiles);
  renderDonutChart(
    el.channelChartBody,
    [
      { label: tr("status.archivedLabel"), value: archived, color: "#22c55e" },
      { label: tr("status.stagingLabel"), value: staging, color: "#f97316" },
      { label: tr("status.pendingDeleteLabel"), value: pendingDelete, color: "#ef4444" },
    ].filter((x) => x.value > 0),
    total,
    tr("status.totalFiles")
  );

  const fmtMap = new Map();
  for (const f of state.allFiles) {
    const ext = (f.name.split(".").pop() || "other").toLowerCase();
    fmtMap.set(ext, (fmtMap.get(ext) || 0) + 1);
  }
  const palette = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ec4899", "#06b6d4"];
  const fmtEntries = Array.from(fmtMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([ext, count], idx) => ({
      label: ext.toUpperCase(),
      value: count,
      color: palette[idx % palette.length],
    }));

  renderDonutChart(el.formatChartBody, fmtEntries, fmtEntries.length, tr("status.formatDist"));

  if (el.statusRecentList) {
    const recent = [...state.allFiles]
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
      .slice(0, 4);
    if (recent.length === 0) {
      el.statusRecentList.innerHTML = `<div style="font-size: 13px; color: var(--text-placeholder); padding: 8px 0;">${escapeHtml(tr("status.recentEmpty"))}</div>`;
    } else {
      el.statusRecentList.innerHTML = recent
        .map((file) => {
          const safePath = escapeHtml(file.path);
          const isArchived = file.status === "archived";
          return `
            <div class="status-recent-item">
              <div class="status-recent-thumb" data-recent-detail="${safePath}">
                ${renderFileVisual(file, { playsinline: false })}
              </div>
              <div class="status-recent-info" data-recent-detail="${safePath}">
                <div class="status-recent-name" title="${safePath}">${escapeHtml(file.name)}</div>
                <div class="status-recent-meta">
                  <span class="channel-tag ${isArchived ? "archived" : "staging"}">${escapeHtml(isArchived ? tr("dash.staticBadge") : tr("dash.blobBadge"))}</span>
                  <span>${escapeHtml(file.dir || "/")}</span>
                  <span>${escapeHtml(formatBytes(file.size))}</span>
                  <span>${escapeHtml(formatRelativeTime(lang(), file.updatedAt))}</span>
                </div>
              </div>
              <div class="status-recent-actions">
                <button type="button" class="mini-pill-btn recent-copy-btn" data-path="${safePath}" data-fmt="url">URL</button>
                <button type="button" class="mini-pill-btn recent-copy-btn" data-path="${safePath}" data-fmt="markdown">MD</button>
              </div>
            </div>
          `;
        })
        .join("");

      el.statusRecentList.querySelectorAll("[data-recent-detail]").forEach((node) => {
        node.addEventListener("click", () => {
          const file = state.allFiles.find((f) => f.path === node.dataset.recentDetail);
          if (file) openDetailModal(file);
        });
      });
      el.statusRecentList.querySelectorAll(".recent-copy-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const file = state.allFiles.find((f) => f.path === btn.dataset.path);
          if (!file) return;
          const formats = buildLinkFormats(file);
          const fmt = btn.dataset.fmt || "url";
          copyText(formats[fmt], fmt.toUpperCase());
        });
      });
    }
  }
}

function renderSettingsControls() {
  el.cfgFormatLimit.checked = settings.uploadFormatLimitEnabled;
  el.cfgLimitModeGroup.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === settings.formatLimitMode);
  });

  el.cfgAllowedFormats.innerHTML = ALL_FORMATS.map((fmt) => {
    const active = (settings.allowedFormats || []).includes(fmt);
    return `<button type="button" class="format-chip ${active ? "active" : ""}" data-fmt="${fmt}">${fmt}</button>`;
  }).join("");

  el.cfgAllowedFormats.querySelectorAll(".format-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const fmt = chip.dataset.fmt;
      const list = new Set(settings.allowedFormats || []);
      if (list.has(fmt)) list.delete(fmt);
      else list.add(fmt);
      settings.allowedFormats = Array.from(list);
      settings.formatLimitMode = "custom";
      renderSettingsControls();
    });
  });

  if (el.cfgTargetFormatGroup) {
    el.cfgTargetFormatGroup.querySelectorAll("[data-target-fmt]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.targetFmt === settings.targetFormat);
    });
  }
  el.cfgEnableCompress.checked = settings.enableCompress;
  el.cfgThresholdRange.value = settings.compressThresholdMB;
  el.cfgThresholdNum.value = settings.compressThresholdMB;
  el.cfgTargetRange.value = settings.compressTargetMB;
  el.cfgTargetNum.value = settings.compressTargetMB;
  el.cfgMaxDim.value = settings.maxDimension;

  if (el.cfgNamingModeGroup) {
    el.cfgNamingModeGroup.querySelectorAll("[data-naming-mode]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.namingMode === (settings.namingMode || "original"));
    });
  }
  if (el.cfgDefaultFolder) el.cfgDefaultFolder.value = settings.defaultUploadFolder || "";
  if (el.cfgQuickFolders) el.cfgQuickFolders.value = settings.quickFolders || "";
  if (el.cfgDedupEnabled) el.cfgDedupEnabled.checked = settings.dedupEnabled !== false;
  if (el.cfgApiSnippetBox) {
    const origin = window.location.origin;
    el.cfgApiSnippetBox.textContent = JSON.stringify(
      {
        url: `${origin}/api/upload?dir=blog`,
        paramName: "file",
        jsonPath: "url",
        customHeader: { Authorization: "Bearer <YOUR_API_TOKEN>" },
      },
      null,
      2
    );
  }

  el.cfgWallpaper.checked = settings.wallpaper;
  el.cfgThemeGroup.querySelectorAll("[data-theme-val]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.themeVal === settings.themeMode);
  });
  el.cfgLangGroup.querySelectorAll("[data-lang-val]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.langVal === lang());
  });
  el.cfgDefaultTab.value = settings.defaultTab || "dashboard";
  el.cfgPageSize.value = String(settings.pageSize || 24);
  el.cfgCopyFmt.value = settings.defaultCopyFormat || "url";
}

function renderSettingsPanels() {
  el.settingsStatusPanel.style.display = state.settingsSubTab === "status" ? "block" : "none";
  el.settingsUploadPanel.style.display = state.settingsSubTab === "upload-config" ? "block" : "none";
  el.settingsWebPanel.style.display = state.settingsSubTab === "web-config" ? "block" : "none";

  el.settingsSidebar.querySelectorAll("[data-subtab]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.subtab === state.settingsSubTab);
  });

  if (state.settingsSubTab === "status") {
    renderStatusPanel();
  } else {
    stopClock();
    renderSettingsControls();
  }
}

// ==================== FOLDER / MOVE / DELETE ACTIONS ====================
function updateFolderDropdowns() {
  let options = `<option value="">${escapeHtml(tr("upload.rootOption"))}</option>`;
  for (const f of state.allFolders) {
    options += `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`;
  }
  if (el.uploadFolderSelect) el.uploadFolderSelect.innerHTML = options;
  if (el.moveToFolderSelect) el.moveToFolderSelect.innerHTML = options;
  if (state.currentFolder && el.uploadFolderSelect) {
    el.uploadFolderSelect.value = state.currentFolder;
  }
}

function openModal(modal) { modal.style.display = "flex"; }
function closeModal(modal) { modal.style.display = "none"; }

function openMoveModal(path) {
  state.movingFile = path;
  el.moveFromPath.textContent = path;
  const parts = path.split("/");
  const oldName = parts.pop();
  const oldDir = parts.join("/");
  el.moveToFolderSelect.value = oldDir;
  el.moveToNameInput.value = oldName;
  openModal(el.moveModal);
}

async function handleMoveSubmit(e) {
  e.preventDefault();
  if (!state.movingFile) return;
  const toDir = el.moveToFolderSelect.value;
  const toName = el.moveToNameInput.value.trim();

  try {
    const res = await authFetch("/api/blob/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromPath: state.movingFile,
        toDir,
        toName,
        overwrite: false,
      }),
    });
    const data = await parseJsonSafe(res);
    if (res.ok && data.ok) {
      closeModal(el.moveModal);
      showToast(tr("modal.moveSuccess"), "success");
      loadFiles();
    } else {
      showToast(data.error || "Move failed", "error");
    }
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function confirmDelete(path) {
  if (!confirm(tr("modal.confirmDeleteFile", { path }))) return;
  try {
    const res = await authFetch("/api/blob/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    const data = await parseJsonSafe(res);
    if (res.ok && data.ok) {
      state.selectedPaths.delete(path);
      showToast(tr("modal.fileDeleted"), "success");
      loadFiles();
    } else {
      showToast(data.error || "Delete failed", "error");
    }
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function confirmMarkPendingDelete(path) {
  if (!confirm(tr("modal.confirmMarkDelete", { path }))) return;
  try {
    const res = await authFetch("/api/archive/delete-queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", paths: [path] }),
    });
    const data = await parseJsonSafe(res);
    if (res.ok && data.ok) {
      state.selectedPaths.delete(path);
      showToast(tr("modal.markedDelete"), "success");
      loadFiles();
    } else {
      showToast(data.error || "Failed to mark pending delete", "error");
    }
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function undoPendingDelete(path) {
  try {
    const res = await authFetch("/api/archive/delete-queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove", paths: [path] }),
    });
    const data = await parseJsonSafe(res);
    if (res.ok && data.ok) {
      showToast(tr("modal.undoneDelete"), "success");
      loadFiles();
    } else {
      showToast(data.error || "Failed to undo delete", "error");
    }
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function handleCreateFolder(e) {
  e.preventDefault();
  const dirName = el.folderNameInput.value.trim();
  if (!dirName) return;

  const targetPath = state.currentFolder && !dirName.includes("/")
    ? `${state.currentFolder}/${dirName}`
    : dirName;

  try {
    const res = await authFetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dir: targetPath }),
    });
    const data = await parseJsonSafe(res);
    if (res.ok && data.ok) {
      closeModal(el.folderModal);
      el.folderNameInput.value = "";
      state.currentFolder = targetPath.replace(/^\/+|\/+$/g, "");
      showToast(tr("modal.folderCreated", { dir: state.currentFolder }), "success");
      loadFiles();
    } else {
      showToast(data.error || "Create folder failed", "error");
    }
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function handleDeleteEmptyFolder() {
  if (!state.currentFolder) return;
  if (!confirm(tr("modal.confirmDeleteFolder", { dir: state.currentFolder }))) return;
  try {
    const res = await authFetch(`/api/folders?dir=${encodeURIComponent(state.currentFolder)}`, {
      method: "DELETE",
    });
    const data = await parseJsonSafe(res);
    if (res.ok && data.ok) {
      const parts = state.currentFolder.split("/");
      parts.pop();
      state.currentFolder = parts.join("/");
      showToast(tr("modal.folderDeleted"), "success");
      loadFiles();
    } else {
      showToast(data.error || "Delete folder failed", "error");
    }
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ==================== EVENT SETUP ====================
function setupEvents() {
  // Theme & Language Toggles
  [el.themeToggle, el.loginThemeToggle].forEach((btn) => {
    btn.addEventListener("click", () => {
      const isDark = document.documentElement.classList.contains("dark");
      applyTheme(isDark ? "light" : "dark");
    });
  });

  [el.langToggle, el.loginLangToggle].forEach((btn) => {
    btn.addEventListener("click", () => {
      settings.language = lang() === "zh" ? "en" : "zh";
      saveSettings();
      applyI18n();
    });
  });

  // Login Form
  el.loginForm.addEventListener("submit", handleLogin);
  el.togglePwdBtn.addEventListener("click", () => {
    const isPwd = el.loginPassword.type === "password";
    el.loginPassword.type = isPwd ? "text" : "password";
    el.togglePwdBtn.innerHTML = icon(isPwd ? "eyeOff" : "eye");
  });
  el.logoutBtn.addEventListener("click", handleLogout);

  // Page Switcher & Filter Dropdowns
  el.pageSwitcherCurrent.addEventListener("click", (e) => {
    e.stopPropagation();
    closeFilterDropdown();
    el.pageSwitcher.classList.toggle("is-open");
  });
  el.pageSwitcherMenu.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
  el.filterToggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    el.pageSwitcher.classList.remove("is-open");
    const open = el.filterDropdownWrap.classList.toggle("is-open");
    el.filterToggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
  });
  el.filterDropdownMenu.addEventListener("click", (e) => e.stopPropagation());
  el.filterDropdownMenu.querySelectorAll("[data-filter-channel]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ch = btn.dataset.filterChannel;
      setStatusFilter(state.statusFilter === ch ? "all" : ch);
    });
  });
  el.filterDropdownMenu.querySelectorAll("[data-filter-type]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tp = btn.dataset.filterType;
      setFileTypeFilter(state.fileTypeFilter === tp ? "all" : tp);
    });
  });
  el.clearFilterBtn.addEventListener("click", () => {
    clearAllFilters();
    closeFilterDropdown();
  });
  document.addEventListener("click", () => {
    el.pageSwitcher.classList.remove("is-open");
    closeFilterDropdown();
  });

  // Header Actions
  el.refreshBtn.addEventListener("click", () => {
    loadFiles();
    showToast(tr("header.refreshed"), "info");
  });

  // Search & Status Filter
  el.searchInput.addEventListener("input", (e) => {
    state.searchKeyword = e.target.value.trim();
    el.clearSearchBtn.style.display = state.searchKeyword ? "inline-flex" : "none";
    state.page = 1;
    renderDashboard();
  });
  el.clearSearchBtn.addEventListener("click", () => {
    el.searchInput.value = "";
    state.searchKeyword = "";
    el.clearSearchBtn.style.display = "none";
    state.page = 1;
    renderDashboard();
  });
  document.querySelectorAll("[data-status-pill]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.statusPill;
      setStatusFilter(state.statusFilter === target && target !== "all" ? "all" : target);
    });
  });
  syncFilterUI();

  // View Mode & Sort
  el.viewModeGroup.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === state.viewMode);
    btn.addEventListener("click", () => {
      el.viewModeGroup.querySelectorAll("[data-mode]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.viewMode = btn.dataset.mode;
      localStorage.setItem("eo_view_mode", state.viewMode);
      renderDashboard();
    });
  });
  el.sortBtn.addEventListener("click", () => {
    const order = ["date_desc", "name_asc", "size_desc"];
    const sortMap = { date_desc: "dash.sortLatest", name_asc: "dash.sortName", size_desc: "dash.sortSize" };
    state.sortBy = order[(order.indexOf(state.sortBy) + 1) % order.length];
    el.sortLabel.textContent = tr(sortMap[state.sortBy]);
    renderDashboard();
  });

  // Select All & Batch Dock
  el.selectAllBtn.addEventListener("click", () => {
    const allMatching = getFilteredAndSortedFiles();
    const start = (state.page - 1) * state.pageSize;
    const pageItems = allMatching.slice(start, start + state.pageSize);
    const allSelected = pageItems.length > 0 && pageItems.every((f) => state.selectedPaths.has(f.path));
    pageItems.forEach((f) => {
      if (allSelected) state.selectedPaths.delete(f.path);
      else state.selectedPaths.add(f.path);
    });
    renderDashboard();
  });
  el.batchCopyUrlBtn.addEventListener("click", () => copyText(getSelectedFiles().map((f) => f.url).join("\n"), "URL"));
  el.batchCopyMdBtn.addEventListener("click", () => copyText(getSelectedFiles().map((f) => buildLinkFormats(f).markdown).join("\n"), "Markdown"));
  el.batchCopyHtmlBtn.addEventListener("click", () => copyText(getSelectedFiles().map((f) => buildLinkFormats(f).html).join("\n"), "HTML"));
  el.batchDeleteBtn.addEventListener("click", handleBatchDelete);
  if (el.batchUndoDeleteBtn) el.batchUndoDeleteBtn.addEventListener("click", handleBatchUndoDelete);
  el.batchClearBtn.addEventListener("click", () => { state.selectedPaths.clear(); renderDashboard(); });

  // Direct Upload in Dashboard (no redirect!)
  el.directUploadBtn.addEventListener("click", () => el.directFileInput.click());
  el.directFileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileUpload(Array.from(e.target.files), "inline");
      e.target.value = "";
    }
  });
  el.inlineDockClose.addEventListener("click", () => {
    state.inlineUploads = [];
    renderInlineDock();
  });

  // Dashboard Drag & Drop (uploads directly to currentFolder!)
  ["dragenter", "dragover"].forEach((evt) => {
    el.dashboardView.addEventListener(evt, (e) => e.preventDefault());
  });
  el.dashboardView.addEventListener("drop", (e) => {
    e.preventDefault();
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
      handleFileUpload(Array.from(dt.files), "inline");
    }
  });

  // Folder & Move Forms
  [el.newFolderBtn, el.hubNewFolderBtn].forEach((btn) => {
    btn.addEventListener("click", () => {
      el.folderNameInput.value = "";
      openModal(el.folderModal);
      setTimeout(() => el.folderNameInput.focus(), 50);
    });
  });
  el.folderForm.addEventListener("submit", handleCreateFolder);
  el.deleteFolderBtn.addEventListener("click", handleDeleteEmptyFolder);
  el.moveForm.addEventListener("submit", handleMoveSubmit);

  // Upload Hub Dropzone
  el.dropzone.addEventListener("mousemove", (e) => {
    const rect = el.dropzone.getBoundingClientRect();
    el.uploadGlow.style.left = `${e.clientX - rect.left}px`;
    el.uploadGlow.style.top = `${e.clientY - rect.top}px`;
  });
  el.dropzone.addEventListener("click", () => el.fileInput.click());
  el.fileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileUpload(Array.from(e.target.files), "workbench");
      e.target.value = "";
    }
  });
  ["dragenter", "dragover"].forEach((evt) => {
    el.dropzone.addEventListener(evt, (e) => { e.preventDefault(); el.dropzone.classList.add("dragover"); });
  });
  ["dragleave", "drop"].forEach((evt) => {
    el.dropzone.addEventListener(evt, (e) => { e.preventDefault(); el.dropzone.classList.remove("dragover"); });
  });
  el.dropzone.addEventListener("drop", (e) => {
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
      handleFileUpload(Array.from(dt.files), "workbench");
    }
  });

  // Trigger GitHub Actions Archive
  el.triggerArchiveBtn?.addEventListener("click", () => triggerArchiveFlow(el.triggerArchiveBtn, "[data-i18n]"));
  el.uploadFolderSelect?.addEventListener("change", () => renderQuickFolders());

  // Maintenance Action Bar
  el.maintRefreshBtn?.addEventListener("click", () => {
    loadFiles();
    showToast(tr("header.refreshed"), "info");
  });
  el.maintArchiveBtn?.addEventListener("click", () => triggerArchiveFlow(el.maintArchiveBtn));
  el.maintDupScanBtn?.addEventListener("click", () => {
    const groups = new Map();
    for (const f of state.allFiles) {
      const key = f.sha256 ? `sha:${f.sha256}` : `meta:${f.size}:${f.name}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(f);
    }
    const dups = Array.from(groups.values()).filter((g) => g.length > 1);
    if (dups.length === 0) {
      showToast(tr("status.dupNone"), "success");
      return;
    }
    if (el.dupModalBody) {
      el.dupModalBody.innerHTML = dups
        .map((grp, idx) => {
          const rows = grp
            .map((item) => {
              const safeUrl = escapeHtml(item.url);
              return `
                <div class="dup-file-row">
                  <span title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</span>
                  <button type="button" class="mini-pill-btn dup-copy-btn" data-url="${safeUrl}">URL</button>
                </div>
              `;
            })
            .join("");
          return `
            <div class="dup-group-card">
              <div class="dup-group-head">${escapeHtml(tr("status.dupGroupLabel", { idx: idx + 1, count: grp.length, size: formatBytes(grp[0].size) }))}</div>
              ${rows}
            </div>
          `;
        })
        .join("");
      el.dupModalBody.querySelectorAll(".dup-copy-btn").forEach((btn) => {
        btn.addEventListener("click", () => copyText(btn.dataset.url, "URL"));
      });
    }
    showToast(tr("status.dupFound", { count: dups.length }), "warning");
    openModal(el.dupModal);
  });
  el.maintExportBtn?.addEventListener("click", () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      total: state.allFiles.length,
      files: state.allFiles,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `imgbed-manifest-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(tr("status.exportDone"), "success");
  });

  // Upload Queue Actions
  el.copyAllUrlsBtn.addEventListener("click", () => {
    const urls = state.uploadQueue.filter((q) => q.status === "done").map((q) => q.url);
    if (urls.length === 0) return showToast(tr("upload.noSuccessLinks"), "warning");
    copyText(urls.join("\n"), "URL");
  });
  el.copyAllMdBtn.addEventListener("click", () => {
    const mds = state.uploadQueue
      .filter((q) => q.status === "done")
      .map((q) => buildLinkFormats({ url: q.url, name: q.finalName, path: q.relPath, mime: q.contentType }).markdown);
    if (mds.length === 0) return showToast(tr("upload.noSuccessLinks"), "warning");
    copyText(mds.join("\n"), "Markdown");
  });
  el.retryFailedBtn.addEventListener("click", async () => {
    const failedItems = state.uploadQueue.filter((q) => q.status === "error");
    const targetDir = el.uploadFolderSelect.value;
    const enableCompress = el.uploadCompressCheck.checked;
    for (const item of failedItems) {
      await processSingleUploadItem(item, targetDir, "", enableCompress, false, renderUploadQueue);
    }
    loadFiles();
  });
  el.clearQueueBtn.addEventListener("click", () => { state.uploadQueue = []; renderUploadQueue(); });

  // Paste Upload (stays on dashboard if currently on dashboard!)
  window.addEventListener("paste", (e) => {
    if (!state.authenticated) return;
    if (document.activeElement && ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
    const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
    if (!items) return;
    const files = [];
    for (const item of items) {
      if (item.type.indexOf("image") === 0) {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      handleFileUpload(files, state.activeTab === "dashboard" ? "inline" : "workbench");
    }
  });

  // Settings Sidebar & Panels
  el.settingsSidebar.querySelectorAll("[data-subtab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.settingsSubTab = btn.dataset.subtab;
      renderSettingsPanels();
    });
  });
  el.settingsSidebarToggle.addEventListener("click", () => {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    el.settingsSidebar.classList.toggle("is-collapsed", state.sidebarCollapsed);
    el.settingsMain.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
  });
  el.statusTotalCard.addEventListener("click", () => {
    loadFiles();
    showToast(tr("header.refreshed"), "info");
  });

  // Upload Settings Form
  el.cfgLimitModeGroup.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      settings.formatLimitMode = btn.dataset.mode;
      if (settings.formatLimitMode === "common") settings.allowedFormats = [...COMMON_FORMATS];
      else if (settings.formatLimitMode === "all") settings.allowedFormats = [...ALL_FORMATS];
      renderSettingsControls();
    });
  });
  el.cfgThresholdRange.addEventListener("input", () => { el.cfgThresholdNum.value = el.cfgThresholdRange.value; });
  el.cfgThresholdNum.addEventListener("input", () => { el.cfgThresholdRange.value = el.cfgThresholdNum.value; });
  el.cfgTargetRange.addEventListener("input", () => { el.cfgTargetNum.value = el.cfgTargetRange.value; });
  el.cfgTargetNum.addEventListener("input", () => { el.cfgTargetRange.value = el.cfgTargetNum.value; });

  el.cfgTargetFormatGroup?.querySelectorAll("[data-target-fmt]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const val = btn.dataset.targetFmt;
      if (!val) return;
      settings.targetFormat = val;
      el.cfgTargetFormatGroup.querySelectorAll("[data-target-fmt]").forEach((b) => {
        b.classList.toggle("active", b === btn);
      });
    });
  });

  el.cfgNamingModeGroup?.querySelectorAll("[data-naming-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const val = btn.dataset.namingMode;
      if (!val) return;
      settings.namingMode = val;
      el.cfgNamingModeGroup.querySelectorAll("[data-naming-mode]").forEach((b) => {
        b.classList.toggle("active", b === btn);
      });
    });
  });

  el.cfgCopyPicgoBtn?.addEventListener("click", () => {
    if (el.cfgApiSnippetBox?.textContent) {
      copyText(el.cfgApiSnippetBox.textContent, "API_TOKEN");
    }
  });

  el.cfgSaveUploadBtn.addEventListener("click", () => {
    settings.uploadFormatLimitEnabled = el.cfgFormatLimit.checked;
    const activeFmtBtn = el.cfgTargetFormatGroup?.querySelector("[data-target-fmt].active");
    settings.targetFormat = activeFmtBtn?.dataset.targetFmt || settings.targetFormat || DEFAULT_SETTINGS.targetFormat;
    const activeNamingBtn = el.cfgNamingModeGroup?.querySelector("[data-naming-mode].active");
    settings.namingMode = activeNamingBtn?.dataset.namingMode || settings.namingMode || DEFAULT_SETTINGS.namingMode;
    settings.defaultUploadFolder = (el.cfgDefaultFolder?.value || "").trim().replace(/^\/+|\/+$/g, "");
    settings.quickFolders = (el.cfgQuickFolders?.value || "").trim();
    settings.dedupEnabled = el.cfgDedupEnabled ? el.cfgDedupEnabled.checked : true;
    delete settings.convertToWebp;
    settings.enableCompress = el.cfgEnableCompress.checked;
    settings.compressThresholdMB = Math.max(0, Number(el.cfgThresholdNum.value) || 0);
    settings.compressTargetMB = Math.max(0.1, Number(el.cfgTargetNum.value) || 0.95);
    settings.maxDimension = Math.min(4096, Math.max(512, Number(el.cfgMaxDim.value) || 2048));
    saveSettings();
    renderQuickFolders();
    showToast(tr("cfg.saved"), "success");
  });

  el.cfgResetUploadBtn.addEventListener("click", () => {
    settings.uploadFormatLimitEnabled = DEFAULT_SETTINGS.uploadFormatLimitEnabled;
    settings.formatLimitMode = DEFAULT_SETTINGS.formatLimitMode;
    settings.allowedFormats = [...COMMON_FORMATS];
    settings.targetFormat = DEFAULT_SETTINGS.targetFormat;
    settings.namingMode = DEFAULT_SETTINGS.namingMode;
    settings.defaultUploadFolder = DEFAULT_SETTINGS.defaultUploadFolder;
    settings.quickFolders = DEFAULT_SETTINGS.quickFolders;
    settings.dedupEnabled = DEFAULT_SETTINGS.dedupEnabled;
    delete settings.convertToWebp;
    settings.enableCompress = DEFAULT_SETTINGS.enableCompress;
    settings.compressThresholdMB = DEFAULT_SETTINGS.compressThresholdMB;
    settings.compressTargetMB = DEFAULT_SETTINGS.compressTargetMB;
    settings.maxDimension = DEFAULT_SETTINGS.maxDimension;
    saveSettings();
    renderSettingsControls();
    renderQuickFolders();
    showToast(tr("cfg.resetDone"), "info");
  });

  // Web Settings Instant Apply
  el.cfgWallpaper.addEventListener("change", () => applyWallpaper(el.cfgWallpaper.checked));
  el.cfgThemeGroup.querySelectorAll("[data-theme-val]").forEach((btn) => {
    btn.addEventListener("click", () => {
      applyTheme(btn.dataset.themeVal);
      renderSettingsControls();
    });
  });
  el.cfgLangGroup.querySelectorAll("[data-lang-val]").forEach((btn) => {
    btn.addEventListener("click", () => {
      settings.language = btn.dataset.langVal;
      saveSettings();
      applyI18n();
      renderSettingsControls();
    });
  });
  el.cfgDefaultTab.addEventListener("change", () => {
    settings.defaultTab = el.cfgDefaultTab.value;
    saveSettings();
    showToast(tr("cfg.saved"), "success");
  });
  el.cfgPageSize.addEventListener("change", () => {
    settings.pageSize = Number(el.cfgPageSize.value) || 24;
    state.pageSize = settings.pageSize;
    state.page = 1;
    saveSettings();
    showToast(tr("cfg.saved"), "success");
  });
  el.cfgCopyFmt.addEventListener("change", () => {
    settings.defaultCopyFormat = el.cfgCopyFmt.value;
    saveSettings();
    showToast(tr("cfg.saved"), "success");
  });

  // Modal Close + Backdrop Click
  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = document.getElementById(btn.dataset.close);
      if (target) closeModal(target);
    });
  });
  [el.detailModal, el.folderModal, el.moveModal, el.dupModal].filter(Boolean).forEach((m) => {
    m.addEventListener("click", (e) => {
      if (e.target === m) closeModal(m);
    });
  });

  // Lightbox Controls
  el.lbClose.addEventListener("click", () => { el.lightbox.style.display = "none"; el.lightboxImg.src = ""; });
  el.lbPrev.addEventListener("click", (e) => { e.stopPropagation(); stepLightbox(-1); });
  el.lbNext.addEventListener("click", (e) => { e.stopPropagation(); stepLightbox(1); });
  el.lbZoomIn.addEventListener("click", (e) => { e.stopPropagation(); state.lbScale = Math.min(3, state.lbScale + 0.25); updateLightboxTransform(); });
  el.lbZoomOut.addEventListener("click", (e) => { e.stopPropagation(); state.lbScale = Math.max(0.4, state.lbScale - 0.25); updateLightboxTransform(); });
  el.lbReset.addEventListener("click", (e) => { e.stopPropagation(); state.lbScale = 1; state.lbRotate = 0; updateLightboxTransform(); });
  el.lbRotateLeft.addEventListener("click", (e) => { e.stopPropagation(); state.lbRotate -= 90; updateLightboxTransform(); });
  el.lbRotateRight.addEventListener("click", (e) => { e.stopPropagation(); state.lbRotate += 90; updateLightboxTransform(); });
  el.lbCopyUrl.addEventListener("click", (e) => {
    e.stopPropagation();
    const cur = state.lightboxList[state.lightboxIndex];
    if (cur) copyText(cur.url, "URL");
  });
  el.lightbox.addEventListener("click", (e) => {
    if (e.target === el.lightbox || e.target.id === "lbStage") {
      el.lightbox.style.display = "none";
      el.lightboxImg.src = "";
    }
  });

  // Keyboard Shortcuts
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      el.pageSwitcher.classList.remove("is-open");
      closeFilterDropdown();
      if (el.lightbox.style.display === "flex") {
        el.lbClose.click();
        return;
      }
      [el.detailModal, el.folderModal, el.moveModal, el.dupModal].filter(Boolean).forEach((m) => {
        if (m.style.display === "flex") closeModal(m);
      });
    } else if (el.lightbox.style.display === "flex") {
      if (e.key === "ArrowLeft") stepLightbox(-1);
      else if (e.key === "ArrowRight") stepLightbox(1);
    }
  });
}

// Bootstrap
initStaticIcons();
applyTheme(settings.themeMode);
applyWallpaper(settings.wallpaper);
applyI18n();
setupEvents();
checkAuth();
