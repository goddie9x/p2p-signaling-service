require('dotenv').config();
const express = require('express');
const { Server } = require('socket.io');
const { createServer } = require('http');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const connectDB = require('./lib/db');
const { setupRedis } = require('./lib/redis');
const User = require('./models/User');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

app.use(express.json());

const start = async () => {
  await connectDB();
  const { pubClient } = await setupRedis(io);

  app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    
    if (user && await bcrypt.compare(password, user.password)) {
      const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '24h' });
      
      await pubClient.setEx(`auth_token:${user._id}`, 86400, token);
      
      res.json({ token, role: user.role });
    } else {
      res.status(401).json({ error: "Thông tin sai rồi bro" });
    }
  });

  app.post('/register', async (req, res) => {
    /* const adminToken = req.headers.authorization?.split(' ')[1];
    if (!adminToken) return res.status(401).json({ error: "Thiếu token" }) */;

    try {
     /*  const decoded = jwt.verify(adminToken, process.env.JWT_SECRET);
      if (decoded.role !== 'admin') return res.status(403).json({ error: "Chỉ Admin mới có quyền tạo acc" }); */

      const { username, password, role, fullName } = req.body;
      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = await User.create({ username, password: hashedPassword, role, fullName });
      
      res.json({ message: "Tạo user thành công", id: newUser._id });
    } catch (e) {
      res.status(401).json({ error: "Token không hợp lệ hoặc username trùng" });
    }
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Auth error'));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      const cachedToken = await pubClient.get(`auth_token:${decoded.id}`);
      if (!cachedToken || cachedToken !== token) {
        return next(new Error('Session expired or invalid'));
      }

      socket.userId = decoded.id;
      next();
    } catch (err) {
      next(new Error('Auth error'));
    }
  });

  io.on('connection', async (socket) => {
    await pubClient.set(`online:${socket.userId}`, socket.id);

    socket.on('signal', async ({ to, signalData }) => {
      const targetSocketId = await pubClient.get(`online:${to}`);
      if (targetSocketId) {
        io.to(targetSocketId).emit('signal', { from: socket.userId, signalData });
      }
    });

    socket.on('disconnect', async () => {
      await pubClient.del(`online:${socket.userId}`);
    });
  });

  httpServer.listen(process.env.PORT || 3000, () => console.log('Hệ thống P2P xịn xò đã chạy!'));
};

start();