CREATE TABLE encrypted_files (
    uuid UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    size BIGINT NOT NULL,
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45) -- Assuming IPv4 or IPv6 addresses
);

CREATE INDEX idx_created ON encrypted_files (created);

CREATE TABLE transferred_files (
    uuid UUID PRIMARY KEY,
    encrypted_uuid UUID REFERENCES encrypted_files(uuid), -- Foreign key constraint
    name VARCHAR(255) NOT NULL,
    size BIGINT NOT NULL,
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45) -- Assuming IPv4 or IPv6 addresses
);

CREATE INDEX idx_transferred_files_created ON transferred_files (created);
