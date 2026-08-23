import { Pool } from 'pg'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('Missing DATABASE_URL')
}

export const db = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
})