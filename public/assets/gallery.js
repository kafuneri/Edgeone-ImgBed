import { icon } from "./icons.js?v=1.5.0";

const TEXT = {
  zh: {
    title: "访客图库",
    searchPh: "搜索文件名或路径...",
    allDirs: "全部公开目录",
    count: (n) => `公开 ${n} 项`,
    disabled: "访客图库尚未开启。管理员可在环境变量中配置 PUBLIC_GALLERY_DIRS（如 wallpapers,photos）开放指定只读目录。",
    empty: "当前筛选条件下暂无公开内容",
    copyUrl: "复制链接",
    copied: "链接已复制",
    copyFail: "复制失败",
    adminTitle: "管理后台",
  },
  en: {
    title: "Visitor Gallery",
    searchPh: "Search name or path...",
    allDirs: "All Public Folders",
    count: (n) => `${n} public`,
    disabled: "Public gallery is disabled. Set PUBLIC_GALLERY_DIRS (e.g. wallpapers,photos) in environment variables to expose read-only folders.",
    empty: "No public files match your filter",
    copyUrl: "Copy URL",
    copied: "URL copied",
    copyFail: "Copy failed",
    adminTitle: "Admin Console",
  },
};

function loadPrefs() {
  try {
    const s = JSON.parse(localStorage.getItem("eo_settings") || "{}");
    return {
      lang: s.language === "en" ? "en" : "zh",
      theme: s.themeMode || localStorage.getItem("eo_theme") || "dark",
      wallpaper: s.wallpaper !== false,
    };
  } catch {
    return { lang: "zh", theme: "dark", wallpaper: true };
  }
}

const prefs = loadPrefs();
const state = {
  enabled: false,
  dirs: [],
  files: [],
  activeDir: "all",
  keyword: "",
  lbList: [],
  lbIdx: 0,
};

const el = {
  brandIcon: document.getElementById("galBrandIcon"),
  title: document.getElementById("galTitle"),
  searchIcon: document.getElementById("galSearchIcon"),
  searchInput: document.getElementById("galSearchInput"),
  themeBtn: document.getElementById("galThemeBtn"),
  langBtn: document.getElementById("galLangBtn"),
  adminLink: document.getElementById("galAdminLink"),
  dirPills: document.getElementById("galDirPills"),
  countPill: document.getElementById("galCountPill"),
  container: document.getElementById("galContainer"),
  toastContainer: document.getElementById("toastContainer"),
  lightbox: document.getElementById("galLightbox"),
  lbImg: document.getElementById("galLbImg"),
  lbClose: document.getElementById("galLbClose"),
  lbPrev: document.getElementById("galLbPrev"),
  lbNext: document.getElementById("galLbNext"),
  lbCopyUrl: document.getElementById("galLbCopyUrl"),
};

function tr(key, arg) {
  const val = TEXT[prefs.lang]?.[key] ?? TEXT.zh[key];
  return typeof val === "function" ? val(arg) : val;
}

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function applyTheme(mode) {
  prefs.theme = mode || "dark";
  let dark = true;
  if (prefs.theme === "light") dark = false;
  else if (prefs.theme === "auto") {
    dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  document.body.classList.toggle("wallpaper-active", prefs.wallpaper);
  localStorage.setItem("eo_theme", prefs.theme);
}

function showToast(msg, type = "info") {
  const item = document.createElement("div");
  item.className = `toast-item ${type}`;
  item.innerHTML = `<span class="toast-icon">${icon(type === "success" ? "checkCircle" : "info")}</span><span>${escapeHtml(msg)}</span>`;
  el.toastContainer.appendChild(item);
  setTimeout(() => {
    item.classList.add("is-leaving");
    setTimeout(() => item.remove(), 220);
  }, 2400);
}

async function copyUrl(url) {
  try {
    await navigator.clipboard.writeText(url);
    showToast(tr("copied"), "success");
  } catch {
    showToast(tr("copyFail"), "error");
  }
}

function isVideoName(name = "") {
  return /\.(mp4|mkv|webm)$/i.test(name);
}

function getCoverForFile(file) {
  const name = (file.name || "").toLowerCase();
  if (/\.(mp3|m4a|wav|ogg|flac)$/i.test(name)) return "/assets/file-audio.svg?v=1.5.0";
  if (/\.(txt|sh|md|json)$/i.test(name)) return "/assets/file-text.svg?v=1.5.0";
  if (/\.(zip|7z|rar|tar|gz)$/i.test(name)) return "/assets/file-archive.svg?v=1.5.0";
  return "";
}

function renderDirPills() {
  if (!state.enabled) {
    el.dirPills.innerHTML = "";
    return;
  }
  const dirList = ["all", ...state.dirs];
  el.dirPills.innerHTML = dirList
    .map((d) => {
      const active = state.activeDir === d ? "primary-pill" : "";
      const label = d === "all" ? tr("allDirs") : d;
      return `<button type="button" class="toolbar-pill-btn ${active}" data-dir="${escapeHtml(d)}">${escapeHtml(label)}</button>`;
    })
    .join("");

  el.dirPills.querySelectorAll("[data-dir]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.activeDir = btn.dataset.dir;
      renderDirPills();
      renderGallery();
    });
  });
}

function renderGallery() {
  el.title.textContent = tr("title");
  el.searchInput.placeholder = tr("searchPh");
  el.adminLink.title = tr("adminTitle");
  el.lbCopyUrl.innerHTML = `${icon("copy")} <span>${escapeHtml(tr("copyUrl"))}</span>`;

  if (!state.enabled) {
    el.countPill.textContent = tr("count", 0);
    el.container.innerHTML = `
      <div class="empty-state-box">
        <div class="empty-state-icon">${icon("lock")}</div>
        <div>${escapeHtml(tr("disabled"))}</div>
      </div>
    `;
    return;
  }

  const kw = state.keyword.toLowerCase();
  const filtered = state.files.filter((f) => {
    const matchDir =
      state.activeDir === "all" ||
      f.dir === state.activeDir ||
      f.dir.startsWith(`${state.activeDir}/`);
    const matchKw =
      !kw ||
      f.name.toLowerCase().includes(kw) ||
      f.path.toLowerCase().includes(kw);
    return matchDir && matchKw;
  });

  el.countPill.textContent = tr("count", filtered.length);
  state.lbList = filtered.filter((f) => !isVideoName(f.name) && !getCoverForFile(f));

  if (filtered.length === 0) {
    el.container.innerHTML = `
      <div class="empty-state-box">
        <div class="empty-state-icon">${icon("image")}</div>
        <div>${escapeHtml(tr("empty"))}</div>
      </div>
    `;
    return;
  }

  el.container.innerHTML = `<div class="gallery-grid">${filtered
    .map((f) => {
      const safeUrl = escapeHtml(f.url);
      const safeName = escapeHtml(f.name);
      const safePath = escapeHtml(f.path);
      const cover = getCoverForFile(f);
      const media = isVideoName(f.name)
        ? `<video src="${safeUrl}" preload="metadata" controls playsinline></video>`
        : `<img src="${cover || safeUrl}" alt="${safeName}" loading="lazy" />`;
      return `
        <div class="img-card" data-url="${safeUrl}">
          <div class="file-short-info">
            <span class="channel-tag archived">${escapeHtml(f.dir || "/")}</span>
          </div>
          <div class="img-card-media" data-open="${safePath}">
            ${media}
          </div>
          <div class="card-bottom-overlay">
            <div class="card-file-name" title="${safePath}">${safeName}</div>
            <div class="card-action-bar">
              <div class="card-action-group">
                <button type="button" class="card-act-btn gal-copy-btn" data-url="${safeUrl}">URL</button>
              </div>
            </div>
          </div>
        </div>
      `;
    })
    .join("")}</div>`;

  el.container.querySelectorAll(".gal-copy-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      copyUrl(btn.dataset.url);
    });
  });

  el.container.querySelectorAll("[data-open]").forEach((node) => {
    node.addEventListener("click", () => {
      const idx = state.lbList.findIndex((x) => x.path === node.dataset.open);
      if (idx >= 0) {
        state.lbIdx = idx;
        el.lbImg.src = state.lbList[idx].url;
        el.lightbox.style.display = "flex";
      }
    });
  });
}

function stepLb(delta) {
  if (state.lbList.length === 0) return;
  state.lbIdx = (state.lbIdx + delta + state.lbList.length) % state.lbList.length;
  el.lbImg.src = state.lbList[state.lbIdx].url;
}

async function init() {
  el.brandIcon.innerHTML = icon("image");
  el.searchIcon.innerHTML = icon("search");
  el.themeBtn.innerHTML = icon("themeContrast");
  el.langBtn.innerHTML = icon("globe");
  el.adminLink.innerHTML = icon("settings");
  el.lbClose.innerHTML = icon("x");
  el.lbPrev.innerHTML = icon("chevronLeft");
  el.lbNext.innerHTML = icon("chevronRight");

  applyTheme(prefs.theme);

  el.themeBtn.addEventListener("click", () => {
    const isDark = document.documentElement.classList.contains("dark");
    applyTheme(isDark ? "light" : "dark");
  });
  el.langBtn.addEventListener("click", () => {
    prefs.lang = prefs.lang === "zh" ? "en" : "zh";
    renderDirPills();
    renderGallery();
  });
  el.searchInput.addEventListener("input", (e) => {
    state.keyword = e.target.value.trim();
    renderGallery();
  });
  el.lbClose.addEventListener("click", () => {
    el.lightbox.style.display = "none";
    el.lbImg.src = "";
  });
  el.lbPrev.addEventListener("click", () => stepLb(-1));
  el.lbNext.addEventListener("click", () => stepLb(1));
  el.lbCopyUrl.addEventListener("click", () => {
    const cur = state.lbList[state.lbIdx];
    if (cur) copyUrl(cur.url);
  });
  el.lightbox.addEventListener("click", (e) => {
    if (e.target === el.lightbox || e.target.id === "galLbStage") {
      el.lightbox.style.display = "none";
      el.lbImg.src = "";
    }
  });

  try {
    const res = await fetch("/api/gallery");
    const data = await res.json();
    state.enabled = Boolean(data.enabled);
    state.dirs = Array.isArray(data.dirs) ? data.dirs : [];
    state.files = Array.isArray(data.files) ? data.files : [];
  } catch {
    state.enabled = false;
  }
  renderDirPills();
  renderGallery();
}

init();
