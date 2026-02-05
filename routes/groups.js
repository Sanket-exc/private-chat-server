const express = require('express');
const jwt = require('jsonwebtoken');
const { Group, GroupMessage, User } = require('../database/init');

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

// Create group
router.post('/create', authenticate, async (req, res) => {
    try {
        const { name, description, memberIds } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Group name required' });
        }

        const members = memberIds || [];
        if (!members.includes(req.userId)) {
            members.push(req.userId);
        }

        const group = new Group({
            name,
            description: description || '',
            creatorId: req.userId,
            members,
            admins: [req.userId]
        });

        await group.save();

        res.status(201).json({
            group: {
                id: group._id,
                name: group.name,
                description: group.description,
                members: group.members,
                createdAt: group.createdAt
            }
        });
    } catch (error) {
        console.error('Create group error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get user's groups
router.get('/list', authenticate, async (req, res) => {
    try {
        const groups = await Group.find({
            members: req.userId
        }).sort({ createdAt: -1 });

        const groupsWithLastMessage = await Promise.all(
            groups.map(async (group) => {
                const lastMessage = await GroupMessage.findOne({ groupId: group._id })
                    .sort({ timestamp: -1 })
                    .populate('senderId', 'username');

                return {
                    id: group._id,
                    name: group.name,
                    description: group.description,
                    avatar: group.avatar,
                    memberCount: group.members.length,
                    lastMessage: lastMessage?.content || '',
                    lastMessageSender: lastMessage?.senderId?.username || '',
                    lastMessageTime: lastMessage?.timestamp || null
                };
            })
        );

        res.json({ groups: groupsWithLastMessage });
    } catch (error) {
        console.error('List groups error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get group details
router.get('/:id', authenticate, async (req, res) => {
    try {
        const group = await Group.findById(req.params.id)
            .populate('members', '_id username avatar online profilePicture')
            .populate('admins', '_id username');

        if (!group) {
            return res.status(404).json({ error: 'Group not found' });
        }

        // Check if user is a member
        if (!group.members.some(m => m._id.toString() === req.userId)) {
            return res.status(403).json({ error: 'Not a member of this group' });
        }

        res.json({
            group: {
                id: group._id,
                name: group.name,
                description: group.description,
                avatar: group.avatar,
                members: group.members.map(m => ({
                    id: m._id,
                    username: m.username,
                    avatar: m.avatar,
                    online: m.online ? 1 : 0,
                    profilePicture: m.profilePicture
                })),
                admins: group.admins.map(a => a._id),
                createdAt: group.createdAt
            }
        });
    } catch (error) {
        console.error('Get group error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get group messages
router.get('/:id/messages', authenticate, async (req, res) => {
    try {
        const messages = await GroupMessage.find({ groupId: req.params.id })
            .sort({ timestamp: 1 })
            .limit(100)
            .populate('senderId', 'username');

        res.json({
            messages: messages.map(m => ({
                id: m._id,
                groupId: m.groupId,
                senderId: m.senderId._id,
                senderUsername: m.senderId.username,
                content: m.content,
                timestamp: m.timestamp
            }))
        });
    } catch (error) {
        console.error('Get group messages error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Add members to group
router.post('/:id/members', authenticate, async (req, res) => {
    try {
        const { memberIds } = req.body;
        const group = await Group.findById(req.params.id);

        if (!group) {
            return res.status(404).json({ error: 'Group not found' });
        }

        // Check if user is admin
        if (!group.admins.includes(req.userId)) {
            return res.status(403).json({ error: 'Only admins can add members' });
        }

        // Add new members
        const newMembers = memberIds.filter(id => !group.members.includes(id));
        group.members.push(...newMembers);
        await group.save();

        res.json({ success: true, addedCount: newMembers.length });
    } catch (error) {
        console.error('Add members error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Leave group
router.post('/:id/leave', authenticate, async (req, res) => {
    try {
        const group = await Group.findById(req.params.id);

        if (!group) {
            return res.status(404).json({ error: 'Group not found' });
        }

        group.members = group.members.filter(m => m.toString() !== req.userId);
        group.admins = group.admins.filter(a => a.toString() !== req.userId);
        await group.save();

        res.json({ success: true });
    } catch (error) {
        console.error('Leave group error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
