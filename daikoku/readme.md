# Daikoku

Developper portal for Otoroshi

## Asset storage integration tests

`AssetsControllerSpec` exercises the team and tenant asset HTTP endpoints against
a real SeaweedFS S3 server managed by Testcontainers. It covers upload, metadata
listing, byte-for-byte download, replacement and deletion, including multipart
files larger than 5 MiB. Tenant slug persistence is checked through the HTTP API.
`AssetsDataStoreSpec` separately checks outgoing multipart metadata and ACL headers.

These tests run as part of `mise run test:back` from the repository root. Docker
must be running. To run only the asset tests, with the usual test PostgreSQL
database (`daikoku_test`) already available, run from this directory:

```bash
sbt "testOnly fr.maif.daikoku.controllers.AssetsControllerSpec fr.maif.daikoku.utils.AssetsDataStoreSpec"
```

The integration suite resets the test database using the shared test helpers.
Its S3 container, bucket and credentials are test-only and are disposed of after
the suite; no existing asset bucket is used. Bucket `127` and the S3 domain
`0.0.1` allow virtual-host requests to `127.0.0.1` without external DNS.