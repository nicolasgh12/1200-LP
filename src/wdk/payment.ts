import type {
  PaymentConfirmation,
  PaymentResult,
  SendPaymentParams,
  TronWalletAccount,
  WaitForPaymentOptions
} from './types.js'

function getOnChainTransactionHash(
  receipt: { receipt: { id?: string } | null }
): string | null {
  return receipt.receipt?.id ?? null
}

export async function sendPayment(
  account: TronWalletAccount,
  params: SendPaymentParams
): Promise<PaymentResult> {
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

export async function waitForPayment(
  account: TronWalletAccount,
  transactionId: string,
  options: WaitForPaymentOptions = {
    target: 'confirmed',
    timeout: 120_000,
    interval: 3_000
  }
): Promise<PaymentConfirmation> {
  const receipt = await account.waitForTransaction(
    transactionId,
    options
  )

  return {
    paymentId: transactionId,
    onChainTransactionHash:
      getOnChainTransactionHash(receipt),
    receipt
  }
}
