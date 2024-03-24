const dbName = "FileDatabase";
const osName = "files";
const chunkSize = 1024 * 1024 * 1; // 1MB chunk size
let dbh; // Database handle
let wss; // WebSocket connection
let fileinfo; // File info to send { uuid, name, size }
const greeting = "I am Alice!";

let masterKey;
let state = {
    sent_offset: 0,
    confirmed_offset: 0,
    offset_lists: [],
}

document.addEventListener("DOMContentLoaded", function() {
    delete_db();
    dbh = open_db();
    wss = open_ws();
    setBarWidth(0);
    setProgressDetails(0, 0);
    hideProgressBar();
    themis.init().then(() => {
        masterKey = themis.masterKey();
        document.getElementById('masterKey').textContent = themis.uint8ArrayToHex(masterKey);
    });
});

function getDocumentId() {
    return document.getElementById('uuid').textContent;
}

function send_greeting() {
    const id = getDocumentId();
    wss.send(`${greeting}|${id}`);
}

function sendChunk(read_offset) {
    if (progress_cancelled) {
        sendEOF(false); // cancel
        console.log("Відправка файлу скасована");
        document.getElementById('upload_cancelled').style.display = 'block';
        document.getElementById('fileInfo').style.display = 'none';
        document.getElementById('receive_url_table').style.display = 'none';
        return;
    }
    if (read_offset === undefined) {
        sendEOF();
        return;
    }
    const tr = dbh.transaction([osName], "readonly");
    tr.onerror = function (event) {
        console.error("Помилка транзакції читання");
        errorMessageBox("Error", "The read transaction error while sending the file!");
    };
    const os = tr.objectStore(osName);
    const dbreq = os.get(read_offset);
    dbreq.onerror = function (event) {
        console.error("Помилка читання шматка файлу з IndexedDB");
        errorMessageBox("Error", "Error reading the file chunk from the local database!");
    }
    dbreq.onsuccess = function (event) {
        if (!dbreq.result) {
            sendEOF();
            return;
        }
        const id = new TextEncoder().encode(getDocumentId());
        const command = new TextEncoder().encode("|data|");
        const offset_buf = new ArrayBuffer(4);
        const offset_view = new DataView(offset_buf);
        offset_view.setUint32(0, read_offset, true);
        const data = new Uint8Array(dbreq.result.data);
        const msg = new Uint8Array(id.length + command.length + offset_buf.byteLength + data.byteLength);
        msg.set(id, 0); // Copy id to msg
        msg.set(command, id.length); // Copy command to msg after id
        msg.set(new Uint8Array(offset_buf), id.length + command.length); // Copy offset to msg after command
        msg.set(data, id.length + command.length + 4); // Copy data to msg after command
        wss.send(msg);
        state.sent_offset = read_offset;
        setBarWidth((read_offset + data.byteLength) / fileinfo.size * 100);
        setProgressDetails(read_offset + data.byteLength, fileinfo.size);

    }
}

function sendEOF(EOF = true) {
    if (EOF) {
        console.debug('All data read');
        wss.send(`${fileinfo.uuid}|EOF|`);
        setBarWidth(100);
        setProgressDetails(fileinfo.size, fileinfo.size);
        hideProgressBar();
    } else {
        console.debug('Sending CANCEL');
        wss.send(`${fileinfo.uuid}|CANCEL|`);
        hideProgressBar();
    }
}

function sendFile() {
    setBarWidth(0);
    setProgressDetails(0, fileinfo.size);
    showProgressBar();
    setProgressTitle("Sending file...");
    sendChunk(state.offset_lists.shift());
}

function onMessage(ws, msg) {
    console.debug(`Received message: ${msg}`);
    try {
        const info = JSON.parse(msg);
        if (info.result !== undefined) {
            switch(info.result) {
                case "bob is ready":
                    if (info.id === getDocumentId()) {
                        sendFile();
                    }
                    return;
                case 'OK':
                    console.log("OK:", info.id);
                    return;
                case 'ERROR':
                    console.error("Error: ", info.error);
                    errorMessageBox("Error", info.error);
                    return;
                case 'CANCEL':
                    console.log("CANCELLED");
                    hideProgressBar();
                    errorMessageBox("Error", "The file upload was cancelled by the recipient.");
                    document.getElementById('upload_cancelled').style.display = 'block';
                    document.getElementById('fileInfo').style.display = 'none';
                    document.getElementById('receive_url_table').style.display = 'none';
                    return;
                case 'RCVD':
                    console.log("Confirmed offset: ", info.offset);
                    state.confirmed_offset = info.offset;
                    console.log(state);
                    if (state.sent_offset === state.confirmed_offset) {
                        sendChunk(state.offset_lists.shift());
                    }
                    return;
                default:
                    console.error("Invalid result: ", info.result);
                    return;
            }
        } else {
            console.error("Invalid message: ", msg);
        }
    } catch (err) {
        console.error(err);
        return;
    }
}

function pingServer() {
    wss.send(`${fileinfo.uuid}|PING|`);
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
        errorMessageBox("Error", "WebSocket error");
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
        onMessage(wss, event.data);
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

function saveChunk(file, offset) {
    const reader = new FileReader();
    const blob = file.slice(offset, offset + chunkSize);

    reader.onload = function(event) {
        const data = themis.encryptData(masterKey, new Uint8Array(event.target.result));

        const tr = dbh.transaction([osName], "readwrite");
        tr.onerror = function(event) {
            console.error("Помилка транзакції");
            errorMessageBox("Error", "The transaction error while saving the file!");
        };
        const os = tr.objectStore(osName);
        const sth = os.add({ id: offset, data: data });

        sth.onerror = function(event) {
            console.log("Помилка збереження шматка файлу у IndexedDB");
            errorMessageBox("Error", "Error saving the file chunk to the local database!");
        };
        sth.onsuccess = function (event) {
            if (progress_cancelled) {
                console.log("Завантаження файлу скасовано");
                hideProgressBar();
                document.getElementById('encryption_cancelled').style.display = 'block';
                document.getElementById('fileInfo').style.display = 'none';
                return;
            }
            state.offset_lists.push(offset); // store to the list of offsets
            offset += chunkSize;
            setBarWidth(offset / fileinfo.size * 100);
            setProgressDetails(offset, fileinfo.size);
            if (offset < file.size) {
                saveChunk(file, offset);
            } else {
                console.log("Файл повністю завантажено у IndexedDB");
                let receiveUrl = document.getElementById('receive_url').textContent.trim();
                receiveUrl = receiveUrl + '/' + document.getElementById('masterKey').textContent;
                document.getElementById('receive_url').textContent = receiveUrl;
                document.getElementById('receive_url').style.display = 'block';
                hideProgressBar();
                document.getElementById('encryption_key_table').style.display = 'none';
                document.getElementById('receive_url_table').style.display = 'block';
            }
        };
        tr.commit();
    };
    reader.readAsArrayBuffer(blob);
}

function showFileInfo() {
    document.getElementById('fileInfo').style.display = 'block';
    document.getElementById('fileName').textContent = fileinfo.name;
    document.getElementById('fileSize').textContent = fileinfo.size;
}

function sendFileInfo() {
    try {
        wss.send(`${fileinfo.uuid}|fileinfo|${JSON.stringify(fileinfo)}`);
    } catch (err) {
        alert(`Error sending file information to the recipient. The page will be reloaded. `);
    }
}

function uploadFile(uuid) {
    const fileInput = document.getElementById('fileInput');
    if (!fileInput.files.length) {
        alert('Please select a file to upload.');
        return;
    }
    const file = fileInput.files[0];
    if (file.size > 1024 * 1024 * 1024 * 4) {
        alert('Файл занадто великий для завантаження.');
        return;
    }
    if (file.size < 8 ) {
        alert('Файл занадто малий для завантаження.');
        return;
    }
    fileinfo = {
        uuid: uuid,
        name: file.name,
        size: file.size,
    };
    showFileInfo();
    sendFileInfo();
    let offset = 0;
    showProgressBar();
    saveChunk(file, offset);
    document.getElementById('fileInput').style.display = 'none';
    document.getElementById('upload_button').style.display = 'none';
}

function copyToClipboard(elementId) {
    const contentToCopy = document.getElementById(elementId).textContent;
    navigator.clipboard.writeText(contentToCopy)
        .then(() => {
            alert("Copied to clipboard: " + contentToCopy);
        })
        .catch(err => {
            console.error('Failed to copy: ', err);
        });
}