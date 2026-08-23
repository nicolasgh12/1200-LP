import {
  createUserWallet,
  findByAlias,
  findByWallet
} from './alias-repository.js'
import type { TronWalletAccount } from '../wdk/types.js'
import { sendPayment } from '../wdk/payment.js'



export function normalizeAlias(alias: string): string {
  return alias
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
}

export async function identifyWallet(address: string) {
  return findByWallet(address)
}

export async function resolveAlias(alias: string) {
  return findByAlias(
    normalizeAlias(alias)
  )
}

export async function registerAlias(alias: string,address: string) {
  const normalizedAlias = normalizeAlias(alias)

  const existingAlias = await findByAlias(normalizedAlias)

  if (existingAlias) {
    throw new Error(
      'Alias already taken'
    )
  }

  const existingWallet = await findByWallet(address)

  if (existingWallet) {
    throw new Error(
      `Wallet already registered as @${existingWallet.alias}`
    )
  }

  return createUserWallet(normalizedAlias, address)
}

export async function sendToAlias(account: TronWalletAccount, alias: string, tokenAddress: string, amount: bigint, transferMaxFee?: bigint
) {
  const recipient = await resolveAlias(alias)

  if (!recipient) {
    throw new Error(`Alias ${alias} not found`)
  }

  return sendPayment(account, {tokenAddress,recipientAddress: recipient.address,amount,transferMaxFee})
}