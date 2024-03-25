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
const { WebSocketServer, WebSocket } = require('ws');
const winston = require("winston");
const { clear } = require('console');

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
setInterval(() => {
    for (const [key, value] of map.entries()) {
        if (value.alice?.readyState === WebSocket.CLOSED) {
            value.alice = null;
        }
        if (value.bob?.readyState === WebSocket.CLOSED) {
            value.bob = null;
        }
        if (value.alice === null && value.bob === null) {
            logger.debug(`Removing ${key} from the map`);
            map.delete(key);
        } else {
            map.set(key, value);
        }
    }
}, 10 * 1000);

const session_info = {
    id: null, // copy of the key
    name: null, // file name
    size: null, // file size
    alice: null, // websocket for alice
    alice_ip: null, // IP address of Alice
    bob: null, // websocket for bob
    bob_ip: null, // IP address of Bob
    state: {
        offset: 0,
    }, // state of the transfer
}

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
app.get('/use_cases', (req, res) => {
    res.render('use_cases');
});
app.get('/features', (req, res) => {
    res.render('features');
});
app.get('/how_it_works', (req, res) => {
    res.render('how_it_works');
});

app.get('/receive_page', (req, res) => {
    res.render('receive_page');
});
app.post('/sendfile', (req, res) => {
    const id = uuid.v4();
    map.set(id, {...session_info, id: id});
    res.redirect(`/send/${id}`);
});
app.get('/send/:id', (req, res) => {
    let id = req.params.id;
    const proto = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const receive_url = `${proto}://${req.get('host')}/receive/${id}`
    const info = map.get(id);
    if (!info) {
        res.status(404).sendFile(page404);
        return;
    }
    if (info.name !== null) {
        id = uuid.v4();
        map.set(id, {...session_info, id: id} );
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
app.get('/status/admin', (req, res) => {
    // return JSON of map
    const status = [];
    for (const [key, value] of map.entries()) {
        let new_value = {...value};
        if (value.alice !== null) {
            new_value.alice = 'connected';
        }
        if (value.bob !== null) {
            new_value.bob = 'connected';
        }
        status.push(new_value);
    }
    res.json(status);
});

app.get('/', (req, res) => {
    res.render('index');
});

app.use((req, res, next) => {
    res.status(404).sendFile(page404);
});

/* Database */
function insert_encrypted_fileinfo(uuid, name, size, ip) {
    db.none('INSERT INTO encrypted_files(uuid, name, size, ip_address) VALUES($1, $2, $3, $4)',
        [uuid, name, size, ip]).catch((err) => {
        logger.error(`Error inserting encrypted file info: ${err}`);
    });
}
function insert_transferred_fileinfo(enc_uuid, name, size, ip) {
    const id = uuid.v4();
    db.none('INSERT INTO transferred_files(uuid, encrypted_uuid, name, size, ip_address) VALUES($1, $2, $3, $4, $5)',
        [id, enc_uuid, name, size, ip]).catch((err) => {
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

function remoteIp(req) {
    let remoteIp;
    if (req.headers['cf-connecting-ip']) {
        // If the request was proxied through Cloudflare
        remoteIp = req.headers['cf-connecting-ip'];
    } else if (req.headers['x-forwarded-for']) {
        // If the request was proxied through another proxy
        remoteIp = req.headers['x-forwarded-for'].split(',')[0].trim();
    } else {
        // Otherwise, use the default remote address
        remoteIp = req.connection.remoteAddress;
    }
    return remoteIp;
}

function onGreetingAlice(ws, id, ip) {
    const info = map.get(id);
    if (!info) {
        ws.send(`Error: unknown id ${id}`);
        return;
    }
    info.alice = ws;
    info.alice_ip = ip;
    map.set(id, info);
    logger.info(`Hello, Alice: ${id} from ${ip}`);
    ws.send(JSON.stringify({ result: "OK", id: id }));
}

function onGreetingBob(ws, id, ip) {
    const info = map.get(id);
    if (!info) {
        ws.send(JSON.stringify({result: 'ERROR', error: `unknown id ${id}`}));
        return;
    }
    info.bob = ws;
    info.bob_ip = ip;
    map.set(id, info);
    logger.info(`Hello, Bob: ${id} from ${ip}`);
    const info2bob = {
        result: "OK",
        uuid: info.id,
        name: info.name,
        size: info.size,
    };
    ws.send(JSON.stringify(info2bob));
}

function whomSocketIs(ws, info) {
    if (info.alice === ws) {
        return 'Alice';
    }
    if (info.bob === ws) {
        return 'Bob';
    }
    return 'Unknown';
}

function onMessage(ws, bufferMessage, remote_ip) {
    logger.debug(`Received message: ${bufferMessage.length} bytes from ${remote_ip}`);
    const message = bufferMessage.toString('utf-8');
    if (message.startsWith(greetingAlice)) {
        onGreetingAlice(ws, message.slice(greetingAlice.length + 1), remote_ip);
        return;
    }
    if (message.startsWith(greetingBob)) {
        onGreetingBob(ws, message.slice(greetingBob.length + 1), remote_ip);
        return;
    }
    const parts = message.split('|');
    const id = parts[0];
    const info = map.get(id);
    if (!info) {
        if (id === 'undefined' && parts[1] === 'PING') {
            logger.debug(`Ping received from ${remote_ip}`);
            return;
        }
        ws.send(JSON.stringify({ result: "ERROR", error: `unknown id ${id}` }));
        return;
    }
    const whomSocket = whomSocketIs(ws, info);
    if (parts.length < 3) {
        logger.error(`Invalid message: ${message} from ${remote_ip}`);
        ws.send(JSON.stringify({ result: "ERROR", error: "invalid message" }));
        return;
    }
    const command = parts[1];
    if (command === 'fileinfo') {
        try {
            const fileinfo = JSON.parse(parts[2]);
            info.name = fileinfo.name;
            info.size = fileinfo.size;
            map.set(id, info);
            insert_encrypted_fileinfo(id, fileinfo.name, fileinfo.size, info.alice_ip);
            logger.debug(`${whomSocket} -> File info: ${info.name} (${info.size} bytes)`);
            ws.send(JSON.stringify({ result: "OK", id: id, fileinfo: `${info.name} (${info.size} bytes)` }));
        } catch (err) {
            logger.error(`Error parsing fileinfo: ${err}`);
            ws.send(JSON.stringify({ result: "ERROR", error: "invalid fileinfo" }));
            return;
        }
    }
    if (command === 'ready') {
        const info2alice = {
            result: "bob is ready",
            id: id,
        };
        info.alice.send(JSON.stringify(info2alice));
        logger.debug(`${whomSocket} -> Bob is ready: ${id}`);
    }

    if (command === 'RCVD') {
        const received_offset = parseInt(parts[2]);
        logger.debug(`${whomSocket} -> Confirmed: ${received_offset} offset`);
        if (received_offset === info.state['offset']) {
            info.alice.send(JSON.stringify({ result: "RCVD", offset: received_offset }));
        }
    }

    if (command === 'data') {
        const data_offset = id.length + command.length + 2 + 4;
        // Message from Alice to Bob. We need to forward it to Bob
        const data = bufferMessage.slice(data_offset); // we also have 32-bit offset after the command
        const offset_buf = bufferMessage.slice(id.length + command.length + 2, data_offset);
        const offset = offset_buf.readUInt32LE(0);

        logger.debug(`${whomSocket} -> Data: ${data.length} bytes at offset ${offset}`);
        if (info.bob !== null) {
            info.bob.send(bufferMessage);
            info.state['offset'] = offset;
        } else {
            logger.error(`Bob is not ready: ${id}`);
            info.alice.send(JSON.stringify({ result: "Error", error: "Bob is not ready" }));
        }
    }

    if (command === 'EOF') {
        logger.debug(`${whomSocket} -> EOF: ${id}`);
        insert_transferred_fileinfo(id, info.name, info.size, info.bob_ip);
        info.bob.send(JSON.stringify({ result: "EOF" }));
        info.state['offset'] = -1;
    }

    if (command === 'CANCEL') {
        logger.debug(`${whomSocket} -> CANCEL: ${id}`);
        if (whomSocket === 'Alice') {
            if (info.bob !== null) {
                info.bob.send(JSON.stringify({ result: "CANCEL" }));
            }
        } else {
            if (info.alice !== null) {
                info.alice.send(JSON.stringify({ result: "CANCEL" }));
            }
        }
    }
    if (command === "PING") {
        logger.debug(`${whomSocket} -> PING: ${id}`);
    }
}

server.on('upgrade', function (request, socket, head) {
    socket.on('error', onSocketError);
    logger.debug('Websocket upgrade request received');
    wss.handleUpgrade(request, socket, head, function (ws) {
        wss.emit('connection', ws, request);
    });
});

wss.on('connection', function (ws, req) {
    const remote_ip = remoteIp(req);
    ws.on('open', function () {
        logger.debug('WebSocket connection established from' + remote_ip);
    })
    ws.on('message', function (message) {
        onMessage(ws, message, remote_ip);
    });
    ws.on('close', function () {
        logger.debug('WebSocket was closed by ' + remote_ip);
        for (const [key, value] of map.entries()) {
            if (value.alice === ws || value.alice?.readyState === WebSocket.CLOSED) {
                if (value.bob !== null) {
                    if (value.bob !== null) {
                        try {
                            value.bob.send(JSON.stringify({
                                result: "ERROR",
                                error: "The sender has ended the connection. Please wait for them to send a new URL."
                            }));
                        } catch (err) {
                            logger.error(`Error sending message to Bob: ${err}`);
                        }
                    }
                }
                value.alice = null;
                value.alice_ip = null;
                map.set(key, value);
            }
            if (value.bob === ws || value.bob?.readyState === WebSocket.CLOSED) {
                if (value.alice !== null) {
                    try {
                        value.alice.send(JSON.stringify({
                            result: "ERROR",
                            error: "Recepient has ended the connection."
                        }));
                    } catch (err) {
                        logger.error(`Error sending message to Alice: ${err}`);
                    }
                }
                value.bob = null;
                value.bob_ip = null;
                map.set(key, value);
            }
        }
    });
});

server.listen(8080, function () {
    logger.info('Listening on http://localhost:8080');
});

