let modal_progress;
let progress_cancelled = false;

function cancelProgress() {
    progress_cancelled = true;
}

function setBarWidth(width) {
    let progress = Math.round(width * 100) / 100;
    if (progress > 100) {
        progress = 100;
    }
    const bar = document.getElementById("myBar");
    bar.style.width = progress + '%';
    bar.innerHTML = progress + '%';
}

function setProgressDetails(bytes_done, bytes_total) {
    const details = document.getElementById("progress-details");
    details.textContent = `${bytes_done} / ${bytes_total} bytes`;
}

function showProgressBar() {
    if (!modal_progress) {
        modal_progress = new bootstrap.Modal('#progress-modal', {
            keyboard: false
        });
    }
    modal_progress.show();
    progress_cancelled = false;
}

function hideProgressBar() {
    if (modal_progress) {
        modal_progress.hide();
    } else {
        // If the modal is not created yet, try again in 1 second
        setTimeout(hideProgressBar, 1000);
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
