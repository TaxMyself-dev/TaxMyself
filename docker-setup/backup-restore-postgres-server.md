## Backuping the Postgres server
1. Ssh into the server
2. docker exec postgresdb bash -c "pg_dumpall -U postgres > /pgbackup.sql"
3. docker cp postgresdb:/pgbackup.sql .
4. Download the backup file and rename it to today's date

## Restoring a Postgres server

1. Upload the backup file to the server
2. Ssh into the server
3. docker cp your-backup-file.sql postgresdb:/pgbackup.sql
4. docker exec postgresdb psql -U postgres -f pgbackup.sql