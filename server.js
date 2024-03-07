'use strict';

const session = require('express-session');
const express = require('express');
const http = require('http');
const uuid = require('uuid');
const { WebSocketServer } = require('ws');
const winston = require("winston");

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

function onSocketError(err) {
    logger.error("Socket error: %s", err);
}

const sessionParser = session({
    saveUninitialized: false,
    secret: '$eC8R4Ty',
    resave: false,
});

const map = new Map();

const app = express();
app.use(express.static('public'));
app.use(sessionParser);
app.set('view engine', 'ejs');

app.post('/sendfile', (req, res) => {
    const id = uuid.v4();
    res.redirect(`/send/${id}`);
});
app.get('/send/:id', (req, res) => {
    const id = req.params.id;
    map.set(id, { id, files: [] });
    res.render('sendfile', { id });
});
app.get('/receive/:id', (req, res) => {
    const id = req.params.id;
    const info = map.get(id);
    if (!info) {
        res.status(404).sendFile(page404);
        return;
    }
    res.render('receivefile', { id });
});
app.get('/', (req, res) => {
    res.render('index');
});

app.use((req, res, next) => {
    res.status(404).sendFile(page404);
});

logger.info("Starting server...");
const server = http.createServer(app);

logger.info("Starting WebSocket server...");
const wss = new WebSocketServer({ clientTracking: false, noServer: true });

server.listen(8080, function () {
    logger.info('Listening on http://localhost:8080');
});

