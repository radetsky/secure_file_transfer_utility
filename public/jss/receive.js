const dbName = "FileDatabase";
const osName = "files";
let dbh; // Database handle

let wss; // WebSocket connection
const greeting = "I am Bob!";
let info = null;

const chunkSize = 1024 * 1024 * 1; // 1MB chunk size

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

function showFileInfo(name, size) {
    const fileInfoElement = document.createElement('h3');
    info = `${name} (${size} bytes)`;
    fileInfoElement.textContent = info;
    const fileInfo = document.getElementById('fileInfo');
    fileInfo.replaceChildren(fileInfoElement);
}

function ready_to_receiveFile(id) {
    wss.send(`${id}|ready|${info}`);
}

function onMessage(ws, msg) {
    try {
        const info = JSON.parse(msg);
        if (info.result !== undefined && info.result === 'OK') {
            showFileInfo(info.file, info.size);
            return;
        }
    } catch (err) {
        const id_buf = msg.slice(0, getDocumentId().length);
        id_buf.text().then((id) => {
            if (id !== getDocumentId()) {
                console.error("Invalid document id:", id);
                return;
            }
            const offset_blob = msg.slice(getDocumentId().length + 6, getDocumentId().length + 10);
            offset_blob.arrayBuffer().then((buffer) => {
                const dataView = new DataView(buffer);
                const received_offset = dataView.getUint32(0, true);
                const payload = msg.slice(getDocumentId().length + 10);
                payload.arrayBuffer().then((buffer1) => {
                    const received_data = new Uint8Array(buffer1);
                    console.log("Payload: ", received_data);
                    console.log(`Received offset: ${received_offset} and data: ${payload.size} bytes`);
                    saveChunk(received_data, received_offset);
                    if (payload.size < chunkSize) {
                        console.log("File received");
                    }
                });
            });
        });
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
        console.debug(`Received message: ${event.data}`);
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

function saveChunk(data, offset) {
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
        console.error("Помилка збереження шматка файлу у IndexedDB: ", event.target.error);
    };
    sth.onsuccess = function(event) {
        console.log("Шматок файлу успішно збережено у IndexedDB");
    };
    tr.commit();
    if (data.length < chunkSize) {
        console.log("File stored in IndexedDB");
        document.getElementById('saveFileBtn').style.display = 'block';
    }
}

function ready_to_saveFile() {
    // read from IndexedDB order by id (offset)
    // make blob from data
    // show node <a> with href = URL.createObjectURL(blob) and download = file name
    // and click it
    const tr = dbh.transaction([osName], "readonly");
    const os = tr.objectStore(osName);
    const request = os.openCursor();
    let listOfBlobs = [];
    request.onsuccess = function(event) {
        const cursor = event.target.result;
        if (cursor) {
            console.log(cursor.value);
            listOfBlobs.push(cursor.value.data);
            cursor.continue();
        } else {
            console.log("No more entries");
            const blob = new Blob(listOfBlobs, { type: 'application/octet-stream' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = "file.bin";
            a.click();
        }
    };
}
