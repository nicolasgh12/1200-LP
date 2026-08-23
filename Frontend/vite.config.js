import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import * as bip39 from "bip39";
import dotenv from "dotenv";
import { Pool } from "pg";
import { defineConfig } from "vite";
import {
  TRON_NILE_USDT_ADDRESS,
  createWallet,
  getBalance,
  getTransactionStatus,
  quotePayment,
  sendPayment,
  waitForPayment,
} from "../src/wdk/index.ts";

dotenv.config({ path: resolve(import.meta.dirname, "../.env") });

const cloudflareAllowedHosts =
  process.env.CLOUDFLARE_TUNNEL === "1" ? [".trycloudflare.com"] : [];

const { getActivity, recordPayment } = await import(
  "../src/transactions/index.ts"
);

const sessions = new Map();
const pendingPayments = new Map();
let database;

const getDatabase = () => {
  if (!process.env.DATABASE_URL) throw new Error("Missing DATABASE_URL");
  database ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  return database;
};

const normalizeAlias = (alias = "") =>
  String(alias ?? "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "");

const findByAlias = async (alias) => {
  const result = await getDatabase().query(
    `SELECT u.alias, w.address
     FROM users u JOIN wallet w ON w.user_alias = u.alias
     WHERE u.alias = $1 LIMIT 1`,
    [normalizeAlias(alias)],
  );
  return result.rows[0] ?? null;
};

const findByWallet = async (address) => {
  const result = await getDatabase().query(
    `SELECT u.alias, w.address
     FROM users u JOIN wallet w ON w.user_alias = u.alias
     WHERE w.address = $1 LIMIT 1`,
    [address],
  );
  return result.rows[0] ?? null;
};

const registerAlias = async (alias, address) => {
  const normalized = normalizeAlias(alias);
  if (!/^[a-z0-9_]{3,20}$/.test(normalized)) {
    throw new Error(
      "El alias debe tener entre 3 y 20 letras, números o guiones bajos.",
    );
  }
  if (await findByAlias(normalized))
    throw new Error("El alias ya está en uso.");
  const existingWallet = await findByWallet(address);
  if (existingWallet) return existingWallet;

  const client = await getDatabase().connect();
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO users (alias) VALUES ($1)", [normalized]);
    await client.query(
      "INSERT INTO wallet (user_alias, address) VALUES ($1, $2)",
      [normalized, address],
    );
    await client.query("COMMIT");
    return { alias: normalized, address };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
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
            const input = await body(request);
            const seedPhrase = input.seedPhrase?.trim() || undefined;
            if (seedPhrase && !bip39.validateMnemonic(seedPhrase)) {
              return json(response, 400, {
                error: "La frase de recuperación no es válida.",
              });
            }
            const wallet = await createWallet({ network: "nile", seedPhrase });
            const sessionId = randomUUID();
            sessions.set(sessionId, wallet);
            console.log(`[wallet] Dirección creada: ${wallet.address}`);
            response.setHeader("Cache-Control", "no-store");
            return json(response, 201, {
              sessionId,
              address: wallet.address,
              network: wallet.network,
              imported: Boolean(seedPhrase),
              ...(seedPhrase ? {} : { seedPhrase: wallet.seedPhrase }),
            });
          }

          const sessionId = request.headers["x-wallet-session"];
          const wallet = sessions.get(sessionId);
          if (!wallet) return json(response, 401, { error: "Sesión inválida" });

          if (url.pathname === "/alias/by-wallet" && request.method === "GET") {
            const result = await findByWallet(url.searchParams.get("address"));
            return json(response, 200, result);
          }

          if (url.pathname === "/alias/resolve" && request.method === "GET") {
            const result = await findByAlias(url.searchParams.get("alias"));
            return json(
              response,
              result ? 200 : 404,
              result ?? { error: "Alias no encontrado" },
            );
          }

          if (url.pathname === "/alias" && request.method === "POST") {
            const input = await body(request);
            const result = await registerAlias(input.alias, wallet.address);
            return json(response, 201, result);
          }

          if (url.pathname === "/balance" && request.method === "GET") {
            const result = await getBalance(
              wallet.account,
              TRON_NILE_USDT_ADDRESS,
            );
            return json(response, 200, result);
          }

          if (url.pathname === "/payment/quote" && request.method === "POST") {
            const input = await body(request);
            if (input.recipientAddress === wallet.address) {
              return json(response, 400, {
                error: "No podés transferirte dinero a tu propia cuenta",
              });
            }
            const result = await quotePayment(wallet.account, {
              recipientAddress: input.recipientAddress,
              tokenAddress: TRON_NILE_USDT_ADDRESS,
              amount: BigInt(input.amount),
            });
            return json(response, 200, result);
          }

          if (url.pathname === "/payment" && request.method === "POST") {
            const input = await body(request);
            if (input.recipientAddress === wallet.address) {
              return json(response, 400, {
                error: "No podés transferirte dinero a tu propia cuenta",
              });
            }
            const result = await sendPayment(wallet.account, {
              recipientAddress: input.recipientAddress,
              tokenAddress: TRON_NILE_USDT_ADDRESS,
              amount: BigInt(input.amount),
              transferMaxFee: input.transferMaxFee
                ? BigInt(input.transferMaxFee)
                : undefined,
            });
            pendingPayments.set(result.paymentId, {
              senderAddress: wallet.address,
              recipientAddress: input.recipientAddress,
              amount: BigInt(input.amount),
              fee: input.transferMaxFee ? BigInt(input.transferMaxFee) : 0n,
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

            const pendingPayment = pendingPayments.get(input.transactionId);
            if (pendingPayment) {
              try {
                const user = await findByWallet(wallet.address);
                if (!user) throw new Error("La wallet no tiene alias");
                await recordPayment({
                  userAlias: user.alias,
                  paymentId: input.transactionId,
                  blockchainHash: result.onChainTransactionHash,
                  tokenAddress: TRON_NILE_USDT_ADDRESS,
                  ...pendingPayment,
                });
                pendingPayments.delete(input.transactionId);
              } catch (error) {
                console.error(
                  `[wallet] No se pudo guardar ${input.transactionId}:`,
                  error,
                );
              }
            }

            return json(response, 200, result);
          }

          if (url.pathname === "/transactions" && request.method === "GET") {
            const user = await findByWallet(wallet.address);
            if (!user) {
              return json(response, 404, {
                error: "La wallet no tiene un alias registrado",
              });
            }
            const result = await getActivity(user.alias);
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

export default defineConfig({
  plugins: [walletApi()],
  server: {
    allowedHosts: cloudflareAllowedHosts,
  },
});
