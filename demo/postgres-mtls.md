# Deploy and configure a mTLS postgres connection

1. Deploy docker postgres image

```docker
docker run -p 5432:5432 -e POSTGRES_PASSWORD=password -d --name postgres postgres
```

2. Attach process on running container

```bash
docker exec -it <your-postgres-container-id> /bin/bash
```

3. Generate server certificates

Let's create the server certificate first:
```bash
mkdir ~/cert && cd ~/cert

openssl req -new -nodes -text -out ca.csr -keyout ca-key.pem -subj "/CN=certificate-authority"

openssl x509 -req -in ca.csr -text -extfile /etc/ssl/openssl.cnf -extensions v3_ca -signkey ca-key.pem -out ca-cert.pem

openssl req -new -nodes -text -out server.csr -keyout server-key.pem -subj "/CN=pg-server"

openssl x509 -req -in server.csr -text -CA ca-cert.pem -CAkey ca-key.pem -CAcreateserial -out server-cert.pem
```

Now, let's create the client key and certificate:

```bash
openssl req -new -nodes -text -out client.csr -keyout client-key.pem -subj "/CN=pg-client"

openssl x509 -req -in client.csr -text -CA ca-cert.pem -CAkey ca-key.pem -CAcreateserial -out client-cert.pem
```

At this point you should have the following files in the directory:
```bash
$ ls ~/cert
ca-cert.pem  ca-cert.srl  ca.csr  ca-key.pem  client-cert.pem  client.csr  client-key.pem  server-cert.pem  server.csr	server-key.pem
```

Let's move the files to their final destination:

```bash
mkdir -p /etc/ssl/postgresql/
cp ca-cert.pem server-cert.pem server-key.pem /etc/ssl/postgresql/
chmod -R 700 /etc/ssl/postgresql
chown -R postgres.postgres /etc/ssl/postgresql
````

4. Edit PostgreSQL configuration

```bash
nano /var/lib/postgresql/data/postgresql.conf
```

Insert lines near to ssl configuration:

```bash
ssl = on
ssl_cert_file = '/etc/ssl/postgresql/server-cert.pem'
ssl_key_file = '/etc/ssl/postgresql/server-key.pem'
ssl_ca_file = '/etc/ssl/postgresql/ca-cert.pem'
```

Save and edit:

```bash
nano /var/lib/postgresql/data/pg_hba.conf
```

Add this line at the bottom of file:

```bash
hostssl all             remote_user     127.0.0.1/32  md5 clientcert=1
```

Save and restart container
```bash
docker restart <your-postgres-container-id>
```

5. Get client certificate, key and server certificate files

Copy all files from /etc/ssl/postgresql folder on a local folder

```
Content of client-key.pem -> client.key
Content of client-cert.pem -> client.pem
Content of server-cert.pem -> server.pem
```

6. Enable SSL on Daikoku

```bash
ssl {
  enabled = true
  mode = "verify-ca"
  trusted-certs-path = ["/<path-to-files>/server.pem"]
  client-certs-path = ["/<path-to-files>/client.pem"]
  client-keys-path = ["/<path-to-files>/client.key"]
}
```


