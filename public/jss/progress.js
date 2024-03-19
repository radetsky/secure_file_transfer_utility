let modal_progress;

function setBarWidth(width) {
    let progress = Math.round(width * 100) / 100;
    if (progress > 100) {
        progress = 100;
    }
    const bar = document.getElementById("myBar");
    bar.style.width = progress + '%';
    bar.innerHTML = progress + '%';
}

function showProgressBar() {
    if (!modal_progress) {
        modal_progress = new bootstrap.Modal('#progress-modal', {
            keyboard: false
        });
    }
    modal_progress.show();
}

function hideProgressBar() {
    if (modal_progress) {
        modal_progress.hide();
    }
}

function setProgressTitle(title) {
    document.getElementById('progress-title').textContent = title;
}

function errorMessageBox(title, body) {
    document.getElementById('alert-modal-title').textContent = title;
    document.getElementById('alert-modal-text').textContent = body;
    const alert_modal = new bootstrap.Modal(document.getElementById('alert-modal'));
    alert_modal.show();

}
