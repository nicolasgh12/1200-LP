import QrScanner from "qr-scanner";
import QRCode from "qrcode";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const money = (value) =>
  "$ " + value.toLocaleString("es-AR", { minimumFractionDigits: 2 });

let currentScreen = "welcome";
let balance = null;
let balanceLoading = false;
let balanceRefreshTimer = null;
let unchangedBalanceChecks = 0;
let paymentAmount = 0;
let paymentRecipientAddress = "";
let paymentRecipientLabel = "";
let paymentNetAmount = 0;
let paymentNetBaseUnits = "0";
let paymentFeeBaseUnits = "0";
let pendingSeed = "";
let qrScanner = null;
let wallet = {
  sessionId: sessionStorage.getItem("walletSessionId"),
  address: sessionStorage.getItem("walletAddress"),
  network: sessionStorage.getItem("walletNetwork"),
  alias: sessionStorage.getItem("walletAlias"),
};

function saveWalletSession() {
  sessionStorage.setItem("walletSessionId", wallet.sessionId);
  sessionStorage.setItem("walletAddress", wallet.address);
  sessionStorage.setItem("walletNetwork", wallet.network);
  if (wallet.alias) sessionStorage.setItem("walletAlias", wallet.alias);
  else sessionStorage.removeItem("walletAlias");
}

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-wallet-session": wallet.sessionId || "",
      ...options.headers,
    },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "La operación falló");
  return result;
}

function go(id, push = true) {
  if (currentScreen === "scan-qr" && id !== "scan-qr") stopScanner();
  $$(".screen").forEach((screen) =>
    screen.classList.toggle("active", screen.id === id),
  );
  $("footer").style.display = ["home", "activity", "profile"].includes(id)
    ? "flex"
    : "none";
  $$("footer button").forEach((button) =>
    button.classList.toggle("selected", button.dataset.go === id),
  );
  currentScreen = id;
  if (push) window.history.pushState({ screen: id }, "");
  if (id === "activity") loadActivity();
  if (["home", "deposit", "profile"].includes(id)) showWallet();
  if (id === "home" && wallet.sessionId) scheduleBalanceRefresh(0);
  else stopBalanceRefresh();
  scrollTo(0, 0);
}

function showWallet() {
  $("#home-alias").textContent = wallet.alias
    ? `@${wallet.alias}`
    : "Tu cuenta";
  $("#deposit-address").textContent = wallet.address || "—";
  $("#profile-address").textContent = wallet.address || "—";
  $("#profile-network").textContent = wallet.network || "—";
  $("#profile-alias").textContent = wallet.alias ? `@${wallet.alias}` : "—";
  if (wallet.address) renderDepositQr();
}

async function renderDepositQr() {
  await QRCode.toCanvas(
    $("#deposit-qr"),
    JSON.stringify({
      type: "teca-wallet",
      address: wallet.address,
      network: wallet.network,
    }),
    {
      width: 210,
      margin: 1,
      color: { dark: "#30221c", light: "#ffffff" },
    },
  );
}

async function loadBalance() {
  if (balanceLoading || !wallet.sessionId) return null;
  balanceLoading = true;
  if (balance === null) {
    $("#balance-status").textContent = "Consultando saldo...";
  }
  try {
    const previousBalance = balance;
    const result = await api("/balance");
    balance = Number(result.balance) / 1_000_000;
    $("#balance").textContent = money(balance);
    $("#available").textContent = money(balance);
    $("#balance-status").textContent = "";
    validatePayment();
    return previousBalance === null || previousBalance !== balance;
  } catch (error) {
    $("#balance-status").textContent = error.message;
    return null;
  } finally {
    balanceLoading = false;
  }
}

function stopBalanceRefresh() {
  clearTimeout(balanceRefreshTimer);
  balanceRefreshTimer = null;
}

function scheduleBalanceRefresh(delay) {
  stopBalanceRefresh();
  if (!wallet.sessionId || currentScreen !== "home" || document.hidden) return;
  balanceRefreshTimer = setTimeout(refreshBalanceLoop, delay);
}

async function refreshBalanceLoop() {
  if (currentScreen !== "home" || document.hidden) return;

  const changed = await loadBalance();
  let nextDelay;

  if (changed === true) {
    unchangedBalanceChecks = 0;
    nextDelay = 5_000;
  } else if (changed === false) {
    unchangedBalanceChecks += 1;
    nextDelay = unchangedBalanceChecks >= 3 ? 30_000 : 10_000;
  } else {
    nextDelay = 30_000;
  }

  scheduleBalanceRefresh(nextDelay);
}

$("#create-wallet").onclick = async () => {
  const button = $("#create-wallet");
  button.disabled = true;
  button.textContent = "Creando cuenta...";
  $("#create-status").textContent = "";

  try {
    const result = await api("/wallet", {
      method: "POST",
      body: JSON.stringify({}),
    });
    wallet = result;
    pendingSeed = result.seedPhrase;
    console.log("[La Verdadera Teca] Dirección creada:", result.address);
    showWallet();
    showSeedBackup();
    go("backup");
  } catch (error) {
    $("#create-status").textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "Crear cuenta";
  }
};

function showSeedBackup() {
  $("#seed-phrase").innerHTML = pendingSeed
    .split(" ")
    .map(
      (word, index) =>
        `<span class="seed-word"><i>${index + 1}</i>${word}</span>`,
    )
    .join("");
  $("#finish-backup").disabled = true;
  $("#backup-status").classList.remove("ready");
  $("#backup-status").textContent = "Guardá una copia para continuar.";
}

function markBackupSaved(message) {
  $("#finish-backup").disabled = false;
  $("#backup-status").classList.add("ready");
  $("#backup-status").textContent = message;
}

$("#copy-seed").onclick = async () => {
  await navigator.clipboard.writeText(pendingSeed);
  markBackupSaved("Frase copiada. Guardala en un lugar seguro.");
};

$("#download-seed").onclick = () => {
  const content = [
    "La Verdadera Teca - Respaldo de cuenta",
    "",
    `Dirección: ${wallet.address}`,
    `Red: ${wallet.network}`,
    "",
    "Frase de recuperación:",
    pendingSeed,
    "",
    "No compartas este archivo con nadie.",
  ].join("\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "respaldo-la-verdadera-teca.txt";
  link.click();
  URL.revokeObjectURL(url);
  markBackupSaved("Respaldo descargado correctamente.");
};

$("#finish-backup").onclick = async () => {
  delete wallet.seedPhrase;
  delete wallet.imported;
  pendingSeed = "";
  $("#seed-phrase").textContent = "";
  saveWalletSession();
  go("alias-setup");
};

$("#seed-input").oninput = () => {
  const words = $("#seed-input").value.trim().split(/\s+/).filter(Boolean);
  $("#import-button").disabled = words.length < 12;
  $("#import-status").textContent = "";
};

$("#import-button").onclick = async () => {
  const button = $("#import-button");
  button.disabled = true;
  button.textContent = "Importando...";
  $("#import-status").textContent = "";

  try {
    const result = await api("/wallet", {
      method: "POST",
      body: JSON.stringify({ seedPhrase: $("#seed-input").value.trim() }),
    });
    wallet = {
      sessionId: result.sessionId,
      address: result.address,
      network: result.network,
    };
    console.log("[La Verdadera Teca] Dirección importada:", result.address);
    showWallet();
    await continueAfterImport();
  } catch (error) {
    $("#import-status").textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "Importar cuenta";
  }
};

async function continueAfterImport() {
  saveWalletSession();
  try {
    const registered = await api(
      `/alias/by-wallet?address=${encodeURIComponent(wallet.address)}`,
    );
    if (registered?.alias) {
      wallet.alias = registered.alias;
      saveWalletSession();
      showWallet();
      go("home");
      return;
    }
    go("alias-setup");
  } catch (error) {
    go("alias-setup");
    $("#alias-status").textContent = error.message;
  }
}

$("#alias-input").oninput = () => {
  const alias = $("#alias-input").value.trim().toLowerCase();
  $("#alias-input").value = alias.replace(/^@/, "");
  $("#save-alias").disabled = !/^[a-z0-9_]{3,20}$/.test(
    $("#alias-input").value,
  );
  $("#alias-status").textContent = "";
};

$("#save-alias").onclick = async () => {
  const button = $("#save-alias");
  button.disabled = true;
  button.textContent = "Guardando...";
  try {
    const result = await api("/alias", {
      method: "POST",
      body: JSON.stringify({ alias: $("#alias-input").value }),
    });
    wallet.alias = result.alias;
    saveWalletSession();
    showWallet();
    go("home");
  } catch (error) {
    $("#alias-status").textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "Guardar alias";
  }
};

function validatePayment() {
  const recipient = $("#recipient").value.trim();
  paymentAmount = Number($("#amount").value.replace(",", ".")) || 0;
  const validAddress = /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(recipient);
  const validAlias = /^@?[a-z0-9_]{3,20}$/i.test(recipient);
  const insufficient = balance !== null && paymentAmount > balance;
  $("#transfer-error").textContent = insufficient
    ? "Saldo insuficiente"
    : recipient && !validAddress && !validAlias
      ? "Ingresá un alias o dirección válida"
      : "";
  $("#review-payment").disabled =
    (!validAddress && !validAlias) || paymentAmount <= 0 || insufficient;
}

$("#recipient").oninput = validatePayment;
$("#amount").oninput = validatePayment;

window.addEventListener("focus", () => {
  if (currentScreen === "home") scheduleBalanceRefresh(0);
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopBalanceRefresh();
  else if (currentScreen === "home") scheduleBalanceRefresh(0);
});

function readQrAddress(data) {
  try {
    const parsed = JSON.parse(data);
    return parsed.address || "";
  } catch {
    return data.replace(/^teca:/, "").trim();
  }
}

function useScannedQr(data) {
  const address = readQrAddress(data);
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) {
    $("#scanner-status").textContent =
      "El código no contiene una dirección válida.";
    return;
  }
  $("#recipient").value = address;
  validatePayment();
  stopScanner();
  window.history.back();
}

async function stopScanner() {
  if (!qrScanner) return;
  const scanner = qrScanner;
  qrScanner = null;
  await scanner.stop();
  scanner.destroy();
}

$("#start-scanner").onclick = async () => {
  const button = $("#start-scanner");
  button.disabled = true;
  $("#scanner-status").textContent = "Solicitando acceso a la cámara...";
  try {
    await stopScanner();
    qrScanner = new QrScanner(
      $("#qr-video"),
      (result) => useScannedQr(result.data),
      { returnDetailedScanResult: true, highlightScanRegion: true },
    );
    await qrScanner.start();
    $("#scanner-status").textContent = "Cámara activa";
  } catch {
    $("#scanner-status").textContent =
      "No pudimos acceder a la cámara. También podés elegir una imagen.";
  } finally {
    button.disabled = false;
  }
};

$("#qr-file").onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  $("#scanner-status").textContent = "Leyendo código...";
  try {
    const result = await QrScanner.scanImage(file, {
      returnDetailedScanResult: true,
    });
    useScannedQr(result.data);
  } catch {
    $("#scanner-status").textContent =
      "No encontramos un código QR válido en la imagen.";
  }
  event.target.value = "";
};

$("#review-payment").onclick = async () => {
  const recipient = $("#recipient").value.trim();
  $("#review-payment").disabled = true;
  $("#transfer-error").textContent = "Buscando destinatario...";
  try {
    if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(recipient)) {
      paymentRecipientAddress = recipient;
      paymentRecipientLabel = "El destinatario";
      $("#confirm-address").textContent = recipient;
    } else {
      const resolved = await api(
        `/alias/resolve?alias=${encodeURIComponent(recipient)}`,
      );
      paymentRecipientAddress = resolved.address;
      paymentRecipientLabel = `@${resolved.alias}`;
      $("#confirm-address").textContent = paymentRecipientLabel;
    }

    $("#transfer-error").textContent = "Calculando costo de servicio...";
    const totalBaseUnits = BigInt(Math.round(paymentAmount * 1_000_000));
    const quote = await api("/payment/quote", {
      method: "POST",
      body: JSON.stringify({
        recipientAddress: paymentRecipientAddress,
        amount: totalBaseUnits.toString(),
      }),
    });
    const feeBaseUnits = BigInt(quote.fee);
    const netBaseUnits = totalBaseUnits - feeBaseUnits;
    if (netBaseUnits <= 0n) {
      throw new Error("El monto debe ser mayor al costo de servicio.");
    }

    paymentFeeBaseUnits = feeBaseUnits.toString();
    paymentNetBaseUnits = netBaseUnits.toString();
    paymentNetAmount = Number(netBaseUnits) / 1_000_000;
    $("#confirm-amount").textContent = money(paymentAmount);
    $("#confirm-service-cost").textContent = money(
      Number(feeBaseUnits) / 1_000_000,
    );
    $("#confirm-recipient-label").textContent =
      `${paymentRecipientLabel} recibirá`;
    $("#confirm-recipient-amount").textContent = money(paymentNetAmount);
    $("#transfer-error").textContent = "";
    go("confirm");
  } catch (error) {
    $("#transfer-error").textContent = error.message;
  } finally {
    validatePayment();
  }
};

$("#send-payment").onclick = async () => {
  go("processing");
  try {
    const payment = await api("/payment", {
      method: "POST",
      body: JSON.stringify({
        recipientAddress: paymentRecipientAddress,
        amount: paymentNetBaseUnits,
        transferMaxFee: paymentFeeBaseUnits,
      }),
    });
    $("#processing-status").textContent = "Verificando el estado...";
    await api(
      `/payment/status?transactionId=${encodeURIComponent(payment.paymentId)}`,
    );
    $("#processing-status").textContent = "Esperando confirmación...";
    const confirmation = await api("/payment/wait", {
      method: "POST",
      body: JSON.stringify({ transactionId: payment.paymentId }),
    });
    $("#success-amount").textContent = money(paymentNetAmount);
    $("#payment-id").textContent =
      confirmation.onChainTransactionHash || confirmation.paymentId;
    go("success");
    await loadBalance();
  } catch (error) {
    $("#processing-status").textContent = error.message;
  }
};

async function loadActivity() {
  const container = $("#activity-result");
  container.innerHTML = "<b>Cargando...</b>";
  try {
    const transactions = await api("/transactions");
    container.textContent = JSON.stringify(transactions);
  } catch {
    container.innerHTML =
      "<b>Historial no disponible</b><p>WDK todavía no permite consultar la lista de movimientos de esta cuenta.</p>";
  }
}

$$("[data-go]").forEach((button) => {
  button.onclick = () => go(button.dataset.go);
});

$$("[data-back]").forEach((button) => {
  button.onclick = () => window.history.back();
});

window.addEventListener("popstate", (event) => {
  const fallback = wallet.sessionId ? "home" : "welcome";
  go(event.state?.screen || fallback, false);
});

$$(".copy-address").forEach((button) => {
  button.onclick = async () => {
    await navigator.clipboard.writeText(wallet.address);
    const previous = button.textContent;
    button.textContent = "Dirección copiada";
    setTimeout(() => (button.textContent = previous), 1500);
  };
});

async function boot() {
  if (wallet.sessionId && wallet.address) {
    console.log("[La Verdadera Teca] Dirección activa:", wallet.address);
    if (wallet.alias) {
      window.history.replaceState({ screen: "home" }, "");
      go("home", false);
    } else {
      window.history.replaceState({ screen: "alias-setup" }, "");
      go("alias-setup", false);
      await continueAfterImport();
    }
  } else {
    window.history.replaceState({ screen: "welcome" }, "");
    go("welcome", false);
  }
}

boot();
