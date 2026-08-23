import { db } from '../db/postgres.js'

import type {
  UserWallet
} from './types.js'

export async function findByWallet(
  address: string
): Promise<UserWallet | null> {
  const result = await db.query(
    `
      SELECT
        u.alias,
        w.address
      FROM users u
      JOIN wallet w
        ON w.user_alias = u.alias
      WHERE w.address = $1
      LIMIT 1
    `,
    [address]
  )

  return result.rows[0] ?? null
}

export async function findByAlias(
  alias: string
): Promise<UserWallet | null> {
  const result = await db.query(
    `
      SELECT
        u.alias,
        w.address
      FROM users u
      JOIN wallet w
        ON w.user_alias = u.alias
      WHERE u.alias = $1
      LIMIT 1
    `,
    [alias]
  )

  return result.rows[0] ?? null
}

export async function createUserWallet(
  alias: string,
  address: string
): Promise<UserWallet> {
  const client =
    await db.connect()

  try {
    await client.query('BEGIN')

    await client.query(
      `
        INSERT INTO users (alias)
        VALUES ($1)
      `,
      [alias]
    )

    await client.query(
      `
        INSERT INTO wallet (
          user_alias,
          address
        )
        VALUES ($1, $2)
      `,
      [
        alias,
        address
      ]
    )

    await client.query('COMMIT')

    return {
      alias,
      address
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
