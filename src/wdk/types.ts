import type WalletManagerTronGasfree
  from '@tetherto/wdk-wallet-tron-gasfree'

import type {
  TransactionReceipt,
  TransferResult,
  TronActivationFee,
  TronGasfreeTransactionDetails,
  WalletAccountTronGasfree,
  WaitForTransactionOptions
} from '@tetherto/wdk-wallet-tron-gasfree'

import type {
  TronNetwork
} from './tron.js'

export type TronWallet = WalletManagerTronGasfree

export type TronWalletAccount = WalletAccountTronGasfree

export type CreatedWallet = {
  seedPhrase: string
  wallet: TronWallet
  account: TronWalletAccount
  address: string
  network: TronNetwork
}

export type CreateWalletOptions = {
  network?: TronNetwork
  seedPhrase?: string
  accountIndex?: number
}

export type TokenBalance = {
  tokenAddress: string
  balance: bigint
}

export type SendPaymentParams = {
  recipientAddress: string
  tokenAddress: string
  amount: bigint
  transferMaxFee?: bigint
}

export type PaymentResult =
  TransferResult &
  TronActivationFee & {
    paymentId: string
    onChainTransactionHash: string | null
  }

export type TransactionStatus =
  | 'pending'
  | 'confirmed'
  | 'failed'

export type GasfreeTransaction =
  TransactionReceipt & TronGasfreeTransactionDetails

export type TransactionStatusResult = {
  transactionId: string
  paymentId: string
  onChainTransactionHash: string | null
  status: TransactionStatus
  receipt: GasfreeTransaction | null
}

export type WaitForPaymentOptions = WaitForTransactionOptions

export type PaymentConfirmation = {
  paymentId: string
  onChainTransactionHash: string | null
  receipt: GasfreeTransaction
}
