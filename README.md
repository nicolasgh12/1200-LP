# Relay

Relay es una billetera web de pagos en USD para el **WDK Track — Gasless** del Aleph Hackathon 2026. Usa Tether WDK sobre TRON Nile para crear o importar una wallet, consultar su saldo y transferir un token TRC-20 sin que la persona tenga que mantener TRX para pagar gas.

La experiencia agrega alias (`@usuario`) y códigos QR para evitar que el usuario tenga que copiar direcciones de blockchain.

> Este repositorio es un prototipo de hackathon. Usá únicamente wallets de prueba y fondos de bajo valor. No importes una frase semilla personal ni una wallet con fondos reales.

## Qué se puede hacer

- Crear una wallet nueva o recuperar una existente con su frase semilla.
- Registrar un alias y resolver el alias de otra wallet.
- Consultar el saldo del token configurado en TRON Nile.
- Depositar mediante dirección o código QR.
- Cotizar la comisión en el mismo token antes de confirmar.
- Enviar pagos gas-free por alias, dirección o QR.
- Esperar la confirmación on-chain y consultar la actividad guardada.

## Red y token de la demo

| Dato | Valor |
| --- | --- |
| Red | TRON Nile testnet |
| Chain ID | `3448148188` |
| RPC | `https://nile.trongrid.io` |
| GasFree API | `https://open-test.gasfree.io/nile` |
| Token TRC-20 de prueba | `TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf` |
| Decimales usados por la interfaz | 6 |

La interfaz está conectada actualmente a Nile. No envíes tokens de otra red a las direcciones generadas por la aplicación.

## Requisitos

- [Node.js 22.18.0](https://nodejs.org/) o posterior.
- npm, incluido con Node.js.
- Una base PostgreSQL accesible mediante una URL de conexión con SSL.
- Credenciales de un proyecto para **TRON Nile** en [GasFree](https://gasfree.io/).
- Fondos del token de prueba configurado para poder ejecutar una transferencia.

## Instalación desde un clon limpio

1. Cloná el repositorio:

   ```bash
   git clone https://github.com/nicolasgh12/1200-LP.git
   cd 1200-LP
   ```

2. Comprobá la versión de Node.js:

   ```bash
   node --version
   ```

   Debe devolver `v22.18.0` o una versión posterior.

3. Instalá las dependencias del módulo WDK y del frontend:

   ```bash
   npm ci
   npm --prefix Frontend ci
   ```

4. Creá el archivo de configuración local:

   ```bash
   cp .env.example .env
   ```

5. Completá `.env` con tus propios valores:

   ```dotenv
   GASFREE_NILE_API_KEY=
   GASFREE_NILE_API_SECRET=
   GASFREE_NILE_SERVICE_PROVIDER=

   DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE
   ```

   | Variable | Descripción |
   | --- | --- |
   | `GASFREE_NILE_API_KEY` | API key del proyecto creado en GasFree para Nile. |
   | `GASFREE_NILE_API_SECRET` | API secret del mismo proyecto. No debe exponerse en el navegador ni subirse a Git. |
   | `GASFREE_NILE_SERVICE_PROVIDER` | Dirección TRON configurada como service provider en GasFree. |
   | `DATABASE_URL` | URL de conexión a PostgreSQL. |

6. Creá las tablas de la aplicación:

   Reemplazá la URL del ejemplo por la misma que cargaste en `.env`:

   ```bash
   psql 'postgresql://USER:PASSWORD@HOST:PORT/DATABASE' -f src/db/schema.sql
   ```

   Si tu proveedor no permite ejecutar `psql` localmente, copiá y ejecutá el contenido de [`src/db/schema.sql`](src/db/schema.sql) en su editor SQL.

7. Verificá el código TypeScript:

   ```bash
   npm run typecheck
   ```

8. Iniciá la aplicación:

   ```bash
   npm start
   ```

9. Abrí [http://localhost:5173](http://localhost:5173) en el navegador.

## Cómo probar el flujo completo

1. Seleccioná **Crear cuenta nueva**.
2. Guardá la frase de recuperación. La aplicación la muestra una sola vez durante el alta.
3. Registrá un alias de 3 a 20 caracteres usando letras minúsculas, números o guion bajo.
4. Desde **Depositar**, copiá la dirección o compartí su QR y fondeala en Nile con el token configurado.
5. Creá una segunda wallet y alias —en otro navegador o sesión— o usá una dirección Nile de destino.
6. Elegí **Transferir**, ingresá el alias, la dirección o escaneá el QR del destinatario y definí el monto.
7. Revisá la cotización: Relay descuenta el costo de servicio del monto total y muestra cuánto recibirá el destinatario.
8. Confirmá la transferencia y esperá la confirmación on-chain. El movimiento quedará visible en **Actividad**.

Las sesiones de wallet se guardan solamente en memoria. Si reiniciás el servidor, importá nuevamente la frase semilla para recuperar la cuenta.

## Integración con WDK

Este proyecto participa en el Track 2 y utiliza el módulo gas-free de TRON como parte central del flujo de pagos:

| Paquete | Versión | Uso |
| --- | --- | --- |
| `@tetherto/wdk-wallet` | `1.0.0-beta.17` | Tipos, estados y errores base de wallet y transacciones. |
| `@tetherto/wdk-wallet-tron-gasfree` | `1.0.0-beta.9` | Wallet TRON gas-free, consulta de saldo, cotización y transferencias. |

Permalinks a la integración evaluable:

- [Creación/importación de la wallet y derivación de la cuenta](https://github.com/nicolasgh12/1200-LP/blob/d8d9d1506a01e9783b0e0513c8f97bbd5ec756e1/src/wdk/wallet.ts#L1-L32)
- [Configuración de TRON Nile y del proveedor GasFree](https://github.com/nicolasgh12/1200-LP/blob/d8d9d1506a01e9783b0e0513c8f97bbd5ec756e1/src/wdk/tron.ts#L5-L71)
- [Cotización, envío y confirmación de pagos](https://github.com/nicolasgh12/1200-LP/blob/d8d9d1506a01e9783b0e0513c8f97bbd5ec756e1/src/wdk/payment.ts#L13-L84)
- [Consulta de saldo del token](https://github.com/nicolasgh12/1200-LP/blob/d8d9d1506a01e9783b0e0513c8f97bbd5ec756e1/src/wdk/balance.ts#L7-L18)
- [Lectura y normalización del estado de una transacción](https://github.com/nicolasgh12/1200-LP/blob/d8d9d1506a01e9783b0e0513c8f97bbd5ec756e1/src/wdk/transactions.ts#L16-L46)
- [Endpoints que conectan la interfaz con WDK](https://github.com/nicolasgh12/1200-LP/blob/d8d9d1506a01e9783b0e0513c8f97bbd5ec756e1/Frontend/vite.config.js#L126-L266)

## Arquitectura

```text
Frontend (Vite)
    │
    ├── /api/wallet, /api/balance, /api/payment
    │          │
    │          └── src/wdk/* ── Tether WDK ── TRON Nile / GasFree
    │
    └── /api/alias, /api/transactions ── PostgreSQL
```

- `Frontend/`: interfaz móvil, cliente HTTP, QR y middleware local de la API.
- `src/wdk/`: adaptación de WDK para crear wallets, consultar saldos y operar pagos gas-free.
- `src/aliases/`: registro y resolución de alias.
- `src/transactions/`: persistencia y consulta de actividad.
- `src/db/schema.sql`: esquema PostgreSQL necesario para ejecutar el proyecto.

## Consideraciones de seguridad

- `.env` está ignorado por Git; mantené allí las credenciales de GasFree y PostgreSQL.
- No publiques API keys, secrets ni frases semilla.
- La frase semilla se envía al servidor local para construir la instancia WDK y la sesión queda en memoria. Esta arquitectura es adecuada para la demo local, no para producción ni para un backend compartido.
- Si exponés el servidor mediante un túnel, cualquier frase importada viajará hasta ese proceso. Usá exclusivamente wallets de prueba.
- WDK está en beta; fijamos versiones exactas para que la instalación sea reproducible.

## Recursos

- [Consigna del WDK Track](https://hacki.crecimiento.build/h/aleph-hackathon-2026/tracks/wdk-track)
- [Documentación de WDK](https://docs.wdk.tether.io/)
- [Wallet TRON GasFree](https://docs.wdk.tether.io/sdk/wallet-modules/wallet-tron-gasfree/)
- [Repositorio oficial de WDK](https://github.com/tetherto/wdk)
