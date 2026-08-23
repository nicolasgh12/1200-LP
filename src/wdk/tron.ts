import type {
  TronGasfreeWalletConfig
} from '@tetherto/wdk-wallet-tron-gasfree'

export type TronNetwork = 'nile' | 'mainnet'

export const TRON_NILE_USDT_ADDRESS =
  'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf'

const NETWORKS = {
  nile: {
    chainId: 3448148188,
    provider: 'https://nile.trongrid.io',
    gasFreeProvider: 'https://open-test.gasfree.io/nile',
    verifyingContract: 'THQGuFzL87ZqhxkgqYEryRAd7gqFqL5rdc'
  },

  mainnet: {
    chainId: 728126428,
    provider: 'https://api.trongrid.io',
    gasFreeProvider: 'https://open.gasfree.io/tron/',
    verifyingContract: 'TFFAMQLZybALaLb4uxHA9RBE7pxhUAjF3U'
  }
} as const

export function createTronGasfreeConfig(network: TronNetwork): TronGasfreeWalletConfig {

  const networkConfig = NETWORKS[network]

  const apiKey = network === 'nile'
      ? process.env.GASFREE_NILE_API_KEY
      : process.env.GASFREE_MAINNET_API_KEY

  const apiSecret =
    network === 'nile'
      ? process.env.GASFREE_NILE_API_SECRET
      : process.env.GASFREE_MAINNET_API_SECRET

  const serviceProvider =
    network === 'nile'
      ? process.env.GASFREE_NILE_SERVICE_PROVIDER
      : process.env.GASFREE_MAINNET_SERVICE_PROVIDER

  if (!apiKey?.trim()) {
    throw new Error(`Missing GasFree API key for ${network}`)
  }

  if (!apiSecret?.trim()) {
    throw new Error(`Missing GasFree API secret for ${network}`)
  }

  if (!serviceProvider?.trim()) {
    throw new Error(
      `Missing GasFree service provider for ${network}`
    )
  }

  return {
    chainId: networkConfig.chainId,
    provider: networkConfig.provider,
    gasFreeProvider: networkConfig.gasFreeProvider,

    gasFreeApiKey: apiKey.trim(),
    gasFreeApiSecret: apiSecret.trim(),

    serviceProvider: serviceProvider.trim(),

    verifyingContract:
      networkConfig.verifyingContract
  }
}