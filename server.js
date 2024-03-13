'use strict';

const pgp = require('pg-promise')(/* options */)
if (!process.env.PGDB) {
    console.error("Please set PGDB environment variable to the connection string of the PostgreSQL database");
    process.exit(1);
}
const db = pgp(process.env.PGDB)

const express = require('express');
const http = require('http');
const uuid = require('uuid');
const { WebSocketServer } = require('ws');
const winston = require("winston");

const greetingAlice = "I am Alice!";
const greetingBob = "I am Bob!";

const page404 = __dirname + '/public/404.html';

const myLogFormat = winston.format.printf(({ level, message, timestamp }) => {
    return `${timestamp} ${level} ${message}`;
});

const logger = winston.createLogger({
    level: "silly",
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        myLogFormat,
    ),
    transports: [new winston.transports.Console()],
});

const map = new Map();
/* Express */

const app = express();
app.use(express.static('public'));
app.set('view engine', 'ejs');

app.get('/terms_of_service', (req, res) => {
    res.render('tos');
});
app.get('/about', (req, res) => {
    res.render('about');
});
app.post('/sendfile', (req, res) => {
    const id = uuid.v4();
    map.set(id, { id, name: null, size: null, alice: null, bob: null });
    res.redirect(`/send/${id}`);
});
app.get('/send/:id', (req, res) => {
    let id = req.params.id;
    const receive_url = `${req.protocol}://${req.get('host')}/receive/${id}`
    const info = map.get(id);
    if (!info) {
        res.status(404).sendFile(page404);
        return;
    }
    if (info.name !== null) {
        id = uuid.v4();
        map.set(id, { id, name: null, size: null, alice: null, bob: null });
        res.redirect(`/send/${id}`);
        return;
    }
    res.render('sendfile', {
        id: id,
        receive_url: receive_url,
    });
});
app.get('/receive/:id/:key', (req, res) => {
    const id = req.params.id;
    const key = req.params.key;
    const info = map.get(id);
    if (!info) {
        res.status(404).sendFile(page404);
        return;
    }
    res.render('receivefile', { id, key });
});
app.get('/', (req, res) => {
    res.render('index');
});

app.use((req, res, next) => {
    res.status(404).sendFile(page404);
});

/* Database */
function insert_encrypted_fileinfo(uuid, name, size) {
    db.none('INSERT INTO encrypted_files(uuid, name, size) VALUES($1, $2, $3)', [uuid, name, size]).catch((err) => {
        logger.error(`Error inserting encrypted file info: ${err}`);
    });
}
function insert_transferred_fileinfo(uuid, name, size) {
    db.none('INSERT INTO transferred_files(uuid, name, size) VALUES($1, $2, $3)', [uuid, name, size]).catch((err) => {
        logger.error(`Error inserting transferred file info: ${err}`);
    });
}


/* WebSocket server */
logger.info("Starting server...");
const server = http.createServer(app);

logger.info("Starting WebSocket server...");
const wss = new WebSocketServer({ clientTracking: false, noServer: true });

function onSocketError(err) {
    logger.error(`Socket error: ${err}`);
}

function onGreetingAlice(ws, id) {
    const info = map.get(id);
    if (!info) {
        ws.send(`Error: unknown id ${id}`);
        return;
    }
    info.alice = ws;
    map.set(id, info);
    logger.info(`Hello, Alice: ${id}`);
    ws.send(JSON.stringify({ result: "OK", id: id }));
}

function onGreetingBob(ws, id) {
    const info = map.get(id);
    if (!info) {
        ws.send(JSON.stringify({result: 'error', message: `unknown id ${id}`}));
        return;
    }
    info.bob = ws;
    map.set(id, info);
    logger.info(`Hello, Bob: ${id}`);
    const info2bob = {
        result: "OK",
        uuid: info.id,
        name: info.name,
        size: info.size,
    };
    ws.send(JSON.stringify(info2bob));
}

function onMessage(ws, bufferMessage) {
    logger.debug(`Received message: ${bufferMessage.length} bytes`);
    const message = bufferMessage.toString('utf-8');
    if (message.startsWith(greetingAlice)) {
        onGreetingAlice(ws, message.slice(greetingAlice.length + 1));
        return;
    }
    if (message.startsWith(greetingBob)) {
        onGreetingBob(ws, message.slice(greetingBob.length + 1));
        return;
    }
    const parts = message.split('|');
    const id = parts[0];
    const info = map.get(id);
    if (!info) {
        ws.send(`Error: unknown id ${id}`);
        return;
    }
    if (parts.length < 3) {
        ws.send(`Error: invalid message`);
        return;
    }
    const command = parts[1];
    if (command === 'fileinfo') {
        try {
            const fileinfo = JSON.parse(parts[2]);
            info.name = fileinfo.name;
            info.size = fileinfo.size;
            map.set(id, info);
            insert_encrypted_fileinfo(id, fileinfo.name, fileinfo.size);
            logger.debug(`File info: ${info.name} (${info.size} bytes)`);
            ws.send(JSON.stringify({ result: "OK", fileinfo: `${info.name} (${info.size} bytes)` }));
        } catch (err) {
            ws.send(`Error: invalid fileinfo`);
            return;
        }
    }
    if (command === 'ready') {
        const info2alice = {
            result: "bob is ready",
            id: id,
        };
        info.alice.send(JSON.stringify(info2alice));
        logger.debug(`Bob is ready: ${id}`);
    }

    if (command === 'EOF') {
        logger.debug(`EOF: ${id}`);
        insert_transferred_fileinfo(id, info.name, info.size);
        info.bob.send(JSON.stringify({ result: "EOF" }));
    }

    if (command === 'data') {
        const data = bufferMessage.slice(id.length + command.length + 2 + 4); //we also have 32-bit offset after the command
        logger.debug(`Data: ${data.length} bytes`);
        info.bob.send(bufferMessage);
    }
}

server.on('upgrade', function (request, socket, head) {
    socket.on('error', onSocketError);
    logger.debug('Websocker upgrade request received');
    wss.handleUpgrade(request, socket, head, function (ws) {
        wss.emit('connection', ws, request);
    });
});

wss.on('connection', function (ws, request) {
    ws.on('error', onSocketError);
    ws.on('open', function () {
        logger.debug('WebSocket connection established');
    })
    ws.on('message', function (message) {
        onMessage(ws, message);
    });
    ws.on('close', function () {
        logger.debug('WebSocket was closed');
    });
});

server.listen(8080, function () {
    logger.info('Listening on http://localhost:8080');
});

