import { db } from '../db/postgres.js'

export async function saveTransaction(params: {
  userAlias: string
  paymentId: string
  blockchainHash: string | null
  senderAddress: string
  recipientAddress: string
  tokenAddress: string
  amount: bigint
  fee: bigint
  status: string
}) {
  const result = await db.query(
    `
      INSERT INTO transactions (
        user_alias,
        payment_id,
        blockchain_hash,
        sender_address,
        recipient_address,
        token_address,
        amount,
        fee,
        direction,
        status,
        recorded_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, NOW()
      )
      RETURNING *
    `,
    [
      params.userAlias,
      params.paymentId,
      params.blockchainHash,
      params.senderAddress,
      params.recipientAddress,
      params.tokenAddress,
      params.amount.toString(),
      params.fee.toString(),
      'outgoing',
      params.status
    ]
  )

  return result.rows[0]
}

export async function findTransactionsByAddress(address: string) {
  const result = await db.query(
    `
      SELECT *
      FROM transactions
      WHERE sender_address = $1
         OR recipient_address = $1
      ORDER BY recorded_at DESC
    `,
    [address]
  )

  return result.rows
}