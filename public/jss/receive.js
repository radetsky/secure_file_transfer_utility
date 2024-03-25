const dbName = "FileDatabase";
const osName = "files";
let dbh; // Database handle

let wss; // WebSocket connection
const greeting = "I am Bob!";
let fileinfo; // File info to receive { uuid, name, size }

const chunkSize = 1024 * 1024 * 1; // 1MB chunk size

let masterKey;
let state = "loading";

document.addEventListener("DOMContentLoaded", function() {
    delete_db();
    dbh = open_db();
    wss = open_ws();
    hideProgressBar();
    themis.init().then(() => {
        const hexKey = document.getElementById('masterKey').textContent;
        masterKey = themis.hexToUint8Array(hexKey);
    });
});

function getDocumentId() {
    return document.getElementById('uuid').textContent;
}

function send_greeting() {
    const id = getDocumentId();
    wss.send(`${greeting}|${id}`);
}

function showFileInfo() {
    const fileInfoElement = document.createElement('h3');
    fileInfoElement.textContent = `${fileinfo.name} (${fileinfo.size} bytes)`;
    document.getElementById('fileInfo').replaceChildren(fileInfoElement);
}

function ready_to_receiveFile(id) {
    wss.send(`${id}|ready|${fileinfo.name}`);
    showProgressBar();
}

function showSaveBtn() {
    hideProgressBar();
    document.getElementById('saveFileBtn').style.display = 'inline-block';
    document.getElementById('receiveFileBtn').style.display = 'none';
    document.getElementById('encryption_key_table').style.display = 'none';
}

function onMessage(ws, msg) {
    try {
        const info = JSON.parse(msg);
        if (info.result !== undefined) {
            switch (info.result) {
                case 'OK':
                    state = 'OK';
                    fileinfo = info;
                    showFileInfo();
                    return;
                case 'EOF':
                    if (state === 'ERROR') {
                        errorMessageBox("Error decrypting data", "The key is invalid. Make sure you have the correct URL and try again.");
                    }
                    state = 'EOF';
                    setTimeout(showSaveBtn, 1000);
                    return;
                case 'ERROR':
                    state = 'ERROR';
                    console.error("Error: ", info.error);
                    errorMessageBox("Error", info.error);
                    return;
                case 'CANCEL':
                    state = 'CANCEL';
                    console.log("File transfer cancelled by the sender");
                    errorMessageBox("File transfer cancelled", "The sender cancelled the file transfer.");
                    hideProgressBar();
                    document.getElementById('receiveFileBtn').style.display = 'none';
                    document.getElementById('saveFileBtn').style.display = 'none';
                    document.getElementById('download_cancelled').style.display = 'block';
                    document.getElementById('fileInfo').style.display = 'none';
                    return;
                default:
                    console.error("Invalid result: ", info.result);
                    return;
            }
        }
    } catch (err) {
        const id_buf = msg.slice(0, getDocumentId().length);
        id_buf.text().then((id) => {
            if (id !== getDocumentId()) {
                console.error("Invalid document id:", id);
                errorMessageBox("Error", "Invalid document id. Please, reload the page to try again.");
                return;
            }
            const offset_blob = msg.slice(getDocumentId().length + 6, getDocumentId().length + 10);
            offset_blob.arrayBuffer().then((buffer) => {
                const dataView = new DataView(buffer);
                const received_offset = dataView.getUint32(0, true);
                const payload = msg.slice(getDocumentId().length + 10);
                payload.arrayBuffer().then((buffer1) => {
                    const received_data = new Uint8Array(buffer1);
                    try {
                        const decrypted_data = themis.decryptData(masterKey, received_data);
                        saveChunk(decrypted_data, received_offset);
                        wss.send(`${id}|RCVD|${received_offset}`);
                    } catch (err) {
                        state = 'ERROR';
                        console.error("Error decrypting data: ", err);
                        errorMessageBox("Error decrypting data", "The key is invalid. Make sure you have the correct URL and try again.");
                    }
                });
            });
        });
    }
}

function pingServer() {
    if (wss) {
        wss.send(`${fileinfo?.uuid}|PING|`);
    }
}

function open_ws() {
    if (wss) {
        wss.onerror = ws.onopen = ws.onclose = null;
        wss.close();
    }
    const wsproto = location.protocol === 'https:' ? 'wss' : 'ws';
    wss = new WebSocket(`${wsproto}://${location.host}`);
    wss.onerror = function () {
        console.error('WebSocket error');
        errorMessageBox('Error', 'WebSocket error. Please reload the page!')
    };
    wss.onopen = function () {
        console.debug('WebSocket connection established');
        send_greeting();
        setInterval(pingServer, 10 * 1000);
    };
    wss.onclose = function () {
        console.debug('WebSocket connection closed');
        wss = null;
    };
    wss.onmessage = function (event) {
        if (event.data) {
            console.debug(`Received message: ${event.data.length} bytes`);
            onMessage(wss, event.data);
        }
    };
    return wss;
}

function delete_db() {
    indexedDB.deleteDatabase(dbName);
    console.debug("База даних видалена");
}

function open_db() {
    dbh = indexedDB.open(dbName, 1);
    dbh.onerror = function(event) {
        console.error("Помилка відкриття бази даних");
        errorMessageBox("Error", "Error opening the local database. Please, reload the page to try again.");
    };
    dbh.onsuccess = function(event) {
        dbh = event.target.result;
        console.debug("База даних успішно відкрита");
    };
    dbh.onupgradeneeded = function(event) {
        const db = event.target.result;
        db.createObjectStore(osName, { keyPath: "id" });
        console.debug("Об'єктне сховище успішно створено");
    };
    return dbh;
}

function saveChunk(data, offset) {
    if (progress_cancelled) {
        console.debug("Cancel receiving file");
        wss.send(`${fileinfo.uuid}|CANCEL|`);
        hideProgressBar();
        document.getElementById('receiveFileBtn').style.display = 'none';
        document.getElementById('saveFileBtn').style.display = 'none';
        document.getElementById('download_cancelled').style.display = 'block';
        document.getElementById('fileInfo').style.display = 'none';
        progress_cancelled = false;
    }
    const tr = dbh.transaction([osName], "readwrite");
    tr.onerror = function(event) {
        console.error("Помилка транзакції");
        errorMessageBox("Error", "The transaction error occurred during saving file chunk to local database.");
    };
    const os = tr.objectStore(osName);
    const sth = os.add({ id: offset, data: data });
    sth.onerror = function(event) {
        console.error("Помилка збереження шматка файлу у IndexedDB: ", event.target.error);
        errorMessageBox("Error", "Error saving the file chunk to the local database: " + event.target.error);
    };
    tr.commit();
    setBarWidth(offset / fileinfo.size * 100);
    setProgressDetails(offset, fileinfo.size);
}

function saveFileToFS() {
    const tr = dbh.transaction([osName], "readonly");
    const os = tr.objectStore(osName);
    const request = os.openCursor();
    let listOfBlobs = [];
    setBarWidth(0);
    setProgressDetails(0, fileinfo.size);
    showProgressBar();
    setProgressTitle('Saving file to your computer...');
    request.onsuccess = function (event) {
        if (progress_cancelled) {
            hideProgressBar();
            document.getElementById('receiveFileBtn').style.display = 'none';
            document.getElementById('saveFileBtn').style.display = 'none';
            document.getElementById('save_cancelled').style.display = 'block';
            return;
        }
        const cursor = event.target.result;
        if (cursor) {
            listOfBlobs.push(cursor.value.data);
            setBarWidth(cursor.value.id / fileinfo.size * 100);
            setProgressDetails(cursor.value.id, fileinfo.size);
            cursor.continue();
        } else {
            hideProgressBar();
            const blob = new Blob(listOfBlobs, { type: 'application/octet-stream' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = fileinfo.name;
            a.click();
        }
    };
}
