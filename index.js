require('dotenv').config();
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const { connectDB } = require('./database/init');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const messageRoutes = require('./routes/messages');
const groupRoutes = require('./routes/groups');
const { setupSocket } = require('./socket/chat');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check / Root endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Chat Server is running!',
        version: '2.0.0',
        database: 'MongoDB Atlas',
        endpoints: {
            auth: '/api/auth',
            users: '/api/users',
            messages: '/api/messages',
            groups: '/api/groups'
        }
    });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/groups', groupRoutes);

// Start server
const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        // Connect to MongoDB
        await connectDB();

        // Setup Socket.io
        setupSocket(io);

        // Start HTTP server
        httpServer.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📡 Socket.io ready for connections`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
