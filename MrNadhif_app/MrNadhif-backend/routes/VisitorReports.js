const express = require('express');
const { google } = require('googleapis');

const router = express.Router();

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

router.get('/', async (req, res) => {
  try {
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Form Responses 1!A:Z',
    });

    const rows = response.data.values || [];

    if (rows.length === 0) {
      return res.json({
        success: true,
        reports: [],
        formUrl: process.env.VISITOR_FORM_URL,
      });
    }

    const headers = rows[0];
    const reports = rows.slice(1).map((row, index) => {
      const item = {};

      headers.forEach((header, i) => {
        item[header] = row[i] || '';
      });

      return {
        id: index + 1,
        ...item,
      };
    });

    res.json({
      success: true,
      reports,
      formUrl: process.env.VISITOR_FORM_URL,
    });
  } catch (error) {
    console.error('Error fetching visitor reports:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch visitor reports',
    });
  }
});

module.exports = router;