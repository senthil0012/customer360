require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const mysql = require("mysql2/promise");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ---------- MYSQL CONNECTION ----------
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

// ---------- UTILS ----------
const genToken = (user) =>
  jwt.sign(
    { id: user.id, role: user.role, user_id: user.user_id },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );

const auth = async (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
};

// ---------- FILE UPLOADS ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = file.fieldname === "ad_image"
      ? "uploads/ads"
      : file.fieldname === "photo"
      ? "uploads/photos"
      : "uploads/resumes";
    fs.mkdirSync(folder, { recursive: true });
    cb(null, folder);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "_" + file.originalname);
  },
});
const upload = multer({ storage });

// ---------- AUTH ----------
app.post("/api/login", async (req, res) => {
  const { user_id, password } = req.body;
  if (!user_id || !password)
    return res.status(400).json({ error: "Missing credentials" });
  const [rows] = await pool.query("SELECT * FROM users WHERE user_id=?", [user_id]);
  const user = rows[0];
console.log("LOGIN DEBUG:", user);
  
if (!user) return res.status(401).json({ error: "Invalid credentials" });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });
  res.json({
    token: genToken(user),
    role: user.role,
    full_name: user.full_name,
  });
});

// ---------- USERS ----------
app.get("/api/users", auth, async (req, res) => {
  const [rows] = await pool.query(
    "SELECT id,user_id,role,is_active FROM users ORDER BY id DESC"
  );
  res.json(rows);
});

app.post("/api/users", auth, async (req, res) => {
  const { user_id, password, role } = req.body;
  if (!user_id || !password) return res.status(400).json({ error: "Missing data" });
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    "INSERT INTO users (user_id,password_hash,role,is_active) VALUES (?,?,?,1)",
    [user_id, hash, role || "EMPLOYEE"]
  );
  res.json({ success: true });
});

app.patch("/api/users/:id/status", auth, async (req, res) => {
  const { is_active } = req.body;
  await pool.query("UPDATE users SET is_active=? WHERE id=?", [is_active, req.params.id]);
  res.json({ success: true });
});

app.delete("/api/users/:id", auth, async (req, res) => {
  await pool.query("DELETE FROM users WHERE id=?", [req.params.id]);
  res.json({ success: true });
});

// ---------- EMPLOYEES ----------
app.get("/api/employees", auth, async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM employees ORDER BY id DESC");
  res.json(rows);
});

app.post(
  "/api/employees",
  auth,
  upload.fields([{ name: "photo" }, { name: "resume" }]),
  async (req, res) => {
    const { emp_id, user_id, name, designation, manager, dob, join_date, relieve_date, address } =
      req.body;
    const photo = req.files.photo ? req.files.photo[0].path : null;
    const resume = req.files.resume ? req.files.resume[0].path : null;
    await pool.query(
      `INSERT INTO employees 
       (emp_id,user_id,name,designation,manager,dob,join_date,relieve_date,address,photo,resume)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        emp_id,
        user_id,
        name,
        designation,
        manager,
        dob,
        join_date,
        relieve_date,
        address,
        photo,
        resume,
      ]
    );
    res.json({ success: true });
  }
);

// ---------- CUSTOMERS & ALLOCATIONS ----------
app.get("/api/customers", auth, async (req, res) => {
  const { employee_id } = req.query;
  const [rows] = await pool.query(
    "SELECT * FROM customers WHERE (? IS NULL OR assigned_to=?) LIMIT 500",
    [employee_id || null, employee_id || null]
  );
  res.json(rows);
});

app.post("/api/customers/import", auth, upload.single("csv"), async (req, res) => {
  // Here you could parse CSV and insert rows.
  res.json({ success: true, message: "CSV upload stub" });
});

app.patch("/api/customers/allocate", auth, async (req, res) => {
  const { customer_id, employee_id } = req.body;
  await pool.query("UPDATE customers SET assigned_to=? WHERE id=?", [employee_id, customer_id]);
  res.json({ success: true });
});

app.patch("/api/customers/deallocate", auth, async (req, res) => {
  const { customer_id } = req.body;
  await pool.query("UPDATE customers SET assigned_to=NULL WHERE id=?", [customer_id]);
  res.json({ success: true });
});

// ---------- FEEDBACK ----------
app.get("/api/feedback", auth, async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM feedback ORDER BY id DESC");
  res.json(rows);
});

app.post("/api/feedback", auth, upload.single("photo"), async (req, res) => {
  const { customer, notes, lat, lng } = req.body;
  const photo = req.file ? req.file.path : null;
  await pool.query(
    "INSERT INTO feedback (user_id,customer,notes,photo,lat,lng) VALUES (?,?,?,?,?,?)",
    [req.user.id, customer, notes, photo, lat, lng]
  );
  res.json({ success: true });
});

app.put("/api/feedback/:id", auth, async (req, res) => {
  const { notes, lat, lng } = req.body;
  await pool.query("UPDATE feedback SET notes=?,lat=?,lng=? WHERE id=?", [
    notes,
    lat,
    lng,
    req.params.id,
  ]);
  res.json({ success: true });
});

app.delete("/api/feedback/:id", auth, async (req, res) => {
  await pool.query("DELETE FROM feedback WHERE id=?", [req.params.id]);
  res.json({ success: true });
});

// ---------- ATTENDANCE ----------
app.get("/api/attendance", auth, async (req, res) => {
  const [rows] = await pool.query(
    "SELECT * FROM attendance WHERE employee_id=? ORDER BY date DESC",
    [req.user.id]
  );
  res.json(rows);
});

app.post("/api/attendance/checkin", auth, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const time = new Date().toLocaleTimeString();
  await pool.query(
    "INSERT INTO attendance (employee_id,date,login,status) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE login=?,status='PRESENT'",
    [req.user.id, today, time, "PRESENT", time]
  );
  res.json({ success: true });
});

app.post("/api/attendance/checkout", auth, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const time = new Date().toLocaleTimeString();
  await pool.query("UPDATE attendance SET logout=? WHERE employee_id=? AND date=?", [
    time,
    req.user.id,
    today,
  ]);
  res.json({ success: true });
});

// ---------- ADS ----------
app.get("/api/ads", auth, async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM ads WHERE is_active=1 ORDER BY id DESC");
  res.json(rows);
});

app.post("/api/ads", auth, upload.single("ad_image"), async (req, res) => {
  const { title } = req.body;
  const file = req.file ? req.file.path : null;
  await pool.query("INSERT INTO ads (title,image,is_active) VALUES (?,?,1)", [title, file]);
  res.json({ success: true });
});

app.patch("/api/ads/:id/toggle", auth, async (req, res) => {
  await pool.query("UPDATE ads SET is_active = NOT is_active WHERE id=?", [req.params.id]);
  res.json({ success: true });
});

app.delete("/api/ads/:id", auth, async (req, res) => {
  await pool.query("DELETE FROM ads WHERE id=?", [req.params.id]);
  res.json({ success: true });
});

// ---------- START SERVER ----------
const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`✅ API running on http://localhost:${port}`));
