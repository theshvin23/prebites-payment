import { auth, db, firebaseErrorMessage } from './auth.js';
import { addDoc, collection, deleteDoc, doc, getDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const BILLPLZ_API_BASE_URL = (() => {
    const configured = (window.__BILLPLZ_API_BASE_URL__ || localStorage.getItem('billplz_api_base_url') || '').replace(/\/$/, '');
    if (configured) return configured;
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:3001';
    }
    return window.location.origin;
})();

function setHomepageNotice(title, message) {
    sessionStorage.setItem('prebites_homepage_notice', JSON.stringify({ title, message }));
}

document.addEventListener("DOMContentLoaded", async function () {
    const paymentReturn = new URLSearchParams(window.location.search).get('payment');
    const returnedOrderId = new URLSearchParams(window.location.search).get('order_id');

    if (paymentReturn === 'returned') {
        let returnMessage = 'Anda Telah Membuat Pembayaran. Sila tunggu pengesahan pesanan.';
        if (returnedOrderId) {
            try {
                const returnedOrder = await getDoc(doc(db, 'orders', returnedOrderId));
                if (returnedOrder.exists() && returnedOrder.data().paymentStatus === 'failed') {
                    returnMessage = 'Pembayaran tidak berjaya. Sila cuba lagi.';
                }
            } catch (error) {
                console.error('Gagal menyemak status bayaran:', error);
            }
        }

        localStorage.removeItem('cartItems');
        localStorage.removeItem('cartTotal');
        localStorage.removeItem('active_checkout_shop');
        setHomepageNotice('Status Pembayaran', returnMessage);
        window.location.replace('homepage.html');
        return;
    }

    // 1. Ambil data tersimpan dari localStorage semasa di homepage
    const cartItems = JSON.parse(localStorage.getItem('cartItems')) || [];
    const cartTotal = localStorage.getItem('cartTotal') || "0.00";

    // 2. Ambil elemen HTML DOM di halaman pembayaran
    const containerMakanan = document.getElementById('senarai-makanan-container');
    const totalHargaTeks = document.getElementById('total-harga-payment');
    const butangBayarTeks = document.getElementById('butang-bayar-teks');
    const qrRadio = document.getElementById('radio-qr');
    const qrStatus = document.getElementById('qr-payment-status');
    const qrImage = document.getElementById('shop-payment-qr');
    const checkoutShopId = localStorage.getItem('active_checkout_shop') || cartItems[0]?.store_id || '';

    if (checkoutShopId) {
        try {
            const shopSnapshot = await getDoc(doc(db, 'shops', checkoutShopId));
            const shopProfile = shopSnapshot.exists() ? shopSnapshot.data() : null;

            if (shopProfile?.qrImage && qrImage) {
                qrImage.src = shopProfile.qrImage;
                qrImage.style.display = 'block';
                if (qrStatus) qrStatus.textContent = `QR pembayaran ${shopProfile.name || 'kedai ini'}`;
            } else {
                if (qrStatus) qrStatus.textContent = 'Kedai ini belum menambah QR bank. Sila pilih FPX atau Bayar Tunai.';
                if (qrRadio) qrRadio.disabled = true;
                document.getElementById('label-qr')?.classList.add('method-unavailable');
            }
        } catch (error) {
            console.error('Gagal memuatkan QR kedai:', error);
            if (qrStatus) qrStatus.textContent = 'QR kedai tidak dapat dimuatkan. Sila pilih FPX atau Bayar Tunai.';
            if (qrRadio) qrRadio.disabled = true;
            document.getElementById('label-qr')?.classList.add('method-unavailable');
        }
    } else {
        if (qrStatus) qrStatus.textContent = 'Kedai tidak dikenal pasti. Sila pilih FPX atau Bayar Tunai.';
        if (qrRadio) qrRadio.disabled = true;
    }

    // 3. Render senarai barangan makanan secara dinamik
    if (cartItems.length > 0) {
        containerMakanan.innerHTML = ""; // Bersihkan placeholder lama
        
        cartItems.forEach(item => {
            const hargaItemLengkap = (item.harga * item.kuantiti).toFixed(2);
            
            // Cipta struktur HTML barang mengikut sistem CSS awak
            const itemHTML = `
                <div class="order-item">
                    <span class="item-name">${item.nama} <span style="color: #8c7a6b;">x${item.kuantiti}</span></span>
                    <span class="item-price">RM ${hargaItemLengkap}</span>
                </div>
            `;
            containerMakanan.innerHTML += itemHTML;
        });
    } else {
        // Jika fail storage kosong
        containerMakanan.innerHTML = "<p style='font-size: 14px; color: #8c7a6b; text-align: center; padding: 15px 0;'>Tiada makanan di dalam troli.</p>";
    }

    // 4. Set harga keseluruhan pada teks paparan & butang bayar
    if (totalHargaTeks) {
        totalHargaTeks.innerText = `RM ${cartTotal}`;
    }
    if (butangBayarTeks) {
        butangBayarTeks.innerText = `Bayar RM ${cartTotal} Sekarang`;
        
        // Tambah fungsi klik pada butang bayar untuk simulasi selesai bayar
        butangBayarTeks.addEventListener('click', async function(e) {
            e.preventDefault();
            if (!auth.currentUser) {
                alert('Sila log masuk sebelum membuat pembayaran.');
                window.location.href = 'login.html';
                return;
            }

            butangBayarTeks.disabled = true;
            const kaedahDipilih = document.querySelector('input[name="payment-method"]:checked');
            const nilaiKaedah = kaedahDipilih ? kaedahDipilih.value.toUpperCase() : 'FPX';
            const isCashPayment = nilaiKaedah === 'CASH';
            const isQrPayment = nilaiKaedah === 'QR';
            const customerPhone = document.getElementById('customer-phone')?.value.trim() || '';

            if (!customerPhone) {
                alert('Sila masukkan nombor WhatsApp untuk menerima notifikasi apabila makanan siap.');
                butangBayarTeks.disabled = false;
                return;
            }

            let orderReference;

            try {
                const orderItems = cartItems.map(item => ({
                    ...item,
                    name: item.nama,
                    quantity: item.kuantiti,
                    price: item.harga
                }));

                orderReference = await addDoc(collection(db, 'orders'), {
                    customerId: auth.currentUser.uid,
                    customerEmail: auth.currentUser.email,
                    customerName: auth.currentUser.displayName || 'Pelanggan',
                    customerPhone,
                    store_id: checkoutShopId,
                    items: orderItems,
                    totalPrice: Number(cartTotal),
                    paymentMethod: nilaiKaedah,
                    paymentStatus: isCashPayment ? 'pending_cash' : (isQrPayment ? 'pending_qr' : 'pending_fpx'),
                    orderStatus: 'pending',
                    status: 'diterima',
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });

                if (!isCashPayment && !isQrPayment) {
                    if (BILLPLZ_API_BASE_URL.includes('REPLACE-WITH-YOUR-VERCEL-URL')) {
                        throw new Error('Konfigurasi URL backend pembayaran belum ditetapkan.');
                    }

                    const billResponse = await fetch(`${BILLPLZ_API_BASE_URL}/api/create-bill`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'ngrok-skip-browser-warning': 'true',
                            Authorization: `Bearer ${await auth.currentUser.getIdToken()}`
                        },
                        body: JSON.stringify({
                            email: auth.currentUser.email,
                            name: auth.currentUser.displayName || 'PreBites Customer',
                            amount: Number(cartTotal),
                            orderId: orderReference.id,
                            description: 'PreBites Order Payment'
                        })
                    });
                    const billData = await billResponse.json().catch(() => ({}));

                    if (!billResponse.ok || !billData.url) {
                        await deleteDoc(orderReference);
                        throw new Error(billData.error || 'Gagal menyediakan pembayaran FPX.');
                    }

                    window.location.href = billData.url;
                    return;
                }

                const confirmation = isCashPayment
                    ? 'Anda Telah Membuat Pesanan. Sila tunggu pesanan anda disediakan.'
                    : isQrPayment
                        ? `Pesanan RM ${cartTotal} berjaya dihantar. Sila tunjukkan bukti bayaran QR kepada peniaga jika diperlukan.`
                    : `Pembayaran RM ${cartTotal} melalui kaedah [${nilaiKaedah}] berjaya! Terima kasih.`;
                setHomepageNotice(
                    isCashPayment ? 'Anda Telah Membuat Pesanan' : 'Pesanan Diterima',
                    confirmation
                );
                localStorage.removeItem('cartItems');
                localStorage.removeItem('cartTotal');
                localStorage.removeItem('active_checkout_shop');
                window.location.replace('homepage.html');
            } catch (error) {
                const message = error instanceof TypeError && error.message === 'Failed to fetch'
                    ? 'Server pembayaran tidak dapat dicapai. Pastikan Firebase Functions sudah dideploy dan cuba lagi.'
                    : (error.message || firebaseErrorMessage(error));
                alert(message);
                butangBayarTeks.disabled = false;
            }
        });
    }

    // 5. Kawalan Interaksi Pilihan Pembayaran
    const radioQr = document.getElementById('radio-qr');
    const radioFpx = document.getElementById('radio-fpx');
    const radioCash = document.getElementById('radio-cash');
    const labelQr = document.getElementById('label-qr');
    const labelFpx = document.getElementById('label-fpx');
    const labelCash = document.getElementById('label-cash');
    const qrExpandContainer = document.getElementById('qr-expand-container');
    const submitBtn = document.getElementById('butang-bayar-teks');

    function updateUI(method) {
        [labelQr, labelFpx, labelCash].forEach(label => label?.classList.remove('active-method'));

        if (method === 'qr') {
            labelQr.classList.add('active-method');
            qrExpandContainer.classList.add('expanded');
            submitBtn.classList.remove('hidden-btn');
            submitBtn.innerText = `Saya Dah Bayar - Hantar Pesanan RM ${cartTotal}`;
        } else if (method === 'cash') {
            labelCash.classList.add('active-method');
            qrExpandContainer.classList.remove('expanded');
            submitBtn.classList.remove('hidden-btn');
            submitBtn.innerText = `Hantar Pesanan RM ${cartTotal}`;
        } else {
            labelFpx.classList.add('active-method');
            qrExpandContainer.classList.remove('expanded');
            submitBtn.classList.remove('hidden-btn');
            submitBtn.innerText = `Bayar RM ${cartTotal} Sekarang`;
        }
    }

    if (labelQr && radioQr) {
        labelQr.addEventListener('click', () => {
            if (radioQr.disabled) return;
            radioQr.checked = true;
            updateUI('qr');
        });
    }

    if (labelFpx && radioFpx) {
        labelFpx.addEventListener('click', () => {
            radioFpx.checked = true;
            updateUI('fpx');
        });
    }

    if (labelCash && radioCash) {
        labelCash.addEventListener('click', () => {
            radioCash.checked = true;
            updateUI('cash');
        });
    }

    // 6. Logik Kawalan Custom Modal Pengesahan Batal (Cancel Payment)
    const btnCancelPayment = document.getElementById('btn-cancel-payment');
    const cancelModalOverlay = document.getElementById('cancelModalOverlay');
    const modalBtnBack = document.getElementById('modalBtnBack');
    const modalBtnConfirm = document.getElementById('modalBtnConfirm');

    // Bila butang "Cancel Payment" ditekan, paparkan modal lawa
    if (btnCancelPayment) {
        btnCancelPayment.addEventListener('click', () => {
            cancelModalOverlay.classList.add('active');
        });
    }

    // Bila butang "Kekalkan" ditekan, tutup modal tanpa buat apa-apa
    if (modalBtnBack) {
        modalBtnBack.addEventListener('click', () => {
            cancelModalOverlay.classList.remove('active');
        });
    }

    // Bila butang "Ya, Batalkan" ditekan, kosongkan troli & pulang ke homepage
    if (modalBtnConfirm) {
        modalBtnConfirm.addEventListener('click', () => {
            localStorage.removeItem('cartItems');
            localStorage.removeItem('cartTotal');
            window.location.href = 'homepage.html';
        });
    }

    // Tutup modal jika pengguna tekan di luar kotak modal (di bahagian gelap)
    if (cancelModalOverlay) {
        cancelModalOverlay.addEventListener('click', (e) => {
            if (e.target === cancelModalOverlay) {
                cancelModalOverlay.classList.remove('active');
            }
        });
    }
});