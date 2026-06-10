// routes/social.js
module.exports = (db) => {
  const express = require('express');
  const router = express.Router();

  router.post('/follow/:id', (req, res) => {
    if (!req.session.userId) return res.redirect('/auth/login');
    
    db.run(`INSERT INTO follows (follower_id, following_id) VALUES (?, ?)`,
      [req.session.userId, req.params.id], () => {
        res.redirect(`/users/profile/${req.params.id}`);
      });
  });

  router.post('/unfollow/:id', (req, res) => {
    db.run(`DELETE FROM follows WHERE follower_id = ? AND following_id = ?`,
      [req.session.userId, req.params.id], () => {
        res.redirect(`/users/profile/${req.params.id}`);
      });
  });

  router.get('/feed', (req, res) => {
    if (!req.session.userId) return res.redirect('/auth/login');
    
    db.all(`SELECT apps.*, users.username FROM apps 
            JOIN users ON apps.user_id = users.id 
            WHERE users.id IN (SELECT following_id FROM follows WHERE follower_id = ?)
            ORDER BY apps.created_at DESC`, 
            [req.session.userId], (err, apps) => {
      res.render('feed', { user: req.session.user, apps });
    });
  });

  return router;
};