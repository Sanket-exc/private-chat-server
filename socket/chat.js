const jwt = require('jsonwebtoken');
const { get, insert, run } = require('../database/init');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Store online users: { odId: socketId }
const onlineUsers = new Map();

function initializeSocket(io) {
    // Middleware to authenticate socket connections
    io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) {
            return next(new Error('Authentication error'));
        }

        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            socket.userId = decoded.userId;
            next();
        } catch (error) {
            next(new Error('Authentication error'));
        }
    });

    io.on('connection', (socket) => {
        console.log(`User ${socket.userId} connected`);

        // Store user's socket and mark online
        onlineUsers.set(socket.userId, socket.id);
        run('UPDATE users SET online = 1 WHERE id = ?', [socket.userId]);

        // Notify other users that this user is online
        socket.broadcast.emit('user_online', { userId: socket.userId });

        // Join a room for private messaging
        socket.join(`user_${socket.userId}`);

        // Handle sending messages
        socket.on('send_message', (data) => {
            try {
                const { receiverId, content } = data;

                if (!receiverId || !content) {
                    socket.emit('error', { message: 'Invalid message data' });
                    return;
                }

                // Save message to database
                const messageId = insert(`
          INSERT INTO messages (sender_id, receiver_id, content)
          VALUES (?, ?, ?)
        `, [socket.userId, receiverId, content]);

                const message = get(`
          SELECT m.*, u.username as senderUsername
          FROM messages m
          JOIN users u ON m.sender_id = u.id
          WHERE m.id = ?
        `, [messageId]);

                // Send to receiver if online
                const receiverSocketId = onlineUsers.get(receiverId);
                if (receiverSocketId) {
                    io.to(receiverSocketId).emit('receive_message', message);
                }

                // Confirm to sender
                socket.emit('message_sent', message);
            } catch (error) {
                console.error('Send message error:', error);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        // Handle typing indicator
        socket.on('typing', (data) => {
            const { receiverId, isTyping } = data;
            const receiverSocketId = onlineUsers.get(receiverId);
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('user_typing', {
                    userId: socket.userId,
                    isTyping
                });
            }
        });

        // Handle message read
        socket.on('messages_read', (data) => {
            const { senderId } = data;

            run(`
        UPDATE messages 
        SET read = 1 
        WHERE sender_id = ? AND receiver_id = ? AND read = 0
      `, [senderId, socket.userId]);

            // Notify sender that messages were read
            const senderSocketId = onlineUsers.get(senderId);
            if (senderSocketId) {
                io.to(senderSocketId).emit('messages_read_ack', {
                    readerId: socket.userId
                });
            }
        });

        // Handle disconnect
        socket.on('disconnect', () => {
            console.log(`User ${socket.userId} disconnected`);
            onlineUsers.delete(socket.userId);
            run('UPDATE users SET online = 0 WHERE id = ?', [socket.userId]);
            socket.broadcast.emit('user_offline', { userId: socket.userId });
        });
    });
}

module.exports = { initializeSocket, onlineUsers };
