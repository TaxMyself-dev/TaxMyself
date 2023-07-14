import { DataSource } from 'typeorm';

export const datasource = new DataSource(
{
    type: "postgres",
    host: "localhost",
    port: 5432,
    username: "bubu-user",
    password: "mysecretpassword",
    database: "bubu-db",
    logging: true,
    synchronize: true,
    entities: ["dist/entity/*.js"],
})