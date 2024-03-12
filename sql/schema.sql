CREATE TABLE encrypted_files (
    uuid UUID PRIMARY KEY,
    name VARCHAR(255) not null,
    size bigint not null,
    created TIMESTAMP default now()
);
CREATE INDEX idx_created ON encrypted_files (created);

CREATE TABLE transferred_files (
    uuid UUID PRIMARY KEY,
    name VARCHAR(255) not null,
    size bigint not null,
    created TIMESTAMP default now()
);
CREATE INDEX idx_transferred_files_created ON transferred_files (created);

