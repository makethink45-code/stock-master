let inventory = { name: "Home", type: "category", children: [] };
let bucket = [];
let history = [];
let currentPath = [inventory];
let selectedIndices = new Set();
let selectionMode = false;
let editTargetIndex = null;
let pressTimer;
let addSubTargetNode = null; 

let stockRef, bucketRef, historyRef;

function showSkeleton() {
    const area = document.getElementById('displayArea');
    area.innerHTML = `
        <div class="skeleton skeleton-card"></div>
        <div class="skeleton skeleton-card"></div>
        <div class="skeleton skeleton-card"></div>
        <div class="skeleton skeleton-card"></div>
    `;
}



function initRefs() {
    stockRef = db.collection("stock").doc("mainInventory");
    bucketRef = db.collection("stock").doc("currentBucket");
    historyRef = db.collection("stock").doc("orderHistory");
}

// --- CLOUD DATA LOAD (NO LOOP VERSION) ---
async function loadCloudData() {
    initRefs();
    const displayArea = document.getElementById('displayArea');
    
    // Step 1: Forcefully Skeleton dikhao
    displayArea.innerHTML = `
        <div class="loading-wrapper">
            <div class="skeleton"></div>
            <div class="skeleton"></div>
            <div class="skeleton"></div>
        </div>`;

    try {
        const [stockDoc, bucketDoc, historyDoc] = await Promise.all([
            stockRef.get(),
            bucketRef.get(),
            historyRef.get()
        ]);

        if (stockDoc.exists) inventory = stockDoc.data();
        if (bucketDoc.exists) bucket = bucketDoc.data().items || [];
        if (historyDoc.exists) history = historyDoc.data().orders || [];

        currentPath = [inventory];
        
        // Step 2: Kam se kam 1.2 second ka delay taaki shimmer animation dikhe
        setTimeout(() => {
            render();
            console.log("✅ Rendered after shimmer");
        }, 1200);

    } catch (error) {
        console.error("Load failed", error);
        render(); 
    }
}

// App start
window.addEventListener('DOMContentLoaded', () => {
    loadCloudData();
});

// Function to make first letter capital, others small



//window.oncontextmenu = function() { return false; }

// --- 1. CLICK OUTSIDE TO HIDE MENU ---
window.addEventListener('click', (e) => {
    const menu = document.getElementById('dropMenu');
    const menuBtn = e.target.closest('.menu-container');
    if (!menuBtn && menu && menu.style.display === 'block') {
        menu.style.display = 'none';
    }
});

function isAlreadyInBucket(name, path) {
    return bucket.some(b => b.name === name && b.path === path);
}


// --- 3. MODAL LOGIC ---
function showAddModalForSub(idx) {
    const active = currentPath[currentPath.length - 1];
    addSubTargetNode = active.children[idx]; // Mango ko target banaya
    document.getElementById('modalTitle').innerText = `Add inside: ${addSubTargetNode.name}`;
    showAddModal();
}

function handleMasterAdd() {
    const val = document.getElementById('masterInput').value.trim();
    if (!val) return;

    if (editTargetIndex !== null) {
        currentPath[currentPath.length - 1].children[editTargetIndex].name = val;
    } else {
        processBulk(val);
    }
    hideAddModal();
    render();
    saveData(); // Manual Save after action
}

function processBulk(str) {
    const levels = str.split('>').map(s => s.trim());
    let targets = addSubTargetNode ? [addSubTargetNode] : [currentPath[currentPath.length - 1]];

    levels.forEach((lvl, i) => {
        const names = lvl.split(',').map(n => n.trim());
        let next = [];
        targets.forEach(parent => {
            if (!parent.children) { parent.type = 'category'; parent.children = []; }

            names.forEach(name => {
                let exist = parent.children.find(c => c.name.toLowerCase() === name.toLowerCase());
                if (!exist) {
                    const isLast = (i === levels.length - 1);
                    const newNode = { 
                        name: capitalizeFirstLetter(name), 
                        type: isLast ? 'product' : 'category', 
                        children: isLast ? null : [] 
                    };
                    parent.children.push(newNode);
                    if (newNode.children) next.push(newNode);
                } else {
                    if (!exist.children) { exist.type = 'category'; exist.children = []; }
                    next.push(exist);
                }
            });
        });
        targets = next;
    });
}
// 1. Updated showLoading function
function showLoading(msg = "Processing...") {
    document.getElementById('loaderText').innerText = msg;
    document.getElementById('loadingOverlay').style.display = 'flex';
}

// 2. Updated clearHistory (Isme 'Clearing History...' message bheja hai)
async function clearHistory() {
    if (!confirm("Are you sure you want to delete all history?")) return;

    showLoading("Clearing History..."); // <-- Dynamic message

    try {
        history = [];
        await historyRef.set({ orders: [] });
        showHistoryList(); 
        hideLoading();
        alert("History cleared!");
    } catch (error) {
        console.error(error);
        hideLoading();
    }
}

async function downloadAndSave() {
    if (bucket.length === 0) return;

    showLoading("Generating Professional Reports...");

    // 1. Quantities Sync
    bucket.forEach((item, idx) => {
        const qtyInput = document.getElementById(`qty-${idx}`);
        if (qtyInput) item.qty = qtyInput.value || 1;
    });

    // 2. Grouping by Main Category
    const grouped = {};
    bucket.forEach(item => {
        const parts = item.path.split(' > ');
        const mainCat = parts[1] || "General"; 
        if (!grouped[mainCat]) grouped[mainCat] = [];
        grouped[mainCat].push(item);
    });

    const captureContainer = document.getElementById('image-capture-container');
    
    // UI Setup for Capture
    captureContainer.style.visibility = 'visible';
    captureContainer.style.position = 'fixed';
    captureContainer.style.left = '0';
    captureContainer.style.top = '0';
    captureContainer.style.zIndex = '-1';

    try {
        for (const [category, items] of Object.entries(grouped)) {
            
            // --- YOUR FAVORITE PROFESSIONAL DESIGN (FIXED) ---
            captureContainer.innerHTML = `
                <div id="capture-box" style="width: 400px; background: #ffffff; padding: 15px; font-family: 'Segoe UI', Arial, sans-serif; box-sizing: border-box; border: 1px solid #e0e0e0; border-radius: 8px;">
                    
                    <div style="border-bottom: 3px solid #2e7d32; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end;">
                        <div>
                            <h2 style="margin: 0; color: #212121; font-size: 20px; text-transform: uppercase; letter-spacing: 0.5px;">${category}</h2>
                            <span style="font-size: 11px; color: #757575;">Inventory Report • ${new Date().toLocaleDateString('en-GB')}</span>
                        </div>
                        <div style="font-size: 12px; font-weight: bold; color: #616161;">Total: ${items.length} Items</div>
                    </div>

                    <div style="display: flex; background: #455a64; color: white; padding: 7px 10px; font-size: 11px; font-weight: bold; border-radius: 4px 4px 0 0;">
                        <div style="width: 30px; color: white;">SR.</div>
                        <div style="flex: 3; color: white; padding-left: 5px;">ITEM DESCRIPTION</div>
                        <div style="flex: 1; text-align: right; color: white;">QTY</div>
                    </div>

                    <div style="border: 1px solid #cfd8dc; border-top: none;">
                        ${items.map((it, idx) => {
                            let pathParts = it.path.split(' > '); 
                            let subFolders = pathParts.slice(2); 
                            let fullName = subFolders.length > 0 
                                ? subFolders.join(' ') + ' ' + it.name 
                                : it.name;

                            return `
                                <div style="display: flex; align-items: center; padding: 8px 10px; border-bottom: 1px solid #eceff1; background: ${idx % 2 === 0 ? '#ffffff' : '#fafafa'};">
                                    <div style="width: 30px; font-size: 11px; color: #9e9e9e; font-weight: bold;">
                                        ${idx + 1}.
                                    </div>
                                    <div style="flex: 3; padding-left: 5px;">
                                        <div style="font-weight: 700; font-size: 14px; color: #212121; line-height: 1.2;">
                                            ${fullName}
                                        </div>
                                    </div>
                                    <div style="flex: 1; text-align: right; font-weight: 900; font-size: 17px; color: #2e7d32;">
                                        ${it.qty}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>

                    <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #f1f1f1; display: flex; justify-content: space-between; font-size: 9px; color: #bdbdbd;">
                        <span>Generated via Stock-Master Ultra</span>
                        <span>Time: ${new Date().toLocaleTimeString()}</span>
                    </div>
                </div>`;

            // Wait for DOM to prepare
            await new Promise(res => setTimeout(res, 1000));

            // Use html2canvas for capturing the #capture-box
            const captureBox = document.getElementById('capture-box');
            const canvas = await html2canvas(captureBox, {
                scale: 2,
                backgroundColor: '#ffffff',
                logging: false,
                useCORS: true
            });

            const dataUrl = canvas.toDataURL("image/png");
            const link = document.createElement('a');
            link.download = `${category}_Report.png`;
            link.href = dataUrl;
            link.click();
        }

        // Cleanup and Save
        history.push({ 
            date: new Date().toISOString(), 
            items: JSON.parse(JSON.stringify(bucket)) 
        });
        bucket = []; 
        await saveData(); 
        
        captureContainer.style.visibility = 'hidden';
        hideLoading();
        alert(`Success: Professional image(s) generated.`);
        hideBucketScreen();
        render(); 

    } catch (error) {
        console.error('Capture failed', error);
        captureContainer.style.visibility = 'hidden';
        hideLoading();
        alert("Nahi ho raha... Reference ya Library ka error hai.");
    }
}



function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

// --- FIX: Search logic for accurate filtering ---
function handleSearch() {
    const term = document.getElementById('searchInput').value.toLowerCase();
    const area = document.getElementById('displayArea');
    
    // Agar search box khali hai, toh original view wapas lao
    if (!term) {
        render();
        return;
    }
    
    const results = [];
    
    // Recursive search jo inventory ke har level ko scan karega
    const searchRecursive = (node, path = []) => {
        // Path string banaya
        let pathString = path.length > 0 ? path.map(n => n.name).join(' > ') : "Home";
        
        // Item ka naam match ho raha hai?
        if (node.name.toLowerCase().includes(term) && node.name !== "Home") {
            results.push({ node, pathString, hierarchy: [...path, node] });
        }
        
        // Agar folder hai toh andar jao
        if (node.children) {
            node.children.forEach(c => searchRecursive(c, [...path, node]));
        }
    };
    
    searchRecursive(inventory, []);

    // Result UI render karna
    area.innerHTML = '';
    
    if (results.length === 0) {
        area.innerHTML = `<div class="empty-state"><p>No items found for "${term}"</p></div>`;
        return;
    }

    results.forEach((res) => {
        const div = document.createElement('div');
        div.className = 'item-card';
        const inBucket = isAlreadyInBucket(res.node.name, res.pathString);
        
        div.onclick = () => {
            currentPath = res.hierarchy.slice(0, -1); // Parent folder mein jao
            const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.focus(); // Pehle focus karein
            searchInput.select(); // Poora text highlight/select kar dein
        }
            render(); 
        };

        div.innerHTML = `
            <div style="flex:1">
                <small style="color:var(--text-sec); font-size:0.75rem">${res.pathString}</small><br>
                <div class="item-name">
                    <span>${res.node.type === 'category' ? '📁' : '🔹'} ${res.node.name}</span>
                </div>
            </div>
            <div class="actions">
                ${inBucket ? '<span class="added-label">✅</span>' : 
                `<button class="btn-bucket-add" onclick="event.stopPropagation(); addFromSearch('${res.node.name}', '${res.pathString}')">🛒+</button>`}
            </div>
        `;
        area.appendChild(div);
    });
}



function hideAddModal() {
    document.getElementById('addModal').style.display = 'none';
    document.getElementById('masterInput').value = '';
    document.getElementById('modalTitle').innerText = "Add New Inventory";
    editTargetIndex = null;
    addSubTargetNode = null; // Resetting so next 3-dot add is clean
}


// --- FIX: Search se item bucket mein add karne ka function ---
function addFromSearch(name, path) {
    // Check karein ki item pehle se bucket mein toh nahi hai
    if (!isAlreadyInBucket(name, path)) {
        bucket.push({ 
            name: name, 
            path: path, 
            type: 'product' // Search items ko as a product treat karein
        });
        
        // Badge update karein aur UI refresh karein
        document.getElementById('bucketBadge').innerText = bucket.length;
        handleSearch(); // Search list refresh karein taaki ✅ dikhe
    } else {
        alert("Item already in bucket!");
    }
}

// --- 4. BUCKET & OTHER UTILS ---

function addToBucket(index) {
    const item = currentPath[currentPath.length - 1].children[index];
    if (!isAlreadyInBucket(item.name, getPathString())) {
        bucket.push({ name: item.name, path: getPathString(), type: item.type });
        render();
        saveData();
    }
}
function getPathString() { return currentPath.map(n => n.name).join(' > '); }
function saveData() {
    // 1. Inventory Sync
    stockRef.set(inventory).then(() => console.log("☁️ Inventory Synced!"));

    // 2. Bucket (Cart) Sync - Ise object format mein bhejna zaroori hai
    bucketRef.set({ items: bucket }).then(() => console.log("🛒 Bucket Synced!"));

    // 3. History Sync
    historyRef.set({ orders: history }).then(() => console.log("📜 History Synced!"));
}

function capitalizeFirstLetter(str) {
    if (!str) return "";
    
    return str.split(' ').map(word => {
        if (word.length === 0) return "";
        
        // Agar poora word pehle se hi uppercase (LAYS) hai, toh use mat badlo
        if (word === word.toUpperCase() && word.length > 1) {
            return word;
        }

        // Default logic: Pehla letter Capital, baaki jo user ne likha hai wahi rahega
        // (Sirf pehle letter ko force capitalize karega, baaki ko touch nahi karega)
        return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
}

function clearSelection() { selectedIndices.clear(); selectionMode = false; render(); }
function toggleMenu() { const m = document.getElementById('dropMenu'); m.style.display = m.style.display==='none'?'block':'none'; }
function showAddModal() { document.getElementById('addModal').style.display = 'flex'; document.getElementById('dropMenu').style.display = 'none'; }
function toggleSearch() {
    const s = document.getElementById('searchWrapper');
    const input = document.getElementById('searchInput');
    
    if (s.style.display === 'none' || s.style.display === '') {
        s.style.display = 'block';
        input.focus(); // Khulte hi cursor andar aa jaye
    } else {
        s.style.display = 'none';
        input.value = ''; // Input empty kardo
        render(); // Original list wapas dikhao
    }
}
function toggleSelection(i) { selectedIndices.has(i) ? selectedIndices.delete(i) : selectedIndices.add(i); if (selectedIndices.size === 0) selectionMode = false; render(); }

function updateSelectionBar() {
    const bar = document.getElementById('selectionBar');
    if (selectionMode && selectedIndices.size > 0) {
        bar.style.display = 'flex';
        document.getElementById('selectCount').innerText = selectedIndices.size;
        document.getElementById('editBtn').style.display = selectedIndices.size === 1 ? 'flex' : 'none';
    } else { bar.style.display = 'none'; }
}

// Baaki missing functions (History, Search, Delete etc.) ko as it is rakhein.
function deleteMultiple() { 
    if (confirm(`Delete ${selectedIndices.size} items?`)) { 
        const active = currentPath[currentPath.length - 1]; 
        Array.from(selectedIndices).sort((a,b)=>b-a).forEach(i => active.children.splice(i,1)); 
        clearSelection(); 
        saveData();
    } 
}

// Edit Fix
function startEditFromBar() { 
    const idx = Array.from(selectedIndices)[0]; 
    editTargetIndex = idx; 
    const activeItem = currentPath[currentPath.length - 1].children[idx];
    document.getElementById('masterInput').value = activeItem.name; 
    showAddModal(); 
    // Note: handleMasterAdd() mein pehle se saveData() hai, toh wo update kar dega.
}

// Bulk Bucket Fix
function bulkAddToBucket() {
    const activeFolder = currentPath[currentPath.length - 1];
    selectedIndices.forEach(idx => {
        const item = activeFolder.children[idx];
        if (!isAlreadyInBucket(item.name, getPathString())) {
            bucket.push({ name: item.name, path: getPathString(), type: item.type });
        }
    });
    clearSelection();
    saveData(); // <--- Cloud par bucket save karega
    render();
}

function removeFromBucket(idx) { 
    bucket.splice(idx, 1); 
    saveData(); // 🔥 Ye line zaroori hai cloud update ke liye
    showBucketScreen(); 
    render(); // Badge update karne ke liye
}
function hideBucketScreen() { document.getElementById('bucketView').style.display='none'; document.getElementById('adminView').style.display='flex'; render(); }
function showHistoryScreen() { document.getElementById('adminView').style.display='none'; document.getElementById('historyView').style.display='flex'; showHistoryList(); }
function hideHistoryScreen() { document.getElementById('historyView').style.display='none'; document.getElementById('adminView').style.display='block'; }



function showHistoryList() {
    const area = document.getElementById('historyList');
    
    if (history.length === 0) {
        // --- MAJEDAR EMPTY STATE ---
        area.innerHTML = `
            <div style="
                text-align: center; 
                padding: 40px 20px; 
                background: #f8fafc; 
                border-radius: 20px; 
                margin-top: 20px;
                border: 2px dashed #cbd5e1;
            ">
                <div style="font-size: 50px; margin-bottom: 10px;">📜</div>
                <h3 style="color: #1e293b; margin-bottom: 8px;">History is Fresh!</h3>
                <p style="color: #64748b; font-size: 14px; margin-bottom: 20px;">
                    Abhi tak koi order nahi hua. Chaliye kuch items add karte hain!
                </p>
                
                <button onclick="hideHistoryScreen()" style="
                    background: #2e7d32; 
                    color: white; 
                    border: none; 
                    padding: 12px 25px; 
                    border-radius: 50px; 
                    font-weight: bold; 
                    font-size: 14px; 
                    cursor: pointer;
                    box-shadow: 0 4px 15px rgba(46, 125, 50, 0.3);
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    transition: transform 0.2s;
                " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                    🏠 Back to Inventory
                </button>
            </div>`;
        return;
    }

    // --- AGAR HISTORY HAI TOH YE CHALEGA ---
    area.innerHTML = '';
    history.slice().reverse().forEach(h => {
        const div = document.createElement('div');
        div.className = 'history-card-new';
        
        const d = new Date(h.date);
        const dateStr = isNaN(d.getTime()) ? "Earlier Order" : d.toLocaleDateString('en-GB', {day:'2-digit', month:'short', year:'numeric'});
        const timeStr = isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

        let itemsHtml = "";
        h.items.forEach(it => {
            const fullPath = it.path || "General";
            const displayPath = fullPath.replace("Home > ", ""); 

            itemsHtml += `
                <div class="h-item-container">
                    <div class="h-full-path">${displayPath}</div>
                    <div class="h-row">
                        <span class="h-name">${it.name}</span>
                        <span class="h-qty">x${it.qty || 1}</span>
                    </div>
                </div>`;
        });

        div.innerHTML = `
            <div class="h-header">
                <div class="h-date-group">
                    <span class="h-date">${dateStr}</span>
                    <span class="h-time">${timeStr}</span>
                </div>
                <span class="h-count">${h.items.length} Items</span>
            </div>
            <div class="h-body">
                ${itemsHtml}
            </div>
        `;
        area.appendChild(div);
    });
}


function showBucketScreen() {
    document.getElementById('adminView').style.display = 'none';
    document.getElementById('bucketView').style.display = 'flex';
    
    const area = document.getElementById('bucketItemsList'); 
    const confirmBtn = document.querySelector('.btn-main-action');
    
if (bucket.length === 0) {
        // --- MAJEDAR EMPTY BUCKET STATE ---
        area.innerHTML = `
            <div style="
                text-align: center; 
                padding: 40px 20px; 
                background: #fdfdfd; 
                border-radius: 20px; 
                margin-top: 20px;
                border: 2px dashed #2e7d32;
            ">
                <div style="font-size: 50px; margin-bottom: 10px;">🛒</div>
                <h3 style="color: #1e293b; margin-bottom: 8px;">Bucket is Empty!</h3>
                <p style="color: #64748b; font-size: 14px; margin-bottom: 20px;">
                    Aapka bucket abhi khali hai. Kuch mazedaar items select karke yahan layein!
                </p>
                
                <button onclick="hideBucketScreen()" style="
                    background: #2e7d32; 
                    color: white; 
                    border: none; 
                    padding: 12px 25px; 
                    border-radius: 50px; 
                    font-weight: bold; 
                    font-size: 14px; 
                    cursor: pointer;
                    box-shadow: 0 4px 15px rgba(46, 125, 50, 0.2);
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    transition: 0.2s;
                " onmouseover="this.style.backgroundColor='#1b5e20'" onmouseout="this.style.backgroundColor='#2e7d32'">
                    🚀 Start Adding Items
                </button>
            </div>`;
            
        if(confirmBtn) confirmBtn.style.display = 'none';
        return;
    }
    if(confirmBtn) confirmBtn.style.display = 'block';
    area.innerHTML = '';

    const grouped = groupBucketItems();
    const catNames = Object.keys(grouped);

    catNames.forEach(catName => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'bucket-group-card';
        
        // Space hatakar clean ID banana
        const safeId = catName.split(' ').join('');
        groupDiv.id = 'capture-section-' + safeId;
        
     /*   let itemsHtml = '';
        grouped[catName].forEach(it => {
            itemsHtml += `
                <div class="order-row" style="display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid #eee;">
                    <div style="flex:1;">
                        <strong style="display:block;">${it.name}</strong>
                        <small style="color:#666;">${it.path}</small>
                    </div>
                    <div style="display:flex; gap:10px; align-items:center;">
                        <input type="number" class="qty-input" id="qty-${it.originalIndex}" value="1" style="width:50px; text-align:center;">
                        <button onclick="removeFromBucket(${it.originalIndex})" style="color:red; background:none; border:none; font-size:1.2rem;">✕</button>
                    </div>
                </div>`;
        });*/

let itemsHtml = '';
    grouped[catName].forEach((it, idx) => {
        itemsHtml += `
            <div class="order-row">
                <div style="flex:1;">
                    <strong>${it.name}</strong>
                    <small style="display:block;">${it.path}</small>
                </div>
                <div style="display:flex; gap:8px; align-items:center;">
                    <input type="number" 
                           class="qty-input" 
                           id="qty-${it.originalIndex}" 
                           value="1" 
                           onkeydown="focusNextInput(event, ${it.originalIndex})"
                           inputmode="numeric">
                    <button onclick="removeFromBucket(${it.originalIndex})" style="color:red; background:none; border:none; font-size:1.1rem;">✕</button>
                </div>
            </div>`;
    });


        groupDiv.innerHTML = `
            <div class="group-header" style="background:#f1f5f9; padding:10px; font-weight:bold; color:var(--primary);">
                📦 ${catName}
            </div>
            <div class="group-body" style="background:white;">
                ${itemsHtml}
            </div>
        `;
        
        groupDiv.style.marginBottom = "20px";
        groupDiv.style.border = "1px solid #e2e8f0";
        groupDiv.style.borderRadius = "10px";
        groupDiv.style.overflow = "hidden";
        
        area.appendChild(groupDiv);
    });
}
function groupBucketItems() {
    const grouped = {};
    bucket.forEach((item, index) => {
        const parts = item.path.split(' > ');
        // parts[1] main category hai (e.g. Packets)
        const topCatRaw = parts[1] || "General"; 
        const topCat = capitalizeFirstLetter(topCatRaw);

        // Path se 'Home' hatana aur Proper Case karna
        const cleanPathParts = parts.slice(1); // 'Home' ko index 0 se uda diya
        const capitalizedPath = cleanPathParts.map(p => capitalizeFirstLetter(p)).join(' > ');

        if (!grouped[topCat]) grouped[topCat] = [];
        
        grouped[topCat].push({ 
            ...item, 
            name: capitalizeFirstLetter(item.name), 
            path: capitalizedPath, 
            originalIndex: index 
        });
    });
    return grouped;
}


// --- Updated Order Download & Clear Logic ---








function focusNextInput(event, currentIndex) {
    if (event.key === "Enter") {
        event.preventDefault(); // Page submit hone se rokein
        
        // Saare inputs ko dhoondein
        const allInputs = Array.from(document.querySelectorAll('.qty-input'));
        const currentPos = allInputs.findIndex(input => input.id === `qty-${currentIndex}`);
        
        if (currentPos !== -1 && allInputs[currentPos + 1]) {
            allInputs[currentPos + 1].focus(); // Agle box par le jao
            allInputs[currentPos + 1].select(); // Value select karlo taaki turant type ho sake
        } else {
            // Agar aakhri input hai toh keyboard band kar do
            document.activeElement.blur();
        }
    }
}

function saveOrderToHistory() {
    if (bucket.length === 0) return;

    // Sabhi qty inputs ko ek array mein uthao
    const allQtyInputs = document.querySelectorAll('.qty-input');
    
    let entry = { 
        date: new Date().toISOString(), // Valid ISO date string
        items: [] 
    };
    
    bucket.forEach((it, idx) => {
        // Input se value uthao, agar na mile toh default 1
        const qtyVal = allQtyInputs[idx] ? allQtyInputs[idx].value : 1;
        entry.items.push({ 
            name: it.name, 
            qty: qtyVal 
        });
    });

    history.push(entry);
    bucket = []; // Bucket khali
    saveData(); // Cloud Sync
    render();
}

render();




function render() {
    const activeFolder = currentPath[currentPath.length - 1];
    const displayArea = document.getElementById('displayArea');
    const breadcrumbArea = document.getElementById('breadcrumb');

    // Breadcrumb Update
    breadcrumbArea.innerHTML = '';
    currentPath.forEach((node, idx) => {
        const span = document.createElement('span');
        span.innerHTML = node.name === "Home" ? "🏠 Home" : capitalizeFirstLetter(node.name);
        span.className = "crumb-link";
        span.onclick = (e) => {
            if (idx === currentPath.length - 1) return;
            currentPath = currentPath.slice(0, idx + 1);
            clearSelection();
            render(); 
        };
        breadcrumbArea.appendChild(span);
        if (idx < currentPath.length - 1) {
            const sep = document.createElement('span');
            sep.innerText = ' ❯ ';
            sep.className = "breadcrumb-separator";
            breadcrumbArea.appendChild(sep);
        }
    });

    displayArea.innerHTML = '';
    document.getElementById('bucketBadge').innerText = bucket.length;
    updateSelectionBar();

    if (!activeFolder.children || activeFolder.children.length === 0) {
        displayArea.innerHTML = `<div class="empty-state"><span>📁</span><p>No items in ${activeFolder.name}</p></div>`;
    } else {
        // ... breadcrumb aur badge update wala purana code ...

activeFolder.children.forEach((item, index) => {
    let effectiveType = item.type;
    if (item.type === 'category' && (!item.children || item.children.length === 0)) {
        effectiveType = 'product';
    }

    const div = document.createElement('div');
    const isMulti = selectedIndices.has(index);
    div.className = `item-card ${effectiveType} ${isMulti ? 'multi-selected' : ''}`;
    
    const inBucket = isAlreadyInBucket(item.name, getPathString());

    // Long Press logic (Selection mode ke liye) wahi rahega
    div.onmousedown = div.ontouchstart = () => {
        pressTimer = setTimeout(() => { selectionMode = true; toggleSelection(index); }, 700);
    };
    div.onmouseup = div.ontouchend = () => clearTimeout(pressTimer);

    // 🔥 MODIFIED CLICK LOGIC:
    div.onclick = (e) => {
        // Agar selection mode on hai, toh card click se select hoga
        if (selectionMode) {
            toggleSelection(index);
            return;
        }

        // Agar user ne Category (Folder) par click kiya hai, toh folder khulega
        if (effectiveType === 'category') {
            currentPath.push(item);
            render();
        } 
        // Agar Product hai, toh card par click karne se KUCH NAHI HOGA
        // Item sirf tabhi add hoga jab niche 'btn-bucket-add' par click ho
    };

    div.innerHTML = `
        <div class="item-name">
            <button class="add-sub-inline" onclick="event.stopPropagation(); showAddModalForSub(${index})">+</button>
            <span class="icon">${effectiveType === 'category' ? '📁' : '🔹'}</span>
            <span class="text">${capitalizeFirstLetter(item.name)}</span>
        </div>
        <div class="actions">
            ${inBucket ? '<span class="added-label">✅</span>' : 
            `<button class="btn-bucket-add" onclick="event.stopPropagation(); addToBucket(${index})">🛒+</button>`}
        </div>
    `;
    displayArea.appendChild(div);
});
    }


    }
    
    
    async function clearHistory() {
    // 1. User se confirmation lein
    if (!confirm("Are you sure you want to delete all history? This will also remove it from the Cloud!")) return;

    showLoading(); // Loader dikhao kyunki cloud par update hoga

    try {
        // 2. Local array ko khali karein
        history = [];

        // 3. Cloud (Firebase) par khali history save karein
        // Hum purane 'historyRef' ko use karke naya object bhej rahe hain
        await historyRef.set({ orders: [] });


        // 4. UI ko update karein
        showHistoryList(); 
        
        hideLoading();
    } catch (error) {
        console.error("Clear History Failed:", error);
        hideLoading();
        alert("Failed to clear history. Check your connection.");
    }
}


    // NOT SAVING HERE TO PREVENT LOOPS
async function debugDatabase() {
    try {
        const snap = await db.collection("stock").doc("mainInventory").get();
        if (!snap.exists) {
            console.error("❌ Document 'mainInventory' database mein nahi mila!");
        } else {
            const data = snap.data();
            if (data.children && data.children.length === 0) {
                
            }
        }
    } catch (e) {
        console.error("❌ Connection Error:", e.message);
    }
    console.log("--- DEBUG END ---");
}

// Ise auto-run karne ke liye loadCloudData ke baad call karein
// debugDatabase(); 

// --- Image Generation Logic ---
