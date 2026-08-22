import QrScanner from "qr-scanner";
import QRCode from "qrcode";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const money = (value) =>
  "$ " + value.toLocaleString("es-AR", { minimumFractionDigits: 2 });

let currentScreen = "welcome";
let balance = null;
let paymentAmount = 0;
let pendingSeed = "";
let qrScanner = null;
let wallet = {
  sessionId: sessionStorage.getItem("walletSessionId"),
  address: sessionStorage.getItem("walletAddress"),
  network: sessionStorage.getItem("walletNetwork"),
};

function saveWalletSession() {
  sessionStorage.setItem("walletSessionId", wallet.sessionId);
  sessionStorage.setItem("walletAddress", wallet.address);
  sessionStorage.setItem("walletNetwork", wallet.network);
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
  scrollTo(0, 0);
}

function showWallet() {
  $("#deposit-address").textContent = wallet.address || "—";
  $("#profile-address").textContent = wallet.address || "—";
  $("#profile-network").textContent = wallet.network || "—";
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
  $("#balance-status").textContent = "Consultando saldo...";
  try {
    const result = await api("/balance");
    balance = Number(result.balance) / 1_000_000;
    $("#balance").textContent = money(balance);
    $("#available").textContent = money(balance);
    $("#balance-status").textContent = "";
    validatePayment();
  } catch (error) {
    $("#balance-status").textContent = error.message;
  }
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
  go("home");
  await loadBalance();
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
    saveWalletSession();
    console.log("[La Verdadera Teca] Dirección importada:", result.address);
    showWallet();
    go("home");
    await loadBalance();
  } catch (error) {
    $("#import-status").textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "Importar cuenta";
  }
};

function validatePayment() {
  const recipient = $("#recipient").value.trim();
  paymentAmount = Number($("#amount").value.replace(",", ".")) || 0;
  const invalidAddress = !recipient;
  const insufficient = balance !== null && paymentAmount > balance;
  $("#transfer-error").textContent = insufficient ? "Saldo insuficiente" : "";
  $("#review-payment").disabled =
    invalidAddress || paymentAmount <= 0 || insufficient;
}

$("#recipient").oninput = validatePayment;
$("#amount").oninput = validatePayment;
$("#refresh-balance").onclick = loadBalance;

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

$("#review-payment").onclick = () => {
  $("#confirm-address").textContent = $("#recipient").value.trim();
  $("#confirm-amount").textContent = money(paymentAmount);
  $("#confirm-total").textContent = money(paymentAmount);
  go("confirm");
};

$("#send-payment").onclick = async () => {
  go("processing");
  try {
    const payment = await api("/payment", {
      method: "POST",
      body: JSON.stringify({
        recipientAddress: $("#recipient").value.trim(),
        amount: String(Math.round(paymentAmount * 1_000_000)),
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
    $("#success-amount").textContent = money(paymentAmount);
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

if (wallet.sessionId && wallet.address) {
  console.log("[La Verdadera Teca] Dirección activa:", wallet.address);
  window.history.replaceState({ screen: "home" }, "");
  go("home", false);
  loadBalance();
} else {
  window.history.replaceState({ screen: "welcome" }, "");
  go("welcome", false);
}
