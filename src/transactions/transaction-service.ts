import {
  findTransactionsByAddress,
  saveTransaction
} from './transaction-repository.js'

import {
  resolveAlias,
  normalizeAlias
} from '../aliases/alias-service.js'

import {
  findByWallet
} from '../aliases/alias-repository.js'

export async function recordPayment(params: {
  userAlias: string
  paymentId: string
  blockchainHash: string | null
  senderAddress: string
  recipientAddress: string
  tokenAddress: string
  amount: bigint
  fee: bigint
}) {
  const normalizedAlias =
    normalizeAlias(params.userAlias)

  return saveTransaction({
    ...params,
    userAlias: normalizedAlias,
    status: 'confirmed'
  })
}

export async function getActivity(alias: string) {
  const user = await resolveAlias(alias)

  if (!user) {
    throw new Error(`Alias ${alias} not found`)
  }

  const transactions = await findTransactionsByAddress(user.address)

  return Promise.all(
    transactions.map(async tx => {
      const outgoing = tx.sender_address === user.address

      const otherAddress =
        outgoing
          ? tx.recipient_address
          : tx.sender_address

      const otherUser = await findByWallet(otherAddress)

      return {
        amount: tx.amount,
        fee: tx.fee,
        direction:
          outgoing
            ? 'outgoing'
            : 'incoming',
        alias: otherUser?.alias ?? null,
        status: tx.status,
        recordedAt: tx.recorded_at
      }
    })
  )
}