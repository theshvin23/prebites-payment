import { collection, onSnapshot, query, where } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { auth, db } from './auth.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

function refreshHomepage() {
    if (typeof window.loadHomepageData === 'function') {
        window.loadHomepageData();
    }
}

onSnapshot(collection(db, 'menus'), (snapshot) => {
    const menus = snapshot.docs.map((menuSnapshot) => ({
        id: menuSnapshot.id,
        ...menuSnapshot.data()
    }));
    localStorage.setItem('prebites_menu', JSON.stringify(menus));
    refreshHomepage();
}, (error) => {
    console.error('Gagal menyegerakkan menu ke homepage:', error);
});

onSnapshot(collection(db, 'shops'), (snapshot) => {
    snapshot.docs.forEach((shopSnapshot) => {
        const shop = shopSnapshot.data();
        const storeId = shop.store_id || shopSnapshot.id;
        const profile = {
            name: shop.name || '',
            ownerName: shop.ownerName || '',
            about: shop.description || shop.about || '',
            phone: shop.phone || '',
            social: shop.social || shop.socialMedia || '',
            socialMedia: shop.social || shop.socialMedia || '',
            openTime: shop.openTime || '',
            closeTime: shop.closeTime || '',
            shopImage: shop.shopImage || ''
        };

        localStorage.setItem(`shop_profile_${storeId}`, JSON.stringify(profile));
        localStorage.setItem(`shop_status_${storeId}`, shop.status === 'tutup' ? 'tutup' : 'buka');
    });
    refreshHomepage();
}, (error) => {
    console.error('Gagal menyegerakkan kedai ke homepage:', error);
});

onAuthStateChanged(auth, (user) => {
    if (!user) return;

    const ordersQuery = query(collection(db, 'orders'), where('customerId', '==', user.uid));
    onSnapshot(ordersQuery, (snapshot) => {
        const orders = snapshot.docs.map(orderSnapshot => {
            const order = orderSnapshot.data();
            return {
                id: orderSnapshot.id,
                ...order,
                createdAt: order.createdAt?.toDate?.().toISOString() || order.createdAt || null,
                updatedAt: order.updatedAt?.toDate?.().toISOString() || order.updatedAt || null,
                preparedAt: order.preparedAt?.toDate?.().toISOString() || order.preparedAt || null,
                readyAt: order.readyAt?.toDate?.().toISOString() || order.readyAt || null,
                completedAt: order.completedAt?.toDate?.().toISOString() || order.completedAt || null,
                cancelledAt: order.cancelledAt?.toDate?.().toISOString() || order.cancelledAt || null
            };
        });
        localStorage.setItem('prebites_orders', JSON.stringify(orders));
        window.renderOrdersModal?.();
        if (document.getElementById('accountPanelOverlay')?.classList.contains('active')) {
            window.renderCustomerSidebarPanel?.('history');
        }
    }, (error) => {
        console.error('Gagal menyegerakkan sejarah customer:', error);
    });
});
