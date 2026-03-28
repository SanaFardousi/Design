const express = require('express');

const router = express.Router();

const pool = require('../config/db');

const PDFDocument = require('pdfkit');


// GET /api/reports/summary
// This route returns summary statistics about collected items
router.get('/summary', async (req, res) => {
  try {
    const { beach } = req.query;

    let query = `
      SELECT
        COUNT(*) FILTER (WHERE LOWER(ir.category) = 'plastic') AS plastic,
        COUNT(*) FILTER (WHERE LOWER(ir.category) = 'metal') AS metal,
        COUNT(*) FILTER (
          WHERE LOWER(ir.category) IN ('sunglasses', 'watches', 'wallets')
        ) AS valuables,
        COUNT(*) AS total
      FROM item_records ir
      LEFT JOIN cleaning_sessions cs
        ON ir.session_id = cs.session_id
    `;

    const params = [];

    if (beach) {
      query += ` WHERE cs.beach_cleaned = $1`;
      params.push(beach);
    }

    const result = await pool.query(query, params);
    const row = result.rows[0];

    res.json({
      plastic: Number(row.plastic) || 0,
      metal: Number(row.metal) || 0,
      valuables: Number(row.valuables) || 0,
      total: Number(row.total) || 0
    });

  } catch (error) {
    console.error('Error fetching summary:', error);
    res.status(500).json({ error: 'Failed to fetch report summary' });
  }
});

// GET /api/reports/trends
// Returns weekly trends of detected items
router.get('/trends', async (req, res) => {
  try {
    const { beach } = req.query;

    const getTrendData = async (condition) => {
      let query = `
        SELECT
          TO_CHAR(DATE_TRUNC('week', ir.timestamp), 'DD Mon') AS week,
          COUNT(*)::int AS count
        FROM item_records ir
        LEFT JOIN cleaning_sessions cs
          ON ir.session_id = cs.session_id
        WHERE ${condition}
      `;

      const params = [];

      if (beach) {
        query += ` AND cs.beach_cleaned = $1`;
        params.push(beach);
      }

      query += `
        GROUP BY DATE_TRUNC('week', ir.timestamp)
        ORDER BY DATE_TRUNC('week', ir.timestamp)
      `;

      const result = await pool.query(query, params);
      return result.rows;
    };

    const valuables = await getTrendData(
      `LOWER(ir.category) IN ('sunglasses', 'watches', 'wallets')`
    );

    const plastic = await getTrendData(
      `LOWER(ir.category) = 'plastic'`
    );

    const metal = await getTrendData(
      `LOWER(ir.category) = 'metal'`
    );

    res.json({
      valuables,
      plastic,
      metal
    });

  } catch (error) {
    console.error('Error fetching trends:', error);
    res.status(500).json({ error: 'Failed to fetch report trends' });
  }
});

// GET /api/reports/valuables
// Returns a list of detected valuable items
router.get('/valuables', async (req, res) => {
  try {
    const { beach } = req.query;

    let query = `
      SELECT ir.*, cs.beach_cleaned
      FROM item_records ir
      LEFT JOIN cleaning_sessions cs
        ON ir.session_id = cs.session_id
      WHERE LOWER(ir.category) IN ('sunglasses', 'watches', 'wallets')
    `;

    const params = [];

    if (beach) {
      query += ` AND cs.beach_cleaned = $1`;
      params.push(beach);
    }

    query += ` ORDER BY ir.timestamp DESC`;

    const result = await pool.query(query, params);

    res.json({
      valuables: result.rows
    });

  } catch (error) {
    console.error('Error fetching valuables:', error);
    res.status(500).json({ error: 'Failed to fetch valuables' });
  }
});



// GET /api/reports/download
// Generates a downloadable PDF report
// GET /api/reports/download
// Generates a downloadable PDF report
router.get('/download', async (req, res) => {
  try {
    const { beach } = req.query;

    let condition = '';
    const params = [];

    if (beach) {
      condition = 'WHERE cs.beach_cleaned = $1';
      params.push(beach);
    }

    // Get summary statistics
    const summaryQuery = `
      SELECT
        COUNT(*) FILTER (WHERE LOWER(ir.category) = 'plastic') AS plastic,
        COUNT(*) FILTER (WHERE LOWER(ir.category) = 'metal') AS metal,
        COUNT(*) FILTER (
          WHERE LOWER(ir.category) IN ('sunglasses', 'watches', 'wallets')
        ) AS valuables,
        COUNT(*) AS total
      FROM item_records ir
      LEFT JOIN cleaning_sessions cs
        ON ir.session_id = cs.session_id
      ${condition}
    `;

    const summaryResult = await pool.query(summaryQuery, params);

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

    // Create PDF document
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    // Generate file name with current date
    const safeBeachName = beach
      ? beach.replace(/\s+/g, '-').toLowerCase()
      : 'all-beaches';

    const fileName = `pollution-report-${safeBeachName}-${new Date().toISOString().split('T')[0]}.pdf`;

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

    doc.moveDown(0.5);

    doc
      .fontSize(12)
      .text(
        `Beach: ${beach || 'All Beaches'}`,
        { align: 'center' }
      );

    doc.moveDown(2);

    // Summary Section
    doc
      .fontSize(16)
      .text('Summary');

    doc.moveDown(0.5);

    doc.fontSize(12);
    doc.text(`Plastic items: ${Number(summary.plastic) || 0}`);
    doc.text(`Metal items: ${Number(summary.metal) || 0}`);
    doc.text(`Valuable items: ${Number(summary.valuables) || 0}`);
    doc.text(`Total items found: ${Number(summary.total) || 0}`);

    doc.moveDown(2);

    // Bin Status Section
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

    // Convert values to numbers
    const plasticCount = Number(summary.plastic) || 0;
    const metalCount = Number(summary.metal) || 0;
    const valuablesCount = Number(summary.valuables) || 0;
    const totalCount = Number(summary.total) || 0;

    // Determine the most common category
    let mostCommon = 'None';
    const maxCount = Math.max(plasticCount, metalCount, valuablesCount);

    if (maxCount > 0) {
      if (maxCount === plasticCount) {
        mostCommon = 'Plastic';
      } else if (maxCount === metalCount) {
        mostCommon = 'Metal';
      } else if (maxCount === valuablesCount) {
        mostCommon = 'Valuables';
      }
    }

    doc
      .fontSize(16)
      .text('Insights');

    doc.moveDown(0.5);
    doc.fontSize(12);
    doc.text(`Most common collected category: ${mostCommon}`);
    doc.text(`Total detected items in the dataset: ${totalCount}`);
    doc.text('Extra details will be added soon :)');

    doc.moveDown(2);

    doc
      .fontSize(10)
      .text('Generated automatically by the Mr.Nadhif reporting system.', {
        align: 'center'
      });

    // Finish generating the PDF
    doc.end();

  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});


module.exports = router;