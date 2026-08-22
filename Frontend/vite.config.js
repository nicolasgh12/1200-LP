import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "vite";
import {
  TRON_NILE_USDT_ADDRESS,
  createWallet,
  getBalance,
  getTransactionStatus,
  getTransactions,
  sendPayment,
  waitForPayment,
} from "../src/wdk/index.ts";

dotenv.config({ path: resolve(import.meta.dirname, "../.env") });

const sessions = new Map();
const json = (response, status, data) => {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(
    JSON.stringify(data, (_, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  );
};

const body = (request) =>
  new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => (data += chunk));
    request.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("Solicitud inválida"));
      }
    });
    request.on("error", reject);
  });

function walletApi() {
  return {
    name: "wallet-api",
    configureServer(server) {
      server.middlewares.use("/api", async (request, response) => {
        const url = new URL(request.url, "http://localhost");

        try {
          if (url.pathname === "/wallet" && request.method === "POST") {
            const wallet = await createWallet({ network: "nile" });
            const sessionId = randomUUID();
            sessions.set(sessionId, wallet);
            console.log(`[wallet] Dirección creada: ${wallet.address}`);
            return json(response, 201, {
              sessionId,
              address: wallet.address,
              network: wallet.network,
            });
          }

          const sessionId = request.headers["x-wallet-session"];
          const wallet = sessions.get(sessionId);
          if (!wallet) return json(response, 401, { error: "Sesión inválida" });

          if (url.pathname === "/balance" && request.method === "GET") {
            const result = await getBalance(
              wallet.account,
              TRON_NILE_USDT_ADDRESS,
            );
            return json(response, 200, result);
          }

          if (url.pathname === "/payment" && request.method === "POST") {
            const input = await body(request);
            const result = await sendPayment(wallet.account, {
              recipientAddress: input.recipientAddress,
              tokenAddress: TRON_NILE_USDT_ADDRESS,
              amount: BigInt(input.amount),
            });
            return json(response, 201, result);
          }

          if (url.pathname === "/payment/status" && request.method === "GET") {
            const result = await getTransactionStatus(
              wallet.account,
              url.searchParams.get("transactionId"),
            );
            return json(response, 200, result);
          }

          if (url.pathname === "/payment/wait" && request.method === "POST") {
            const input = await body(request);
            const result = await waitForPayment(
              wallet.account,
              input.transactionId,
            );
            return json(response, 200, result);
          }

          if (url.pathname === "/transactions" && request.method === "GET") {
            const result = await getTransactions(wallet.account);
            return json(response, 200, result);
          }

          return json(response, 404, { error: "Ruta no encontrada" });
        } catch (error) {
          console.error(`[wallet] ${url.pathname}:`, error);
          return json(response, 500, {
            error: error instanceof Error ? error.message : "Error inesperado",
          });
        }
      });
    },
  };
}

export default defineConfig({ plugins: [walletApi()] });
