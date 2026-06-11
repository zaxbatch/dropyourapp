// app.js - Main entry point with funky fresh design
const express = require('express');
const session = require('express-session');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Database setup
const db = new sqlite3.Database('./dropapp.db');

// Create tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    email TEXT UNIQUE,
    password TEXT,
    bio TEXT,
    avatar TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS apps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    description TEXT,
    folder_path TEXT,
    user_id INTEGER,
    votes INTEGER DEFAULT 0,
    views INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    app_id INTEGER,
    value INTEGER DEFAULT 1,
    UNIQUE(user_id, app_id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(app_id) REFERENCES apps(id)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    user_id INTEGER,
    app_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(app_id) REFERENCES apps(id)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS follows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    follower_id INTEGER,
    following_id INTEGER,
    UNIQUE(follower_id, following_id),
    FOREIGN KEY(follower_id) REFERENCES users(id),
    FOREIGN KEY(following_id) REFERENCES users(id)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS daily_features (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT,
    item_id INTEGER,
    feature_date DATE UNIQUE
  )`);
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
  secret: 'funky-fresh-drop-app-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Ensure upload directories exist
const uploadDirs = ['public/uploads', 'public/uploads/temp'];
uploadDirs.forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Routes
const authRoutes = require('./routes/auth')(db, bcrypt);
const appRoutes = require('./routes/apps')(db);
const userRoutes = require('./routes/users')(db);
const socialRoutes = require('./routes/social')(db);

app.use('/auth', authRoutes);
app.use('/apps', appRoutes);
app.use('/users', userRoutes);
app.use('/social', socialRoutes);

// Home page
app.get('/', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  db.get(`SELECT * FROM daily_features WHERE feature_date = ? AND type = 'app_of_day'`, [today], (err, appOfDay) => {
    db.get(`SELECT * FROM daily_features WHERE feature_date = ? AND type = 'dev_of_day'`, [today], (err, devOfDay) => {
      db.all(`SELECT apps.*, users.username, users.avatar, 
              (SELECT COALESCE(SUM(value), 0) FROM votes WHERE votes.app_id = apps.id) as vote_count
              FROM apps 
              JOIN users ON apps.user_id = users.id 
              ORDER BY apps.created_at DESC LIMIT 12`, (err, recentApps) => {
        res.render('index', { 
          user: req.session.user,
          appOfDay: appOfDay,
          devOfDay: devOfDay,
          recentApps: recentApps || []
        });
      });
    });
  });
});

app.listen(PORT, () => {
  console.log(`🎨 Drop Your App running at http://localhost:${PORT}`);
  console.log(`✨ Funky fresh community ready!`);
});