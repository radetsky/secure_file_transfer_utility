let progress;

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
    progress = new bootstrap.Modal('#progress-modal', {
        keyboard: false
    });
    progress.show();
}

function hideProgressBar() {
    if (progress) {
        progress.hide();
    }
}

