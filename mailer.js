const puppeteer = require('puppeteer');
const nodemailer = require('nodemailer');
const fs = require('fs');

// ตั้งค่าการส่งอีเมล
const transporter = nodemailer.createTransport({
  service: 'gmail',  // ใช้ Gmail สำหรับส่ง
  auth: {
    user: 'chayanin4534@gmail.com',
    pass: 'phvb mshl dfwd vfvu',
  },
});

// ฟังก์ชันสำหรับแปลง HTML เป็น PDF
const generatePDF = async (htmlContent, outputPath) => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setContent(htmlContent); // ใส่ HTML ที่จะเปลี่ยนเป็น PDF
  await page.pdf({ path: outputPath, format: 'A4' });
  await browser.close();
};

// ฟังก์ชันการส่งอีเมลพร้อมไฟล์ PDF แนบ
const sendTicketEmail = (toEmail, subject, text, attachmentPath) => {
  const mailOptions = {
    from: 'chayanin4534@gmail.com',
    to: toEmail,
    subject: subject,
    text: text,
    attachments: [
      {
        filename: 'ticket.pdf',
        path: attachmentPath,  // เส้นทางของไฟล์ PDF
      },
    ],
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log('Error sending email: ', error);
    } else {
      console.log('Email sent: ' + info.response);
    }
  });
};

module.exports = { generatePDF, sendTicketEmail };
