const dialogMarkup = `
    <div class="validation-dialog-overlay" id="validationDialog" role="presentation">
        <div class="validation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="validationDialogTitle" aria-describedby="validationDialogMessage">
            <div class="validation-dialog-icon" aria-hidden="true">!</div>
            <h3 id="validationDialogTitle">Semak Maklumat</h3>
            <p id="validationDialogMessage"></p>
            <button type="button" id="validationDialogClose">Tutup</button>
        </div>
    </div>`;

document.addEventListener('DOMContentLoaded', () => {
    document.body.insertAdjacentHTML('beforeend', dialogMarkup);
    const overlay = document.getElementById('validationDialog');
    const closeButton = document.getElementById('validationDialogClose');

    function closeDialog() {
        overlay.classList.remove('is-visible');
    }

    closeButton.addEventListener('click', closeDialog);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) closeDialog();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeDialog();
    });

    window.showPreBitesAlert = (message, title = 'Semak Maklumat') => {
        document.getElementById('validationDialogTitle').textContent = title;
        document.getElementById('validationDialogMessage').textContent = message;
        overlay.classList.add('is-visible');
        closeButton.focus();
    };

    window.alert = window.showPreBitesAlert;
});
