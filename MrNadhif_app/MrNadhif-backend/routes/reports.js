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
          WHERE LOWER(ir.category) IN ('sunglasses', 'watches', 'wallets', 'keys')
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
      `LOWER(ir.category) IN ('sunglasses', 'watches', 'wallets', 'keys')`
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
      WHERE LOWER(ir.category) IN ('sunglasses', 'watches', 'wallets', 'keys')
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
router.get('/download', async (req, res) => {
  try {
    const { beach } = req.query;

    let condition = '';
    const params = [];

    if (beach) {
      condition = 'WHERE cs.beach_cleaned = $1';
      params.push(beach);
    }

    // 1. SUMMARY DATA
    const summaryQuery = `
      SELECT
        COUNT(*) FILTER (WHERE LOWER(ir.category) = 'plastic') AS plastic,
        COUNT(*) FILTER (WHERE LOWER(ir.category) = 'metal') AS metal,
        COUNT(*) FILTER (
          WHERE LOWER(ir.category) IN ('sunglasses', 'watches', 'wallets', 'keys')
        ) AS valuables,
        COUNT(*) AS total
      FROM item_records ir
      LEFT JOIN cleaning_sessions cs
        ON ir.session_id = cs.session_id
      ${condition}
    `;

    const summaryResult = await pool.query(summaryQuery, params);
    const summary = summaryResult.rows[0];

    const plastic = Number(summary.plastic) || 0;
    const metal = Number(summary.metal) || 0;
    const valuables = Number(summary.valuables) || 0;
    const total = Number(summary.total) || 0;

    // Better weighted score
    const rawScore =
      100
      - (plastic * 2)
      - (metal * 1.5)
      - (valuables * 0.5);

    const score = Math.max(0, rawScore);

    let status = 'Clean';
    if (score < 80) status = 'Moderate Pollution';
    if (score < 50) status = 'Highly Polluted';

    let scoreColor = '#2E8B57';
    if (score < 80) scoreColor = '#F39C12';
    if (score < 50) scoreColor = '#E74C3C';

    // 2. HOTSPOT
    const hotspotQuery = `
      SELECT
        CASE
          WHEN ir.location_lat > 29.35 THEN 'North Zone'
          WHEN ir.location_lat BETWEEN 29.30 AND 29.35 THEN 'Central Zone'
          ELSE 'South Zone'
        END AS zone,
        COUNT(*) AS count
      FROM item_records ir
      LEFT JOIN cleaning_sessions cs
        ON ir.session_id = cs.session_id
      ${condition}
      GROUP BY zone
      ORDER BY count DESC
      LIMIT 1
    `;

    const hotspotResult = await pool.query(hotspotQuery, params);
    const hotspot = hotspotResult.rows[0];

    let mostCommon = 'None';
    const maxCount = Math.max(plastic, metal, valuables);

    if (maxCount > 0) {
      if (maxCount === plastic) mostCommon = 'Plastic';
      else if (maxCount === metal) mostCommon = 'Metal';
      else mostCommon = 'Valuables';
    }

    const percent = (val) => (total ? ((val / total) * 100).toFixed(1) : 0);

    // PDF SETUP
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    const fileName = `report-${(beach || 'all-beaches')
      .replace(/\s+/g, '-')
      .toLowerCase()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    doc.pipe(res);

    // ---------- helpers ----------
    const drawSectionTitle = (title, color = '#0F4C81') => {
      doc.moveDown(0.8);

      doc
        .font('Helvetica-Bold')
        .fontSize(16)
        .fillColor(color)
        .text(title, 50, doc.y, { align: 'left' });

      doc.moveDown(0.2);

      doc
        .strokeColor('#D9E2EC')
        .lineWidth(1)
        .moveTo(50, doc.y)
        .lineTo(545, doc.y)
        .stroke();

      doc.moveDown(0.5);
      doc.fillColor('#1F2937');
    };

    const drawInfoRow = (label, value) => {
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#334E68')
        .text(`${label}: `, 60, doc.y, { continued: true })
        .font('Helvetica')
        .fillColor('#1F2937')
        .text(String(value));

      doc.moveDown(0.15);
    };

    const drawColoredBox = (x, y, w, h, fill, stroke = fill) => {
      doc
        .save()
        .roundedRect(x, y, w, h, 10)
        .fillAndStroke(fill, stroke)
        .restore();
    };

    const drawBarChart = (x, y, chartWidth, barHeight, data) => {
      const maxValue = Math.max(...data.map((d) => d.value), 1);
      const labelWidth = 90;
      const valueWidth = 40;
      const barX = x + labelWidth;
      const maxBarWidth = chartWidth - labelWidth - valueWidth - 20;

      data.forEach((item, index) => {
        const rowY = y + index * 28;
        const barWidth = (item.value / maxValue) * maxBarWidth;

        // label
        doc
          .font('Helvetica-Bold')
          .fontSize(11)
          .fillColor('#334E68')
          .text(item.label, x, rowY + 4, { width: labelWidth });

        // background bar
        doc
          .save()
          .roundedRect(barX, rowY, maxBarWidth, barHeight, 6)
          .fill('#EAF2F8')
          .restore();

        // value bar
        doc
          .save()
          .roundedRect(barX, rowY, Math.max(barWidth, 6), barHeight, 6)
          .fill(item.color)
          .restore();

        // number
        doc
          .font('Helvetica')
          .fontSize(10)
          .fillColor('#1F2937')
          .text(String(item.value), barX + maxBarWidth + 10, rowY + 4, {
            width: valueWidth,
            align: 'left'
          });
      });
    };

    // HEADER
    drawColoredBox(50, 40, 495, 85, '#EAF4FF', '#C7DFF7');

    doc
      .font('Helvetica-Bold')
      .fillColor('#0F4C81')
      .fontSize(22)
      .text('Mr. Nadhif Smart Cleaning Report', 70, 58, {
        width: 455,
        align: 'center',
      });

    doc
      .font('Helvetica')
      .fontSize(12)
      .fillColor('#486581')
      .text(`Beach: ${beach || 'All Beaches'}`, 70, 88, {
        width: 455,
        align: 'center',
      });

    doc
      .fontSize(10)
      .text(`Generated: ${new Date().toLocaleString()}`, 70, 106, {
        width: 455,
        align: 'center',
      });

    doc.moveDown(4);

    // CLEANLINESS SCORE
    drawSectionTitle('Cleanliness Score');

    const scoreBoxY = doc.y;
    drawColoredBox(50, scoreBoxY, 495, 78, '#F8FAFC', '#E2E8F0');

    doc
      .font('Helvetica-Bold')
      .fontSize(22)
      .fillColor(scoreColor)
      .text(`${score.toFixed(0)} / 100`, 70, scoreBoxY + 18, {
        width: 140,
        align: 'left'
      });

    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#334E68')
      .text('Status', 220, scoreBoxY + 20, {
        width: 100,
        align: 'left'
      });

    doc
      .font('Helvetica')
      .fontSize(14)
      .fillColor('#1F2937')
      .text(status, 220, scoreBoxY + 42, {
        width: 180,
        align: 'left'
      });

    doc.y = scoreBoxY + 92;

    // SUMMARY
    drawSectionTitle('Summary');
    drawInfoRow('Total Items', total);
    drawInfoRow('Plastic', plastic);
    drawInfoRow('Metal', metal);
    drawInfoRow('Valuables', valuables);

    // POLLUTION BREAKDOWN
    drawSectionTitle('Pollution Breakdown');
    drawInfoRow('Plastic', `${percent(plastic)}%`);
    drawInfoRow('Metal', `${percent(metal)}%`);
    drawInfoRow('Valuables', `${percent(valuables)}%`);

    // HOTSPOT
    drawSectionTitle('Hotspot Analysis');

    if (hotspot) {
      drawInfoRow('Most Polluted Area', hotspot.zone);
    } else {
      doc
        .font('Helvetica')
        .fontSize(11)
        .fillColor('#7B8794')
        .text('No hotspot data available', 60, doc.y, { align: 'left' });
    }

    // INSIGHTS
    drawSectionTitle('Insights');
    drawInfoRow('Most Common Waste Type', mostCommon);

    // CHART
    drawSectionTitle('Pollution Chart', '#7C3AED');

    const chartBoxY = doc.y;
    drawColoredBox(50, chartBoxY, 495, 120, '#F8FAFF', '#D6E4FF');

    drawBarChart(70, chartBoxY + 20, 440, 16, [
      { label: 'Plastic', value: plastic, color: '#E74C3C' },
      { label: 'Metal', value: metal, color: '#95A5A6' },
      { label: 'Valuables', value: valuables, color: '#9B59B6' },
    ]);

    doc.y = chartBoxY + 135;



    doc.end();
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});


module.exports = router;