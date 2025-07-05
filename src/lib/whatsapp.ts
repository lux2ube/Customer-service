
'use server';

import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode';
import { promises as fs } from 'fs';
import path from 'path';

// This is a simplified in-memory singleton pattern.
// In a serverless environment, this state might be lost between invocations.
// However, with Firebase App Hosting and minInstances > 0, the process can stay warm.
// The session is persisted to disk via LocalAuth, which is the most important part.
let client: Client | null = null;
let status: 'DISCONNECTED' | 'CONNECTING' | 'QR_REQUIRED' | 'CONNECTED' = 'DISCONNECTED';
let qrCodeDataUrl: string | null = null;

const SESSION_DIR = '.wwebjs_auth';

export async function initializeWhatsAppClient() {
    if (client && (status === 'CONNECTING' || status === 'CONNECTED')) {
        console.log('Client already initialized or initializing.');
        return;
    }

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
        console.log('QR Code received. Generating data URL.');
        status = 'QR_REQUIRED';
        qrCodeDataUrl = await qrcode.toDataURL(qr);
        console.log('QR Code data URL is ready.');
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
        console.log('WhatsApp client was disconnected', reason);
        status = 'DISCONNECTED';
        if (client) {
            try {
                await client.destroy();
            } catch (e) {
                console.error("Error destroying client on disconnect:", e);
            }
        }
        client = null;
        qrCodeDataUrl = null;
        // Do NOT clear session data on a regular disconnect.
        // This allows for reconnection without a new QR scan.
    });

    client.on('auth_failure', async (msg) => {
        console.error('AUTHENTICATION FAILURE', msg);
        status = 'DISCONNECTED';
        qrCodeDataUrl = null;
        client = null;
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
        client = null;
        status = 'DISCONNECTED';
    }
}

export async function getWhatsAppClientStatus() {
    // This function purely reports the current state of the singleton.
    return { status, qrCodeDataUrl };
}

export async function sendWhatsAppMessage(toNumber: string, message: string) {
    if (status !== 'CONNECTED' || !client) {
        // Fail fast if the client is not connected.
        // Don't attempt to auto-reconnect here, as it's not a good user experience.
        console.error('Attempted to send message while client is not connected.');
        throw new Error('WhatsApp client is not connected. Please go to the WhatsApp page to connect.');
    }

    try {
        // Format number: +1234567890 -> 1234567890@c.us
        const chatId = `${toNumber.replace(/\D/g, '')}@c.us`;
        const response = await client.sendMessage(chatId, message);
        console.log('Message sent successfully:', response.id.id);
        return { success: true, messageId: response.id.id };
    } catch (error) {
        console.error('Failed to send WhatsApp message:', error);
        throw new Error('Failed to send message. Is the number valid and registered on WhatsApp?');
    }
}
