// Global User Data
let userName = localStorage.getItem('sm_user_name') || "";

// 1. Check if user is new
function checkFirstVisit() {
    if (!userName) {
        document.getElementById('welcomeModal').style.display = 'flex';
    } else {
        // Agar naam hai, toh loader ke baad data dikhao
        loadUserData();
    }
}

// 2. Save Name Function
function saveUserName() {
    const inputName = document.getElementById('userNameInput').value.trim();
    if (inputName.length < 2) {
        alert("Please enter a valid name.");
        return;
    }
    
    // Save to localStorage
    localStorage.setItem('sm_user_name', inputName);
    userName = inputName;
    
    // Hide modal and start app
    document.getElementById('welcomeModal').style.display = 'none';
    
    // Custom Welcome Notification (Agar permission hai)
    loadUserData();
}

// 3. Modified start app logic
window.addEventListener('DOMContentLoaded', () => {
    checkFirstVisit();
});

let correctAdminPass = ""; // Cloud se aayega

// Firebase se sahi password fetch karein
async function fetchAdminPassword() {
    const doc = await db.collection("appSettings").doc("security").get();
    if (doc.exists) {
        correctAdminPass = doc.data().adminPass;
    }
}
fetchAdminPassword(); // App start hote hi load ho jayega

let inventory = { name: "Home", type: "category", children: [] };
let currentPath = [inventory];

// Har user ke liye unique ID generate ya load karna
let userID = localStorage.getItem('sm_user_id');
if (!userID) {
    userID = 'user_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('sm_user_id', userID);
}

// Bucket ko localStorage se load karna (Refresh hone par data nahi jayega)
let bucket = JSON.parse(localStorage.getItem('sm_bucket_' + userID)) || [];



// --- 1. SKELETON DEFINITION ---
function showUserSkeleton() {
    const area = document.getElementById('displayArea');
    if (!area) return;
    area.innerHTML = `
        <div class="skeleton"></div>
        <div class="skeleton"></div>
        <div class="skeleton"></div>
        <div class="skeleton"></div>
    `;
}

// --- 2. CLOUD LOAD ---
async function loadUserData() {
    showUserSkeleton();
    try {
        const doc = await db.collection("stock").doc("mainInventory").get();
        if (doc.exists) {
            inventory = doc.data();
            currentPath = [inventory];
            renderUserPage();
        }
    } catch (e) { 
        console.error("Error:", e); 
        document.getElementById('displayArea').innerHTML = "<p style='text-align:center; padding:20px;'>Connection Error. Please refresh.</p>";
    }
}

// --- 3. NAVIGATION & BREADCRUMB FIX ---
function openFolder(idx) {
    const selectedFolder = currentPath[currentPath.length - 1].children[idx];
    currentPath.push(selectedFolder);
    renderUserPage();
}

function goBackTo(idx) {
    currentPath = currentPath.slice(0, idx + 1);
    renderUserPage();
}

// --- 4. RENDER LOGIC ---
function renderUserPage() {
    const active = currentPath[currentPath.length - 1];
    const area = document.getElementById('displayArea');
    const breadcrumbArea = document.getElementById('breadcrumb');

    // Breadcrumb Update (Fix for crumb link)
    breadcrumbArea.innerHTML = '';
    currentPath.forEach((node, idx) => {
        const span = document.createElement('span');
        span.innerHTML = node.name === "Home" ? "🏠 Home" : node.name;
        span.className = "crumb-link";
        span.onclick = () => goBackTo(idx); // Click event added
        breadcrumbArea.appendChild(span);
        
        if (idx < currentPath.length - 1) {
            const sep = document.createElement('span');
            sep.innerText = ' ❯ ';
            sep.className = "breadcrumb-separator";
            breadcrumbArea.appendChild(sep);
        }
    });

    area.innerHTML = '';
    if (!active.children || active.children.length === 0) {
        area.innerHTML = `<div style="text-align:center; padding:50px; opacity:0.5;">📂 Khali hai</div>`;
        return;
    }

    active.children.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'item-card';
        const pathStr = currentPath.map(n => n.name).join(' > ');
        const isInBucket = bucket.some(b => b.name === item.name && b.path === pathStr);

        div.innerHTML = `
            <div class="item-name" style="flex:1" onclick="${item.type === 'category' ? `openFolder(${index})` : ''}">
                <span class="icon">${item.type === 'category' ? '📁' : '🔹'}</span>
                <span class="text">${item.name}</span>
            </div>
            <div class="actions">
                ${isInBucket ? '<span class="added-label">✅</span>' : 
                `<button class="btn-bucket-add" onclick="addToCart(${index})">🛒+</button>`}
            </div>
        `;
        area.appendChild(div);
    });
    updateBadge();
}

// --- 5. SEARCH LOGIC (Universal) ---
function toggleSearch() {
    const s = document.getElementById('searchWrapper');
    const input = document.getElementById('searchInput');
    if (s.style.display === 'none' || s.style.display === '') {
        s.style.display = 'block';
        input.focus();
    } else {
        s.style.display = 'none';
        input.value = '';
        renderUserPage();
    }
}

/*function handleSearch() {
    const term = document.getElementById('searchInput').value.toLowerCase();
    const area = document.getElementById('displayArea');
    if (!term) { renderUserPage(); return; }
    
    const results = [];
    const searchRecursive = (node, path = []) => {
        let pathString = path.length > 0 ? path.map(n => n.name).join(' > ') : "Home";
        if (node.name.toLowerCase().includes(term) && node.name !== "Home") {
            results.push({ node, pathString });
        }
        if (node.children) node.children.forEach(c => searchRecursive(c, [...path, node]));
    };
    
    searchRecursive(inventory, []);
    area.innerHTML = '';
    results.forEach((res) => {
        const div = document.createElement('div');
        div.className = 'item-card';
        const isInBucket = bucket.some(b => b.name === res.node.name && b.path === res.pathString);
        div.innerHTML = `
            <div style="flex:1">
                <small style="color:gray; font-size:0.7rem">${res.pathString}</small><br>
                <div class="item-name"><span>🔹 ${res.node.name}</span></div>
            </div>
            <div class="actions">
                ${isInBucket ? '✅' : `<button class="btn-bucket-add" onclick="addFromSearch('${res.node.name}', '${res.pathString}')">🛒+</button>`}
            </div>`;
        area.appendChild(div);
    });
}*/


// --- 6. BUCKET / CART LOGIC ---
function showBucketScreen() {
    document.getElementById('adminView').style.display = 'none';
    document.getElementById('bucketView').style.display = 'flex';
    renderBucketItems();
}

function hideBucketScreen() {
    document.getElementById('bucketView').style.display = 'none';
    document.getElementById('adminView').style.display = 'flex';
    renderUserPage();
}

function addToCart(idx) {
    const item = currentPath[currentPath.length - 1].children[idx];
    const pathStr = currentPath.map(n => n.name).join(' > ');
    if (!bucket.some(b => b.name === item.name && b.path === pathStr)) {
        bucket.push({ name: item.name, path: pathStr, qty: 1 });
        renderUserPage();
    }
}

function updateBadge() {
    const badge = document.getElementById('bucketBadge');
    if (badge) badge.innerText = bucket.length;
}

// --- BUCKET RENDERING LOGIC ---
function renderBucketItems() {
    const area = document.getElementById('bucketItemsList');
    
    // Empty Bucket UI (Same as script.js)
    if (bucket.length === 0) {
        area.innerHTML = `
            <div style="text-align:center; padding:40px; border:2px dashed #ccc; border-radius:20px; margin: 20px;">
                <div style="font-size:50px;">🛒</div>
                <h3 style="color: var(--text-sec);">Bucket Khali Hai!</h3>
                <button onclick="hideBucketScreen()" style="background:var(--primary); color:white; border:none; padding:10px 20px; border-radius:50px; margin-top:15px; cursor:pointer;">
                    🚀 Items Add Karein
                </button>
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
                <div class="button-group">
                    <button id="dl-btn-${category}" class="btn-icon btn-png-dl" onclick="downloadSingleCategory('${category}')">📥</button>
                    <button id="share-img-${category}" class="btn-icon btn-whatsapp-img" onclick="shareImageToWhatsApp('${category}')">🖼️</button>
                    <button class="btn-icon btn-whatsapp-text" onclick="shareToWhatsApp('${category}')">💬</button>
                </div>
            </div>
            <div class="group-body" style="background:white;">
                ${items.map(it => `
                    <div class="order-row" style="display:flex; justify-content:space-between; align-items:center; padding:12px 15px; border-bottom:1px solid #f1f5f9;">
                        <div style="flex:1;">
                            <strong style="display:block; font-size:14px; color:var(--dark);">${getSmartName(it)}</strong>
                            <small style="color:var(--text-sec); font-size:11px;">${it.path}</small>
                        </div>
                        <div style="display:flex; gap:12px; align-items:center;">
                            <input type="number" class="qty-input" 
                                   id="qty-${it.originalIndex}" 
                                   value="${it.qty || 1}" 
                                   onchange="updateBucketQty(${it.originalIndex}, this.value)"
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
function focusNextInput(event, currentIndex) {
    if (event.key === "Enter") {
        event.preventDefault();
        const allInputs = Array.from(document.querySelectorAll('.qty-input'));
        const currentPos = allInputs.findIndex(input => input.id === `qty-${currentIndex}`);
        
        if (currentPos !== -1 && allInputs[currentPos + 1]) {
            const nextInput = allInputs[currentPos + 1];
            nextInput.focus();
            nextInput.select(); // Likha hua number select ho jayega
        } else {
            document.activeElement.blur();
        }
    }
}

// --- HELPERS ---
function groupBucketItems() {
    const grouped = {};
    bucket.forEach((item, index) => {
        const pathParts = item.path.split(' > ');
        const topCat = pathParts[1] || "General";
        if (!grouped[topCat]) grouped[topCat] = [];
        grouped[topCat].push({ ...item, originalIndex: index });
    });
    return grouped;
}

function updateBucketQty(index, val) {
    bucket[index].qty = val;
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
    let message = `${categoryName.toUpperCase()}\n`;
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

        message += `${idx + 1}. *${smartName}* → _Qty: ${finalQty}_\n`;
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


// Note: downloadSingleCategory ke liye aapko Admin script se html2canvas wala logic copy karna hoga
// --- IMAGE GENERATION & SHARING ---

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
                                        ${displayName}
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
        // html2canvas ke .then block ke andar jahan link.click() hota hai:

// Turant baad aapka custom notification

triggerAppNotification(
    "Stock-Master Ultra", 
    `✅ ${categoryName} ki report download ho gayi hai.`
);


        // Data Cleanup
        const orderEntry = { date: new Date().toISOString(), items: JSON.parse(JSON.stringify(itemsToDownload)) };
        bucket = bucket.filter(item => (item.path.split(' > ')[1] || "General") !== categoryName);


        captureContainer.style.visibility = 'hidden';
        if (targetCard) targetCard.classList.remove('category-processing');
        if (btn) btn.classList.remove('btn-loading');
        
        // Function ke end mein jahan Cleanup hai:
bucket = bucket.filter(item => (item.path.split(' > ')[1] || "General") !== categoryName);

// Yahan focus bachane ka logic:
if (bucket.length === 0) {
    showBucketScreen(); // Agar bucket khali hai toh empty state dikhao
} else {
    // Agar bucket mein abhi bhi items hain, toh sirf loader hatao
    if (targetCard) targetCard.remove(); // Us category card ko list se hata do bina poora page refresh kiye
    if (btn) btn.classList.remove('btn-loading');
    document.getElementById('bucketBadge').innerText = bucket.length;
}


    } catch (error) {
        console.error(error);
        if (targetCard) targetCard.classList.remove('category-processing');
        if (btn) btn.classList.remove('btn-loading');
    }

    
}

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
                        <span style="font-size: 11px; color: #757575;">${new Date().toLocaleDateString('en-GB')}</span>
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
                                        ${displayName}
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
showBucketScreen(); // Sirf tabhi refresh karega jab zarurat ho
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



// --- START APP ---
window.addEventListener('DOMContentLoaded', () => {
    loadUserData();
});


/*function handleSearch() {
    const term = document.getElementById('searchInput').value.toLowerCase();
    const area = document.getElementById('displayArea');
    
    // --- Admin Redirect Logic ---
    // Agar input exact 'admin.html' (10 characters) hai toh redirect karega
    if (term === "admin.html") {
        window.location.href = 'admin.html';
        return; // Aage ka search code nahi chalega
    }

    // Normal search logic niche se shuru hoga
    const lowerTerm = term.toLowerCase();
    if (!lowerTerm) {
        renderUserPage();
        return;
    }
    
    const results = [];
    const searchRecursive = (node, path = []) => {
        let pathString = path.length > 0 ? path.map(n => n.name).join(' > ') : "Home";
        if (node.name.toLowerCase().includes(lowerTerm) && node.name !== "Home") {
            results.push({ node, pathString, hierarchy: [...path, node] });
        }
        if (node.children) {
            node.children.forEach(c => searchRecursive(c, [...path, node]));
        }
    };
    
    searchRecursive(inventory, []);
    area.innerHTML = '';
    
    
    if (!term) {
        renderUserPage();
        return;
    }
    
    /*const results = [];
    const searchRecursive = (node, path = []) => {
        let pathString = path.length > 0 ? path.map(n => n.name).join(' > ') : "Home";
        if (node.name.toLowerCase().includes(term) && node.name !== "Home") {
            results.push({ node, pathString, hierarchy: [...path, node] });
        }
        if (node.children) {
            node.children.forEach(c => searchRecursive(c, [...path, node]));
        }
    };*
    
    searchRecursive(inventory, []);
    area.innerHTML = '';
    
    results.forEach((res) => {
        const div = document.createElement('div');
        div.className = 'item-card';
        const isInBucket = bucket.some(b => b.name === res.node.name && b.path === res.pathString);
        
        // Folder click logic (Admin jaisa navigation)
        div.onclick = () => {
            currentPath = [...res.hierarchy]; 
            if (res.node.type === 'product') currentPath.pop();
            toggleSearch(); 
            renderUserPage(); 
        };

        div.innerHTML = `
            <div style="flex:1">
                <small style="color:var(--text-sec); font-size:0.75rem">${res.pathString}</small><br>
                <div class="item-name">
                    <span>${res.node.type === 'category' ? '📁' : '🔹'} ${res.node.name}</span>
                </div>
            </div>
            <div class="actions">
                ${isInBucket ? '<span class="added-label">✅</span>' : 
                `<button class="btn-bucket-add" onclick="event.stopPropagation(); addFromSearch('${res.node.name}', '${res.pathString}')">🛒+</button>`}
            </div>
        `;
        area.appendChild(div);
    });
}*/


function handleSearch() {
const term = document.getElementById('searchInput').value.trim();    const area = document.getElementById('displayArea');
    
    // Admin Redirect logic (Keep it as is)
if (correctAdminPass && term === correctAdminPass) {
        // Clear input before redirecting so back button doesn't show it
        document.getElementById('searchInput').value = ''; 
        window.location.href = 'admin.html';
        return;
    }
    const lowerTerm = term.toLowerCase();
    if (!lowerTerm) {
        renderUserPage();
        return;
    }
    
    const results = [];
    const seenItems = new Set(); // Duplicates track karne ke liye set

    const searchRecursive = (node, path = []) => {
        let pathString = path.length > 0 ? path.map(n => n.name).join(' > ') : "Home";
        
        // Unique ID banayein (Path + Name) taaki duplicate detect ho sake
        const itemID = `${pathString} > ${node.name}`;

        if (node.name.toLowerCase().includes(lowerTerm) && node.name !== "Home" && !seenItems.has(itemID)) {
            results.push({ node, pathString, hierarchy: [...path, node] });
            seenItems.add(itemID); // Is item ko "seen" mark karein
        }
        
        if (node.children) {
            node.children.forEach(c => searchRecursive(c, [...path, node]));
        }
    };
    
    searchRecursive(inventory, []);
    area.innerHTML = '';
    
    if (results.length === 0) {
        area.innerHTML = `<div class="empty-state"><p>No items found for "${term}"</p></div>`;
        return;
    }

    results.forEach((res) => {
        const div = document.createElement('div');
        div.className = 'item-card';
        const isInBucket = bucket.some(b => b.name === res.node.name && b.path === res.pathString);
        
        div.onclick = () => {
            currentPath = [...res.hierarchy]; 
            if (res.node.type === 'product') currentPath.pop();
            toggleSearch(); 
            renderUserPage(); 
        };

        div.innerHTML = `
            <div style="flex:1">
                <small style="color:var(--text-sec); font-size:0.75rem">${res.pathString}</small><br>
                <div class="item-name">
                    <span>${res.node.type === 'category' ? '📁' : '🔹'} ${res.node.name}</span>
                </div>
            </div>
            <div class="actions">
                ${isInBucket ? '<span class="added-label">✅</span>' : 
                `<button class="btn-bucket-add" onclick="event.stopPropagation(); addFromSearch('${res.node.name}', '${res.pathString}')">🛒+</button>`}
            </div>
        `;
        area.appendChild(div);
    });
}


// Save Bucket function
function saveLocalBucket() {
    localStorage.setItem('sm_bucket_' + userID, JSON.stringify(bucket));
}

function addToCart(idx) {
    const item = currentPath[currentPath.length - 1].children[idx];
    const pathStr = currentPath.map(n => n.name).join(' > ');
    
    if (!bucket.some(b => b.name === item.name && b.path === pathStr)) {
        bucket.push({ name: item.name, path: pathStr, qty: 1 });
        saveLocalBucket(); // Local store mein save karein
        renderUserPage();
    }
}

function removeFromBucket(idx) {
    bucket.splice(idx, 1);
    saveLocalBucket(); // Update storage
    renderBucketItems();
    updateBadge();
}
function addFromSearch(name, path) {
    if (!bucket.some(b => b.name === name && b.path === path)) {
        bucket.push({ name: name, path: path, qty: 1 });
        saveLocalBucket(); // Storage update
        updateBadge();
        handleSearch(); // Refresh list to show ✅
    }
}
// Ye function user-script.js mein updated logic hai
function getSmartName(item) {
    const pathParts = item.path.split(' > ');
    let activeSegments = [];
    let currentCheck = inventory; // Global inventory object

    pathParts.forEach((part, pIdx) => {
        if (part === "Home") return;
        
        // Inventory tree mein us folder ko dhundhein
        let folder = currentCheck.children ? currentCheck.children.find(c => c.name === part) : null;
        
        if (folder) {
            // Agar Admin ne is folder ka toggle ON rakha hai (pIdx > 1 check taaki Home skip ho)
            if (pIdx > 1 && folder.showInReport === true) {
                activeSegments.push(part);
            }
            currentCheck = folder;
        }
    });

    // Toggle ON wale folders + Item ka naam
    return activeSegments.length > 0 
        ? activeSegments.join(' ') + ' ' + item.name 
        : item.name;
}
/*function listenForAdminNotifications() {
    db.collection("notifications").doc("latest").onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            const lastRead = localStorage.getItem('last_notif_time');
            
            // Agar ye naya message hai toh dikhao
            if (data.timestamp > (lastRead || 0)) {
                triggerAppNotification("Stock-Master Update", data.message);
                localStorage.setItem('last_notif_time', data.timestamp);
            }
        }
    });
}*/
// Page load par call karein
listenForAdminNotifications();
function triggerAppNotification(title, message) {
    // Browser check ki kya notifications supported hain
    if (!("Notification" in window)) {
        console.log("This browser does not support desktop notification");
        return;
    }

    // Permission check aur request
    if (Notification.permission === "granted") {
        // Service Worker ke through notification dikhana (PWA ke liye best hai)
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            navigator.serviceWorker.ready.then(registration => {
                registration.showNotification(title, {
                    body: message,
                    icon: 'app-icon.png', // Aapka app icon path
                    badge: 'app-icon.png',
                    vibrate: [100, 50, 100],
                    data: { dateOfArrival: Date.now() }
                });
            });
        } else {
            // Normal browser notification agar service worker na ho
            new Notification(title, { body: message, icon: 'app-icon.png' });
        }
    } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                triggerAppNotification(title, message);
            }
        });
    }
}
function startVoiceSearch() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Aapka browser voice search support nahi karta.");
        return;
    }

    const recognition = new SpeechRecognition();
    const voiceBtn = document.getElementById('voiceSearchBtn');
    const searchInput = document.getElementById('searchInput');
    // SVG icon ko ID se target karein
    const micSvg = document.getElementById('micSvgIcon');

    recognition.lang = 'en-US';
    recognition.interimResults = false;

    recognition.onstart = () => {
        // SVG ko delete karne ke bajaye uska color Red (Danger) karein
        if (micSvg) micSvg.style.color = "var(--danger)"; 
        voiceBtn.classList.add('recording-active'); // Pulse animation ke liye
        searchInput.placeholder = "Listening...";
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        searchInput.value = transcript;
        
        // Admin Redirect Check
        if (transcript.toLowerCase().replace(/\s/g, '') === correctAdminPass) {
            window.location.href = 'admin.html';
            return;
        }
        handleSearch();
    };

    recognition.onspeechend = () => {
        recognition.stop();
        // Waapas Primary (Blue) color kar dein
        if (micSvg) micSvg.style.color = "var(--primary)";
        voiceBtn.classList.remove('recording-active');
        searchInput.placeholder = "Search items...";
    };

    recognition.onerror = () => {
        if (micSvg) micSvg.style.color = "var(--primary)";
        voiceBtn.classList.remove('recording-active');
    };

    recognition.start();
}
function listenForAdminNotifications() {
    db.collection("notifications").doc("latest").onSnapshot(doc => {
        console.log("Notif Data received:", doc.data()); // Check karein console mein
        if (doc.exists) {
            const data = doc.data();
            const lastRead = localStorage.getItem('last_notif_time');
            
            if (!lastRead || data.timestamp > lastRead) {
                triggerAppNotification("Stock-Master Update", data.message);
                localStorage.setItem('last_notif_time', data.timestamp);
            }
        }
    });
}

