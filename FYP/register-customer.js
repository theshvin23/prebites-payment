import {
    auth,
    db,
    firebaseErrorMessage
} from './auth.js';
import { createUserWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { doc, serverTimestamp, setDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const form = document.getElementById('registerForm');
const loading = document.getElementById('loading');
const submitButton = document.getElementById('submitBtn');
const formError = document.getElementById('formError');

function showFieldError(id, message) {
    const field = document.getElementById(id);
    if (!field) return;
    field.textContent = message;
    field.classList.add('show');
}

function clearErrors() {
    document.querySelectorAll('.error-msg').forEach((element) => {
        element.textContent = '';
        element.classList.remove('show');
    });
}

form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors();

    const nama = document.getElementById('nama').value.trim();
    const email = document.getElementById('email').value.trim();
    const matrikId = document.getElementById('matrikId').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (nama.length < 3) showFieldError('namaError', 'Nama mesti sekurang-kurangnya 3 aksara');
    if (matrikId.length < 8) showFieldError('matrikError', 'No. Matrik tidak sah');
    if (password.length < 6) showFieldError('passwordError', 'Kata laluan mesti sekurang-kurangnya 6 aksara');
    if (password !== confirmPassword) showFieldError('confirmError', 'Kata laluan tidak sepadan');
    if (document.querySelector('.error-msg.show')) return;

    if (loading) loading.style.display = 'block';
    if (submitButton) submitButton.disabled = true;

    try {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, 'users', credential.user.uid), {
            uid: credential.user.uid,
            nama,
            email,
            matrikId,
            role: 'customer',
            status: 'active',
            createdAt: serverTimestamp()
        });
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Customer registration failed:', error.code, error.message);
        if (formError) {
            formError.textContent = firebaseErrorMessage(error);
            formError.classList.add('show');
        }
        if (submitButton) submitButton.disabled = false;
    } finally {
        if (loading) loading.style.display = 'none';
    }
});
