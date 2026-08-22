import type {
  TokenBalance,
  TronWalletAccount
} from './types.js'

export async function getBalance(
  account: TronWalletAccount,
  tokenAddress: string
): Promise<TokenBalance> {
  const balance = await account.getTokenBalance(tokenAddress)

  return {
    tokenAddress,
    balance
  }
}
