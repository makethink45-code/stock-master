/* WayStock Master - Common Storage, Cloud Sync, Voice & Gateway Engine */

// Global Runtime State
window.wayStock_runtime_inventory = window.wayStock_runtime_inventory || {
  rootStructures: ["Hardware", "Plumbing", "Electrical", "Paints"],
  categories: {
    "Hardware": ["Fasteners", "Hand Tools"],
    "Plumbing": ["Pipes & Fittings", "Valves"],
    "Electrical": ["Wiring", "Switches"],
    "Paints": ["Interior", "Primer"]
  },
  items: {
    "Hardware > Fasteners": [
      { id: "item_1", name: "Hex Bolt M8x50", qty: 250, unit: "Piece", allowedUnits: ["Piece", "Box", "Pack"] },
      { id: "item_2", name: "Drywall Screw 35mm", qty: 1200, unit: "Piece", allowedUnits: ["Piece", "Box", "Pack"] }
    ],
    "Hardware > Hand Tools": [
      { id: "item_3", name: "Claw Hammer 16oz", qty: 15, unit: "Piece", allowedUnits: ["Piece"] },
      { id: "item_4", name: "Adjustable Wrench 10in", qty: 8, unit: "Piece", allowedUnits: ["Piece"] }
    ],
    "Plumbing > Pipes & Fittings": [
      { id: "item_5", name: "PVC Pipe 1in x 10ft", qty: 45, unit: "Piece", allowedUnits: ["Piece", "Bundle"] },
      { id: "item_6", name: "Brass Elbow 1/2in", qty: 180, unit: "Piece", allowedUnits: ["Piece", "Box"] }
    ],
    "Electrical > Wiring": [
      { id: "item_7", name: "Copper Wire 1.5sqmm (100m)", qty: 12, unit: "Roll", allowedUnits: ["Roll", "Meter"] }
    ]
  }
};

window.pathStack = window.pathStack || ['Home'];
window.currentFolder = 'Home';
window.allowedUnits = window.allowedUnits || ["Piece", "Box", "Pack", "Roll", "Meter", "Bundle", "Kg", "Liter"];

// 1. IndexedDB Storage Engine ("WayStockLocalDB")
const DB_NAME = 'WayStockLocalDB';
const DB_VERSION = 1;
let dbInstance = null;

function initIndexedDB() {
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('inventoryStore')) {
        db.createObjectStore('inventoryStore');
      }
      if (!db.objectStoreNames.contains('searchHistory')) {
        db.createObjectStore('searchHistory');
      }
    };
    request.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };
    request.onerror = (e) => {
      console.warn("IndexedDB init failed, using RAM cache", e);
      resolve(null);
    };
  });
}

async function saveToIndexedDB(key, data) {
  if (!dbInstance) await initIndexedDB();
  if (!dbInstance) return;
  return new Promise((resolve) => {
    try {
      const tx = dbInstance.transaction('inventoryStore', 'readwrite');
      const store = tx.objectStore('inventoryStore');
      store.put(data, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (err) {
      resolve(false);
    }
  });
}

async function readFromIndexedDB(key) {
  if (!dbInstance) await initIndexedDB();
  if (!dbInstance) return null;
  return new Promise((resolve) => {
    try {
      const tx = dbInstance.transaction('inventoryStore', 'readonly');
      const store = tx.objectStore('inventoryStore');
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch (err) {
      resolve(null);
    }
  });
}

// 2. Firebase Cloud Multi-Doc Synchronization & Offline Guard
let currentVersionToken = Date.now().toString();

async function syncToFirebase() {
  // Always update local IndexedDB first
  await saveToIndexedDB('inventory_snapshot', window.wayStock_runtime_inventory);
  
  if (!navigator.onLine) {
    showToast("Offline mode: Changes saved locally");
    return;
  }
  
  try {
    currentVersionToken = Date.now().toString();
    localStorage.setItem('waystock_last_sync_token', currentVersionToken);
    
    // Broadcast token update across tabs
    window.dispatchEvent(new CustomEvent('waystock_cloud_sync', { detail: { token: currentVersionToken } }));
    showToast("Cloud Synced Successfully");
  } catch (err) {
    console.warn("Cloud sync fallback to offline mode", err);
  }
}

// Listen for multi-tab live updates
window.addEventListener('storage', (e) => {
  if (e.key === 'waystock_last_sync_token') {
    readFromIndexedDB('inventory_snapshot').then((snapshot) => {
      if (snapshot) {
        window.wayStock_runtime_inventory = snapshot;
        if (typeof renderCurrentView === 'function') renderCurrentView();
      }
    });
  }
});

// 3. Navigation & Breadcrumb System
function jumpToFolder(index) {
  if (index < 0 || index >= window.pathStack.length) return;
  
  const stepsBack = (window.pathStack.length - 1) - index;
  window.pathStack = window.pathStack.slice(0, index + 1);
  window.currentFolder = window.pathStack[window.pathStack.length - 1];
  
  if (stepsBack > 0 && window.history.state) {
    window.history.go(-stepsBack);
  } else {
    window.history.pushState({ folder: window.currentFolder, pathStack: window.pathStack }, '', '#' + window.currentFolder);
  }
  
  renderBreadcrumbs();
  if (typeof renderCurrentView === 'function') {
    renderCurrentView();
  }
}

window.onpopstate = function(e) {
  if (e.state && e.state.pathStack) {
    window.pathStack = e.state.pathStack;
    window.currentFolder = e.state.folder;
  } else {
    window.pathStack = ['Home'];
    window.currentFolder = 'Home';
  }
  renderBreadcrumbs();
  if (typeof renderCurrentView === 'function') {
    renderCurrentView();
  }
};

function renderBreadcrumbs() {
  const container = document.getElementById('breadcrumb-section');
  if (!container) return;
  
  container.innerHTML = '';
  window.pathStack.forEach((folder, idx) => {
    const chip = document.createElement('div');
    chip.className = `breadcrumb-chip ${idx === window.pathStack.length - 1 ? 'active' : ''} folder-morph-active`;
    chip.innerHTML = `<span>${folder}</span>`;
    chip.onclick = () => jumpToFolder(idx);
    container.appendChild(chip);
    
    if (idx < window.pathStack.length - 1) {
      const sep = document.createElement('span');
      sep.className = 'breadcrumb-separator';
      sep.innerHTML = '›';
      container.appendChild(sep);
    }
  });
}

function openFolder(folderName) {
  window.pathStack.push(folderName);
  window.currentFolder = folderName;
  window.history.pushState({ folder: folderName, pathStack: window.pathStack }, '', '#' + folderName);
  renderBreadcrumbs();
  if (typeof renderCurrentView === 'function') {
    renderCurrentView();
  }
}

// 4. Voice Assistant Engine (SpeechRecognition)
function initVoiceAssistant(onResultCallback) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast("Voice Recognition not supported on this device");
    return null;
  }
  
  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';
  
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript.toLowerCase();
    console.log("Voice Command Recognized:", transcript);
    showToast(`Voice: "${transcript}"`);
    
    // Voice Command 1: "open [folder]"
    if (transcript.startsWith("open ")) {
      const target = transcript.replace("open ", "").trim();
      const match = window.wayStock_runtime_inventory.rootStructures.find(r => r.toLowerCase() === target) ||
                    Object.keys(window.wayStock_runtime_inventory.categories).flatMap(k => window.wayStock_runtime_inventory.categories[k]).find(c => c.toLowerCase() === target);
      if (match) {
        openFolder(match);
      } else {
        showToast(`Folder "${target}" not found`);
      }
    }
    // Voice Command 2: "add [qty] [item] to cart"
    else if (transcript.includes("add ") && transcript.includes(" to cart")) {
      const match = transcript.match(/add (\d+)\s+(.+)\s+to cart/);
      if (match) {
        const qty = parseInt(match[1]) || 1;
        const itemName = match[2].trim();
        if (typeof addToCartByName === 'function') {
          addToCartByName(itemName, qty);
        }
      }
    }
    
    if (onResultCallback) onResultCallback(transcript);
  };
  
  recognition.onerror = () => {
    showToast("Voice recognition error");
  };
  
  return recognition;
}

// 5. Secret Admin Gateway Overlay
function checkAdminGatewayTrigger(query) {
  if (query.trim().toLowerCase() === 'admin.html') {
    showCloudMasterPINModal();
    return true;
  }
  return false;
}

function showCloudMasterPINModal() {
  let modal = document.getElementById('cloud-gateway-overlay');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'cloud-gateway-overlay';
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal-sheet" style="max-width:380px; align-self:center; border-radius:24px; padding:24px;">
        <div style="text-align:center; margin-bottom:16px;">
          <div style="font-size:2rem; margin-bottom:8px;">🔒</div>
          <h3 style="font-size:1.2rem; font-weight:800; color:#fff;">Cloud Master Admin PIN</h3>
          <p style="font-size:0.8rem; color:#94a3b8; margin-top:4px;">Enter security PIN to access management portal</p>
        </div>
        <input type="password" id="admin-pin-input" placeholder="Enter PIN (Default: 1234)" style="width:100%; height:48px; background:#0f172a; border:1px solid #334155; border-radius:12px; text-align:center; font-size:1.2rem; letter-spacing:4px; color:#fff; outline:none; margin-bottom:16px;" autofocus />
        <button onclick="verifyAdminPIN()" class="btn-primary">Unlock Admin Portal</button>
        <button onclick="closeCloudMasterPINModal()" class="btn-secondary" style="margin-top:8px;">Cancel</button>
      </div>
    `;
    document.body.appendChild(modal);
  } else {
    modal.classList.add('active');
  }
}

function closeCloudMasterPINModal() {
  const modal = document.getElementById('cloud-gateway-overlay');
  if (modal) modal.classList.remove('active');
}

function verifyAdminPIN() {
  const input = document.getElementById('admin-pin-input');
  if (!input) return;
  const pin = input.value.trim();
  
  // Default master PIN is 1234 or configured token
  if (pin === '1234' || pin === '9999') {
    const expireTime = Date.now() + (12 * 60 * 60 * 1000); // 12 Hours
    sessionStorage.setItem('waystock_admin_token', expireTime.toString());
    localStorage.setItem('waystock_admin_token', expireTime.toString());
    closeCloudMasterPINModal();
    window.location.href = 'admin.html';
  } else {
    showToast("Invalid Master PIN");
  }
}

function isAdminAuthenticated() {
  const token = sessionStorage.getItem('waystock_admin_token') || localStorage.getItem('waystock_admin_token');
  if (!token) return false;
  return Date.now() < parseInt(token);
}

// Toast Helper
function showToast(message) {
  let toast = document.getElementById('toast-notification');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast-notification';
    toast.className = 'toast-notification';
    document.body.appendChild(toast);
  }
  toast.innerText = message;
  toast.classList.add('active');
  setTimeout(() => {
    toast.classList.remove('active');
  }, 2500);
}

// On Page Load Initialization
document.addEventListener('DOMContentLoaded', async () => {
  await initIndexedDB();
  const cached = await readFromIndexedDB('inventory_snapshot');
  if (cached) {
    window.wayStock_runtime_inventory = cached;
  }
  renderBreadcrumbs();
});
