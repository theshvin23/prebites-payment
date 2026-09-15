import { firebaseErrorMessage, resetPassword } from './auth.js';

export function initializePasswordReset(formId, emailId, statusId) {
    const form = document.getElementById(formId);
    const emailInput = document.getElementById(emailId);
    const statusBox = document.getElementById(statusId);
    if (!form || !emailInput || !statusBox) return;

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) submitButton.disabled = true;
        statusBox.classList.add('hidden');
        statusBox.classList.remove('error');

        const email = emailInput.value.trim();
        if (!email) {
            statusBox.textContent = 'Sila masukkan alamat emel terlebih dahulu.';
            statusBox.classList.remove('hidden');
            statusBox.classList.add('error');
            if (submitButton) submitButton.disabled = false;
            emailInput.focus();
            return;
        }

        if (!emailInput.validity.valid) {
            statusBox.textContent = 'Sila masukkan alamat emel yang sah.';
            statusBox.classList.remove('hidden');
            statusBox.classList.add('error');
            if (submitButton) submitButton.disabled = false;
            emailInput.focus();
            return;
        }

        try {
            await resetPassword(email);
            statusBox.textContent = 'Pautan tetapan semula telah dihantar ke emel anda.';
            statusBox.classList.remove('hidden');
            emailInput.value = '';
        } catch (error) {
            statusBox.textContent = firebaseErrorMessage(error);
            statusBox.classList.remove('hidden');
            statusBox.classList.add('error');
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });
}
