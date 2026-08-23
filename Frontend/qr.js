import QrScanner from "qr-scanner";
import QRCode from "qrcode";

let scanner = null;

export function renderWalletQr(canvas, wallet) {
  return QRCode.toCanvas(
    canvas,
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

export function readQrAddress(data) {
  try {
    return JSON.parse(data).address || "";
  } catch {
    return data.replace(/^teca:/, "").trim();
  }
}

export async function startQrScanner(video, onResult) {
  await stopQrScanner();
  scanner = new QrScanner(video, (result) => onResult(result.data), {
    returnDetailedScanResult: true,
    highlightScanRegion: true,
  });
  await scanner.start();
}

export async function stopQrScanner() {
  if (!scanner) return;
  const activeScanner = scanner;
  scanner = null;
  await activeScanner.stop();
  activeScanner.destroy();
}

export async function scanQrImage(file) {
  const result = await QrScanner.scanImage(file, {
    returnDetailedScanResult: true,
  });
  return result.data;
}
