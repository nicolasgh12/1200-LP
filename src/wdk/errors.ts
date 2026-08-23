import {
  MaximumFeeExceededError,
  NoSuchElementError,
  ProviderError,
  TimeoutError,
  TransactionError,
  TransferError
} from '@tetherto/wdk-wallet'

export type WdkWrapperErrorCode =
  | 'INSUFFICIENT_FUNDS'
  | 'NETWORK_ERROR'
  | 'TRANSACTION_ERROR'
  | 'TIMEOUT'
  | 'MAX_FEE_EXCEEDED'
  | 'NOT_FOUND'
  | 'UNKNOWN_ERROR'

export class WdkWrapperError extends Error {
  constructor(
    public readonly code: WdkWrapperErrorCode,
    message: string,
    cause?: unknown
  ) {
    super(message, { cause })
    this.name = 'WdkWrapperError'
  }
}

function hasInsufficientFunds(error: unknown): boolean {
  if (error instanceof TransferError || error instanceof TransactionError) {
    return error.reason.includes('INSUFFICIENT')
  }

  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return message.includes('insufficient') || message.includes('not enough balance')
}

export function normalizeWdkError(error: unknown): WdkWrapperError {
  if (error instanceof WdkWrapperError) return error

  const message = error instanceof Error
    ? error.message
    : 'Unknown WDK error.'

  if (hasInsufficientFunds(error)) {
    return new WdkWrapperError('INSUFFICIENT_FUNDS', message, error)
  }

  if (
    error instanceof MaximumFeeExceededError ||
    message.toLowerCase().includes('transfer max fee')
  ) {
    return new WdkWrapperError('MAX_FEE_EXCEEDED', message, error)
  }

  if (error instanceof TimeoutError) {
    return new WdkWrapperError('TIMEOUT', message, error)
  }

  if (error instanceof NoSuchElementError) {
    return new WdkWrapperError('NOT_FOUND', message, error)
  }

  if (
    error instanceof ProviderError ||
    /fetch|network|econn|socket/i.test(message)
  ) {
    return new WdkWrapperError('NETWORK_ERROR', message, error)
  }

  if (error instanceof TransferError || error instanceof TransactionError) {
    return new WdkWrapperError('TRANSACTION_ERROR', message, error)
  }

  return new WdkWrapperError('UNKNOWN_ERROR', message, error)
}
