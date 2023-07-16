import { DataSource } from 'typeorm';

export const datasource = new DataSource(
{
    type: "postgres",
    host: "localhost",
    port: 5432,
    username: "bubu-user",
    password: "sdlkjdhsak325fas",
    database: "bubu-db",
    logging: false,
    synchronize: true,
    entities: ["dist/entity/*.js"],
})