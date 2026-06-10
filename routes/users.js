// routes/users.js
module.exports = (db) => {
  const express = require('express');
  const router = express.Router();

  router.get('/profile/:id?', (req, res) => {
    const userId = req.params.id || req.session.userId;
    if (!userId) return res.redirect('/auth/login');
    
    db.get(`SELECT * FROM users WHERE id = ?`, [userId], (err, profileUser) => {
      if (!profileUser) return res.send('User not found');
      
      db.all(`SELECT apps.*, (SELECT COUNT(*) FROM votes WHERE votes.app_id = apps.id) as vote_count 
              FROM apps WHERE user_id = ? ORDER BY apps.created_at DESC`, 
              [userId], (err, apps) => {
        
        db.get(`SELECT COUNT(*) as followerCount FROM follows WHERE following_id = ?`, [userId], (err, followers) => {
          db.get(`SELECT COUNT(*) as followingCount FROM follows WHERE follower_id = ?`, [userId], (err, following) => {
            const isFollowing = req.session.userId ? 
              db.get(`SELECT * FROM follows WHERE follower_id = ? AND following_id = ?`, 
                     [req.session.userId, userId], (err, follow) => null) : false;
            
            res.render('profile', { 
              user: req.session.user, 
              profileUser, 
              apps,
              followerCount: followers?.followerCount || 0,
              followingCount: following?.followingCount || 0,
              isFollowing: false
            });
          });
        });
      });
    });
  });

  return router;
};