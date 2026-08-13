// 🔄 LIVE ROUTER REFRESH ENGINE: Admin panel se user page par wapas aate hi automatic load trigger
window.onpageshow = function(event) {
    // persisted check detect karta he ki kya page cache (back button memory) se open huva he
    if (event.persisted || (window.performance && window.performance.navigation.type === 2)) {
        console.log("🔄 [Router Engine] Returned from Admin Panel. Forced layout synchronization active...");
        
        // Central components ko live runtime data context pool se instantly re-render karo
        if (typeof initializeAppFlow === "function") {
            initializeAppFlow(); 
        } else {
            // Safety backup fallback layer trigger if initialization stream collapses
            window.location.reload(); 
        }
    }
};


document.addEventListener('DOMContentLoaded', async () => {
    window.currentFolder = 'root';
    window.pathStack = ['Home'];
    
    const onboardingModal = document.getElementById('user-onboarding-modal');
    const nameInput = document.getElementById('user-name-input');
    const avatar = document.getElementById('avatar-emoji');
    let user = localStorage.getItem('wayStock_currentUser');
    
    if (!user) {
        // 1. Agar user nahi he, toh modern pop-up modal activate karo
        if (onboardingModal) onboardingModal.style.display = 'flex';
        
        // 2. Typing reactions listen karo (Maza aane wala part)
        if (nameInput && avatar) {
            nameInput.focus();
            nameInput.addEventListener('input', (e) => {
                const val = e.target.value.trim();
                if (val.length > 0) {
                    avatar.innerText = "🤩"; // Typing shuru hote hi excited face
                    avatar.classList.add('avatar-typing');
                } else {
                    avatar.innerText = "👋"; // Khali hone par normal hello
                    avatar.classList.remove('avatar-typing');
                }
            });
            
            // Enter key press support
            nameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') submitNewUserProfile();
            });
        }
    } else {
        if (onboardingModal) onboardingModal.style.display = 'none';
        initializeAppFlow(); // Direct application flow triggers for registered users
    }
// ==========================================================================
// --- 📱 SYSTEM PUSH NOTIFICATION REGISTRATION (user-script.js) ---
// ==========================================================================
if ('serviceWorker' in navigator && 'PushManager' in window) {
    // 🔑 SCOPE PATH FIX: Using absolute root path prefix '/' to avoid nested directory registration breakdowns
    navigator.serviceWorker.register('/service-worker.js')
    .then(reg => {
        console.log('🤖 Service Worker Registered Successfully with absolute root scope!', reg);
        
        // 2. System Notification ki permission mango
        if (Notification.permission === 'default') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    console.log('✅ User ne system notification allow kar di!');
                }
            });
        }
    }).catch(err => console.error('Service Worker registration failed:', err));
}

});

// PROFILE ACTION SUBMITTER
function submitNewUserProfile() {
    const nameInput = document.getElementById('user-name-input');
    const onboardingModal = document.getElementById('user-onboarding-modal');
    const avatar = document.getElementById('avatar-emoji');
    
    if (!nameInput) return;
    const name = nameInput.value.trim();
    
    if (!name || name.length < 2) {
        if (avatar) avatar.innerText = "🧐"; // Chota naam hone par suspicious face
        showAlert("Oho! Kam se kam 2 akshar ka naam likhiye. ✍️", "error");
        return;
    }

    // Dynamic Capitalization
    const cleanName = name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const uniqueId = `USER_${Date.now()}`;
    
    const userData = {
        id: uniqueId,
        name: cleanName,
        loginTime: new Date().toLocaleString()
    };
    
    // 🥳 SUCCESS CELEBRATION ANIMATION
    if (avatar) {
        avatar.classList.remove('avatar-typing');
        avatar.innerText = "🎉"; // Blast emoji
        avatar.classList.add('avatar-success');
    }
    
    localStorage.setItem('wayStock_currentUser', JSON.stringify(userData));
    showAlert(`Registration Successful! Welcome, ${cleanName} ✨`, "success");

    // Modal smooth fade-out effect with request frame
    setTimeout(() => {
        if (onboardingModal) {
            onboardingModal.style.opacity = '0';
            setTimeout(() => {
                onboardingModal.style.display = 'none';
                initializeAppFlow(); // App chalu karo!
            }, 300);
        }
    }, 1000);
}

// SECURE BOOT INITIALIZER
async function initializeAppFlow() {
    // 1. Firebase/IndexedDB data pulling
    if (typeof loadFirebaseData === "function") {
        await loadFirebaseData();
    }
    
    // 2. Ghost cleanup inside dynamic users context
    if (typeof renderCartContent === "function") {
        renderCartContent(); 
    }
    
    // 3. Dynamic layout items cards creation
    if (typeof renderUserInventory === "function") {
        window.renderUserInventory();
    }
    
    // 4. Synchronization widgets
    if (typeof updateBreadcrumb === "function") updateBreadcrumb();
    if (typeof updateCartBadgeCount === "function") updateCartBadgeCount();
    
    // Header Name Display Upgrade
    const appNameEl = document.querySelector('.app-name');
    const loggedUser = JSON.parse(localStorage.getItem('wayStock_currentUser'));
    if (appNameEl && loggedUser) {
        appNameEl.innerHTML = `Way Stock <span style="font-size:11px; font-weight:normal; color:var(--text-sec);">(${loggedUser.name})</span>`;
    }
}

window.renderUserInventory = function() {
    const mainArea = document.querySelector('.main-content-area');
    const inventory = getActiveInventory(); // RAM storage engine sync

    if (!mainArea) return;
    
    const itemsToDisplay = Object.keys(inventory).filter(key => inventory[key].parent === window.currentFolder);

    mainArea.innerHTML = ""; 
    
    if (itemsToDisplay.length === 0) { 
        mainArea.innerHTML = getEmptyStateHTML(); 
        return; 
    }
    
    itemsToDisplay.forEach(key => {
        if (inventory[key] && inventory[key].children && inventory[key].children.length > 0) {
            inventory[key].type = 'folder';
        }

        const html = getUniversalCardHTML(key, inventory[key], 'user'); 
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const card = temp.firstElementChild;

        // 🔑 FIX: User page ke item/folder cards par scroll event bridge lagao!
        if (typeof applyUniversalScrollTouchLock === 'function') {
            applyUniversalScrollTouchLock(card, key);
        }

        mainArea.appendChild(card);
    });
};


