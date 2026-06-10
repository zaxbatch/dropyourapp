// routes/auth.js
module.exports = (db, bcrypt) => {
  const express = require('express');
  const router = express.Router();

  router.get('/login', (req, res) => {
    res.render('login', { user: req.session.user });
  });

  router.get('/register', (req, res) => {
    res.render('register', { user: req.session.user });
  });

  router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    
    db.run(`INSERT INTO users (username, email, password) VALUES (?, ?, ?)`,
      [username, email, hashedPassword], function(err) {
        if (err) {
          return res.send('User already exists');
        }
        req.session.userId = this.lastID;
        req.session.user = { id: this.lastID, username };
        res.redirect('/');
      });
  });

  router.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
      if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.send('Invalid credentials');
      }
      req.session.userId = user.id;
      req.session.user = user;
      res.redirect('/');
    });
  });

  router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
  });

  return router;
};