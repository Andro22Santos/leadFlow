import QRCode from 'qrcode';
import { getCurrentQR } from './client';
import { logger } from '../utils/logger';

/**
 * Generate QR code as a data URL (base64 PNG)
 */
export async function generateQRDataURL(): Promise<string | null> {
  const qr = getCurrentQR();
  if (!qr) return null;

  try {
    const dataURL = await QRCode.toDataURL(qr, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });
    return dataURL;
  } catch (error: any) {
    logger.error('Failed to generate QR code image', { error: error.message });
    return null;
  }
}

/**
 * Generate QR code as an HTML page
 */
export async function generateQRHTML(): Promise<string> {
  const dataURL = await generateQRDataURL();

  if (!dataURL) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>LeadFlow - WhatsApp QR Code</title>
        <meta http-equiv="refresh" content="5">
        <style>
          body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #1a1a2e; color: white; }
          .container { text-align: center; padding: 40px; }
          h1 { color: #25D366; }
          .status { color: #ccc; font-size: 18px; margin-top: 20px; }
          .spinner { border: 4px solid #333; border-top: 4px solid #25D366; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 20px auto; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🟢 LeadFlow</h1>
          <div class="spinner"></div>
          <p class="status">Aguardando QR Code...</p>
          <p style="color: #888; font-size: 14px;">A página recarrega automaticamente a cada 5 segundos</p>
        </div>
      </body>
      </html>
    `;
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>LeadFlow - WhatsApp QR Code</title>
      <meta http-equiv="refresh" content="30">
      <style>
        body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #1a1a2e; color: white; }
        .container { text-align: center; padding: 40px; }
        h1 { color: #25D366; }
        .qr-container { background: white; padding: 20px; border-radius: 16px; display: inline-block; margin: 20px 0; }
        .instructions { color: #ccc; font-size: 16px; max-width: 400px; margin: 0 auto; line-height: 1.6; }
        .step { margin: 8px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🟢 LeadFlow</h1>
        <p style="color: #25D366; font-size: 20px;">Escaneie o QR Code com seu WhatsApp</p>
        <div class="qr-container">
          <img src="${dataURL}" alt="QR Code" />
        </div>
        <div class="instructions">
          <p class="step">1️⃣ Abra o WhatsApp no celular</p>
          <p class="step">2️⃣ Toque em <strong>Configurações > Dispositivos conectados</strong></p>
          <p class="step">3️⃣ Toque em <strong>Conectar dispositivo</strong></p>
          <p class="step">4️⃣ Aponte a câmera para este QR Code</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
