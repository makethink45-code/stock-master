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
        console.error("Cloud Load Error:", error);
        const displayArea = document.getElementById('displayArea');
        displayArea.innerHTML = `
            <div class="error-state" style="text-align: center; padding: 40px;">
                <div style="font-size: 50px;">📡</div>
                <h3 style="color: #e11d48;">Connection Failed</h3>
                <p style="color: var(--text-sec); font-size: 14px;">Database se connect nahi ho pa rahe hain.</p>
                <button onclick="location.reload()" style="background: var(--primary); color: white; border: none; padding: 10px 20px; border-radius: 50px; margin-top: 10px; cursor: pointer;">
                    🔄 Try Again
                </button>
            </div>`;
        hideLoading();
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
    // Edit ke waqt hi Capitalize karke save karo
    currentPath[currentPath.length - 1].children[editTargetIndex].name = capitalizeFirstLetter(val);
}
 else {
        processBulk(val);
    }
    hideAddModal();
    render();
    saveData(); // Manual Save after action
}

function processBulk(str) {
    const levels = str.split('>').map(s => s.trim());
 
 // Current folder ko target banana (agar koi sub-target nahi hai)
let targets = addSubTargetNode ? [addSubTargetNode] : [currentPath[currentPath.length - 1]];

// Extra safety: Agar currentPath khali hai (waise hoga nahi), toh inventory target hoga
if (!targets[0]) targets = [inventory];


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
                        children: isLast ? null : [],
                        showInReport: false
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
            // Naya logic: Seedha us item ya folder ke path par navigation
            currentPath = [...res.hierarchy]; 
            
            // Agar ye product hai, toh uske parent folder mein ruko
            if (res.node.type === 'product') {
                currentPath.pop();
            }
            
            // Search band karo aur view refresh karo
            toggleSearch(); 
            render(); 
        };


        div.innerHTML = `
            <div style="flex:1">
                <small style="color:var(--text-sec); font-size:0.80rem">${res.pathString}</small><br>
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

// Sirf inventory save karne ke liye
async function saveInventory() {
    try {
        await stockRef.set(inventory);
        console.log("☁️ Inventory Updated");
    } catch (e) { console.error("Save failed", e); }
}

// Sirf Bucket/Cart save karne ke liye
async function saveBucket() {
    try {
        await bucketRef.set({ items: bucket });
        console.log("🛒 Bucket Updated");
    } catch (e) { console.error("Bucket save failed", e); }
}

// Purana saveData function ab aise kaam karega
function saveData() {
    saveInventory();
    saveBucket();
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
        input.focus();
    } else {
        // Aapki requirement: Band hone par text select ho jaye
        input.select(); 
        
        // Thoda delay taaki selection dikhe, phir band ho
        setTimeout(() => {
            s.style.display = 'none';
            input.value = ''; 
            render(); 
        }, 150);
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

async function deleteMultiple() { 
    const count = selectedIndices.size;
    if (!confirm(`Kya aap ye ${count} items delete karna chahte hain?`)) return;

    showLoading("Deleting...");
    try {
        const activeFolder = currentPath[currentPath.length - 1]; 
        
        // Items ko piche se delete karna zaroori hai taaki index na badle
        const sortedIndices = Array.from(selectedIndices).sort((a, b) => b - a);
        
        sortedIndices.forEach(index => {
            activeFolder.children.splice(index, 1);
        });

        // Selection saaf karo aur cloud par save karo
        clearSelection(); 
        await saveInventory(); // Sirf inventory update karein
        
        render(); // UI refresh
        hideLoading();
    } catch (error) {
        console.error("Delete failed:", error);
        hideLoading();
        alert("Delete nahi ho paya. Connection check karein.");
    }
}

// Edit Fix
function startEditFromBar() { 
    const idx = Array.from(selectedIndices)[0]; 
    editTargetIndex = idx; 
        const activeFolder = currentPath[currentPath.length - 1];
    const activeItem = activeFolder.children[idx];
    
    // Modal title aur input ko update karein
    document.getElementById('modalTitle').innerText = `Editing: ${activeItem.name}`;
    document.getElementById('masterInput').value = activeItem.name; 
    
    // Selection mode band karke modal dikhayein
    clearSelection();
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
function hideHistoryScreen() {
    document.getElementById('historyView').style.display = 'none';
    const adminView = document.getElementById('adminView');
    adminView.style.display = 'block';
    
    // Scroll Fix: Forcefully ensure list-container is scrollable
    const displayArea = document.getElementById('displayArea');
    if (displayArea) {
        displayArea.style.overflowY = 'auto';
        displayArea.scrollTop = 0; // Wapas top par le aao
    }
    
    render(); // UI ko refresh karein taaki elements wapas load ho jayein
}


function showHistoryList() {
    const area = document.getElementById('historyList');
    if (history.length === 0) {
        area.innerHTML = '<p style="text-align:center; padding:20px;">No history yet.</p>';
        return;
    }

    area.innerHTML = '';
    // Sabse latest order pehle dikhane ke liye reverse()
    [...history].reverse().forEach((order) => {
        const date = new Date(order.date).toLocaleString();
        const card = document.createElement('div');
        card.className = 'history-card';
        card.style = "background:white; margin-bottom:15px; border-radius:12px; border:1px solid #eee; overflow:hidden;";
        
        // Items ka HTML banane wala logic
        const itemsHtml = order.items.map(it => {
            // Smart Name Logic: Same toggle check jaisa bucket mein tha
            const pathParts = it.path.split(' > ');
            let activeSegments = [];
            let currentCheck = inventory;
            
            pathParts.forEach((part, pIdx) => {
                if (part === "Home") return;
                let folder = currentCheck.children ? currentCheck.children.find(c => c.name === part) : null;
                if (folder) {
                    if (pIdx > 1 && folder.showInReport === true) {
                        activeSegments.push(part);
                    }
                    currentCheck = folder;
                }
            });

            const smartName = activeSegments.length > 0 
                ? activeSegments.join(' ') + ' ' + it.name 
                : it.name;

            return `
                <div style="display:flex; justify-content:space-between; padding:8px 15px; border-bottom:1px solid #f9f9f9;">
                    <span style="font-size:14px; color:#333; font-weight:500;">${capitalizeFirstLetter(smartName)}</span>
                    <span style="font-weight:bold; color:var(--primary);">Qty: ${it.qty}</span>
                </div>`;
        }).join('');

        card.innerHTML = `
            <div style="background:#f8fafc; padding:10px 15px; font-size:12px; font-weight:bold; border-bottom:1px solid #eee; display:flex; justify-content:space-between;">
                <span>📅 ${date}</span>
                <span>${order.items.length} Items</span>
            </div>
            <div>${itemsHtml}</div>
        `;
        area.appendChild(card);
    });
}

async function downloadSingleCategory(categoryName) {
    const btn = document.getElementById(`dl-btn-${categoryName}`);
    
    // 1. Us category ka card dhundho loader ke liye
    const allGroups = document.querySelectorAll('.bucket-group-card');
    let targetCard = null;
    allGroups.forEach(card => {
        if(card.innerText.includes(categoryName)) targetCard = card;
    });

    // Button par shimmer aur card par processing class
    if (btn) btn.classList.add('btn-loading');
    if (targetCard) targetCard.classList.add('category-processing');

    // Quantities Sync
syncAllQuantities(); 
    const itemsToDownload = bucket.filter(item => {
        const parts = item.path.split(' > ');
        return (parts[1] || "General") === categoryName;
    });

    const captureContainer = document.getElementById('image-capture-container');
    captureContainer.style.visibility = 'visible';
    captureContainer.style.left = '0';
    captureContainer.style.top = '0';

    try {
        // --- AAPKA DESIGN CODE START ---
        captureContainer.innerHTML = `
            <div id="capture-box" style="width: 400px; background: #ffffff; padding: 15px; font-family: ui-monospace, monospace; border: 1px solid #e0e0e0; border-radius: 8px;">
                <div style="border-bottom: 3px solid #2e7d32; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end;">
                    <div>
                        <h2 style="margin: 0; color: #212121; font-size: 20px; text-transform: uppercase;">${categoryName}</h2>
                        <span style="font-size: 11px; color: #757575;">Report • ${new Date().toLocaleDateString('en-GB')}</span>
                    </div>
                    <div style="font-size: 12px; font-weight: bold; color: #616161;">Total: ${itemsToDownload.length} Items</div>
                </div>
                <div style="display: flex; background: #455a64; color: white; padding: 7px 10px; font-size: 11px; font-weight: bold; border-radius: 4px 4px 0 0;">
                    <div style="width: 30px; color:white;">SR.</div>
                    <div style="flex: 3; color:white; padding-left:5px;">ITEM DESCRIPTION</div>
                    <div style="flex: 1; text-align: right; color:white;">QTY</div>
                </div>
                <div style="border: 1px solid #cfd8dc; border-top: none;">
                    ${itemsToDownload.map((it, idx) => {
                        let pathParts = it.path.split(' > ');
                        let activePathSegments = [];
                        let currentCheck = inventory;
                        pathParts.forEach((part, pIdx) => {
                            if (part === "Home") return;
                            let folder = currentCheck.children ? currentCheck.children.find(c => c.name === part) : null;
                            if (folder) {
                                if (pIdx > 1 && folder.showInReport === true) activePathSegments.push(part);
                                currentCheck = folder;
                            }
                        });
                        let displayName = activePathSegments.length > 0 ? activePathSegments.join(' ') + ' ' + it.name : it.name;
                        return `
                            <div style="display: flex; align-items: center; padding: 10px; border-bottom: 1px solid #eceff1;">
                                <div style="width: 30px; font-size: 11px; color: #9e9e9e; font-weight:bold;">${idx + 1}.</div>
                                <div style="flex: 3; padding-left: 5px;">
                                    <div style="font-weight: 700; font-size: 14px; color: #212121; line-height: 1.2;">
                                        ${capitalizeFirstLetter(displayName)}
                                    </div>
                                </div>
                                <div style="flex: 1; text-align: right; font-weight: 900; font-size: 17px; color: #2e7d32;">
                                    ${it.qty}
                                </div>
                            </div>`;
                    }).join('')}
                </div>
                <div style="margin-top: 10px; padding-top: 8px; font-size: 9px; color: #bdbdbd; display: flex; justify-content: space-between;">
                    <span>Stock-Master Ultra</span>
                    <span>${new Date().toLocaleTimeString()}</span>
                </div>
            </div>`;
        // --- AAPKA DESIGN CODE END ---

        await new Promise(res => setTimeout(res, 1000));

        const captureBox = document.getElementById('capture-box');
        const canvas = await html2canvas(captureBox, {
            scale: 3,
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false
        });

        const dataUrl = canvas.toDataURL("image/png", 1.0);
        const link = document.createElement('a');
        link.download = `${categoryName}_Report_${new Date().getTime()}.png`;
        link.href = dataUrl;
        link.click();

        // Data Cleanup
        const orderEntry = { date: new Date().toISOString(), items: JSON.parse(JSON.stringify(itemsToDownload)) };
        history.push(orderEntry);
        bucket = bucket.filter(item => (item.path.split(' > ')[1] || "General") !== categoryName);

        await saveBucket(); 
        await historyRef.set({ orders: history });

        captureContainer.style.visibility = 'hidden';
        if (targetCard) targetCard.classList.remove('category-processing');
        if (btn) btn.classList.remove('btn-loading');
        
        // Function ke end mein jahan Cleanup hai:
bucket = bucket.filter(item => (item.path.split(' > ')[1] || "General") !== categoryName);
await saveBucket();

// Yahan focus bachane ka logic:
if (bucket.length === 0) {
    showBucketScreen(); // Agar bucket khali hai toh empty state dikhao
} else {
    // Agar bucket mein abhi bhi items hain, toh sirf loader hatao
    if (targetCard) targetCard.remove(); // Us category card ko list se hata do bina poora page refresh kiye
    if (btn) btn.classList.remove('btn-loading');
    document.getElementById('bucketBadge').innerText = bucket.length;
}

        render();

    } catch (error) {
        console.error(error);
        if (targetCard) targetCard.classList.remove('category-processing');
        if (btn) btn.classList.remove('btn-loading');
    }

    
}



function showBucketScreen() {
    document.getElementById('adminView').style.display = 'none';
    document.getElementById('bucketView').style.display = 'flex';
    
    const area = document.getElementById('bucketItemsList'); 
    
    if (bucket.length === 0) {
        area.innerHTML = `
            <div style="text-align:center; padding:40px; border:2px dashed #ccc; border-radius:20px; margin: 20px;">
                <div style="font-size:50px;">🛒</div>
                <h3 style="color: var(--text-sec);">Bucket Khali Hai!</h3>
                <button onclick="hideBucketScreen()" style="background:var(--primary); color:white; border:none; padding:10px 20px; border-radius:50px; margin-top:15px; cursor:pointer;">🚀 Items Add Karein</button>
            </div>`;
        return;
    }

    area.innerHTML = '';
    const grouped = groupBucketItems();

    for (const [category, items] of Object.entries(grouped)) {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'bucket-group-card';
        
        groupDiv.innerHTML = `

<div class="group-header" style="background:#f8fafc; padding:10px 15px; display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid #eee;">
    <span style="font-weight:700; color:var(--primary); font-size:13px;">📦 ${category}</span>
    <div class="button-group"> <button id="dl-btn-${category}" class="btn-icon btn-png-dl" onclick="downloadSingleCategory('${category}')" title="Download PNG">
            📥
        </button>
        <button id="share-img-${category}" class="btn-icon btn-whatsapp-img btn-icon-wa" onclick="shareImageToWhatsApp('${category}')" title="Share Image">
            🖼️
        </button>
        <button class="btn-icon btn-whatsapp-text btn-icon-wa" onclick="shareToWhatsApp('${category}')" title="Share Text">
            💬
        </button>
    </div>
</div>

            <div class="group-body" style="background:white;">
                ${items.map(it => `
                    <div class="order-row" style="display:flex; justify-content:space-between; align-items:center; padding:12px 15px; border-bottom:1px solid #f1f5f9;">
                        <div style="flex:1;">
                            <strong style="display:block; font-size:14px; color:var(--dark);">${it.displayName}</strong>
                            <small style="color:var(--text-sec); font-size:11px;">${it.path}</small>
                        </div>
                        <div style="display:flex; gap:12px; align-items:center;">
<input type="number" class="qty-input" 
       data-path="${it.path}" 
       data-name="${it.name}"
       id="qty-${it.originalIndex}" 
       value="${it.qty || 1}" 
       onchange="updateBucketQtyDirect(this)"
       onkeydown="focusNextInput(event, ${it.originalIndex})"
       onclick="this.select()"
       style="width:55px; height:35px; text-align:center; border:1px solid #cbd5e1; border-radius:8px; font-weight:bold;">

                            <button onclick="removeFromBucket(${it.originalIndex})" 
                                    style="color:var(--danger); background:none; border:none; font-size:24px; cursor:pointer; padding:5px;">&times;</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        area.appendChild(groupDiv);
    }
}

// Helper function qty update karne ke liye
function updateBucketQty(index, val) {
    bucket[index].qty = val;
    saveBucket(); // Cloud par update
}

function groupBucketItems() {
    const grouped = {};
    bucket.forEach((item, index) => {
        const pathParts = item.path.split(' > ');
        const topCat = capitalizeFirstLetter(pathParts[1] || "General");

        let activeSegments = [];
        let currentCheck = inventory;
        
        pathParts.forEach((part, pIdx) => {
            if (part === "Home") return;
            let folder = currentCheck.children ? currentCheck.children.find(c => c.name === part) : null;
            if (folder) {
                // pIdx > 1 matlab 'Packets' ke baad wale folders (e.g. Lays, Wafer)
                if (pIdx > 1 && folder.showInReport === true) {
                    activeSegments.push(part);
                }
                currentCheck = folder;
            }
        });

        // Toggle ON segments + Item name
        const smartName = activeSegments.length > 0 
            ? activeSegments.join(' ') + ' ' + item.name 
            : item.name;

        if (!grouped[topCat]) grouped[topCat] = [];
        
        grouped[topCat].push({ 
            ...item, 
            displayName: capitalizeFirstLetter(smartName), // Yeh display ke liye hai
            originalIndex: index 
        });
    });
    return grouped;
}




// --- Updated Order Download & Clear Logic ---








function focusNextInput(event, currentIndex) {
    if (event.key === "Enter") {
        event.preventDefault(); // Enter dabane par keyboard band hone ya submit hone se roke
        
        const allInputs = Array.from(document.querySelectorAll('.qty-input'));
        
        const currentPos = allInputs.findIndex(input => input.id === `qty-${currentIndex}`);
        
        if (currentPos !== -1 && allInputs[currentPos + 1]) {
            const nextInput = allInputs[currentPos + 1];
            nextInput.focus(); // Agle box par cursor le jao
            nextInput.select(); // Likha hua text select kar lo taaki turant change ho sake
        } else {
            document.activeElement.blur();
        }
    }
}

function saveOrderToHistory() {
    if (bucket.length === 0) return;
    let entry = { 
        date: new Date().toISOString(), // Valid ISO date string
        items: [] 
    };
    
const allQtyInputs = document.querySelectorAll('.qty-input');
allQtyInputs.forEach(input => {
    // ID se index nikalein (e.g., "qty-5" se 5)
    const originalIdx = input.id.split('-')[1];
    if (bucket[originalIdx]) {
        bucket[originalIdx].qty = input.value || 1;
    }
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
        displayArea.innerHTML = `
            <div class="empty-view" style="text-align: center; padding: 50px 20px; opacity: 0.6;">
                <div style="font-size: 60px; margin-bottom: 15px;">📂</div>
                <h3 style="margin: 0; color: var(--text-main);">Folder is Empty</h3>
                <p style="font-size: 14px; color: var(--text-sec);">Tap the 3-dot menu to add items here.</p>
                <button onclick="showAddModal()" style="margin-top: 15px; padding: 10px 20px; border-radius: 50px; border: none; background: var(--primary); color: white; font-weight: bold;">➕ Add Now</button>
            </div>`;
        return; 
    }
else {
activeFolder.children.forEach((item, index) => {
    let effectiveType = item.type;
    if (item.type === 'category' && (!item.children || item.children.length === 0)) {
        effectiveType = 'product';
    }

    const div = document.createElement('div');
    const isMulti = selectedIndices.has(index);
    div.className = `item-card ${effectiveType} ${isMulti ? 'multi-selected' : ''}`;
    
    const inBucket = isAlreadyInBucket(item.name, getPathString());
    div.onmousedown = div.ontouchstart = () => {
        pressTimer = setTimeout(() => { selectionMode = true; toggleSelection(index); }, 1800);
    };
    div.onmouseup = div.ontouchend = () => clearTimeout(pressTimer);
        div.onclick = (e) => {
        if (selectionMode || selectedIndices.size > 0) {
            toggleSelection(index);
        } 
        else if (effectiveType === 'category') {
            currentPath.push(item);
            render();
        }
    };
if (item.type === 'category' && (!item.children || item.children.length === 0)) {
    item.type = 'product';
    item.children = null;
    saveInventory(); // Cloud par update
}
const isAtHome = (currentPath.length === 1 && currentPath[0].name === "Home");
const toggleHtml = (item.type === 'category' && !isAtHome) ? `
    <div class="toggle-container" onclick="event.stopPropagation();">
        <label class="switch">
            <input type="checkbox" ${item.showInReport === true ? 'checked' : ''} 
                   onchange="updateToggleStatus(${index}, this.checked)">
            <span class="slider round"></span>
        </label>
        <small style="display:block; font-size:9px; color:var(--text-sec);">Report</small>
    </div>` : '';

div.innerHTML = `
    <div class="item-name">
        <button class="add-sub-inline" onclick="event.stopPropagation(); showAddModalForSub(${index})">+</button>
        <span class="icon">${effectiveType === 'category' ? '📁' : '🔹'}</span>
        <div style="display:flex; flex-direction:column">
            <span class="text">${capitalizeFirstLetter(item.name)}</span>
        </div>
    </div>
    <div class="actions" style="display:flex; align-items:center; gap:10px;">
        ${toggleHtml}
        ${inBucket ? '<span class="added-label">✅</span>' : 
        `<button class="btn-bucket-add" onclick="event.stopPropagation(); addToBucket(${index})">🛒+</button>`}
    </div>
`;
    displayArea.appendChild(div);
});
    }}
    async function clearHistory() {
    if (!confirm("Are you sure you want to delete all history? This will also remove it from the Cloud!")) return;
    showLoading(); 
    try {
        history = [];
        await historyRef.set({ orders: [] });
        showHistoryList(); 
        hideLoading();
    } catch (error) {
        console.error("Clear History Failed:", error);
        hideLoading();
        alert("Failed to clear history. Check your connection.");
    }
}
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
async function updateToggleStatus(index, isChecked) {
    const activeFolder = currentPath[currentPath.length - 1];
    activeFolder.children[index].showInReport = isChecked;
    
    await saveInventory(); 
    console.log("Toggle Status Saved:", isChecked);
}
// 1. WhatsApp Par Text Report Bhejne ke liye

async function shareImageToWhatsApp(categoryName) {
    const btn = document.getElementById(`share-img-${categoryName}`);
    const captureContainer = document.getElementById('image-capture-container');
    
    // 1. Loader aur UI protection
    const allGroups = document.querySelectorAll('.bucket-group-card');
    let targetCard = null;
    allGroups.forEach(card => { if(card.innerText.includes(categoryName)) targetCard = card; });

    if(targetCard) targetCard.classList.add('category-processing');
    if(btn) btn.innerText = "⏳...";

    try {
        // 2. Data Sync aur Filter
        bucket.forEach((item, idx) => {
            const qtyInput = document.getElementById(`qty-${idx}`);
            if (qtyInput) item.qty = qtyInput.value || 1;
        });

        const itemsToDownload = bucket.filter(item => {
            const parts = item.path.split(' > ');
            return (parts[1] || "General") === categoryName;
        });

        // 3. Dynamic Element Creation (Yeh step missing tha)
        captureContainer.style.visibility = 'visible';
        captureContainer.style.left = '0';
        
        // Yahan wahi HTML template aayega jo aapne pehle script.js mein dekha tha


captureContainer.innerHTML = `
            <div id="capture-box" style="width: 400px; background: #ffffff; padding: 15px; font-family: ui-monospace, monospace; border: 1px solid #e0e0e0; border-radius: 8px;">
                <div style="border-bottom: 3px solid #2e7d32; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end;">
                    <div>
                        <h2 style="margin: 0; color: #212121; font-size: 20px; text-transform: uppercase;">${categoryName}</h2>
                        <span style="font-size: 11px; color: #757575;">Report • ${new Date().toLocaleDateString('en-GB')}</span>
                    </div>
                    <div style="font-size: 12px; font-weight: bold; color: #616161;">Total: ${itemsToDownload.length} Items</div>
                </div>
                <div style="display: flex; background: #455a64; color: white; padding: 7px 10px; font-size: 11px; font-weight: bold; border-radius: 4px 4px 0 0;">
                    <div style="width: 30px; color:white;">SR.</div>
                    <div style="flex: 3; color:white; padding-left:5px;">ITEM DESCRIPTION</div>
                    <div style="flex: 1; text-align: right; color:white;">QTY</div>
                </div>
                <div style="border: 1px solid #cfd8dc; border-top: none;">
                    ${itemsToDownload.map((it, idx) => {
                        let pathParts = it.path.split(' > ');
                        let activePathSegments = [];
                        let currentCheck = inventory;
                        pathParts.forEach((part, pIdx) => {
                            if (part === "Home") return;
                            let folder = currentCheck.children ? currentCheck.children.find(c => c.name === part) : null;
                            if (folder) {
                                if (pIdx > 1 && folder.showInReport === true) activePathSegments.push(part);
                                currentCheck = folder;
                            }
                        });
                        let displayName = activePathSegments.length > 0 ? activePathSegments.join(' ') + ' ' + it.name : it.name;
                        return `
                            <div style="display: flex; align-items: center; padding: 10px; border-bottom: 1px solid #eceff1;">
                                <div style="width: 30px; font-size: 11px; color: #9e9e9e; font-weight:bold;">${idx + 1}.</div>
                                <div style="flex: 3; padding-left: 5px;">
                                    <div style="font-weight: 700; font-size: 14px; color: #212121; line-height: 1.2;">
                                        ${capitalizeFirstLetter(displayName)}
                                    </div>
                                </div>
                                <div style="flex: 1; text-align: right; font-weight: 900; font-size: 17px; color: #2e7d32;">
                                    ${it.qty}
                                </div>
                            </div>`;
                    }).join('')}
                </div>
                <div style="margin-top: 10px; padding-top: 8px; font-size: 9px; color: #bdbdbd; display: flex; justify-content: space-between;">
                    <span>Stock-Master Ultra</span>
                    <span>${new Date().toLocaleTimeString()}</span>
                </div>
            </div>`;

        // 4. Wait for Render & Capture
        await new Promise(res => setTimeout(res, 500)); 
        const captureBox = document.getElementById('capture-box'); // Ab yeh element mil jayega!

        if (!captureBox) throw new Error("Capture box not found");

        const canvas = await html2canvas(captureBox, { scale: 3, useCORS: true });
        
        canvas.toBlob(async (blob) => {
            if (!blob) return;
            const file = new File([blob], `${categoryName}_Report.png`, { type: 'image/png' });
            
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: `Report: ${categoryName}` });
            } else {
                alert("Browser share support nahi karta.");
            }

            // Cleanup
            captureContainer.style.visibility = 'hidden';
            captureContainer.style.left = '-2000px';
            if(targetCard) targetCard.classList.remove('category-processing');
            if(btn) btn.innerText = "🖼️ Share";
        }, 'image/png');

    } catch (error) {
        console.error("Share error:", error);
        alert("Sharing failed: " + error.message);
        if(targetCard) targetCard.classList.remove('category-processing');
        if(btn) btn.innerText = "🖼️ Share";
    }
    
    // navigator.share ke baad cleanup logic:
bucket = bucket.filter(item => (item.path.split(' > ')[1] || "General") !== categoryName);
await saveBucket(); // Cloud update
showBucketScreen(); // Sirf tabhi refresh karega jab zarurat ho
render(); 

}



function updateBucketQtyDirect(input) {
    const path = input.getAttribute('data-path');
    const name = input.getAttribute('data-name');
    
    // Bucket mein woh item dhundho jiska name aur path match ho
    const item = bucket.find(it => it.name === name && it.path === path);
    if (item) {
        item.qty = input.value || 1;
        saveBucket(); // Cloud update
    }
}

function shareToWhatsApp(categoryName) {
    // 1. Pehle quantities sync karein
    syncAllQuantities();

    // 2. Variables define karein (Error Fix)
    const allGroups = document.querySelectorAll('.bucket-group-card');
    let targetCard = null;
    allGroups.forEach(card => {
        if(card.innerText.includes(categoryName)) targetCard = card;
    });

    // Hum text share mein button loader nahi dikhayenge kyunki ye instant hota hai
    
    if (targetCard) targetCard.classList.add('category-processing');

    // 3. Category items filter karein
    const items = bucket.filter(item => {
        const parts = item.path.split(' > ');
        return (parts[1] || "General") === categoryName;
    });

    if (items.length === 0) {
        alert("Is category mein koi item nahi hai!");
        if (targetCard) targetCard.classList.remove('category-processing');
        return;
    }

    // 4. WhatsApp Message Build karein
    let message = `*📦 ${categoryName.toUpperCase()} REPORT*\n`;
    message += `📅 Date: ${new Date().toLocaleDateString('en-GB')}\n`;
    message += `--------------------------\n`;

    items.forEach((it, idx) => {
        const pathParts = it.path.split(' > ');
        let activeSegments = [];
        let currentCheck = inventory;
        
        pathParts.forEach((part, pIdx) => {
            if (part === "Home") return;
            let folder = currentCheck.children ? currentCheck.children.find(c => c.name === part) : null;
            if (folder) {
                if (pIdx > 1 && folder.showInReport === true) activeSegments.push(part);
                currentCheck = folder;
            }
        });

        const smartName = activeSegments.length > 0 ? activeSegments.join(' ') + ' ' + it.name : it.name;
        
        // Input se value uthao ya bucket se
        const qtyInput = document.getElementById(`qty-${it.originalIndex}`);
        const finalQty = qtyInput ? qtyInput.value : (it.qty || 1);

        message += `${idx + 1}. *${capitalizeFirstLetter(smartName)}* → _Qty: ${finalQty}_\n`;
    });

    message += `--------------------------\n`;
    message += `_Generated via Stock-Master Ultra_`;

    // 5. WhatsApp Open karein
    const encodedMsg = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMsg}`, '_blank');

    // 6. Success Cleanup (Bina keyboard disturb kiye)
    bucket = bucket.filter(item => {
        const parts = item.path.split(' > ');
        return (parts[1] || "General") !== categoryName;
    });

    saveBucket(); 

    if (bucket.length === 0) {
        showBucketScreen(); 
    } else {
        if (targetCard) {
            targetCard.style.opacity = '0';
            targetCard.style.transform = 'translateX(20px)';
            targetCard.style.transition = '0.3s ease';
            setTimeout(() => {
                targetCard.remove(); 
                document.getElementById('bucketBadge').innerText = bucket.length;
            }, 500); // 500ms kafi hai sober effect ke liye
        }
    }
}
function syncAllQuantities() {
    const allInputs = document.querySelectorAll('.qty-input');
    allInputs.forEach(input => {
        const path = input.getAttribute('data-path');
        const name = input.getAttribute('data-name');
        const item = bucket.find(it => it.name === name && it.path === path);
        if (item) {
            item.qty = input.value || 1;
        }
    });
               }
                      
