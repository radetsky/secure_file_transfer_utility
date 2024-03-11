import themis from 'wasm-themis';
import { Base64ToBytes, BytesToBase64 } from './base64.js'

async function init() {
    return themis.initialized.then(() => {
        console.log('Themis is ready to use');
    })
}

function masterKey() {
    return new themis.SymmetricKey();
}

function base64encode(data) {
    return BytesToBase64(data);
}

function base64decode(encodedData) {
    return Base64ToBytes(encodedData);
}

function uint8ArrayToHex(uint8Array) {
    return Array.prototype.map.call(uint8Array, function(byte) {
        return ('0' + (byte & 0xFF).toString(16)).slice(-2);
    }).join('');
}

function hexToUint8Array(hexString) {
    const length = hexString.length / 2;
    const uint8Array = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
        uint8Array[i] = parseInt(hexString.substr(i * 2, 2), 16);
    }
    return uint8Array;
}

function encryptData(symmetricKey, data) {
    const cell = themis.SecureCellSeal.withKey(symmetricKey);
    const encryptedData = cell.encrypt(data);
    return encryptedData;
}

function decryptData(symmetricKey, encryptedData) {
    const cell = themis.SecureCellSeal.withKey(symmetricKey);
    const decryptedData = cell.decrypt(encryptedData);
    return decryptedData;
}

export {
    init,
    masterKey,
    encryptData,
    decryptData,
    base64decode,
    base64encode,
    uint8ArrayToHex,
    hexToUint8Array
};

