import type {
  GasfreeTransaction,
  TransactionStatus
} from './types.js'

export function getOnChainTransactionHash(transaction: GasfreeTransaction): string | null {
  return transaction.receipt?.id ?? null
}

export function getTransactionState(transaction: GasfreeTransaction): TransactionStatus {
  if (transaction.success === false || transaction.finality === 'dropped') {
    return 'failed'
  }

  if (transaction.finality === 'confirmed' || transaction.finality === 'final') {
    return 'confirmed'
  }

  return 'pending'
}
