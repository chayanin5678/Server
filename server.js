require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const QRCode = require('qrcode');
const app = express();
const port = process.env.PORT || 5000;
const axios = require("axios");
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');


// เปิดใช้งาน CORS
app.use(cors());
app.use(bodyParser.json());

const SCB_API_KEY = process.env.SCB_API_KEY;
const SCB_API_SECRET = process.env.SCB_API_SECRET;
const SCB_API_URL = process.env.SCB_API_URL;

// สร้าง MySQL connection pool
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'thailandferry',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const getAccessToken = async () => {
  try {
    const response = await axios.post(
      `${SCB_API_URL}/oauth/token`,
      {
        applicationKey: SCB_API_KEY,
        applicationSecret: SCB_API_SECRET,
      },
      {
        headers: { 
          'Content-Type': 'application/json',
          'requestUId': uuidv4(), // สร้าง requestUId ใหม่ทุกครั้ง
          'resourceOwnerId': SCB_API_KEY, // ใส่ resourceOwnerId เป็น SCB_API_KEY
        },
      }
    );
    return response.data.accessToken;
  } catch (error) {
    console.error('Error fetching access token:', error.response?.data || error);
    throw error;
  }
};

// Endpoint สำหรับสร้าง QR Code Payment
app.post('/create-qrcode', async (req, res) => {
  try {
    const { amount, ref1, ref2 } = req.body;

    const accessToken = await getAccessToken();

    const response = await axios.post(
      `${SCB_API_URL}/v1/payment/qrcode/create`,
      {
        qrType: 'PP',
        amount: amount.toString(),
        ppType: 'BILLER',
        ppId: process.env.PP_ID, // ใส่ PromptPay ID หรือ Biller ID
        ref1: ref1 || 'REF1234567',
        ref2: ref2 || 'REF2345678',
        ref3: 'REF3456789',
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'requestUId': uuidv4(), // สร้าง requestUId ใหม่ทุกครั้ง
          'resourceOwnerId': SCB_API_KEY, // ใส่ resourceOwnerId เป็น SCB_API_KEY
        },
      }
    );

    res.json({ qrcode: response.data.qrcode });
  } catch (error) {
    console.error('Error creating QR Code:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to create QR Code' });
  }
});
// API Endpoints
app.get('/', (req, res) => {
  res.send('Hello, Node.js with XAMPP!');
});

app.get('/users', (req, res) => {
  pool.query('SELECT * FROM md_boattype', (err, results) => {
    if (err) {
      res.status(500).json({ status: 'error', message: 'Error retrieving data' });
    } else {
      res.status(200).json({ status: 'success', data: results });
    }
  });
});

app.get('/start', (req, res) => {
  pool.query('SELECT DISTINCT a.md_timetable_startid, b.md_location_nameeng FROM md_timetable as a INNER JOIN md_location as b ON a.md_timetable_startid = b.md_location_id', (err, results) => {
    if (err) {
      res.status(500).json({ status: 'error', message: 'Error retrieving data' });
    } else {
      res.status(200).json({ status: 'success', data: results });
    }
  });
});

app.get('/end/:md_timetable_startid', (req, res) => {
  const { md_timetable_startid } = req.params;

  const query = `
    SELECT 
      DISTINCT a.md_timetable_endid, 
      b.md_location_nameeng 
    FROM 
      md_timetable AS a 
    INNER JOIN 
      md_location AS b 
    ON 
      a.md_timetable_endid = b.md_location_id 
    WHERE 
      a.md_timetable_startid = ?
  `;

  pool.query(query, [md_timetable_startid], (err, results) => {
    if (err) {
      console.error('Error executing query:', err);
      res.status(500).json({ status: 'error', message: 'Error retrieving data' });
    } else {
      res.status(200).json({ status: 'success', data: results });
    }
  });
});

app.get('/end/:md_timetable_startid', (req, res) => {
  const { md_timetable_startid } = req.params;

  const query = `
    SELECT 
      DISTINCT a.md_timetable_endid, 
      b.md_location_nameeng 
    FROM 
      md_timetable AS a 
    INNER JOIN 
      md_location AS b 
    ON 
      a.md_timetable_endid = b.md_location_id 
    WHERE 
      a.md_timetable_startid = ?
  `;

  pool.query(query, [md_timetable_startid], (err, results) => {
    if (err) {
      console.error('Error executing query:', err);
      res.status(500).json({ status: 'error', message: 'Error retrieving data' });
    } else {
      res.status(200).json({ status: 'success', data: results });
    }
  });
});

app.get('/search/:md_timetable_startid/:md_timetable_endid', (req, res) => {
  const { md_timetable_startid, md_timetable_endid } = req.params; // รับค่า startid และ endid

  const query = `
    SELECT 
      a.*,
      c.md_location_nameeng AS start_location_name,
      b.md_location_nameeng AS end_location_name,
      d.md_pier_nameeng AS name_pierstart,
      e.md_pier_nameeng AS name_pierend,
      f.md_seat_nameeng,
      g.md_boattype_nameeng,
      h.md_company_nameeng
    FROM 
      md_timetable AS a 
    INNER JOIN 
      md_location AS b 
    ON 
      a.md_timetable_endid = b.md_location_id 
    INNER JOIN
      md_location AS c
    ON 
      a.md_timetable_startid = c.md_location_id 
    INNER JOIN 
      md_pier AS d
    ON
      a.md_timetable_pierstart = d.md_pier_id
    INNER JOIN 
      md_pier AS e
    ON
      a.md_timetable_pierend = e.md_pier_id
    INNER JOIN
      md_seat AS f
    ON
      a.md_timetable_seatid = f.md_seat_id
    INNER JOIN 
      md_boattype AS g
    ON 
      a.md_timetable_boattypeid = g.md_boattype_id
    INNER JOIN
      md_company AS h
    ON
      a.md_timetable_companyid =h.md_company_id
    WHERE 
      a.md_timetable_startid = ? 
      AND a.md_timetable_endid = ?
      LIMIT 100
  `;

  pool.query(query, [md_timetable_startid, md_timetable_endid], (err, results) => {
    if (err) {
      console.error('Error executing query:', err);
      res.status(500).json({ status: 'error', message: 'Error retrieving data' });
    } else {
      res.status(200).json({ status: 'success', data: results });
    }
  });
});

app.get('/timetable/:md_timetable_id', (req, res) => {
  const { md_timetable_id } = req.params;

  const query = `
    SELECT 
      a.*,
      b.md_company_nameeng,
      c.md_seat_nameeng,
      d.md_location_nameeng AS startingpoint_name,
      e.md_pier_nameeng AS startpier_name,
      f.md_location_nameeng AS endpoint_name,
      g.md_pier_nameeng AS endpier_name
    FROM  
      md_timetable AS a
    INNER JOIN 
      md_company AS b
    ON 
      a.md_timetable_companyid = b.md_company_id
     INNER JOIN
      md_seat AS c
    ON
      a.md_timetable_seatid = c.md_seat_id
    INNER JOIN 
      md_location AS d
    ON
      a.md_timetable_startid = d.md_location_id
    INNER JOIN
      md_pier AS e
    ON 
      a.md_timetable_pierstart = e.md_pier_id
    INNER JOIN
      md_location AS f
    ON
      a.md_timetable_endid = f.md_location_id
    INNER JOIN
      md_pier AS g
    ON 
      a.md_timetable_pierend = g.md_pier_id
    WHERE
      md_timetable_id = ?
  `;

  pool.query(query, [md_timetable_id], (err, results) => {
    if (err) {
      console.error('Error executing query:', err);
      res.status(500).json({ status: 'error', message: 'Error retrieving data' });
    } else {
      res.status(200).json({ status: 'success', data: results });
    }
  });
});




// เริ่มต้นเซิร์ฟเวอร์
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
