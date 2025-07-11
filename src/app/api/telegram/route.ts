
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { ref, get, update } from 'firebase/database';
import type { Settings, Client } from '@/lib/types';

// Helper function to send messages back to Telegram
async function sendMessage(botToken: string, chatId: number, text: string, replyMarkup?: any) {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            chat_id: chatId,
            text,
            reply_markup: replyMarkup,
        }),
    });
    if (!response.ok) {
        console.error("Telegram API Error:", await response.json());
    }
}

// Main handler for POST requests from the Telegram webhook
export async function POST(request: NextRequest) {
    try {
        const settingsSnapshot = await get(ref(db, 'settings'));
        if (!settingsSnapshot.exists()) {
            throw new Error('Bot settings not found in the database.');
        }
        const settings = settingsSnapshot.val() as Settings;
        const botToken = settings.telegram_bot_token;

        if (!botToken) {
            throw new Error('Telegram bot token is not configured in settings.');
        }
        
        const body = await request.json();
        const message = body.message;

        if (!message || !message.chat || !message.chat.id) {
            return NextResponse.json({ status: 'ok', message: 'No message found' });
        }

        const chatId = message.chat.id;
        const text = message.text;

        // --- Handle user sharing their contact info ---
        if (message.contact && message.contact.phone_number) {
            const phoneNumber = message.contact.phone_number.replace(/\+/g, '').replace(/\s/g, ''); // Clean the number

            // Fetch all clients, then filter in code. This is necessary because Firebase RTDB can't query array contents.
            const clientsSnapshot = await get(ref(db, 'clients'));
            
            let foundClient: (Client & { id: string }) | null = null;
            if (clientsSnapshot.exists()) {
                const clientsData: Record<string, Client> = clientsSnapshot.val();
                for (const clientId in clientsData) {
                    const client = clientsData[clientId];
                    if (!client.phone) continue;

                    const clientPhones = Array.isArray(client.phone) ? client.phone : [client.phone];
                    const cleanedClientPhones = clientPhones.map(p => p.replace(/\+/g, '').replace(/\s/g, ''));

                    if (cleanedClientPhones.includes(phoneNumber)) {
                        foundClient = { ...client, id: clientId };
                        break;
                    }
                }
            }

            if (foundClient) {
                // Link the Telegram Chat ID to the client profile for future use
                await update(ref(db, `clients/${foundClient.id}`), { telegramChatId: chatId });
                
                await sendMessage(
                    botToken, 
                    chatId, 
                    `أهلاً بك يا ${foundClient.name}! تم التحقق من حسابك بنجاح.`,
                    {
                        // Remove the special keyboard and show inline buttons for actions
                        remove_keyboard: true,
                        inline_keyboard: [
                            [{ text: "💰 إيداع (Deposit)", callback_data: "deposit" }],
                            [{ text: "💸 سحب (Withdraw)", callback_data: "withdraw" }],
                        ]
                    }
                );
            } else {
                await sendMessage(botToken, chatId, "عفواً، رقم هاتفك غير مسجل لدينا في النظام.");
            }
            return NextResponse.json({ status: 'ok' });
        }

        // --- Handle the /start command ---
        if (text && text.toLowerCase() === '/start') {
            await sendMessage(
                botToken,
                chatId,
                'أهلاً بك في نظامنا! للتحقق من هويتك، يرجى مشاركة رقم هاتفك المسجل لدينا بالضغط على الزر أدناه.',
                {
                    keyboard: [
                        [{ text: '🔒 مشاركة رقم الهاتف', request_contact: true }],
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: true,
                }
            );
            return NextResponse.json({ status: 'ok' });
        }

        return NextResponse.json({ status: 'ok', message: 'Unhandled message type' });

    } catch (error: any) {
        console.error('Telegram Webhook Error:', error.message, error.stack);
        // We send a 200 OK response even on errors to prevent Telegram from retrying.
        return NextResponse.json({ status: 'error', message: error.message });
    }
}
