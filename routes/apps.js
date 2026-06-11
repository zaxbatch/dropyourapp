// routes/apps.js - Complete with all routes, drag-and-drop upload, preview, etc.
const fs = require('fs');
const path = require('path');
const multer = require('multer');

module.exports = (db) => {
  const express = require('express');
  const router = express.Router();

  // Configure multer for folder uploads (preserves relative paths)
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const userId = req.session.userId;
      if (!userId) return cb(new Error('Not authenticated'));
      const tempDir = path.join(__dirname, '../public/uploads/temp', String(userId));
      fs.mkdirSync(tempDir, { recursive: true });
      cb(null, tempDir);
    },
    filename: (req, file, cb) => {
      const relativePath = file.originalname.replace(/^(\.\.(\/|\\|$))+/, '');
      cb(null, relativePath);
    }
  });

  const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }
  });

  // UPLOAD route (handles folder drop)
  router.post('/upload', upload.array('files'), (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { title, description } = req.body;
    if (!title || !req.files || req.files.length === 0) {
      return res.status(400).send('Title and files are required');
    }

    const timestamp = Date.now();
    const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const folderName = `${safeTitle}_${timestamp}`;
    const userUploadDir = path.join(__dirname, '../public/uploads', String(req.session.userId));
    const appDir = path.join(userUploadDir, folderName);
    const folderPath = `uploads/${req.session.userId}/${folderName}`;

    try {
      fs.mkdirSync(appDir, { recursive: true });
      for (const file of req.files) {
        const tempPath = file.path;
        let relativePath = file.originalname.replace(/^(\.\.(\/|\\|$))+/, '').replace(/^\/+/, '');
        const destPath = path.join(appDir, relativePath);
        const destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        fs.renameSync(tempPath, destPath);
      }
      // Cleanup temp
      const tempDir = path.join(__dirname, '../public/uploads/temp', String(req.session.userId));
      if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });

      db.run(`INSERT INTO apps (title, description, folder_path, user_id) VALUES (?, ?, ?, ?)`,
        [title, description, folderPath, req.session.userId], function(err) {
          if (err) {
            console.error('DB error:', err);
            return res.status(500).send('Database error');
          }
          res.redirect('/profile');
        });
    } catch (error) {
      console.error('Upload error:', error);
      const tempDir = path.join(__dirname, '../public/uploads/temp', String(req.session.userId));
      if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
      res.status(500).send('Upload failed: ' + error.message);
    }
  });

  // DELETE app
  router.post('/delete/:id', (req, res) => {
    if (!req.session.userId) return res.redirect('/auth/login');
    db.get(`SELECT * FROM apps WHERE id = ? AND user_id = ?`, [req.params.id, req.session.userId], (err, app) => {
      if (err || !app) return res.redirect('/profile');
      try {
        const appPath = path.join(__dirname, '../public', app.folder_path);
        if (fs.existsSync(appPath)) fs.rmSync(appPath, { recursive: true, force: true });
        db.run(`DELETE FROM apps WHERE id = ?`, [req.params.id]);
        res.redirect('/profile');
      } catch (error) {
        console.error('Delete error:', error);
        res.redirect('/profile');
      }
    });
  });

  // VOTE on app (AJAX)
  router.post('/vote/:id', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Login required' });
    const value = parseInt(req.body.value);
    db.run(`INSERT OR REPLACE INTO votes (user_id, app_id, value) VALUES (?, ?, ?)`,
      [req.session.userId, req.params.id, value], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        db.run(`UPDATE apps SET votes = (SELECT COALESCE(SUM(value), 0) FROM votes WHERE app_id = ?) WHERE id = ?`,
          [req.params.id, req.params.id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
          });
      });
  });

  // COMMENT on app
  router.post('/comment/:id', (req, res) => {
    if (!req.session.userId) return res.redirect('/auth/login');
    const { content } = req.body;
    if (!content || content.trim() === '') return res.redirect(`/apps/${req.params.id}`);
    db.run(`INSERT INTO comments (content, user_id, app_id) VALUES (?, ?, ?)`,
      [content.trim(), req.session.userId, req.params.id], (err) => {
        if (err) console.error('Comment error:', err);
        res.redirect(`/apps/${req.params.id}`);
      });
  });

  // VIEW single app (THIS IS THE MISSING ROUTE)
  router.get('/:id', (req, res) => {
    db.get(`SELECT apps.*, users.username, users.id as user_id FROM apps 
            JOIN users ON apps.user_id = users.id WHERE apps.id = ?`, 
            [req.params.id], (err, app) => {
      if (err || !app) {
        return res.status(404).send('App not found');
      }
      db.all(`SELECT comments.*, users.username FROM comments 
              JOIN users ON comments.user_id = users.id 
              WHERE app_id = ? ORDER BY comments.created_at DESC`, 
              [req.params.id], (err, comments) => {
        if (err) comments = [];
        res.render('app', { user: req.session.user, app, comments: comments || [] });
      });
    });
  });

  // SEARCH apps
  router.get('/search', (req, res) => {
    const query = `%${req.query.q || ''}%`;
    db.all(`SELECT apps.*, users.username FROM apps 
            JOIN users ON apps.user_id = users.id 
            WHERE apps.title LIKE ? OR apps.description LIKE ? 
            ORDER BY apps.votes DESC`, 
            [query, query], (err, apps) => {
      if (err) apps = [];
      res.render('search', { user: req.session.user, apps: apps || [], searchTerm: req.query.q || '' });
    });
  });

  return router;
};