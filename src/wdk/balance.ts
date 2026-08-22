import type {
  TokenBalance,
  TronWalletAccount
} from './types.js'
import { normalizeWdkError } from './errors.js'

export async function getBalance(
  account: TronWalletAccount,
  tokenAddress: string
): Promise<TokenBalance> {
  try {
    const balance = await account.getTokenBalance(tokenAddress)

    return {
      tokenAddress,
      balance
    }
  } catch (error) {
    throw normalizeWdkError(error)
  }
}
