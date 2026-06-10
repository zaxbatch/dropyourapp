// routes/apps.js - Complete fixed version
const fs = require('fs');
const path = require('path');
const multer = require('multer');

module.exports = (db, upload) => {
  const express = require('express');
  const router = express.Router();

  // Configure multer for folder uploads
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const userDir = path.join(__dirname, '../public/uploads', String(req.session.userId));
      if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
      }
      cb(null, userDir);
    },
    filename: (req, file, cb) => {
      // Preserve the original file path structure
      const relativePath = file.originalname;
      cb(null, relativePath);
    }
  });

  const folderUpload = multer({ 
    storage: storage,
    preservePath: true
  });

  // Upload app (folder)
  router.post('/upload', folderUpload.array('files'), (req, res) => {
    if (!req.session.userId) {
      return res.redirect('/auth/login');
    }
    
    const { title, description } = req.body;
    
    if (!title || !req.files || req.files.length === 0) {
      return res.send('Please provide a title and select files to upload');
    }
    
    const timestamp = Date.now();
    const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const folderName = `${safeTitle}_${timestamp}`;
    const oldUserDir = path.join(__dirname, '../public/uploads', String(req.session.userId));
    const newAppDir = path.join(__dirname, '../public/uploads', String(req.session.userId), folderName);
    const folderPath = `uploads/${req.session.userId}/${folderName}`;
    
    try {
      // Create new app directory
      if (!fs.existsSync(newAppDir)) {
        fs.mkdirSync(newAppDir, { recursive: true });
      }
      
      // Move uploaded files to app directory
      req.files.forEach(file => {
        const oldPath = file.path;
        const fileName = path.basename(file.originalname);
        const newPath = path.join(newAppDir, fileName);
        
        if (fs.existsSync(oldPath)) {
          fs.renameSync(oldPath, newPath);
        }
      });
      
      // Save to database
      db.run(`INSERT INTO apps (title, description, folder_path, user_id) VALUES (?, ?, ?, ?)`,
        [title, description, folderPath, req.session.userId], (err) => {
          if (err) {
            console.error('Database error:', err);
            return res.send('Error saving app to database');
          }
          res.redirect('/profile');
        });
    } catch (error) {
      console.error('Upload error:', error);
      res.send('Error uploading app: ' + error.message);
    }
  });

  // Delete app
  router.post('/delete/:id', (req, res) => {
    if (!req.session.userId) return res.redirect('/auth/login');
    
    db.get(`SELECT * FROM apps WHERE id = ? AND user_id = ?`, 
      [req.params.id, req.session.userId], (err, app) => {
        if (err || !app) {
          return res.redirect('/profile');
        }
        
        try {
          const appPath = path.join(__dirname, '../public', app.folder_path);
          if (fs.existsSync(appPath)) {
            fs.rmSync(appPath, { recursive: true, force: true });
          }
          
          db.run(`DELETE FROM apps WHERE id = ?`, [req.params.id], (err) => {
            if (err) {
              console.error('Delete error:', err);
            }
            res.redirect('/profile');
          });
        } catch (error) {
          console.error('Delete error:', error);
          res.redirect('/profile');
        }
      });
  });

  // Vote on app
  router.post('/vote/:id', (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Login required' });
    }
    
    const value = parseInt(req.body.value);
    
    db.run(`INSERT OR REPLACE INTO votes (user_id, app_id, value) VALUES (?, ?, ?)`,
      [req.session.userId, req.params.id, value], (err) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        
        db.run(`UPDATE apps SET votes = (SELECT COALESCE(SUM(value), 0) FROM votes WHERE app_id = ?) WHERE id = ?`,
          [req.params.id, req.params.id], (err) => {
            if (err) {
              return res.status(500).json({ error: err.message });
            }
            res.json({ success: true });
          });
      });
  });

  // Comment on app
  router.post('/comment/:id', (req, res) => {
    if (!req.session.userId) {
      return res.redirect('/auth/login');
    }
    
    const { content } = req.body;
    if (!content || content.trim() === '') {
      return res.redirect(`/apps/${req.params.id}`);
    }
    
    db.run(`INSERT INTO comments (content, user_id, app_id) VALUES (?, ?, ?)`,
      [content.trim(), req.session.userId, req.params.id], (err) => {
        if (err) {
          console.error('Comment error:', err);
        }
        res.redirect(`/apps/${req.params.id}`);
      });
  });

  // View single app
  router.get('/:id', (req, res) => {
    db.get(`SELECT apps.*, users.username, users.id as user_id FROM apps 
            JOIN users ON apps.user_id = users.id WHERE apps.id = ?`, 
            [req.params.id], (err, app) => {
      if (err || !app) {
        return res.send('App not found');
      }
      
      db.all(`SELECT comments.*, users.username FROM comments 
              JOIN users ON comments.user_id = users.id 
              WHERE app_id = ? ORDER BY comments.created_at DESC`, 
              [req.params.id], (err, comments) => {
        if (err) {
          comments = [];
        }
        res.render('app', { user: req.session.user, app, comments: comments || [] });
      });
    });
  });

  // Search apps
  router.get('/search', (req, res) => {
    const query = `%${req.query.q || ''}%`;
    db.all(`SELECT apps.*, users.username FROM apps 
            JOIN users ON apps.user_id = users.id 
            WHERE apps.title LIKE ? OR apps.description LIKE ? 
            ORDER BY apps.votes DESC`, 
            [query, query], (err, apps) => {
      if (err) {
        apps = [];
      }
      res.render('search', { user: req.session.user, apps: apps || [], searchTerm: req.query.q || '' });
    });
  });

  return router;
};