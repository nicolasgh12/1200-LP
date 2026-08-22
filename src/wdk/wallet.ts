import WalletManagerTronGasfree
  from '@tetherto/wdk-wallet-tron-gasfree'

import {
  createTronGasfreeConfig
} from './tron.js'

import type {
  CreatedWallet,
  CreateWalletOptions
} from './types.js'

import * as bip39 from 'bip39'

export async function createWallet(
  options: CreateWalletOptions = {}
): Promise<CreatedWallet> {
  const network = options.network ?? 'nile'
  const seedPhrase =
    options.seedPhrase ?? bip39.generateMnemonic()
  const accountIndex = options.accountIndex ?? 0

  const config = createTronGasfreeConfig(network)
  const wallet =
    new WalletManagerTronGasfree(seedPhrase, config)
  const account = await wallet.getAccount(accountIndex)
  const address = await account.getAddress()

  return {
    seedPhrase,
    wallet,
    account,
    address,
    network
  }
}
