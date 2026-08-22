import 'dotenv/config'

import {
  createWallet,
  getBalance,
  getTransactionStatus,
  sendPayment,
  TRON_NILE_USDT_ADDRESS,
  waitForPayment
} from '../src/wdk/index.js'

const seedA =
  process.env.TEST_SEED_A ??
  'left festival ignore say wear walnut shrimp cheap chronic hood hurry december'

const seedB =
  process.env.TEST_SEED_B ??
  'valley tip anger slogan arena town duty express duty reform like wrestle'

const amount =
  BigInt(process.env.TEST_PAYMENT_AMOUNT ?? '100000')

const walletA = await createWallet({
  network: 'nile',
  seedPhrase: seedA
})

const walletB = await createWallet({
  network: 'nile',
  seedPhrase: seedB
})

console.log('Wallet A:', walletA.address)
console.log('Wallet B:', walletB.address)

const balanceABefore = await getBalance(
  walletA.account,
  TRON_NILE_USDT_ADDRESS
)

const balanceBBefore = await getBalance(
  walletB.account,
  TRON_NILE_USDT_ADDRESS
)

console.log('Balance A before:', balanceABefore.balance)
console.log('Balance B before:', balanceBBefore.balance)

console.log('Sending payment:', amount.toString())

const payment = await sendPayment(walletA.account, {
  recipientAddress: walletB.address,
  tokenAddress: TRON_NILE_USDT_ADDRESS,
  amount
})

console.log('Payment ID:', payment.hash)
console.log('GasFree payment ID:', payment.paymentId)
console.log(
  'On-chain transaction hash:',
  payment.onChainTransactionHash
)
console.log('Fee:', payment.fee)
console.log('Activation fee:', payment.activationFee)

const pendingStatus = await getTransactionStatus(
  walletA.account,
  payment.hash
)

console.log('Initial status:', pendingStatus.status)

const confirmedReceipt = await waitForPayment(
  walletA.account,
  payment.hash
)

console.log(
  'Confirmed on-chain hash:',
  confirmedReceipt.onChainTransactionHash
)
console.log('Confirmed receipt:', confirmedReceipt.receipt)

const finalStatus = await getTransactionStatus(
  walletA.account,
  payment.hash
)

console.log('Final status:', finalStatus.status)
console.log(
  'Final on-chain hash:',
  finalStatus.onChainTransactionHash
)

const balanceAAfter = await getBalance(
  walletA.account,
  TRON_NILE_USDT_ADDRESS
)

const balanceBAfter = await getBalance(
  walletB.account,
  TRON_NILE_USDT_ADDRESS
)

console.log('Balance A after:', balanceAAfter.balance)
console.log('Balance B after:', balanceBAfter.balance)
