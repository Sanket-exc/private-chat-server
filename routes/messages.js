const express = require('express');
const jwt = require('jsonwebtoken');
const { get, all, insert, run } = require('../database/init');

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

// Get messages with a specific user
router.get('/:userId', authenticate, (req, res) => {
    try {
        const otherUserId = parseInt(req.params.userId);
        const limit = parseInt(req.query.limit) || 50;

        const messages = all(`
      SELECT m.*, 
        sender.username as senderUsername,
        receiver.username as receiverUsername
      FROM messages m
      JOIN users sender ON m.sender_id = sender.id
      JOIN users receiver ON m.receiver_id = receiver.id
      WHERE (m.sender_id = ? AND m.receiver_id = ?)
         OR (m.sender_id = ? AND m.receiver_id = ?)
      ORDER BY m.timestamp DESC
      LIMIT ?
    `, [req.userId, otherUserId, otherUserId, req.userId, limit]);

        // Mark messages as read
        run(`
      UPDATE messages 
      SET read = 1 
      WHERE sender_id = ? AND receiver_id = ? AND read = 0
    `, [otherUserId, req.userId]);

        res.json({ messages: messages.reverse() });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Send a message (REST fallback, primarily use Socket.io)
router.post('/send', authenticate, (req, res) => {
    try {
        const { receiverId, content } = req.body;

        if (!receiverId || !content) {
            return res.status(400).json({ error: 'Receiver and content are required' });
        }

        // Check if receiver exists
        const receiver = get('SELECT id FROM users WHERE id = ?', [receiverId]);
        if (!receiver) {
            return res.status(404).json({ error: 'Receiver not found' });
        }

        const messageId = insert(`
      INSERT INTO messages (sender_id, receiver_id, content)
      VALUES (?, ?, ?)
    `, [req.userId, receiverId, content]);

        const message = get('SELECT * FROM messages WHERE id = ?', [messageId]);

        res.status(201).json({ message });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
