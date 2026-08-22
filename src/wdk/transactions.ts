import {
  NoSuchElementError
} from '@tetherto/wdk-wallet'

import type {
  GasfreeTransaction,
  TransactionStatus,
  TransactionStatusResult,
  TronWalletAccount
} from './types.js'

function getOnChainTransactionHash(
  receipt: GasfreeTransaction
): string | null {
  return receipt.receipt?.id ?? null
}

function mapTransactionStatus(
  finality: string,
  success?: boolean
): TransactionStatus {
  if (success === false || finality === 'dropped') {
    return 'failed'
  }

  if (finality === 'confirmed' || finality === 'final') {
    return 'confirmed'
  }

  return 'pending'
}

export async function getTransactionStatus(
  account: TronWalletAccount,
  transactionId: string
): Promise<TransactionStatusResult> {
  let receipt: GasfreeTransaction

  try {
    receipt = await account.getTransaction(transactionId)
  } catch (error) {
    if (error instanceof NoSuchElementError) {
      return {
        transactionId,
        paymentId: transactionId,
        onChainTransactionHash: null,
        status: 'pending',
        receipt: null
      }
    }

    throw error
  }

  const status = mapTransactionStatus(
    receipt.finality,
    receipt.success
  )

  return {
    transactionId,
    paymentId: transactionId,
    onChainTransactionHash:
      getOnChainTransactionHash(receipt),
    status,
    receipt
  }
}

export async function getTransactions(
  _account: TronWalletAccount
): Promise<never> {
  throw new Error(
    'getTransactions is not supported by the public Tron GasFree WDK account API yet.'
  )
}
