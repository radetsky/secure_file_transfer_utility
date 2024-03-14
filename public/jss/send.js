const dbName = "FileDatabase";
const osName = "files";
const chunkSize = 1024 * 1024 * 1; // 1MB chunk size
let dbh; // Database handle
let wss; // WebSocket connection
let fileinfo; // File info to send { uuid, name, size }
const greeting = "I am Alice!";

let masterKey;

document.addEventListener("DOMContentLoaded", function() {
    delete_db();
    dbh = open_db();
    wss = open_ws();
    setBarWidth(0);
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

function sendFile() {
    const tr = dbh.transaction([osName], "readonly");
    tr.onerror = function(event) {
        console.error("Помилка транзакції читання");
    };
    const os = tr.objectStore(osName);
    const cursorRequest = os.openCursor();
    cursorRequest.onerror = function(event) {
        console.error('Cursor error: ' + event.target.errorCode);
    };
    setBarWidth(0);
    showProgressBar();
    setProgressTitle("Sending file...");

    cursorRequest.onsuccess = function(event) {
        const cursor = event.target.result;
        if (cursor) {
            // Handle each record (cursor.value) here
            const result = cursor.value;
            if ( result.id === undefined ) {
                console.error('Invalid record: offset is undefined');
                return;
            }
            if ( result.data === undefined ) {
                console.error('Invalid record: data is undefined');
                return;
            }
            // Assuming getDocumentId() returns a string
            const id = new TextEncoder().encode(getDocumentId());
            const command = new TextEncoder().encode("|data|");
            const offset_buf = new ArrayBuffer(4);
            const offset_view = new DataView(offset_buf);
            offset_view.setUint32(0, result.id, true);

            const data = new Uint8Array(result.data);

            // Assuming data is already a Uint8Array
            const msg = new Uint8Array(id.length + command.length + 4 + data.byteLength);
            msg.set(id, 0); // Copy id to msg
            msg.set(command, id.length); // Copy command to msg after id
            msg.set(new Uint8Array(offset_buf), id.length + command.length); // Copy offset to msg after command
            msg.set(data, id.length + command.length + 4); // Copy data to msg after command
            wss.send(msg);
            setBarWidth(result.id / fileinfo.size * 100);
            cursor.continue();
        } else {
          // No more data
            console.log('All data read');
            wss.send(`${fileinfo.uuid}|EOF|`);
            setBarWidth(100);
            hideProgressBar();
        }
    };
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
                case 'ERROR':
                    console.error("Error: ", info.error);
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

function open_ws() {
    if (wss) {
        wss.onerror = ws.onopen = ws.onclose = null;
        wss.close();
    }
    wss = new WebSocket(`ws://${location.host}`);
    wss.onerror = function () {
        console.error('WebSocket error');
    };
    wss.onopen = function () {
        console.debug('WebSocket connection established');
        send_greeting();
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
        };
        const os = tr.objectStore(osName);
        const sth = os.add({ id: offset, data: data });

        sth.onerror = function(event) {
            console.log("Помилка збереження шматка файлу у IndexedDB");
        };
        sth.onsuccess = function(event) {
            offset += chunkSize;
            setBarWidth(offset / fileinfo.size * 100);
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