const searchBtn = document.getElementById('search-btn');
const searchSection = document.getElementById('search-section');
const breadcrumbSection = document.getElementById('breadcrumb-section');
const micBtn = document.getElementById('voice-search-btn');
const micOverlay = document.getElementById('mic-overlay');
const searchInput = document.getElementById('main-search-input');
window.pathStack = ['Home']; 
window.currentFolder = 'root';
window.isFolderNavigating = false;


const firebaseConfig = {
  apiKey: "AIzaSyBd83Jk5n7M2mkumtFT-t_zktD8Wz0cZnM",
  authDomain: "stockmaster-94534.firebaseapp.com",
  projectId: "stockmaster-94534",
  storageBucket: "stockmaster-94534.firebasestorage.app",
  messagingSenderId: "520506980567",
  appId: "1:520506980567:web:e5d7661a3866d18d979892"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

const stockCollectionRef = db.collection("stock");
const tokenRef = db.collection("appSettings").doc("versionControl");

const dbName = "WayStockLocalDB";
let localDBInstance = null;

// Global Memory State: RAM ke andar runtime memory me data rahega, LocalStorage me nahi jayega!
window.wayStock_runtime_inventory = {};

function initWayStockIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = (e) => {
            const database = e.target.result;
            if (!database.objectStoreNames.contains("inventoryStore")) {
                database.createObjectStore("inventoryStore", { keyPath: "id" });
            }
        };
        request.onsuccess = (e) => {
            localDBInstance = e.target.result;
            resolve(localDBInstance);
        };
        request.onerror = (e) => reject("IndexedDB Instance Error");
    });
}

// 🔑 ONLY ONE PLACE TO WRITE: Sirf IndexedDB me data jayega
function saveToIndexedDB(data) {
    if (!localDBInstance) return;
    const transaction = localDBInstance.transaction(["inventoryStore"], "readwrite");
    const store = transaction.objectStore("inventoryStore");
    store.put({ id: "current_stock", content: data });
    window.wayStock_runtime_inventory = data; // RAM update for instant loops
}

// 🔑 ONLY ONE PLACE TO READ: Sirf IndexedDB se data niklega
function readFromIndexedDB() {
    return new Promise((resolve) => {
        if (!localDBInstance) return resolve(null);
        const transaction = localDBInstance.transaction(["inventoryStore"], "readonly");
        const store = transaction.objectStore("inventoryStore");
        const request = store.get("current_stock");
        request.onsuccess = (e) => {
            const res = e.target.result ? e.target.result.content : null;
            if (res) window.wayStock_runtime_inventory = res; // Populate RAM state
            resolve(res);
        };
        request.onerror = () => resolve(null);
    });
}

// Helper utility to get inventory safely from RAM cache
function getActiveInventory() {
    return window.wayStock_runtime_inventory || {};
}

// ☁️ SMART MULTI-DOC SYNCHRONIZER
async function syncToFirebase() {
    const inventory = getActiveInventory(); // LocalStorage ki jagah RAM se uthaya
    try {
        const rootStructures = {};
        const segmentedDocs = {};

        Object.keys(inventory).forEach(key => {
            const item = inventory[key];
            if (item.parent === 'root') {
                rootStructures[key] = item;
                if (!segmentedDocs[key]) segmentedDocs[key] = {};
            } else {
                const rootParent = key.split('>')[0].trim();
                if (!segmentedDocs[rootParent]) segmentedDocs[rootParent] = {};
                segmentedDocs[rootParent][key] = item;
            }
        });

        await stockCollectionRef.doc("rootStructures").set(rootStructures);

        const uploadPromises = Object.keys(segmentedDocs).map(rootKey => {
            return stockCollectionRef.doc(`segment_${rootKey.replaceAll(" ", "_")}`).set(segmentedDocs[rootKey]);
        });
        await Promise.all(uploadPromises);

        const newToken = String(Date.now());
        await tokenRef.set({ token: newToken }, { merge: true });
        
        localStorage.setItem('wayStock_local_token', newToken); // Token stays in localStorage for light comparison
        saveToIndexedDB(inventory); // Direct single write to IndexedDB
        
        console.log(`🎯 Segmented Cloud Sync Complete. Data locked safely inside IndexedDB.`);
    } catch (e) {
        console.error("Multi-doc segment push failed:", e);
    }
}

// 📥 MULTI-DOC BATCH CONTEXT LOADER
async function loadFirebaseData() {
    try {
        await initWayStockIndexedDB();
        
        // LocalStorage completely bypassed here! Straight fetch from IndexedDB
        let cachedInventory = await readFromIndexedDB();
        if (cachedInventory) {
            if (typeof refreshUI === "function") refreshUI();
            console.log("📦 Loaded directly from local IndexedDB cache database.");
        }

        if (!navigator.onLine) return;

        const tokenSnapshot = await tokenRef.get();
        if (!tokenSnapshot.exists) {
            const initToken = String(Date.now());
            await tokenRef.set({ token: initToken }, { merge: true });
            localStorage.setItem('wayStock_local_token', initToken);
            return;
        }

        const cloudToken = String(tokenSnapshot.data().token);
        const localToken = String(localStorage.getItem('wayStock_local_token'));

        if (cloudToken === localToken && cachedInventory) {
            console.log(`🎯 Token Matched (${localToken}). Server download blocked!`);
            return;
        }

        console.log("🔄 Token mismatched. Pulling fresh segments into IndexedDB...");
        
        const rootSnapshot = await stockCollectionRef.doc("rootStructures").get();
        let freshFullInventory = {};

        if (rootSnapshot.exists) {
            freshFullInventory = rootSnapshot.data();
            const rootKeys = Object.keys(freshFullInventory);

            const segmentFetchPromises = rootKeys.map(rootKey => {
                return stockCollectionRef.doc(`segment_${rootKey.replaceAll(" ", "_")}`).get();
            });
            const segmentSnapshots = await Promise.all(segmentFetchPromises);

            segmentSnapshots.forEach(snap => {
                if (snap.exists) {
                    Object.assign(freshFullInventory, snap.data());
                }
            });

            // Clean save only to IndexedDB & RAM registry
            localStorage.setItem('wayStock_local_token', cloudToken);
            saveToIndexedDB(freshFullInventory);
            
            if (typeof refreshUI === "function") refreshUI();
        }
    } catch (e) {
        console.error("Segmented download compilation crashed:", e);
    }
}

// 🔄 MULTI-TAB LIVE RE-SYNC WATCHER
tokenRef.onSnapshot(async (doc) => {
    if (doc.exists && navigator.onLine) {
        const cloudToken = String(doc.data().token);
        const localToken = String(localStorage.getItem('wayStock_local_token'));
        
        if (cloudToken !== localToken) {
            console.log("⚡ Cloud mutation detected. Re-assembling segments into IndexedDB...");
            const rootSnapshot = await stockCollectionRef.doc("rootStructures").get();
            let freshFullInventory = {};

            if (rootSnapshot.exists) {
                freshFullInventory = rootSnapshot.data();
                const segmentFetchPromises = Object.keys(freshFullInventory).map(rootKey => {
                    return stockCollectionRef.doc(`segment_${rootKey.replaceAll(" ", "_")}`).get();
                });
                const segmentSnapshots = await Promise.all(segmentFetchPromises);
                segmentSnapshots.forEach(snap => {
                    if (snap.exists) Object.assign(freshFullInventory, snap.data());
                });

                localStorage.setItem('wayStock_local_token', cloudToken);
                saveToIndexedDB(freshFullInventory);
                if (typeof refreshUI === "function") refreshUI();
            }
        }
    }
});




// 🚀 ADMIN TOKEN INCREMENT GENERATOR
async function incrementCloudToken() {
    try {
        await db.runTransaction(async (transaction) => {
            const sfDoc = await transaction.get(tokenRef);
            let newToken = Date.now(); // Fallback timestamp configuration
            if (sfDoc.exists) {
                const currentToken = sfDoc.data().token || 0;
                newToken = isNaN(currentToken) ? Date.now() : currentToken + 1;
            }
            transaction.set(tokenRef, { token: newToken }, { merge: true });
        });
        console.log("⚡ Cloud database token validation rolled forward.");
    } catch (e) {
        console.error("Token rolling failed:", e);
    }
}


const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null; // Global variable define karein

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
        if (!searchInput) return;
        
        // Voice text capture format converting to clean phrase
        const transcript = event.results[0][0].transcript.trim().toLowerCase();
        searchInput.value = event.results[0][0].transcript; // Output raw text in input bar
        stopMic();

        // Upgraded clean reference:
const inventory = getActiveInventory();

        const allKeys = Object.keys(inventory);
// 1. COMMAND 1 BLOCK: "open [folder name]" area filter fix
if (transcript.startsWith('open ')) {
    const targetName = transcript.replace('open ', '').trim();
    const matchedKey = allKeys.find(key => inventory[key].name.toLowerCase() === targetName);
    
    if (matchedKey) {
        showAlert(`Opening folder: ${inventory[matchedKey].name} 📁`, "success");

        const suggestionContainer = document.getElementById('search-suggestion-chips');
        if (suggestionContainer) suggestionContainer.style.display = 'none'; 
        searchInput.value = ""; 
        
        // 🔑 FIXED: Global close functions activate karo directly, history.back() hataya
        document.getElementById('search-section')?.classList.remove('active');
        document.getElementById('breadcrumb-section')?.classList.remove('hidden');

        handleSuggestionClick(matchedKey); 
    } else {
        showAlert(`Folder "${targetName}" nahi mila!`, "error");
    }
    return;
}

// 2. COMMAND 2 BLOCK: "add [item name]" execution structure fix
if (transcript.startsWith('add ')) {
    let cleanPhrase = transcript.replace('add ', '').replace(' to cart', '').trim();
    let quantity = 1;

    const firstWord = cleanPhrase.split(' ')[0];
    if (!isNaN(firstWord)) {
        quantity = parseInt(firstWord, 10);
        cleanPhrase = cleanPhrase.replace(firstWord, '').trim(); 
    }

    const matchedKey = allKeys.find(key => inventory[key].name.toLowerCase() === cleanPhrase);

    if (matchedKey) {
        const cartKey = typeof getCartStorageKey === "function" ? getCartStorageKey() : 'wayStock_cart_guest';
        let cart = typeof getCartItems === "function" ? getCartItems() : {};
        const rootFolder = matchedKey.includes('>') ? matchedKey.split('>')[0].trim() : 'Home';

        if (!cart[matchedKey]) {
            cart[matchedKey] = {
                name: inventory[matchedKey].name,
                fullPath: matchedKey,
                rootFolder: rootFolder,
                quantity: quantity,
                unit: "Box"
            };
        } else {
            cart[matchedKey].quantity += quantity;
        }

        localStorage.setItem(cartKey, JSON.stringify(cart));
        showAlert(`✅ ${quantity} ${inventory[matchedKey].name} Bucket me add ho gaya!`, "success");
        
        searchInput.value = "";
        const suggestionContainer = document.getElementById('search-suggestion-chips');
        if (suggestionContainer) suggestionContainer.style.display = 'none';
        
        // 🔑 FIXED: Search overlay parameters clear loop safely embedded without history disruption
        document.getElementById('search-section')?.classList.remove('active');
        document.getElementById('breadcrumb-section')?.classList.remove('hidden');

        if (typeof updateCartBadgeCount === "function") updateCartBadgeCount();
        refreshUI();
    } else {
        showAlert(`Product "${cleanPhrase}" nahi mila!`, "error");
    }
    return;
}

        searchInput.dispatchEvent(new Event('input'));
    };

    recognition.onerror = () => stopMic();
    recognition.onend = () => stopMic();
}
else {
stopMic()
}

if (micBtn && recognition) {
    micBtn.addEventListener('click', () => {
        try {
            // Sirf start() call karein, overlay ko yahan touch na karein
            recognition.start();
        } catch (e) {
            showAlert("Mic system me problem he!", "error");
        }
    });

recognition.onstart = () => {
    micOverlay?.classList.add('active'); 
    micBtn.classList.add('recording'); 
    
    if (window.history.state?.overlay !== 'mic-overlay') {
        history.pushState({ overlay: 'mic-overlay' }, "");
    }
};


recognition.onerror = (event) => {
    micOverlay?.classList.remove('active');
    micBtn?.classList.remove('recording');

    if (event.error === 'not-allowed') {
        showAlert("Permission Nahi Mili! Settings me allow karein.", "error"); //
    } else {
        showAlert("Mic error: " + event.error, "error"); //
    }
};
}

function getEmptyStateHTML() {
    const isAdmin = typeof openActionModal === 'function';
    
    const buttonHTML = isAdmin 
        ? `<button class="add-inventory-fun-btn" onclick="openActionModal('folder')">Maal Bharo! 🚀</button>`
        : `<button class="add-inventory-fun-btn" onclick="openOverlay('cart')">Bucket Dekho! 🛒</button>`;

    return `
        <div class="empty-inventory-container">
            <div class="empty-animation">📦✨</div>
            <h2>Oho! Maal-Gadi Khali Hai</h2>
            <p>Lagta hai abhi tak koi stock nahi aaya. Chalo, kuch naya bharte hain!</p>
            ${buttonHTML}
        </div>
    `;
}




function generateCartPreview() {
    const cart = getCartItems();
    // Upgraded clean reference:
const inventory = getActiveInventory();

    const keys = Object.keys(cart);

    if (keys.length === 0) {
        showAlert("Preview ke liye bucket me maal hona zaroori hai! 🛒", "error");
        return;
    }

    // 1. Root folder ke hisab se grouping karna
    const groupedCart = {};
    keys.forEach(key => {
        const item = cart[key];
        const root = item.rootFolder || "Home";
        if (!groupedCart[root]) groupedCart[root] = [];
        groupedCart[root].push({ cartKey: key, ...item });
    });

    // 2. TARGET CHANGE: Ab Cart body me nahi, naye Preview section me data load hoga
    const previewContentArea = document.getElementById('preview-content-area');
    if (!previewContentArea) return;

    previewContentArea.innerHTML = ""; 
    // common.js ke andar is pure forEach loop block ko isse REPLACE karein:
// common.js ke andar is pure forEach loop block ko isse REPLACE karein:
Object.keys(groupedCart).forEach((rootName) => {
    const items = groupedCart[rootName]; //
    
    // --- HIGH-CONTRAST CLEAN SOBER DIMENSIONS ---
    const rowHeight = 40;       
    const headerHeight = 85;    
    const footerHeight = 40;    
    const canvasWidth = 450;    
    const canvasHeight = headerHeight + (items.length * rowHeight) + footerHeight;

    const canvas = document.createElement('canvas'); //
    canvas.width = canvasWidth; //
    canvas.height = canvasHeight; //
    const ctx = canvas.getContext('2d'); //

    // Pure Clean White Base
    ctx.fillStyle = "#ffffff"; //
    ctx.fillRect(0, 0, canvasWidth, canvasHeight); //

    // --- MINIMALIST TEXT HEADER ---
    // Title: Big, Bold & Dark Slate
    ctx.fillStyle = "#0f172a"; 
    ctx.font = "bold 20px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.fillText(rootName.toUpperCase(), 20, 38);

    // Metadata Sub-line: Date and Total Items Count
    ctx.fillStyle = "#64748b";
    ctx.font = "12px ui-monospace, monospace";
    const totalItemsText = "Total Items: " + items.length + "  |  " + new Date().toLocaleDateString('en-GB');
    ctx.fillText(totalItemsText, 20, 60);

    // Top Thick Divider Line (Sober Indicator)
    ctx.strokeStyle = "#0f172a"; 
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, 72);
    ctx.lineTo(canvasWidth - 20, 72);
    ctx.stroke();

    let currentY = headerHeight + 20;

    // Inside Loop: Rows Layout Design
    items.forEach((item, idx) => {
        let finalNameToShow = item.name; //
        const pathParts = item.cartKey.split('>'); //
        if (pathParts.length > 1) { //
            pathParts.pop(); //
            const parentKey = pathParts.join('>').trim(); //
            const parentData = inventory[parentKey]; //
            if (parentData && parentData.toggleOn === true) { //
                const parentName = parentData.name || parentKey.split('>').pop().trim(); //
                finalNameToShow = parentName + " " + item.name; //
            }
        }

        // Serial Number & Item Name Text
        ctx.textAlign = "left";
        ctx.fillStyle = "#1e293b"; 
        ctx.font = "500 14px ui-monospace, monospace";
        ctx.fillText((idx + 1) + ".  " + finalNameToShow, 20, currentY);

        // Unit Quantity Highlight (Pure Black Bold text)
        ctx.textAlign = "right";
        ctx.fillStyle = "#0f172a"; 
        ctx.font = "bold 15px ui-monospace, monospace";
        const qtyText = item.quantity + " " + (item.unit || "Box"); //
        ctx.fillText(qtyText, canvasWidth - 20, currentY); //

        // Minimal Light Row Separators
        ctx.strokeStyle = "#e2e8f0"; 
        ctx.lineWidth = 1; //
        ctx.beginPath(); //
        ctx.moveTo(20, currentY + 12); //
        ctx.lineTo(canvasWidth - 20, currentY + 12); //
        ctx.stroke(); //

        currentY += rowHeight; //
    });

    // --- CLEAN BASE FOOTER ---
    ctx.strokeStyle = "#94a3b8"; 
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, canvasHeight - 32);
    ctx.lineTo(canvasWidth - 20, canvasHeight - 32);
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillText("Generated via WayStock Master", 20, canvasHeight - 15);

    ctx.textAlign = "right";
    ctx.fillText(new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), canvasWidth - 20, canvasHeight - 15);

    const imgURL = canvas.toDataURL("image/png"); //

    // Preview Card Container Update
    const previewCard = document.createElement('div'); //
    previewCard.className = "group-preview-card"; //
    previewCard.style = "width: calc(100% - 32px); max-width: 450px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 12px; margin: 0 auto 16px auto; box-shadow: 0 4px 10px rgba(0,0,0,0.02);"; 
    
    previewCard.innerHTML = `
        <div style="width: 100%; overflow: hidden; border-radius: 8px; border: 1px solid #cbd5e1; margin-bottom: 12px;">
            <img src="${imgURL}" style="width: 100%; display: block;" alt="Order Group Image">
        </div>
        <div style="display: flex; gap: 8px;">
            <button onclick="downloadGroupImage('${imgURL}', '${rootName}')" style="flex: 1; height: 40px; background: #2563eb; color: white; border: none; border-radius: 8px; font-weight: bold; font-size: 13px; cursor: pointer; display: flex; align-items: center; justify-content: center;">📥 Download PNG</button>
        </div>
    `; //
    previewContentArea.appendChild(previewCard); //
});

    openOverlay('preview');
}


function triggerActiveCart(btn) {
    btn.classList.add('selected');
    setTimeout(() => {
        btn.classList.remove('selected');
    }, 180); // 180ms baad blue color hat jayega
}


function stopMic() {
    if (recognition) {
        recognition.stop();
    micOverlay?.classList.remove('active');
    }
    micBtn?.classList.remove('recording');
}

if (searchBtn) {
    searchBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        
        const mainHeader = document.querySelector('.main-header'); // Header ko target kiya
        
        if (searchSection?.classList.contains('active')) {
            window.history.back();
        } else {
            window.currentFolder = 'root';
            window.pathStack = ['Home'];
            
            if (window.location.pathname.includes('admin.html')) {
                if (typeof renderAdminInventory === "function") renderAdminInventory();
            } else {
                if (typeof renderUserInventory === "function") renderUserInventory();
            }
            if (typeof updateBreadcrumb === "function") updateBreadcrumb();

            // 🔑 JS EXPANSION: Header par dynamic search-active state tag lagao
            if (mainHeader) mainHeader.classList.add('search-active');

            // Central tracking framework stack integration
            openOverlay('search');
            
            setTimeout(() => {
                const suggestionContainer = document.getElementById('search-suggestion-chips');
                if (suggestionContainer) {
                    suggestionContainer.style.display = 'flex'; 
                }
                if (typeof renderHistoryDropdown === "function") renderHistoryDropdown(); 
            }, 80);
        }
    });
}

document.addEventListener('click', (e) => {
    const adminMenu = document.getElementById('admin-menu');
    const menuBtn = document.getElementById('menu-btn');
    
    // STRICT FIX: Menu ke bahar click hone par bina history stack chede direct close karo
    if (adminMenu && adminMenu.classList.contains('active')) {
        if (!adminMenu.contains(e.target) && !menuBtn?.contains(e.target)) {
            adminMenu.classList.remove('active');
        }
    }
});

/*function openOverlay(type) {
    if (type !== 'preview') {
        document.getElementById('search-section')?.classList.remove('active');
        document.getElementById('action-modal')?.classList.remove('active');
        document.getElementById('setting-section')?.classList.remove('active');
        document.getElementById('breadcrumb-section')?.classList.remove('hidden');
    }

    if (type === 'search') {
        document.getElementById('search-section')?.classList.add('active');
        document.getElementById('breadcrumb-section')?.classList.add('hidden');
        setTimeout(() => { searchInput.focus(); searchInput.select(); }, 80);
    } else if (type === 'cart') {
        document.getElementById('cart-section')?.classList.add('active');
    } else if (type === 'action-modal' || type === 'modal') { 
        document.getElementById('action-modal')?.classList.add('active');
    } else if (type === 'setting') {
        document.getElementById('setting-section')?.classList.add('active');
    } else if (type === 'preview') {
        document.getElementById('preview-section')?.classList.add('active');
        document.getElementById('cart-section')?.classList.add('active'); 
    }
    
    // STRICT PUSH: Har valid section open par clean history frame lock karo
    if (window.history.state?.overlay !== type) {
        history.pushState({ overlay: type }, "");
    }
}*/
// common.js ke openOverlay function ko is tarah line-by-line badlein:
function openOverlay(type) {
    const mainHeader = document.querySelector('.main-header');
    
    if (type !== 'preview') {
        document.getElementById('search-section')?.classList.remove('active');
        document.getElementById('cart-section')?.classList.remove('active');
        document.getElementById('action-modal')?.classList.remove('active');
        document.getElementById('setting-section')?.classList.remove('active');
        document.getElementById('breadcrumb-section')?.classList.remove('hidden');
        if (mainHeader) mainHeader.classList.remove('search-active'); // Reset state safe
    }

    if (type === 'search') {
        document.getElementById('search-section')?.classList.add('active');
        document.getElementById('breadcrumb-section')?.classList.add('hidden');
        // 🔑 FIX 1: Header par active class ensure karo search open hote hi
        if (mainHeader) mainHeader.classList.add('search-active'); 
        
        setTimeout(() => { searchInput.focus(); searchInput.select(); }, 80);
    } else if (type === 'cart') {
        document.getElementById('cart-section')?.classList.add('active');
    } else if (type === 'action-modal' || type === 'modal') {
        document.getElementById('action-modal')?.classList.add('active');
    } else if (type === 'setting') {
        document.getElementById('setting-section')?.classList.add('active');
    } else if (type === 'preview') {
        document.getElementById('preview-section')?.classList.add('active');
        document.getElementById('cart-section')?.classList.add('active');
    }
    
    if (window.history.state?.overlay !== type) {
        history.pushState({ overlay: type }, "");
    }
}



// --- COMMON.JS (CLOSEALLOVERLAYS UPDATE) ---

window.onpopstate = function(event) {
    if (typeof updateCartBadgeCount === "function") updateCartBadgeCount();
    if (recognition) {
        recognition.stop();
    }
    const state = event.state;
    
    // 🔑 FIX 2: Jab bhi back button dabakar screen pop ho, toh header se search-active state instantly saaf karo!
    document.querySelector('.main-header')?.classList.remove('search-active');

    if (window.isSelectionMode) {
        if (typeof exitSelectionMode === 'function') {
            exitSelectionMode(true);
            return;
        }
    }
    
    // Default resets
    document.getElementById('preview-section')?.classList.remove('active');
    document.getElementById('cart-section')?.classList.remove('active');
    document.getElementById('search-section')?.classList.remove('active');
    document.getElementById('setting-section')?.classList.remove('active');
    document.getElementById('admin-menu')?.classList.remove('active');
    document.getElementById('action-modal')?.classList.remove('active');
    document.getElementById('breadcrumb-section')?.classList.remove('hidden');

    if (state && state.overlay) {
        if (state.overlay === 'preview') {
            document.getElementById('preview-section')?.classList.add('active');
            document.getElementById('cart-section')?.classList.add('active');
        } else if (state.overlay === 'cart') {
            document.getElementById('cart-section')?.classList.add('active');
            if (typeof renderCartContent === "function") renderCartContent();
        } else if (state.overlay === 'search') {
            document.getElementById('search-section')?.classList.add('active');
            document.getElementById('breadcrumb-section')?.幕classList.add('hidden');
            // Re-apply if moving back into search state frame
            document.querySelector('.main-header')?.classList.add('search-active');
        } else if (state.overlay === 'setting') {
            document.getElementById('setting-section')?.classList.add('active');
        } else if (state.overlay === 'action-modal' || state.overlay === 'modal') {
            document.getElementById('action-modal')?.classList.add('active');
        }
    } else {
        if (state && state.folder) {
            window.currentFolder = state.folder;
            const idx = window.pathStack.indexOf(window.currentFolder);
            if (idx !== -1) {
                window.pathStack = window.pathStack.slice(0, idx + 1);
            }
        } else {
            window.currentFolder = 'root';
            window.pathStack = ['Home'];
        }

        if (typeof updateBreadcrumb === "function") updateBreadcrumb();
        if (typeof refreshUI === "function") refreshUI();
    }
};



function closeAllOverlays() {
    if (
        document.getElementById('search-section')?.classList.contains('active') ||
        document.getElementById('cart-section')?.classList.contains('active') ||
        document.getElementById('action-modal')?.classList.contains('active') ||
        document.getElementById('setting-section')?.classList.contains('active') ||
        document.getElementById('preview-section')?.classList.contains('active')
    ) {
        window.history.back();
        return; // Baaki ka kaam window.onpopstate apne aap handle kar lega
    }

    // Dropdown menu click-outside ke liye bina state wala hai, use normal remove karein
    document.getElementById('admin-menu')?.classList.remove('active');
}


const cartBtn = document.getElementById('cart-btn');
const cartSection = document.getElementById('cart-section');

if (cartBtn && cartSection) {
    cartBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (cartSection.classList.contains('active')) {
            window.history.back();
        } else {
            openOverlay('cart');
            if (typeof renderCartContent === "function") {
                renderCartContent(); // <-- Yeh line data load karegi!
            }
        }
    });
}

// ==========================================================================
// --- 🛠️ UPDATED CORE LOGIC: CLEAN CART VIEW & LIVE SEARCH (common.js) ---
// ==========================================================================

function renderCartContent() {
    const cartSectionElement = document.getElementById('cart-section');
    if (!cartSectionElement) return;

    const cartBody = cartSectionElement.querySelector('.cart-body');
    const cartFooter = cartSectionElement.querySelector('.cart-footer');
    const cartCount = document.getElementById('cart-count');
    
    let cart = getCartItems();
    const inventory = getActiveInventory();

    let cartKeys = Object.keys(cart);
    let cartUpdated = false;

    cartKeys.forEach(key => {
        if (!inventory[key]) {
            delete cart[key];
            cartUpdated = true;
        }
    });

    if (cartUpdated) {
        localStorage.setItem(getCartStorageKey(), JSON.stringify(cart));
        cart = getCartItems();
    }

    const keys = Object.keys(cart);

    if (keys.length === 0) {
        cartBody.innerHTML = `
            <div class="empty-cart-ui" style="text-align: center; padding: 40px 20px;">
                <div class="empty-icon" style="font-size: 48px; margin-bottom: 10px;">🛒</div>
                <h2 style="font-size: 18px; color: var(--dark);">Bucket Khali Hai!</h2>
                <p style="font-size: 13px; color: var(--text-sec); margin-bottom: 15px;">Lagta hai aapne abhi tak kuch select nahi kiya.</p>
                <button class="fun-btn" onclick="window.history.back()" style="padding: 10px 20px; background: var(--primary); color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">
                    Chalo Maal Bharte Hain! 🚀
                </button>
            </div>
        `;
        if (cartFooter) cartFooter.style.display = 'none';
        if (cartCount) cartCount.innerText = '0';
        return;
    }

    if (cartFooter) cartFooter.style.display = 'flex';
    if (cartCount) cartCount.innerText = keys.length;

    let listHTML = `<div class="cart-items-list" style="width: 100%; display: flex; flex-direction: column; gap: 10px; padding: 10px 0;">`;

    keys.forEach(key => {
        const item = cart[key];
        let finalNameToShow = item.name;
        const pathParts = key.split('>');
        
        if (pathParts.length > 1) {
            pathParts.pop();
            const parentKey = pathParts.join('>').trim();
            const parentData = inventory[parentKey];
            
            if (parentData && parentData.toggleOn === true) {
                const parentName = parentData.name || parentKey.split('>').pop().trim();
                finalNameToShow = parentName + " " + item.name;
            }
        }

        // 🔑 FIX POINT 1: Completely removed the absolute path string render subline (.cart-item-path)
        listHTML += `
            <div class="cart-item-card" style="display: flex; align-items: center; justify-content: space-between; background: #ffffff; padding: 14px 16px; border-radius: 14px; border: 1px solid #e2e8f0; box-shadow: 0 4px 10px rgba(15, 23, 42, 0.02);">
                <div class="cart-item-info" style="display: flex; flex-direction: column; align-items: flex-start; gap: 3px; max-width: 60%;">
                    <span class="cart-item-name" style="font-weight: 700; font-size: 15px; color: #0f172a; text-transform: capitalize; text-align: left;">${finalNameToShow}</span> 
                </div>
                
                <div class="cart-item-actions" style="display: flex; align-items: center; gap: 10px;">
                    <div class="card-qty-controller">
                        <button onclick="updateCartQty('${key}', -1)">-</button>
                        <input type="number" value="${item.quantity}" onchange="setCartQty('${key}', this.value)">
                        <button onclick="updateCartQty('${key}', 1)">+</button>
                    </div>
                    <input type="text" class="cart-unit-input" value="${item.unit}" placeholder="Unit" onchange="setCartUnit('${key}', this.value)">
                    
                    <button class="sel-btn btn-close" title="Remove Item" onclick="removeSingleCartItem('${key}')" style="background: none; border: none; padding: 4px; color: var(--text-sec); cursor: pointer; display: flex; align-items: center; justify-content: center;">
                        <svg viewBox="0 0 24 24" style="width: 18px; height: 18px; stroke: currentColor; stroke-width: 2.2; fill: none;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            </div>
        `;
    });

    listHTML += `</div>`;
    cartBody.innerHTML = listHTML;
}

// 🔑 FIX POINT 5: Search Suggestion UI real-time Cart feedback badge render engine sync
searchInput.addEventListener('input', (e) => {
    let rawQuery = e.target.value.trim();
    const inventory = getActiveInventory();
    const suggestionContainer = document.getElementById('search-suggestion-chips');

    if (!suggestionContainer) return;
    if (rawQuery.length === 0) { renderHistoryDropdown(); return; }

    let cleanQuery = rawQuery.toLowerCase();
    const allKeys = Object.keys(inventory);

    const matches = allKeys.filter(key => {
        const item = inventory[key];
        const name = item.name.toLowerCase();
        return name.includes(cleanQuery);
    }).slice(0, 6);

    if (matches.length > 0) {
        suggestionContainer.style.display = 'flex';
        suggestionContainer.innerHTML = matches.map(key => {
            const item = inventory[key];
            const cart = getCartItems();
            const isInCart = cart[key] ? true : false;
            const visualIcon = (item.children && item.children.length > 0) ? '📁' : '📦';
            
            return `
                <div class="search-sober-row" onclick="handleSuggestionClick('${key}')" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; border-bottom: 1px solid #f1f5f9; background: #ffffff;">
                    <div class="search-row-left" style="display: flex; align-items: center; gap: 16px;">
                        <span class="search-row-icon">${visualIcon}</span>
                        <div style="display: flex; flex-direction: column; align-items: flex-start;">
                            <span class="search-row-text" style="font-size: 14px; font-weight: 600; color: #1e293b;">${item.name}</span>
                        </div>
                    </div>
                    <div class="search-row-right" onclick="event.stopPropagation()">
                        ${isInCart ? 
                            `<span class="status-badge-added" style="font-size: 11px; font-weight: 800; color: var(--success); background-color: #ecfdf5; padding: 4px 10px; border-radius: 6px; border: 1px solid #d1fae5;">✓ Added</span>` : 
                            `<button class="card-cart-btn" onclick="addToCart('${key}'); searchInput.value=''; document.getElementById('search-suggestion-chips').style.display='none'; refreshUI();" style="width:32px; height:32px; display:inline-flex; align-items:center; justify-content:center; border-radius:8px; background:#ffffff; border:1px solid #e2e8f0; color:#64748b;"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg></button>`
                        }
                    </div>
                </div>
            `;
        }).join('');
    } else {
        suggestionContainer.innerHTML = `<div class="search-sober-row" style="justify-content:center; color:#94a3b8; font-size:13px; padding:16px;">No results found</div>`;
    }
});


function updateCartBadgeCount() {
    const cartBtn = document.getElementById('cart-btn');
    if (!cartBtn) return;

    const cart = typeof getCartItems === "function" ? getCartItems() : {};
    const totalItems = Object.keys(cart).length;

    // Pehle se screen par chal rahe badge ko pakdo
    let badge = cartBtn.querySelector('.cart-badge');

    if (totalItems > 0) {
        if (!badge) {
            // 1. Agar badge pehle se screen par NAHI he, toh naya banao (Ispe animation chalega)
            badge = document.createElement('span');
            badge.className = 'cart-badge';
            badge.innerText = totalItems;
            cartBtn.appendChild(badge);
        } else {
            // 2. 🟢 FIXED POINT: Agar badge PEHLE SE MAUJUD HE, toh use remove mat karo!
            // Bas uske andar ka number change karo. Isse animation baar-baar trigger nahi hoga.
            if (parseInt(badge.innerText, 10) !== totalItems) {
                badge.innerText = totalItems;
                
                // Sirf tabhi pop animation reset karo jab count sach me badla ho
                badge.style.animation = 'none';
                requestAnimationFrame(() => {
                    badge.style.animation = 'badgePop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)';
                });
            }
        }
    } else {
        // Agar cart khali ho gaya he, toh badge uda do
        if (badge) badge.remove();
    }
}



function showAlert(message, type = 'info') {
    const container = document.getElementById('custom-alert-container');
    if (!container) return;

    // Naya alert element create karein
    const alert = document.createElement('div');
    alert.className = `custom-alert alert-${type}`;
    
    // Icon selection
    let icon = '🔔';
    if(type === 'error') icon = '🚫';
    if(type === 'success') icon = '✅';

    alert.innerHTML = `<span>${icon}</span> <span>${message}</span>`;

    // Container mein add karein
    container.appendChild(alert);

    // 3 second baad automatic remove
    setTimeout(() => {
        alert.style.opacity = '0';
        alert.style.transform = 'translateY(-20px)';
        setTimeout(() => alert.remove(), 300);
    }, 3000);
}

function updateBreadcrumb() {
    const bc = document.getElementById('breadcrumb-section');
    // Upgraded clean reference:
const inventory = getActiveInventory();

    if (!bc) return;
    
    bc.innerHTML = "";

    window.pathStack.forEach((folderKey, index) => {
        const node = document.createElement('span');
        const isLast = index === window.pathStack.length - 1;
        
        // Agar key 'Home' hai toh wahi rakho, warna displayName uthao
        const folderData = inventory[folderKey];
        const nameToDisplay = (index === 0) ? "Home" : (folderData?.displayName || folderKey.split('>').pop());

        node.className = isLast ? "current-node" : "root-node";
        node.innerText = nameToDisplay;
        
        if (!isLast) {
            node.onclick = () => jumpToFolder(index);
        }
        bc.appendChild(node);

        if (!isLast) {
            const sep = document.createElement('span');
            sep.className = "separator";
            sep.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" style="vertical-align: middle; margin: 0 4px;"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
            bc.appendChild(sep);
        }
    });
}


function setCartUnit(key, value) {
    let cart = JSON.parse(localStorage.getItem('wayStock_cart')) || {};
    if (!cart[key]) return;

    cart[key].unit = value.trim() || "Box";
    localStorage.setItem('wayStock_cart', JSON.stringify(cart));
    refreshUI(); // UI aur LocalStorage dono sync ho jayenge
}

function jumpToFolder(index) {
    if (index < 0 || index >= window.pathStack.length - 1) return;

    const stepsBack = (window.pathStack.length - 1) - index;
    
    if (stepsBack > 0) {
        // Yeh trigger karega window.onpopstate ko automatically
        window.history.go(-stepsBack);
    }
}

function getUniversalCardHTML(key, data, pageType = 'user') {
    const folderSVG = `<svg class="custom-type-icon folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>`;
    const itemSVG = `<svg class="custom-type-icon item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M2.7 10.3a2.41 2.41 0 0 0 0 3.41l8.59 8.59a2.41 2.41 0 0 0 3.41 0l8.59-8.59a2.41 2.41 0 0 0 0-3.41L14.7 1.7a2.41 2.41 0 0 0-3.41 0z"></path></svg>`;

    const rawIcon = data.type === 'folder' ? folderSVG : itemSVG;
    const iconHTML = `
        <div class="card-icon-wrapper">
            ${rawIcon}
            <div class="selection-tick-overlay">✓</div>
        </div>
    `;
    const nameToShow = data.name || (key.includes('>') ? key.split('>').pop().trim() : key);

    const addButton = (pageType === 'admin') 
    ? `<button class="card-add-btn" onclick="event.stopPropagation(); openActionModal('item', '${key}')">+</button>` 
    : '';

    const toggleHTML = (pageType === 'admin' && data.type === 'folder') 
    ? `
    <label class="fun-toggle" onclick="event.stopPropagation()">
        <input type="checkbox" ${data.toggleOn ? 'checked' : ''} onchange="event.stopPropagation(); handleToggleStatus('${key}', this.checked)">
        <span class="toggle-slider"></span>
    </label>` 
    : '';

    const cart = typeof getCartItems === "function" ? getCartItems() : {};
    let actionItemHTML = '';

    if (window.currentFolder === 'root') {
        actionItemHTML = ''; 
    } else {
        if (cart[key]) {
            // 🔑 FIX: onclick, onkeydown, aur onfocus par event.stopPropagation() apply kiya taaki focus leak na ho
            actionItemHTML = `
                <div class="card-qty-controller" onclick="event.stopPropagation()">
                    <button onclick="event.stopPropagation(); updateCartQty('${key}', -1)">-</button>
                    <input type="number" value="${cart[key].quantity}" 
                           onclick="event.stopPropagation()"
                           onfocus="event.stopPropagation()"
                           onkeydown="event.stopPropagation(); if(event.key === 'Enter') this.blur();"
                           onchange="event.stopPropagation(); setCartQty('${key}', this.value)">
                    <button onclick="event.stopPropagation(); updateCartQty('${key}', 1)">+</button>
                </div>
            `;
        } else {
            actionItemHTML = `
                <button class="card-cart-btn" onclick="event.stopPropagation(); triggerActiveCart(this); addToCart('${key}')">
                    <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none">
                        <circle cx="9" cy="21" r="1"></circle>
                        <circle cx="20" cy="21" r="1"></circle>
                        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                    </svg>
                </button>
            `;
        }
    }

return `
    <div class="inventory-card" data-key="${key}" onclick="handleFolderClick('${key}')">
        <div class="card-left-action">
            ${addButton} 
            <div class="card-content" style="${pageType === 'user' ? 'padding-left: 10px;' : ''}">
                ${iconHTML}
                <span class="item-name">${nameToShow}</span> 
            </div>
        </div>
        
        <div class="card-right-actions" style="display: flex; align-items: center; gap: 12px;">
            ${toggleHTML} 
            ${actionItemHTML}
        </div>
    </div>
`;

}


window.longPressTimer = null;

function applyUniversalScrollTouchLock(card, key) {
    if (!card) return;

    // Balanced hold timeline threshold (850ms)
    const HOLD_THRESHOLD = 850; 
    let startX = 0, startY = 0;
    const SCROLL_TOLERANCE = 8; // 8 pixels tak touch movement allow hai

    const startTouch = (e) => {
        if (e.target.closest('.card-add-btn') || e.target.closest('.fun-toggle') || e.target.closest('input') || e.target.closest('button') || e.target.closest('.card-qty-controller')) {
            return;
        }

        if (e.type === 'touchstart' && e.touches.length > 0) {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        } else {
            startX = e.clientX;
            startY = e.clientY;
        }
        
        if (window.longPressTimer) clearTimeout(window.longPressTimer);
        
        window.longPressTimer = setTimeout(() => {
            // Admin panel par hi selection mode trigger hoga
            if (typeof window.isSelectionMode !== "undefined") {
                if (!window.isSelectionMode) {
                    window.isSelectionMode = true;
                    if (navigator.vibrate) navigator.vibrate(40);
                    if (typeof toggleCardSelection === "function") toggleCardSelection(key);
                }
            }
        }, HOLD_THRESHOLD);
    };

    // 🔑 SCROLL DETECTOR: Agar user touch karke ungli thodi bhi khiskata he
    const moveTouch = (e) => {
        if (!window.longPressTimer) return;

        let currentX = 0, currentY = 0;
        if (e.type === 'touchmove' && e.touches.length > 0) {
            currentX = e.touches[0].clientX;
            currentY = e.touches[0].clientY;
        } else {
            currentX = e.clientX;
            currentY = e.clientY;
        }

        const diffX = Math.abs(currentX - startX);
        const diffY = Math.abs(currentY - startY);

        // 🧠 LOGIC: Agar scroll chal raha he, toh long press timer ko INSTANTLY KILL karo
        if (diffY > SCROLL_TOLERANCE || diffX > SCROLL_TOLERANCE) {
            clearTimeout(window.longPressTimer);
            window.longPressTimer = null;
        }
    };

    const endTouch = () => {
        if (window.longPressTimer) clearTimeout(window.longPressTimer);
    };

    // Global listeners bind to card container layout
    card.addEventListener('mousedown', startTouch);
    card.addEventListener('touchstart', startTouch, { passive: true });
    
    card.addEventListener('mousemove', moveTouch);
    card.addEventListener('touchmove', moveTouch, { passive: true });
    
    card.addEventListener('mouseup', endTouch);
    card.addEventListener('mouseleave', endTouch);
    card.addEventListener('touchend', endTouch);
    card.addEventListener('touchcancel', endTouch);
}


// common.js -> handleFolderClick function ko isse REPLACE karein:
function handleFolderClick(name) {
    const mainArea = document.querySelector('.main-content-area');
    // Upgraded clean reference:
const inventory = getActiveInventory();

    
    // --- 🔴 GLOBAL MORPHING SAFETY CHECK ---
    // Agar kisi card ke children hain, toh use common.js me bhi force folder treat karo
    if (inventory[name] && inventory[name].children && inventory[name].children.length > 0) {
        inventory[name].type = 'folder';
    }
    
    if (inventory[name] && inventory[name].type === 'folder') {
        // 1. Pehle "Zoom-Out" animation trigger karein
        isFolderNavigating = true; //
        mainArea.style.opacity = '0'; //
        mainArea.style.transform = 'scale(1.05)'; //
        mainArea.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'; //

        // 2. Thoda wait karein taaki user ko transition mehsoos ho
        setTimeout(() => {
            isFolderNavigating = false; //
            window.currentFolder = name; //
            if (!window.pathStack.includes(name)) window.pathStack.push(name); //
            
            window.history.pushState({ folder: name }, ""); //

            // 3. Data load karein
            updateBreadcrumb(); //
            
            // STRICT EXECUTION BLOCK: Sirf wahi render function chalao jo page par loaded ho
            if (window.location.pathname.includes('admin.html') && typeof renderAdminInventory === "function") {
                renderAdminInventory();
            } else if (typeof renderUserInventory === "function") {
                renderUserInventory();
            }
            mainArea.style.transition = 'none'; //
            mainArea.style.transform = 'scale(0.95)'; //
            mainArea.style.opacity = '0'; //

            // Chota sa delay naye frame ke liye
            requestAnimationFrame(() => {
                mainArea.style.transition = 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'; //
                mainArea.style.transform = 'scale(1)'; //
                mainArea.style.opacity = '1'; //
            });
        }, 200); //
    }
}
const suggestionContainer = document.getElementById('search-suggestion-chips');


// common.js -> refreshUI() function ko isse replace karein:
function refreshUI() {
    if (typeof renderAdminInventory === "function") {
        renderAdminInventory(); 
    } else if (typeof renderUserInventory === "function") {
        renderUserInventory(); 
    }
    
    if (typeof renderCartContent === "function") {
        renderCartContent();
    }
    
    if (typeof updateBreadcrumb === "function") {
        updateBreadcrumb(); 
    }

    // LIVE REFRESH BADGE
    updateCartBadgeCount();
}


function getSearchHistory() {
    return JSON.parse(localStorage.getItem('wayStock_searchHistory')) || [];
}

function saveToSearchHistory(key) {
    let historyList = getSearchHistory();
    
    // Duplicate remove karo agar pehle se hai
    historyList = historyList.filter(item => item !== key);
    
    // Naya item top par dalo
    historyList.unshift(key);
    
    // Max 5 history items rakho
    if (historyList.length > 5) historyList.pop();
    
    localStorage.setItem('wayStock_searchHistory', JSON.stringify(historyList));
}



function renderHistoryDropdown() {
    const historyList = getSearchHistory();
    // Upgraded clean reference:
const inventory = getActiveInventory();

   // const cart = JSON.parse(localStorage.getItem('wayStock_cart')) || {}; 
   const cart = typeof getCartItems === "function" ? getCartItems() : {};
    const suggestionContainer = document.getElementById('search-suggestion-chips');

    if (historyList.length === 0) {
        suggestionContainer.style.display = 'none';
        suggestionContainer.innerHTML = "";
        return;
    }

    suggestionContainer.style.display = 'flex';
    suggestionContainer.innerHTML = `
        <div style="padding: 8px 16px; font-size: 11px; color: #94a3b8; font-weight: bold; background: #f8fafc; border-bottom: 1px solid #f1f5f9; letter-spacing: 0.5px;">⏱️ RECENT SEARCHES</div>
    ` + historyList.map(key => {
        const item = inventory[key] || { name: key.split('>').pop(), type: 'item' };
        const visualIcon = (item.children && item.children.length > 0) ? '📁' : (item.type === 'folder' ? '📁' : '📦');
        const isInCart = cart[key] ? true : false;
        
        return `
    <div class="search-sober-row" onclick="handleSuggestionClick('${key}')">
        <div class="search-row-left">
            <span class="search-row-icon">${visualIcon}</span>
            <div style="display: flex; flex-direction: column;">
                <span class="search-row-text">${item.name}</span>
                <span class="search-row-path">${key.includes('>') ? key : 'Root Level'}</span>
            </div>
        </div>
        <div class="search-row-right" onclick="event.stopPropagation()">
            ${isInCart ? 
                '<span class="status-badge-added">✓ Added</span>' : 
                (item.children && item.children.length > 0 ? 
                    '<svg viewBox="0 0 24 24" width="16" height="16" stroke="#cbd5e1" stroke-width="2.5" fill="none"><polyline points="9 18 15 12 9 6"></polyline></svg>' : 
                    `<button class="card-cart-btn" onclick="addToCart('${key}'); renderHistoryDropdown();"><svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg></button>`)
            }
        </div>
    </div>
`;
    }).join('');
}


// 5. Click handler with History Capture
function handleSuggestionClick(key) {
    // Upgraded clean reference:
const inventory = getActiveInventory();

    const item = inventory[key];
    if (!item) return;

    // Save this click to history!
    saveToSearchHistory(key);

    // UI Cleanup
    searchInput.value = "";
    document.getElementById('search-suggestion-chips').style.display = 'none';
    window.history.back(); 

    // Deep History Reconstruction
    setTimeout(() => {
        window.pathStack = ['Home']; 
        window.currentFolder = 'root';
        
        if (key.includes('>')) {
            const parts = key.split('>'); 
            let currentPath = "";

            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                currentPath = currentPath === "" ? part : `${currentPath}>${part}`;
                
                if (i < parts.length - 1 || inventory[currentPath]?.type === 'folder') {
                    window.pathStack.push(currentPath);
                    window.currentFolder = currentPath;
                    window.history.pushState({ folder: currentPath }, ""); 
                }
            }
        }

        if (typeof updateBreadcrumb === "function") updateBreadcrumb();
        refreshUI();
        
    }, 150);
}

function getCurrentUser() {
    return JSON.parse(localStorage.getItem('wayStock_currentUser')) || null;
}

// 🔑 FIXED: Har user ka cart key ab uski ID ke sath UNIQUE hoga
function getCartStorageKey() {
    const user = getCurrentUser();
    return user ? `wayStock_cart_${user.id}` : 'wayStock_cart_guest';
}

function getCartItems() {
    const cartKey = getCartStorageKey();
    return JSON.parse(localStorage.getItem(cartKey)) || {};
}

// Fixed Dynamic Add to Cart with User Scope
function addToCart(key) {
    // Upgraded clean reference:
const inventory = getActiveInventory();

    const itemData = inventory[key];
    const cartKey = getCartStorageKey();
    let cart = getCartItems();

    if (cart[key]) return;

    const rootFolder = key.includes('>') ? key.split('>')[0].trim() : 'Home';

    cart[key] = {
        name: itemData ? itemData.name : key.split('>').pop().trim(),
        fullPath: key,
        rootFolder: rootFolder,
        quantity: 1,
        unit: "Box"
    };

    localStorage.setItem(cartKey, JSON.stringify(cart));
    
    updateCartBadgeCount();
    refreshUI();
}

function updateCartQty(key, change) {
    const cartKey = getCartStorageKey();
    let cart = getCartItems();
    if (!cart[key]) return;

    cart[key].quantity += change;
    
    if (cart[key].quantity <= 0) {
        delete cart[key]; 
        localStorage.setItem(cartKey, JSON.stringify(cart));
        if (typeof updateCartBadgeCount === "function") updateCartBadgeCount();
        refreshUI();
    } else {
        localStorage.setItem(cartKey, JSON.stringify(cart));
        if (typeof renderCartContent === "function") renderCartContent();
        
        if (window.location.pathname.includes('admin.html') && typeof renderAdminInventory === "function") {
            renderAdminInventory();
        } else if (typeof renderUserInventory === "function") {
            renderUserInventory();
        }
    }
}

function setCartQty(key, value) {
    const cartKey = getCartStorageKey();
    let cart = getCartItems();
    if (!cart[key]) return;

    const qty = parseInt(value, 10);
    if (isNaN(qty) || qty <= 0) {
        delete cart[key];
        localStorage.setItem(cartKey, JSON.stringify(cart));
        if (typeof updateCartBadgeCount === "function") updateCartBadgeCount();
        refreshUI();
    } else {
        cart[key].quantity = qty;
        localStorage.setItem(cartKey, JSON.stringify(cart));
        if (typeof renderCartContent === "function") renderCartContent();
        
        if (window.location.pathname.includes('admin.html') && typeof renderAdminInventory === "function") {
            renderAdminInventory();
        } else if (typeof renderUserInventory === "function") {
            renderUserInventory();
        }
    }
}

function removeSingleCartItem(key) {
    const cartKey = getCartStorageKey();
    let cart = getCartItems();
    if (cart[key]) {
        delete cart[key];
        localStorage.setItem(cartKey, JSON.stringify(cart));
        showAlert("Item bucket se hata diya gaya.", "info");
        if (typeof renderCartContent === "function") renderCartContent();
        if (typeof refreshUI === "function") refreshUI();
    }
}

function clearCompleteCart() {
    if (confirm("Kya aap poori bucket khali karna chahte hain?")) {
        const cartKey = getCartStorageKey();
        localStorage.removeItem(cartKey);
        showAlert("Bucket ekdam saaf ho gayi!", "success");
        renderCartContent();
    }
}

function downloadGroupImage(dataURL, folderName) {
    const link = document.createElement('a');
    link.download = "WayStock_" + folderName.replaceAll(" ", "_") + ".png";
    link.href = dataURL;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    const cartKey = getCartStorageKey();
    let cart = getCartItems();
    Object.keys(cart).forEach(key => {
        if (cart[key].rootFolder === folderName) {
            delete cart[key];
        }
    });
    localStorage.setItem(cartKey, JSON.stringify(cart));
    
    showAlert(`✅ ${folderName} ka maal bucket se saaf ho gaya hai.`, "success");

    // ==========================================================================
    // --- 📥 🔥 IMAGE DOWNLOAD PUSH NOTIFICATION TRIGGER ENGINE ---
    // ==========================================================================
        // window.Notification check lagane se browser crash nahi hoga aur framework safe rahega
if (window.Notification && Notification.permission === 'granted') {

        // 🔊 LIVE CUSTOM AUDIO PLAYER CORE
        const alertSound = new Audio(window.location.origin + '/notification-sound.wav');
        alertSound.play().catch(e => console.log("Audio play blocked by browser policy until interaction"));

        navigator.serviceWorker.ready.then(registration => {
            registration.showNotification('Order Saved Successfully! 💾', {
                body: `${folderName} ki order image download ho gayi he.`,
                icon: 'logo.png', // Aapka brand logo
                badge: 'logo.png',
                
                // 🔊 SOUND LOCK: Standard web api ke mutabik default notification sound play hoga
                // (Kuch mobile devices me ye notification channel settings ke sound par depend karta he)
                sound: 'default', 
                
                // ⚡ HEAVY VIBRATION PATTERN: Sound ke sath phone shandar tarike se buzz hoga
                vibrate: [100, 50, 100, 200, 100, 200], 
                
                tag: 'download-success',
                renotify: true
            });
        });
    }

    if (typeof renderCartContent === "function") renderCartContent();
    if (typeof refreshUI === "function") refreshUI();
    window.history.back();
}

db.collection("appSettings").doc("globalNotification").onSnapshot((doc) => {
    if (doc.exists) {
        const data = doc.data();
        const msgTime = data.timestamp || 0;
        
        const lastSeenNotificationTime = localStorage.getItem('wayStock_last_seen_notification') || "0";
        const isFreshlyBroadcasted = (Date.now() - msgTime < 10000);
        const isNewMessageSinceLastOpen = (String(msgTime) !== lastSeenNotificationTime);

        if (isFreshlyBroadcasted || isNewMessageSinceLastOpen) {
            
            localStorage.setItem('wayStock_last_seen_notification', String(msgTime));

            const alertSound = new Audio(window.location.origin + '/notification-sound.wav');
            alertSound.play().catch(e => console.log("Audio play blocked"));

            // 🔑 CRITICAL SAFETY LOCK: window.Notification verify karke crash block toda
            if (window.Notification && Notification.permission === 'granted') {
                navigator.serviceWorker.ready.then(registration => {
                    registration.showNotification('WayStock Broadcast 📢', {
                        body: data.text,
                        icon: window.location.origin + '/logo.png', 
                        badge: window.location.origin + '/logo.png', 
                        vibrate: [200, 100, 200],
                        tag: 'broadcast-alert', 
                        renotify: true 
                    });
                });
            } else {
                if (typeof showAlert === "function") {
                    showAlert(`📢 ADMIN: ${data.text}`, "info");
                }
            }
        }
    }
});


// ==========================================================================
// --- 🔐 IMMERSIVES CLOUD GATEWAY VALIDATION ENGINE (common.js) ---
// ==========================================================================

// Global variable definition safety from standard rules
const gatewayOverlay = document.getElementById('cloud-gateway-overlay');
const gatewayVisuals = document.getElementById('gateway-visuals');
const gatewayInput = document.getElementById('gateway-pin-input');
const gatewaySubmit = document.getElementById('gateway-submit-btn');

if (searchInput && gatewayOverlay && gatewayInput && gatewaySubmit) {
    // Standard keyboard interceptor from pichle guidelines
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const queryText = searchInput.value.trim().toLowerCase();

            // 🔑 SECRET COMMAND LOCK: Exact 'admin.html' text matching
            if (queryText === 'admin.html') {
                e.preventDefault();
                searchInput.value = ""; // Textarea saaf karo
                document.getElementById('search-suggestion-chips').style.display = 'none';

                // Boring prompt hatau, Custom Immersion design activate karo
                closeAllOverlays();
                gatewayOverlay.classList.add('active');
                setTimeout(() => { gatewayInput.focus(); gatewayInput.select(); }, 80);
            }
        }
    });

    // Validating matrix Active state logic trigger
    gatewaySubmit.addEventListener('click', validateGatewayCredentials);
    gatewayInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') validateGatewayCredentials(); });
}

// Fullscreen validation engine flow architecture
async function validateGatewayCredentials() {
    const userEnteredPassword = gatewayInput.value.trim();
    if (!userEnteredPassword) return;

    // --- 🔑 State 2: Activating State visualized ---
    gatewaySubmit.disabled = true;
    gatewayVisuals.className = "gateway-visuals validating";
    showAlert("Connecting to Firebase Cloud Securing Hub... ☁️", "info");

    try {
        const adminAuthDoc = await db.collection("appSettings").doc("adminAuth").get();

        if (adminAuthDoc.exists) {
            const correctCloudPassword = adminAuthDoc.data().password;

            if (userEnteredPassword === String(correctCloudPassword)) {
                
                // --- 🔑 State 3: SUCCESS bath in soft radiant green light presets ---
                gatewayVisuals.className = "gateway-visuals";
                gatewayOverlay.classList.add('success');
                
                // standard 12-hour metric math guidelines
                const twelveHoursInMs = 12 * 60 * 60 * 1000;
                localStorage.setItem('wayStock_admin_token', "true");
                localStorage.setItem('wayStock_admin_expiry', String(Date.now() + twelveHoursInMs));

                showAlert("Access Granted! Cloud Portal Active. 🚀", "success");
                setTimeout(() => { window.location.href = "admin.html"; }, 1000);

            } else {
                // --- 🔑 State 4: FAILURE 'Goosebump' angry red hands attack presets ---
                gatewayOverlay.classList.add('failure');
                
                showAlert("🚫 INVALID PIN! Cloud Security System activated.", "error");

                // Standard failure failure failure failure metric presets safety
                // 12-hour session removal metrics guidelines lock
                setTimeout(() => {
                    gatewayVisuals.className = "gateway-visuals";
                    gatewayOverlay.classList.remove('active');
                    gatewayOverlay.classList.remove('failure');
                    gatewayInput.value = "";
                    gatewaySubmit.disabled = false;
                    
                    // Critical failure failure metric guidelines
                    sessionStorage.removeItem('wayStock_admin_authenticated');
                    localStorage.removeItem('wayStock_admin_token');
                    localStorage.removeItem('wayStock_admin_expiry');
                    
                    setTimeout(() => { window.location.href = "index.html"; }, 100);
                }, 2000);
            }
        } else {
            showAlert("Error: Database configuration not found!", "error");
        }
    } catch (error) {
        console.error("Cloud Gateway Failed:", error);
        showAlert("Network failed! Session terminated.", "error");
        setTimeout(() => { window.location.href = "index.html"; }, 1000);
    }
}

