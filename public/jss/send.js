const dbName = "FileDatabase";
const osName = "files";
const chunkSize = 1024 * 1024 * 1; // 1MB chunk size
let dbh; // Database handle
let wss; // WebSocket connection
const greeting = "I am Alice!";

document.addEventListener("DOMContentLoaded", function() {
    delete_db();
    dbh = open_db();
    wss = open_ws();
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
    tr.oncomplete = function(event) {
        console.debug("Транзакція читання завершена");
    };
    tr.onerror = function(event) {
        console.error("Помилка транзакції читання");
    };

    const os = tr.objectStore(osName);
    const cursorRequest = os.openCursor();

    cursorRequest.onerror = function(event) {
        console.error('Cursor error: ' + event.target.errorCode);
    };

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
            console.log(msg);
            console.debug(`Sent offset: ${result.id} and data: ${data.length} bytes`);

            cursor.continue();
        } else {
          // No more data
            console.log('All data read');
        }
    };
}

function onMessage(ws, msg) {
    console.debug(`Received message: ${msg}`);
    try {
        const info = JSON.parse(msg);
        if (info.result !== undefined && info.result === "bob is ready") {
            if (info.id === getDocumentId()) {
                sendFile();
            }
            return;
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
        const data = event.target.result;
        const tr = dbh.transaction([osName], "readwrite");
        tr.oncomplete = function(event) {
            console.debug("Транзакція завершена");
        };
        tr.onerror = function(event) {
            console.error("Помилка транзакції");
        };
        const os = tr.objectStore(osName);
        const sth = os.add({ id: offset, data: data });

        sth.onerror = function(event) {
            console.log("Помилка збереження шматка файлу у IndexedDB");
        };
        sth.onsuccess = function(event) {
            console.log("Шматок файлу успішно збережено у IndexedDB");
            offset += chunkSize;
            if (offset < file.size) {
                saveChunk(file, offset);
            } else {
                console.log("Файл повністю завантажено у IndexedDB");
            }
        };
        tr.commit();
    };
    reader.readAsArrayBuffer(blob);
}

function showFileInfo(name, size) {
    const fileInfoElement = document.createElement('h3');
    fileInfoElement.textContent = `${name} (${size} bytes)`;
    const fileInfo = document.getElementById('fileInfo');
    fileInfo.replaceChildren(fileInfoElement);
}

function sendFileInfo(name, size, uuid) {
    const info = {
        name,
        size,
    };
    wss.send(`${uuid}|fileinfo|${JSON.stringify(info)}`);
}

function uploadFile(uuid) {
    const fileInput = document.getElementById('fileInput');
    if (!fileInput.files.length) {
        alert('Будь ласка, виберіть файл для завантаження.');
        return;
    }
    const file = fileInput.files[0];
    if (file.size > 1024 * 1024 * 1024 * 4) {
        alert('Файл занадто великий для завантаження.');
        return;
    }
    showFileInfo(file.name, file.size);
    sendFileInfo(file.name, file.size, uuid);
    let offset = 0;
    saveChunk(file, offset);
    document.getElementById('fileInput').style.display = 'none';
    document.getElementById('upload_button').style.display = 'none';
    document.getElementById('receive_url').style.display = 'block';
}
