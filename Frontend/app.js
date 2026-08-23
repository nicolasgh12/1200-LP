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
let homeActivityLoading = false
let homeActivityLoaded = false
let homeActivityRefreshTimer = null
let lastHomeActivityRefresh = 0
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

function resetHomeActivity() {
  clearTimeout(homeActivityRefreshTimer)
  homeActivityLoaded = false
  lastHomeActivityRefresh = 0
  const container = $('#home-activity-result')
  container.className = 'card empty'
  container.innerHTML = '<b>Cargando movimientos...</b>'
}

function recoverExpiredSession(error) {
  if (error.status !== 401) return false

  wallet.sessionId = null
  sessionStorage.removeItem('walletSessionId')
  stopBalanceRefresh()
  $('#seed-input').value = ''
  validateSeedInput()
  $('#import-status').textContent =
    'La sesión venció al reiniciar el servidor. Importá nuevamente tu frase semilla para continuar.'
  window.history.replaceState({ screen: 'import-wallet' }, '')
  go('import-wallet', false)
  return true
}

function go(id, push = true) {
  if (id === 'home' && currentScreen !== 'home') lastHomeActivityRefresh = 0
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
    $('#balance-status').classList.add('loading')
  }
  try {
    const previousBalance = balance
    const result = await getBalance()
    balance = Number(result.balance) / 1_000_000
    $('#balance').textContent = money(balance)
    $('#available').textContent = money(balance)
    $('#balance-status').textContent = ''
    $('#balance-status').classList.remove('loading')
    validatePayment()
    return previousBalance === null || previousBalance !== balance
  } catch (error) {
    if (recoverExpiredSession(error)) return null
    $('#balance-status').classList.remove('loading')
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

  const hadBalance = balance !== null
  const changed = await loadBalance()
  const activityExpired = Date.now() - lastHomeActivityRefresh >= 60_000

  if (
    currentScreen === 'home' &&
    (!homeActivityLoaded || changed === true || activityExpired)
  ) {
    await loadHomeActivity()
  }

  if (hadBalance && changed === true) {
    clearTimeout(homeActivityRefreshTimer)
    homeActivityRefreshTimer = setTimeout(() => {
      if (currentScreen === 'home' && !document.hidden) loadHomeActivity()
    }, 3_000)
  }
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
    resetHomeActivity()
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
    resetHomeActivity()
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
  const ownAddress = validAddress && recipient === wallet.address
  const ownAlias =
    validAlias &&
    wallet.alias &&
    recipient.replace(/^@/, '').toLowerCase() === wallet.alias.toLowerCase()
  const ownWallet = ownAddress || ownAlias
  const insufficient = balance !== null && pendingPayment.amount > balance

  let error = ''
  if (ownWallet) error = 'No podés transferirte dinero a tu propia cuenta'
  else if (insufficient) error = 'Saldo insuficiente'
  else if (recipient && !validAddress && !validAlias) {
    error = 'Ingresá un alias o dirección válida'
  }

  $('#transfer-error').textContent = error
  $('#review-payment').disabled =
    (!validAddress && !validAlias) ||
    ownWallet ||
    pendingPayment.amount <= 0 ||
    insufficient
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

    if (pendingPayment.recipientAddress === wallet.address) {
      throw new Error('No podés transferirte dinero a tu propia cuenta')
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

function createActivityItem(transaction) {
  const incoming = transaction.direction === 'incoming'
  const status = {
    confirmed: 'Confirmada',
    pending: 'Pendiente',
    failed: 'Fallida'
  }[transaction.status] || transaction.status
  const date = new Date(transaction.recordedAt).toLocaleString('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short'
  })

  const item = document.createElement('article')
  item.className = `activity-item ${transaction.direction}`

  const icon = document.createElement('span')
  icon.className = 'activity-icon'
  icon.textContent = incoming ? '↓' : '↑'

  const description = document.createElement('div')
  const contact = document.createElement('b')
  const details = document.createElement('small')
  contact.textContent = transaction.alias
    ? `@${transaction.alias}`
    : 'Wallet externa'
  details.textContent = `${status} · ${date}`
  description.append(contact, details)

  const values = document.createElement('div')
  values.className = 'activity-values'
  const amount = document.createElement('b')
  amount.textContent =
    (incoming ? '+ ' : '- ') + money(Number(transaction.amount) / 1_000_000)
  values.append(amount)
  if (!incoming && Number(transaction.fee) > 0) {
    const fee = document.createElement('small')
    fee.textContent = `Servicio: ${money(Number(transaction.fee) / 1_000_000)}`
    values.append(fee)
  }

  item.append(icon, description, values)
  return item
}

async function loadHomeActivity() {
  if (homeActivityLoading) return
  homeActivityLoading = true
  const loaded = await loadActivity(
    'home-activity-result',
    3,
    !homeActivityLoaded
  )
  if (loaded) homeActivityLoaded = true
  lastHomeActivityRefresh = Date.now()
  homeActivityLoading = false
}

async function loadActivity(
  containerId = 'activity-result',
  limit = Infinity,
  showLoading = true
) {
  const container = $(`#${containerId}`)
  if (showLoading) {
    container.className = 'card empty'
    container.innerHTML = '<b>Cargando...</b>'
  }
  try {
    const transactions = await getTransactions()
    if (!transactions.length) {
      container.innerHTML =
        '<b>Todavía no hay movimientos</b><p>Cuando envíes o recibas dinero aparecerá acá.</p>'
      return true
    }
    container.className = 'activity-list'
    container.replaceChildren(
      ...transactions.slice(0, limit).map(createActivityItem)
    )
    return true
  } catch (error) {
    if (recoverExpiredSession(error)) return false
    if (showLoading) {
      container.innerHTML = '<b>No pudimos cargar la actividad</b><p></p>'
      container.querySelector('p').textContent = error.message
    }
    return false
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
