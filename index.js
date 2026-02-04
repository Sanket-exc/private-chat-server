require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// Import database (must be initialized before routes)
const { initDatabase } = require('./database/init');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const messageRoutes = require('./routes/messages');

// Import socket handler
const { initializeSocket } = require('./socket/chat');

const app = express();
const server = http.createServer(app);

// Socket.io setup with CORS
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint (for Render)
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Chat Server is running!',
        endpoints: {
            auth: '/api/auth',
            users: '/api/users',
            messages: '/api/messages'
        }
    });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);

// Initialize Socket.io
initializeSocket(io);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Start server after database is ready
const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        await initDatabase();
        server.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📡 Socket.io ready for connections`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
