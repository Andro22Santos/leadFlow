import { Router, Request, Response } from 'express';
import { getWhatsAppStatus, getCurrentQR } from '../whatsapp/client';
import { generateQRHTML, generateQRDataURL } from '../whatsapp/qr-handler';

const router = Router();

/**
 * GET /whatsapp/qr
 * Display QR Code page for scanning
 */
router.get('/whatsapp/qr', async (_req: Request, res: Response) => {
  const html = await generateQRHTML();
  res.setHeader('Content-Type', 'text/html');
  return res.send(html);
});

/**
 * GET /whatsapp/qr/image
 * Get QR code as base64 data URL
 */
router.get('/whatsapp/qr/image', async (_req: Request, res: Response) => {
  const dataURL = await generateQRDataURL();
  if (!dataURL) {
    return res.status(404).json({ error: 'No QR code available. Either already connected or still loading.' });
  }
  return res.json({ qr: dataURL });
});

/**
 * GET /whatsapp/status
 * Get WhatsApp connection status
 */
router.get('/whatsapp/status', (_req: Request, res: Response) => {
  const status = getWhatsAppStatus();
  return res.json(status);
});

export default router;
