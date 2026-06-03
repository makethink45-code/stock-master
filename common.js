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


// 🔑 OFFLINE COMPATIBILITY LAYER: Offline data access capabilities lock karna
db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
    console.warn("Firestore offline persistence state:", err.code);
});



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

// 📥 OPTIMIZED OFFLINE-FIRST BATCH CONTEXT LOADER
async function loadFirebaseData() {
    try {
        // Step 1: Local IndexedDB Initialize karo sabse pehle
        await initWayStockIndexedDB();
        
        // Step 2: Instant Memory Hydration (Bina internet ke wait kiye sseedha local read)
        let cachedInventory = await readFromIndexedDB();
        if (cachedInventory) {
            // Memory me populate ho chuka he, instantly UI refresh maar do
            if (typeof refreshUI === "function") refreshUI();
            console.log("📦 [Offline Engine] Loaded instantly from local IndexedDB storage cache.");
        }

        // Step 3: Internet Check Guard Gate
        if (!navigator.onLine) {
            console.log("✈️ [Offline Engine] No Internet Connection. Operating strictly in Offline-First Mode.");
            return; // Yahin se runtime terminate, no firebase overhead
        }

        console.log("☁️ [Offline Engine] Network found. Verifying cloud delta synchronization tokens...");

        // Step 4: Master Version Matching Call (Sirf 1 haldi document check)
        const tokenSnapshot = await tokenRef.get().catch(err => {
            console.log("⚠️ [Offline Engine] Firebase handshake timeout. Defaulting to local offline data.");
            return null;
        });

        if (!tokenSnapshot || !tokenSnapshot.exists) return;

        const cloudToken = String(tokenSnapshot.data().token);
        const localToken = String(localStorage.getItem('wayStock_local_token'));

        // Strict Enforcement: Agar token barabar he, toh server se single byte bhi download nahi hoga!
        if (cloudToken === localToken && cachedInventory) {
            console.log(`🎯 [Offline Engine] Token Matched (${localToken}). Cache is healthy. Blocked server queries.`);
            return;
        }

        // Step 5: Delta Download Loop (Sirf tabhi chalega jab sach me badlao hua ho)
        console.log("🔄 [Offline Engine] Token mismatched. Re-assembling fresh segments into local block...");
        
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

            // Token register update aur safely write into IndexedDB
            localStorage.setItem('wayStock_local_token', cloudToken);
            saveToIndexedDB(freshFullInventory);
            
            if (typeof refreshUI === "function") refreshUI();
            console.log("🎉 [Offline Engine] Cloud compilation complete. Cache flushed & hydrated successfully.");
        }
    } catch (e) {
        console.error("❌ [Offline Engine] Segmented bundle boot collection crashed:", e);
    }
}

// 🔄 MULTI-TAB LIVE RE-SYNC WATCHER (WIRED WITH OFFLINE NETWORK GAARDS)
tokenRef.onSnapshot(async (doc) => {
    // Agar active internet hi nahi he, toh snapshot triggers ko silently kill karo
    if (!navigator.onLine) return; 

    try {
        if (doc.exists) {
            const cloudToken = String(doc.data().token);
            const localToken = String(localStorage.getItem('wayStock_local_token'));
            
            if (cloudToken !== localToken) {
                console.log("⚡ [Offline Engine] Background mutation detected. Fetching incremental logs...");
                
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
    } catch(err) {
        console.log("🔒 [Offline Engine] Suppressed snapshot streaming conflicts.");
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

    const previewContentArea = document.getElementById('preview-content-area');
    if (!previewContentArea) return;

    previewContentArea.innerHTML = ""; 

    // 🚀 INITIALIZE GLOBAL MATRIX ENHANCEMENTS & CONSTANTS
    const dpr = Math.max(window.devicePixelRatio || 1, 2); 
    const rowHeight = 40;       
    const headerHeight = 85;    
    const displayWidth = 450;    
    const displayHeight = 600; 

    // Inline Layout Definition Helper (🌟 Dynamic Keys Integration)
  /*  function appendPreviewCardToDOM(imgURL, rootName, itemKeysList) {
        const downloadSVG = `
            <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
        `;
        
        const whatsappSVG = `
            <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
            </svg>
        `;

        const encodedText = encodeURIComponent(`🚨 *New WayStock Order Preview*\nCategory Group: *${rootName}*\nPhoto slip generated via app registry. Please check image attachment! 🚀`);
        const whatsappUrl = `https://api.whatsapp.com/send?text=${encodedText}`;

        // 🌟 KEY LOCK MATRIX: Keys array ko stringified karke dynamic function injection me save kiya
        const serializedKeys = encodeURIComponent(JSON.stringify(itemKeysList));

        const previewCard = document.createElement('div'); 
        previewCard.className = "group-preview-card"; 
        
        previewCard.innerHTML = `
            <div class="preview-card-floating-actions">
                <button onclick="shareGroupImage('${imgURL}', '${rootName}')" class="preview-action-icon-btn wa-share" title="Share via WhatsApp">
                    ${whatsappSVG}
                </button>
                <button onclick="downloadGroupImage('${imgURL}', '${rootName}', '${serializedKeys}')" class="preview-action-icon-btn dl-png" title="Download PNG Picture">
                    ${downloadSVG}
                </button>
            </div>
            <div class="preview-card-image-wrapper">
                <img src="${imgURL}" alt="${rootName} Order Image Preview">
            </div>
        `; 
        previewContentArea.appendChild(previewCard);
    }*/

    // Inline Layout Definition Helper (🌟 Integrated Targeted Array Keys for Both Actions)
    function appendPreviewCardToDOM(imgURL, rootName, itemKeysList) {
        const downloadSVG = `
    <svg viewBox="0 0 24 24" stroke="var(--primary)" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
`;

        
        const whatsappSVG = `
            <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
            </svg>
        `;

        // 🔒 KEY LOCK MATRIX: Same serialization applied to keep both logic threads synchronized
        const serializedKeys = encodeURIComponent(JSON.stringify(itemKeysList));

        const previewCard = document.createElement('div'); 
        previewCard.className = "group-preview-card"; 
        
        previewCard.innerHTML = `
            <div class="preview-card-floating-actions">
                <!-- 🌟 FIXED: Pass encrypted layout keys straight into the native app sharer engine -->
                <button onclick="shareGroupImage('${imgURL}', '${rootName}', '${serializedKeys}')" class="preview-action-icon-btn wa-share" title="Share via WhatsApp">
                    ${whatsappSVG}
                </button>
                <button onclick="downloadGroupImage('${imgURL}', '${rootName}', '${serializedKeys}')" class="preview-action-icon-btn dl-png" title="Download PNG Picture">
                    ${downloadSVG}
                </button>
            </div>
<div class="preview-card-image-wrapper">
    <img src="${imgURL}" onclick="openInteractiveZoomView('${imgURL}')" style="cursor:zoom-in;" alt="${rootName} Order Image Preview">
</div>      `; 
        previewContentArea.appendChild(previewCard);
    }

    // Main formatting loop wrapper block
    Object.keys(groupedCart).forEach((rootName) => {
        const items = groupedCart[rootName]; 
        const maxParts = Math.ceil(items.length / 11);

        // Canvas element template setup block
        let canvas = document.createElement('canvas'); 
        canvas.width = displayWidth * dpr; 
        canvas.height = displayHeight * dpr; 
        canvas.style.width = displayWidth + "px";
        canvas.style.height = displayHeight + "px";

        let ctx = canvas.getContext('2d'); 
        ctx.scale(dpr, dpr); 

        // Pure Clean White Base
        ctx.fillStyle = "#ffffff"; 
        ctx.fillRect(0, 0, displayWidth, displayHeight); 

        // --- MINIMALIST TEXT HEADER ---
        ctx.fillStyle = "#0f172a"; 
        ctx.font = "bold 20px ui-monospace, monospace";
        ctx.textAlign = "left";
        ctx.fillText(rootName.toUpperCase(), 20, 38);

        // Metadata Sub-line with calculated dynamic part indicators
        ctx.fillStyle = "#64748b";
        ctx.font = "12px ui-monospace, monospace";
        let totalItemsText = "Total Items: " + items.length + " | Part: 1/" + maxParts + " | " + new Date().toLocaleDateString('en-GB');
        ctx.fillText(totalItemsText, 20, 60);

        // Top Thick Divider Line
        ctx.strokeStyle = "#0f172a"; 
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(20, 72);
        ctx.lineTo(displayWidth - 20, 72); 
        ctx.stroke();

        let currentY = headerHeight + 20;
        let activeCanvas = canvas;
        let activeCtx = ctx;
        
        // 🌟 CURRENT TRACKER ARRAY: Jo is sheet par load ho rahe items ki tracking karega
        let activeSheetKeys = [];

        // Inside Loop: Rows Layout Design with smart auto-slicing logic built-in
        items.forEach((item, idx) => {
            
            // Checkpoint loop: 11 items partition constraint metrics tracker
            if (idx > 0 && idx % 11 === 0) {
                // Render older layer footer layouts safely before memory swap
                activeCtx.strokeStyle = "#94a3b8"; 
                activeCtx.lineWidth = 1;
                activeCtx.beginPath();
                activeCtx.moveTo(20, displayHeight - 32); 
                activeCtx.lineTo(displayWidth - 20, displayHeight - 32); 
                activeCtx.stroke();
                activeCtx.textAlign = "left";
                activeCtx.fillStyle = "#94a3b8";
                activeCtx.font = "10px ui-monospace, monospace";
                activeCtx.fillText("Generated via WayStock Master", 20, displayHeight - 15); 
                activeCtx.textAlign = "right";
                activeCtx.fillText(new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), displayWidth - 20, displayHeight - 15); 

                const partialImgURL = activeCanvas.toDataURL("image/png");
                
                // 🌟 PASS ENGINE: Purani sheet ke tracked items pass karo aur reset karo
                appendPreviewCardToDOM(partialImgURL, rootName, activeSheetKeys);
                activeSheetKeys = [];

                // CONT. CANVAS RECREATION CORRECTION
                activeCanvas = document.createElement('canvas');
                activeCanvas.width = displayWidth * dpr;
                activeCanvas.height = displayHeight * dpr;
                activeCanvas.style.width = displayWidth + "px";
                activeCanvas.style.height = displayHeight + "px";

                activeCtx = activeCanvas.getContext('2d');
                activeCtx.scale(dpr, dpr);

                activeCtx.fillStyle = "#ffffff";
                activeCtx.fillRect(0, 0, displayWidth, displayHeight);

                activeCtx.fillStyle = "#0f172a"; 
                activeCtx.font = "bold 20px ui-monospace, monospace";
                activeCtx.textAlign = "left";
                activeCtx.fillText(rootName.toUpperCase() + " (CONT.)", 20, 38);
                
                activeCtx.fillStyle = "#64748b";
                activeCtx.font = "12px ui-monospace, monospace";
                const nextPart = Math.floor(idx / 11) + 1;
                activeCtx.fillText("Total Items: " + items.length + " | Part: " + nextPart + "/" + maxParts + " | " + new Date().toLocaleDateString('en-GB'), 20, 60);
                
                activeCtx.strokeStyle = "#0f172a"; 
                activeCtx.lineWidth = 2;
                activeCtx.beginPath();
                activeCtx.moveTo(20, 72);
                activeCtx.lineTo(displayWidth - 20, 72);
                activeCtx.stroke();

                currentY = headerHeight + 20; 
            }

            // 🌟 TRACK KEY: Is item ki main cart storage key ko array me daal lo
            activeSheetKeys.push(item.cartKey);

            let finalNameToShow = item.name; 
            const pathParts = item.cartKey.split('>'); 
            if (pathParts.length > 1) { 
                pathParts.pop(); 
                const parentKey = pathParts.join('>').trim(); 
                const parentData = inventory[parentKey]; 
                if (parentData && parentData.toggleOn === true) { 
                    const parentName = parentData.name || parentKey.split('>').pop().trim(); 
                    finalNameToShow = parentName + " " + item.name; 
                }
            }

            activeCtx.textAlign = "left";
            activeCtx.fillStyle = "#1e293b"; 
            activeCtx.font = "500 14px ui-monospace, monospace";
            activeCtx.fillText((idx + 1) + ".  " + finalNameToShow, 20, currentY);

            activeCtx.textAlign = "right";
            activeCtx.fillStyle = "#0f172a"; 
            activeCtx.font = "bold 15px ui-monospace, monospace";
            const finalUnitText = item.unit ? " " + item.unit : "";
            const qtyText = item.quantity + finalUnitText; 
            
            activeCtx.fillText(qtyText, displayWidth - 20, currentY); 

            activeCtx.strokeStyle = "#e2e8f0"; 
            activeCtx.lineWidth = 1; 
            activeCtx.beginPath(); 
            activeCtx.moveTo(20, currentY + 12); 
            activeCtx.lineTo(displayWidth - 20, currentY + 12); 
            activeCtx.stroke(); 

            currentY += rowHeight; 
        });

        // Final closure draw for remaining items on last page sheet
        activeCtx.strokeStyle = "#94a3b8"; 
        activeCtx.lineWidth = 1;
        activeCtx.beginPath();
        activeCtx.moveTo(20, displayHeight - 32); 
        activeCtx.lineTo(displayWidth - 20, displayHeight - 32); 
        activeCtx.stroke();
        activeCtx.textAlign = "left";
        activeCtx.fillStyle = "#94a3b8";
        activeCtx.font = "10px ui-monospace, monospace";
        activeCtx.fillText("Generated via WayStock Master", 20, displayHeight - 15); 
        activeCtx.textAlign = "right";
        activeCtx.fillText(new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), displayWidth - 20, displayHeight - 15); 

        const imgURL = activeCanvas.toDataURL("image/png"); 
        
        // 🌟 FINAL SHEET POP ENGINE
        appendPreviewCardToDOM(imgURL, rootName, activeSheetKeys);
    });

    if (typeof openOverlay === 'function') {
        openOverlay('preview');
    }
}

// ==========================================================================
// --- 📱 SMART TARGETED IMAGE WHATSAPP SHARER & ROUTE WATCHER ---
// ==========================================================================
async function shareGroupImage(dataURL, folderName, encodedKeysList) {
    try {
        const response = await fetch(dataURL);
        const blob = await response.blob();
        const safeFileName = `WayStock_${folderName.replaceAll(" ", "_")}.png`;
        const file = new File([blob], safeFileName, { type: "image/png" });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: `${folderName} Order Slip`,
                text: `🚨 *WayStock Order Preview*\nCategory Group: *${folderName}*\nPhoto slip attached safely! 🚀`
            });

            // 🌟 ATOMIC TARGETED CLEAN ENGINE (Same as Download Logic)
            const cartKey = getCartStorageKey();
            let cart = getCartItems();

            if (encodedKeysList) {
                const targetKeysToFlush = JSON.parse(decodeURIComponent(encodedKeysList));
                if (Array.isArray(targetKeysToFlush)) {
                    targetKeysToFlush.forEach(key => {
                        if (cart[key]) delete cart[key];
                    });
                }
            }
            localStorage.setItem(cartKey, JSON.stringify(cart));
            showAlert(`✅ Slip ka maal share hone par bucket se saaf ho gaya hai.`, "success");

            if (typeof renderCartContent === "function") renderCartContent();
            if (typeof refreshUI === "function") refreshUI();

            // 🌟 DYNAMIC AUTOMATIC SHIFT POP CHECKER (Smart Navigation Router)
            const previewContentArea = document.getElementById('preview-content-area');
            const totalRemainingSlips = previewContentArea ? previewContentArea.querySelectorAll('.group-preview-card').length : 0;

            // Agar sabhi sheet images download/share ho chuki hain (0 left or only 1 left which is currently being popped), move back
            if (totalRemainingSlips <= 1) {
                window.history.back(); // Direct shift back to My Cart view screen
            } else {
                // Background me sirf current card slip container layout ko clear karo
                // Is tarah screen pop hilegi nahi aur user bache hue cards download kar payega
                if (previewContentArea) {
                    const cards = previewContentArea.querySelectorAll('.group-preview-card');
                    cards.forEach(card => {
                        if (card.innerHTML.includes(`downloadGroupImage('${dataURL}'`) || card.innerHTML.includes(`shareGroupImage('${dataURL}'`)) {
                            card.remove(); // Safely clears shared sheet from screen structure matrix
                        }
                    });
                }
            }

        } else {
            showAlert("Apka device direct image sharing support nahi karta. Please download karke share karein! 📥", "error");
        }
    } catch (error) {
        console.error("Direct share interaction aborted or crashed:", error);
    }
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
        
        const mainHeader = document.querySelector('.main-header');
        
        // Agar search bar pehle se khula he, toh click karne par sseedha normal back jao
        if (searchSection?.classList.contains('active')) {
            window.history.back();
        } else {
            
            // 🔑 STEP 1: Pehle check karo user kisi folder me he ya nahi. 
            // Agar nested layer me he, toh pehle physical history flush ko execute karo.
            if (window.pathStack && window.pathStack.length > 1) {
                const levelsToPop = window.pathStack.length - 1;
                
                // 🔄 Browser ko sseedha order mila: "Pehle piche jao!"
                window.history.go(-levelsToPop); 
                
                // Pointers aur states ko instantly background me clean kiya
                window.currentFolder = 'root';
                window.pathStack = ['Home'];
                
                if (window.location.pathname.includes('admin.html')) {
                    if (typeof renderAdminInventory === "function") renderAdminInventory();
                } else {
                    if (typeof renderUserInventory === "function") renderUserInventory();
                }
                if (typeof updateBreadcrumb === "function") updateBreadcrumb();

                // ⏳ STEP 2: DIESEL TIME-GAP (200ms Delay)
                // Browser ko asynchronous history rewrite karne ka poora waqt diya, 
                // jab background ka kalesh/auto-close operation khatam ho jayega... TABHI Search khulega!
                setTimeout(() => {
                    if (mainHeader) mainHeader.classList.add('search-active');
                    
                    openOverlay('search'); // Safe Open without clash
                    
                    setTimeout(() => {
                        const suggestionContainer = document.getElementById('search-suggestion-chips');
                        if (suggestionContainer) {
                            suggestionContainer.style.display = 'flex'; 
                        }
                        if (typeof renderHistoryDropdown === "function") renderHistoryDropdown(); 
                    }, 80);
                }, 200); // 🚀 200 milliseconds ka perfect timing framework wrapper gap

            } else {
                // Safe Mode Block: Agar user pehle se hi Home page par khada he, 
                // toh bina kisi history alteration ke instantly zero delay par search kholo
                window.currentFolder = 'root';
                window.pathStack = ['Home'];
                
                if (mainHeader) mainHeader.classList.add('search-active');
                openOverlay('search');
                
                setTimeout(() => {
                    const suggestionContainer = document.getElementById('search-suggestion-chips');
                    if (suggestionContainer) {
                        suggestionContainer.style.display = 'flex'; 
                    }
                    if (typeof renderHistoryDropdown === "function") renderHistoryDropdown(); 
                }, 80);
            }
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
    if (document.getElementById('preview-zoom-overlay')?.classList.contains('active')) {
        closeInteractiveZoomView(true); // true means history text pop trigger pass parameters safely
        return; // Event chain terminate
    }
    if (window.WayStockAdminState && window.WayStockAdminState.isSelectionMode) {
        if (typeof exitSelectionMode === 'function') {
            exitSelectionMode(true); // Exits mode without creating dynamic history routing loops
            return; 
        }
    }
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
            // CORRECTION:
document.getElementById('breadcrumb-section')?.classList.add('hidden');
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

    let listHTML = `<div class="cart-items-list">`;

    // 🔑 DETECT PAGE TYPE CONTEXT FOR CROSS LAYOUT MANAGEMENT
    const isCurrentPageAdmin = window.location.pathname.includes('admin.html');
    const pageTypeContext = isCurrentPageAdmin ? 'admin' : 'user';

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

                // 🔽 DYNAMIC INLINE OVERRIDES: Synchronizing active dropdown elements without arbitrary fallbacks
                const itemInventoryData = inventory[key] || {};
        const allowedUnitsList = (itemInventoryData.allowedUnits && itemInventoryData.allowedUnits.length > 0)
            ? itemInventoryData.allowedUnits 
            : [];

        // 🔑 THE ABSOLUTE EMPTY FIX: "Box" fallback ko hamesha ke liye jad se khatam kiya
        let currentUnitValue = item.unit || "";
        
        if (allowedUnitsList.length > 0) {
            // Agar list me options hain par current label missing he ya galat he, toh automatically pehla element lock karo
            if (!currentUnitValue || !allowedUnitsList.includes(currentUnitValue)) {
                currentUnitValue = allowedUnitsList[0];
                item.unit = currentUnitValue;
            }
        } else {
            // 🔄 WAPAS 0 HONGE PAR EMPTY: Agar admin ne saare options delete kar diye (list length 0), toh value wapas khali
            currentUnitValue = "";
            item.unit = "";
        }



        // Loop to generate adaptive matrix selector cells safely
        let dropdownRowsHTML = '';
        if (allowedUnitsList.length > 0) {
            allowedUnitsList.forEach(u => {
                const crossHTML = (pageTypeContext === 'admin') 
                    ? `<span class="unit-cross-btn" onclick="event.stopPropagation(); executeUnitGlobalDelete('${key}', '${u}')">❌</span>` 
                    : '';
                
                dropdownRowsHTML += `
                    <div class="unit-dropdown-row" onclick="event.stopPropagation(); executeUnitSelectChange('${key}', '${u}', '${pageTypeContext}')">
                        <span>${u}</span>
                        ${crossHTML}
                    </div>
                `;
            });
        } else {
            // Dropdown bilkul empty hone par chota sa sober placeholder text dikhega
            dropdownRowsHTML = `<div style="padding: 10px; color: #94a3b8; font-size: 11px; text-align: center;">No units added</div>`;
        }

        const adminInputHTML = (pageTypeContext === 'admin')
            ? `<input type="text" class="admin-unit-input-box" placeholder="+ Add Unit" onkeydown="event.stopPropagation(); handleAdminUnitEnter(event, '${key}')" onclick="event.stopPropagation()">`
            : '';

        const dropdownStructureHTML = `
            <div class="unit-dropdown-wrapper" onclick="event.stopPropagation()">
                <div class="unit-trigger-badge" onclick="event.stopPropagation(); toggleUnitDropdownMenu(this)">
                    ${currentUnitValue} ▾
                </div>
                <div class="unit-select-dropdown">
                    ${adminInputHTML}
                    <div class="dropdown-rows-scroll-container">
                        ${dropdownRowsHTML}
                    </div>
                </div>
            </div>
        `;


        listHTML += `
            <div class="cart-item-card" style="display: flex; align-items: center; justify-content: space-between; background: #ffffff;height: 68px; box-sizing: border-box;">
                
                <div class="cart-item-info" style="display: flex; flex-direction: column; align-items: flex-start; flex: 1; min-width: 0; padding-right: 8px;">
                    <span class="cart-item-name"; text-transform: capitalize; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; display: block;">
                        ${finalNameToShow}
                    </span> 
                </div>
                
                <div class="cart-item-actions" style="display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-shrink: 0; width: 185px;">
                    
                    <div class="card-qty-controller gesture-swipe-zone" data-swipe-key="${key}" style="flex-shrink: 0 !important;">
                        <input type="number" value="${item.quantity}" readonly>
                    </div>
                    
                    <div style="width: 62px; display: flex; justify-content: center; flex-shrink: 0;">
                        ${dropdownStructureHTML}
                    </div>
                    
                    <button class="sel-btn btn-close" title="Remove Item" onclick="removeSingleCartItem('${key}')" style="background: none; border: none; padding: 4px; color: var(--text-sec); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; width: 28px; flex-shrink: 0;">
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

// Global tracking variables for notification guard gate
window.lastAlertMessage = "";
window.lastAlertTimestamp = 0;

function showAlert(message, type = 'info') {
    const container = document.getElementById('custom-alert-container');
    if (!container) return;
container.innerHTML = ""; 
    const currentTime = Date.now();
    
    // 🔑 DUPLICATE COOLDOWN FILTER: Agar same message 1500ms (1.5s) ke andar dubara aaye toh block karo
    if (message === window.lastAlertMessage && (currentTime - window.lastAlertTimestamp) < 1500) {
        console.log("🚫 [Alert Guard] Suppressed duplicate notification:", message);
        return; 
    }

    // Save current alert state metrics safely
    window.lastAlertMessage = message;
    window.lastAlertTimestamp = currentTime;

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
    // 🔑 DYNAMIC USER FIX: Get target exact user dynamic storage cart key
    const cartKey = typeof getCartStorageKey === "function" ? getCartStorageKey() : 'wayStock_cart_guest';
    let cart = typeof getCartItems === "function" ? getCartItems() : {};
    
    if (!cart[key]) return;

    cart[key].unit = value.trim() || "Box";
    localStorage.setItem(cartKey, JSON.stringify(cart)); // Committing directly to correct profile slot
    refreshUI(); 
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
            // 🔑 GESTURE UPGRADE: Completely cleaned boxy buttons. Render a solid gesture target capsule wrapper
            actionItemHTML = `
                <div class="card-qty-controller gesture-swipe-zone" 
                     data-swipe-key="${key}"
                     onclick="event.stopPropagation()">
                    <input type="number" value="${cart[key].quantity}" readonly>
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
    if (historyList.length > 12) historyList.pop();
    
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

    // 🔑 INITIAL EMPTY LOCK: Agar admin ne options banaye hain toh pehla element lo, warna pure blank string "" rkho
    const dynamicDefaultUnit = (itemData && itemData.allowedUnits && itemData.allowedUnits.length > 0)
        ? itemData.allowedUnits[0]
        : "";

    cart[key] = {
        name: itemData ? itemData.name : key.split('>').pop().trim(),
        fullPath: key,
        rootFolder: rootFolder,
        quantity: 1,
        unit: dynamicDefaultUnit
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


function downloadGroupImage(dataURL, folderName, encodedKeysList) {
    const link = document.createElement('a');
    link.download = "WayStock_" + folderName.replaceAll(" ", "_") + ".png";
    link.href = dataURL;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    const cartKey = getCartStorageKey();
    let cart = getCartItems();

    // 🌟 ATOMIC CLEAN ENGINE: Purane pure category flush ko lock karke specific filter check kiya
    if (encodedKeysList) {
        try {
            // Stringified data ko transparently back array process logic me restore kiya
            const targetKeysToFlush = JSON.parse(decodeURIComponent(encodedKeysList));
            
            if (Array.isArray(targetKeysToFlush)) {
                targetKeysToFlush.forEach(key => {
                    if (cart[key]) {
                        delete cart[key]; // 🔥 Sirf wahi item uda jo download hua!
                    }
                });
                console.log(`🎯 [Clean Engine] Atomic removal complete for sheet items.`, targetKeysToFlush);
            }
        } catch (e) {
            console.error("Targeted parsing clean stack collapsed:", e);
        }
    } else {
        // Safe Layout Fallback: Agar upar se array na mile (Light protection layer)
        Object.keys(cart).forEach(key => {
            if (cart[key].rootFolder === folderName) {
                delete cart[key];
            }
        });
    }

    // Save atomic snapshot state downstream
    // ... downloadGroupImage logic ke upar ka saara code safe rahega ...
    localStorage.setItem(cartKey, JSON.stringify(cart));
    showAlert(`✅ Slip ka maal bucket se saaf ho gaya hai.`, "success");

    if (window.Notification && Notification.permission === 'granted') {
        const alertSound = new Audio('./notification-sound.wav');
        alertSound.play().catch(e => console.log("Audio play blocked"));

        navigator.serviceWorker.ready.then(registration => {
            registration.showNotification('Order Saved Successfully! 💾', {
                body: `${folderName} ki order image download ho gayi he.`,
                icon: 'logo.png',
                badge: 'logo.png',
                sound: 'default', 
                vibrate: [100, 50, 100, 200, 100, 200], 
                tag: 'download-success',
                renotify: true
            });
        });
    }

    if (typeof renderCartContent === "function") renderCartContent();
    if (typeof refreshUI === "function") refreshUI();

    // 🌟 DYNAMIC ROUTE POP CONTROL MATRIX (Smart Checker Configuration)
    const previewContentArea = document.getElementById('preview-content-area');
    const totalRemainingSlips = previewContentArea ? previewContentArea.querySelectorAll('.group-preview-card').length : 0;

    if (totalRemainingSlips <= 1) {
        // Safe Mode Trigger: Agar ye aakhiri box bacha hua tha screen par, tabhi piche le jao!
        window.history.back(); 
    } else {
        // Stay On Screen Mode: Downloaded card layout element box ko dynamic window surface se dissolve kardo
        if (previewContentArea) {
            const cards = previewContentArea.querySelectorAll('.group-preview-card');
            cards.forEach(card => {
                // Direct current image signature verification check
                if (card.innerHTML.includes(`downloadGroupImage('${dataURL}'`)) {
                    card.remove(); // Remove downloaded box element without moving the layout window back!
                }
            });
        }
    }
}



db.collection("appSettings").doc("globalNotification").onSnapshot((doc) => {
    if (!doc.exists) return;

    const data = doc.data();
    const msgTime = data.timestamp || 0;
    const lastSeenNotificationTime = localStorage.getItem('wayStock_last_seen_notification') || "0";
    
    const isFreshlyBroadcasted = (Date.now() - msgTime < 10000);
    const isNewMessageSinceLastOpen = (String(msgTime) !== lastSeenNotificationTime);

    if (isFreshlyBroadcasted || isNewMessageSinceLastOpen) {
        localStorage.setItem('wayStock_last_seen_notification', String(msgTime));

        // 🧠 @USER DYNAMIC REPLACEMENT LAYER: Current logged-in profile ka data pull karo
        const loggedUserObj = JSON.parse(localStorage.getItem('wayStock_currentUser'));
        const clientName = loggedUserObj && loggedUserObj.name ? loggedUserObj.name : "Customer";

        // Firebase se aaye raw text ke andar jitne bhi '@user' ya '@User' hain, unhe dynamic name se replace karo
        let originalRawText = data.text || "";
        let personalizedMessage = originalRawText.replace(/@user/gi, clientName);

        // Sound player boot trigger parameters
        const alertSound = new Audio('./notification-sound.wav');
        alertSound.play().catch(e => console.log("Audio handshake waiting for user interaction gesture"));

        // System notification execution with parsed variables string
        if (window.Notification && Notification.permission === 'granted') {
            navigator.serviceWorker.ready.then(registration => {
                registration.showNotification('WayStock Broadcast 📢', {
                    body: personalizedMessage, // 🔑 Injected personalized client name string here!
                    icon: window.location.origin + '/logo.png', 
                    badge: window.location.origin + '/logo.png', 
                    vibrate: [200, 100, 200],
                    tag: 'broadcast-alert', 
                    renotify: true,
                    sound: './notification-sound.wav' 
                });
            });
        } else {
            // Screen in-app toast alert fallback frame mapping
            if (typeof showAlert === "function") {
                showAlert(`📢 ADMIN: ${personalizedMessage}`, "info");
            }
        }
    }
});


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
const expiryTimestamp = String(Date.now() + twelveHoursInMs);

// 🔒 Double Lock Token Injection Structure
sessionStorage.setItem('wayStock_admin_authenticated', "true");
sessionStorage.setItem('wayStock_admin_expiry', expiryTimestamp);

// Backup encryption mirror for persistent navigation
localStorage.setItem('wayStock_admin_token', "true");
localStorage.setItem('wayStock_admin_expiry', expiryTimestamp);

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

document.addEventListener('touchstart', function(e) {
    const swipeZone = e.target.closest('.gesture-swipe-zone');
    if (!swipeZone) return;

    // Agar user input field ke andar active typing kar rha he, toh scroll lock gesture bypass karo
    if (document.activeElement === swipeZone.querySelector('input')) {
        return; 
    }

    const key = swipeZone.getAttribute('data-swipe-key');
    const inputElement = swipeZone.querySelector('input');
    if (!key || !inputElement) return;

    let startX = e.touches[0].clientX;
    let initialQty = parseInt(inputElement.value, 10) || 1;
    let accumulatedDelta = 0;
    let hasMovedMoved = false; // Track karne ke liye ki swipe chal rha he ya simple tap hua he
    
    const SENSITIVITY_PIXELS = 15; 

    function onTouchMove(moveEvent) {
        const currentX = moveEvent.touches[0].clientX;
        const currentDiffX = currentX - startX;

        // Threshold configuration check to filter out light micro shaking taps
        if (Math.abs(currentDiffX) > 5) {
            hasMovedMoved = true;
            moveEvent.preventDefault();
            moveEvent.stopPropagation();
        } else {
            return;
        }

        if (currentDiffX > 5) {
            swipeZone.classList.add('swiping-right');
            swipeZone.classList.remove('swiping-left');
        } else if (currentDiffX < -5) {
            swipeZone.classList.add('swiping-left');
            swipeZone.classList.remove('swiping-right');
        }

        const currentChange = Math.floor(currentDiffX / SENSITIVITY_PIXELS);
        
        if (currentChange !== accumulatedDelta) {
            let nextCalculatedQty = initialQty + currentChange;
            if (nextCalculatedQty < 0) nextCalculatedQty = 0;

            inputElement.value = nextCalculatedQty; 
            accumulatedDelta = currentChange;
            swipeZone.style.transform = "scale(1.04)";
        }
    }

    function onTouchEnd() {
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
        
        swipeZone.classList.remove('swiping-right', 'swiping-left');
        swipeZone.style.transform = "scale(1)";

        // 🧠 HYBRID DETECTOR: Agar finger bilkul move nahi hui, yaani user ne sirf TAP kiya he direct numeric entry ke liye!
        if (!hasMovedMoved) {
            // Remove native readonly lock overlay framework cleanly
            inputElement.removeAttribute('readonly');
            inputElement.focus();
            inputElement.select(); // auto highlight full number text for easy override
            return; // Exit swipe logic loops instantly
        }

        // Processing standard swipe outputs safely
        const finalParsedQty = parseInt(inputElement.value, 10);
        commitQuantityToStorage(key, finalParsedQty);
    }

    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
});

// 🔑 DIRECT KEYPAD INPUT INTERCEPTORS & SYNC BLOCKS
document.addEventListener('focusin', function(e) {
    const input = e.target.closest('.gesture-swipe-zone input');
    if (input) {
        // Stop any external card long press delays while input field has focus attention
        if (window.longPressTimer) clearTimeout(window.longPressTimer);
    }
});

// Enter key validation check inside gesture text fields to smooth blur actions
document.addEventListener('keydown', function(e) {
    const input = e.target.closest('.gesture-swipe-zone input');
    if (input && e.key === 'Enter') {
        e.preventDefault();
        input.blur(); // Triggers focusout execution automatically
    }
});

// Blur Event Tracker: Keyboard band hote hi selection text state bhi clear ho jayegi
document.addEventListener('focusout', function(e) {
    const input = e.target.closest('.gesture-swipe-zone input');
    if (!input) return;

    const swipeZone = input.closest('.gesture-swipe-zone');
    const key = swipeZone?.getAttribute('data-swipe-key');
    if (!key) return;

    // 🔑 THE FIX: Selection clear karne ke liye pointer text range selection index zero (0) lock kiya
    if (window.getSelection) {
        window.getSelection().removeAllRanges(); // Mobile text dynamic highlight selector ko instantly clear karega
    }

    // Reset fields back to secure structural locked read formats
    input.setAttribute('readonly', 'true');

    let typedValue = parseInt(input.value, 10);
    if (isNaN(typedValue) || typedValue < 0) typedValue = 0;

    commitQuantityToStorage(key, typedValue);
});


// 🛠️ ATOMIC CORE COMMIT CONTAINER ENGINE
function commitQuantityToStorage(key, finalQty) {
    const cartKey = typeof getCartStorageKey === "function" ? getCartStorageKey() : 'wayStock_cart_guest';
    let cart = typeof getCartItems === "function" ? getCartItems() : {};

    if (!cart[key]) return;

    if (finalQty <= 0) {
        delete cart[key];
        localStorage.setItem(cartKey, JSON.stringify(cart));
        if (typeof updateCartBadgeCount === "function") updateCartBadgeCount();
        refreshUI();
    } else {
        cart[key].quantity = finalQty;
        localStorage.setItem(cartKey, JSON.stringify(cart));
        
        if (typeof renderCartContent === "function") renderCartContent();
        updateCartBadgeCount();
    }
}

function openInteractiveZoomView(imageSrc) {
    const overlay = document.getElementById('preview-zoom-overlay');
    const targetImg = document.getElementById('zoom-target-image');
    
    if (!overlay || !targetImg) return;
    
    targetImg.src = imageSrc;
    overlay.classList.add('active'); 

    // SYSTEM BACK LOCK: History state stack lock karo taaki hardware back key capture ho sake
    if (window.history.state?.overlay !== 'preview-zoom') {
        history.pushState({ overlay: 'preview-zoom' }, "");
    }
}

function closeInteractiveZoomView(isBackAction = false) {
    const overlay = document.getElementById('preview-zoom-overlay');
    if (!overlay) return;

    overlay.classList.remove('active');

    // ROUTING SAFETY RESET: Agar user ne × button dabaya he, toh background history stack pop karo
    if (!isBackAction && window.history.state?.overlay === 'preview-zoom') {
        window.history.back();
    }
}



function toggleUnitDropdownMenu(element) {
    const parentWrapper = element.closest('.unit-dropdown-wrapper');
    const targetDropdown = parentWrapper?.querySelector('.unit-select-dropdown');
    
    // Safety Reset: Close any other open unit dropdown elements first
    document.querySelectorAll('.unit-select-dropdown').forEach(d => {
        if (d !== targetDropdown) d.classList.remove('active-menu');
    });

    if (targetDropdown) {
        targetDropdown.classList.toggle('active-menu');
    }
}

// Global Document overlay body baseline interceptor to close menus on outside clicks safely
document.addEventListener('click', function() {
    document.querySelectorAll('.unit-select-dropdown').forEach(d => d.classList.remove('active-menu'));
});

// Selector handler logic
function executeUnitSelectChange(key, unitValue, pageType) {
    const cartKey = typeof getCartStorageKey === "function" ? getCartStorageKey() : 'wayStock_cart_guest';
    let cart = typeof getCartItems === "function" ? getCartItems() : {};
    let inventory = typeof getActiveInventory === "function" ? getActiveInventory() : {};

    // 1. Update current item base model property configuration values
    if (inventory[key]) {
        inventory[key].currentUnit = unitValue;
        if (typeof saveToIndexedDB === "function") saveToIndexedDB(inventory);
    }

    // 2. Sync inside cart if item is currently sitting inside cart
    if (cart[key]) {
        cart[key].unit = unitValue;
        localStorage.setItem(cartKey, JSON.stringify(cart));
    }

    // Close options box menu and reload display elements
    document.querySelectorAll('.unit-select-dropdown').forEach(d => d.classList.remove('active-menu'));
    refreshUI();
}

// REPLACE WITH THIS CLEAN LOGIC:
function handleAdminUnitEnter(event, key) {
    if (event.key !== 'Enter') return;
    event.preventDefault();

    const rawInputVal = event.target.value.trim();
    if (!rawInputVal) return;

    // Capitalize option text format standard rules
    const formattedUnit = rawInputVal.charAt(0).toUpperCase() + rawInputVal.slice(1).toLowerCase();
    
    let inventory = typeof getActiveInventory === "function" ? getActiveInventory() : {};
    if (!inventory[key]) return;

    // Extract Root Parent Category path key segment
    const topRootParentCategoryKey = key.includes('>') ? key.split('>')[0].trim() : key;

    console.log(`🚀 [Unit Engine] Propagating option "${formattedUnit}" from root category node:`, topRootParentCategoryKey);

    // 🔄 RECURSIVE INHERITANCE: Scan entire global database records
    Object.keys(inventory).forEach(invKey => {
        if (invKey === topRootParentCategoryKey || invKey.startsWith(topRootParentCategoryKey + '>')) {
            // 💡 BUG FIX: Agar array nahi hai toh dynamic empty array do, default presets mat thopo!
            if (!inventory[invKey].allowedUnits) {
                inventory[invKey].allowedUnits = []; 
            }
            if (!inventory[invKey].allowedUnits.includes(formattedUnit)) {
                inventory[invKey].allowedUnits.push(formattedUnit);
            }
            // Auto lock current selection parameter reference
            inventory[invKey].currentUnit = formattedUnit;
        }
    });

    // Sync state changes downstream
    if (typeof saveToIndexedDB === "function") saveToIndexedDB(inventory);
    if (typeof syncToFirebase === "function") syncToFirebase();

    event.target.value = ""; // Flush text wrapper box
    document.querySelectorAll('.unit-select-dropdown').forEach(d => d.classList.remove('active-menu'));
    refreshUI();
    showAlert(`Unit "${formattedUnit}" added globally under category tree! ✅`, "success");
}

// ❌ GLOBAL CROSS BUTTON DELETE CORE ENGINE
function executeUnitGlobalDelete(key, unitToDelete) {

    let inventory = typeof getActiveInventory === "function" ? getActiveInventory() : {};
    if (!inventory[key]) return;

    const cartKey = typeof getCartStorageKey === "function" ? getCartStorageKey() : 'wayStock_cart_guest';
    let cart = typeof getCartItems === "function" ? getCartItems() : {};

    const topRootParentCategoryKey = key.includes('>') ? key.split('>')[0].trim() : key;

    // 🔄 GLOBAL DESTRUCTION STRATEGY LOOP
    Object.keys(inventory).forEach(invKey => {
        if (invKey === topRootParentCategoryKey || invKey.startsWith(topRootParentCategoryKey + '>')) {
            if (inventory[invKey].allowedUnits) {
                // Slicing unit item element out from array matching definitions rules bounds
                inventory[invKey].allowedUnits = inventory[invKey].allowedUnits.filter(u => u !== unitToDelete);
                
                // 🔑 DYNAMIC ZERO FLUSH: Agar option delete hone ke baad array khali bacha he, toh wapas empty string "" set karo
                if (inventory[invKey].currentUnit === unitToDelete) {
                    inventory[invKey].currentUnit = inventory[invKey].allowedUnits.length > 0 
                        ? inventory[invKey].allowedUnits[0] 
                        : "";
                }
            }
        }

        // Cart entity values memory clean overrides
        if (cart[invKey] && cart[invKey].unit === unitToDelete) {
            cart[invKey].unit = inventory[invKey]?.currentUnit || "Box";
        }
    });

    // Commit changes safely to storage pools
    localStorage.setItem(cartKey, JSON.stringify(cart));
    if (typeof saveToIndexedDB === "function") saveToIndexedDB(inventory);
    if (typeof syncToFirebase === "function") syncToFirebase();

    document.querySelectorAll('.unit-select-dropdown').forEach(d => d.classList.remove('active-menu'));
    refreshUI();
    showAlert(`Option "${unitToDelete}" deleted completely. 🗑️`, "info");
}
