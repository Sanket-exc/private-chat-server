const express = require('express');
const jwt = require('jsonwebtoken');
const { get, all, run } = require('../database/init');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware to verify token
const authenticate = (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// Search users by username
router.get('/search', authenticate, (req, res) => {
    try {
        const { q } = req.query;

        if (!q || q.length < 2) {
            return res.json({ users: [] });
        }

        const users = all(`
      SELECT id, username, email, avatar, online 
      FROM users 
      WHERE username LIKE ? AND id != ?
      LIMIT 20
    `, [`%${q}%`, req.userId]);

        res.json({ users });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get conversations list - MUST be before /:id route
router.get('/conversations/list', authenticate, (req, res) => {
    try {
        // Get unique users from messages (both sent and received)
        const conversations = all(`
      SELECT DISTINCT 
        u.id, u.username, u.avatar, u.online,
        (SELECT content FROM messages 
         WHERE (sender_id = u.id AND receiver_id = ?) 
            OR (sender_id = ? AND receiver_id = u.id)
         ORDER BY timestamp DESC LIMIT 1) as lastMessage,
        (SELECT timestamp FROM messages 
         WHERE (sender_id = u.id AND receiver_id = ?) 
            OR (sender_id = ? AND receiver_id = u.id)
         ORDER BY timestamp DESC LIMIT 1) as lastMessageTime,
        (SELECT COUNT(*) FROM messages 
         WHERE sender_id = u.id AND receiver_id = ? AND read = 0) as unreadCount
      FROM users u
      WHERE u.id IN (
        SELECT DISTINCT sender_id FROM messages WHERE receiver_id = ?
        UNION
        SELECT DISTINCT receiver_id FROM messages WHERE sender_id = ?
      )
      ORDER BY lastMessageTime DESC
    `, [req.userId, req.userId, req.userId, req.userId, req.userId, req.userId, req.userId]);

        res.json({ conversations });
    } catch (error) {
        console.error('Conversations error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update user profile
router.put('/profile', authenticate, (req, res) => {
    try {
        const { username, avatar } = req.body;

        if (username) {
            // Check if username is taken
            const existing = get('SELECT id FROM users WHERE username = ? AND id != ?', [username, req.userId]);
            if (existing) {
                return res.status(400).json({ error: 'Username already taken' });
            }
            run('UPDATE users SET username = ? WHERE id = ?', [username, req.userId]);
        }

        if (avatar !== undefined) {
            run('UPDATE users SET avatar = ? WHERE id = ?', [avatar, req.userId]);
        }

        const user = get('SELECT id, username, email, avatar FROM users WHERE id = ?', [req.userId]);
        res.json({ user });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get user by ID - MUST be after specific routes
router.get('/:id', authenticate, (req, res) => {
    try {
        const user = get(`
      SELECT id, username, email, avatar, online 
      FROM users 
      WHERE id = ?
    `, [req.params.id]);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
