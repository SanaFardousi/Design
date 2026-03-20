const express = require('express');

const router = express.Router();

const pool = require('../config/db');

const PDFDocument = require('pdfkit');


// GET /api/reports/summary
// This route returns summary statistics about collected items
router.get('/summary', async (req, res) => {
  try {

    // SQL query to count items by category
    const summaryQuery = `
      SELECT
        COUNT(*) FILTER (WHERE LOWER(category) = 'plastic') AS plastic,
        COUNT(*) FILTER (WHERE LOWER(category) = 'metal') AS metal,
        COUNT(*) FILTER (
          WHERE LOWER(category) IN ('sunglasses', 'watches', 'wallets')
        ) AS valuables,
        COUNT(*) AS total
      FROM item_records
    `;

    // Execute the SQL query
    const result = await pool.query(summaryQuery);

    // Extract the first row from the result
    const row = result.rows[0];

    // Send the summary statistics as JSON response
    res.json({
      plastic: Number(row.plastic),
      metal: Number(row.metal),
      valuables: Number(row.valuables),
      total: Number(row.total)
    });

  } catch (error) {

    // Log the error in the server console
    console.error('Error fetching summary:', error);

    // Return server error response
    res.status(500).json({
      error: 'Failed to fetch report summary'
    });
  }
});

// GET /api/reports/trends
// Returns weekly trends of detected items
router.get('/trends', async (req, res) => {
  try {

    // SQL query to generate weekly statistics for the past 4 weeks
    const trendsQuery = `
      WITH weeks AS (
        SELECT generate_series(
          date_trunc('week', CURRENT_DATE - INTERVAL '28 days'),
          date_trunc('week', CURRENT_DATE),
          INTERVAL '1 week'
        )::date AS week_start
      )
      SELECT
        w.week_start,
        TO_CHAR(w.week_start, 'DD Mon') AS week_label,
        COUNT(*) FILTER (
          WHERE date_trunc('week', ir."timestamp")::date = w.week_start
          AND LOWER(ir.category) = 'plastic'
        ) AS plastic,
        COUNT(*) FILTER (
          WHERE date_trunc('week', ir."timestamp")::date = w.week_start
          AND LOWER(ir.category) = 'metal'
        ) AS metal,
        COUNT(*) FILTER (
          WHERE date_trunc('week', ir."timestamp")::date = w.week_start
          AND LOWER(ir.category) IN ('sunglasses', 'keys', 'wallets')
        ) AS valuables
      FROM weeks w
      LEFT JOIN item_records ir
        ON date_trunc('week', ir."timestamp")::date = w.week_start
      GROUP BY w.week_start
      ORDER BY w.week_start ASC
    `;

    // Run the SQL query
    const result = await pool.query(trendsQuery);

    // Arrays to store formatted trend data
    const valuables = [];
    const plastic = [];
    const metal = [];

    // Loop through each row returned from the database
    result.rows.forEach((row) => {

      // Get the formatted week label
      const label = row.week_label;

      // Push valuables trend data
      valuables.push({
        week: label,
        count: Number(row.valuables)
      });

      // Push plastic trend data
      plastic.push({
        week: label,
        count: Number(row.plastic)
      });

      // Push metal trend data
      metal.push({
        week: label,
        count: Number(row.metal)
      });
    });

    // Send the formatted trend data to the frontend
    res.json({
      valuables,
      plastic,
      metal
    });

  } catch (error) {

    // Log error
    console.error('Error fetching trends:', error);

    // Send error response
    res.status(500).json({
      error: 'Failed to fetch report trends'
    });
  }
});

// GET /api/reports/valuables
// Returns a list of detected valuable items
router.get('/valuables', async (req, res) => {
  try {

    // Query valuables items with cleaning session information
    const result = await pool.query(`
      SELECT ir.*, cs.beach_cleaned
      FROM item_records ir
      LEFT JOIN cleaning_sessions cs ON ir.session_id = cs.session_id
      WHERE LOWER(ir.category) IN ('sunglasses', 'keys', 'wallets')
      ORDER BY ir.timestamp DESC
    `);

    // Return valuables list
    res.json({
      valuables: result.rows
    });

  } catch (error) {

    // Log error
    console.error('Error fetching valuables:', error);

    // Send error response
    res.status(500).json({
      error: 'Failed to fetch valuables'
    });
  }
});



// GET /api/reports/download
// Generates a downloadable PDF report
router.get('/download', async (req, res) => {
  try {

    //Get summary statistics
    const summaryQuery = `
      SELECT
        COUNT(*) FILTER (WHERE LOWER(category) = 'plastic') AS plastic,
        COUNT(*) FILTER (WHERE LOWER(category) = 'metal') AS metal,
        COUNT(*) FILTER (
          WHERE LOWER(category) IN ('sunglasses', 'keys', 'wallets')
        ) AS valuables,
        COUNT(*) AS total
      FROM item_records
    `;

    const summaryResult = await pool.query(summaryQuery);

    // Extract summary data
    const summary = summaryResult.rows[0];


    // Step 2: Get bin status data
    const binsQuery = `
      SELECT bin_id, label, is_full, updated_at
      FROM bin_status
      WHERE label != 'Other'
      ORDER BY bin_id
    `;

    const binsResult = await pool.query(binsQuery);

    const bins = binsResult.rows;


    //Create PDF document
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    // Generate file name with current date
    const fileName = `pollution-report-${new Date().toISOString().split('T')[0]}.pdf`;

    // Tell browser this is a PDF file
    res.setHeader('Content-Type', 'application/pdf');

    // Force file download
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    // Pipe PDF output to response
    doc.pipe(res);


    // PDF Title Section
    doc
      .fontSize(20)
      .text('Pollution Monitoring Report', { align: 'center' });

    doc.moveDown(0.5);

    doc
      .fontSize(10)
      .text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });

    doc.moveDown(2);


    // Summary Section
    doc
      .fontSize(16)
      .text('Summary');

    doc.moveDown(0.5);

    doc.fontSize(12);
    doc.text(`Plastic items: ${Number(summary.plastic)}`);
    doc.text(`Metal items: ${Number(summary.metal)}`);
    doc.text(`Valuable items: ${Number(summary.valuables)}`);
    doc.text(`Total items found: ${Number(summary.total)}`);

    doc.moveDown(2);


    // Bin Status Section
    doc
      .fontSize(16)
      .text('Bin Status');

    doc.moveDown(0.5);
    doc.fontSize(12);

    // Loop through bins and print their status
    bins.forEach((bin) => {

      // Determine if bin is full
      const status = bin.is_full ? 'Full' : 'Not Full';

      // Format last update time
      const updatedAt = bin.updated_at
        ? new Date(bin.updated_at).toLocaleString()
        : 'N/A';

      doc.text(`${bin.label} Bin: ${status} (Last updated: ${updatedAt})`);
    });

    doc.moveDown(2);

    // Convert values to numbers
    const plasticCount = Number(summary.plastic);
    const metalCount = Number(summary.metal);
    const valuablesCount = Number(summary.valuables);
    const totalCount = Number(summary.total);

    // Determine the most common category
    let mostCommon = 'None';
    const maxCount = Math.max(plasticCount, metalCount, valuablesCount);

    if (maxCount === plasticCount) {
      mostCommon = 'Plastic';
    } else if (maxCount === metalCount) {
      mostCommon = 'Metal';
    } else if (maxCount === valuablesCount) {
      mostCommon = 'Valuables';
    }

    doc
      .fontSize(16)
      .text('Insights');

    doc.moveDown(0.5);
    doc.fontSize(12);
    doc.text(`Most common collected category: ${mostCommon}`);
    doc.text(`Total detected items in the dataset: ${totalCount}`);
    doc.text('Extra details will be added soon:)');
    doc.moveDown(2);

    doc
      .fontSize(10)
      .text('Generated automatically by the Mr.Nadhif reporting system.', {
        align: 'center'
      });

    // Finish generating the PDF
    doc.end();

  } catch (error) {

    // Log error if report generation fails
    console.error('Error generating report:', error);

    res.status(500).json({ error: 'Failed to generate report' });
  }
});


module.exports = router;