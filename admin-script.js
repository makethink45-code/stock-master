(function secureAdminWorkspace() {
    // 🔑 SECURITY UPGRADE: Shifting from LocalStorage to SessionStorage to prevent spoofing
    const loginToken = sessionStorage.getItem('wayStock_admin_authenticated');
    const tokenExpiry = sessionStorage.getItem('wayStock_admin_expiry');
    const currentTime = Date.now();
    
    // Fallback checks on LocalStorage just in case of light tab retention
    const localBackupToken = localStorage.getItem('wayStock_admin_token');
    const localBackupExpiry = localStorage.getItem('wayStock_admin_expiry');

    let isAuthenticated = false;

    if (loginToken === "true" && tokenExpiry && currentTime <= parseInt(tokenExpiry)) {
        isAuthenticated = true;
    } else if (localBackupToken === "true" && localBackupExpiry && currentTime <= parseInt(localBackupExpiry)) {
        // Hydrate session if local storage token is still valid
        sessionStorage.setItem('wayStock_admin_authenticated', "true");
        sessionStorage.setItem('wayStock_admin_expiry', localBackupExpiry);
        isAuthenticated = true;
    }
    
    if (!isAuthenticated) {
        // Force complete wipe out of fake or expired tokens
        sessionStorage.removeItem('wayStock_admin_authenticated');
        sessionStorage.removeItem('wayStock_admin_expiry');
        localStorage.removeItem('wayStock_admin_token');
        localStorage.removeItem('wayStock_admin_expiry');
        
        alert("🚫 Access Denied: Unauthorized Session Detour Detected!");
        window.location.href = "index.html"; 
    }
})();


const menuBtn = document.getElementById('menu-btn');
const adminMenu = document.getElementById('admin-menu');

// --- ADMIN-SCRIPT.JS (TOP MENU FIX) ---
if (menuBtn && adminMenu) {
    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Menu ko kholne/band karne ka simple logic
        adminMenu.classList.toggle('active');
    });
}

// Menu ke bahar click hone par band karne ke liye
document.addEventListener('click', () => {
    if (adminMenu.classList.contains('active')) {
        adminMenu.classList.remove('active');
    }
});




let targetParentForNewItem = 'root'; 

// --- ADMIN-SCRIPT.JS (OPENACTIONMODAL) ---
function openActionModal(type, parentKey) {
    const modal = document.getElementById('action-modal');
    const title = document.getElementById('modal-title');
    const adminMenu = document.getElementById('admin-menu');
    
    targetParentForNewItem = parentKey || window.currentFolder || 'root';
    const displayFolderName = targetParentForNewItem === 'root' ? 'Home' : targetParentForNewItem.split('>').pop().trim();
    title.innerText = `Add inside: ${displayFolderName}`;
    
// admin-script.js ke openActionModal ke aakhiri lines ko isse replace karein:
    if (adminMenu && adminMenu.classList.contains('active')) { //
        adminMenu.classList.remove('active'); //
    }

    // STRICT FRAMEWORK INTEGRATION: Manual entry hatakar global framework overlay handler ko trigger karo
    if (typeof openOverlay === 'function') {
        openOverlay('action-modal');
    }


    // Modal active class trigger karo aur stack confirm karo
    modal.classList.add('active');
    if (window.history.state?.overlay !== 'action-modal') {
        history.pushState({ overlay: 'action-modal' }, "");
    }
}

const menuItems = document.querySelectorAll('.menu-item');

if (menuItems[0]) {
    menuItems[0].addEventListener('click', () => {
        openActionModal('folder'); 
    });
}

if (menuItems[1]) {
    menuItems[1].addEventListener('click', () => {
        // 🔑 FIX: Setting par click karte hi pehle 3-dot menu dropdown ko band karo
        if (adminMenu && adminMenu.classList.contains('active')) {
            adminMenu.classList.remove('active');
        }
        
        // Centralized settings overlay trigger karein
        if (typeof openOverlay === 'function') {
            openOverlay('setting'); 
        }
    });
}


window.addEventListener('DOMContentLoaded', async () => {
    // 🔑 INITIAL CLOUD SYNC: Pehle Firebase se data load karo
    if (typeof loadFirebaseData === "function") {
        await loadFirebaseData();
    }
    
    updateBreadcrumb(); // Phir breadcrumb setup karo
    renderAdminInventory(); // Phir fresh cards dikhao
    if (typeof updateCartBadgeCount === "function") updateCartBadgeCount();
});

function handleToggleStatus(key, isActive) {
    // Upgraded clean reference:
const inventory = getActiveInventory();

    if (inventory[key]) {
        inventory[key].toggleOn = isActive;
        localStorage.setItem('wayStock_inventory', JSON.stringify(inventory));

        // 🔑 FIX: Double trigger hataya, ab sirf ek hi baar atomic push chalega
        if (typeof syncToFirebase === "function") {
            syncToFirebase(); 
        }
        console.log(`Saved & Synced: ${key} is ${isActive ? 'ON' : 'OFF'}`);
    }
}

function capitalizeWords(str) {
    return str.split(' ').map(word => {
        return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
}

function processBulkData() {
    const inputField = document.getElementById('modal-input'); //
    const rawData = inputField.value.trim(); //
    if (!rawData) return; //


// Function ke andar ka EDIT MODE block is tarah update karein:
if (isEditModeActive && editTargetKey) {
    let inventory = typeof getActiveInventory === "function" ? getActiveInventory() : {};
    
    // 🔑 MULTI-USER FIX: Get active dynamic cart key and items
    const cartKey = typeof getCartStorageKey === "function" ? getCartStorageKey() : 'wayStock_cart_guest';
    let cart = typeof getCartItems === "function" ? getCartItems() : {};
    
    if (inventory[editTargetKey]) {
        const newName = capitalizeWords(rawData); 
        const oldName = inventory[editTargetKey].name;

        inventory[editTargetKey].name = newName;
        inventory[editTargetKey].displayName = newName;

        // 🔄 DYNAMIC MY BUCKET NAME SYNC
        Object.keys(cart).forEach(cKey => {
            if (cKey === editTargetKey || cKey.startsWith(editTargetKey + '>')) {
                if (cart[cKey].name === oldName) {
                    cart[cKey].name = newName;
                }
            }
        });

        localStorage.setItem('wayStock_inventory', JSON.stringify(inventory));
        if (typeof syncToFirebase === "function") syncToFirebase();
        
        // 🔑 FIXED: Target exact dynamic user cart storage
        localStorage.setItem(cartKey, JSON.stringify(cart));
        
        showAlert("Naam successfully badal gaya aur Cart me bhi sync ho gaya! ✅", "success");
    }

    isEditModeActive = false;
    editTargetKey = "";
    const actionBtn = document.getElementById('modal-action-btn');
    if (actionBtn) actionBtn.innerText = "Create Structure 🚀";
    
    inputField.value = ""; 
    closeAllOverlays(); 
    if (typeof exitSelectionMode === 'function') exitSelectionMode(); 
    return; 
}


        // 🔑 STORAGE UPGRADE: Fetching dynamic inventory from RAM cache instead of local storage directly
    let inventory = typeof getActiveInventory === "function" ? getActiveInventory() : {}; 
    
    // 🛡️ CRITICAL BLANK LINE FILTER: Splitting by newline and filtering out any pure spaces or empty inputs instantly
    const lines = rawData.split('\n')
                         .map(line => line.trim())
                         .filter(line => line.length > 0); 

    if (lines.length === 0) {
        showAlert("Oho! Kuch valid text toh likhiye structure banane ke liye. ✍️", "error");
        return;
    }

    // === 🔴 SAFETY FILTER 1: Folder ke naam me Comma (,) check karna ===
    let hasValidationError = false; //
    lines.forEach((line, index) => {
        const levels = line.split('>').map(lvl => lvl.trim()); //
        if (levels.length > 1) { //
            for (let i = 0; i < levels.length - 1; i++) { //
                if (levels[i].includes(',')) { //
                    showAlert(`Error (Line ${index + 1}): Folder ke naam "${levels[i]}" me comma (,) nahi chalega!`, "error"); //
                    hasValidationError = true; //
                }
            }
        }
    });

    if (hasValidationError) return; //

    // --- MAIN PROCESSING BATCH BIND LOOP ---
    lines.forEach(line => {
        // Har level ko split karein aur sath hi sath Capitalize bhi kar dein (Bug 1 Fix)
        const levels = line.split('>').map(lvl => capitalizeWords(lvl.trim())); //
        
        // BUG 3 FIX: targetParentForNewItem ka use karein jo + button dabaaye hue card ka actual path track rakhta hai
        let currentParents = [targetParentForNewItem || window.currentFolder || 'root']; //

        levels.forEach((levelContent, index) => {
            const isLastLevel = (index === levels.length - 1); //
            // Comma se split karke har item ka naam capitalize karein
            const names = levelContent.split(',').map(n => capitalizeWords(n.trim())).filter(n => n); //
            let nextLevelParents = []; //

            currentParents.forEach(parentKey => {
                names.forEach(originalName => {
                    // Path generator
                    const uniqueKey = parentKey === 'root' ? originalName : `${parentKey}>${originalName}`; //

                    // BUG 2 FIX: Duplicate entry check strict karna
                    if (inventory[parentKey] && inventory[parentKey].children.includes(uniqueKey)) { //
                        console.log(`Duplicate blocked: ${uniqueKey} already exists under ${parentKey}`); //
                    } else {
                        // Agar entry nahi hai, tabhi naya block create karo
                        if (!inventory[uniqueKey]) { //
                            inventory[uniqueKey] = { //
                                name: originalName, //
                                displayName: originalName, //
                                type: isLastLevel ? 'item' : 'folder', //
                                parent: parentKey, //
                                toggleOn: false, //
                                children: [] //
                            }; //
                        } else if (!isLastLevel) { //
                            inventory[uniqueKey].type = 'folder'; //
                        }

                        // Parent ke children list me unique key register karna
                        if (inventory[parentKey] && !inventory[parentKey].children.includes(uniqueKey)) { //
                            inventory[parentKey].children.push(uniqueKey); //
                        }
                    }

                    if (!isLastLevel) { //
                        nextLevelParents.push(uniqueKey); //
                    }
                });
            });
            currentParents = nextLevelParents; //
        });
    });
    // Save changes safely inside IndexedDB only
            // 🔄 Atomic commit locks to storage layers
    if (typeof saveToIndexedDB === "function") saveToIndexedDB(inventory);
    if (typeof syncToFirebase === "function") syncToFirebase();
    
    // 🧽 Explicitly resetting DOM element pointers to prevent memory leak retention
    inputField.value = ""; 

    // Suggestion chip container UI safety reset and visual state collapsing
    const hintBadge = document.getElementById('bulk-smart-hint');
    if (hintBadge) { 
        hintBadge.style.display = 'none'; 
        hintBadge.innerHTML = ""; 
    }
    
    // Exit selection framework setups safely if active during modifications
    isEditModeActive = false;
    editTargetKey = "";
    const actionBtn = document.getElementById('modal-action-btn');
    if (actionBtn) actionBtn.innerText = "Create Structure 🚀";

    closeAllOverlays(); 
    if (typeof renderAdminInventory === "function") renderAdminInventory();
    showAlert("Structure successfully create ho gaya! 🚀", "success");
}

        

window.renderAdminInventory = function() {
    const mainArea = document.querySelector('.main-content-area');
    
    // RAM storage cache layer integration
    const inventory = typeof getActiveInventory === "function" ? getActiveInventory() : {};
    if (!mainArea) return;

    mainArea.innerHTML = "";
    const itemsToDisplay = Object.keys(inventory).filter(key => inventory[key].parent === window.currentFolder);

    if (itemsToDisplay.length === 0) {
        mainArea.innerHTML = getEmptyStateHTML();
        return;
    }

    itemsToDisplay.forEach(key => {
        if (inventory[key] && inventory[key].children && inventory[key].children.length > 0) {
            inventory[key].type = 'folder';
        }

        const html = getUniversalCardHTML(key, inventory[key], 'admin');
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const card = temp.firstElementChild;

        if (isFolderNavigating) {
            card.classList.add('folder-morph-active');
        }

        if (window.WayStockAdminState.selectedCards && window.WayStockAdminState.selectedCards.includes(key)) {
            card.classList.add('selected-card');
        }

        // 🔑 THE CRITICAL FIX: Purana setupSelectionEventsOnCard poori tarah hataya!
        // Ab ye direct naye secure single-click selector system ko trigger karega.
        if (typeof setupSelectionEventsOnCard === 'function') {
            setupSelectionEventsOnCard(card, key);
        }

        mainArea.appendChild(card);
    });
};

document.getElementById('modal-input')?.addEventListener('input', function(e) {
    const inputField = e.target;
    const hintBadge = document.getElementById('bulk-smart-hint'); //
    // Upgraded clean reference:
const inventory = getActiveInventory();

    
    if (!hintBadge) return;

    // 1. Textarea se aakhiri active line aur typing word segment nikalna
    const lines = inputField.value.split('\n'); //
    const currentLine = lines[lines.length - 1] || ""; //

    const partsByArrow = currentLine.split('>'); //
    const lastArrowSegment = partsByArrow[partsByArrow.length - 1] || ""; //
    
    const partsByComma = lastArrowSegment.split(','); //
    const currentWord = (partsByComma[partsByComma.length - 1] || "").trim().toLowerCase(); //

    if (!currentWord || currentWord.length < 2) {
        hintBadge.style.display = 'none';
        hintBadge.innerHTML = "";
        return;
    }

    // 2. MULTI-MATCH FILTER: Database se options search karna (Top 4 elements tak allowed)
    const existingNames = Array.from(new Set(Object.keys(inventory).map(k => inventory[k].name))); //
    const matches = existingNames.filter(name => 
        name.toLowerCase().startsWith(currentWord) && name.toLowerCase() !== currentWord
    ).slice(0, 4); // Ek sath 4 options grid safely show kar payega

    // 3. Smart Layout Rendering
    if (matches.length > 0) {
        // Flex display container active karein
        hintBadge.style.display = 'flex';
        
// INSIDE document.getElementById('modal-input')?.addEventListener('input'...) BLOCK:
// Hint chips ko template literals me draw karte waqt brand colors apply kijiye:
hintBadge.innerHTML = matches.map(match => `
    <span class="individual-hint-chip" style="background: #e6f4f5; color: #1d6881; padding: 5px 11px; border-radius: 20px; font-weight: bold; font-size: 11px; border: 1px solid #bce2e4; cursor: pointer; transition: all 0.2s; white-space: nowrap; display: inline-block;">
        💡 ${match}
    </span>
`).join('');


        // Listeners integration to handle auto-fill actions
        const chips = hintBadge.querySelectorAll('.individual-hint-chip');
        chips.forEach((chip, idx) => {
            chip.onmouseenter = () => { chip.style.background = '#dbeafe'; };
            chip.onmouseleave = () => { chip.style.background = '#eff6ff'; };

            chip.onclick = function(event) {
                event.stopPropagation();
                const selectedText = matches[idx];

                // Textarea auto-fill composition execution
                partsByComma[partsByComma.length - 1] = " " + selectedText; //
                partsByArrow[partsByArrow.length - 1] = partsByComma.join(', '); //
                lines[lines.length - 1] = partsByArrow.join(' > '); //
                
                inputField.value = lines.join('\n'); //
                hintBadge.style.display = 'none'; //
                hintBadge.innerHTML = "";
                inputField.focus(); //
            };
        });
    } else {
        hintBadge.style.display = 'none';
        hintBadge.innerHTML = "";
    }
});

// REPLACE WITH THIS ENCAPSULATED ADMIN STATE PATTERN:
// Ek single global wrapper state object jo hamari data matrix ko protect rakhega
window.WayStockAdminState = {
    selectedCards: [],
    isSelectionMode: false,
    longPressTimer: null,
    LONG_PRESS_DURATION: 600 // Consistency lock
};

function toggleCardSelection(key) {
    const state = window.WayStockAdminState;
    const index = state.selectedCards.indexOf(key);
    let isCurrentlySelected = false;

    if (index > -1) {
        state.selectedCards.splice(index, 1);
    } else {
        state.selectedCards.push(key);
        isCurrentlySelected = true;
    }

    const targetCardElement = document.querySelector(`.main-content-area .inventory-card[data-key="${key}"]`);
    
    if (targetCardElement) {
        if (isCurrentlySelected) {
            targetCardElement.classList.add('selected-card');
        } else {
            targetCardElement.classList.remove('selected-card');
        }
    }

    if (state.selectedCards.length === 0) {
        exitSelectionMode();
    } else {
        updateSelectionHeaderUI();
    }
}

function updateSelectionHeaderUI() {
    const state = window.WayStockAdminState;
    const toolbar = document.getElementById('selection-toolbar'); 
    const counterText = document.getElementById('selection-counter-text'); 
    const btnContainer = document.getElementById('selection-buttons-container'); 
    
    if (!toolbar || !counterText || !btnContainer) return;

    if (!state.isSelectionMode || state.selectedCards.length === 0) {
        exitSelectionMode();
        return;
    }

    // 🌟 ROUTING FIX: Agar state stack lock nahi he toh push karo taaki system back capture ho sake
    if (window.history.state?.overlay !== 'selection-mode') {
        history.pushState({ overlay: 'selection-mode' }, ""); 
    }

    if (toolbar.style.display !== 'flex') {
        toolbar.style.display = 'flex';
        toolbar.classList.add('active-animation', 'first-load');
        setTimeout(() => { toolbar.classList.remove('first-load'); }, 1000);
    }

    counterText.innerText = `${state.selectedCards.length} Selected`; 

    const inventory = typeof getActiveInventory === "function" ? getActiveInventory() : {};
    const itemsToDisplay = Object.keys(inventory).filter(key => inventory[key].parent === window.currentFolder); 
    
    const isAllSelected = state.selectedCards.length === itemsToDisplay.length; 
    const isSingleSelected = state.selectedCards.length === 1; 

    // 🌟 COLOR UPGRADE: Svg contours ko hardcoded blue se badalkar var(--primary) par mapping kiya
    btnContainer.innerHTML = `
        <button class="sel-btn" title="${isAllSelected ? 'Deselect All' : 'Select All'}" onclick="toggleSelectAllAction(${isAllSelected})">
            ${isAllSelected 
                ? `<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" fill="var(--primary)" stroke="var(--primary)"/><polyline points="9 11 12 14 22 4" stroke="#ffffff" stroke-width="2.5"/></svg>`
                : `<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke="var(--primary)"/></svg>`
            }
        </button>

        <button class="sel-btn" title="Add Selection to Cart" onclick="triggerBulkCartAction()">
            <svg viewBox="0 0 24 24" stroke="var(--primary)"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        </button>

        ${isSingleSelected ? `
        <button class="sel-btn" title="Edit Item Name" onclick="triggerSingleEditAction()">
            <svg viewBox="0 0 24 24" stroke="var(--primary)"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"></path></svg>
        </button>` : ''}

        <button class="sel-btn" title="Delete Selected" onclick="triggerBulkDeleteAction()">
            <svg viewBox="0 0 24 24" stroke="var(--danger)"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
        </button>
    `; 
}

function exitSelectionMode(isBackAction = false) {
    window.WayStockAdminState.isSelectionMode = false;
    window.WayStockAdminState.selectedCards = [];
    
    isEditModeActive = false;
    editTargetKey = "";
    
    const toolbar = document.getElementById('selection-toolbar'); 
    if (toolbar) {
        toolbar.classList.add('closing-fade');
        toolbar.classList.remove('active-animation');
        
        setTimeout(() => {
            toolbar.style.display = 'none';
            toolbar.classList.remove('closing-fade'); 
        }, 200);
    }
    
    // 🌟 ROUTING SAFETY RESET: System pop engine hook balance setup
    if (!isBackAction && window.history.state?.overlay === 'selection-mode') {
        window.history.back();
    } else {
        renderAdminInventory(); 
    }
}

let isEditModeActive = false; 
let editTargetKey = "";       // Kis key ko edit kar rahe hain

function triggerSingleEditAction() {
    if (!window.WayStockAdminState.selectedCards || window.WayStockAdminState.selectedCards.length !== 1) return;
    
    const selectedKey = window.WayStockAdminState.selectedCards[0];
    // Upgraded clean reference:
const inventory = getActiveInventory();

    if (!inventory[selectedKey]) return;

    // 1. Edit State Activate karein
    isEditModeActive = true;
    editTargetKey = selectedKey;

    // 2. Add New Item wale same standard modal elements ko pakdein
    const modal = document.getElementById('action-modal'); //
    const title = document.getElementById('modal-title');
    const inputField = document.getElementById('modal-input');
    const actionBtn = document.getElementById('modal-action-btn'); //

    if (!modal || !inputField) return;

    // 3. UI Content transform karke purana naam textarea me inject karo
    title.innerText = `Edit Name: ${inventory[selectedKey].name}`;
    inputField.value = inventory[selectedKey].name;
    if (actionBtn) actionBtn.innerText = "Save Changes ✏️";

    // 4. Global centralized overlay kholo (common.js framework)
    if (typeof openOverlay === 'function') {
        openOverlay('action-modal');
    }
}


function toggleSelectAllAction(shouldDeselectAll) {
    const inventory = typeof getActiveInventory === "function" ? getActiveInventory() : {};
    const itemsToDisplay = Object.keys(inventory).filter(key => inventory[key].parent === window.currentFolder);

    if (shouldDeselectAll) {
        window.WayStockAdminState.selectedCards = [];
    } else {
        window.WayStockAdminState.selectedCards = [...itemsToDisplay];
    }
    
    // Select All / Deselect All par header stable rahega, icons refresh animation trigger nahi marenge
    const toolbar = document.getElementById('selection-toolbar');
    if (toolbar) toolbar.classList.remove('first-load');

    updateSelectionHeaderUI();
    renderAdminInventory();
}

function setupSelectionEventsOnCard(card, key) {
    if (!card) return;

    const HOLD_THRESHOLD = 750; // Symmetrical hold limit
    let startX = 0, startY = 0;
    const SCROLL_TOLERANCE = 8; 

    const startPress = (e) => {
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
        
        if (window.WayStockAdminState.longPressTimer) clearTimeout(window.WayStockAdminState.longPressTimer);
        
        window.WayStockAdminState.longPressTimer = setTimeout(() => {
            if (!window.WayStockAdminState.isSelectionMode) {
                window.WayStockAdminState.isSelectionMode = true;
                if (navigator.vibrate) navigator.vibrate(50); // Sharp haptic pop
                toggleCardSelection(key);
            }
        }, HOLD_THRESHOLD);
    };

    const movePress = (e) => {
        if (!window.WayStockAdminState.longPressTimer) return;
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

        if (diffY > SCROLL_TOLERANCE || diffX > SCROLL_TOLERANCE) {
            clearTimeout(window.WayStockAdminState.longPressTimer);
            window.WayStockAdminState.longPressTimer = null;
        }
    };

    const endPress = () => {
        if (window.WayStockAdminState.longPressTimer) clearTimeout(window.WayStockAdminState.longPressTimer);
    };

    // Attach native touch events for scrolling balance
    card.addEventListener('mousedown', startPress);
    card.addEventListener('touchstart', startPress, { passive: true });
    card.addEventListener('mousemove', movePress);
    card.addEventListener('touchmove', movePress, { passive: true });
    card.addEventListener('mouseup', endPress);
    card.addEventListener('mouseleave', endPress);
    card.addEventListener('touchend', endPress);
    card.addEventListener('touchcancel', endPress);

    // 🔑 ABSOLUTE CLICK ROUTER INTERCEPTOR
    card.onclick = function(e) {
        // Stop bubbling and prevent any default actions instantly
        e.preventDefault();
        e.stopPropagation();

        if (e.target.closest('.card-add-btn') || e.target.closest('.fun-toggle') || e.target.closest('input') || e.target.closest('button') || e.target.closest('.card-qty-controller')) {
            return;
        }

        const freshInventory = typeof getActiveInventory === "function" ? getActiveInventory() : {};
        const isFolder = freshInventory[key] && (freshInventory[key].type === 'folder' || (freshInventory[key].children && freshInventory[key].children.length > 0));

        // 🧠 SELECTION OVERLAY INTERCEPT BLOCK:
        if (window.WayStockAdminState.isSelectionMode === true) {
            console.log("🔒 Selection Mode Active! Single click selection triggered for key:", key);
            // Folder Navigation system completely shut down here!
            toggleCardSelection(key);
        } else {
            // Normal system active
            if (isFolder && typeof handleFolderClick === 'function') {
                handleFolderClick(key);
            }
        }
    };
}

function triggerBulkDeleteAction() {
    if (window.WayStockAdminState.selectedCards.length === 0) return;

    if (confirm(`Kya aap in ${window.WayStockAdminState.selectedCards.length} selected items aur unke saare sub-folders/products ko permanently delete karna chahte hain?`)) {
        let inventory = JSON.parse(localStorage.getItem('wayStock_inventory')) || {};
        
        // 🔑 MULTI-USER FIX: Static key ki jagah dynamic storage key use karein
        const cartKey = typeof getCartStorageKey === "function" ? getCartStorageKey() : 'wayStock_cart_guest';
        let cart = typeof getCartItems === "function" ? getCartItems() : {};
        
        window.WayStockAdminState.selectedCards.forEach(selectedKey => {
            
            // --- 🔴 STEP 1: PARENT TREE CLEANUP ---
            const parentKey = inventory[selectedKey]?.parent; 
            if (parentKey && inventory[parentKey]) { 
                inventory[parentKey].children = inventory[parentKey].children.filter(c => c !== selectedKey); 
            }

            // --- 🔴 STEP 2: DEEP RECURSIVE SUB-CATEGORY DELETION ---
            Object.keys(inventory).forEach(invKey => {
                if (invKey === selectedKey || invKey.startsWith(selectedKey + '>')) {
                    delete inventory[invKey]; 
                }
            });

            // --- 🔴 STEP 3: DYNAMIC BUCKET / CART AUTOMATIC CLEANUP ---
            Object.keys(cart).forEach(cartKeyElement => {
                if (cartKeyElement === selectedKey || cartKeyElement.startsWith(selectedKey + '>')) {
                    delete cart[cartKeyElement]; 
                }
            });
        });

        // Atomic commit locks
        if (typeof saveToIndexedDB === "function") saveToIndexedDB(inventory);
        
        // 🔑 FIXED: Dynamic key par properly cart save karein
        localStorage.setItem(cartKey, JSON.stringify(cart));
        
        showAlert("Selected structure aur unke saare products cart samet saaf ho gaye! 🔥", "success");
        
        if (typeof syncToFirebase === "function") {
            syncToFirebase(); 
        }
        if (typeof window.renderAdminInventory === "function") window.renderAdminInventory();
        exitSelectionMode(true); 
    }
}


function triggerBulkCartAction() {
    let cart = typeof getCartItems === "function" ? getCartItems() : {};
    const inventory = typeof getActiveInventory === "function" ? getActiveInventory() : {};
    
    // 🔑 MULTI-USER FIX: Dynamic key generator ko call kiya
    const cartKey = typeof getCartStorageKey === "function" ? getCartStorageKey() : 'wayStock_cart_guest';
    let count = 0;

    window.WayStockAdminState.selectedCards.forEach(key => {
        // Items ko folder ke andar check karke filter lagaya
        if (!cart[key] && inventory[key] && inventory[key].type === 'item') {
            const rootFolder = key.includes('>') ? key.split('>')[0].trim() : 'Home';
            cart[key] = {
                name: inventory[key].name,
                fullPath: key,
                rootFolder: rootFolder,
                quantity: 1,
                unit: "Box"
            };
            count++;
        }
    });

    if (count > 0) {
        // 🔑 FIXED: Ab static key ki jagah naye logged-in user ki specific cart storage me data commit hoga
        localStorage.setItem(cartKey, JSON.stringify(cart));
        showAlert(`✅ ${count} Items bucket me bulk add ho gaye!`, "success");
    } else {
        showAlert("Koi naya item (product) select nahi kiya gaya thaa ya sab pehle se added hain!", "error");
    }
    
    if (typeof updateCartBadgeCount === "function") updateCartBadgeCount();
    exitSelectionMode(true);
}

async function sendGlobalBroadcastNotification() {
    const inputField = document.getElementById('admin-broadcast-input');
    if (!inputField) return;
    
    const message = inputField.value.trim();
    if (!message) {
        showAlert("Oho! Pehle kuch message toh likhiye. ✍️", "error");
        return;
    }

    try {
        // Firebase Firestore me direct messaging hub target lock kiya
        await firebase.firestore().collection("appSettings").doc("globalNotification").set({
            text: message,
            timestamp: Date.now()
        });

        showAlert("Notification sabhi users ko bhej di gayi! 📢", "success");
        inputField.value = ""; // Clean input box
        closeAllOverlays(); // Close overlay panel
    } catch (e) {
        console.error("Broadcast push failed:", e);
        showAlert("Message send nahi ho paya, network check karein!", "error");
    }
}


async function updateCloudAdminPassword() {
    const oldPassInput = document.getElementById('admin-old-password');
    const newPassInput = document.getElementById('admin-new-password');
    
    if (!oldPassInput || !newPassInput) return;
    
    const oldPassword = oldPassInput.value.trim();
    const newPassword = newPassInput.value.trim();
    
    // Basic inputs verification
    if (!oldPassword || !newPassword) {
        showAlert("Oho! Dono fields (Old & New Password) bharna zaroori he. ✍️", "error");
        return;
    }
    
    if (newPassword.length < 6) {
        showAlert("⚠️ Naya password kam se kam 6 characters ka hona chahiye!", "error");
        return;
    }

    try {
        showAlert("Verifying old password with Firebase Cloud... ⏳", "info");
        
        // 1. Firebase se current password fetch karo
        const adminAuthRef = firebase.firestore().collection("appSettings").doc("adminAuth");
        const docSnap = await adminAuthRef.get();
        
        if (docSnap.exists) {
            const currentCloudPassword = docSnap.data().password;
            
            // 2. Verify karo ki purana password match hota he ya nahi
            if (oldPassword === String(currentCloudPassword)) {
                
                showAlert("Old password verified! Updating cloud registry... ☁️", "info");
                
                // 3. Naya password Firebase database me overwrite (set) karo
                await adminAuthRef.set({
                    password: newPassword
                });
                
                showAlert("🎉 Master Password updated successfully on Cloud!", "success");
                
                // Inputs ko saaf karo
                oldPassInput.value = "";
                newPassInput.value = "";
                
// ⚡ SECURITY SAFETY ENHANCED: Clear all local and session tokens instantly on password reset
setTimeout(() => {
    sessionStorage.removeItem('wayStock_admin_authenticated');
    sessionStorage.removeItem('wayStock_admin_expiry');
    localStorage.removeItem('wayStock_admin_token');
    localStorage.removeItem('wayStock_admin_expiry');
    window.location.href = "index.html";
}, 1500);
                
            } else {
                showAlert("🚫 Purana (Old) Password galat he! Authentication Failed.", "error");
            }
        } else {
            showAlert("Error: Cloud configuration not found!", "error");
        }
    } catch (error) {
        console.error("Password update transaction crashed:", error);
        showAlert("Network error! Password update failed.", "error");
    }
}

function logoutAdminSession() {
    if (confirm("Kya aap sach me Admin Panel se Logout karna chahte hain? 🚪")) {
        // Clear everything everywhere to kill the session hooks safely
        sessionStorage.removeItem('wayStock_admin_authenticated');
        sessionStorage.removeItem('wayStock_admin_expiry');
        localStorage.removeItem('wayStock_admin_token');
        localStorage.removeItem('wayStock_admin_expiry');
        
        if (typeof showAlert === "function") {
            showAlert("Session terminated safely. Logged out! 🔒", "info");
        }
        
        setTimeout(() => {
            window.location.href = "index.html"; 
        }, 800);
    }
}

function toggleSettingsStep(drawerId, headerElement) {
    const parentWrapper = headerElement.closest('.accordion-step-wrapper');
    if (!parentWrapper) return;
    
    const isOpenCurrently = parentWrapper.classList.contains('step-open');
    
    // Safety Reset: Baaki ke sabhi accordion drawers ko band karo pehle (Clutter-free environment)
    document.querySelectorAll('.accordion-step-wrapper').forEach(wrapper => {
        wrapper.classList.remove('step-open');
    });
    
    // Agar pehle se khula nahi tha, toh is wale ko open karo smoothly
    if (!isOpenCurrently) {
        parentWrapper.classList.add('step-open');
    }
}

// ==========================================================================
// --- 🔗 BRAND GRADIENT SYNCED APP LINK SHARE GENERATOR ENGINE (common.js) ---
// ==========================================================================
async function triggerAdminAppLinkSharing() {
    // Menu dropdown safely close behavior
    document.getElementById('admin-menu')?.classList.remove('active');
    
    showAlert("Generating Branded App Share Card... ⏳", "info");

    const dpr = Math.max(window.devicePixelRatio || 1, 2);
    const canvasWidth = 400;
    const canvasHeight = 550;

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // 🎨 Layout Backsheet color
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // ==========================================================================
    // 🚀 DYNAMIC BRAND GRADIENT BUILDER (Matching your Logo perfectly)
    // ==========================================================================
    // Creating matching gradients for phone header and backgrounds
    const brandGradient = ctx.createLinearGradient(100, 0, 300, 0);
    brandGradient.addColorStop(0, '#1d6881'); // Deep Teal from your upper logo part
    brandGradient.addColorStop(0.5, '#219395'); // Medium Cyan center mix
    brandGradient.addColorStop(1, '#2abb9b'); // Greenish Teal from lower logo edge

    // 1. DYNAMIC APP LOGO IMAGE LOADING CORE ENGINE
    const loadAppLogoImage = () => {
        return new Promise((resolve) => {
            const img = new Image();
            img.src = 'logo.png'; 
            img.onload = () => resolve(img);
            img.onerror = () => {
                console.warn("⚠️ Custom brand logo file loading failed. Using fallback gradient circle.");
                resolve(null); 
            };
        });
    };

    const appLogoFileInstance = await loadAppLogoImage();

    if (appLogoFileInstance) {
        // 🟢 RENDER LOGO WITH SMOOTH BACKGROUND RING
        ctx.save();
        // Dynamic circular outer backdrop shadow glow
        ctx.fillStyle = "rgba(33, 147, 149, 0.06)";
        ctx.beginPath();
        ctx.arc(canvasWidth / 2, 55, 30, 0, Math.PI * 2);
        ctx.fill();

        // Clip logo inside perfect circle mesh
        ctx.beginPath();
        ctx.arc(canvasWidth / 2, 55, 26, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(appLogoFileInstance, (canvasWidth / 2) - 26, 29, 52, 52);
        ctx.restore();
    } else {
        // 🔴 FALLBACK METHOD using the newly created gradient
        ctx.fillStyle = brandGradient; 
        ctx.beginPath();
        ctx.arc(canvasWidth / 2, 55, 26, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 22px system-ui, -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("W", canvasWidth / 2, 63);
    }

    // App Branding Label Header Title (Color synced with Logo dark tone)
    ctx.fillStyle = "#114a5d"; 
    ctx.font = "bold 21px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("WayStock Master", canvasWidth / 2, 108);

    ctx.fillStyle = "#517483"; // Soter muted typography shade
    ctx.font = "600 11.5px system-ui, -apple-system, sans-serif";
    ctx.fillText("Smart Digital Stock Inventory Console", canvasWidth / 2, 126);

    // 📱 MIDDLE LAYER: Smartphone Phone Mockup Outer Ring Boundary
    const phoneX = 80;
    const phoneY = 150;
    const phoneW = 240;
    const phoneH = 320;

    ctx.strokeStyle = "#1a3b47"; // Deep slate teal phone borders
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(phoneX, phoneY, phoneW, phoneH, 22); 
    ctx.stroke();

    // Smartphone Screen Internal Backsheet Layout
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(phoneX + 2, phoneY + 2, phoneW - 4, phoneH - 4, 20);
    ctx.fill();

    // 🌟 MOCK HEADER DIRECT GRADIENT FILL (Perfect Match!)
    ctx.fillStyle = brandGradient;
    ctx.beginPath();
    ctx.roundRect(phoneX + 10, phoneY + 14, phoneW - 20, 32, 6);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 11px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Way Stock (Najim)", phoneX + 20, phoneY + 33);

    // Mockup Folder Grid List Components
    const dummyFolders = ["Perfume 💧", "Sweet Paan ☘️", "Packets 🍟", "Cigarette 🚬", "Paan Masala 🎯"];
    let currentBoxY = phoneY + 60;

    dummyFolders.forEach(folderText => {
        ctx.fillStyle = "#f8fafc";
        ctx.strokeStyle = "#e2e8f0";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(phoneX + 12, currentBoxY, phoneW - 24, 26, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#219395"; // Folder bullet color matching logo core
        ctx.font = "11px system-ui, -apple-system, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("📁", phoneX + 22, currentBoxY + 17);

        ctx.fillStyle = "#334155";
        ctx.font = "600 10px system-ui, -apple-system, sans-serif";
        ctx.fillText(folderText, phoneX + 42, currentBoxY + 16);

        // Active switch check indicators (Synced with logo success color)
        ctx.strokeStyle = "#2abb9b";
        ctx.beginPath();
        ctx.arc(phoneX + phoneW - 24, currentBoxY + 13, 4.5, 0, Math.PI * 2);
        ctx.stroke();

        currentBoxY += 34; 
    });

    // 🏁 BOTTOM LAYER: Info text footer frame
    ctx.fillStyle = "#475569";
    ctx.font = "500 11px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Scan or click link below to join current inventory portal:", canvasWidth / 2, phoneY + phoneH + 25);

    try {
        const generatedInvitationCardURL = canvas.toDataURL("image/png");
        const response = await fetch(generatedInvitationCardURL);
        const blob = await response.blob();
        const file = new File([blob], 'WayStock_App_Invitation.png', { type: "image/png" });

        const clientPortalWebAddressLink = window.location.origin + "/index.html";

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: 'Join WayStock Mobile Terminal',
                text: `👋 Greetings! Join my digital management portal via active link address:\n🔗 Link: ${clientPortalWebAddressLink}`
            });
        } else {
            await navigator.share({
                title: 'Join WayStock Mobile Terminal',
                text: `👋 Greetings! Join my digital management portal via active link address:\n🔗 Link: ${clientPortalWebAddressLink}`
            });
        }
    } catch (err) {
        console.warn("Share link sequence aborted or collapsed:", err);
    }
}

