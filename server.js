
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const port = process.env.PORT || 5000;
const Omise = require("omise");
const nodemailer = require('nodemailer');
const multer = require('multer');
const { generatePDF, sendTicketEmail } = require('./mailer');

const app = express();
const bodyParser = require('body-parser');


require("dotenv").config();
let orderStatus = "Pending";
// เปิดใช้งาน CORS
app.use(cors());
app.use(bodyParser.json());
app.use(express.json({ limit: '100mb' }));  // Allow large JSON payloads (100MB)
app.use(express.urlencoded({ limit: '100mb', extended: true }));  // Allow large form-data payloads (100MB)
app.use(bodyParser.json({ limit: '100mb' }));  // Allow large JSON payloads
app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));  // Allow large form data payloads
app.use(bodyParser.raw({ limit: '100mb' }));
const storage = multer.memoryStorage(); // จัดเก็บไฟล์ใน memory
const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 } // กำหนดขนาดไฟล์สูงสุดที่ 100MB
});

app.use((req, res, next) => {
  res.setHeader("ngrok-skip-browser-warning", "true"); // ✅ ข้าม Warning Page
  next();
});

// สร้าง MySQL connection pool
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'tragoxc1_thailandferry',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});


app.get('/', (req, res) => {
  res.send('Hello, Node.js with XAMPP!');
});

const omise = Omise({
  publicKey: process.env.OMISE_PUBLIC_KEY, // ใส่ Public Key ของคุณ
  secretKey: process.env.OMISE_SECRET_KEY, // ใส่ Secret Key ของคุณ
});

app.post('/send-ticket', async (req, res) => {
  const { email, htmlContent } = req.body;

  // สร้างไฟล์ PDF จาก HTML
  const ticketPath = './ticket.pdf';
  await generatePDF(htmlContent, ticketPath);

  // ส่งอีเมลพร้อมแนบไฟล์ PDF
  sendTicketEmail(email, 'Your Ticket', 'Please find your ticket attached.', ticketPath);

  res.status(200).send({ message: 'Ticket created and email sent successfully' });
});


// สร้าง endpoint /order-status เพื่อส่งสถานะเป็น JSON กลับไปให้ Front-end
app.get('/order-status', (req, res) => {
  res.json({ status: orderStatus });
});

app.post("/create-token", async (req, res) => {
  try {
    const { card } = req.body;

    // สร้าง Omise Token ด้วยข้อมูลบัตร
    const token = await omise.tokens.create({ card });

    // ส่งกลับ token ที่สร้างได้ในรูปแบบ JSON
    res.json({ success: true, token: token.id });
  } catch (error) {
    console.error("Error creating token:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});


app.post("/charge", async (req, res) => {
  try {
    const { amount, token, return_uri } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, error: "Token is required" });
    }

    // คูณ amount กับ 100 เพื่อแปลงเป็นหน่วยสตางค์ (และใช้ parseInt เพื่อป้องกันการใช้ทศนิยม)
    const amountInCents = parseInt(amount * 100, 10); // แปลงเป็นจำนวนเต็ม (integer)
    console.log('uri: ', return_uri);
    const charge = await omise.charges.create({
      amount: amountInCents,
      currency: "thb",
      card: token,
      return_uri: return_uri,
    });

    res.json({ success: true, charge });
    console.log(charge);
  } catch (error) {
    console.error('Error in charging: ', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/redirect", (req, res) => {
  console.log("🔄 Omise Redirected:", req.query);

  res.send(`
    <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Redirecting to App...</title>
  <script>
    function redirectToApp() {
      const androidIntent = "intent://payment/success#Intent;scheme=thetrago;package=com.chayanin5678.TheTrago;end;";
      const iosLink = "thetrago://payment/success";
      const isAndroid = /android/i.test(navigator.userAgent);
      
      console.log("🔗 Redirecting...");
      window.location.replace(isAndroid ? androidIntent : iosLink);
    }
    setTimeout(redirectToApp, 3000);
  </script>
</head>
<body>
  <h2>Redirecting to Home...</h2>
  <p>If you are not redirected, <a href="javascript:redirectToApp();">click here</a>.</p>
</body>
</html>

  `);
});



app.post("/webhook", express.json(), (req, res) => {
  console.log("🔔 Omise Webhook Received:", req.body);

  const charge = req.body.data;
  const success = charge.status === "successful";

  console.log("✅ Payment Status:", charge.status);

  // บันทึกสถานะการชำระเงินลงฐานข้อมูล (ถ้ามี)
  // ตัวอย่าง: updateOrderStatus(charge.id, charge.status);

  res.status(200).json({ received: true });
});




app.post("/register", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 12);
    pool.query(
      "INSERT INTO md_member (md_member_email, md_member_pass) VALUES (?, ?)",
      [email, hashedPassword],
      (err, result) => {
        if (err) {
          console.error("Database error: ", err);  // แสดงข้อผิดพลาดในกรณีที่เกิดปัญหาการ query
          return res.status(500).json({ message: "Internal server error" });
        }
        res.status(201).json({ message: "User registered successfully" });
      }
    );
  } catch (error) {
    console.error("Hashing error: ", error); // แสดงข้อผิดพลาดหากเกิดปัญหากับ bcrypt
    return res.status(500).json({ message: "Error during password hashing." });
  }
});


// **เข้าสู่ระบบ**
app.post("/login", (req, res) => {
  const { email, password } = req.body;
  pool.query("SELECT * FROM md_member WHERE md_member_email = ?", [email], async (err, result) => {
    if (err) return res.status(500).send(err);
    if (result.length === 0) return res.status(401).send({ message: "User not found" });

    const user = result[0];
    const match = await bcrypt.compare(password, user.md_member_pass);
    if (!match) return res.status(401).send({ message: "Incorrect password" });

    const token = jwt.sign({ id: user.id }, "SECRET_KEY", { expiresIn: "1h" });
    res.json({ token });
  });
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
  pool.query('SELECT  a.md_location_id, a.md_location_nameeng, b.sys_countries_nameeng FROM md_location as a INNER JOIN sys_countries AS b ON a.md_location_countriesid = b.sys_countries_id ORDER BY a.md_location_id ASC ', (err, results) => {
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
      b.md_location_nameeng,
      c.sys_countries_nameeng
    FROM 
      md_timetable AS a 
    INNER JOIN 
      md_location AS b 
    ON 
      a.md_timetable_endid = b.md_location_id 
    INNER JOIN
      sys_countries AS c
    ON
      b.md_location_countriesid = c.sys_countries_id
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



app.get('/search/:md_timetable_startid/:md_timetable_endid/:md_boatstop_date', (req, res) => {
  const { md_timetable_startid, md_timetable_endid, md_boatstop_date } = req.params; // รับค่า startid และ endid
  console.log(md_timetable_startid, md_timetable_endid, md_boatstop_date);
  const query = `
    SELECT 
      a.*,
      c.md_location_nameeng AS start_location_name,
      b.md_location_nameeng AS end_location_name,
      d.md_pier_nameeng AS name_pierstart,
      e.md_pier_nameeng AS name_pierend,
      f.md_seat_nameeng,
      g.md_boattype_nameeng,
      h.md_company_nameeng,
      i.md_package_nameeng,
      k.md_timetabledetail_detaileng1
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
      a.md_timetable_companyid = h.md_company_id
    INNER JOIN
      md_package AS i
    ON 
      a.md_timetable_packageid = i.md_package_id
    INNER JOIN
      md_boatstop AS j
    ON
      a.md_timetable_id = j.md_boatstop_timetableid
    INNER JOIN
      md_timetabledetail AS k
    ON
      a.md_timetable_companyid = k.md_timetabledetail_companyid AND
      a.md_timetable_startid = k.md_timetabledetail_startid AND
      a.md_timetable_endid = k.md_timetabledetail_endid
    WHERE 
      a.md_timetable_startid = ? AND
      a.md_timetable_endid = ? AND
      j.md_boatstop_date !=  ?
    ORDER BY 
      md_timetable_departuretime ASC
    LIMIT 100
  `;

  pool.query(query, [md_timetable_startid, md_timetable_endid, md_boatstop_date], (err, results) => {
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
      d.md_location_airport,
      e.md_pier_nameeng AS startpier_name,
      f.md_location_nameeng AS endpoint_name,
      g.md_pier_nameeng AS endpier_name,
      h.md_package_nameeng,
      i.md_boattype_nameeng
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
    INNER JOIN
      md_package AS h
    ON
      a.md_timetable_packageid = h.md_package_id
    INNER JOIN 
      md_boattype AS i
    ON
      a.md_timetable_boattypeid = i.md_boattype_id 
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

app.get('/pickup/:md_timetable_companyid/:md_timetable_pierstart', (req, res) => {
  const { md_timetable_companyid, md_timetable_pierstart } = req.params;

  const query = `
     SELECT 
      DISTINCT a.md_pickup_cartypeid,
      b.md_cartype_nameeng
    FROM 
     md_pickup AS a
    INNER JOIN
     md_cartype AS b
    ON
     a.md_pickup_cartypeid = b.md_cartype_id
    WHERE 
     a.md_pickup_companyid = ? AND
     a.md_pickup_pierid = ?
  `;

  pool.query(query, [md_timetable_companyid, md_timetable_pierstart], (err, results) => {
    if (err) {
      console.error('Error executing query:', err);
      res.status(500).json({ status: 'error', message: 'Error retrieving data' });
    } else {
      res.status(200).json({ status: 'success', data: results });
    }
  });
});

app.get('/pickup/:md_timetable_companyid/:md_timetable_pierstart/:md_pickup_cartypeid', (req, res) => {
  const { md_timetable_companyid, md_timetable_pierstart, md_pickup_cartypeid } = req.params;

  const query = `
      SELECT 
      a.*,
      b.md_transfer_nameeng,
      b.md_transfer_airport
    FROM 
     md_pickup AS a
    INNER JOIN
    	md_transfer AS b
    ON 
    	a.md_pickup_transferid = b.md_transfer_id
    WHERE 
     a.md_pickup_companyid = ? AND
     a.md_pickup_pierid = ? AND
     a.md_pickup_cartypeid = ?
  `;

  pool.query(query, [md_timetable_companyid, md_timetable_pierstart, md_pickup_cartypeid], (err, results) => {
    if (err) {
      console.error('Error executing query:', err);
      res.status(500).json({ status: 'error', message: 'Error retrieving data' });
    } else {
      res.status(200).json({ status: 'success', data: results });
    }
  });
});

app.get('/dropoff/:md_timetable_companyid/:md_timetable_pierend', (req, res) => {
  const { md_timetable_companyid, md_timetable_pierend } = req.params;

  const query = `
     SELECT 
      DISTINCT a.md_dropoff_cartypeid,
      b.md_cartype_nameeng
    FROM 
     md_dropoff AS a
    INNER JOIN
     md_cartype AS b
    ON
     a.md_dropoff_cartypeid = b.md_cartype_id
    WHERE 
     a.md_dropoff_companyid = ? AND
     a.md_dropoff_pierid = ?
  `;

  pool.query(query, [md_timetable_companyid, md_timetable_pierend], (err, results) => {
    if (err) {
      console.error('Error executing query:', err);
      res.status(500).json({ status: 'error', message: 'Error retrieving data' });
    } else {
      res.status(200).json({ status: 'success', data: results });
    }
  });
});

app.get('/dropoff/:md_timetable_companyid/:md_timetable_pierend/:md_dropoff_cartypeid', (req, res) => {
  const { md_timetable_companyid, md_timetable_pierend, md_dropoff_cartypeid } = req.params;

  const query = `
    SELECT 
      a.*,
      b.md_transfer_nameeng,
      b.md_transfer_airport
    FROM 
     md_dropoff AS a
    INNER JOIN
    	md_transfer AS b
    ON 
    	a.md_dropoff_transferid = b.md_transfer_id
    WHERE 
     a.md_dropoff_companyid = ? AND
     a.md_dropoff_pierid = ? AND
     a.md_dropoff_cartypeid = ?
  `;

  pool.query(query, [md_timetable_companyid, md_timetable_pierend, md_dropoff_cartypeid], (err, results) => {
    if (err) {
      console.error('Error executing query:', err);
      res.status(500).json({ status: 'error', message: 'Error retrieving data' });
    } else {
      res.status(200).json({ status: 'success', data: results });
    }
  });
});

app.get('/telephone', (req, res) => {


  const query = `
    SELECT 
      *
    FROM 
     sys_countries 
  `;

  pool.query(query, [], (err, results) => {
    if (err) {
      console.error('Error executing query:', err);
      res.status(500).json({ status: 'error', message: 'Error retrieving data' });
    } else {
      res.status(200).json({ status: 'success', data: results });
    }
  });
});

app.get('/bookingcode', (req, res) => {


  const query = `
    SELECT 
    SUBSTRING(MAX(md_booking_code), 3) AS booking_code 
    FROM md_booking;
  `;

  pool.query(query, [], (err, results) => {
    if (err) {
      console.error('Error executing query:', err);
      res.status(500).json({ status: 'error', message: 'Error retrieving data' });
    } else {
      res.status(200).json({ status: 'success', data: results });
    }
  });
});

app.post('/booking', (req, res) => {
  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(':').pop();
  console.log("Client IP:", clientIp); // ✅ ใช้ console.log แทน print()

  const {
    md_booking_code, md_booking_companyid,
    md_booking_paymentid, md_booking_boattypeid, md_booking_country,
    md_booking_countrycode, md_booking_round, md_booking_timetableid,
    md_booking_tel, md_booking_email, md_booking_price,
    md_booking_total, md_booking_currency, md_booking_net,
    md_booking_adult, md_booking_child, md_booking_day,
    md_booking_month, md_booking_year, md_booking_time,
    md_booking_date, md_booking_departdate, md_booking_departtime
  } = req.body;

  const query = `
  INSERT INTO md_booking (
      md_booking_code, md_booking_companyid, md_booking_reference,
      md_booking_paymentid, md_booking_boattypeid, md_booking_country, 
      md_booking_countrycode, md_booking_round, md_booking_timetableid, 
      md_booking_tel, md_booking_email, md_booking_price, md_booking_total, 
      md_booking_currency, md_booking_net, md_booking_adult, md_booking_child, 
      md_booking_day, md_booking_month, md_booking_year, md_booking_time, 
      md_booking_date, md_booking_departdate, md_booking_departtime, md_booking_ip
  ) VALUES (?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;


  const values = [
    md_booking_code, md_booking_companyid,
    md_booking_paymentid, md_booking_boattypeid, md_booking_country,
    md_booking_countrycode, md_booking_round, md_booking_timetableid,
    md_booking_tel, md_booking_email, md_booking_price,
    md_booking_total, md_booking_currency, md_booking_net,
    md_booking_adult, md_booking_child, md_booking_day,
    md_booking_month, md_booking_year, md_booking_time,
    md_booking_date, md_booking_departdate, md_booking_departtime,
    clientIp
  ];

  pool.query(query, values, (err, results) => {
    if (err) {
      console.error("Error executing query:", err);
      res.status(500).json({ status: "error", message: "Database error" });
    } else {
      res.status(200).json({ status: "success", data: results });
    }
  });
});


// เริ่มต้นเซิร์ฟเวอร์
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
