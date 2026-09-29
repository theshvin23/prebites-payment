/* ========================================================
   FIREBASE CONFIGURATION & INITIALIZATION
    PreBites Seller Portal - Database Setup & Cloudinary Images
======================================================== */

// Import Firebase modules
import { getApp, getApps, initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { 
    getFirestore,
    collection, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc,
    getDoc,
    getDocs, 
    query, 
    where,
    serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
// Firebase Configuration
const firebaseConfig = {
    apiKey: 'AIzaSyCnVVcO2VtV2NB3GFR0wNpsKMSNcceKpEc',
    authDomain: 'pre-order-fyp.firebaseapp.com',
    projectId: 'pre-order-fyp',
    storageBucket: 'pre-order-fyp.firebasestorage.app',
    messagingSenderId: '434593930804',
    appId: '1:434593930804:web:45a63ad202876204957461',
    measurementId: 'G-VKS1EH03TJ'
};

// Cloudinary configuration.
const CLOUDINARY_CLOUD_NAME = 'i4umdeou';
const CLOUDINARY_UPLOAD_PRESET = 'prebites_uploads';

// Initialize Firebase
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

async function uploadToCloudinary(file, folder = 'prebites') {
    if (!file) return '';
    if (!CLOUDINARY_CLOUD_NAME || CLOUDINARY_CLOUD_NAME === 'YOUR_CLOUD_NAME_HERE') {
        throw new Error('Cloudinary cloud name belum dikonfigurasi.');
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    formData.append('folder', folder);

    const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
        {
            method: 'POST',
            body: formData
        }
    );

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || 'Gagal memuat naik gambar ke Cloudinary.');
    }

    const result = await response.json();
    return result.secure_url;
}

function getActiveSeller() {
    const session = localStorage.getItem('prebites_active_user');
    if (!session) {
        throw new Error('Sesi peniaga telah tamat. Sila log masuk semula.');
    }

    const seller = JSON.parse(session);
    if (!seller.store_id) {
        throw new Error('ID kedai tidak ditemui dalam sesi peniaga.');
    }

    return seller;
}

/* ========================================================
   FIREBASE MENU MANAGEMENT FUNCTIONS
======================================================== */

/**
 * Fungsi: Tambah Menu Baru ke Firebase
 * Menyimpan item menu ke Firestore dan gambarnya ke Cloudinary
 */
async function addMenuToFirebase(menuData) {
    try {
        const seller = getActiveSeller();
        const imageUrl = menuData.imageFile
            ? await uploadToCloudinary(menuData.imageFile, 'prebites/menus')
            : menuData.image || '';

        // Save the menu directly to Firestore.
        const menuDoc = {
            name: menuData.name,
            price: parseFloat(menuData.price),
            category: menuData.category,
            description: menuData.description || '',
            image: imageUrl,
            store_id: seller.store_id,
            username: seller.username || seller.email,
            isActive: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            badge: 'Baru ✨'
        };

        const docRef = await addDoc(collection(db, 'menus'), menuDoc);
        
        // 3. Simpan juga di localStorage untuk backup
        let menuList = JSON.parse(localStorage.getItem('prebites_menu')) || [];
        menuList.push({
            id: docRef.id,
            ...menuDoc
        });
        localStorage.setItem('prebites_menu', JSON.stringify(menuList));

        return { success: true, id: docRef.id };
    } catch (error) {
        console.error('Ralat menambah menu:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Fungsi: Muatkan Semua Menu Peniaga dari Firebase
 * Menyepadankan data dari Firestore dengan localStorage untuk sinkronisasi
 */
async function loadMenusFromFirebase() {
    try {
        const seller = getActiveSeller();
        const q = query(
            collection(db, 'menus'),
            where('store_id', '==', seller.store_id)
        );
        
        const querySnapshot = await getDocs(q);
        const menus = [];

        querySnapshot.forEach((doc) => {
            menus.push({
                id: doc.id,
                ...doc.data()
            });
        });

        // Simpan di localStorage untuk sinkronisasi
        localStorage.setItem('prebites_menu', JSON.stringify(menus));
        
        return menus;
    } catch (error) {
        console.error('Ralat memuatkan menu:', error);
        return [];
    }
}

/**
 * Fungsi: Kemaskini Menu yang Sedia Ada
 * Mengemas kini maklumat menu di Firestore dan gambar di Cloudinary
 */
async function updateMenuInFirebase(menuId, updatedData) {
    try {
        const seller = getActiveSeller();
        let imageUrl = updatedData.image || '';

        if (!updatedData.image && !updatedData.imageFile) {
            const existingMenu = await getDoc(doc(db, 'menus', menuId));
            imageUrl = existingMenu.exists() ? existingMenu.data().image || '' : '';
        }

        // Upload gambar baharu sahaja; gambar lama kekal jika tiada fail baharu.
        if (updatedData.imageFile) {
            imageUrl = await uploadToCloudinary(updatedData.imageFile, 'prebites/menus');
        }

        // Update di Firestore
        const menuRef = doc(db, 'menus', menuId);
        const menuUpdate = {
            name: updatedData.name,
            price: parseFloat(updatedData.price),
            category: updatedData.category,
            description: updatedData.description || '',
            isActive: updatedData.isActive !== undefined ? updatedData.isActive : true,
            updatedAt: serverTimestamp()
        };
        if (updatedData.imageFile || updatedData.image) {
            menuUpdate.image = imageUrl;
        }
        await updateDoc(menuRef, menuUpdate);

        // Kemaskini localStorage
        let menuList = JSON.parse(localStorage.getItem('prebites_menu')) || [];
        menuList = menuList.map(item => {
            if (item.id === menuId) {
                return {
                    id: menuId,
                    ...updatedData,
                    image: imageUrl,
                    updatedAt: new Date()
                };
            }
            return item;
        });
        localStorage.setItem('prebites_menu', JSON.stringify(menuList));

        return { success: true };
    } catch (error) {
        console.error('Ralat mengemas kini menu:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Fungsi: Padam Menu dari Firebase
 * Menghapus menu dan gambar berkaitan dari Firestore dan Storage
 */
async function deleteMenuFromFirebase(menuId) {
    try {
        // Padam dari Firestore
        await deleteDoc(doc(db, 'menus', menuId));

        // Padam dari localStorage
        let menuList = JSON.parse(localStorage.getItem('prebites_menu')) || [];
        menuList = menuList.filter(item => item.id !== menuId);
        localStorage.setItem('prebites_menu', JSON.stringify(menuList));

        return { success: true };
    } catch (error) {
        console.error('Ralat memadamkan menu:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Fungsi: Sinkronisasi Menu dari Firebase ke Paparan
 * Memastikan semua perubahan di database tertayang segeramenergo
 */
async function syncMenusWithDisplay() {
    try {
        const menus = await loadMenusFromFirebase();
        // Reload paparan dengan data terkini dari Firebase
        loadVendorMenus(); // Panggil fungsi yang ada di kedai.js
        return menus;
    } catch (error) {
        console.error('Ralat sinkronisasi menu:', error);
        return [];
    }
}

/* ========================================================
   FIREBASE SHOP STATUS & PROFILE FUNCTIONS
======================================================== */

/**
 * Fungsi: Simpan Status Kedai (Buka/Tutup)
 * Menyimpan status kedai ke Firebase untuk sinkronisasi semua perangkat
 */
async function updateShopStatusInFirebase(status) {
    try {
        const seller = getActiveSeller();
        const shopRef = doc(db, 'shops', seller.store_id);
        await updateDoc(shopRef, {
            status: status ? 'buka' : 'tutup',
            updatedAt: serverTimestamp()
        });

        return { success: true };
    } catch (error) {
        console.error('Ralat mengemas kini status kedai:', error);
        return { success: false };
    }
}

/**
 * Fungsi: Simpan Profil Kedai ke Firebase
 * Menyimpan maklumat lengkap kedai untuk sinkronisasi
 */
async function updateShopProfileInFirebase(profileData) {
    try {
        const seller = getActiveSeller();
        const shopRef = doc(db, 'shops', seller.store_id);
        await updateDoc(shopRef, {
            name: profileData.name,
            ownerName: profileData.ownerName,
            phone: profileData.phone,
            social: profileData.social || '',
            about: profileData.about || '',
            day: profileData.day || '',
            openTime: profileData.openTime || '',
            closeTime: profileData.closeTime || '',
            bankName: profileData.bankName || '',
            accountNum: profileData.accountNum || '',
            qrImage: profileData.qrImage || '',
            qrOffsetX: profileData.qrOffsetX || 0,
            qrOffsetY: profileData.qrOffsetY || 0,
            qrScale: profileData.qrScale || 1,
            shopImage: profileData.shopImage || '',
            shopOffsetX: profileData.shopOffsetX || 0,
            shopOffsetY: profileData.shopOffsetY || 0,
            shopScale: profileData.shopScale || 1,
            location: profileData.location || '',
            description: profileData.description || '',
            updatedAt: serverTimestamp()
        });

        return { success: true };
    } catch (error) {
        console.error('Ralat mengemas kini profil kedai:', error);
        return { success: false };
    }
}

/**
 * Fungsi: Muatkan Profil Kedai dari Firebase
 * Mendapatkan maklumat lengkap kedai
 */
async function loadShopProfileFromFirebase() {
    try {
        const seller = getActiveSeller();
        const storeId = seller.store_id || seller.username;
        const shopRef = doc(db, 'shops', storeId);
        const shopSnap = await getDoc(shopRef);

        if (shopSnap.exists()) {
            return shopSnap.data();
        }
        return null;
    } catch (error) {
        console.error('Ralat memuatkan profil kedai:', error);
        return null;
    }
}

async function syncOrdersToSellerDashboard() {
    try {
        const seller = getActiveSeller();
        const storeId = seller.store_id || seller.username;
        const ordersSnapshot = await getDocs(query(collection(db, 'orders'), where('store_id', '==', storeId)));
        const firebaseOrders = ordersSnapshot.docs.map(orderDocument => {
            const order = orderDocument.data();
            return {
                ...order,
                id: orderDocument.id,
                customerName: order.customerName || order.customerEmail || 'Pelanggan',
                status: order.status || (order.orderStatus === 'pending' ? 'diterima' : order.orderStatus),
                time: order.createdAt?.toDate?.().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || 'Baru Sahaja',
                createdAt: order.createdAt?.toDate?.().toISOString() || order.createdAt || null,
                preparedAt: order.preparedAt?.toDate?.().toISOString() || order.preparedAt || null,
                completedAt: order.completedAt?.toDate?.().toISOString() || order.completedAt || null,
                cancelledAt: order.cancelledAt?.toDate?.().toISOString() || order.cancelledAt || null
            };
        });

        const localOrders = JSON.parse(localStorage.getItem('prebites_orders') || '[]');
        const localById = new Map(localOrders.map(order => [String(order.id), order]));
        firebaseOrders.forEach(order => localById.set(String(order.id), { ...localById.get(String(order.id)), ...order }));
        localStorage.setItem('prebites_orders', JSON.stringify([...localById.values()]));
    } catch (error) {
        console.error('Gagal menyegerakkan pesanan Firebase:', error);
    }
}

async function updateOrderInFirebase(orderId, updates) {
    if (!orderId) throw new Error('Order ID tidak ditemui.');
    await updateDoc(doc(db, 'orders', orderId), {
        ...updates,
        updatedAt: serverTimestamp()
    });
}

async function deleteOrderInFirebase(orderId) {
    if (!orderId) throw new Error('Order ID tidak ditemui.');
    await deleteDoc(doc(db, 'orders', orderId));
}

// Export functions untuk digunakan dalam kedai.js
window.firebaseMenuFunctions = {
    addMenuToFirebase,
    loadMenusFromFirebase,
    updateMenuInFirebase,
    deleteMenuFromFirebase,
    syncMenusWithDisplay,
    updateShopStatusInFirebase,
    updateShopProfileInFirebase,
    loadShopProfileFromFirebase,
    syncOrdersToSellerDashboard,
    updateOrderInFirebase,
    deleteOrderInFirebase,
    uploadToCloudinary
};
