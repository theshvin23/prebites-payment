/* ========================================================
   1. FUNGSI MENGAWAL NAVIGASI & PAPARAN PANEL TEPI (SIDE-PANEL)
======================================================== */
function toggleRightPanel() {
    const sidePanel = document.getElementById('sidePanelMenu');
    const overlay = document.getElementById('navOverlay');
    const hamburgerBtn = document.getElementById('hamburgerBtn');

    if (sidePanel) sidePanel.classList.toggle('open');
    if (overlay) overlay.classList.toggle('show');
    if (hamburgerBtn) hamburgerBtn.classList.toggle('active');
}

/* ========================================================
   2. SEMAK SESI AKTIF APABILA LAMAN KEDAI DIBUKA
======================================================== */
let activeUser = null;

window.addEventListener('DOMContentLoaded', async () => {
    const sessionData = localStorage.getItem('prebites_active_user');
    
    if (!sessionData) {
        alert('Sila log masuk terlebih dahulu!');
        window.location.href = 'login_seller.html';
        return;
    }

    activeUser = JSON.parse(sessionData);
    
    // Ensure username is set (lowercase) - use store_id as fallback
    if (!activeUser.username) {
        if (activeUser.store_id && activeUser.store_id.startsWith('stall_')) {
            let num = activeUser.store_id.replace('stall_', '');
            activeUser.username = `stall${num}_psp`;
        } else if (activeUser.store_id) {
            activeUser.username = activeUser.store_id.toLowerCase();
        } else {
            activeUser.username = activeUser.email?.split('@')[0]?.toLowerCase() || 'seller';
        }
    } else {
        activeUser.username = activeUser.username.toLowerCase();
    }
    
    // Ensure store_id always exists (fallback to active_vendor_id if needed)
    if (!activeUser.store_id) {
        activeUser.store_id = localStorage.getItem('active_vendor_id') || activeUser.username;
    }

    // Load shop profile (with proper fallback)
    let savedProfile = localStorage.getItem('shop_profile_' + activeUser.username);
    if (savedProfile) {
        try {
            let parsedProfile = JSON.parse(savedProfile);
            // Merge saved profile with default shopData
            shopData = { ...shopData, ...parsedProfile };
        } catch(e) {
            console.error("Gagal memuat profil kedai", e);
        }
    } else {
        // Update default name if no profile exists
        let stallLabel = activeUser.store_id ? activeUser.store_id.replace('stall_', 'Stall No. ') : activeUser.username;
        shopData.name = `${activeUser.nama || 'Peniaga'} (${stallLabel})`;
    }

    if (window.firebaseMenuFunctions?.loadShopProfileFromFirebase) {
        const firebaseProfile = await window.firebaseMenuFunctions.loadShopProfileFromFirebase();
        if (firebaseProfile) {
            shopData = { ...shopData, ...firebaseProfile };
            localStorage.setItem('shop_profile_' + activeUser.username, JSON.stringify(shopData));
            localStorage.setItem('shop_profile_' + activeUser.store_id, JSON.stringify(shopData));
        }
    }

    // Update display name & stall number in interface
    const shopNameDisplay = document.getElementById('shop-name-display');
    if (shopNameDisplay) {
        shopNameDisplay.innerText = shopData.name || 'Memuatkan...';
    }

    const stallDisplay = document.getElementById('stall-id-display');
    if (stallDisplay && activeUser) {
        let stallNum = activeUser.store_id ? activeUser.store_id.replace('stall_', 'Stall ') : activeUser.username;
        stallDisplay.innerText = stallNum.toUpperCase();
    }

    // Update shop status toggle
    if (activeUser && activeUser.username) {
        let shopStatusKey = 'shop_status_' + activeUser.username;
        let savedStatus = localStorage.getItem(shopStatusKey);
        const shopToggle = document.querySelector('.shop-status-toggle input[type="checkbox"]');
        
        if (shopToggle) {
            if (savedStatus === 'tutup') {
                shopToggle.checked = false;
                updateShopStatusText(false);
            } else {
                shopToggle.checked = true;
                updateShopStatusText(true);
            }
        }
    }

    // 🔄 FIREBASE INITIALIZATION: Load menus from Firebase and start auto-sync
    loadMenusFromFirebaseStartup(); // Load menus from Firebase at startup
    startAutoSyncMenus(30); // Auto-sync every 30 seconds
    
    if (window.firebaseMenuFunctions?.syncOrdersToSellerDashboard) {
        await window.firebaseMenuFunctions.syncOrdersToSellerDashboard();
    }
    loadVendorOrders();
    loadVendorHistoryAndAnalytics();
});

/* ========================================================
   3. FUNGSI PERPINDAHAN HALAMAN (TAB SWITCHING)
======================================================== */
function switchPage(pageId, element) {
    document.querySelectorAll('.page-view').forEach(p => p.classList.remove('active'));
    const targetPage = document.getElementById('page-' + pageId);
    if(targetPage) targetPage.classList.add('active');

    if (element && element.classList.contains('dock-item')) {
        document.querySelectorAll('.telegram-dock .dock-item').forEach(d => d.classList.remove('active'));
        element.classList.add('active');
    }

    if (pageId === 'sejarah') {
        loadVendorHistoryAndAnalytics();
    }
}

/* ========================================================
   4. FUNGSI KAWALAN STATUS KEDAI (BUKA / TUTUP)
======================================================== */
function confirmToggleShopStatus(checkbox) {
    const isChecked = checkbox.checked;
    checkbox.checked = !isChecked;

    const actionText = isChecked ? "Buka Kedai" : "Tutup Kedai";
    const descText = isChecked ? "Pelanggan boleh membuat pesanan seperti biasa." : "Pelanggan tidak boleh membuat pesanan baru.";

    showConfirm(actionText, descText, function() {
        checkbox.checked = isChecked;
        updateShopStatusText(isChecked);
        
        if (activeUser && activeUser.username) {
            let shopStatusKey = 'shop_status_' + activeUser.username;
            localStorage.setItem(shopStatusKey, isChecked ? 'buka' : 'tutup');
        }

        // 🔄 FIREBASE: Sinkronisasi status kedai ke database
        syncShopStatusToFirebase(isChecked);

        showNotification("Berjaya", `Status kedai kini: ${isChecked ? "BUKA" : "TUTUP"}`);
    });
}

function updateShopStatusText(isOpen) {
    const txt = document.getElementById('txt-status');
    if (txt) {
        txt.innerText = isOpen ? "BUKA" : "TUTUP";
        txt.style.color = isOpen ? "#30d158" : "#ff453a";
    }
}

/* ========================================================
   5. SISTEM NOTIFIKASI & MODAL PENGESAHAN
======================================================== */
function showNotification(title, message) {
    const titleEl = document.getElementById('notifTitle');
    const msgEl = document.getElementById('notifMessage');
    const modalEl = document.getElementById('modalNotification');

    if (titleEl) titleEl.innerText = title;
    if (msgEl) msgEl.innerText = message;
    if (modalEl) modalEl.style.display = "flex";
}

function showConfirm(title, message, callback) {
    const titleEl = document.getElementById('confirmTitle');
    const msgEl = document.getElementById('confirmMessage');
    if (titleEl) titleEl.innerText = title;
    if (msgEl) msgEl.innerText = message;

    const yesBtn = document.getElementById('confirmBtnYes');
    if (yesBtn) {
        const newBtn = yesBtn.cloneNode(true);
        yesBtn.parentNode.replaceChild(newBtn, yesBtn);
        newBtn.addEventListener('click', function() {
            closeModal('modalConfirm');
            callback();
        });
    }
    const modalEl = document.getElementById('modalConfirm');
    if (modalEl) modalEl.style.display = "flex";
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if(modal) modal.style.display = "none";
}

/* ========================================================
   6. FUNGSI PENGURUSAN PESANAN MASUK, STATUS & TRACKER MASA
======================================================== */
const orderTimers = {};
let previousOrderCount = 0;

function playOrderSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
    } catch(e) {
        console.log("Audio diblok oleh pelayar sehingga pengguna berinteraksi.");
    }
}

function loadVendorOrders() {
    const orderContainer = document.querySelector('#page-uruspesanan > div');
    if (!orderContainer || !activeUser) return;

    let allOrders = JSON.parse(localStorage.getItem('prebites_orders')) || [];
    
    // KUNCI UTAMA: Hanya tapis pesanan yang sepadan dengan store_id kedai ini
    const activeOrders = allOrders.filter(order => 
        (order.store_id === activeUser.store_id || order.shopId === activeUser.store_id || order.shopId === activeUser.username) && 
        ['diterima', 'baru', 'disediakan', 'sudah_siap'].includes(order.status || 'baru')
    );

    const newOrderCount = activeOrders.filter(o => o.status === 'diterima' || o.status === 'baru').length;
    if (newOrderCount > previousOrderCount && previousOrderCount !== 0) {
        playOrderSound();
        showNotification("🔔 Pesanan Baharu!", `Anda menerima ${newOrderCount - previousOrderCount} pesanan baharu!`);
    }
    previousOrderCount = newOrderCount;

    let htmlContent = `
        <div class="countdown-alert">
            ⏱️ <strong>Pesanan Aktif (${activeOrders.length})</strong> memerlukan tindakan dapur. Kemaskini status mengikut proses memasak.
        </div>
        <div class="section-title">Pesanan Masuk & Aktif</div>
    `;

    if (activeOrders.length === 0) {
        htmlContent += `<p style="text-align: center; color: #8e8e93; padding: 40px 10px;">Tiada pesanan aktif buat masa ini.<br><small>Sistem menyemak pesanan baharu secara automatik...</small></p>`;
    } else {
        activeOrders.forEach(order => {
            let itemsText = order.items.map(item => `<b>${item.quantity}x</b> ${item.name}`).join('<br>');
            let currentStatus = order.status || 'diterima';

            let statusBadgeHtml = '';
            if (currentStatus === 'diterima' || currentStatus === 'baru') {
                statusBadgeHtml = `<span class="badge" style="background: rgba(10, 132, 255, 0.15); color: #0a84ff; border: 1px solid rgba(10, 132, 255, 0.3);">🔵 Diterima</span>`;
            } else if (currentStatus === 'disediakan') {
                statusBadgeHtml = `<span class="badge" style="background: rgba(255, 179, 64, 0.15); color: #ffb340; border: 1px solid rgba(255, 179, 64, 0.3);">🟡 Disediakan (Memasak)</span>`;
            } else if (currentStatus === 'sudah_siap') {
                statusBadgeHtml = `<span class="badge" style="background: rgba(48, 209, 88, 0.15); color: #30d158; border: 1px solid rgba(48, 209, 88, 0.3);">🟢 Sudah Siap (Tunggu Ambil)</span>`;
            }

            let msgDisplay = order.vendorMessage ? 
                `<div style="background: rgba(255,179,64,0.1); border-left: 3px solid #ffb340; padding: 6px 10px; border-radius: 6px; margin: 8px 0; font-size: 11.5px; color: #ffb340;">
                    💬 <b>Mesej Dihantar (${order.messageTime}):</b> "${order.vendorMessage}"
                 </div>` : '';

            htmlContent += `
                <div class="order-card" id="order-${order.id}">
                    <div class="order-meta">
                        <span class="order-id">Order ID: #${order.id}</span>
                        <span class="order-time">${order.time || 'Baru Sahaja'}</span>
                    </div>
                    <div class="order-customer" style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
                        <span>👤 Pelanggan: <b>${order.customerName}</b></span>
                        ${statusBadgeHtml}
                    </div>
                    
                    <div class="order-items" style="margin: 10px 0; line-height: 1.5;">${itemsText}</div>
                    ${msgDisplay}

                    <div class="order-footer">
                        <span class="order-price">RM ${parseFloat(order.totalPrice || 0).toFixed(2)}</span>
                        <span class="timer-tracker" id="timer-${order.id}" style="${currentStatus === 'disediakan' ? 'display:inline-flex;' : 'display:none;'}">⏳ <span class="time-left">15:00</span></span>
                    </div>

                    <div class="order-actions" style="margin-top: 12px; display: flex; gap: 6px; flex-wrap: wrap;">
                        <button class="badge btn-mesej" onclick="hantarMesejTemplat('${order.id}', '${order.customerName}')">💬 Mesej</button>
                        
                        ${(currentStatus === 'diterima' || currentStatus === 'baru') ? `
                            <button class="badge badge-cooking action-terima" onclick="mulaSediakanPesanan('${order.id}', 15)">🟡 Mula Sediakan</button>
                        ` : ''}

                        ${currentStatus === 'disediakan' ? `
                            <button class="badge badge-ready action-siap" onclick="tandakanSudahSiap('${order.id}', '${order.customerName}')">🟢 Makanan Sudah Siap</button>
                        ` : ''}

                        ${currentStatus === 'sudah_siap' ? `
                            <button class="badge" style="background: rgba(37, 211, 102, 0.18); color: #25d366; border: 1px solid #25d366;" onclick="hantarNotifikasiWhatsApp('${order.id}', '${order.customerName}')">📱 Hantar WhatsApp</button>
                            <button class="badge" style="background: rgba(48, 209, 88, 0.2); color: #30d158; border: 1px solid #30d158;" onclick="tandakanSelesaiAmbil('${order.id}', '${order.customerName}')">⚪ Selesai (Diambil)</button>
                        ` : ''}

                        <button class="badge" style="background: rgba(255,69,58,0.15); color: #ff453a; border: 1px solid rgba(255,69,58,0.3);" onclick="tolakPesanan('${order.id}', '${order.customerName}')">❌ Tolak Order</button>
                    </div>
                </div>
            `;
        });
    }

    orderContainer.innerHTML = htmlContent;
}

function mulaSediakanPesanan(orderId, durationMins) {
    showConfirm("Mula Sediakan", "Adakah anda pasti mahu mula sediakan pesanan ini?", function() {
        let allOrders = JSON.parse(localStorage.getItem('prebites_orders')) || [];
        allOrders = allOrders.map(order => {
            if (order.id == orderId) {
                order.status = 'disediakan';
            }
            return order;
        });
        localStorage.setItem('prebites_orders', JSON.stringify(allOrders));

        mulakanTracker(orderId, durationMins);
        showNotification("Berjaya", `Status bertukar ke: DISEDIAKAN. Baki masa ${durationMins} minit bermula.`);
        loadVendorOrders();
    });
}

function tandakanSudahSiap(orderId, nama) {
    showConfirm("Makanan Sudah Siap", `Maklumkan kepada ${nama} bahawa makanan sudah siap untuk diambil?`, function() {
        if(orderTimers[orderId]) {
            clearInterval(orderTimers[orderId]);
        }

        let allOrders = JSON.parse(localStorage.getItem('prebites_orders')) || [];
        allOrders = allOrders.map(order => {
            if (order.id == orderId) {
                order.status = 'sudah_siap';
                order.vendorMessage = 'Pesanan dah siap!';
                order.messageTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
            return order;
        });
        localStorage.setItem('prebites_orders', JSON.stringify(allOrders));

        showNotification("Berjaya", `Notifikasi "SUDAH SIAP" dihantar kepada ${nama}!`);
        loadVendorOrders();
    });
}

function hantarNotifikasiWhatsApp(orderId, nama) {
    const allOrders = JSON.parse(localStorage.getItem('prebites_orders')) || [];
    const order = allOrders.find(item => item.id == orderId);
    if (!order) return;

    let phone = String(order.customerPhone || '').replace(/[^\d]/g, '');
    if (!phone) {
        phone = prompt(`Masukkan nombor WhatsApp ${nama} (contoh: 0123456789):`, '');
        if (phone === null) return;
        phone = phone.replace(/[^\d]/g, '');
    }

    if (phone.startsWith('0')) phone = `60${phone.slice(1)}`;
    if (!phone || phone.length < 10) {
        alert('Nombor WhatsApp tidak sah. Gunakan format 0123456789 atau 60123456789.');
        return;
    }

    const message = `Hai ${nama}, pesanan #${order.id} anda sudah siap untuk diambil. Terima kasih kerana menggunakan PreBites!`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
}

function tandakanSelesaiAmbil(orderId, nama) {
    showConfirm("Selesaikan Transaksi", `Adakah ${nama} telah mengambil pesanan ini?`, function() {
        let allOrders = JSON.parse(localStorage.getItem('prebites_orders')) || [];
        allOrders = allOrders.map(order => {
            if (order.id == orderId) {
                order.status = 'selesai';
                order.completedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
            return order;
        });
        localStorage.setItem('prebites_orders', JSON.stringify(allOrders));

        showNotification("Transaksi Selesai", `Pesanan ${nama} berjaya diselesaikan & dikira dalam Analitik!`);
        loadVendorOrders();
        loadVendorHistoryAndAnalytics();
    });
}

function tolakPesanan(orderId, nama) {
    let alasan = prompt(`Nyatakan sebab mengapa pesanan dari ${nama} terpaksa ditolak:`, "Menu habis.");
    
    if (alasan === null) return;
    if (!alasan.trim()) {
        alert("Sila masukkan alasan penolakan pesanan.");
        return;
    }

    let allOrders = JSON.parse(localStorage.getItem('prebites_orders')) || [];
    allOrders = allOrders.map(order => {
        if (order.id == orderId) {
            order.status = 'dibatalkan';
            order.reason = alasan.trim();
            order.completedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        return order;
    });
    localStorage.setItem('prebites_orders', JSON.stringify(allOrders));

    showNotification("Pesanan Ditolak", `Pesanan ${nama} dibatalkan atas sebab: "${alasan}"`);
    loadVendorOrders();
    loadVendorHistoryAndAnalytics();
}

function hantarMesejTemplat(orderId, namaPelanggan) {
    currentActiveOrderId = orderId;
    const modal = document.getElementById('modalTemplateMsg');
    if (modal) modal.style.display = 'flex';
}

let currentActiveOrderId = null;

function pilihMesejPreset(mesejAkhir) {
    if (!currentActiveOrderId) return;

    let allOrders = JSON.parse(localStorage.getItem('prebites_orders')) || [];
    allOrders = allOrders.map(order => {
        if (order.id == currentActiveOrderId) {
            order.vendorMessage = mesejAkhir;
            order.messageTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        return order;
    });
    localStorage.setItem('prebites_orders', JSON.stringify(allOrders));

    closeModal('modalTemplateMsg');
    showNotification("Mesej Dihantar! 💬", `Mesej "${mesejAkhir}" berjaya dipaparkan kepada pelanggan.`);
    loadVendorOrders();
}

function mulakanTracker(orderId, durationMins) {
    let timeInSeconds = durationMins * 60;
    const timerElement = document.getElementById(`timer-${orderId}`);
    if (!timerElement) return;
    
    const timeDisplay = timerElement.querySelector('.time-left');
    timerElement.style.display = 'inline-flex';

    orderTimers[orderId] = setInterval(() => {
        let minutes = Math.floor(timeInSeconds / 60);
        let seconds = timeInSeconds % 60;
        
        minutes = minutes < 10 ? '0' + minutes : minutes;
        seconds = seconds < 10 ? '0' + seconds : seconds;
        
        if (timeDisplay) timeDisplay.textContent = minutes + ':' + seconds;

        if (--timeInSeconds < 0) {
            clearInterval(orderTimers[orderId]);
            if (timeDisplay) timeDisplay.textContent = "LEWAT!";
            timerElement.style.color = "#ff453a";
            timerElement.style.background = "rgba(255,69,58,0.1)";
            timerElement.style.borderColor = "rgba(255,69,58,0.3)";
        }
    }, 1000);
}

setInterval(() => {
    const activePage = document.querySelector('.page-view.active');
    if (activePage && activePage.id === 'page-uruspesanan') {
        loadVendorOrders();
    }
}, 5000);

/* ========================================================
   7. OBJEK & FUNGSI PROFIL / AKAUN KEDAI & DRAG/ZOOM (CANVA STYLE)
======================================================== */
let shopData = {
    name: "Gerai Makanan",
    about: "Menyediakan pelbagai jenis makanan panas dan minuman sedap setiap hari.",
    phone: "+6012-345 6789",
    social: "social media anda",
    day: "Isnin - Jumaat",
    openTime: "08:00 AM",
    closeTime: "10:00 PM",
    bankName: "Maybank / Maybank2u",
    ownerName: "Pemilik Kedai",
    accountNum: "123456789012",
    qrImage: "",
    shopImage: "",
    qrOffsetX: 0,
    qrOffsetY: 0,
    qrScale: 1.0,
    shopOffsetX: 0,
    shopOffsetY: 0,
    shopScale: 1.0
};

let tempQRBase64 = "";
let tempShopImageBase64 = "";
let tempQROffsetX = 0;
let tempQROffsetY = 0;
let tempQRScale = 1.0;
let tempShopOffsetX = 0;
let tempShopOffsetY = 0;
let tempShopScale = 1.0;

function clampOffset(x, y, scale, containerWidth, containerHeight) {
    let extraWidth = (containerWidth * scale - containerWidth) / 2;
    let extraHeight = (containerHeight * scale - containerHeight) / 2;
    
    let baseBuffer = 40; 
    let maxTransX = Math.max(baseBuffer, extraWidth + 20);
    let maxTransY = Math.max(baseBuffer, extraHeight + 20);
    
    let clampedX = Math.max(-maxTransX, Math.min(maxTransX, x));
    let clampedY = Math.max(-maxTransY, Math.min(maxTransY, y));
    
    return { x: clampedX, y: clampedY };
}

function initDragListeners(containerId, imgId, type) {
    const container = document.getElementById(containerId);
    const img = document.getElementById(imgId);
    if (!container || !img) return;

    let isPointerDown = false;
    let startX = 0;
    let startY = 0;

    const onPointerDown = (clientX, clientY) => {
        isPointerDown = true;
        let activeX = (type === 'qr') ? tempQROffsetX : tempShopOffsetX;
        let activeY = (type === 'qr') ? tempQROffsetY : tempShopOffsetY;
        
        startX = clientX - activeX;
        startY = clientY - activeY;
    };

    const onPointerMove = (clientX, clientY) => {
        if (!isPointerDown) return;

        let rawX = clientX - startX;
        let rawY = clientY - startY;

        let activeWidth = container.clientWidth || container.offsetWidth || (type === 'qr' ? 140 : 300);
        let activeHeight = container.clientHeight || container.offsetHeight || 160;
        
        let currentScale = (type === 'qr') ? tempQRScale : tempShopScale;
        let clamped = clampOffset(rawX, rawY, currentScale, activeWidth, activeHeight);

        if (type === 'qr') {
            tempQROffsetX = clamped.x;
            tempQROffsetY = clamped.y;
        } else {
            tempShopOffsetX = clamped.x;
            tempShopOffsetY = clamped.y;
        }

        updateImageTransform(img, clamped.x, clamped.y, currentScale);
    };

    const onPointerUp = () => {
        isPointerDown = false;
    };

    const handleMouseMove = (e) => {
        if (isPointerDown) onPointerMove(e.clientX, e.clientY);
    };
    
    const handleMouseUp = () => {
        onPointerUp();
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    };

    container.onmousedown = (e) => {
        onPointerDown(e.clientX, e.clientY);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        e.preventDefault();
    };

    const handleTouchMove = (e) => {
        if (isPointerDown && e.touches.length === 1) {
            onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
            e.preventDefault();
        }
    };

    const handleTouchEnd = () => {
        onPointerUp();
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchend', handleTouchEnd);
    };

    container.ontouchstart = (e) => {
        if (e.touches.length === 1) {
            onPointerDown(e.touches[0].clientX, e.touches[0].clientY);
            window.addEventListener('touchmove', handleTouchMove, { passive: false });
            window.addEventListener('touchend', handleTouchEnd);
        }
    };
}

function adjustImageScale(delta, type) {
    const container = document.getElementById(type === 'qr' ? 'qrPreviewContainer' : 'shopImagePreviewContainer');
    const containerWidth = container ? (container.clientWidth || container.offsetWidth) : (type === 'qr' ? 140 : 300);
    const containerHeight = container ? (container.clientHeight || container.offsetHeight) : (type === 'qr' ? 140 : 160);

    let scale = (type === 'qr') ? tempQRScale : tempShopScale;
    let offsetX = (type === 'qr') ? tempQROffsetX : tempShopOffsetX;
    let offsetY = (type === 'qr') ? tempQROffsetY : tempShopOffsetY;

    scale = Math.max(1.0, Math.min(4.0, scale + delta));
    let clamped = clampOffset(offsetX, offsetY, scale, containerWidth, containerHeight);

    if (type === 'qr') {
        tempQRScale = scale;
        tempQROffsetX = clamped.x;
        tempQROffsetY = clamped.y;
    } else {
        tempShopScale = scale;
        tempShopOffsetX = clamped.x;
        tempShopOffsetY = clamped.y;
    }

    const imgId = (type === 'qr') ? 'editShopQRPreview' : 'editShopImagePreview';
    const img = document.getElementById(imgId);
    updateImageTransform(img, clamped.x, clamped.y, scale);
}

function updateImageTransform(img, x, y, scale) {
    if (img) {
        img.style.objectFit = 'cover';
        img.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${scale})`;
    }
}

function removeShopImage() {
    tempShopImageBase64 = "";
    tempShopOffsetX = 0;
    tempShopOffsetY = 0;
    tempShopScale = 1.0;
    
    const img = document.getElementById('editShopImagePreview');
    const placeholder = document.getElementById('shopImagePlaceholder');
    const fileInput = document.getElementById('editShopImageFile');

    if (img) {
        img.src = "";
        img.style.display = 'none';
    }
    if (placeholder) {
        placeholder.style.display = 'block';
    }
    if (fileInput) {
        fileInput.value = "";
    }
}

function removeQRImage() {
    tempQRBase64 = "";
    tempQROffsetX = 0;
    tempQROffsetY = 0;
    tempQRScale = 1.0;
    
    const img = document.getElementById('editShopQRPreview');
    const placeholder = document.getElementById('qrPlaceholder');
    const fileInput = document.getElementById('editShopQRFile');

    if (img) {
        img.src = "";
        img.style.display = 'none';
    }
    if (placeholder) {
        placeholder.style.display = 'block';
    }
    if (fileInput) {
        fileInput.value = "";
    }
}

function openAccountModal() {
    renderAccountReadOnly();
    document.getElementById('modalAccount').style.display = "flex";
}

function renderAccountReadOnly() {
    document.getElementById('accountModalTitle').innerText = "Maklumat & Akaun Kedai";
    
    let bodyHtml = `
        <div class="account-overview" style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); padding: 16px; border-radius: 18px; margin-bottom: 20px;">
            <div class="account-overview-icon" style="background: linear-gradient(135deg, rgba(230,126,34,0.2), rgba(255,159,10,0.1)); color: #f39c12; border: 1px solid rgba(230,126,34,0.3);">🏪</div>
            <div class="account-overview-text">
                <small style="color: #f39c12; font-weight: 700;">AKAUN AKTIF: ${activeUser ? activeUser.username.toUpperCase() : ''}</small>
                <h3 style="font-size: 17px; margin-top: 2px;">${shopData.name}</h3>
                <p style="color: #a1a1aa; font-size: 12px; margin-top: 4px; line-height: 1.4;">${shopData.about}</p>
            </div>
        </div>

        <div class="modern-profile-card">
            <div class="modern-profile-card-title">🏷️ Maklumat Asas & Pemilik</div>
            <div class="modern-profile-row"><span>Nama Kedai:</span> <span id="view-shopname" style="color: #f39c12;">${shopData.name}</span></div>
            <div class="modern-profile-row"><span>Nama Pemilik:</span> <span style="color: #fff; font-weight: 800;">${shopData.ownerName}</span></div>
            <div class="modern-profile-row"><span>Bio / About:</span> <span style="color: #d1d1d6; font-weight: 500; font-size: 12px; text-align: right; max-width: 220px;">${shopData.about}</span></div>
            <div class="modern-profile-row"><span>No. Telefon:</span> <span>${shopData.phone}</span></div>
            <div class="modern-profile-row"><span>Media Sosial:</span> <span style="color: #0a84ff;">${shopData.social}</span></div>
        </div>

        <div class="modern-profile-card">
            <div class="modern-profile-card-title">⏰ Waktu & Hari Operasi</div>
            <div class="modern-profile-row"><span>Hari Operasi:</span> <span class="profile-badge" style="background: rgba(10,132,255,0.1); color: #0a84ff; border-color: rgba(10,132,255,0.2);">${shopData.day}</span></div>
            <div class="modern-profile-row"><span>Masa Operasi:</span> <span class="profile-badge" style="background: rgba(48,209,88,0.1); color: #30d158; border-color: rgba(48,209,88,0.2);">🟢 ${shopData.openTime} - ${shopData.closeTime}</span></div>
        </div>

        <div class="modern-profile-card">
            <div class="modern-profile-card-title">💳 Pembayaran & DuitNow QR</div>
            <div class="modern-profile-row"><span>Bank Pilihan:</span> <span style="color: #ffb340;">${shopData.bankName}</span></div>
            <div class="modern-profile-row"><span>No. Akaun Bank:</span> <span style="letter-spacing: 0.5px; font-family: monospace;">${shopData.accountNum}</span></div>
            <div class="modern-profile-row" style="grid-template-columns: 1fr; margin-top: 10px; text-align: center;">
                <span style="color:#8e8e93; font-size:11px; text-transform: uppercase; font-weight: 700; margin-bottom: 4px; display: block;">Kod QR Pembayaran DuitNow</span>
                <span class="profile-qr-preview" style="position: relative; width: 140px; height: 140px; background: rgba(0,0,0,0.5); border-radius: 14px; overflow: hidden; display: flex; align-items: center; justify-content: center; margin: 4px auto 0 auto; border: 1px solid rgba(255,255,255,0.15);">
                    ${shopData.qrImage ? `<img src="${shopData.qrImage}" style="position: absolute; left: 50%; top: 50%; width: 100%; height: 100%; object-fit: cover; transform: translate(calc(-50% + ${shopData.qrOffsetX || 0}px), calc(-50% + ${shopData.qrOffsetY || 0}px)) scale(${shopData.qrScale || 1.0});">` : `<span class="profile-qr-placeholder">Tiada Kod QR<br>Disimpan</span>`}
                </span>
            </div>
        </div>

        <div class="modern-profile-card">
            <div class="modern-profile-card-title">📷 Paparan Visual Kedai</div>
            <div class="profile-shop-image" style="position: relative; overflow: hidden; width: 100%; height: 150px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.12);">
                ${shopData.shopImage ? `<img src="${shopData.shopImage}" alt="Gambar Kedai" style="position: absolute; left: 50%; top: 50%; width: 100%; height: 100%; object-fit: cover; transform: translate(calc(-50% + ${shopData.shopOffsetX || 0}px), calc(-50% + ${shopData.shopOffsetY || 0}px)) scale(${shopData.shopScale || 1.0});">` : `<span class="profile-image-placeholder">Tiada Gambar Kedai Disimpan</span>`}
            </div>
        </div>
    `;
    document.getElementById('accountModalBody').innerHTML = bodyHtml;

    let footerHtml = `
        <button class="btn-modal btn-cancel" onclick="closeModal('modalAccount')" style="flex: 1;">Tutup</button>
        <button class="btn-modal btn-save" onclick="renderAccountEditMode()" style="flex: 1; background: linear-gradient(135deg, #e67e22, #f39c12);">✏️ Edit Akaun</button>
    `;
    document.getElementById('accountModalFooter').innerHTML = footerHtml;
}

function renderAccountEditMode() {
    document.getElementById('accountModalTitle').innerText = "Kemaskini Akaun Kedai";
    
    tempShopImageBase64 = shopData.shopImage || "";
    tempQRBase64 = shopData.qrImage || "";
    tempQROffsetX = shopData.qrOffsetX !== undefined ? shopData.qrOffsetX : 0;
    tempQROffsetY = shopData.qrOffsetY !== undefined ? shopData.qrOffsetY : 0;
    tempQRScale = shopData.qrScale !== undefined ? shopData.qrScale : 1.0;
    tempShopOffsetX = shopData.shopOffsetX !== undefined ? shopData.shopOffsetX : 0;
    tempShopOffsetY = shopData.shopOffsetY !== undefined ? shopData.shopOffsetY : 0;
    tempShopScale = shopData.shopScale !== undefined ? shopData.shopScale : 1.0;

    let cleanName = (shopData.name && !shopData.name.includes('Gerai Makanan') && !shopData.name.includes('Peniaga (Stall')) ? shopData.name : '';
    let cleanOwner = (shopData.ownerName && shopData.ownerName !== 'Pemilik Kedai') ? shopData.ownerName : '';
    let cleanPhone = (shopData.phone && !shopData.phone.includes('+6012')) ? shopData.phone : '';
    let cleanSocial = (shopData.social && shopData.social !== 'social media anda') ? shopData.social : '';
    let cleanAbout = (shopData.about && !shopData.about.includes('Menyediakan pelbagai')) ? shopData.about : '';
    let cleanAccount = (shopData.accountNum && shopData.accountNum !== '123456789012') ? shopData.accountNum : '';

    let bodyHtml = `
        <div class="account-overview" style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); padding: 16px; border-radius: 18px; margin-bottom: 20px;">
            <div class="account-overview-icon" style="background: linear-gradient(135deg, rgba(10,132,255,0.2), rgba(0,113,227,0.1)); color: #0a84ff; border: 1px solid rgba(10,132,255,0.3);">⚙️</div>
            <div class="account-overview-text">
                <small style="color: #0a84ff; font-weight: 700;">MOD KEMASKINI</small>
                <h3 style="font-size: 16px; margin-top: 2px;">Sunting Profil & Media Kedai</h3>
                <p style="color: #a1a1aa; font-size: 11.5px; margin-top: 2px;">Seret & zum imej untuk kedudukan terbaik.</p>
            </div>
        </div>

        <div class="form-group">
            <label>🖼️ Gambar Kedai (Seret & Zum Imej)</label>
            <div class="shop-image-upload">
                <div class="shop-image-preview" id="shopImagePreviewContainer" style="position: relative; width: 100%; height: 160px; background: rgba(0,0,0,0.5); border-radius: 14px; overflow: hidden; cursor: grab; display: flex; align-items: center; justify-content: center; border: 1px dashed rgba(255,255,255,0.2);">
                    <img id="editShopImagePreview" src="${shopData.shopImage || ''}" alt="Preview Gambar Kedai" style="position: absolute; left: 50%; top: 50%; width: 100%; height: 100%; object-fit: cover; ${shopData.shopImage ? '' : 'display:none;'}">
                    <span id="shopImagePlaceholder" ${shopData.shopImage ? 'style="display:none;"' : ''} style="color: #8e8e93; font-size: 12px;">Sila muat naik imej kedai</span>
                </div>
                <div style="display: flex; gap: 8px; margin-top: 8px; justify-content: center; flex-wrap: wrap;">
                    <button type="button" class="btn-modal btn-cancel" style="padding: 6px 12px; font-size: 11px;" onclick="adjustImageScale(-0.1, 'shop')">🔍 ➖ Zum Keluar</button>
                    <button type="button" class="btn-modal btn-cancel" style="padding: 6px 12px; font-size: 11px;" onclick="adjustImageScale(0.1, 'shop')">🔍 ➕ Zum Masuk</button>
                    <button type="button" class="btn-modal" style="padding: 6px 12px; font-size: 11px; background: rgba(255,69,58,0.15); color: #ff453a; border: 1px solid rgba(255,69,58,0.3);" onclick="removeShopImage()">🗑️ Buang Gambar</button>
                </div>
                <input type="file" id="editShopImageFile" accept="image/*" onchange="previewShopImage(event)" style="font-size: 11.5px; cursor: pointer; margin-top: 6px; color: #a1a1aa;">
            </div>
        </div>

        <div class="toggle-row">
            <div class="form-group">
                <label>Nama Kedai *</label>
                <input type="text" id="editShopName" class="modal-input" placeholder="Sila isi nama kedai" value="${cleanName}">
            </div>
            <div class="form-group">
                <label>Nama Pemilik Kedai *</label>
                <input type="text" id="editShopOwner" class="modal-input" placeholder="Sila isi nama pemilik" value="${cleanOwner}">
            </div>
        </div>

        <div class="toggle-row">
            <div class="form-group">
                <label>Nombor Telefon / WhatsApp *</label>
                <input type="text" id="editShopPhone" class="modal-input" placeholder="Sila isi nombor phone" value="${cleanPhone}">
            </div>
            <div class="form-group">
                <label>Media Sosial (IG / TikTok)</label>
                <input type="text" id="editShopSocial" class="modal-input" placeholder="Sila isi media sosial (jika ada)" value="${cleanSocial}">
            </div>
        </div>

        <div class="form-group">
            <label>Mengenai Kedai (Bio / About)</label>
            <textarea id="editShopAbout" class="modal-input" rows="2" placeholder="Sila tulis penerangan ringkas tentang kedai">${cleanAbout}</textarea>
        </div>

        <div class="toggle-row">
            <div class="form-group">
                <label>Hari Operasi</label>
                <select id="editShopDay" class="modal-input">
                    <option value="Isnin - Jumaat" ${shopData.day === 'Isnin - Jumaat' ? 'selected' : ''}>Isnin - Jumaat</option>
                    <option value="Isnin - Ahad" ${shopData.day === 'Isnin - Ahad' ? 'selected' : ''}>Isnin - Ahad (Setiap Hari)</option>
                    <option value="Hujung Minggu Sahaja" ${shopData.day === 'Hujung Minggu Sahaja' ? 'selected' : ''}>Hujung Minggu Sahaja</option>
                </select>
            </div>
            <div class="form-group">
                <label>Pilih Bank</label>
                <select id="editShopBank" class="modal-input">
                    <option value="Maybank / Maybank2u" ${shopData.bankName.includes('Maybank') ? 'selected' : ''}>Maybank / Maybank2u</option>
                    <option value="CIMB Clicks" ${shopData.bankName.includes('CIMB') ? 'selected' : ''}>CIMB Clicks</option>
                    <option value="Public Bank" ${shopData.bankName.includes('Public Bank') ? 'selected' : ''}>Public Bank</option>
                </select>
            </div>
        </div>

        <div class="toggle-row">
            <div class="form-group">
                <label>Masa Buka</label>
                <input type="text" id="editShopOpen" class="modal-input" placeholder="Cth: 08:00 AM" value="${shopData.openTime}">
            </div>
            <div class="form-group">
                <label>Masa Tutup</label>
                <input type="text" id="editShopClose" class="modal-input" placeholder="Cth: 10:00 PM" value="${shopData.closeTime}">
            </div>
        </div>

        <div class="form-group">
            <label>Nombor Akaun Bank *</label>
            <input type="text" id="editShopAccount" class="modal-input" placeholder="Sila isi nombor akaun bank" value="${cleanAccount}">
        </div>

        <div class="form-group">
            <label>📱 Tukar Kod QR DuitNow (Seret & Zum)</label>
            <div class="qr-adjust-container" style="display: flex; flex-direction: column; align-items: center; background: rgba(255,255,255,0.02); padding: 14px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.06);">
                <div class="qr-preview-box" id="qrPreviewContainer" style="position: relative; width: 140px; height: 140px; background: rgba(0,0,0,0.5); border-radius: 12px; overflow: hidden; cursor: grab; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,0.15); margin: 0 auto;">
                    <img id="editShopQRPreview" src="${shopData.qrImage || ''}" alt="QR Kod" class="qr-preview-img" style="position: absolute; left: 50%; top: 50%; width: 100%; height: 100%; object-fit: cover; ${shopData.qrImage ? '' : 'display:none;'}">
                    <span id="qrPlaceholder" class="profile-qr-placeholder" ${shopData.qrImage ? 'style="display:none;"' : ''} style="color: #8e8e93; font-size: 11px; text-align: center;">Sila muat naik<br>QR DuitNow</span>
                </div>
                <div style="display: flex; gap: 8px; margin-top: 8px; justify-content: center; flex-wrap: wrap;">
                    <button type="button" class="btn-modal btn-cancel" style="padding: 5px 10px; font-size: 11px;" onclick="adjustImageScale(-0.1, 'qr')">🔍 ➖ Zum Keluar</button>
                    <button type="button" class="btn-modal btn-cancel" style="padding: 5px 10px; font-size: 11px;" onclick="adjustImageScale(0.1, 'qr')">🔍 ➕ Zum Masuk</button>
                    <button type="button" class="btn-modal" style="padding: 5px 10px; font-size: 11px; background: rgba(255,69,58,0.15); color: #ff453a; border: 1px solid rgba(255,69,58,0.3);" onclick="removeQRImage()">🗑️ Buang QR</button>
                </div>
                <input type="file" id="editShopQRFile" accept="image/*" onchange="previewNewQR(event)" style="font-size: 11px; cursor: pointer; margin-top: 8px; color: #a1a1aa;">
            </div>
        </div>
    `;
    document.getElementById('accountModalBody').innerHTML = bodyHtml;
    
    setTimeout(() => {
        const qrImg = document.getElementById('editShopQRPreview');
        if (qrImg && shopData.qrImage) {
            updateImageTransform(qrImg, tempQROffsetX, tempQROffsetY, tempQRScale);
        }
        const shopImg = document.getElementById('editShopImagePreview');
        if (shopImg && shopData.shopImage) {
            updateImageTransform(shopImg, tempShopOffsetX, tempShopOffsetY, tempShopScale);
        }

        initDragListeners('shopImagePreviewContainer', 'editShopImagePreview', 'shop');
        initDragListeners('qrPreviewContainer', 'editShopQRPreview', 'qr');
    }, 50);

    let footerHtml = `
        <button class="btn-modal btn-cancel" onclick="renderAccountReadOnly()" style="flex: 1;">Batal</button>
        <button class="btn-modal btn-save" onclick="saveAccountChanges()" style="flex: 1; background: #30d158; color: #000; font-weight: 800;">Simpan Perubahan</button>
    `;
    document.getElementById('accountModalFooter').innerHTML = footerHtml;
}

function previewNewQR(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function() {
            tempQRBase64 = reader.result;
            tempQROffsetX = 0;
            tempQROffsetY = 0;
            tempQRScale = 1.0;
            const img = document.getElementById('editShopQRPreview');
            const placeholder = document.getElementById('qrPlaceholder');

            if (img) {
                img.src = tempQRBase64;
                img.style.display = 'block';
                updateImageTransform(img, 0, 0, 1.0);
            }
            if (placeholder) {
                placeholder.style.display = 'none';
            }
            initDragListeners('qrPreviewContainer', 'editShopQRPreview', 'qr');
        };
        reader.readAsDataURL(file);
    }
}

function previewShopImage(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function() {
            tempShopImageBase64 = reader.result;
            tempShopOffsetX = 0;
            tempShopOffsetY = 0;
            tempShopScale = 1.0;
            const img = document.getElementById('editShopImagePreview');
            const placeholder = document.getElementById('shopImagePlaceholder');
            if (img) {
                img.src = tempShopImageBase64;
                img.style.display = 'block';
                updateImageTransform(img, 0, 0, 1.0);
            }
            if (placeholder) {
                placeholder.style.display = 'none';
            }
            initDragListeners('shopImagePreviewContainer', 'editShopImagePreview', 'shop');
        };
        reader.readAsDataURL(file);
    }
}

async function saveAccountChanges() {
    let name = document.getElementById('editShopName').value.trim();
    let about = document.getElementById('editShopAbout').value.trim();
    let phone = document.getElementById('editShopPhone').value.trim();
    let social = document.getElementById('editShopSocial').value.trim();
    let day = document.getElementById('editShopDay').value;
    let openTime = document.getElementById('editShopOpen').value.trim();
    let closeTime = document.getElementById('editShopClose').value.trim();
    let bankName = document.getElementById('editShopBank').value;
    let ownerName = document.getElementById('editShopOwner').value.trim();
    let accountNum = document.getElementById('editShopAccount').value.trim();

    if (!name || !phone || !ownerName || !accountNum) {
        showNotification("Ralat Validasi", "Sila lengkapkan medan mandatori yang bertanda (*) seperti Nama Kedai, No. Telefon, Nama Pemilik dan No. Akaun Bank!");
        return;
    }

    shopData.name = name;
    shopData.about = about;
    shopData.phone = phone;
    shopData.social = social;
    shopData.day = day;
    shopData.openTime = openTime;
    shopData.closeTime = closeTime;
    shopData.bankName = bankName;
    shopData.ownerName = ownerName;
    shopData.accountNum = accountNum;

    shopData.shopImage = tempShopImageBase64;
    shopData.shopOffsetX = tempShopOffsetX;
    shopData.shopOffsetY = tempShopOffsetY;
    shopData.shopScale = tempShopScale;

    shopData.qrImage = tempQRBase64;
    shopData.qrOffsetX = tempQROffsetX;
    shopData.qrOffsetY = tempQROffsetY;
    shopData.qrScale = tempQRScale;

    if (activeUser && activeUser.username) {
        localStorage.setItem('shop_profile_' + activeUser.username, JSON.stringify(shopData));
        localStorage.setItem('shop_profile_' + activeUser.store_id, JSON.stringify(shopData));
    }

    const firebaseSaved = await syncShopProfileToFirebase(shopData);
    if (!firebaseSaved) {
        showNotification("Ralat", "Profil disimpan pada peranti ini, tetapi gagal disimpan ke Firebase. Sila cuba lagi.");
        return;
    }

    const shopNameDisplay = document.getElementById('shop-name-display');
    if (shopNameDisplay) shopNameDisplay.innerText = name;

    closeModal('modalAccount');
    showNotification("✨ Berjaya!", "Maklumat akaun, gambar kedai dan kod QR DuitNow berjaya dikemaskini.");
}

/* ========================================================
   8. FUNGSI TAB SEJARAH PESANAN & ANALITIK TERPERINCI
======================================================== */
function filterSejarah(kategori, btn) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    updateTabPill(btn);

    const selesai = document.getElementById('senarai-selesai');
    const batal = document.getElementById('senarai-dibatalkan');

    if (kategori === 'semua') { 
        if (selesai) selesai.style.display = 'block'; 
        if (batal) batal.style.display = 'block'; 
    }
    else if (kategori === 'selesai') { 
        if (selesai) selesai.style.display = 'block'; 
        if (batal) batal.style.display = 'none'; 
    }
    else if (kategori === 'dibatalkan') { 
        if (selesai) selesai.style.display = 'none'; 
        if (batal) batal.style.display = 'block'; 
    }
}

const tabPill = document.getElementById('tabPill');
function updateTabPill(btn) {
    const index = btn.getAttribute('data-index');
    if (tabPill) tabPill.style.transform = `translateX(calc(${index * 100}%))`;
}

function loadVendorHistoryAndAnalytics() {
    if (!activeUser) return;

    let allOrders = JSON.parse(localStorage.getItem('prebites_orders')) || [];
    
    // KUNCI UTAMA: Hanya tapis rekod sejarah mengikut store_id
    const vendorOrders = allOrders.filter(order => order.store_id === activeUser.store_id || order.shopId === activeUser.store_id || order.shopId === activeUser.username);

    const completedOrders = vendorOrders.filter(o => o.status === 'selesai' || o.status === 'sudah_siap');
    const cancelledOrders = vendorOrders.filter(o => o.status === 'dibatalkan');

    const selesaiContainer = document.getElementById('senarai-selesai');
    if (selesaiContainer) {
        let selesaiHtml = `<div class="section-title">Rekod Selesai (${completedOrders.length})</div>`;
        if (completedOrders.length === 0) {
            selesaiHtml += `<p style="text-align: center; color: #8e8e93; padding: 15px;">Tiada rekod selesai.</p>`;
        } else {
            completedOrders.forEach(order => {
                let itemsText = order.items.map(item => `${item.quantity}x ${item.name}`).join('<br>');
                selesaiHtml += `
                    <div class="order-card selesai">
                        <div class="order-meta">
                            <span class="order-id">Order ID: #${order.id}</span>
                            <span class="order-time">${order.completedAt || 'Selesai'}</span>
                        </div>
                        <div class="order-customer">👤 Pelanggan: ${order.customerName}</div>
                        <div class="order-items">${itemsText}</div>
                        <div class="order-footer">
                            <span class="order-price">RM ${parseFloat(order.totalPrice || 0).toFixed(2)}</span>
                            <span class="badge badge-completed" style="background: rgba(48, 209, 88, 0.15); color: #30d158; border: 1px solid rgba(48, 209, 88, 0.3);">Selesai</span>
                        </div>
                    </div>
                `;
            });
        }
        selesaiContainer.innerHTML = selesaiHtml;
    }

    const batalContainer = document.getElementById('senarai-dibatalkan');
    if (batalContainer) {
        let batalHtml = `<div class="section-title" style="margin-top: 25px;">Rekod Dibatalkan (${cancelledOrders.length})</div>`;
        if (cancelledOrders.length === 0) {
            batalHtml += `<p style="text-align: center; color: #8e8e93; padding: 15px;">Tiada rekod dibatalkan.</p>`;
        } else {
            cancelledOrders.forEach(order => {
                let itemsText = order.items.map(item => `${item.quantity}x ${item.name}`).join('<br>');
                batalHtml += `
                    <div class="order-card dibatalkan">
                        <div class="order-meta">
                            <span class="order-id">Order ID: #${order.id}</span>
                            <span class="order-time">${order.completedAt || 'Dibatalkan'}</span>
                        </div>
                        <div class="order-customer" style="background: rgba(255, 69, 58, 0.1); color: #ff453a; border-color: rgba(255, 69, 58, 0.2);">👤 Pelanggan: ${order.customerName}</div>
                        <div class="order-items">
                            ${itemsText}<br>
                            <strong style="color: #ff453a; font-size: 11.5px;">Sebab: ${order.reason || 'Tiada alasan'}</strong>
                        </div>
                        <div class="order-footer">
                            <span class="order-price">RM ${parseFloat(order.totalPrice || 0).toFixed(2)}</span>
                            <span class="badge badge-cancelled" style="background: rgba(255, 69, 58, 0.15); color: #ff453a; border: 1px solid rgba(255, 69, 58, 0.3);">Dibatalkan</span>
                        </div>
                    </div>
                `;
            });
        }
        batalContainer.innerHTML = batalHtml;
    }

    let totalRevenue = 0;
    let itemBreakdown = {};

    completedOrders.forEach(order => {
        totalRevenue += (order.totalPrice || 0);
        if (order.items && Array.isArray(order.items)) {
            order.items.forEach(item => {
                if (!itemBreakdown[item.name]) {
                    itemBreakdown[item.name] = { qty: 0, total: 0 };
                }
                itemBreakdown[item.name].qty += item.quantity;
                itemBreakdown[item.name].total += ((item.price || 0) * item.quantity);
            });
        }
    });

    const analyticsBox = document.querySelector('.mini-analytics');
    if (analyticsBox) {
        let breakdownHtml = '';
        for (let itemName in itemBreakdown) {
            breakdownHtml += `<div style="display: flex; justify-content: space-between; font-size: 12px; color: #d1d1d6;">
                <span>• ${itemName} (${itemBreakdown[itemName].qty} unit)</span>
                <strong>RM ${itemBreakdown[itemName].total.toFixed(2)}</strong>
            </div>`;
        }

        analyticsBox.innerHTML = `
            <p style="color: #8e8e93; font-size: 12px;">Pendapatan Keseluruhan (Selesai)</p>
            <h2 style="color: #30d158; font-size: 28px; margin: 4px 0 12px 0;">RM ${totalRevenue.toFixed(2)}</h2>
            
            <div class="analytics-grid" style="display: flex; gap: 10px; margin-bottom: 12px; font-size: 12px;">
                <span style="background: rgba(48, 209, 88, 0.1); color: #30d158; padding: 4px 10px; border-radius: 8px;">🟢 ${completedOrders.length} Selesai</span>
                <span style="background: rgba(255, 69, 58, 0.1); color: #ff453a; padding: 4px 10px; border-radius: 8px;">🔴 ${cancelledOrders.length} Dibatalkan</span>
            </div>

            <div style="border-top: 1px solid rgba(255,255,255,0.08); padding-top: 10px; margin-top: 8px;">
                <p style="font-size: 11px; color: #ffb340; margin-bottom: 8px; font-weight: 700; letter-spacing: 0.5px;">🏆 PECAHAN JUALAN MENU:</p>
                <div style="display: flex; flex-direction: column; gap: 6px;">
                    ${breakdownHtml || '<span style="color: #8e8e93; font-size: 11px;">Belum ada jualan menu.</span>'}
                </div>
            </div>
        `;
    }
}

/* ========================================================
   9. FUNGSI PENGURUSAN MENU (TAMBAH, BACA, & PADAM)
======================================================== */
let foodImageBase64 = "";

function previewFoodImage(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function() {
            foodImageBase64 = reader.result;
            const prev = document.getElementById('foodImgPreview');
            if(prev) {
                prev.src = foodImageBase64;
                prev.style.display = "block";
            }
            const placeholder = document.getElementById('foodImgPlaceholder');
            if(placeholder) placeholder.style.display = "none";
        };
        reader.readAsDataURL(file);
    }
}

function selectCategory(buttonElement, categoryName) {
    const container = document.getElementById('categoryContainer');
    if (container) {
        container.querySelectorAll('.cat-pill-btn').forEach(btn => {
            btn.classList.remove('active');
        });
    }
    buttonElement.classList.add('active');
    const inputCat = document.getElementById('inputFoodCategory');
    if (inputCat) inputCat.value = categoryName;
}

function selectEditCategory(buttonElement, categoryName) {
    const container = document.getElementById('editCategoryContainer');
    if (container) {
        container.querySelectorAll('.cat-pill-btn').forEach(btn => {
            btn.classList.remove('active');
        });
    }
    buttonElement.classList.add('active');
    const inputEditCat = document.getElementById('editFoodCategory');
    if (inputEditCat) inputEditCat.value = categoryName;
}

function openAddMenuModal() {
    let isProfileIncomplete = !shopData.name || 
                              shopData.name.includes('Gerai Makanan') || 
                              shopData.name.includes('Peniaga (Stall') || 
                              !shopData.phone || 
                              shopData.phone.includes('+6012') ||
                              !shopData.ownerName ||
                              shopData.ownerName === 'Pemilik Kedai';

    if (isProfileIncomplete) {
        showNotification("⚠️ Profil Belum Lengkap", "Sila lengkapkan maklumat profil kedai anda (Nama Kedai, Nama Pemilik, dan No. Telefon) di bahagian Akaun sebelum menambah menu!");
        return;
    }

    document.getElementById('inputFoodName').value = '';
    document.getElementById('inputFoodPrice').value = '';
    
    const inputCat = document.getElementById('inputFoodCategory');
    if (inputCat) inputCat.value = '';
    const container = document.getElementById('categoryContainer');
    if (container) {
        container.querySelectorAll('.cat-pill-btn').forEach(btn => btn.classList.remove('active'));
    }

    const descField = document.getElementById('inputFoodDesc');
    if (descField) descField.value = '';
    const prev = document.getElementById('foodImgPreview');
    if(prev) prev.style.display = 'none';
    const placeholder = document.getElementById('foodImgPlaceholder');
    if(placeholder) placeholder.style.display = 'block';
    foodImageBase64 = "";
    document.getElementById('modalAddMenu').style.display = "flex";
}

function toggleMenuStatus(checkbox, itemId) {
    let isChecked = checkbox.checked;
    let menuList = JSON.parse(localStorage.getItem('prebites_menu')) || [];

    menuList = menuList.map(item => {
        if (item.id === itemId) {
            item.isActive = isChecked;
        }
        return item;
    });

    localStorage.setItem('prebites_menu', JSON.stringify(menuList));
}

function loadVendorMenus() {
    const menuListContainer = document.getElementById('senarai-menu');
    if (!menuListContainer || !activeUser) return;

    let menuList = JSON.parse(localStorage.getItem('prebites_menu')) || [];
    
    // KUNCI UTAMA: Tapis menu yang diikat dengan store_id kedai ini
    const vendorMenus = menuList.filter(item => item.store_id === activeUser.store_id || item.shopId === activeUser.store_id || item.shopId === activeUser.username);

    menuListContainer.innerHTML = '';

    if (vendorMenus.length === 0) {
        menuListContainer.innerHTML = `<p style="text-align: center; color: #8e8e93; padding: 20px;">Tiada menu lagi. Sila tambah menu baharu.</p>`;
        return;
    }

    vendorMenus.forEach(newItem => {
        let isCheckedAttr = newItem.isActive !== false ? 'checked' : '';

        let html = `
            <div class="menu-item" data-id="${newItem.id}">
                <div class="menu-item-left">
                    <img src="${newItem.image}" alt="${newItem.name}">
                    <div class="menu-details">
                        <h4 class="m-name">${newItem.name}</h4>
                        <p class="menu-category-tag m-cat">Kategori: ${newItem.category}</p>
                        <p class="m-price">RM ${parseFloat(newItem.price || 0).toFixed(2)}</p>
                        ${newItem.description ? `<p style="font-size:11.5px; color:#8e8e93; margin-top:2px;">${newItem.description}</p>` : ''}
                    </div>
                </div>
                <div class="menu-item-right">
                    <div class="menu-actions">
                        <button onclick="openEditMenuModal(this)" class="btn-edit-menu">Edit</button>
                        <button onclick="deleteMenuItem(this)" class="btn-delete-menu">Padam</button>
                    </div>
                    <label class="toggle-btn">
                        <input type="checkbox" ${isCheckedAttr} onchange="toggleMenuStatus(this, '${newItem.id}')">
                        <span class="slider"></span>
                    </label>
                </div>
            </div>
        `;
        menuListContainer.insertAdjacentHTML('beforeend', html);
    });
}

function saveMenu() {
    let nama = document.getElementById('inputFoodName').value.trim();
    let harga = document.getElementById('inputFoodPrice').value.trim();
    let kategori = document.getElementById('inputFoodCategory').value;
    let deskripsi = document.getElementById('inputFoodDesc') ? document.getElementById('inputFoodDesc').value.trim() : '';
    let imageFile = document.getElementById('inputFoodFile').files[0];

    if (!nama || !harga || !kategori || !foodImageBase64) {
        showNotification("Ralat", "Sila lengkapkan semua maklumat wajib, kategori dan gambar menu!");
        return;
    }

    let parsedPrice = parseFloat(harga);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
        showNotification("Ralat Harga", "Sila masukkan harga makanan yang sah (mesti lebih daripada RM 0.00)!");
        return;
    }

    // KUNCI UTAMA: Setiap menu baharu diikat terus dengan store_id kedai aktif!
    let newItem = {
        name: nama,
        price: parsedPrice,
        store_id: activeUser.store_id,
        category: kategori,
        description: deskripsi || 'Menu baru dari peniaga.',
        image: foodImageBase64,
        imageFile: imageFile, // Untuk Firebase upload
        badge: 'Baru ✨',
        isBento: false,
        isActive: true
    };

    // 1. Cuba simpan ke Firebase jika tersedia
    if (window.firebaseMenuFunctions && window.firebaseMenuFunctions.addMenuToFirebase) {
        try {
            window.firebaseMenuFunctions.addMenuToFirebase(newItem).then(result => {
                if (result.success) {
                    loadVendorMenus();
                    closeModal('modalAddMenu');
                    showNotification("Berjaya", `Menu "${nama}" berjaya ditambah dan disimpan ke database!`);
                } else {
                    throw new Error(result.error || 'Ralat Firebase');
                }
            });
        } catch (error) {
            console.warn('Firebase tidak tersedia, simpan ke localStorage sahaja:', error);
            // Fallback ke localStorage
            let menuList = JSON.parse(localStorage.getItem('prebites_menu')) || [];
            newItem.id = 'item_' + Date.now();
            menuList.push(newItem);
            localStorage.setItem('prebites_menu', JSON.stringify(menuList));
            
            loadVendorMenus();
            closeModal('modalAddMenu');
            showNotification("Berjaya", `Menu "${nama}" berjaya ditambah!`);
        }
    } else {
        // 2. Jika Firebase tidak ada, gunakan localStorage
        let menuList = JSON.parse(localStorage.getItem('prebites_menu')) || [];
        newItem.id = 'item_' + Date.now();
        menuList.push(newItem);
        localStorage.setItem('prebites_menu', JSON.stringify(menuList));

        loadVendorMenus();
        closeModal('modalAddMenu');
        showNotification("Berjaya", `Menu "${nama}" berjaya ditambah!`);
    }
}

function deleteMenuItem(btn) {
    showConfirm("Padam Menu", "Pasti mahu memadam menu ini?", function() {
        const menuItemElement = btn.closest('.menu-item');
        const itemId = menuItemElement.getAttribute('data-id');

        // 1. Cuba padam dari Firebase jika tersedia
        if (window.firebaseMenuFunctions && window.firebaseMenuFunctions.deleteMenuFromFirebase) {
            try {
                window.firebaseMenuFunctions.deleteMenuFromFirebase(itemId).then(result => {
                    if (result.success) {
                        menuItemElement.remove();
                        showNotification("Berjaya", "Menu berjaya dipadam dari sistem dan database!");
                    } else {
                        throw new Error(result.error || 'Ralat Firebase');
                    }
                });
            } catch (error) {
                console.warn('Firebase tidak tersedia, padam dari localStorage sahaja:', error);
                // Fallback ke localStorage
                let menuList = JSON.parse(localStorage.getItem('prebites_menu')) || [];
                menuList = menuList.filter(item => item.id !== itemId);
                localStorage.setItem('prebites_menu', JSON.stringify(menuList));

                menuItemElement.remove();
                showNotification("Berjaya", "Menu berjaya dipadam dari sistem!");
            }
        } else {
            // 2. Jika Firebase tidak ada, gunakan localStorage
            let menuList = JSON.parse(localStorage.getItem('prebites_menu')) || [];
            menuList = menuList.filter(item => item.id !== itemId);
            localStorage.setItem('prebites_menu', JSON.stringify(menuList));

            menuItemElement.remove();
            showNotification("Berjaya", "Menu berjaya dipadam dari sistem!");
        }
    });
}

// ✅ PASTE/KEEP JUST THIS ONE LINE
let currentEditItem = null;
let editImageBase64 = "";

function openEditMenuModal(btn) {
    currentEditItem = btn.closest('.menu-item');
    document.getElementById('editFoodName').value = currentEditItem.querySelector('.m-name').innerText;
    document.getElementById('editFoodPrice').value = currentEditItem.querySelector('.m-price').innerText.replace('RM ', '');
    
    let currentCategory = currentEditItem.querySelector('.m-cat').innerText.replace('Kategori: ', '').trim();
    document.getElementById('editFoodCategory').value = currentCategory;

    const editContainer = document.getElementById('editCategoryContainer');
    if (editContainer) {
        editContainer.querySelectorAll('.cat-pill-btn').forEach(btn => {
            if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(currentCategory)) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    editImageBase64 = currentEditItem.querySelector('img').src;
    document.getElementById('editFoodImgPreview').src = editImageBase64;
    document.getElementById('modalEditMenu').style.display = "flex";
}

function previewEditFoodImage(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function() {
            editImageBase64 = reader.result;
            document.getElementById('editFoodImgPreview').src = editImageBase64;
        };
        reader.readAsDataURL(file);
    }
}

function saveEditedMenu() {
    let nama = document.getElementById('editFoodName').value.trim();
    let harga = document.getElementById('editFoodPrice').value.trim();
    let kategori = document.getElementById('editFoodCategory').value;
    let itemId = currentEditItem.getAttribute('data-id');
    let imageFile = document.getElementById('editFoodFile').files[0];

    if (!nama || !harga || !kategori) {
        showNotification("Ralat", "Sila lengkapkan nama, harga dan kategori menu!");
        return;
    }

    let parsedPrice = parseFloat(harga);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
        showNotification("Ralat Harga", "Sila masukkan harga makanan yang sah!");
        return;
    }

    const updatedData = {
        name: nama,
        price: parsedPrice,
        category: kategori,
        image: editImageBase64,
        imageFile: imageFile
    };

    // 1. Cuba kemaskini di Firebase jika tersedia
    if (window.firebaseMenuFunctions && window.firebaseMenuFunctions.updateMenuInFirebase) {
        try {
            window.firebaseMenuFunctions.updateMenuInFirebase(itemId, updatedData).then(result => {
                if (result.success) {
                    currentEditItem.querySelector('.m-name').innerText = nama;
                    currentEditItem.querySelector('.m-price').innerText = `RM ${parsedPrice.toFixed(2)}`;
                    currentEditItem.querySelector('.m-cat').innerText = `Kategori: ${kategori}`;
                    currentEditItem.querySelector('img').src = editImageBase64;

                    closeModal('modalEditMenu');
                    showNotification("Berjaya", "Menu dikemaskini dan disimpan ke database!");
                } else {
                    throw new Error(result.error || 'Ralat Firebase');
                }
            });
        } catch (error) {
            console.warn('Firebase tidak tersedia, kemaskini localStorage sahaja:', error);
            // Fallback ke localStorage
            currentEditItem.querySelector('.m-name').innerText = nama;
            currentEditItem.querySelector('.m-price').innerText = `RM ${parsedPrice.toFixed(2)}`;
            currentEditItem.querySelector('.m-cat').innerText = `Kategori: ${kategori}`;
            currentEditItem.querySelector('img').src = editImageBase64;

            let menuList = JSON.parse(localStorage.getItem('prebites_menu')) || [];
            menuList = menuList.map(item => {
                if (item.id === itemId) {
                    item.name = nama;
                    item.price = parsedPrice;
                    item.category = kategori;
                    item.image = editImageBase64;
                }
                return item;
            });
            localStorage.setItem('prebites_menu', JSON.stringify(menuList));

            closeModal('modalEditMenu');
            showNotification("Berjaya", "Menu dikemaskini!");
        }
    } else {
        // 2. Jika Firebase tidak ada, gunakan localStorage
        currentEditItem.querySelector('.m-name').innerText = nama;
        currentEditItem.querySelector('.m-price').innerText = `RM ${parsedPrice.toFixed(2)}`;
        currentEditItem.querySelector('.m-cat').innerText = `Kategori: ${kategori}`;
        currentEditItem.querySelector('img').src = editImageBase64;

        let menuList = JSON.parse(localStorage.getItem('prebites_menu')) || [];
        menuList = menuList.map(item => {
            if (item.id === itemId) {
                item.name = nama;
                item.price = parsedPrice;
                item.category = kategori;
                item.image = editImageBase64;
            }
            return item;
        });
        localStorage.setItem('prebites_menu', JSON.stringify(menuList));

        closeModal('modalEditMenu');
        showNotification("Berjaya", "Menu dikemaskini!");
    }
}

/* ========================================================
   9.5 FIREBASE SYNCHRONIZATION & AUTO-UPDATE FUNCTIONS
======================================================== */

/**
 * Fungsi: Sinkronisasi Menu dari Firebase ke Paparan
 * Memastikan menu yang ditunjukkan sentiasa terkini dari database
 */
async function syncMenusFromFirebase() {
    if (window.firebaseMenuFunctions && window.firebaseMenuFunctions.syncMenusWithDisplay) {
        try {
            await window.firebaseMenuFunctions.syncMenusWithDisplay();
            console.log('✅ Menu berjaya disinkronisasi dari Firebase');
            return true;
        } catch (error) {
            console.warn('⚠️ Ralat sinkronisasi Firebase:', error);
            return false;
        }
    }
    return false;
}

/**
 * Fungsi: Muatkan Menu dari Firebase (Startup)
 * Dipanggil ketika laman dimuatkan pertama kali
 */
async function loadMenusFromFirebaseStartup() {
    if (window.firebaseMenuFunctions && window.firebaseMenuFunctions.loadMenusFromFirebase && activeUser) {
        try {
            const menus = await window.firebaseMenuFunctions.loadMenusFromFirebase();
            console.log(`✅ ${menus.length} menu dimuatkan dari Firebase`);
            loadVendorMenus(); // Tampilkan menu yang telah dimuatkan
            return menus;
        } catch (error) {
            console.warn('⚠️ Gagal memuatkan menu dari Firebase, gunakan localStorage:', error);
            loadVendorMenus(); // Fallback ke localStorage
            return [];
        }
    } else {
        // Firebase tidak tersedia, gunakan localStorage
        loadVendorMenus();
        return [];
    }
}

/**
 * Fungsi: Auto-Sync Berkala (Setiap 30 saat)
 * Memastikan menu sentiasa terkini dari database
 */
function startAutoSyncMenus(intervalSeconds = 30) {
    if (window.autoSyncInterval) {
        clearInterval(window.autoSyncInterval);
    }
    
    window.autoSyncInterval = setInterval(() => {
        if (activeUser && !document.hidden) { // Hanya sync jika halaman aktif
            syncMenusFromFirebase();
        }
    }, intervalSeconds * 1000);
    
    console.log(`⏱️ Auto-sync menu dimulakan (Selang: ${intervalSeconds} saat)`);
}

/**
 * Fungsi: Kemaskini Status Kedai ke Firebase
 * Sinkronisasi status Buka/Tutup ke database
 */
async function syncShopStatusToFirebase(isOpen) {
    if (window.firebaseMenuFunctions && window.firebaseMenuFunctions.updateShopStatusInFirebase) {
        try {
            const result = await window.firebaseMenuFunctions.updateShopStatusInFirebase(isOpen);
            if (result.success) {
                console.log(`✅ Status kedai dikemaskini: ${isOpen ? 'BUKA' : 'TUTUP'}`);
                return true;
            }
        } catch (error) {
            console.warn('⚠️ Ralat mengemas kini status kedai:', error);
        }
    }
    return false;
}

/**
 * Fungsi: Kemaskini Profil Kedai ke Firebase
 * Sinkronisasi maklumat kedai ke database
 */
async function syncShopProfileToFirebase(profileData) {
    if (window.firebaseMenuFunctions && window.firebaseMenuFunctions.updateShopProfileInFirebase) {
        try {
            const result = await window.firebaseMenuFunctions.updateShopProfileInFirebase(profileData);
            if (result.success) {
                console.log('✅ Profil kedai dikemaskini di Firebase');
                return true;
            }
        } catch (error) {
            console.warn('⚠️ Ralat mengemas kini profil kedai:', error);
        }
    }
    return false;
}

/* ========================================================
   10. TETAPAN TAMBAHAN & LOG KELUAR (LOGOUT)
======================================================== */
function openSettingsModal() { 
    const modalEl = document.getElementById('modalSettings');
    if (modalEl) modalEl.style.display = "flex"; 
}

function openAboutModal() { 
    const modalEl = document.getElementById('modalAbout');
    if (modalEl) modalEl.style.display = "flex"; 
}

function handleLogoutClick() {
    toggleRightPanel();
    showConfirm("Log Keluar", "Pasti mahu keluar dari sistem?", function() {
        const finishLogout = () => {
            showNotification("Berjaya", "Log keluar berjaya.");
            setTimeout(() => {
                window.location.href = "login_seller.html";
            }, 1000);
        };

        if (window.prebitesLogout) {
            window.prebitesLogout().then(finishLogout).catch(finishLogout);
            return;
        }

        localStorage.removeItem('prebites_active_user');
        localStorage.removeItem('active_vendor_id');
        finishLogout();
    });
}

/* ========================================================
   COMPLETE KEDAI.JS FUNCTIONS
======================================================== */

// Complete renderAccountReadOnly
function renderAccountReadOnly() {
    document.getElementById('accountModalTitle').innerText = "Maklumat & Akaun Kedai";
    
    let bodyHtml = `
        <div class="account-overview" style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); padding: 16px; border-radius: 18px; margin-bottom: 20px;">
            <div class="account-overview-icon" style="background: linear-gradient(135deg, rgba(230,126,34,0.2), rgba(255,159,10,0.1)); color: #f39c12; border: 1px solid rgba(230,126,34,0.3);">🏪</div>
            <div class="account-overview-text">
                <small style="color: #f39c12; font-weight: 700;">AKAUN AKTIF: ${activeUser ? activeUser.username.toUpperCase() : ''}</small>
                <h3 style="font-size: 17px; margin-top: 2px;">${shopData.name}</h3>
                <p style="color: #a1a1aa; font-size: 12px; margin-top: 4px; line-height: 1.4;">${shopData.about}</p>
            </div>
        </div>

        <div class="modern-profile-card">
            <div class="modern-profile-card-title">🏷️ Maklumat Asas & Pemilik</div>
            <div class="modern-profile-row"><span>Nama Kedai:</span> <span id="view-shopname" style="color: #f39c12;">${shopData.name}</span></div>
            <div class="modern-profile-row"><span>Nama Pemilik:</span> <span style="color: #fff; font-weight: 800;">${shopData.ownerName}</span></div>
            <div class="modern-profile-row"><span>Bio / About:</span> <span style="color: #d1d1d6; font-weight: 500; font-size: 12px; text-align: right; max-width: 220px;">${shopData.about}</span></div>
            <div class="modern-profile-row"><span>No. Telefon:</span> <span>${shopData.phone}</span></div>
            <div class="modern-profile-row"><span>Media Sosial:</span> <span style="color: #0a84ff;">${shopData.social}</span></div>
        </div>
    `;

    document.getElementById('accountModalBody').innerHTML = bodyHtml;
    document.getElementById('accountModalFooter').innerHTML = `
        <button class="btn-modal btn-cancel" onclick="closeModal('modalAccount')">Tutup</button>
        <button class="btn-modal btn-save" onclick="renderAccountEditForm()">✏️ Kemaskini Profil Kedai</button>
    `;
}

// Render Edit Form for Vendor Profile
function renderAccountEditForm() {
    document.getElementById('accountModalTitle').innerText = "Edit Profil Kedai";

    let editHtml = `
        <div class="form-group">
            <label>Nama Kedai</label>
            <input type="text" id="edit-shop-name" class="modal-input" value="${shopData.name || ''}">
        </div>
        <div class="form-group">
            <label>Nama Pemilik</label>
            <input type="text" id="edit-owner-name" class="modal-input" value="${shopData.ownerName || ''}">
        </div>
        <div class="form-group">
            <label>No. Telefon</label>
            <input type="tel" id="edit-shop-phone" class="modal-input" placeholder="Contoh: 012-345 6789" value="${shopData.phone || ''}">
        </div>
        <div class="form-group">
            <label>Media Sosial</label>
            <input type="text" id="edit-shop-social" class="modal-input" placeholder="Contoh: @kamskini atau pautan media sosial" value="${shopData.social || ''}">
        </div>
        <div class="form-group">
            <label>Penerangan / About</label>
            <textarea id="edit-shop-about" class="modal-input">${shopData.about || ''}</textarea>
        </div>
    `;

    document.getElementById('accountModalBody').innerHTML = editHtml;
    document.getElementById('accountModalFooter').innerHTML = `
        <button class="btn-modal btn-cancel" onclick="renderAccountReadOnly()">Batal</button>
        <button class="btn-modal btn-save" onclick="saveAccountEdit()">Simpan Perubahan</button>
    `;
}

// Save Profile Updates to LocalStorage & Firebase
async function saveAccountEdit() {
    const name = document.getElementById('edit-shop-name').value.trim();
    const ownerName = document.getElementById('edit-owner-name').value.trim();
    const phone = document.getElementById('edit-shop-phone').value.trim();
    const social = document.getElementById('edit-shop-social').value.trim();
    const about = document.getElementById('edit-shop-about').value.trim();

    if (!name || !ownerName || !phone) {
        showNotification('Ralat', 'Sila isi nama kedai, nama pemilik dan nombor telefon.');
        return;
    }

    shopData.name = name;
    shopData.ownerName = ownerName;
    shopData.phone = phone;
    shopData.social = social;
    shopData.about = about;

    // Save to LocalStorage using both key conventions
    localStorage.setItem('shop_profile_' + activeUser.username, JSON.stringify(shopData));
    localStorage.setItem('shop_profile_' + activeUser.store_id, JSON.stringify(shopData));

    // Update UI headers
    const shopNameDisplay = document.getElementById('shop-name-display');
    if (shopNameDisplay) shopNameDisplay.innerText = shopData.name;

    // Sync to Firebase if function exists
    if (window.firebaseMenuFunctions && window.firebaseMenuFunctions.updateShopProfileInFirebase) {
        await window.firebaseMenuFunctions.updateShopProfileInFirebase({
            name: shopData.name,
            ownerName: shopData.ownerName,
            phone: shopData.phone,
            social: shopData.social,
            description: shopData.about
        });
    }

    showNotification("Berjaya", "Maklumat profil kedai telah dikemaskini!");
    renderAccountReadOnly();
}

/* ========================================================
   MENU ADD & EDIT IMPLEMENTATION
======================================================== */
let selectedCategory = '';
let currentEditingMenuId = null;

function selectCategory(btn, category) {
    document.querySelectorAll('#categoryContainer .cat-pill-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('inputFoodCategory').value = category;
    selectedCategory = category;
}

function openAddMenuModal() {
    document.getElementById('inputFoodName').value = '';
    document.getElementById('inputFoodPrice').value = '';
    document.getElementById('inputFoodDesc').value = '';
    document.getElementById('inputFoodCategory').value = '';
    document.getElementById('modalAddMenu').style.display = 'flex';
}

async function saveMenu() {
    const saveButton = document.querySelector('#modalAddMenu .btn-save');
    const nameField = document.getElementById('inputFoodName');
    const priceField = document.getElementById('inputFoodPrice');
    const categoryField = document.getElementById('inputFoodCategory');
    const descriptionField = document.getElementById('inputFoodDesc');
    const fileInput = document.getElementById('inputFoodFile');

    if (!nameField || !priceField || !categoryField || !descriptionField || !fileInput || !activeUser?.store_id) {
        showNotification('Ralat', 'Borang menu atau sesi peniaga tidak tersedia. Sila log masuk semula.');
        return;
    }

    const name = nameField.value.trim();
    const price = parseFloat(priceField.value);
    const category = categoryField.value;
    const description = descriptionField.value.trim();

    if (!name || isNaN(price) || price <= 0 || !category) {
        alert('Sila isi nama, harga dan kategori makanan yang sah!');
        return;
    }

    const menuData = {
        name,
        price,
        category,
        description,
        store_id: activeUser.store_id,
        imageFile: fileInput.files[0] || null,
        image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=300&auto=format&fit=crop'
    };

    if (!window.firebaseMenuFunctions?.addMenuToFirebase) {
        showNotification('Ralat', 'Sambungan database belum tersedia. Sila cuba lagi.');
        return;
    }

    if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = 'Menyimpan...';
    }

    try {
        const result = await window.firebaseMenuFunctions.addMenuToFirebase(menuData);
        if (!result.success) {
            showNotification('Ralat', result.error || 'Menu gagal disimpan.');
            return;
        }

        closeModal('modalAddMenu');
        showNotification('Berjaya', 'Menu baru berjaya ditambah!');
        loadVendorMenus();
    } catch (error) {
        console.error('Ralat simpan menu:', error);
        showNotification('Ralat', error.message || 'Menu gagal disimpan.');
    } finally {
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent = 'Simpan Menu';
        }
    }
}

// Function to Render Menus in Urus Menu Page
function loadVendorMenus() {
    const menuContainer = document.getElementById('senarai-menu');
    if (!menuContainer) return;

    let menuList = JSON.parse(localStorage.getItem('prebites_menu')) || [];
    let vendorMenus = menuList.filter(item => item.store_id === activeUser.store_id || item.username === activeUser.username);

    if (vendorMenus.length === 0) {
        menuContainer.innerHTML = `<p style="text-align:center; color:#8e8e93; grid-column:1/-1;">Tiada menu. Klik "+ Tambah Menu Baru" di bawah.</p>`;
        return;
    }

    let html = '';
    vendorMenus.forEach(item => {
        html += `
            <div class="menu-card" style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); padding:12px; border-radius:12px; margin-bottom:10px;">
                <div style="display:flex; gap:12px; align-items:center;">
                    <img src="${item.image || 'https://via.placeholder.com/60'}" style="width:60px; height:60px; border-radius:8px; object-fit:cover;">
                    <div>
                        <h4 style="color:#fff; margin:0;">${item.name}</h4>
                        <span style="color:#ff9f43; font-size:13px;">RM ${parseFloat(item.price).toFixed(2)}</span>
                        <p style="color:#8e8e93; font-size:11px; margin:2px 0 0 0;">${item.category || 'Umum'}</p>
                    </div>
                </div>
                <div style="display:flex; gap:6px;">
                    <button class="badge" style="background:rgba(10,132,255,0.2); color:#0a84ff;" onclick="openEditMenuModal('${item.id}')">✏️ Edit</button>
                    <button class="badge" style="background:rgba(255,69,58,0.2); color:#ff453a;" onclick="deleteMenu('${item.id}')">🗑️ Padam</button>
                </div>
            </div>
        `;
    });
    menuContainer.innerHTML = html;
}

function openEditMenuModal(id) {
    currentEditingMenuId = id;
    let menuList = JSON.parse(localStorage.getItem('prebites_menu')) || [];
    let item = menuList.find(m => m.id === id);

    if (!item) return;

    document.getElementById('editFoodName').value = item.name;
    document.getElementById('editFoodPrice').value = item.price;
    document.getElementById('editFoodCategory').value = item.category || '';
    
    document.getElementById('modalEditMenu').style.display = 'flex';
}

async function saveEditedMenu() {
    if (!currentEditingMenuId) return;

    const name = document.getElementById('editFoodName').value;
    const price = parseFloat(document.getElementById('editFoodPrice').value);
    const category = document.getElementById('editFoodCategory').value;
    const fileInput = document.getElementById('editFoodFile');

    const updatedData = {
        name,
        price,
        category,
        imageFile: fileInput.files[0] || null
    };

    if (window.firebaseMenuFunctions) {
        await window.firebaseMenuFunctions.updateMenuInFirebase(currentEditingMenuId, updatedData);
    }

    closeModal('modalEditMenu');
    showNotification('Berjaya', 'Menu berjaya dikemaskini!');
    loadVendorMenus();
}

async function deleteMenu(id) {
    showConfirm('Padam Menu', 'Adakah anda pasti ingin memadam menu ini?', async function() {
        if (window.firebaseMenuFunctions) {
            await window.firebaseMenuFunctions.deleteMenuFromFirebase(id);
        }
        showNotification('Berjaya', 'Menu dipadam.');
        loadVendorMenus();
    });
}

function loadMenusFromFirebaseStartup() {
    if (window.firebaseMenuFunctions) {
        window.firebaseMenuFunctions.loadMenusFromFirebase().then(() => {
            loadVendorMenus();
        });
    }
}

function startAutoSyncMenus(seconds) {
    setInterval(() => {
        if (window.firebaseMenuFunctions) {
            window.firebaseMenuFunctions.loadMenusFromFirebase().then(() => {
                loadVendorMenus();
            });
        }
    }, seconds * 1000);
}