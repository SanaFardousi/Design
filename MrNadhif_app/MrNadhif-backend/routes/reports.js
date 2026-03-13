const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const PDFDocument = require('pdfkit');


// GET /api/reports/summary
router.get('/summary', async (req, res) => {
  try {
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

    const result = await pool.query(summaryQuery);
    const row = result.rows[0];

    res.json({
      plastic: Number(row.plastic),
      metal: Number(row.metal),
      valuables: Number(row.valuables),
      total: Number(row.total)
    });

  } catch (error) {
    console.error('Error fetching summary:', error);
    res.status(500).json({
      error: 'Failed to fetch report summary'
    });
  }
});


// GET /api/reports/trends
router.get('/trends', async (req, res) => {
  try {
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

    const result = await pool.query(trendsQuery);

    const valuables = [];
    const plastic = [];
    const metal = [];

    result.rows.forEach((row) => {
      const label = row.week_label;

      valuables.push({
        week: label,
        count: Number(row.valuables)
      });

      plastic.push({
        week: label,
        count: Number(row.plastic)
      });

      metal.push({
        week: label,
        count: Number(row.metal)
      });
    });

    res.json({
      valuables,
      plastic,
      metal
    });

  } catch (error) {
    console.error('Error fetching trends:', error);
    res.status(500).json({
      error: 'Failed to fetch report trends'
    });
  }
});

// GET /api/reports/valuables
router.get('/valuables', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ir.*, cs.beach_cleaned
      FROM item_records ir
      LEFT JOIN cleaning_sessions cs ON ir.session_id = cs.session_id
      WHERE LOWER(ir.category) IN ('sunglasses', 'keys', 'wallets')
      ORDER BY ir.timestamp DESC
    `);

    res.json({
      valuables: result.rows
    });

  } catch (error) {
    console.error('Error fetching valuables:', error);
    res.status(500).json({
      error: 'Failed to fetch valuables'
    });
  }
});




router.get('/download', async (req, res) => {
  try {
    // 1) Get summary data
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
    const summary = summaryResult.rows[0];

    // 2) Get bin status
    const binsQuery = `
      SELECT bin_id, label, is_full, updated_at
      FROM bin_status
      WHERE label != 'Other'
      ORDER BY bin_id
    `;

    const binsResult = await pool.query(binsQuery);
    const bins = binsResult.rows;

    // 3) Build PDF
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    const fileName = `pollution-report-${new Date().toISOString().split('T')[0]}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    doc.pipe(res);

    // Title
    doc
      .fontSize(20)
      .text('Pollution Monitoring Report', { align: 'center' });

    doc.moveDown(0.5);

    doc
      .fontSize(10)
      .text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });

    doc.moveDown(2);

    // Summary section
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

    // Bin status section
    doc
      .fontSize(16)
      .text('Bin Status');

    doc.moveDown(0.5);
    doc.fontSize(12);

    bins.forEach((bin) => {
      const status = bin.is_full ? 'Full' : 'Not Full';
      const updatedAt = bin.updated_at
        ? new Date(bin.updated_at).toLocaleString()
        : 'N/A';

      doc.text(`${bin.label} Bin: ${status} (Last updated: ${updatedAt})`);
    });

    doc.moveDown(2);

    // Insights section
    const plasticCount = Number(summary.plastic);
    const metalCount = Number(summary.metal);
    const valuablesCount = Number(summary.valuables);
    const totalCount = Number(summary.total);

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
    doc.text('This report can support later analysis of pollution patterns and waste composition.');

    doc.moveDown(2);

    // Footer note
    doc
      .fontSize(10)
      .text('Generated automatically by the Mr.Nadhif reporting system.', {
        align: 'center'
      });

    doc.end();
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

module.exports = router;