# Secure File Transfer Utility


## PostgreSQL ubuntu
```
apt update
apt install postgresql
sudo -i -u postgres
psql
CREATE USER test with password 'test';
CREATE DATABASE secure_files owner test;
cd /etc/postgresql/14/main
echo 'host    all             test            127.0.0.1/32            trust' >>./pg_hba.conf
psql -U test -h 127.0.0.1 secure_files
\i sql/schema.sql
```

## nodejs, npm, yarn ubuntu
```
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

## npm is already installed with new nodejs
```
npm install -g yarn terser
```

## Deploy dev
```
git clone
yarn
yarn run build
export PGDB=postgres://test:test@127.0.0.1:5432/secure_files
yarn start
```



