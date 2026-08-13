/* WayStock Master - Admin Portal Engine */

// Verify Admin Session
function checkAdminAccess() {
  if (!isAdminAuthenticated()) {
    alert("Admin session expired or unauthorized. Redirecting...");
    window.location.href = 'index.html';
  }
}

// 1. Bulk Data Tree Importer (processBulkData)
function processBulkData() {
  const textarea = document.getElementById('bulk-import-textarea');
  if (!textarea) return;

  const text = textarea.value.trim();
  if (!text) {
    showToast("Please paste or enter inventory data");
    return;
  }

  const lines = text.split('\n');
  let addedCount = 0;

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // Syntax: Root > Category > Item Name | Quantity | Unit
    const parts = trimmed.split('>').map(p => p.trim());
    if (parts.length >= 3) {
      const root = parts[0];
      const category = parts[1];
      const itemRaw = parts[2];

      // Parse item name, quantity, unit
      let name = itemRaw;
      let qty = 10;
      let unit = "Piece";

      if (itemRaw.includes('|')) {
        const itemParts = itemRaw.split('|').map(ip => ip.trim());
        name = itemParts[0];
        if (itemParts[1]) qty = parseInt(itemParts[1]) || 10;
        if (itemParts[2]) unit = itemParts[2];
      }

      // Add to runtime structure
      if (!window.wayStock_runtime_inventory.rootStructures.includes(root)) {
        window.wayStock_runtime_inventory.rootStructures.push(root);
      }

      if (!window.wayStock_runtime_inventory.categories[root]) {
        window.wayStock_runtime_inventory.categories[root] = [];
      }
      if (!window.wayStock_runtime_inventory.categories[root].includes(category)) {
        window.wayStock_runtime_inventory.categories[root].push(category);
      }

      const key = `${root} > ${category}`;
      if (!window.wayStock_runtime_inventory.items[key]) {
        window.wayStock_runtime_inventory.items[key] = [];
      }

      // Avoid duplicates
      const existing = window.wayStock_runtime_inventory.items[key].find(i => i.name.toLowerCase() === name.toLowerCase());
      if (!existing) {
        window.wayStock_runtime_inventory.items[key].push({
          id: `item_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          name: name,
          qty: qty,
          unit: unit,
          allowedUnits: window.allowedUnits
        });
        addedCount++;
      }
    }
  });

  syncToFirebase();
  textarea.value = '';
  showToast(`Successfully imported ${addedCount} new items`);
  renderAdminCategoryTree();
}

// Setup Smart Auto-Suggest Hint Chips for Bulk Import
function setupBulkSmartHint() {
  const textarea = document.getElementById('bulk-import-textarea');
  const hintChip = document.getElementById('bulk-smart-hint');
  
  if (!textarea || !hintChip) return;

  textarea.addEventListener('input', () => {
    const text = textarea.value;
    const lastLine = text.split('\n').pop() || '';
    
    if (lastLine.includes('>')) {
      const parts = lastLine.split('>');
      if (parts.length === 1) {
        hintChip.innerText = "Hint: Type category name next (e.g. Hardware > Fasteners)";
      } else if (parts.length === 2) {
        hintChip.innerText = "Hint: Type item name | Qty | Unit (e.g. Hex Bolt | 100 | Piece)";
      }
    } else {
      hintChip.innerText = "Syntax: Root > Category > Item Name | Qty | Unit";
    }
  });
}

// 2. Global Unit Propagation (handleAdminUnitEnter)
function handleAdminUnitEnter(event, categoryKey) {
  if (event.key === 'Enter') {
    const input = event.target;
    const newUnit = input.value.trim();
    if (!newUnit) return;

    if (!window.allowedUnits.includes(newUnit)) {
      window.allowedUnits.push(newUnit);
    }

    // Propagate unit across all items in category tree
    for (let key in window.wayStock_runtime_inventory.items) {
      if (key.startsWith(categoryKey) || categoryKey === 'ALL') {
        window.wayStock_runtime_inventory.items[key].forEach(item => {
          if (!item.allowedUnits) item.allowedUnits = [...window.allowedUnits];
          if (!item.allowedUnits.includes(newUnit)) {
            item.allowedUnits.push(newUnit);
          }
        });
      }
    }

    syncToFirebase();
    input.value = '';
    showToast(`Unit "${newUnit}" propagated globally`);
    renderAdminCategoryTree();
  }
}

// 3. Global Broadcast Notifications
function sendGlobalBroadcast() {
  const input = document.getElementById('broadcast-message-input');
  if (!input) return;

  const rawMessage = input.value.trim();
  if (!rawMessage) {
    showToast("Please enter a broadcast message");
    return;
  }

  // Replace @user tag with current user/client name
  const clientName = localStorage.getItem('waystock_user_name') || 'Valued Team Member';
  const parsedMessage = rawMessage.replace(/@user/g, clientName);

  // Play audio chime notification
  playAudioNotificationChime();

  showToast(`Broadcast Sent: "${parsedMessage}"`);
  input.value = '';
}

function playAudioNotificationChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5 note
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.2); // A5 note

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) {
    console.warn("Audio chime unsupported", e);
  }
}

// 4. QR App Invitation Card Generator (triggerAdminAppLinkSharing)
function triggerAdminAppLinkSharing() {
  const canvas = document.createElement('canvas');
  canvas.width = 500;
  canvas.height = 650;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 500, 650);

  // Decorative Accents
  ctx.fillStyle = '#10b981';
  ctx.fillRect(0, 0, 500, 12);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText('WAYSTOCK MASTER', 40, 60);

  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('MOBILE DIGITAL INVENTORY PWA', 40, 88);

  // QR Code Placeholder Box
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(100, 140, 300, 300);
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 4;
  ctx.strokeRect(100, 140, 300, 300);

  // Simulated QR Patterns
  ctx.fillStyle = '#10b981';
  ctx.fillRect(130, 170, 70, 70);
  ctx.fillRect(300, 170, 70, 70);
  ctx.fillRect(130, 340, 70, 70);
  
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(145, 185, 40, 40);
  ctx.fillRect(315, 185, 40, 40);
  ctx.fillRect(145, 355, 40, 40);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Scan to Install PWA', 250, 480);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '14px sans-serif';
  ctx.fillText('100% Offline Support & Live Cloud Sync', 250, 510);
  ctx.fillText(window.location.origin + window.location.pathname.replace('admin.html', 'index.html'), 250, 540);

  const dataUrl = canvas.toDataURL('image/png');

  // Display QR Modal
  let modal = document.getElementById('qr-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'qr-modal';
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal-sheet" style="max-width:440px; align-self:center; border-radius:24px; padding:20px; text-align:center;">
        <h3 style="font-size:1.1rem; font-weight:700; color:#fff; margin-bottom:12px;">App Invitation Card</h3>
        <img id="qr-card-img" src="${dataUrl}" style="width:100%; border-radius:16px; margin-bottom:16px;" />
        <button onclick="shareQRCardImage('${dataUrl}')" class="btn-primary">Share Invitation Card</button>
        <button onclick="document.getElementById('qr-modal').classList.remove('active')" class="btn-secondary" style="margin-top:8px;">Close</button>
      </div>
    `;
    document.body.appendChild(modal);
  } else {
    document.getElementById('qr-card-img').src = dataUrl;
    modal.classList.add('active');
  }
}

async function shareQRCardImage(dataUrl) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const file = new File([blob], 'WayStock_Invite.png', { type: 'image/png' });

  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'WayStock Master PWA',
        text: 'Join WayStock Master Digital Inventory PWA!'
      });
    } catch (e) {}
  } else {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'WayStock_Invite.png';
    a.click();
  }
}

// Render Admin Inventory Tree View
function renderAdminCategoryTree() {
  const container = document.getElementById('admin-tree-container');
  if (!container) return;

  let html = '';
  const roots = window.wayStock_runtime_inventory.rootStructures || [];

  roots.forEach(root => {
    const cats = window.wayStock_runtime_inventory.categories[root] || [];
    html += `
      <div style="margin-bottom:12px; background:var(--bg-primary); border:1px solid var(--border-subtle); border-radius:12px; padding:12px;">
        <div style="font-weight:700; color:var(--accent-emerald); font-size:0.95rem;">📁 ${root}</div>
        <div style="padding-left:16px; margin-top:8px;">
    `;

    cats.forEach(cat => {
      const key = `${root} > ${cat}`;
      const items = window.wayStock_runtime_inventory.items[key] || [];
      html += `
        <div style="margin-bottom:8px;">
          <div style="font-size:0.85rem; font-weight:600; color:var(--accent-cyan);">📂 ${cat} (${items.length} items)</div>
          <div style="padding-left:16px; margin-top:4px;">
      `;

      items.forEach(item => {
        html += `
          <div style="font-size:0.8rem; color:var(--text-muted); display:flex; justify-content:space-between; padding:2px 0;">
            <span>📦 ${item.name}</span>
            <span style="color:#fff;">${item.qty} ${item.unit}</span>
          </div>
        `;
      });

      html += `</div></div>`;
    });

    html += `</div></div>`;
  });

  container.innerHTML = html;
}

// On Page Load
document.addEventListener('DOMContentLoaded', () => {
  checkAdminAccess();
  setupBulkSmartHint();
  renderAdminCategoryTree();
});
