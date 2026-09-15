// ==========================================
// 1. STRUKTUR DATA TROLI & SINGLE-VENDOR STATE
// ==========================================
let cart = {};
let activeShopId = null;

// ==========================================
// Fungsi Pembantu: Menukar store_id kepada format username peniaga (cth: "stall_1" -> "stall1_psp")
// ==========================================
function getUsernameFromStoreId(storeId) {
    if (!storeId) return '';
    // Jika format store_id ialah "stall_X", tukar jadi "stallX_psp"
    if (storeId.startsWith('stall_')) {
        let num = storeId.replace('stall_', '');
        return `stall${num}_psp`;
    }
    return storeId;
}

// ==========================================
// 2. FUNGSI MEMUAT TURUN KEDAI DAN MENU DINAMIK DARI LOCALSTORAGE
// ==========================================
function loadHomepageData() {
    loadShops();
    loadHomepageMenu();
}

function loadShops() {
    const shopsGrid = document.querySelector('.shops-grid');
    if (!shopsGrid) return;

    let menuList = JSON.parse(localStorage.getItem('prebites_menu')) || [];
    let uniqueShopsMap = {};

    menuList.forEach(item => {
        if (item.store_id) {
            let usernameKey = getUsernameFromStoreId(item.store_id);
            
            // Semak status kedai guna kedua-dua kemungkinan kunci (username atau store_id)
            let shopStatus = localStorage.getItem('shop_status_' + usernameKey) || localStorage.getItem('shop_status_' + item.store_id);
            
            // Semak profil kedai guna kedua-dua kemungkinan kunci
            let savedProfile = JSON.parse(localStorage.getItem('shop_profile_' + usernameKey)) || JSON.parse(localStorage.getItem('shop_profile_' + item.store_id));

            if (shopStatus !== 'tutup' && !uniqueShopsMap[item.store_id]) {
                let shopName = savedProfile && savedProfile.name ? savedProfile.name : (item.shopName || item.store_id.replace(/-/g, ' ').toUpperCase());
                let shopBanner = savedProfile && savedProfile.shopImage ? savedProfile.shopImage : (item.image || "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?q=80&w=600&auto=format&fit=crop");
                let shopOffsetX = savedProfile ? (savedProfile.shopOffsetX || 0) : 0;
                let shopOffsetY = savedProfile ? (savedProfile.shopOffsetY || 0) : 0;
                let shopScale = savedProfile ? (savedProfile.shopScale || 1) : 1;
                let openTime = savedProfile && savedProfile.openTime ? savedProfile.openTime : "8:00 AM";
                let closeTime = savedProfile && savedProfile.closeTime ? savedProfile.closeTime : "5:00 PM";
                
                let rawStall = savedProfile && savedProfile.stallNo ? savedProfile.stallNo : (item.store_id.includes('stall_') ? `Stall ${item.store_id.replace('stall_', '')}` : "Stall Utama");
                let stallNo = rawStall.toLowerCase().includes('stall') ? rawStall : `Stall ${rawStall}`;

                uniqueShopsMap[item.store_id] = {
                    id: item.store_id,
                    name: shopName,
                    banner: shopBanner,
                    offsetX: shopOffsetX,
                    offsetY: shopOffsetY,
                    scale: shopScale,
                    time: `${openTime} - ${closeTime}`,
                    stall: stallNo
                };
            }
        }
    });

    let shopsArray = Object.values(uniqueShopsMap);
    shopsArray = shopsArray.slice(0, 8);

    if (shopsArray.length === 0) {
        shopsGrid.innerHTML = `<p class="empty-cart-text" style="grid-column: 1/-1;">Tiada premis kedai yang dibuka buat masa sekarang.</p>`;
        return;
    }

    let shopsHtml = '';
    shopsArray.forEach(shop => {
        shopsHtml += `
            <div class="shop-card" onclick="openShopModal('${shop.id}')" data-shop-id="${shop.id}">
                <div class="shop-img" style="position: relative; overflow: hidden; height: 130px; background: #111; display: flex; align-items: center; justify-content: center;">
                    <img src="${shop.banner}" alt="${shop.name}" style="position: absolute; left: 50%; top: 50%; max-width: 100%; max-height: 100%; object-fit: contain; transform: translate(calc(-50% + ${shop.offsetX}px), calc(-50% + ${shop.offsetY}px)) scale(${shop.scale});">
                    <span class="shop-status status-open"><span style="width:6px;height:6px;background:#fff;border-radius:50%;display:inline-block;animation:pulse 1.5s infinite;"></span> BUKA</span>
                </div>
                <div class="shop-info">
                    <h4 style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${shop.name}</h4>
                    <p style="font-size: 11px; opacity: 0.8; margin-top: 2px;">${shop.stall} • ${shop.time}</p>
                </div>
            </div>
        `;
    });

    shopsGrid.innerHTML = shopsHtml;
}

function loadHomepageMenu() {
    const menuGrid = document.querySelector('.menu-grid');
    if (!menuGrid) return;

    let menuList = JSON.parse(localStorage.getItem('prebites_menu')) || [];
    
    let activeMenuList = menuList.filter(item => {
        let usernameKey = getUsernameFromStoreId(item.store_id);
        let shopStatus = localStorage.getItem('shop_status_' + usernameKey) || localStorage.getItem('shop_status_' + item.store_id);
        return item.isActive !== false && shopStatus !== 'tutup';
    });

    let htmlContent = '';

    if (activeMenuList.length === 0) {
        menuGrid.innerHTML = `<p class="empty-cart-text" style="grid-column: 1/-1;">Tiada menu makanan dari peniaga tersedia buat masa sekarang.</p>`;
        return;
    }

    activeMenuList.forEach((item, index) => {
        let bentoClass = (index === 0 && activeMenuList.length > 2) ? 'menu-card bento-highlight' : 'menu-card';
        let badgeHtml = item.badge ? `<div class="menu-badge">${item.badge}</div>` : '';

        htmlContent += `
            <div class="${bentoClass}" data-item-id="${item.id}" data-category="${item.category || 'semua'}">
                ${badgeHtml}
                <div class="menu-image-placeholder">
                    <img src="${item.image}" alt="${item.name}">
                </div>
                <div class="menu-info">
                    <h4>${item.name}</h4>
                    <p class="description">${item.description || 'Menu istimewa pilihan peniaga.'}</p>
                    <div class="menu-footer">
                        <span class="price" data-price="${item.price}">RM ${item.price.toFixed(2)}</span>
                        <button class="btn-add" onclick="addItemWithShopCheck('${item.id}', '${item.name}', ${item.price}, '${item.store_id}')">+</button>
                    </div>
                </div>
            </div>
        `;
    });

    menuGrid.innerHTML = htmlContent;
    initCategoryFilter(); 
}

window.addEventListener('DOMContentLoaded', () => {
    loadHomepageData();
    initSidebarPanels();
});

// ==========================================
// 2A. Frame Menu Sidebar
// ==========================================
function getActiveCustomer() {
    try {
        return JSON.parse(localStorage.getItem('prebites_active_user')) || {};
    } catch (error) {
        return {};
    }
}

function getCustomerOrders(user) {
    const storedOrders = JSON.parse(localStorage.getItem('prebites_orders') || '[]');
    const personalOrders = user.id ? JSON.parse(localStorage.getItem('user_orders_' + user.id) || '[]') : [];
    const firebaseOrders = user.uid
        ? storedOrders.filter(order => order.customerId === user.uid || order.customerEmail === user.email)
        : [];

    return [...personalOrders, ...firebaseOrders].filter((order, index, orders) => {
        return orders.findIndex(item => item.id && order.id ? item.id === order.id : item === order) === index;
    });
}

function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[character]));
}

function renderSidebarPanel(panelName) {
    const user = getActiveCustomer();
    const panelBody = document.getElementById('accountPanelBody');
    const panelTitle = document.getElementById('accountPanelTitle');
    const panelKicker = document.getElementById('accountPanelKicker');
    if (!panelBody || !panelTitle || !panelKicker) return;

    const name = user.nama || user.name || 'Pelanggan PreBites';
    const email = user.email || 'Email belum tersedia';

    if (panelName === 'account') {
        panelKicker.textContent = 'PROFIL PELANGGAN';
        panelTitle.textContent = 'Akaun Saya';
        panelBody.innerHTML = `
            <div class="profile-summary">
                <div class="profile-avatar">${escapeHtml(name.charAt(0).toUpperCase())}</div>
                <div><h4>${escapeHtml(name)}</h4><p>${escapeHtml(email)}</p></div>
            </div>
            <div class="account-name-editor">
                <label for="accountNameInput">Nama paparan</label>
                <input class="account-name-input" id="accountNameInput" type="text" value="${escapeHtml(name)}" maxlength="60" autocomplete="name">
                <button class="panel-action" id="saveAccountName"><i class="fa-solid fa-pen"></i> Simpan Nama</button>
                <p class="panel-feedback" id="accountNameFeedback"></p>
            </div>
            <div class="panel-detail-list">
                <div><span>No. Matrik</span><strong>${escapeHtml(user.matrik || 'Belum diisi')}</strong></div>
                <div><span>Status</span><strong class="status-text">${user.status === 'active' ? 'Aktif' : 'Disahkan'}</strong></div>
            </div>
            <p class="panel-note">Maklumat akaun anda digunakan untuk mengenal pasti pesanan dan akses pelanggan.</p>`;

        document.getElementById('saveAccountName')?.addEventListener('click', async () => {
            const input = document.getElementById('accountNameInput');
            const feedback = document.getElementById('accountNameFeedback');
            const button = document.getElementById('saveAccountName');
            const updatedName = input?.value.trim() || '';
            if (!feedback || !button) return;

            if (updatedName.length < 3) {
                feedback.textContent = 'Nama mesti sekurang-kurangnya 3 aksara.';
                feedback.style.color = '#ff7066';
                input?.focus();
                return;
            }

            if (!window.prebitesUpdateCustomerName) {
                feedback.textContent = 'Fungsi akaun belum siap dimuatkan. Cuba lagi.';
                feedback.style.color = '#ff7066';
                return;
            }

            button.disabled = true;
            feedback.textContent = 'Menyimpan...';
            feedback.style.color = '';
            try {
                await window.prebitesUpdateCustomerName(updatedName);
                feedback.textContent = 'Nama berjaya dikemas kini.';
                renderSidebarPanel('account');
            } catch (error) {
                feedback.textContent = error.message || 'Nama gagal dikemas kini.';
                feedback.style.color = '#ff7066';
                button.disabled = false;
            }
        });
        return;
    }

    if (panelName === 'settings') {
        panelKicker.textContent = 'PREFERENSI';
        panelTitle.textContent = 'Tetapan';
        const notificationsEnabled = localStorage.getItem('prebites_notifications') !== 'off';
        panelBody.innerHTML = `
            <div class="settings-list">
                <label class="setting-row"><span><strong>Notifikasi pesanan</strong><small>Terima kemas kini apabila status pesanan berubah.</small></span><input type="checkbox" id="orderNotifications" ${notificationsEnabled ? 'checked' : ''}></label>
                <label class="setting-row"><span><strong>Simpan sesi log masuk</strong><small>Peranti ini kekal mengenali akaun anda.</small></span><input type="checkbox" id="saveSession" checked></label>
            </div>
            <button class="panel-action" id="saveSettings"><i class="fa-solid fa-check"></i> Simpan Tetapan</button>
            <p class="panel-feedback" id="settingsFeedback"></p>`;
        document.getElementById('saveSettings')?.addEventListener('click', () => {
            const enabled = document.getElementById('orderNotifications')?.checked;
            localStorage.setItem('prebites_notifications', enabled ? 'on' : 'off');
            const feedback = document.getElementById('settingsFeedback');
            if (feedback) feedback.textContent = 'Tetapan berjaya disimpan.';
        });
        return;
    }

    if (panelName === 'about') {
        panelKicker.textContent = 'TENTANG PLATFORM';
        panelTitle.textContent = 'Mengenai PreBites';
        panelBody.innerHTML = `
            <div class="about-mark"><i class="fa-solid fa-bowl-food"></i></div>
            <h4>Pre-order makanan di YES PSP</h4>
            <p class="panel-note">PreBites membantu pelajar membuat pesanan lebih awal, melihat menu premis yang dibuka dan mengambil makanan tanpa perlu beratur panjang.</p>
            <div class="about-facts"><span><strong>Versi</strong> 1.0</span><span><strong>Platform</strong> YES PSP</span></div>`;
        return;
    }

    panelKicker.textContent = 'AKTIVITI AKAUN';
    panelTitle.textContent = 'Sejarah Pesanan';
    const orders = getCustomerOrders(user);
    if (orders.length === 0) {
        panelBody.innerHTML = '<div class="panel-empty"><i class="fa-solid fa-receipt"></i><h4>Belum ada pesanan</h4><p>Pesanan yang telah dibuat akan muncul di sini.</p></div>';
        return;
    }

    panelBody.innerHTML = `<div class="history-list">${orders.slice().reverse().map(order => {
        const items = order.items || order.item || [];
        const itemCount = Array.isArray(items) ? items.reduce((total, item) => total + Number(item.kuantiti || item.quantity || 1), 0) : 1;
        const total = Number(order.totalPrice || order.total || 0).toFixed(2);
        const status = order.orderStatus || order.status || 'Diproses';
        return `<div class="history-row"><div><strong>${itemCount} item</strong><small>${order.store_id || 'PreBites'} · ${status}</small></div><b>RM ${total}</b></div>`;
    }).join('')}</div>`;
}

function initSidebarPanels() {
    const overlay = document.getElementById('accountPanelOverlay');
    const drawer = document.getElementById('sidebarDrawer');
    const closeButton = document.getElementById('closeAccountPanel');
    if (!overlay) return;

    document.querySelectorAll('.sidebar-panel-link').forEach(link => {
        link.addEventListener('click', event => {
            event.preventDefault();
            renderSidebarPanel(link.dataset.panel);
            drawer?.classList.remove('active');
            document.getElementById('sidebarOverlay')?.classList.remove('active');
            overlay.classList.add('active');
            overlay.setAttribute('aria-hidden', 'false');
        });
    });

    const closePanel = () => {
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
    };
    closeButton?.addEventListener('click', closePanel);
    overlay.addEventListener('click', event => {
        if (event.target === overlay) closePanel();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && overlay.classList.contains('active')) closePanel();
    });
}

// ==========================================
// 3. Fungsi Filter Kategori Kapsul Dinamik
// ==========================================
function initCategoryFilter() {
    const categories = document.querySelectorAll('.category-item');
    const cards = document.querySelectorAll('.menu-card');

    categories.forEach(category => {
        category.addEventListener('click', () => {
            categories.forEach(c => c.classList.remove('active'));
            category.classList.add('active');

            const selectedCat = category.getAttribute('data-category');

            cards.forEach(card => {
                const cardCat = card.getAttribute('data-category') || '';

                if (selectedCat === 'semua' || cardCat.includes(selectedCat)) {
                    card.style.display = 'flex';
                    card.style.opacity = '0';

                    setTimeout(() => {
                        card.style.opacity = '1';
                        card.style.transition = 'opacity 0.4s ease';
                    }, 50);

                } else {
                    card.style.display = 'none';
                }
            });
        });
    });
}

// ==========================================
// 4. Logik Tambah Item dengan Validasi Single-Vendor
// ==========================================
window.addItemWithShopCheck = function(itemId, itemName, itemPrice, itemStoreId) {
    let currentCartKeys = Object.keys(cart);
    if (currentCartKeys.length > 0 && activeShopId !== itemStoreId) {
        alert("⚠️ Amaran Sistem (Single-Vendor Cart): Troli anda mengandungi item dari kedai lain. Sila kosongkan troli terlebih dahulu jika ingin menukar kedai.");
        return;
    }

    activeShopId = itemStoreId;
    changeQty(itemId, itemName, itemPrice, 1);
};

// ==========================================
// 5. Sistem Ubah Kuantiti (Fungsi Global)
// ==========================================
window.changeQty = function(id, name, price, delta) {
    if (cart[id]) {
        cart[id].qty += delta;
        if (cart[id].qty <= 0) {
            delete cart[id];
        }
    } else if (delta > 0) {
        cart[id] = {
            name: name,
            price: price,
            qty: 1
        };
    }
    
    if (Object.keys(cart).length === 0) {
        activeShopId = null;
    }

    updateCartUI();
};

// ==========================================
// 6. Kemaskini UI Troli & Dinamik Data ke Modal
// ==========================================
function updateCartUI() {
    const cartCountElement = document.getElementById('cart-count');
    const cartTotalElement = document.getElementById('cart-total');
    const cartItemsList = document.getElementById('cartItemsList');

    const modalItem = document.getElementById('modalItem');
    const modalHarga = document.getElementById('modalHarga');

    let totalItems = 0;
    let totalPrice = 0;
    let listHTML = '';

    for (let id in cart) {
        totalItems += cart[id].qty;
        totalPrice += cart[id].price * cart[id].qty;

        listHTML += `
        <div class="modal-item" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; background:rgba(255,255,255,0.03); padding:10px; border-radius:10px;">
            <div>
                <h5 style="color:white; font-size:14px;">${cart[id].name}</h5>
                <span style="color:#ff9f43; font-size:12px;">RM ${cart[id].price.toFixed(2)}</span>
                <div class="qty-controls" style="margin-top:6px; display:flex; gap:8px; align-items:center;">
                    <button class="btn-qty" style="padding:2px 8px; background:rgba(255,255,255,0.1); border:none; color:white; border-radius:4px; cursor:pointer;" onclick="changeQty('${id}','${cart[id].name}',${cart[id].price},-1)">-</button>
                    <span style="color:white;font-size:14px;">${cart[id].qty}</span>
                    <button class="btn-qty" style="padding:2px 8px; background:rgba(255,255,255,0.1); border:none; color:white; border-radius:4px; cursor:pointer;" onclick="changeQty('${id}','${cart[id].name}',${cart[id].price},1)">+</button>
                </div>
            </div>
            <strong style="color:white;">RM ${(cart[id].price * cart[id].qty).toFixed(2)}</strong>
        </div>
        `;
    }

    if (cartCountElement) cartCountElement.innerText = `🛒 ${totalItems} Item Terpilih`;
    if (cartTotalElement) cartTotalElement.innerText = `RM ${totalPrice.toFixed(2)}`;

    if (modalItem) modalItem.innerText = totalItems;
    if (modalHarga) modalHarga.innerText = `RM ${totalPrice.toFixed(2)}`;

    const floatingCart = document.getElementById('cartModalTrigger');

    if (totalItems > 0 && floatingCart) {
        floatingCart.style.transform = 'translateX(-50%) scale(1.05)';
        setTimeout(() => {
            floatingCart.style.transform = 'translateX(-50%) scale(1)';
        }, 200);
        if (cartItemsList) cartItemsList.innerHTML = listHTML;
    } else {
        if (cartItemsList) cartItemsList.innerHTML = '<p class="empty-cart-text">Troli anda masih kosong. Sila tambah makanan!</p>';
    }
}

// ==========================================
// 7. Popup Troli Overlay
// ==========================================
const overlay = document.getElementById('cartOverlay');
const cartTrigger = document.getElementById('cartModalTrigger');

if (cartTrigger) {
    cartTrigger.addEventListener('click', (e) => {
        if (e.target.id !== 'checkoutBtn' && overlay) {
            overlay.classList.add('active');
        }
    });
}

const closeModalBtn = document.getElementById('closeModal');
if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
        if (overlay) overlay.classList.remove('active');
    });
}

const clearCartBtn = document.getElementById('clearCartBtn');
if (clearCartBtn) {
    clearCartBtn.addEventListener('click', () => {
        cart = {}; 
        activeShopId = null;
        updateCartUI(); 
        if (overlay) overlay.classList.remove('active');
    });
}

// ==========================================
// 8. Popup Confirm Sebelum Bayar
// ==========================================
const checkoutBtn = document.getElementById('checkoutBtn');
const customModal = document.getElementById('customModal');
const modalCancelBtn = document.getElementById('modalCancelBtn');
const modalConfirmBtn = document.getElementById('modalConfirmBtn');
const checkoutBtnModal = document.getElementById('checkoutBtnModal');

function paparkanPengesahan(event) {
    event.preventDefault(); 
    
    let totalBarang = 0;
    for (let id in cart) {
        totalBarang += cart[id].qty;
    }

    const modalTitle = document.getElementById('customModalTitle');
    const modalBody = document.getElementById('customModalBody');
    const modalIcon = document.getElementById('modalIcon');
    const infoContainer = document.getElementById('modalInfoContainer');

    if (overlay) overlay.classList.remove('active');

    if (totalBarang === 0) {
        if (modalTitle) modalTitle.innerText = "Troli Kosong";
        if (modalBody) modalBody.innerText = "Sila tambah makanan ke dalam troli terlebih dahulu sebelum membuat pembayaran.";
        if (modalIcon) modalIcon.innerText = "⚠️";
        
        if (infoContainer) infoContainer.style.display = 'none';
        if (modalConfirmBtn) modalConfirmBtn.style.display = 'none';
        if (modalCancelBtn) modalCancelBtn.innerText = "Tutup";
        
        if (customModal) customModal.classList.add('show');
        return;
    }

    if (modalTitle) modalTitle.innerText = "Sahkan Pembayaran";
    if (modalBody) modalBody.innerText = "Adakah anda pasti ingin meneruskan pembayaran digital?";
    if (modalIcon) modalIcon.innerText = "🛒";
    
    if (infoContainer) infoContainer.style.display = 'block';
    if (modalConfirmBtn) modalConfirmBtn.style.display = 'inline-block';
    if (modalCancelBtn) modalCancelBtn.innerText = "Cancel";

    if (customModal) customModal.classList.add('show');
}

if (checkoutBtn) checkoutBtn.addEventListener('click', paparkanPengesahan);
if (checkoutBtnModal) checkoutBtnModal.addEventListener('click', paparkanPengesahan);

if (modalCancelBtn) {
    modalCancelBtn.addEventListener('click', function() {
        if (customModal) customModal.classList.remove('show');
    });
}

if (modalConfirmBtn) {
    modalConfirmBtn.addEventListener('click', function() {
        if (customModal) customModal.classList.remove('show');
        
        const itemsToSave = [];
        let totalHarga = 0;
        
        for (let id in cart) {
            itemsToSave.push({
                nama: cart[id].name,
                kuantiti: cart[id].qty,
                harga: cart[id].price,
                store_id: activeShopId
            });
            totalHarga += cart[id].price * cart[id].qty;
        }
        
        localStorage.setItem('cartItems', JSON.stringify(itemsToSave));
        localStorage.setItem('cartTotal', totalHarga.toFixed(2));
        
        if (activeShopId) {
            localStorage.setItem('active_checkout_shop', activeShopId);
        }
        
        cart = {};
        activeShopId = null;
        updateCartUI();
        
        window.location.href = 'payment.html'; 
    });
}

window.addEventListener('click', function(event) {
    if (event.target === customModal) {
        customModal.classList.remove('show');
    }
});

// ==========================================
// 9. Paparkan Modal Pesanan Saya
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    const navOrders = document.getElementById("nav-orders");
    const ordersOverlay = document.getElementById("ordersOverlay");
    const closeOrdersModal = document.getElementById("closeOrdersModal");
    const closeOrdersBtn = document.getElementById("closeOrdersBtn");

    if (navOrders) {
        navOrders.addEventListener("click", (e) => {
            e.preventDefault();
            if (ordersOverlay) ordersOverlay.classList.add("active");
        });
    }

    if (closeOrdersModal) {
        closeOrdersModal.addEventListener("click", () => {
            if (ordersOverlay) ordersOverlay.classList.remove("active");
        });
    }

    if (closeOrdersBtn) {
        closeOrdersBtn.addEventListener("click", () => {
            if (ordersOverlay) ordersOverlay.classList.remove("active");
        });
    }

    if (ordersOverlay) {
        ordersOverlay.addEventListener("click", (e) => {
            if (e.target === ordersOverlay) {
                ordersOverlay.classList.remove("active");
            }
        });
    }
});

// ==========================================
// 10. Logik Modal Detail Kedai Dinamik & Profil Peniaga
// ==========================================
const shopModalOverlay = document.getElementById('shopModalOverlay');
const closeShopModal = document.getElementById('closeShopModal');
const shopModalTitle = document.getElementById('shopModalTitle');
const shopModalDesc = document.getElementById('shopModalDesc');
const shopModalBanner = document.getElementById('shopModalBanner');

window.openShopModal = function(storeId) {
    let usernameKey = getUsernameFromStoreId(storeId);
    let savedProfile = JSON.parse(localStorage.getItem('shop_profile_' + usernameKey)) || JSON.parse(localStorage.getItem('shop_profile_' + storeId)) || {};

    if (shopModalTitle) {
        shopModalTitle.innerText = savedProfile.name ? savedProfile.name : storeId.replace(/-/g, ' ').toUpperCase();
    }
    if (shopModalDesc) {
        let bioText = savedProfile.about ? savedProfile.about : "Menyediakan pelbagai jenis makanan dan minuman.";
        shopModalDesc.innerText = `🟢 Sedang Beroperasi • ${bioText}`;
    }
    if (shopModalBanner) {
        shopModalBanner.src = savedProfile.shopImage ? savedProfile.shopImage : "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?q=80&w=600&auto=format&fit=crop";
    }

    const elOwner = document.getElementById('infoOwner');
    const elStall = document.getElementById('infoStall');
    const elAbout = document.getElementById('infoAbout');
    const elTime = document.getElementById('infoTime');
    const elPhone = document.getElementById('infoPhone');
    const elSocial = document.getElementById('infoSocial');

    if (elOwner) elOwner.innerText = savedProfile.ownerName || savedProfile.owner || "Tidak dinyatakan";
    
    let rawStallModal = savedProfile.stallNo || (storeId.includes('stall_') ? `Stall ${storeId.replace('stall_', '')}` : "Stall Utama");
    if (elStall) elStall.innerText = rawStallModal.toLowerCase().includes('stall') ? rawStallModal : `Stall ${rawStallModal}`;

    if (elAbout) elAbout.innerText = savedProfile.about || "Tiada penerangan lanjut.";
    if (elTime) elTime.innerText = (savedProfile.openTime && savedProfile.closeTime) ? `${savedProfile.openTime} - ${savedProfile.closeTime}` : "8:00 AM - 5:00 PM";
    if (elPhone) elPhone.innerText = savedProfile.phone || savedProfile.phoneNumber || "Tidak dinyatakan";
    if (elSocial) elSocial.innerText = savedProfile.socialMedia || savedProfile.social || "Tiada pautan";

    const shopMenuListContainer = document.querySelector('.shop-menu-list');
    if (shopMenuListContainer) {
        let menuList = JSON.parse(localStorage.getItem('prebites_menu')) || [];
        let filteredShopMenu = menuList.filter(item => item.store_id === storeId && item.isActive !== false);

        let shopMenuHtml = '';
        if (filteredShopMenu.length === 0) {
            shopMenuHtml = `<p class="empty-cart-text">Tiada menu tersedia untuk kedai ini buat masa sekarang.</p>`;
        } else {
            filteredShopMenu.forEach(item => {
                shopMenuHtml += `
                    <div class="shop-menu-item" data-item-id="${item.id}" data-name="${item.name}" data-price="${item.price}">
                        <img src="${item.image}" alt="${item.name}">
                        <div class="shop-menu-details">
                            <h5>${item.name}</h5>
                            <span>RM ${item.price.toFixed(2)}</span>
                            ${item.description ? `<p style="font-size:11px; color:#9c8e84; margin-top:2px;">${item.description}</p>` : ''}
                        </div>
                        <button class="btn-add-shop" onclick="addItemWithShopCheck('${item.id}', '${item.name}', ${item.price}, '${item.store_id}')">+</button>
                    </div>
                `;
            });
        }
        shopMenuListContainer.innerHTML = shopMenuHtml;
    }

    if (shopModalOverlay) shopModalOverlay.classList.add('active');
};

if (closeShopModal) {
    closeShopModal.addEventListener('click', () => {
        if (shopModalOverlay) shopModalOverlay.classList.remove('active');
    });
}

const tabBtns = document.querySelectorAll('.shop-tab-btn');
const tabContents = document.querySelectorAll('.shop-tab-content');

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        const targetTab = document.getElementById(`tab-${btn.getAttribute('data-tab')}`);
        if (targetTab) targetTab.classList.add('active');
    });
});