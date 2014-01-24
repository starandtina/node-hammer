# Benchmarking tool for MSSQL Server Based on TPC-C

This is a TPC-C based benchmarking tool. A job is described in a yml file, and you can run it concurrently or in sequence depend on your configuration.

## Usage

```
  npm install
  DEBUG=* node --harmony bin/hammer --job-spec test/mssql_test_jobs.yml
```

Currently you must use the --harmony flag when running node 0.11.x to get access to generators. Or use gnode to spawn your node instance. However note that performance degrades quickly compared to 0.11.x.

## Job

```yml
---
config:
    database:
      server: 10.146.29.6
      port: 1433
      user: sa
      password: password
      pool:
        min: 1
        max: 1
        idleTimeoutMillis: 30000000000 # let it keep alive
    duration: 3
    rampup: 1
jobs:
    - name: TPCC_1_1_1
      database_names: tpcc1_1
      virtual_users: 8
```