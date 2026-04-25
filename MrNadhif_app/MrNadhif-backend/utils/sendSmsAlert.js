// utils/sendSmsAlert.js
const twilio = require('twilio');

const sendSmsAlert = async (message) => {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken  = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_FROM_NUMBER;
    const toNumber   = process.env.ALERT_PHONE_NUMBER;

    // If env vars not set, just log (safe fallback for demo)
    if (!accountSid || !authToken || !fromNumber || !toNumber) {
      console.log('[SMS ALERT - not configured]', message);
      return { success: true };
    }

    const client = twilio(accountSid, authToken);

    await client.messages.create({
      body: `🤖 Mr. Nadhif Robot Alert:\n${message}`,
      from: fromNumber,
      to: toNumber
    });

    console.log('[SMS SENT]', message);
    return { success: true };

  } catch (error) {
    // Never crash the app if SMS fails
    console.error('[SMS FAILED]', error.message);
    return { success: false, error: error.message };
  }
};

module.exports = sendSmsAlert;