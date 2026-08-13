/* WayStock Master - User Client UI Engine */

// Global User State
const currentUserId = localStorage.getItem('waystock_user_id') || 'guest';
const CART_KEY = `wayStock_cart_${currentUserId}`;

window.WayStockAdminState = {
  isSelectionMode: false,
  selectedItemIds: new Set(),
  longPressTimer: null,
  startY: 0,
  isScrolling: false
};

// 1. Universal Card Rendering (getUniversalCardHTML)
function getUniversalCardHTML(item, parentCategoryPath = '') {
  const isSelected = window.WayStockAdminState.selectedItemIds.has(item.id);
  const qty = item.qty || 0;
  const unit = item.unit || (item.allowedUnits && item.allowedUnits[0]) || 'Piece';
  const unitsOptions = (item.allowedUnits || window.allowedUnits).map(u => 
    `<option value="${u}" ${u === unit ? 'selected' : ''}>${u}</option>`
  ).join('');

  return `
    <div class="universal-card-row ${isSelected ? 'selected' : ''}" data-id="${item.id}" data-path="${parentCategoryPath}">
      <div class="card-left" onclick="handleCardClick('${item.id}', '${item.name}')">
        <div class="card-icon-wrapper ${isSelected ? 'flipped' : ''}" onclick="toggleItemSelection(event, '${item.id}')">
          <div class="card-icon-inner">
            <div class="card-icon-front">📦</div>
            <div class="selection-tick-overlay">✓</div>
          </div>
        </div>
        <div class="card-details">
          <span class="card-title">${item.name}</span>
          <span class="card-subtitle">${parentCategoryPath ? parentCategoryPath + ' • ' : ''}Stock: ${qty} ${unit}</span>
        </div>
      </div>
      <div class="card-right">
        <!-- Gesture Swipe Zone Quantity Controller -->
        <div class="gesture-swipe-zone" id="swipe-zone-${item.id}" data-id="${item.id}">
          <button class="qty-btn-sub" onclick="updateItemQuantity(event, '${item.id}', -1)">-</button>
          <input type="number" class="qty-input" value="${qty}" onblur="commitQuantityToStorage(event, '${item.id}')" onclick="event.stopPropagation()" />
          <button class="qty-btn-add" onclick="updateItemQuantity(event, '${item.id}', 1)">+</button>
        </div>
        <!-- Unit Selector Dropdown -->
        <select class="unit-select" onchange="changeItemUnit(event, '${item.id}')" onclick="event.stopPropagation()">
          ${unitsOptions}
        </select>
      </div>
    </div>
  `;
}

// 2. Render Folder & Items List View
function renderCurrentView() {
  const container = document.getElementById('inventory-list');
  if (!container) return;
  
  const folder = window.currentFolder;
  let html = '';

  // Case A: Root Level ("Home")
  if (folder === 'Home') {
    const roots = window.wayStock_runtime_inventory.rootStructures || [];
    roots.forEach(root => {
      html += `
        <div class="universal-card-row" onclick="openFolder('${root}')">
          <div class="card-left">
            <div class="card-icon-wrapper">
              <div class="card-icon-inner">
                <div class="card-icon-front" style="color:var(--accent-cyan)">📁</div>
              </div>
            </div>
            <div class="card-details">
              <span class="card-title">${root}</span>
              <span class="card-subtitle">Root Category</span>
            </div>
          </div>
          <div class="card-right" style="color:var(--text-muted); font-size:1.2rem;">›</div>
        </div>
      `;
    });
  } 
  // Case B: Sub-Category Level
  else if (window.wayStock_runtime_inventory.categories[folder]) {
    const subs = window.wayStock_runtime_inventory.categories[folder] || [];
    subs.forEach(sub => {
      const pathKey = `${folder} > ${sub}`;
      const itemCount = (window.wayStock_runtime_inventory.items[pathKey] || []).length;
      html += `
        <div class="universal-card-row" onclick="openFolder('${sub}')">
          <div class="card-left">
            <div class="card-icon-wrapper">
              <div class="card-icon-inner">
                <div class="card-icon-front" style="color:var(--accent-emerald)">📂</div>
              </div>
            </div>
            <div class="card-details">
              <span class="card-title">${sub}</span>
              <span class="card-subtitle">${itemCount} items inside</span>
            </div>
          </div>
          <div class="card-right" style="color:var(--text-muted); font-size:1.2rem;">›</div>
        </div>
      `;
    });
  } 
  // Case C: Items List Level
  else {
    let itemsFound = [];
    let currentPath = '';
    
    // Find matching items key in path stack
    for (let key in window.wayStock_runtime_inventory.items) {
      if (key.includes(folder)) {
        itemsFound = window.wayStock_runtime_inventory.items[key] || [];
        currentPath = key;
        break;
      }
    }
    
    if (itemsFound.length === 0) {
      html = `
        <div style="text-align:center; padding:40px 20px; color:var(--text-muted);">
          <div style="font-size:2.5rem; margin-bottom:12px;">📦</div>
          <p style="font-size:0.95rem; font-weight:600;">No items found in this folder</p>
          <p style="font-size:0.8rem; margin-top:4px;">Use Admin portal to import or add items</p>
        </div>
      `;
    } else {
      itemsFound.forEach(item => {
        html += getUniversalCardHTML(item, currentPath);
      });
    }
  }

  container.innerHTML = html;
  attachTouchAndGestureEvents();
  updateCartFloatingBar();
}

// 3. Long-Press & Touch Gesture System
function attachTouchAndGestureEvents() {
  const rows = document.querySelectorAll('.universal-card-row');
  rows.forEach(row => {
    // Long-Press Listener (850ms)
    row.addEventListener('touchstart', (e) => {
      window.WayStockAdminState.startY = e.touches[0].clientY;
      window.WayStockAdminState.isScrolling = false;
      
      window.WayStockAdminState.longPressTimer = setTimeout(() => {
        if (!window.WayStockAdminState.isScrolling) {
          const itemId = row.getAttribute('data-id');
          if (itemId) {
            enableSelectionMode(itemId);
          }
        }
      }, 850);
    }, { passive: true });

    row.addEventListener('touchmove', (e) => {
      const currentY = e.touches[0].clientY;
      if (Math.abs(currentY - window.WayStockAdminState.startY) > 10) {
        window.WayStockAdminState.isScrolling = true;
        clearTimeout(window.WayStockAdminState.longPressTimer);
      }
    }, { passive: true });

    row.addEventListener('touchend', () => {
      clearTimeout(window.WayStockAdminState.longPressTimer);
    });

    // Gesture Swipe Zone on Quantity Controllers
    const swipeZone = row.querySelector('.gesture-swipe-zone');
    if (swipeZone) {
      let swipeStartX = 0;
      swipeZone.addEventListener('touchstart', (e) => {
        swipeStartX = e.touches[0].clientX;
      }, { passive: true });

      swipeZone.addEventListener('touchmove', (e) => {
        const diffX = e.touches[0].clientX - swipeStartX;
        if (diffX > 25) {
          swipeZone.classList.add('swipe-plus');
          swipeZone.classList.remove('swipe-minus');
        } else if (diffX < -25) {
          swipeZone.classList.add('swipe-minus');
          swipeZone.classList.remove('swipe-plus');
        }
      }, { passive: true });

      swipeZone.addEventListener('touchend', (e) => {
        const diffX = e.changedTouches[0].clientX - swipeStartX;
        const id = swipeZone.getAttribute('data-id');
        
        if (diffX > 35) {
          updateItemQuantity(e, id, 1);
          if (navigator.vibrate) navigator.vibrate(40);
        } else if (diffX < -35) {
          updateItemQuantity(e, id, -1);
          if (navigator.vibrate) navigator.vibrate(40);
        }
        
        swipeZone.classList.remove('swipe-plus', 'swipe-minus');
      });
    }
  });
}

function enableSelectionMode(initialItemId) {
  window.WayStockAdminState.isSelectionMode = true;
  window.WayStockAdminState.selectedItemIds.add(initialItemId);
  
  const toolbar = document.getElementById('selection-toolbar');
  if (toolbar) toolbar.classList.add('active');
  
  updateSelectionToolbarCount();
  renderCurrentView();
}

function toggleItemSelection(event, id) {
  event.stopPropagation();
  if (!window.WayStockAdminState.isSelectionMode) {
    enableSelectionMode(id);
    return;
  }

  if (window.WayStockAdminState.selectedItemIds.has(id)) {
    window.WayStockAdminState.selectedItemIds.delete(id);
  } else {
    window.WayStockAdminState.selectedItemIds.add(id);
  }

  if (window.WayStockAdminState.selectedItemIds.size === 0) {
    cancelSelectionMode();
  } else {
    updateSelectionToolbarCount();
    renderCurrentView();
  }
}

function updateSelectionToolbarCount() {
  const countSpan = document.getElementById('selected-count');
  if (countSpan) {
    countSpan.innerText = `${window.WayStockAdminState.selectedItemIds.size} Selected`;
  }
}

function cancelSelectionMode() {
  window.WayStockAdminState.isSelectionMode = false;
  window.WayStockAdminState.selectedItemIds.clear();
  const toolbar = document.getElementById('selection-toolbar');
  if (toolbar) toolbar.classList.remove('active');
  renderCurrentView();
}

function selectAllVisibleItems() {
  const rows = document.querySelectorAll('.universal-card-row[data-id]');
  rows.forEach(r => {
    const id = r.getAttribute('data-id');
    if (id) window.WayStockAdminState.selectedItemIds.add(id);
  });
  updateSelectionToolbarCount();
  renderCurrentView();
}

// 4. Quantity & Unit Storage Sync
function updateItemQuantity(event, id, delta) {
  if (event) event.stopPropagation();
  
  for (let key in window.wayStock_runtime_inventory.items) {
    const item = window.wayStock_runtime_inventory.items[key].find(i => i.id === id);
    if (item) {
      item.qty = Math.max(0, (item.qty || 0) + delta);
      syncToFirebase();
      renderCurrentView();
      break;
    }
  }
}

function commitQuantityToStorage(event, id) {
  const val = parseInt(event.target.value) || 0;
  for (let key in window.wayStock_runtime_inventory.items) {
    const item = window.wayStock_runtime_inventory.items[key].find(i => i.id === id);
    if (item) {
      item.qty = Math.max(0, val);
      syncToFirebase();
      break;
    }
  }
}

function changeItemUnit(event, id) {
  const newUnit = event.target.value;
  for (let key in window.wayStock_runtime_inventory.items) {
    const item = window.wayStock_runtime_inventory.items[key].find(i => i.id === id);
    if (item) {
      item.unit = newUnit;
      syncToFirebase();
      break;
    }
  }
}

// 5. Cart / Bucket Engine
function getCartData() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch (err) {
    return [];
  }
}

function saveCartData(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartFloatingBar();
}

function handleCardClick(id, name) {
  if (window.WayStockAdminState.isSelectionMode) return;
  addToCartByName(name, 1);
}

function addToCartByName(name, qtyToAdd = 1) {
  let foundItem = null;
  let foundPath = '';

  for (let key in window.wayStock_runtime_inventory.items) {
    const item = window.wayStock_runtime_inventory.items[key].find(i => i.name.toLowerCase() === name.toLowerCase());
    if (item) {
      foundItem = item;
      foundPath = key;
      break;
    }
  }

  if (!foundItem) {
    showToast(`Item "${name}" not found in inventory`);
    return;
  }

  const cart = getCartData();
  const existing = cart.find(c => c.id === foundItem.id);
  
  if (existing) {
    existing.cartQty += qtyToAdd;
  } else {
    cart.push({
      id: foundItem.id,
      name: foundItem.name,
      cartQty: qtyToAdd,
      unit: foundItem.unit || 'Piece',
      path: foundPath
    });
  }

  saveCartData(cart);
  showToast(`Added ${qtyToAdd}x ${foundItem.name} to Cart`);
}

function addSelectedToCart() {
  const cart = getCartData();
  window.WayStockAdminState.selectedItemIds.forEach(id => {
    for (let key in window.wayStock_runtime_inventory.items) {
      const item = window.wayStock_runtime_inventory.items[key].find(i => i.id === id);
      if (item) {
        const existing = cart.find(c => c.id === id);
        if (existing) {
          existing.cartQty += 1;
        } else {
          cart.push({
            id: item.id,
            name: item.name,
            cartQty: 1,
            unit: item.unit || 'Piece',
            path: key
          });
        }
        break;
      }
    }
  });

  saveCartData(cart);
  showToast(`Added ${window.WayStockAdminState.selectedItemIds.size} items to Cart`);
  cancelSelectionMode();
}

function updateCartFloatingBar() {
  const bar = document.getElementById('cart-floating-bar');
  const countBadge = document.getElementById('cart-badge-count');
  if (!bar || !countBadge) return;

  const cart = getCartData();
  const totalCount = cart.reduce((sum, item) => sum + item.cartQty, 0);

  if (totalCount > 0) {
    countBadge.innerText = totalCount;
    bar.style.display = 'flex';
  } else {
    bar.style.display = 'none';
  }
}

// 6. Cart Drawer & Canvas Order Slip Generator
function openCartModal() {
  let modal = document.getElementById('cart-modal');
  if (!modal) return;
  
  const cart = getCartData();
  const listContainer = document.getElementById('cart-items-list');
  if (listContainer) {
    if (cart.length === 0) {
      listContainer.innerHTML = '<p style="text-align:center; padding:30px; color:var(--text-muted);">Cart is empty</p>';
    } else {
      let html = '';
      cart.forEach(item => {
        html += `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid var(--border-subtle);">
            <div>
              <div style="font-weight:600; color:#fff;">${item.name}</div>
              <div style="font-size:0.75rem; color:var(--text-muted);">${item.path}</div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <button onclick="changeCartQty('${item.id}', -1)" style="background:var(--bg-card); border:none; color:#fff; width:28px; height:28px; border-radius:6px; font-weight:bold;">-</button>
              <span style="font-weight:700; color:#fff;">${item.cartQty} ${item.unit}</span>
              <button onclick="changeCartQty('${item.id}', 1)" style="background:var(--bg-card); border:none; color:#fff; width:28px; height:28px; border-radius:6px; font-weight:bold;">+</button>
            </div>
          </div>
        `;
      });
      listContainer.innerHTML = html;
    }
  }

  modal.classList.add('active');
}

function closeCartModal() {
  const modal = document.getElementById('cart-modal');
  if (modal) modal.classList.remove('active');
}

function changeCartQty(id, delta) {
  let cart = getCartData();
  const item = cart.find(c => c.id === id);
  if (item) {
    item.cartQty += delta;
    if (item.cartQty <= 0) {
      cart = cart.filter(c => c.id !== id);
    }
  }
  saveCartData(cart);
  openCartModal();
}

// 7. Grouped Canvas Slip Preview & Triple-Image Fluid Zoom Viewer
function generateCartPreview() {
  const cart = getCartData();
  if (cart.length === 0) {
    showToast("Cart is empty");
    return;
  }

  // Group cart items by root folder
  const grouped = {};
  cart.forEach(item => {
    const root = item.path.split(' > ')[0] || 'General';
    if (!grouped[root]) grouped[root] = [];
    grouped[root].push(item);
  });

  const canvasList = [];
  const maxPerPage = 11;

  for (let rootName in grouped) {
    const items = grouped[rootName];
    const chunks = [];
    for (let i = 0; i < items.length; i += maxPerPage) {
      chunks.push(items.slice(i, i + maxPerPage));
    }

    chunks.forEach((chunk, pageIndex) => {
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 800;
      const ctx = canvas.getContext('2d');

      // Background
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 600, 800);

      // Header Banner
      ctx.fillStyle = '#10b981';
      ctx.fillRect(0, 0, 600, 100);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText('WAYSTOCK MASTER ORDER SLIP', 30, 45);

      ctx.font = '16px sans-serif';
      const now = new Date();
      const timeStr = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
      ctx.fillText(`Category: ${rootName} (Part ${pageIndex + 1}/${chunks.length}) • Date: ${timeStr}`, 30, 80);

      // Table Header
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(30, 120, 540, 40);

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('#', 45, 146);
      ctx.fillText('ITEM NAME', 90, 146);
      ctx.fillText('QTY', 430, 146);
      ctx.fillText('UNIT', 500, 146);

      // Items Rows
      let y = 180;
      chunk.forEach((item, index) => {
        ctx.fillStyle = index % 2 === 0 ? '#1e293b' : '#334155';
        ctx.fillRect(30, y, 540, 45);

        ctx.fillStyle = '#ffffff';
        ctx.font = '15px sans-serif';
        ctx.fillText(`${index + 1}`, 45, y + 28);
        ctx.fillText(item.name.length > 28 ? item.name.substring(0, 28) + '...' : item.name, 90, y + 28);
        
        ctx.fillStyle = '#10b981';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(`${item.cartQty}`, 430, y + 28);

        ctx.fillStyle = '#06b6d4';
        ctx.font = '15px sans-serif';
        ctx.fillText(`${item.unit}`, 500, y + 28);

        y += 50;
      });

      // Footer
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 730, 600, 70);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px sans-serif';
      ctx.fillText(`WayStock Digital Inventory System • Page ${pageIndex + 1} of ${chunks.length}`, 30, 770);

      canvasList.push(canvas.toDataURL('image/png'));
    });
  }

  openInteractiveZoomView(canvasList);
}

// 8. Triple-Image Zoom Viewer & Smart Flushing
let zoomImages = [];
let currentZoomIndex = 0;

function openInteractiveZoomView(images) {
  zoomImages = images;
  currentZoomIndex = 0;

  let modal = document.getElementById('zoom-modal');
  if (!modal) return;

  renderZoomSlider();
  modal.classList.add('active');
}

function renderZoomSlider() {
  const track = document.getElementById('zoom-track-slider');
  if (!track) return;

  track.innerHTML = '';
  zoomImages.forEach((imgSrc, idx) => {
    const slide = document.createElement('div');
    slide.className = 'zoom-slide';
    slide.innerHTML = `<img src="${imgSrc}" alt="Order Slip ${idx + 1}" />`;
    track.appendChild(slide);
  });

  updateZoomTrackTransform();
}

function updateZoomTrackTransform() {
  const track = document.getElementById('zoom-track-slider');
  if (track) {
    track.style.transform = `translateX(-${currentZoomIndex * 100}%)`;
  }
}

function nextZoomSlide() {
  if (currentZoomIndex < zoomImages.length - 1) {
    currentZoomIndex++;
    updateZoomTrackTransform();
  }
}

function prevZoomSlide() {
  if (currentZoomIndex > 0) {
    currentZoomIndex--;
    updateZoomTrackTransform();
  }
}

function closeZoomModal() {
  const modal = document.getElementById('zoom-modal');
  if (modal) modal.classList.remove('active');
}

async function shareOrDownloadSlip() {
  if (zoomImages.length === 0) return;
  const currentImgData = zoomImages[currentZoomIndex];

  const now = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  const filename = `WayStock_${pad(now.getSeconds())}${pad(now.getMinutes())}${pad(now.getHours())}${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear().toString().substring(2)}.png`;

  // Convert base64 data to blob
  const res = await fetch(currentImgData);
  const blob = await res.blob();
  const file = new File([blob], filename, { type: 'image/png' });

  // Native Web Share API
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'WayStock Order Slip',
        text: 'Attached order slip from WayStock Master.'
      });
      flushCartAfterExport();
    } catch (err) {
      console.warn("Share cancelled or failed", err);
    }
  } else {
    // Direct Download Fallback
    const a = document.createElement('a');
    a.href = currentImgData;
    a.download = filename;
    a.click();
    flushCartAfterExport();
  }
}

function flushCartAfterExport() {
  localStorage.removeItem(CART_KEY);
  updateCartFloatingBar();
  closeZoomModal();
  closeCartModal();
  showToast("Order slip exported & Cart flushed!");
}

// Smart Search Filter Listener
function setupSearchListeners() {
  const searchInput = document.getElementById('search-input');
  const suggestionsBox = document.getElementById('search-suggestions');
  
  if (!searchInput) return;

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim().toLowerCase();
    
    if (checkAdminGatewayTrigger(query)) return;

    if (query.length === 0) {
      if (suggestionsBox) suggestionsBox.classList.remove('active');
      renderCurrentView();
      return;
    }

    const matches = [];
    for (let key in window.wayStock_runtime_inventory.items) {
      window.wayStock_runtime_inventory.items[key].forEach(item => {
        if (item.name.toLowerCase().includes(query)) {
          matches.push({ item, path: key });
        }
      });
    }

    if (suggestionsBox) {
      if (matches.length > 0) {
        let html = '';
        matches.slice(0, 6).forEach(({ item, path }) => {
          html += `
            <div class="suggestion-item" onclick="selectSearchSuggestion('${item.name}')">
              <span class="suggestion-name">${item.name}</span>
              <span class="suggestion-path">${path}</span>
            </div>
          `;
        });
        suggestionsBox.innerHTML = html;
        suggestionsBox.classList.add('active');
      } else {
        suggestionsBox.classList.remove('active');
      }
    }
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const query = searchInput.value.trim();
      if (checkAdminGatewayTrigger(query)) return;
      if (suggestionsBox) suggestionsBox.classList.remove('active');
    }
  });
}

function selectSearchSuggestion(name) {
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = name;
  const suggestionsBox = document.getElementById('search-suggestions');
  if (suggestionsBox) suggestionsBox.classList.remove('active');
  
  addToCartByName(name, 1);
}

// On DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  renderCurrentView();
  setupSearchListeners();

  const voiceBtn = document.getElementById('voice-search-btn');
  if (voiceBtn) {
    let rec = null;
    voiceBtn.addEventListener('click', () => {
      if (!rec) {
        rec = initVoiceAssistant(() => {
          voiceBtn.classList.remove('listening');
        });
      }
      if (rec) {
        voiceBtn.classList.add('listening');
        rec.start();
      }
    });
  }
});
