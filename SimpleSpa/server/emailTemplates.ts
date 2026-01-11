interface EmailTemplate {
  subject: string;
  text: string;
  html: string;
}

interface BookingTemplateData {
  customerName: string;
  spaName: string;
  spaAddress?: string;
  spaPhone?: string;
  bookingDate: string; // YYYY-MM-DD
  bookingTime: string; // HH:MM
  services: Array<{ name: string; duration: number; price: string; currency?: string }>;
  staffName?: string;
  totalAmount?: string;
  currency?: string;
  bookingId?: number;
  cancellationPolicy?: string;
  notes?: string;
}

const emailStyles = `
  body { 
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    line-height: 1.6;
    color: #333;
    margin: 0;
    padding: 0;
    background-color: #f5f5f5;
  }
  .container {
    max-width: 600px;
    margin: 20px auto;
    background: white;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  }
  .header {
    background: linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%);
    color: white;
    padding: 30px 20px;
    text-align: center;
  }
  .header h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 600;
  }
  .content {
    padding: 30px 20px;
  }
  .booking-card {
    background: #f9fafb;
    border-radius: 8px;
    padding: 20px;
    margin: 20px 0;
  }
  .booking-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid #e5e7eb;
  }
  .booking-row:last-child {
    border-bottom: none;
  }
  .label {
    font-weight: 600;
    color: #6b7280;
  }
  .value {
    color: #111827;
  }
  .service-item {
    padding: 12px 0;
    border-bottom: 1px solid #e5e7eb;
  }
  .service-item:last-child {
    border-bottom: none;
  }
  .footer {
    background: #f9fafb;
    padding: 20px;
    text-align: center;
    font-size: 14px;
    color: #6b7280;
  }
  .button {
    display: inline-block;
    padding: 12px 24px;
    background: #8b5cf6;
    color: white !important;
    text-decoration: none;
    border-radius: 6px;
    font-weight: 600;
    margin: 10px 0;
  }
  .alert {
    background: #fef3c7;
    border-left: 4px solid #f59e0b;
    padding: 12px;
    margin: 20px 0;
    border-radius: 4px;
  }
  .success {
    background: #d1fae5;
    border-left: 4px solid #10b981;
    padding: 12px;
    margin: 20px 0;
    border-radius: 4px;
  }
`;

export function getBookingConfirmationEmail(data: BookingTemplateData): EmailTemplate {
  const formattedDate = new Date(data.bookingDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const subject = `Booking Confirmed - ${data.spaName}`;

  const text = `
Hi ${data.customerName},

Your booking at ${data.spaName} has been confirmed!

BOOKING DETAILS:
Date: ${formattedDate}
Time: ${data.bookingTime}
${data.staffName ? `Professional: ${data.staffName}` : ''}

SERVICES:
${data.services.map(s => `- ${s.name} (${s.duration} min) - ${s.currency || 'AED'} ${s.price}`).join('\n')}

${data.totalAmount ? `Total Amount: ${data.currency || 'AED'} ${data.totalAmount}` : ''}

LOCATION:
${data.spaAddress || ''}
${data.spaPhone ? `Phone: ${data.spaPhone}` : ''}

${data.cancellationPolicy || 'Please arrive 10 minutes before your appointment.'}

Thank you for choosing ${data.spaName}!

Best regards,
${data.spaName} Team
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${emailStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✓ Booking Confirmed</h1>
    </div>
    
    <div class="content">
      <p>Hi <strong>${data.customerName}</strong>,</p>
      
      <div class="success">
        <strong>Your booking at ${data.spaName} has been confirmed!</strong>
      </div>
      
      <div class="booking-card">
        <h3 style="margin-top: 0;">Booking Details</h3>
        <div class="booking-row">
          <span class="label">Date:</span>
          <span class="value">${formattedDate}</span>
        </div>
        <div class="booking-row">
          <span class="label">Time:</span>
          <span class="value">${data.bookingTime}</span>
        </div>
        ${data.staffName ? `
        <div class="booking-row">
          <span class="label">Professional:</span>
          <span class="value">${data.staffName}</span>
        </div>
        ` : ''}
        ${data.bookingId ? `
        <div class="booking-row">
          <span class="label">Booking ID:</span>
          <span class="value">#${data.bookingId}</span>
        </div>
        ` : ''}
      </div>
      
      <h3>Services</h3>
      ${data.services.map(service => `
        <div class="service-item">
          <div style="display: flex; justify-content: space-between;">
            <div>
              <strong>${service.name}</strong><br>
              <span style="color: #6b7280; font-size: 14px;">${service.duration} minutes</span>
            </div>
            <div style="font-weight: 600;">
              ${data.currency || 'AED'} ${service.price}
            </div>
          </div>
        </div>
      `).join('')}
      
      ${data.totalAmount ? `
      <div style="text-align: right; font-size: 18px; font-weight: 600; margin-top: 20px; padding-top: 20px; border-top: 2px solid #e5e7eb;">
        Total: ${data.currency || 'AED'} ${data.totalAmount}
      </div>
      ` : ''}
      
      ${data.spaAddress ? `
      <h3>Location</h3>
      <p>${data.spaAddress}</p>
      ${data.spaPhone ? `<p>Phone: <a href="tel:${data.spaPhone}">${data.spaPhone}</a></p>` : ''}
      ` : ''}
      
      ${data.cancellationPolicy ? `
      <div class="alert">
        <strong>Cancellation Policy:</strong><br>
        ${data.cancellationPolicy}
      </div>
      ` : ''}
      
      <p style="margin-top: 30px;">Please arrive 10 minutes before your appointment.</p>
      
      <p>Thank you for choosing ${data.spaName}!</p>
    </div>
    
    <div class="footer">
      <p>This is an automated confirmation email from ${data.spaName}</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return { subject, text, html };
}

export function getBookingModificationEmail(data: BookingTemplateData): EmailTemplate {
  const formattedDate = new Date(data.bookingDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const subject = `Booking Modified - ${data.spaName}`;

  const text = `
Hi ${data.customerName},

Your booking at ${data.spaName} has been updated.

UPDATED BOOKING DETAILS:
Date: ${formattedDate}
Time: ${data.bookingTime}
${data.staffName ? `Professional: ${data.staffName}` : ''}

SERVICES:
${data.services.map(s => `- ${s.name} (${s.duration} min) - ${s.currency || 'AED'} ${s.price}`).join('\n')}

${data.totalAmount ? `Total Amount: ${data.currency || 'AED'} ${data.totalAmount}` : ''}

LOCATION:
${data.spaAddress || ''}
${data.spaPhone ? `Phone: ${data.spaPhone}` : ''}

${data.notes ? `Notes: ${data.notes}` : ''}

Best regards,
${data.spaName} Team
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${emailStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📝 Booking Modified</h1>
    </div>
    
    <div class="content">
      <p>Hi <strong>${data.customerName}</strong>,</p>
      
      <div class="alert">
        <strong>Your booking at ${data.spaName} has been updated.</strong>
      </div>
      
      <div class="booking-card">
        <h3 style="margin-top: 0;">Updated Booking Details</h3>
        <div class="booking-row">
          <span class="label">Date:</span>
          <span class="value">${formattedDate}</span>
        </div>
        <div class="booking-row">
          <span class="label">Time:</span>
          <span class="value">${data.bookingTime}</span>
        </div>
        ${data.staffName ? `
        <div class="booking-row">
          <span class="label">Professional:</span>
          <span class="value">${data.staffName}</span>
        </div>
        ` : ''}
        ${data.bookingId ? `
        <div class="booking-row">
          <span class="label">Booking ID:</span>
          <span class="value">#${data.bookingId}</span>
        </div>
        ` : ''}
      </div>
      
      <h3>Services</h3>
      ${data.services.map(service => `
        <div class="service-item">
          <div style="display: flex; justify-content: space-between;">
            <div>
              <strong>${service.name}</strong><br>
              <span style="color: #6b7280; font-size: 14px;">${service.duration} minutes</span>
            </div>
            <div style="font-weight: 600;">
              ${data.currency || 'AED'} ${service.price}
            </div>
          </div>
        </div>
      `).join('')}
      
      ${data.totalAmount ? `
      <div style="text-align: right; font-size: 18px; font-weight: 600; margin-top: 20px; padding-top: 20px; border-top: 2px solid #e5e7eb;">
        Total: ${data.currency || 'AED'} ${data.totalAmount}
      </div>
      ` : ''}
      
      ${data.notes ? `
      <p><strong>Notes:</strong> ${data.notes}</p>
      ` : ''}
      
      <p style="margin-top: 30px;">See you soon at ${data.spaName}!</p>
    </div>
    
    <div class="footer">
      <p>This is an automated notification from ${data.spaName}</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return { subject, text, html };
}

export function getBookingCancellationEmail(data: BookingTemplateData): EmailTemplate {
  const formattedDate = new Date(data.bookingDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const subject = `Booking Cancelled - ${data.spaName}`;

  const text = `
Hi ${data.customerName},

Your booking at ${data.spaName} has been cancelled.

CANCELLED BOOKING:
Date: ${formattedDate}
Time: ${data.bookingTime}
${data.bookingId ? `Booking ID: #${data.bookingId}` : ''}

${data.notes ? `Reason: ${data.notes}` : ''}

${data.cancellationPolicy || ''}

We hope to see you again soon!

Best regards,
${data.spaName} Team
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${emailStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);">
      <h1>✕ Booking Cancelled</h1>
    </div>
    
    <div class="content">
      <p>Hi <strong>${data.customerName}</strong>,</p>
      
      <p>Your booking at <strong>${data.spaName}</strong> has been cancelled.</p>
      
      <div class="booking-card">
        <h3 style="margin-top: 0;">Cancelled Booking</h3>
        <div class="booking-row">
          <span class="label">Date:</span>
          <span class="value">${formattedDate}</span>
        </div>
        <div class="booking-row">
          <span class="label">Time:</span>
          <span class="value">${data.bookingTime}</span>
        </div>
        ${data.bookingId ? `
        <div class="booking-row">
          <span class="label">Booking ID:</span>
          <span class="value">#${data.bookingId}</span>
        </div>
        ` : ''}
      </div>
      
      ${data.notes ? `
      <div class="alert">
        <strong>Cancellation Reason:</strong><br>
        ${data.notes}
      </div>
      ` : ''}
      
      ${data.cancellationPolicy ? `
      <p><strong>Cancellation Policy:</strong> ${data.cancellationPolicy}</p>
      ` : ''}
      
      <p style="margin-top: 30px;">We hope to see you again soon!</p>
      
      <p>To book another appointment, visit our booking page.</p>
    </div>
    
    <div class="footer">
      <p>This is an automated notification from ${data.spaName}</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return { subject, text, html };
}
