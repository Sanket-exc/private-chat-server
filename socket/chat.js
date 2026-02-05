const jwt = require('jsonwebtoken');
const { User, Message } = require('../database/init');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Track connected users: { odID: {socketId, ...} }
const connectedUsers = new Map();

function setupSocket(io) {
    // Verify token on connection
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            if (!token) {
                return next(new Error('Authentication required'));
            }

            const decoded = jwt.verify(token, JWT_SECRET);
            socket.userId = decoded.userId;
            next();
        } catch (error) {
            next(new Error('Invalid token'));
        }
    });

    io.on('connection', async (socket) => {
        const userId = socket.userId;
        console.log(`✅ User connected: ${userId}`);

        // Add to connected users
        connectedUsers.set(userId, { socketId: socket.id });

        // Update online status
        await User.findByIdAndUpdate(userId, { online: true, lastSeen: new Date() });

        // Notify others that user is online
        socket.broadcast.emit('user_online', { userId });

        // Mark messages as delivered for this user
        await Message.updateMany(
            { receiverId: userId, status: 'sent' },
            { status: 'delivered' }
        );

        // Send message
        socket.on('send_message', async (data) => {
            try {
                const { receiverId, content } = data;

                // Save message to database
                const message = new Message({
                    senderId: userId,
                    receiverId,
                    content,
                    status: 'sent'
                });
                await message.save();

                const messageData = {
                    id: message._id,
                    sender_id: userId,
                    receiver_id: receiverId,
                    content,
                    timestamp: message.timestamp,
                    status: 'sent'
                };

                // If receiver is online, mark as delivered and send
                const receiverInfo = connectedUsers.get(receiverId);
                if (receiverInfo) {
                    message.status = 'delivered';
                    await message.save();
                    messageData.status = 'delivered';

                    io.to(receiverInfo.socketId).emit('receive_message', messageData);

                    // Notify sender of delivery
                    socket.emit('message_delivered', { messageId: message._id });
                }

                // Confirm to sender
                socket.emit('message_sent', { ...messageData, status: message.status });
            } catch (error) {
                console.error('Send message error:', error);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        // Typing indicator
        socket.on('typing', (data) => {
            const { receiverId, isTyping } = data;
            const receiverInfo = connectedUsers.get(receiverId);
            if (receiverInfo) {
                io.to(receiverInfo.socketId).emit('user_typing', {
                    userId,
                    isTyping
                });
            }
        });

        // Mark messages as read/seen
        socket.on('messages_read', async (data) => {
            try {
                const { senderId } = data;

                // Update all messages from sender to this user as seen
                const result = await Message.updateMany(
                    {
                        senderId,
                        receiverId: userId,
                        status: { $in: ['sent', 'delivered'] }
                    },
                    { status: 'seen' }
                );

                // Notify sender that messages were seen
                const senderInfo = connectedUsers.get(senderId);
                if (senderInfo && result.modifiedCount > 0) {
                    io.to(senderInfo.socketId).emit('messages_seen', {
                        byUserId: userId
                    });
                }
            } catch (error) {
                console.error('Messages read error:', error);
            }
        });

        // Disconnect
        socket.on('disconnect', async () => {
            console.log(`❌ User disconnected: ${userId}`);
            connectedUsers.delete(userId);

            // Update offline status
            await User.findByIdAndUpdate(userId, {
                online: false,
                lastSeen: new Date()
            });

            // Notify others that user is offline
            socket.broadcast.emit('user_offline', { userId });
        });
    });
}

module.exports = { setupSocket, connectedUsers };
