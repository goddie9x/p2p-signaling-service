require("dotenv").config();
const express = require("express");
const { Server } = require("socket.io");
const { createServer } = require("http");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const connectDB = require("./lib/db");
const { setupRedis } = require("./lib/redis");
const User = require("./models/User");

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

app.use(express.json());

const start = async () => {
  await connectDB();
  const { pubClient } = await setupRedis(io);

  app.post("/login", async (req, res) => {
    const { username, tag, password } = req.body;
    const user = await User.findOne({ username, tag });

    if (user && (await bcrypt.compare(password, user.password))) {
      const token = jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "24h" },
      );
      await pubClient.setEx(`auth_token:${user._id}`, 86400, token);
      res.json({ token, role: user.role, userId: user._id });
    } else {
      res.status(401).json({ error: "Thông tin sai rồi bro" });
    }
  });
  app.post("/change-password", async (req, res) => {
    try {
      const authHeader = req.headers.authorization?.split(" ")[1];
      if (!authHeader) return res.status(401).json({ error: "Thiếu token" });

      const decoded = jwt.verify(authHeader, process.env.JWT_SECRET);
      const { oldPassword, newPassword } = req.body;

      const user = await User.findById(decoded.id);
      if (!user || !(await bcrypt.compare(oldPassword, user.password))) {
        return res.status(401).json({ error: "Mật khẩu cũ không đúng" });
      }

      user.password = await bcrypt.hash(newPassword, 10);
      await user.save();

      await pubClient.del(`auth_token:${user._id}`);

      const currentSocketId = await pubClient.get(`online:${user._id}`);
      if (currentSocketId) {
        io.to(currentSocketId).emit("force_logout", {
          message: "Mật khẩu đã đổi, vui lòng login lại",
        });
      }

      res.json({ message: "Đổi mật khẩu thành công, vui lòng đăng nhập lại" });
    } catch (e) {
      res.status(401).json({ error: "Token không hợp lệ hoặc lỗi hệ thống" });
    }
  });
  app.post("/register", async (req, res) => {
    try {
      const authHeader = req.headers.authorization?.split(" ")[1];
      const decoded = jwt.verify(authHeader, process.env.JWT_SECRET);
      if (decoded.role !== "admin")
        return res.status(403).json({ error: "Quyền Admin mới được đăng ký" });

      const { username, password, role, fullName } = req.body;
      const tag = Math.floor(10000 + Math.random() * 90000).toString();
      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = await User.create({
        username,
        tag,
        password: hashedPassword,
        role,
        fullName,
      });
      res.json({ message: "Tạo thành công", identity: `${username}#${tag}` });
    } catch (e) {
      res.status(401).json({ error: "Token không hợp lệ hoặc lỗi DB" });
    }
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("Auth error"));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const cachedToken = await pubClient.get(`auth_token:${decoded.id}`);
      if (!cachedToken || cachedToken !== token)
        return next(new Error("Session expired"));

      socket.userId = decoded.id;
      next();
    } catch (err) {
      next(new Error("Auth error"));
    }
  });

  io.on("connection", async (socket) => {
    await pubClient.set(`online:${socket.userId}`, socket.id);

    // Xử lý tìm kiếm User theo Username#Tag
    socket.on("search_peer", async ({ username, tag }) => {
      const peer = await User.findOne({ username, tag }).select("_id fullName");
      if (peer) {
        const isOnline = await pubClient.exists(`online:${peer._id}`);
        socket.emit("search_result", { peer, isOnline: !!isOnline });
      } else {
        socket.emit("search_result", { error: "Không tìm thấy peer" });
      }
    });

    // Chuyển tiếp tín hiệu P2P
    socket.on("signal", async ({ to, signalData }) => {
      const targetSocketId = await pubClient.get(`online:${to}`);
      if (targetSocketId) {
        io.to(targetSocketId).emit("signal", {
          from: socket.userId,
          signalData,
        });
      }
    });

    socket.on("disconnect", async () => {
      await pubClient.del(`online:${socket.userId}`);
    });
  });

  httpServer.listen(process.env.PORT || 3000);
};

start();
