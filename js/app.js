// ═══════════════════════════════════════════════════════════════
//  Toolkit99 — app.js  v3
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
  WORKER_URL: "https://toolkit99-worker.anaschawdhary157.workers.dev",
  WA_NUMBER:  "+923081665602",
  WA_MSG:     "Hi! I'm interested in a Pro tool from Toolkit99.",
};

const NOTIF_LS_KEY = "tk99_notif_read";

// ── State ─────────────────────────────────────────────────────
let allTools     = [];
let allNotifs    = [];
let notifReadMap = {};
let filterMode   = "all";
let sortMode     = "newest";
let searchQuery  = "";
let notifFilter  = "all";
let fsDropOpen   = false;
let notifOpen    = false;

// ── DOM ───────────────────────────────────────────────────────
const acc                = document.getElementById("acc");
const searchInput        = document.getElementById("searchInput");
const searchResultChip   = document.getElementById("searchResultChip");
const notifBtn           = document.getElementById("notifBtn");
const notifDot           = document.getElementById("notifDot");
const notifModalBackdrop = document.getElementById("notifModalBackdrop");
const notifModal         = document.getElementById("notifModal");
const notifList          = document.getElementById("notifList");
const iframeOverlay      = document.getElementById("iframeOverlay");
const toolIframe         = document.getElementById("toolIframe");
const iframeTitleEl      = document.getElementById("iframeTitle");
const iframeUrlEl        = document.getElementById("iframeUrlEl");
const paidModal          = document.getElementById("paidModal");
const paidModalName      = document.getElementById("paidModalName");
const modalWaBtn         = document.getElementById("modalWaBtn");
const toastEl            = document.getElementById("toastEl");
const totalEl            = document.getElementById("statTotal");
const freeEl             = document.getElementById("statFree");
const paidEl             = document.getElementById("statPaid");
const pageLoader         = document.getElementById("pageLoader");
const filtersortWrap     = document.getElementById("filtersortWrap");
const filtersortBtn      = document.getElementById("filtersortBtn");
const filtersortDropdown = document.getElementById("filtersortDropdown");
const filtersortIcon     = document.getElementById("filtersortIcon");
const filtersortClose    = document.getElementById("filtersortClose");
const chipCountAll       = document.getElementById("chipCountAll");
const chipCountUnread    = document.getElementById("chipCountUnread");
const chipCountRead      = document.getElementById("chipCountRead");


// ══════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════
function timeAgo(ts) {
  const diff = Date.now() - ts;
  const s = Math.floor(diff/1000), m = Math.floor(s/60),
        h = Math.floor(m/60),      d = Math.floor(h/24);
  if (s<60)  return `${s}s ago`;
  if (m<60)  return `${m}min ago`;
  if (h<24)  { const rm=m%60; return rm?`${h}h ${rm}m ago`:`${h}h ago`; }
  const rh=h%24; return rh?`${d}d ${rh}h ago`:`${d}d ago`;
}
function exactDate(ts) {
  const d=new Date(ts);
  return d.toLocaleDateString("en-US",{month:"2-digit",day:"2-digit",year:"numeric"})
       +" "+d.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});
}
function addRipple(el,e) {
  const r=el.getBoundingClientRect(), size=Math.max(r.width,r.height);
  const x=(e.clientX??r.left+r.width/2)-r.left-size/2;
  const y=(e.clientY??r.top+r.height/2)-r.top-size/2;
  const rip=document.createElement("span");
  rip.className="ripple";
  rip.style.cssText=`width:${size}px;height:${size}px;left:${x}px;top:${y}px`;
  el.appendChild(rip);
  setTimeout(()=>rip.remove(),600);
}
function hideLoader() { pageLoader.classList.add("hidden"); }
function showToast(msg,dur=2500) {
  toastEl.textContent=msg; toastEl.classList.add("show");
  setTimeout(()=>toastEl.classList.remove("show"),dur);
}
function playSound(el) {
  if (!el) return;
  try { el.currentTime=0; el.play().catch(()=>{}); } catch {}
}

// ══════════════════════════════════════════════════════════════
//  NOTIF READ STATE — LocalStorage
// ══════════════════════════════════════════════════════════════
function loadReadMap() {
  try { const r=localStorage.getItem(NOTIF_LS_KEY); notifReadMap=r?JSON.parse(r):{}; }
  catch { notifReadMap={}; }
}
function saveReadMap() {
  try { localStorage.setItem(NOTIF_LS_KEY,JSON.stringify(notifReadMap)); } catch {}
}
function isRead(id) { return !!notifReadMap[String(id)]; }
function markRead(id) { notifReadMap[String(id)]=true; saveReadMap(); }
function markAllRead() { allNotifs.forEach(n=>{ notifReadMap[String(n.id)]=true; }); saveReadMap(); }

// ══════════════════════════════════════════════════════════════
//  FETCH
// ══════════════════════════════════════════════════════════════
async function fetchTools() {
  try {
    const res=await fetch(`${CONFIG.WORKER_URL}/api/tools`);
    const data=await res.json();
    if (!data.ok) throw new Error(data.error);
    allTools=data.tools;
    updateStats(); render();
  } catch(e) {
    acc.innerHTML=`
      <div class="empty-state">
        <i class="fa-solid fa-plug-circle-xmark"></i>
        <strong>Could not connect</strong>
        ${e.message||"Check your worker URL in CONFIG."}
      </div>`;
  } finally { hideLoader(); }
}

async function fetchNotifications() {
  try {
    const res=await fetch(`${CONFIG.WORKER_URL}/api/notifications`);
    const data=await res.json();
    allNotifs=data.ok?(data.notifications||[]):[];
  } catch { allNotifs=[]; }
  updateNotifDot();
  updateChipCounts();
}

// ══════════════════════════════════════════════════════════════
//  STATS
// ══════════════════════════════════════════════════════════════
function updateStats() {
  totalEl.textContent=allTools.length;
  freeEl.textContent =allTools.filter(t=>t.badge==="free").length;
  paidEl.textContent =allTools.filter(t=>t.badge==="paid").length;
}

// ══════════════════════════════════════════════════════════════
//  FILTER + SORT + SEARCH  (debounced render for performance)
// ══════════════════════════════════════════════════════════════
let renderTimer=null;
function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer=setTimeout(render,40);   // 40ms debounce — smooth at 1000 searches/sec
}

function getVisible() {
  let list=[...allTools];
  if (filterMode==="free") list=list.filter(t=>t.badge==="free");
  if (filterMode==="paid") list=list.filter(t=>t.badge==="paid");
  const q=searchQuery.trim().toLowerCase();
  if (q) list=list.filter(t=>
    t.name.toLowerCase().includes(q)||
    t.desc.toLowerCase().includes(q)||
    (t.tags||[]).some(tg=>tg.toLowerCase().includes(q))
  );
  if (sortMode==="newest") list.sort((a,b)=>b.createdAt-a.createdAt);
  if (sortMode==="oldest") list.sort((a,b)=>a.createdAt-b.createdAt);
  if (sortMode==="az")     list.sort((a,b)=>a.name.localeCompare(b.name));
  if (sortMode==="za")     list.sort((a,b)=>b.name.localeCompare(a.name));
  return list;
}

// ══════════════════════════════════════════════════════════════
//  CHANGE 5: inline search chip
// ══════════════════════════════════════════════════════════════
function updateSearchChip(count) {
  if (searchQuery.length>=1) {
    searchResultChip.textContent=`${count} found`;
    searchResultChip.style.display="";
  } else {
    searchResultChip.style.display="none";
  }
}

// ══════════════════════════════════════════════════════════════
//  RENDER — uses DocumentFragment for performance (no layout thrash)
// ══════════════════════════════════════════════════════════════
function render() {
  const visible=getVisible();
  updateSearchChip(visible.length);

  // Build fragment off-DOM
  const frag=document.createDocumentFragment();

  if (!visible.length) {
    const div=document.createElement("div");
    div.className="empty-state";
    const isSearching=searchQuery.trim().length>0;
    div.innerHTML=`
      <i class="fa-solid fa-${isSearching?"magnifying-glass":"toolbox"}"></i>
      <strong>${isSearching?"No results found":"No Tools Yet"}</strong>
      ${isSearching?"Try a different keyword.":"Tools will appear here once added."}`;
    frag.appendChild(div);
    acc.innerHTML=""; acc.appendChild(frag); return;
  }

  visible.forEach((tool,idx)=>{
    const item=document.createElement("div");
    item.className="acc-item";
    item.dataset.id=tool.id;
    // stagger delay capped at 8 items to avoid long waits on large lists
    item.style.animationDelay=`${Math.min(idx,8)*0.05}s`;

    const tagsHtml=(tool.tags||[])
      .map(tg=>`<span class="ac-tag"><i class="fa-solid fa-hashtag"></i>${tg}</span>`)
      .join("");

    item.innerHTML=`
      <div class="acc-head">
        <div class="acc-icon-box">${tool.icon}</div>
        <div class="acc-title">
          <div class="acc-name">${tool.name}</div>
          <div class="acc-time"><i class="fa-regular fa-clock"></i>${timeAgo(tool.createdAt)}</div>
        </div>
        <div class="acc-right">
          <span class="badge ${tool.badge}">${tool.badge==="paid"?"★ PRO":"FREE"}</span>
          <i class="fa-solid fa-chevron-down acc-chevron"></i>
        </div>
      </div>
      <div class="acc-body">
        <div class="acc-body-inner">
          <div class="acc-content">
            <p class="ac-desc">${tool.desc}</p>
            <div class="ac-meta-row">
              <div class="ac-date-full"><i class="fa-regular fa-calendar"></i>${exactDate(tool.createdAt)}</div>
            </div>
            ${tagsHtml?`<div class="ac-tags">${tagsHtml}</div>`:""}
            <button class="ac-launch-btn ${tool.badge==="paid"?"paid-btn":"free-btn"}"
              data-badge="${tool.badge}" data-url="${tool.url||""}" data-name="${tool.name}">
              <i class="fa-solid fa-${tool.badge==="paid"?"lock":"arrow-up-right-from-square"}"></i>
              ${tool.badge==="paid"?"Pro Access":"Launch Tool"}
            </button>
          </div>
        </div>
      </div>`;

    // head toggle
    item.querySelector(".acc-head").addEventListener("click",e=>{
      addRipple(item.querySelector(".acc-head"),e);
      const was=item.classList.contains("open");
      document.querySelectorAll(".acc-item.open").forEach(i=>i.classList.remove("open"));
      if (!was) item.classList.add("open");
    });

    // launch btn
    item.querySelector(".ac-launch-btn").addEventListener("click",e=>{
      e.stopPropagation();
      const btn=e.currentTarget;
      addRipple(btn,e);
      btn.dataset.badge==="paid"
        ? openPaidModal(btn.dataset.name)
        : (btn.dataset.url ? openIframe(btn.dataset.url,btn.dataset.name) : showToast("No URL configured."));
    });

    frag.appendChild(item);
  });

  acc.innerHTML="";
  acc.appendChild(frag);
}

// ══════════════════════════════════════════════════════════════
//  CHANGE 2: scroll → blur input + hide keyboard
// ══════════════════════════════════════════════════════════════
let scrollTimer=null;
window.addEventListener("scroll",()=>{
  clearTimeout(scrollTimer);
  scrollTimer=setTimeout(()=>{
    if (document.activeElement===searchInput) {
      searchInput.blur();
    }
  },50);
},{passive:true});

// ══════════════════════════════════════════════════════════════
//  SEARCH — debounced
// ══════════════════════════════════════════════════════════════
searchInput.addEventListener("input",e=>{
  searchQuery=e.target.value;
  scheduleRender();
});

// ══════════════════════════════════════════════════════════════
//  FILTERSORT DROPDOWN — genie effect
// ══════════════════════════════════════════════════════════════
function setFsOpen(open) {
  if (open===fsDropOpen) return;
  fsDropOpen=open;
  filtersortIcon.style.display =open?"none":"";
  filtersortClose.style.display=open?""  :"none";
  filtersortBtn.classList.toggle("open",open);

  // remove opposite animation class first
  filtersortDropdown.classList.remove("genie-drop-open","genie-drop-close");
  // force reflow
  void filtersortDropdown.offsetWidth;
  filtersortDropdown.classList.add(open?"genie-drop-open":"genie-drop-close");
}

filtersortBtn.addEventListener("click",e=>{
  e.stopPropagation();
  addRipple(filtersortBtn,e);
  setFsOpen(!fsDropOpen);
});

document.querySelectorAll(".fsd-option").forEach(opt=>{
  opt.addEventListener("click",e=>{
    e.stopPropagation();
    addRipple(opt,e);
    const type=opt.dataset.fsdType, val=opt.dataset.value;
    if (type==="filter") {
      document.querySelectorAll(".fsd-option[data-fsd-type='filter']").forEach(o=>o.classList.remove("active"));
      opt.classList.add("active"); filterMode=val;
      document.querySelectorAll(".tb-tab").forEach(t=>t.classList.toggle("active",t.dataset.filter===val));
    }
    if (type==="sort") {
      document.querySelectorAll(".fsd-option[data-fsd-type='sort']").forEach(o=>o.classList.remove("active"));
      opt.classList.add("active"); sortMode=val;
    }
    filtersortBtn.classList.toggle("has-active",filterMode!=="all"||sortMode!=="newest");
    scheduleRender();
  });
});

document.querySelectorAll(".tb-tab").forEach(tab=>{
  tab.addEventListener("click",()=>{
    document.querySelectorAll(".tb-tab").forEach(t=>t.classList.remove("active"));
    tab.classList.add("active"); filterMode=tab.dataset.filter;
    document.querySelectorAll(".fsd-option[data-fsd-type='filter']").forEach(o=>
      o.classList.toggle("active",o.dataset.value===filterMode));
    filtersortBtn.classList.toggle("has-active",filterMode!=="all"||sortMode!=="newest");
    scheduleRender();
  });
});

document.addEventListener("click",e=>{
  if (!filtersortWrap.contains(e.target)) setFsOpen(false);
});

// ══════════════════════════════════════════════════════════════
//  NOTIF DOT + CHIP COUNTS
// ══════════════════════════════════════════════════════════════
function updateNotifDot() {
  const unread=allNotifs.filter(n=>!isRead(n.id)).length;
  notifDot.textContent=unread>9?"9+":(unread||"");
  notifDot.style.display=unread?"flex":"none";
  notifBtn.classList.toggle("has-unread",unread>0);
}
function updateChipCounts() {
  const total=allNotifs.length;
  const unread=allNotifs.filter(n=>!isRead(n.id)).length;
  const read=total-unread;
  chipCountAll.textContent=total;
  chipCountUnread.textContent=unread;
  chipCountRead.textContent=read;
}

// ══════════════════════════════════════════════════════════════
//  NOTIF MODAL — smooth dropdown animation
// ══════════════════════════════════════════════════════════════
const iconMap={
  new:    {cls:"",       icon:"fa-solid fa-bolt"},
  info:   {cls:"info",   icon:"fa-solid fa-circle-info"},
  success:{cls:"success",icon:"fa-solid fa-circle-check"},
  warning:{cls:"warning",icon:"fa-solid fa-triangle-exclamation"},
};

function openNotifModal() {
  if (notifOpen) return;
  notifOpen = true;
  notifModalBackdrop.classList.remove("closing");
  notifModalBackdrop.classList.add("open");
  renderNotifList();
}

function closeNotifModal() {
  if (!notifOpen) return;
  notifOpen = false;
  notifModalBackdrop.classList.add("closing");
  notifModalBackdrop.classList.remove("open");
  // wait for CSS transition to finish then clean up
  notifModalBackdrop.addEventListener("transitionend", () => {
    notifModalBackdrop.classList.remove("closing");
  }, { once: true });
}

notifBtn.addEventListener("click",e=>{
  e.stopPropagation();
  addRipple(notifBtn,e);
  notifOpen ? closeNotifModal() : openNotifModal();
});

// Close button inside modal
document.getElementById("nmCloseBtn").addEventListener("click",closeNotifModal);

// Backdrop (outer) click → close
notifModalBackdrop.addEventListener("click",e=>{
  if (e.target === notifModalBackdrop) closeNotifModal();
});

// Escape key
document.addEventListener("keydown",e=>{
  if (e.key==="Escape") { closeNotifModal(); setFsOpen(false); }
});

// ══════════════════════════════════════════════════════════════
//  CHANGE 1: Notif chips with counts + filter
// ══════════════════════════════════════════════════════════════
function renderNotifList() {
  updateChipCounts();

  const items=allNotifs.filter(n=>{
    if (notifFilter==="unread") return !isRead(n.id);
    if (notifFilter==="read")   return  isRead(n.id);
    return true;
  });

  if (!items.length) {
    notifList.innerHTML=`
      <div class="nm-empty">
        <i class="fa-regular fa-bell-slash"></i>
        ${notifFilter==="unread"?"No unread notifications"
        :notifFilter==="read" ?"No read notifications"
        :"No notifications yet"}
      </div>`;
    return;
  }

  // Build with stagger delay
  notifList.innerHTML=items.map((n,i)=>{
    const ic=iconMap[n.type]||iconMap.info;
    const rd=isRead(n.id);
    return `
      <div class="nd-item ${rd?"":"unread"}" data-nid="${n.id}">
        <div class="nd-ic ${ic.cls}"><i class="${ic.icon}"></i></div>
        <div class="nd-body">
          <div class="nd-text">${n.text}</div>
          <div class="nd-time">${timeAgo(n.createdAt)}</div>
        </div>
      </div>`;
  }).join("");

  notifList.querySelectorAll(".nd-item").forEach(el=>{
    el.addEventListener("click",()=>{
      markRead(el.dataset.nid);
      el.classList.remove("unread");
      el.style.removeProperty("border-left");
      updateNotifDot();
      updateChipCounts();
      // re-render if on filtered tab
      if (notifFilter!=="all") renderNotifList();
    });
  });
}

// Notif chip tabs
document.querySelectorAll(".nm-chip").forEach(chip=>{
  chip.addEventListener("click",()=>{
    document.querySelectorAll(".nm-chip").forEach(c=>c.classList.remove("active"));
    chip.classList.add("active");
    notifFilter=chip.dataset.nfilter;
    renderNotifList();
  });
});

// Mark all read
document.getElementById("markAllBtn").addEventListener("click",()=>{
  markAllRead(); updateNotifDot(); renderNotifList();
});

// ══════════════════════════════════════════════════════════════
//  IFRAME
// ══════════════════════════════════════════════════════════════
function openIframe(url,name) {
  iframeTitleEl.textContent=name; iframeUrlEl.textContent=url;
  toolIframe.src=url; iframeOverlay.classList.add("show");
  history.pushState({iframeOpen:true},"");
}
function closeIframe() { iframeOverlay.classList.remove("show"); toolIframe.src=""; }
window.addEventListener("popstate",()=>{ if (iframeOverlay.classList.contains("show")) closeIframe(); });
document.getElementById("iframeBackBtn").addEventListener("click",()=>history.back());

// ══════════════════════════════════════════════════════════════
//  PAID MODAL
// ══════════════════════════════════════════════════════════════
function openWhatsApp(phone, message, newTab = false) {
  const msg = encodeURIComponent(message);

  const appUrl = `whatsapp://send?phone=${phone}&text=${msg}`;
  const webUrl = `https://wa.me/${phone}?text=${msg}`;

  const start = Date.now();

  // Try app (chooser)
  window.location.href = appUrl;

  // Fallback
  setTimeout(() => {
    if (Date.now() - start < 2000) {
      alert("WhatsApp not installed");

      if (newTab) {
        window.open(webUrl, "_blank");
      } else {
        window.location.href = webUrl;
      }
    }
  }, 1500);
}

function openPaidModal(name) {
  paidModalName.textContent = name;

  modalWaBtn.onclick = () => {
    openWhatsApp(
      CONFIG.WA_NUMBER,
      `Hi! I want access to Pro tool: ${name} (via Toolkit99)`,
      true // new tab
    );
  };

  paidModal.classList.add("show");
}

document.getElementById("modalCloseBtn").addEventListener("click",()=>paidModal.classList.remove("show"));
paidModal.addEventListener("click",e=>{ if (e.target===paidModal) paidModal.classList.remove("show"); });

// ══════════════════════════════════════════════════════════════
//  FLOAT WA
// ══════════════════════════════════════════════════════════════
document.getElementById("floatWa").addEventListener("click", function (e) {
  e.preventDefault();

  openWhatsApp(
    CONFIG.WA_NUMBER,
    CONFIG.WA_MSG
  );
}); ══════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════
loadReadMap();
fetchNotifications();
fetchTools();
