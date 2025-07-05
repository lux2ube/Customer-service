
'use server';

import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';
import qrcode from 'qrcode';
import { promises as fs } from 'fs';
import path from 'path';

// This is a simplified in-memory singleton pattern.
// In a serverless environment, this state might be lost between invocations.
// However, with Firebase App Hosting and minInstances > 0, the process can stay warm.
// The session is persisted to disk via LocalAuth, which is the most important part.
let client: Client | null = null;
let status: 'DISCONNECTED' | 'CONNECTING' | 'GENERATING_QR' | 'QR_REQUIRED' | 'CONNECTED' = 'DISCONNECTED';
let qrCodeDataUrl: string | null = null;

const SESSION_DIR = '.wwebjs_auth';

// Gracefully destroy the client if it exists
async function destroyClient() {
    if (client) {
        console.log("Destroying existing client instance...");
        try {
            await client.destroy();
        } catch (e) {
            console.error("Error destroying client:", e);
        } finally {
            client = null;
        }
    }
}

export async function initializeWhatsAppClient() {
    if (status === 'CONNECTING' || status === 'CONNECTED' || status === 'QR_REQUIRED' || status === 'GENERATING_QR') {
        console.log(`Client is already in a connecting or connected state (${status}). Initialization request ignored.`);
        return;
    }
    
    // Clean up any previous instance before starting a new one
    await destroyClient();

    console.log('Initializing WhatsApp client...');
    status = 'CONNECTING';
    qrCodeDataUrl = null;

    client = new Client({
        authStrategy: new LocalAuth({ dataPath: SESSION_DIR }),
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        },
    });

    client.on('qr', async (qr) => {
        console.log('QR Code received. State is now GENERATING_QR.');
        status = 'GENERATING_QR';
        qrCodeDataUrl = null; // Clear any old QR
        try {
            const dataUrl = await qrcode.toDataURL(qr);
            qrCodeDataUrl = dataUrl;
            status = 'QR_REQUIRED';
            console.log('QR Code is ready. State is now QR_REQUIRED.');
        } catch (e) {
            console.error("Failed to generate QR code data URL", e);
            status = 'DISCONNECTED';
            qrCodeDataUrl = null;
        }
    });

    client.on('ready', () => {
        console.log('WhatsApp client is ready!');
        status = 'CONNECTED';
        qrCodeDataUrl = null;
    });

    client.on('authenticated', () => {
        console.log('WhatsApp client is authenticated!');
        status = 'CONNECTED';
        qrCodeDataUrl = null;
    });

    client.on('disconnected', async (reason) => {
        console.log('WhatsApp client was disconnected.', reason);
        status = 'DISCONNECTED';
        qrCodeDataUrl = null;
        await destroyClient();
    });

    client.on('auth_failure', async (msg) => {
        console.error('AUTHENTICATION FAILURE', msg);
        status = 'DISCONNECTED';
        qrCodeDataUrl = null;
        await destroyClient();
        try {
            // The session is likely corrupt. Delete it to force a new QR scan.
            await fs.rm(path.join(process.cwd(), SESSION_DIR), { recursive: true, force: true });
            console.log('Cleared corrupt WhatsApp session due to auth failure.');
        } catch (error) {
            console.error('Error clearing corrupt session:', error);
        }
    });

    try {
        await client.initialize();
        console.log("Client initialization process started.");
    } catch (error) {
        console.error('Failed to initialize WhatsApp client:', error);
        await destroyClient();
        status = 'DISCONNECTED';
    }
}

export async function getWhatsAppClientStatus() {
    // This function purely reports the current state of the singleton.
    return { status, qrCodeDataUrl };
}

export async function sendWhatsAppMessage(toNumber: string, message: string) {
    if (status !== 'CONNECTED' || !client) {
        console.error('Attempted to send message while client is not connected.');
        throw new Error('WhatsApp client is not connected. Please go to the WhatsApp page to connect.');
    }

    try {
        // Format number: +1234567890 -> 1234567890@c.us
        const chatId = `${toNumber.replace(/\D/g, '')}@c.us`;
        console.log(`Attempting to send message to ${chatId}`);
        const response = await client.sendMessage(chatId, message);
        console.log('Message sent successfully:', response.id.id);
        return { success: true, messageId: response.id.id };
    } catch (error) {
        console.error('Failed to send WhatsApp message:', error);
        throw new Error('Failed to send message. Is the number valid and registered on WhatsApp?');
    }
}

export async function sendWhatsAppMedia(toNumber: string, mediaUrlOrDataUrl: string, caption?: string) {
    if (status !== 'CONNECTED' || !client) {
        console.error('Attempted to send media while client is not connected.');
        throw new Error('WhatsApp client is not connected. Please go to the WhatsApp page to connect.');
    }

    try {
        const chatId = `${toNumber.replace(/\D/g, '')}@c.us`;
        console.log(`Attempting to send media to ${chatId}`);

        let media: MessageMedia;

        if (mediaUrlOrDataUrl.startsWith('data:')) {
            // It's a data URL
            const [meta, data] = mediaUrlOrDataUrl.split(',');
            const mimeType = meta.match(/:(.*?);/)?.[1];
            if (!mimeType || !data) {
                throw new Error("Invalid data URL format.");
            }
            media = new MessageMedia(mimeType, data, 'invoice.png');
        } else {
            // It's a regular URL
            media = await MessageMedia.fromUrl(mediaUrlOrDataUrl, { unsafeMime: true });
        }
        
        const response = await client.sendMessage(chatId, media, { caption: caption });
        console.log('Media sent successfully:', response.id.id);
        return { success: true, messageId: response.id.id };
    } catch (error) {
        console.error('Failed to send WhatsApp media:', error);
        throw new Error('Failed to send media. Check the URL/data and ensure the number is valid.');
    }
}
