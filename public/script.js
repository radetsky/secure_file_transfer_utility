function shared_url() {
    const url = document.getElementById('shared_url').value;
    console.log(url);
    window.location.replace(url)
}