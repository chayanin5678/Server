require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = express();
const port = process.env.PORT || 5000;
const axios = require("axios");
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');


// เปิดใช้งาน CORS
app.use(cors());
app.use(bodyParser.json());


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


app.get('/', (req, res) => {
  res.send('Hello, Node.js with XAMPP!');
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
  pool.query('SELECT DISTINCT a.md_timetable_startid, b.md_location_nameeng, c.sys_countries_nameeng FROM md_timetable as a INNER JOIN md_location as b ON a.md_timetable_startid = b.md_location_id INNER JOIN sys_countries AS c ON b.md_location_countriesid = c.sys_countries_id', (err, results) => {
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
      b.md_location_id = c.sys_countries_id
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

app.get('/search/:md_timetable_startid/:md_timetable_endid/:md_boatstop_date', (req, res) => {
  const { md_timetable_startid, md_timetable_endid, md_boatstop_date} = req.params; // รับค่า startid และ endid

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
      i.md_package_nameeng
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
    WHERE 
      a.md_timetable_startid = ? AND
      a.md_timetable_endid = ? AND
      j.md_boatstop_date !=  ?
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
      h.md_package_nameeng
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

// เริ่มต้นเซิร์ฟเวอร์
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
