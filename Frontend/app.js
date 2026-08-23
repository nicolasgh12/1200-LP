import {
  createWallet,
  getBalance,
  getPaymentStatus,
  getTransactions,
  identifyWallet,
  quotePayment,
  registerAlias,
  resolveAlias,
  sendPayment,
  waitForPayment
} from './wdk-client.js'
import {
  readQrAddress,
  renderWalletQr,
  scanQrImage,
  startQrScanner,
  stopQrScanner
} from './qr.js'

const $ = (selector) => document.querySelector(selector)
const $$ = (selector) => [...document.querySelectorAll(selector)]
const money = (value) =>
  '$ ' + value.toLocaleString('es-AR', { minimumFractionDigits: 2 })

let currentScreen = 'welcome'
let balance = null
let balanceLoading = false
let balanceRefreshTimer = null
let unchangedBalanceChecks = 0
const pendingPayment = {
  amount: 0,
  recipientAddress: '',
  recipientLabel: '',
  netAmount: 0,
  netBaseUnits: '0',
  feeBaseUnits: '0'
}
let pendingSeed = ''
let wallet = {
  sessionId: sessionStorage.getItem('walletSessionId'),
  address: sessionStorage.getItem('walletAddress'),
  network: sessionStorage.getItem('walletNetwork'),
  alias: sessionStorage.getItem('walletAlias')
}

function saveWalletSession() {
  sessionStorage.setItem('walletSessionId', wallet.sessionId)
  sessionStorage.setItem('walletAddress', wallet.address)
  sessionStorage.setItem('walletNetwork', wallet.network)
  if (wallet.alias) sessionStorage.setItem('walletAlias', wallet.alias)
  else sessionStorage.removeItem('walletAlias')
}

function go(id, push = true) {
  if (currentScreen === 'scan-qr' && id !== 'scan-qr') stopQrScanner()
  $$('.screen').forEach((screen) =>
    screen.classList.toggle('active', screen.id === id)
  )
  $('footer').style.display = ['home', 'activity', 'profile'].includes(id)
    ? 'flex'
    : 'none'
  $$('footer button').forEach((button) =>
    button.classList.toggle('selected', button.dataset.go === id)
  )
  currentScreen = id
  if (push) window.history.pushState({ screen: id }, '')
  if (id === 'activity') loadActivity()
  if (['home', 'deposit', 'profile'].includes(id)) showWallet()
  if (id === 'home' && wallet.sessionId) scheduleBalanceRefresh(0)
  else stopBalanceRefresh()
  scrollTo(0, 0)
}

function showWallet() {
  $('#home-alias').textContent = wallet.alias ? `@${wallet.alias}` : 'Tu cuenta'
  $('#deposit-address').textContent = wallet.address || '—'
  $('#profile-address').textContent = wallet.address || '—'
  $('#profile-network').textContent = wallet.network || '—'
  $('#profile-alias').textContent = wallet.alias ? `@${wallet.alias}` : '—'
  if (wallet.address) renderWalletQr($('#deposit-qr'), wallet)
}

async function loadBalance() {
  if (balanceLoading || !wallet.sessionId) return null
  balanceLoading = true
  if (balance === null) {
    $('#balance-status').textContent = 'Consultando saldo...'
  }
  try {
    const previousBalance = balance
    const result = await getBalance()
    balance = Number(result.balance) / 1_000_000
    $('#balance').textContent = money(balance)
    $('#available').textContent = money(balance)
    $('#balance-status').textContent = ''
    validatePayment()
    return previousBalance === null || previousBalance !== balance
  } catch (error) {
    $('#balance-status').textContent = error.message
    return null
  } finally {
    balanceLoading = false
  }
}

function stopBalanceRefresh() {
  clearTimeout(balanceRefreshTimer)
  balanceRefreshTimer = null
}

function scheduleBalanceRefresh(delay) {
  stopBalanceRefresh()
  if (!wallet.sessionId || currentScreen !== 'home' || document.hidden) return
  balanceRefreshTimer = setTimeout(refreshBalanceLoop, delay)
}

async function refreshBalanceLoop() {
  if (currentScreen !== 'home' || document.hidden) return

  const changed = await loadBalance()
  let nextDelay

  if (changed === true) {
    unchangedBalanceChecks = 0
    nextDelay = 5_000
  } else if (changed === false) {
    unchangedBalanceChecks += 1
    nextDelay = unchangedBalanceChecks >= 3 ? 30_000 : 10_000
  } else {
    nextDelay = 30_000
  }

  scheduleBalanceRefresh(nextDelay)
}

async function createNewWallet() {
  const button = $('#create-wallet')
  button.disabled = true
  button.textContent = 'Creando cuenta...'
  $('#create-status').textContent = ''

  try {
    const result = await createWallet()
    wallet = result
    pendingSeed = result.seedPhrase
    console.log('[La Verdadera Teca] Dirección creada:', result.address)
    showWallet()
    showSeedBackup()
    go('backup')
  } catch (error) {
    $('#create-status').textContent = error.message
  } finally {
    button.disabled = false
    button.textContent = 'Crear cuenta'
  }
}

function showSeedBackup() {
  $('#seed-phrase').innerHTML = pendingSeed
    .split(' ')
    .map(
      (word, index) =>
        `<span class="seed-word"><i>${index + 1}</i>${word}</span>`
    )
    .join('')
  $('#finish-backup').disabled = true
  $('#backup-status').classList.remove('ready')
  $('#backup-status').textContent = 'Guardá una copia para continuar.'
}

function markBackupSaved(message) {
  $('#finish-backup').disabled = false
  $('#backup-status').classList.add('ready')
  $('#backup-status').textContent = message
}

async function copySeedPhrase() {
  await navigator.clipboard.writeText(pendingSeed)
  markBackupSaved('Frase copiada. Guardala en un lugar seguro.')
}

function downloadSeedPhrase() {
  const content = [
    'La Verdadera Teca - Respaldo de cuenta',
    '',
    `Dirección: ${wallet.address}`,
    `Red: ${wallet.network}`,
    '',
    'Frase de recuperación:',
    pendingSeed,
    '',
    'No compartas este archivo con nadie.'
  ].join('\n')
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'respaldo-la-verdadera-teca.txt'
  link.click()
  URL.revokeObjectURL(url)
  markBackupSaved('Respaldo descargado correctamente.')
}

function finishSeedBackup() {
  delete wallet.seedPhrase
  delete wallet.imported
  pendingSeed = ''
  $('#seed-phrase').textContent = ''
  saveWalletSession()
  go('alias-setup')
}

function validateSeedInput() {
  const words = $('#seed-input').value.trim().split(/\s+/).filter(Boolean)
  $('#import-button').disabled = words.length < 12
  $('#import-status').textContent = ''
}

async function importWallet() {
  const button = $('#import-button')
  button.disabled = true
  button.textContent = 'Importando...'
  $('#import-status').textContent = ''

  try {
    const result = await createWallet($('#seed-input').value.trim())
    wallet = {
      sessionId: result.sessionId,
      address: result.address,
      network: result.network
    }
    console.log('[La Verdadera Teca] Dirección importada:', result.address)
    showWallet()
    await continueAfterImport()
  } catch (error) {
    $('#import-status').textContent = error.message
  } finally {
    button.disabled = false
    button.textContent = 'Importar cuenta'
  }
}

async function continueAfterImport() {
  saveWalletSession()
  try {
    const registered = await identifyWallet(wallet.address)
    if (registered?.alias) {
      wallet.alias = registered.alias
      saveWalletSession()
      showWallet()
      go('home')
      return
    }
    go('alias-setup')
  } catch (error) {
    go('alias-setup')
    $('#alias-status').textContent = error.message
  }
}

function validateAliasInput() {
  const alias = $('#alias-input').value.trim().toLowerCase()
  $('#alias-input').value = alias.replace(/^@/, '')
  $('#save-alias').disabled = !/^[a-z0-9_]{3,20}$/.test($('#alias-input').value)
  $('#alias-status').textContent = ''
}

async function saveAlias() {
  const button = $('#save-alias')
  button.disabled = true
  button.textContent = 'Guardando...'
  try {
    const result = await registerAlias($('#alias-input').value)
    wallet.alias = result.alias
    saveWalletSession()
    showWallet()
    go('home')
  } catch (error) {
    $('#alias-status').textContent = error.message
  } finally {
    button.disabled = false
    button.textContent = 'Guardar alias'
  }
}

function validatePayment() {
  const recipient = $('#recipient').value.trim()
  pendingPayment.amount = Number($('#amount').value.replace(',', '.')) || 0
  const validAddress = /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(recipient)
  const validAlias = /^@?[a-z0-9_]{3,20}$/i.test(recipient)
  const insufficient = balance !== null && pendingPayment.amount > balance
  $('#transfer-error').textContent = insufficient
    ? 'Saldo insuficiente'
    : recipient && !validAddress && !validAlias
      ? 'Ingresá un alias o dirección válida'
      : ''
  $('#review-payment').disabled =
    (!validAddress && !validAlias) || pendingPayment.amount <= 0 || insufficient
}

function useScannedQr(data) {
  const address = readQrAddress(data)
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) {
    $('#scanner-status').textContent =
      'El código no contiene una dirección válida.'
    return
  }
  $('#recipient').value = address
  validatePayment()
  stopQrScanner()
  window.history.back()
}

async function activateQrScanner() {
  const button = $('#start-scanner')
  button.disabled = true
  $('#scanner-status').textContent = 'Solicitando acceso a la cámara...'
  try {
    await startQrScanner($('#qr-video'), useScannedQr)
    $('#scanner-status').textContent = 'Cámara activa'
  } catch {
    $('#scanner-status').textContent =
      'No pudimos acceder a la cámara. También podés elegir una imagen.'
  } finally {
    button.disabled = false
  }
}

async function scanSelectedQrImage(event) {
  const file = event.target.files[0]
  if (!file) return
  $('#scanner-status').textContent = 'Leyendo código...'
  try {
    useScannedQr(await scanQrImage(file))
  } catch {
    $('#scanner-status').textContent =
      'No encontramos un código QR válido en la imagen.'
  }
  event.target.value = ''
}

async function reviewPayment() {
  const recipient = $('#recipient').value.trim()
  $('#review-payment').disabled = true
  $('#transfer-error').textContent = 'Buscando destinatario...'
  try {
    if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(recipient)) {
      pendingPayment.recipientAddress = recipient
      pendingPayment.recipientLabel = 'El destinatario'
      $('#confirm-address').textContent = recipient
    } else {
      const resolved = await resolveAlias(recipient)
      pendingPayment.recipientAddress = resolved.address
      pendingPayment.recipientLabel = `@${resolved.alias}`
      $('#confirm-address').textContent = pendingPayment.recipientLabel
    }

    $('#transfer-error').textContent = 'Calculando costo de servicio...'
    const totalBaseUnits = BigInt(Math.round(pendingPayment.amount * 1_000_000))
    const quote = await quotePayment(
      pendingPayment.recipientAddress,
      totalBaseUnits.toString()
    )
    const feeBaseUnits = BigInt(quote.fee)
    const netBaseUnits = totalBaseUnits - feeBaseUnits
    if (netBaseUnits <= 0n) {
      throw new Error('El monto debe ser mayor al costo de servicio.')
    }

    pendingPayment.feeBaseUnits = feeBaseUnits.toString()
    pendingPayment.netBaseUnits = netBaseUnits.toString()
    pendingPayment.netAmount = Number(netBaseUnits) / 1_000_000
    $('#confirm-amount').textContent = money(pendingPayment.amount)
    $('#confirm-service-cost').textContent = money(
      Number(feeBaseUnits) / 1_000_000
    )
    $('#confirm-recipient-label').textContent =
      `${pendingPayment.recipientLabel} recibirá`
    $('#confirm-recipient-amount').textContent = money(pendingPayment.netAmount)
    $('#transfer-error').textContent = ''
    go('confirm')
  } catch (error) {
    $('#transfer-error').textContent = error.message
  } finally {
    validatePayment()
  }
}

async function submitPayment() {
  go('processing')
  try {
    const payment = await sendPayment(
      pendingPayment.recipientAddress,
      pendingPayment.netBaseUnits,
      pendingPayment.feeBaseUnits
    )
    $('#processing-status').textContent = 'Verificando el estado...'
    await getPaymentStatus(payment.paymentId)
    $('#processing-status').textContent = 'Esperando confirmación...'
    const confirmation = await waitForPayment(payment.paymentId)
    $('#success-amount').textContent = money(pendingPayment.netAmount)
    $('#payment-id').textContent =
      confirmation.onChainTransactionHash || confirmation.paymentId
    go('success')
    await loadBalance()
  } catch (error) {
    $('#processing-status').textContent = error.message
  }
}

async function loadActivity() {
  const container = $('#activity-result')
  container.innerHTML = '<b>Cargando...</b>'
  try {
    const transactions = await getTransactions()
    container.textContent = JSON.stringify(transactions)
  } catch {
    container.innerHTML =
      '<b>Historial no disponible</b><p>WDK todavía no permite consultar la lista de movimientos de esta cuenta.</p>'
  }
}

function restoreHistoryScreen(event) {
  const fallback = wallet.sessionId ? 'home' : 'welcome'
  go(event.state?.screen || fallback, false)
}

async function copyWalletAddress(event) {
  const button = event.currentTarget
  await navigator.clipboard.writeText(wallet.address)
  const previous = button.textContent
  button.textContent = 'Dirección copiada'
  setTimeout(() => (button.textContent = previous), 1500)
}

function registerEvents() {
  $('#create-wallet').onclick = createNewWallet
  $('#copy-seed').onclick = copySeedPhrase
  $('#download-seed').onclick = downloadSeedPhrase
  $('#finish-backup').onclick = finishSeedBackup
  $('#seed-input').oninput = validateSeedInput
  $('#import-button').onclick = importWallet
  $('#alias-input').oninput = validateAliasInput
  $('#save-alias').onclick = saveAlias
  $('#recipient').oninput = validatePayment
  $('#amount').oninput = validatePayment
  $('#start-scanner').onclick = activateQrScanner
  $('#qr-file').onchange = scanSelectedQrImage
  $('#review-payment').onclick = reviewPayment
  $('#send-payment').onclick = submitPayment

  $$('[data-go]').forEach((button) => {
    button.onclick = () => go(button.dataset.go)
  })
  $$('[data-back]').forEach((button) => {
    button.onclick = () => window.history.back()
  })
  $$('.copy-address').forEach((button) => {
    button.onclick = copyWalletAddress
  })

  window.addEventListener('popstate', restoreHistoryScreen)
  window.addEventListener('focus', () => {
    if (currentScreen === 'home') scheduleBalanceRefresh(0)
  })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopBalanceRefresh()
    else if (currentScreen === 'home') scheduleBalanceRefresh(0)
  })
}

async function boot() {
  if (wallet.sessionId && wallet.address) {
    console.log('[La Verdadera Teca] Dirección activa:', wallet.address)
    if (wallet.alias) {
      window.history.replaceState({ screen: 'home' }, '')
      go('home', false)
    } else {
      window.history.replaceState({ screen: 'alias-setup' }, '')
      go('alias-setup', false)
      await continueAfterImport()
    }
  } else {
    window.history.replaceState({ screen: 'welcome' }, '')
    go('welcome', false)
  }
}

registerEvents()
boot()
