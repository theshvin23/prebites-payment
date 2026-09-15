import { getApp, getApps, initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import {
    getAuth,
    GoogleAuthProvider,
    onAuthStateChanged,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signInWithPopup,
    signOut,
    updateProfile
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import {
    doc,
    getDoc,
    getFirestore,
    serverTimestamp,
    setDoc
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const firebaseConfig = {
    apiKey: 'AIzaSyCnVVcO2VtV2NB3GFR0wNpsKMSNcceKpEc',
    authDomain: 'pre-order-fyp.firebaseapp.com',
    projectId: 'pre-order-fyp',
    storageBucket: 'pre-order-fyp.firebasestorage.app',
    messagingSenderId: '434593930804',
    appId: '1:434593930804:web:45a63ad202876204957461',
    measurementId: 'G-VKS1EH03TJ'
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

function getRoleDocument(role, uid) {
    return role === 'seller' ? doc(db, 'sellers', uid) : doc(db, 'users', uid);
}

export function getFirebaseAuth() {
    return auth;
}

export function getFirestoreDb() {
    return db;
}

export function firebaseErrorMessage(error) {
    const messages = {
        'auth/invalid-credential': 'Email atau kata laluan tidak betul.',
        'auth/invalid-login-credentials': 'Email atau kata laluan tidak betul.',
        'auth/user-not-found': 'Akaun dengan email ini belum didaftarkan.',
        'auth/wrong-password': 'Email atau kata laluan tidak betul.',
        'auth/missing-password': 'Sila masukkan kata laluan.',
        'auth/email-already-in-use': 'Email ini sudah didaftarkan.',
        'auth/invalid-email': 'Format email tidak sah.',
        'auth/weak-password': 'Kata laluan mesti sekurang-kurangnya 6 aksara.',
        'auth/operation-not-allowed': 'Log masuk email/password belum diaktifkan dalam Firebase Console > Authentication > Sign-in providers.',
        'auth/popup-closed-by-user': 'Log masuk Google dibatalkan.',
        'auth/popup-blocked': 'Pelayar menyekat popup Google. Sila benarkan popup dan cuba lagi.',
        'auth/unauthorized-domain': 'Domain ini belum dibenarkan Firebase. Tambah 127.0.0.1 dalam Firebase Console > Authentication > Settings > Authorized domains.',
        'auth/operation-not-allowed': 'Google Sign-In belum diaktifkan dalam Firebase Console > Authentication > Sign-in providers.',
        'auth/account-exists-with-different-credential': 'Email ini sudah digunakan dengan kaedah log masuk lain.',
        'auth/too-many-requests': 'Terlalu banyak percubaan. Sila cuba lagi kemudian.'
    };

    if (error?.code === 'app/invalid-role') {
        return 'Akaun Firebase wujud tetapi profil pelanggan belum lengkap. Daftar semula melalui halaman Daftar atau semak users/{uid} dalam Firestore.';
    }

    if (error?.code === 'permission-denied' || error?.code === 'firestore/permission-denied') {
        return 'Firebase menolak akses ke profil pengguna. Semak Firestore Rules untuk koleksi users.';
    }

    return messages[error?.code] || `Operasi tidak berjaya (${error?.code || 'unknown-error'}). Sila cuba lagi.`;
}

export async function signInWithRole(email, password, role) {
    const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
    const profileReference = getRoleDocument(role, credential.user.uid);
    const profileSnapshot = await getDoc(profileReference);

    const existingProfile = profileSnapshot.exists() ? profileSnapshot.data() : null;
    const canRepairCustomerProfile = role === 'customer' && existingProfile && !existingProfile.role;

    if (profileSnapshot.exists() && existingProfile.role !== role && !canRepairCustomerProfile) {
        await signOut(auth);
        const error = new Error('Akaun ini tidak mempunyai akses untuk portal tersebut.');
        error.code = 'app/invalid-role';
        throw error;
    }

    const profile = profileSnapshot.exists() ? {
        ...existingProfile,
        ...(canRepairCustomerProfile ? {
            uid: credential.user.uid,
            email: credential.user.email,
            role: 'customer',
            status: 'active'
        } : {})
    } : {
        uid: credential.user.uid,
        nama: credential.user.displayName || 'Pelanggan',
        email: credential.user.email,
        role: 'customer',
        status: 'active',
        createdAt: serverTimestamp()
    };

    if (!profileSnapshot.exists() || canRepairCustomerProfile) {
        await setDoc(profileReference, profile, { merge: true });
    }

    const session = {
        uid: credential.user.uid,
        email: credential.user.email,
        role,
        ...profile
    };

    localStorage.setItem('prebites_active_user', JSON.stringify(session));
    if (role === 'seller') {
        localStorage.setItem('active_vendor_id', profile.store_id || credential.user.uid);
    }

    return { user: credential.user, profile };
}

export async function signInWithGoogle(role) {
    const credential = await signInWithPopup(auth, googleProvider);
    const user = credential.user;
    const profileReference = getRoleDocument(role, user.uid);
    const profileSnapshot = await getDoc(profileReference);

    if (role === 'seller' && !profileSnapshot.exists()) {
        await signOut(auth);
        const error = new Error('Akaun Google ini belum didaftarkan sebagai peniaga.');
        error.code = 'app/seller-profile-required';
        throw error;
    }

    const profile = profileSnapshot.exists() ? profileSnapshot.data() : {
        uid: user.uid,
        nama: user.displayName || 'Pelanggan',
        email: user.email,
        role: 'customer',
        createdAt: serverTimestamp()
    };

    if (!profileSnapshot.exists()) {
        await setDoc(profileReference, profile, { merge: true });
    }

    localStorage.setItem('prebites_active_user', JSON.stringify({
        uid: user.uid,
        email: user.email,
        role,
        ...profile
    }));

    if (role === 'seller') {
        localStorage.setItem('active_vendor_id', profile.store_id || user.uid);
    }

    return { user, profile };
}

export function resetPassword(email) {
    return sendPasswordResetEmail(auth, email.trim());
}

export async function updateCustomerName(name) {
    const user = auth.currentUser;
    const cleanName = name.trim();

    if (!user) {
        const error = new Error('Sesi log masuk telah tamat.');
        error.code = 'auth/unauthenticated';
        throw error;
    }

    if (cleanName.length < 3) {
        const error = new Error('Nama mesti sekurang-kurangnya 3 aksara.');
        error.code = 'app/invalid-name';
        throw error;
    }

    await updateProfile(user, { displayName: cleanName });
    await setDoc(getRoleDocument('customer', user.uid), { nama: cleanName }, { merge: true });

    const currentSession = JSON.parse(localStorage.getItem('prebites_active_user') || '{}');
    localStorage.setItem('prebites_active_user', JSON.stringify({
        ...currentSession,
        nama: cleanName,
        name: cleanName,
        displayName: cleanName
    }));

    return cleanName;
}

export function watchRoleSession(role, onAllowed, onDenied) {
    return onAuthStateChanged(auth, async (user) => {
        if (!user) {
            onDenied?.('auth/unauthenticated');
            return;
        }

        const profileSnapshot = await getDoc(getRoleDocument(role, user.uid));
        if (!profileSnapshot.exists() || profileSnapshot.data().role !== role) {
            await signOut(auth);
            onDenied?.('app/invalid-role');
            return;
        }

        onAllowed?.(user, profileSnapshot.data());
    });
}

export async function logout() {
    await signOut(auth);
    localStorage.removeItem('prebites_active_user');
    localStorage.removeItem('active_vendor_id');
}

window.prebitesLogout = logout;

export function initializeLoginPage({ role, formId, emailId, passwordId, redirect }) {
    const form = document.getElementById(formId);
    if (!form) return;

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) submitButton.disabled = true;

        try {
            await signInWithRole(
                document.getElementById(emailId).value,
                document.getElementById(passwordId).value,
                role
            );
            window.location.href = redirect;
        } catch (error) {
            console.error('Email sign-in failed:', error.code, error.message);
            alert(firebaseErrorMessage(error));
            if (submitButton) submitButton.disabled = false;
        }
    });
}

export function initializeGoogleLogin({ role, buttonId, redirect }) {
    const button = document.getElementById(buttonId);
    if (!button) return;

    button.addEventListener('click', async () => {
        button.disabled = true;
        try {
            await signInWithGoogle(role);
            window.location.href = redirect;
        } catch (error) {
            console.error('Google sign-in failed:', error.code, error.message);
            alert(firebaseErrorMessage(error));
            button.disabled = false;
        }
    });
}

export { auth, db };
