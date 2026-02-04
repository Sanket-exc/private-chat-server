# Chat Server

Private messaging backend with SQLite and Socket.io.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Run the server:
   ```bash
   npm start
   # or for development with auto-reload:
   npm run dev
   ```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Users
- `GET /api/users/search?q=` - Search users
- `GET /api/users/:id` - Get user profile
- `GET /api/users/conversations/list` - Get conversations
- `PUT /api/users/profile` - Update profile

### Messages
- `GET /api/messages/:userId` - Get chat history
- `POST /api/messages/send` - Send message

## Socket Events

### Client → Server
- `send_message` - Send a message
- `typing` - Typing indicator
- `messages_read` - Mark messages as read

### Server → Client
- `receive_message` - New message received
- `message_sent` - Message sent confirmation
- `user_typing` - User typing indicator
- `user_online` / `user_offline` - Online status
