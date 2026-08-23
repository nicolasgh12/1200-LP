async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-wallet-session": sessionStorage.getItem("walletSessionId") || "",
      ...options.headers,
    },
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || "La operación falló");
    error.status = response.status;
    throw error;
  }
  return result;
}

const post = (path, data) =>
  request(path, {
    method: "POST",
    body: JSON.stringify(data),
  });

export const createWallet = (seedPhrase) =>
  post("/wallet", seedPhrase ? { seedPhrase } : {});

export const getBalance = () => request("/balance");

export const identifyWallet = (address) =>
  request(`/alias/by-wallet?address=${encodeURIComponent(address)}`);

export const resolveAlias = (alias) =>
  request(`/alias/resolve?alias=${encodeURIComponent(alias)}`);

export const registerAlias = (alias) => post("/alias", { alias });

export const quotePayment = (recipientAddress, amount) =>
  post("/payment/quote", { recipientAddress, amount });

export const sendPayment = (
  recipientAddress,
  amount,
  transferMaxFee,
) =>
  post("/payment", { recipientAddress, amount, transferMaxFee });

export const getPaymentStatus = (transactionId) =>
  request(
    `/payment/status?transactionId=${encodeURIComponent(transactionId)}`,
  );

export const waitForPayment = (transactionId) =>
  post("/payment/wait", { transactionId });

export const getTransactions = () => request("/transactions");
