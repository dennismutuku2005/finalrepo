const fs = require('fs');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { Api } = require('telegram');
const input = require('input');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Replace these with your actual API credentials from Telegram
const api_id = 28205301;
const api_hash = 'b0fddf704ea08516edc1c7e83bc3728e';

// Bot token (get this from @BotFather on Telegram)
const botToken = '8195166190:AAEzqwcuPvJatBHt_T1T3deXg3yizRCcGfI';
const bot = new TelegramBot(botToken, { polling: true });

let sessionString = '';
try {
  sessionString = fs.readFileSync('session.txt', 'utf8');
} catch (err) {
  console.log('No previous session found, starting a new login session...');
}

const stringSession = new StringSession(sessionString);

const generateBasicAuthToken = () => {
  const apiUsername = '0hsXykykIC9lX7D7omlq';
  const apiPassword = 'HPEBjDHxA0bWmzCvwlKmrML0Pxu5N2bQfLpvbq6f';
  
  const credentials = `${apiUsername}:${apiPassword}`;
  return 'Basic ' + Buffer.from(credentials).toString('base64');
};

// API endpoints
const paymentUrl = 'https://backend.payhero.co.ke/api/v2/payments';
const statusUrl = 'https://backend.payhero.co.ke/api/v2/transaction-status';

// Initialize Telegram Client
(async () => {
  console.log('Loading Telegram client...');
  const client = new TelegramClient(stringSession, api_id, api_hash, {
    connectionRetries: 5,
  });

  if (!sessionString) {
    await client.start({
      phoneNumber: async () => await input.text('Enter your phone number: '),
      password: async () => await input.text('Enter your password (if 2FA is enabled): '),
      phoneCode: async () => await input.text('Enter the code you received: '),
      onError: (err) => console.log(err),
    });
    console.log('You are now logged in!');
    fs.writeFileSync('session.txt', client.session.save(), 'utf8');
    console.log('Session string saved to session.txt');
  } else {
    await client.connect();
    console.log('Logged in using saved session!');
  }

  // Main menu with custom inline keyboard
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    const paymentOptions = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '2 minutes - Ksh 6', callback_data: '6,2' },
            { text: '3 minutes - Ksh 10', callback_data: '10,3' }
          ],
          [
            { text: '5 minutes - Ksh 15', callback_data: '15,5' },
            { text: '20 minutes - Ksh 30', callback_data: '30,20' }
          ],
          [
            { text: '1.5 hours - Ksh 50', callback_data: '50,90' }
          ],
          [{ text: 'Cancel', callback_data: 'cancel' }]
        ],
      },
    };

    bot.sendMessage(chatId, 'Welcome to the Premium Xpose Channel Manager! Choose a time plan to proceed with payment:', paymentOptions);
  });

  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const selectedData = query.data.split(',');
    const amount = parseInt(selectedData[0]);
    const duration = parseInt(selectedData[1]);

    if (selectedData[0] === 'cancel') {
      return bot.sendMessage(chatId, 'You have canceled the action. Type /start to begin again.');
    }

    // Request for the user to enter their mobile number
    bot.sendMessage(chatId, 'Please enter your mobile number to proceed with payment');
    bot.once('message', async (message) => {
      const userPhoneNumber = message.text;

      // Initiate payment request
      const basicAuthToken = generateBasicAuthToken();
      const requestBody = {
        amount: amount,
        phone_number: userPhoneNumber,
        channel_id: 1045,
        provider: 'm-pesa',
        external_reference: `INV-${new Date().getTime()}`, // Unique invoice reference
        callback_url: 'https://finalrepo-9u6d.onrender.com/payment-callback', // Replace with your actual callback URL
      };

      try {
        const response = await axios.post(paymentUrl, requestBody, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': basicAuthToken
          }
        });

        const reference = response.data.reference;
        if (reference) {
          bot.sendMessage(chatId, `Payment request has been sent. Please complete the payment.`);
          await fetchTransactionStatus(reference, chatId, client, amount, duration);
        } else {
          bot.sendMessage(chatId, 'Payment request failed. Please try again later.');
        }
      } catch (error) {
        console.error('Error initiating payment:', error.response ? error.response.data : error.message);
        bot.sendMessage(chatId, 'Payment STK push failed');
      }
    });
  });
})();

// Function to check transaction status
async function fetchTransactionStatus(reference, chatId, client, amount, duration) {
  const authToken = generateBasicAuthToken();
  const url = `${statusUrl}?reference=${reference}`;

  let attemptCount = 0;
  let maxAttempts = 10;

  while (attemptCount < maxAttempts) {
    try {
      const response = await axios.get(url, {
        headers: { 'Authorization': authToken }
      });

      const data = response.data;

      if (data.status === 'SUCCESS') {
        bot.sendMessage(chatId, 'Payment successful! You now have access to the channel.');
        break;
      } else if (data.status === 'FAILED') {
        bot.sendMessage(chatId, 'Payment failed. Please try again.');
        break;
      } else if (data.status === 'QUEUED') {
        // Retry after waiting a few seconds
        attemptCount++;
        if (attemptCount === maxAttempts) {
          bot.sendMessage(chatId, 'Payment still queued. Please check your payment status later.');
        }
        await new Promise(resolve => setTimeout(resolve, 3000));
      } else {
        bot.sendMessage(chatId, 'Unknown transaction status.');
        break;
      }
    } catch (error) {
      console.error('Error fetching transaction status:', error);
      bot.sendMessage(chatId, 'Error occurred while checking payment status.');
      break;
    }
  }
}

// Express to handle callback
app.use(express.json()); // For parsing application/json
app.post('/payment-callback', (req, res) => {
  const callbackData = req.body;
  console.log('Received callback data:', callbackData);
  // Here you can process the callback data as needed
  res.send({ status: 'received' });
});

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
