import {
  NoSuchElementError
} from '@tetherto/wdk-wallet'

import type {
  GasfreeTransaction,
  TransactionStatusResult,
  TronWalletAccount
} from './types.js'
import { normalizeWdkError } from './errors.js'
import {
  getOnChainTransactionHash,
  getTransactionState
} from './states.js'

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

    throw normalizeWdkError(error)
  }

  const status = getTransactionState(receipt)

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
