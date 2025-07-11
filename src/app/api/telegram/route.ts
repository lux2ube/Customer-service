
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { ref, get, update } from 'firebase/database';
import type { Settings, Client } from '@/lib/types';

// Helper function to send messages back to Telegram
async function sendMessage(botToken: string, chatId: number, text: string, replyMarkup?: any) {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: 'Markdown',
                reply_markup: replyMarkup,
            }),
        });
        if (!response.ok) {
            const errorData = await response.json();
            console.error("Telegram API Error:", errorData);
        }
    } catch (error) {
        console.error("Failed to send Telegram message:", error);
    }
}

// Main handler for POST requests from the Telegram webhook
export async function POST(request: NextRequest) {
    try {
        const settingsSnapshot = await get(ref(db, 'settings'));
        const settings = settingsSnapshot.val() as Settings;
        // Use the token from settings, or the one provided as a fallback.
        const botToken = settings?.telegram_bot_token || "7719960364:AAHs8JUBVhzaHBY3maQtT0uTt_tPrJj9RkI";

        if (!botToken) {
            console.error('Telegram bot token is not configured in settings.');
            return new NextResponse('OK', { status: 200 });
        }
        
        const body = await request.json();
        const message = body.message;

        if (!message || !message.chat || !message.chat.id) {
            // Not a message we can handle, but return 200 to Telegram
            return new NextResponse('OK', { status: 200 });
        }

        const chatId = message.chat.id;
        const fromId = message.from.id;

        // --- Handle user sharing their contact info ---
        if (message.contact) {
             if (message.contact.user_id !== fromId) {
                await sendMessage(botToken, chatId, "❌ Please send your *own* contact number by pressing the button.");
                return new NextResponse('OK', { status: 200 });
            }

            const phoneNumber = message.contact.phone_number.replace(/\+/g, '');

            const clientsSnapshot = await get(ref(db, 'clients'));
            let foundClient: (Client & { id: string }) | null = null;
            
            if (clientsSnapshot.exists()) {
                const clientsData: Record<string, Client> = clientsSnapshot.val();
                for (const clientId in clientsData) {
                    const client = clientsData[clientId];
                    if (!client.phone) continue;

                    const clientPhones = Array.isArray(client.phone) ? client.phone : [client.phone];
                    const cleanedClientPhones = clientPhones.map(p => p.replace(/\+/g, ''));

                    if (cleanedClientPhones.includes(phoneNumber)) {
                        foundClient = { ...client, id: clientId };
                        break;
                    }
                }
            }
            
            if (foundClient) {
                await update(ref(db, `clients/${foundClient.id}`), { telegramChatId: chatId });
                await sendMessage(
                    botToken, 
                    chatId, 
                    `✅ أهلاً بك يا ${foundClient.name}! تم التحقق من حسابك بنجاح.`,
                    {
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
            
            return new NextResponse('OK', { status: 200 });
        }


        // --- Handle the /start command ---
        if (message.text && message.text.toLowerCase() === '/start') {
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
             return new NextResponse('OK', { status: 200 });
        }
        
        // Acknowledge other messages to prevent Telegram from retrying
        return new NextResponse('OK', { status: 200 });

    } catch (error: any) {
        console.error('Telegram Webhook Error:', error.message, error.stack);
        // We send a 200 OK response even on errors to prevent Telegram from retrying.
        return new NextResponse('OK', { status: 200, statusText: 'Internal Server Error' });
    }
}
