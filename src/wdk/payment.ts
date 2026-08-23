import type {
  PaymentConfirmation,
  PaymentResult,
  SendPaymentParams,
  TronWalletAccount,
  WaitForPaymentOptions,
  QuotePaymentParams,
  PaymentQuote
} from './types.js'
import { normalizeWdkError } from './errors.js'
import { getOnChainTransactionHash } from './states.js'

export async function sendPayment(account: TronWalletAccount, params: SendPaymentParams): Promise<PaymentResult> {
  try {
    const result = await account.transfer(
      {
        token: params.tokenAddress,
        recipient: params.recipientAddress,
        amount: params.amount
      },
      params.transferMaxFee === undefined
        ? undefined
        : {
            transferMaxFee: params.transferMaxFee
          }
    )

    return {
      ...result,
      paymentId: result.hash,
      onChainTransactionHash: null
    }
  } 
  catch (error) {
    throw normalizeWdkError(error)
  }
}

export async function waitForPayment(account: TronWalletAccount, transactionId: string, options: WaitForPaymentOptions = {
    target: 'confirmed',
    timeout: 120_000,
    interval: 3_000}): Promise<PaymentConfirmation> {
  try {
    const receipt = await account.waitForTransaction(transactionId, options)

    return {
      paymentId: transactionId,
      onChainTransactionHash:
        getOnChainTransactionHash(receipt),
      receipt
    }
  }
   catch (error) {
    throw normalizeWdkError(error)
  }
}

export async function quotePayment(account: TronWalletAccount, params: QuotePaymentParams): Promise<PaymentQuote> {
  try {
    const quote = await account.quoteTransfer({
      token: params.tokenAddress,
      recipient: params.recipientAddress,
      amount: params.amount
    })

    const fee =
      quote.fee ?? 0n

    const activationFee =
      quote.activationFee ?? 0n

    return {
      amount: params.amount,
      fee,
      activationFee,
      total:
        params.amount +
        fee +
        activationFee
    }
  } catch (error) {
    throw normalizeWdkError(error)
  }
}