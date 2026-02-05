const express = require('express');
const jwt = require('jsonwebtoken');
const { User, Message } = require('../database/init');

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

// Search users by username
router.get('/search', authenticate, async (req, res) => {
    try {
        const { q } = req.query;

        if (!q || q.length < 2) {
            return res.json({ users: [] });
        }

        const users = await User.find({
            username: { $regex: q, $options: 'i' },
            _id: { $ne: req.userId }
        })
            .select('_id username email avatar online bio profilePicture')
            .limit(20);

        res.json({
            users: users.map(u => ({
                id: u._id,
                username: u.username,
                email: u.email,
                avatar: u.avatar,
                online: u.online ? 1 : 0,
                bio: u.bio,
                profilePicture: u.profilePicture
            }))
        });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get conversations list
router.get('/conversations/list', authenticate, async (req, res) => {
    try {
        // Get all messages involving this user
        const messages = await Message.find({
            $or: [
                { senderId: req.userId },
                { receiverId: req.userId }
            ]
        }).sort({ timestamp: -1 });

        // Get unique conversation partners
        const partnerIds = new Set();
        messages.forEach(msg => {
            const partnerId = msg.senderId.toString() === req.userId
                ? msg.receiverId.toString()
                : msg.senderId.toString();
            partnerIds.add(partnerId);
        });

        // Get user details and last message for each partner
        const conversations = await Promise.all(
            Array.from(partnerIds).map(async (partnerId) => {
                const user = await User.findById(partnerId)
                    .select('_id username avatar online profilePicture');

                if (!user) return null;

                // Get last message
                const lastMessage = await Message.findOne({
                    $or: [
                        { senderId: req.userId, receiverId: partnerId },
                        { senderId: partnerId, receiverId: req.userId }
                    ]
                }).sort({ timestamp: -1 });

                // Count unread messages
                const unreadCount = await Message.countDocuments({
                    senderId: partnerId,
                    receiverId: req.userId,
                    status: { $ne: 'seen' }
                });

                return {
                    id: user._id,
                    username: user.username,
                    avatar: user.avatar,
                    online: user.online ? 1 : 0,
                    profilePicture: user.profilePicture,
                    lastMessage: lastMessage?.content || '',
                    lastMessageTime: lastMessage?.timestamp || null,
                    lastMessageStatus: lastMessage?.status || 'sent',
                    unreadCount
                };
            })
        );

        // Filter out nulls and sort by last message time
        const validConversations = conversations
            .filter(c => c !== null)
            .sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));

        res.json({ conversations: validConversations });
    } catch (error) {
        console.error('Conversations error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update user profile
router.put('/profile', authenticate, async (req, res) => {
    try {
        const { username, avatar, bio, profilePicture } = req.body;
        const updates = {};

        if (username) {
            // Check if username is taken
            const existing = await User.findOne({
                username,
                _id: { $ne: req.userId }
            });
            if (existing) {
                return res.status(400).json({ error: 'Username already taken' });
            }
            updates.username = username;
        }

        if (avatar !== undefined) updates.avatar = avatar;
        if (bio !== undefined) updates.bio = bio;
        if (profilePicture !== undefined) updates.profilePicture = profilePicture;

        const user = await User.findByIdAndUpdate(
            req.userId,
            updates,
            { new: true }
        ).select('-password');

        res.json({
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                avatar: user.avatar,
                bio: user.bio,
                profilePicture: user.profilePicture
            }
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Upload public key for E2E encryption
router.post('/publickey', authenticate, async (req, res) => {
    try {
        const { publicKey } = req.body;

        if (!publicKey) {
            return res.status(400).json({ error: 'Public key required' });
        }

        await User.findByIdAndUpdate(req.userId, { publicKey });
        res.json({ success: true, message: 'Public key saved' });
    } catch (error) {
        console.error('Save public key error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get user's public key for E2E encryption
router.get('/:id/publickey', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('publicKey');

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ publicKey: user.publicKey || '' });
    } catch (error) {
        console.error('Get public key error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Save FCM token for push notifications
router.post('/fcm-token', authenticate, async (req, res) => {
    try {
        const { fcmToken } = req.body;

        if (!fcmToken) {
            return res.status(400).json({ error: 'FCM token required' });
        }

        await User.findByIdAndUpdate(req.userId, { fcmToken });
        res.json({ success: true, message: 'FCM token saved' });
    } catch (error) {
        console.error('Save FCM token error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get user by ID
router.get('/:id', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .select('_id username email avatar online bio profilePicture');

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                avatar: user.avatar,
                online: user.online ? 1 : 0,
                bio: user.bio,
                profilePicture: user.profilePicture
            }
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
