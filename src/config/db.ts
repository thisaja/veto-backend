import { Pool } from "pg";

const db = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER
})
 
db.connect()
  .then(() => console.log('connected to db'))
  .catch(() => console.log('could not connect to db'));
export default db;