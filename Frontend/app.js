const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const money = (value) =>
  "$ " + value.toLocaleString("es-AR", { minimumFractionDigits: 2 });

let history = ["welcome"];
let balance = null;
let paymentAmount = 0;
let wallet = {
  sessionId: sessionStorage.getItem("walletSessionId"),
  address: sessionStorage.getItem("walletAddress"),
  network: sessionStorage.getItem("walletNetwork"),
};

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
  $$(".screen").forEach((screen) =>
    screen.classList.toggle("active", screen.id === id),
  );
  $("footer").style.display = ["home", "activity", "profile"].includes(id)
    ? "flex"
    : "none";
  $$("footer button").forEach((button) =>
    button.classList.toggle("selected", button.dataset.go === id),
  );
  if (push && history.at(-1) !== id) history.push(id);
  if (id === "activity") loadActivity();
  if (["home", "deposit", "profile"].includes(id)) showWallet();
  scrollTo(0, 0);
}

function showWallet() {
  $("#deposit-address").textContent = wallet.address || "—";
  $("#profile-address").textContent = wallet.address || "—";
  $("#profile-network").textContent = wallet.network || "—";
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
    const result = await api("/wallet", { method: "POST" });
    wallet = result;
    sessionStorage.setItem("walletSessionId", result.sessionId);
    sessionStorage.setItem("walletAddress", result.address);
    sessionStorage.setItem("walletNetwork", result.network);
    console.log("[La Verdadera Teca] Dirección creada:", result.address);
    showWallet();
    go("home");
    await loadBalance();
  } catch (error) {
    $("#create-status").textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "Crear cuenta";
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
  button.onclick = () => {
    history.pop();
    go(history.pop() || "home");
  };
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
  go("home", false);
  loadBalance();
} else {
  go("welcome", false);
}
