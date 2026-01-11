import { createObjectCsvWriter } from 'csv-writer';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { Response } from 'express';
import fs from 'fs';
import path from 'path';

/**
 * Export data to CSV format
 */
export async function exportToCSV(
  data: any[],
  headers: { id: string; title: string }[],
  filename: string,
  res: Response
) {
  try {
    // Create temp file path
    const tempFilePath = path.join('/tmp', `${filename}.csv`);
    
    // Create CSV writer
    const csvWriter = createObjectCsvWriter({
      path: tempFilePath,
      header: headers
    });
    
    // Write data
    await csvWriter.writeRecords(data);
    
    // Send file
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    
    const fileStream = fs.createReadStream(tempFilePath);
    fileStream.pipe(res);
    
    // Clean up temp file after sending
    fileStream.on('end', () => {
      fs.unlinkSync(tempFilePath);
    });
  } catch (error) {
    throw new Error(`CSV export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Export data to Excel format
 */
export async function exportToExcel(
  data: any[],
  headers: { key: string; header: string; width?: number }[],
  filename: string,
  sheetName: string,
  res: Response
) {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(sheetName);
    
    // Add columns
    worksheet.columns = headers;
    
    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };
    
    // Add data rows
    data.forEach(item => {
      worksheet.addRow(item);
    });
    
    // Auto-fit columns
    worksheet.columns.forEach(column => {
      if (!column.width) {
        column.width = 15;
      }
    });
    
    // Set response headers
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
    
    // Write to response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    throw new Error(`Excel export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Export data to PDF format
 */
export async function exportToPDF(
  data: any[],
  headers: string[],
  title: string,
  filename: string,
  res: Response
) {
  try {
    const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape' });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
    
    // Pipe PDF to response
    doc.pipe(res);
    
    // Add title
    doc.fontSize(20).text(title, { align: 'center' });
    doc.moveDown();
    
    // Add date
    doc.fontSize(10).text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'right' });
    doc.moveDown();
    
    // Calculate column widths
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colWidth = pageWidth / headers.length;
    
    // Add table headers
    const startY = doc.y;
    let x = doc.page.margins.left;
    
    doc.fontSize(12).fillColor('#333');
    headers.forEach((header, i) => {
      doc.text(header, x, startY, { width: colWidth, align: 'left' });
      x += colWidth;
    });
    
    doc.moveDown();
    doc.strokeColor('#cccccc').lineWidth(1);
    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
    doc.moveDown(0.5);
    
    // Add data rows
    doc.fontSize(10);
    data.forEach((row, rowIndex) => {
      x = doc.page.margins.left;
      const rowY = doc.y;
      
      // Check if we need a new page
      if (rowY > doc.page.height - 100) {
        doc.addPage();
      }
      
      // Add row data
      headers.forEach((header, colIndex) => {
        const value = row[header] !== undefined && row[header] !== null ? String(row[header]) : '';
        doc.text(value, x, rowY, { width: colWidth, align: 'left' });
        x += colWidth;
      });
      
      doc.moveDown();
      
      // Add row separator
      if (rowIndex % 5 === 4) {
        doc.strokeColor('#eeeeee').lineWidth(0.5);
        doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
      }
    });
    
    // Finalize PDF
    doc.end();
  } catch (error) {
    throw new Error(`PDF export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Format currency values
 */
export function formatCurrency(value: number): string {
  return `AED ${value.toFixed(2)}`;
}

/**
 * Format percentage values
 */
export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * Format date values
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
