# Secure File Transfer Utility

## Description

**Secure File Transfer Utility** is a demonstration open-source project for secure file transfer between users over the internet. All files are encrypted in the sender's browser, not stored on the server, and transferred directly via WebSocket. The encryption key is generated locally and must be shared manually (via URL).

The project was created to showcase modern encryption and data transfer technologies without storing files on the server. The demo site was active from April 2024 to September 2025.

## Key Features

- **End-to-end encryption:** Files are encrypted in the sender's browser and decrypted in the recipient's browser.
- **Uses [Themis](https://docs.cossacklabs.com/themis/crypto-theory/cryptosystems/) library by CossackLabs:** Symmetric encryption, the key is never stored on the server.
- **Transfer via WebSocket:** The server only switches connections, does not store files.
- **Anonymous:** No accounts or registration required.
- **Supports any file type.**
- **Works in any modern browser, including mobile.**

## Limitations

- Maximum file size — 4GB (browser and IndexedDB limitation).
- One transfer per browser session. You can open multiple windows for parallel transfers.
- The server has no limit on the number of sessions, but there is no DoS protection (the demo was protected by Cloudflare).
- The encryption key must be shared manually (via URL).
- No integration with other services, no API provided.

## Installation & Usage

### PostgreSQL (Ubuntu)
```
apt update
apt install postgresql net-tools
sudo -i -u postgres
psql
CREATE USER test with password 'test';
CREATE DATABASE secure_files owner test;
cd /etc/postgresql/14/main
echo 'host    all             test            127.0.0.1/32            trust' >> ./pg_hba.conf
psql -U test -h 127.0.0.1 secure_files
\i sql/schema.sql
```

### Node.js, npm, yarn (Ubuntu)
```
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Install dependencies
```
npm install -g yarn terser
yarn
yarn run build
```

### Start the server
```
export PGDB=postgres://test:test@127.0.0.1:5432/secure_files
yarn start
```

### systemd service
The repository includes an example `sendmeafile.service` file for running as a systemd service.

## Project Structure

- `server.js` — Node.js + Express server, WebSocket, transfer logic.
- `src/` — client-side encryption logic (wasm-themis).
- `public/` — static files, JS, CSS, Bootstrap.
- `views/` — EJS page templates.
- `sql/schema.sql` — PostgreSQL database schema.
- `minify.sh` — JS minification script.

## FAQ

**What encryption algorithms are used?**
Symmetric encryption via SecureCell from Themis library. Details: [Themis Crypto Theory](https://docs.cossacklabs.com/themis/crypto-theory/cryptosystems/).

**Are there restrictions on file types?**
No, any file type can be transferred.

**Does it work on mobile?**
Yes, in any modern browser.

**Are files stored on the server?**
No, the server only switches WebSocket connections, files are not stored.

**Is registration required?**
No, everything is anonymous.

**Is there DoS protection?**
No, the demo was protected by Cloudflare.

**Is there an API?**
No, integration is not provided.

## License

MIT. Author: Oleksii Radetskyi



