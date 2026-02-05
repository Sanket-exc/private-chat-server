const express = require('express');
const jwt = require('jsonwebtoken');
const { Message } = require('../database/init');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware to verify token
const authenticate = async (req, res, next) => {
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

// Get messages between two users
router.get('/:userId', authenticate, async (req, res) => {
    try {
        const otherUserId = req.params.userId;

        const messages = await Message.find({
            $or: [
                { senderId: req.userId, receiverId: otherUserId },
                { senderId: otherUserId, receiverId: req.userId }
            ]
        })
            .sort({ timestamp: 1 })
            .limit(100);

        res.json({
            messages: messages.map(m => ({
                id: m._id,
                sender_id: m.senderId,
                receiver_id: m.receiverId,
                content: m.content,
                timestamp: m.timestamp,
                status: m.status
            }))
        });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Send message (REST fallback)
router.post('/send', authenticate, async (req, res) => {
    try {
        const { receiverId, content } = req.body;

        if (!receiverId || !content) {
            return res.status(400).json({ error: 'Receiver and content required' });
        }

        const message = new Message({
            senderId: req.userId,
            receiverId,
            content,
            status: 'sent'
        });

        await message.save();

        res.json({
            message: {
                id: message._id,
                sender_id: message.senderId,
                receiver_id: message.receiverId,
                content: message.content,
                timestamp: message.timestamp,
                status: message.status
            }
        });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Mark messages as delivered
router.post('/delivered', authenticate, async (req, res) => {
    try {
        const { senderId } = req.body;

        await Message.updateMany(
            {
                senderId,
                receiverId: req.userId,
                status: 'sent'
            },
            { status: 'delivered' }
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Mark delivered error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Mark messages as seen
router.post('/seen', authenticate, async (req, res) => {
    try {
        const { senderId } = req.body;

        await Message.updateMany(
            {
                senderId,
                receiverId: req.userId,
                status: { $in: ['sent', 'delivered'] }
            },
            { status: 'seen' }
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Mark seen error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
