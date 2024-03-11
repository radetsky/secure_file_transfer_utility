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
    const progress = document.getElementById("progress-container");
    progress.style.display = 'block';
}

function hideProgressBar() {
    const progress = document.getElementById("progress-container");
    progress.style.display = 'none';
}

