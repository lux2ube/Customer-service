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

async function doesSessionExist() {
    try {
        await fs.access(path.join(process.cwd(), SESSION_DIR));
        return true;
    } catch {
        return false;
    }
}

export async function initializeWhatsAppClient() {
    if (client && status !== 'DISCONNECTED') {
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
        console.log('QR Code received');
        status = 'QR_REQUIRED';
        qrCodeDataUrl = await qrcode.toDataURL(qr);
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
        try {
            await fs.rm(path.join(process.cwd(), SESSION_DIR), { recursive: true, force: true });
            console.log('Cleared WhatsApp session due to disconnection.');
        } catch (error) {
            console.error('Error clearing WhatsApp session:', error);
        }
    });

    try {
        await client.initialize();
    } catch (error) {
        console.error('Failed to initialize WhatsApp client:', error);
        client = null;
        status = 'DISCONNECTED';
    }
}

export async function getWhatsAppClientStatus() {
    if (status === 'DISCONNECTED' && !client && (await doesSessionExist())) {
       console.log("Session exists, but client is disconnected. Attempting to re-initialize.");
       await initializeWhatsAppClient();
       // Give it a moment to reconnect without blocking the user for too long
       await new Promise(resolve => setTimeout(resolve, 3000));
    }
    return { status, qrCodeDataUrl };
}

export async function sendWhatsAppMessage(toNumber: string, message: string) {
    if (status !== 'CONNECTED' || !client) {
        await initializeWhatsAppClient();
        
        console.log("Waiting for client to connect before sending message...");
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        if (status !== 'CONNECTED' || !client) {
            console.error('WhatsApp client not connected after wait. Aborting send.');
            throw new Error('WhatsApp client is not connected. Please connect via the WhatsApp page.');
        }
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
