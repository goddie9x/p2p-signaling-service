require('dotenv').config();
const { Server } = require('socket.io');
const { setupRedis } = require('./lib/redis');
const { socketAuth } = require('./lib/auth');

const io = new Server(process.env.PORT || 3000, {
  cors: { origin: "*" }
});

const startServer = async () => {
  const { pubClient } = await setupRedis(io);

  io.use(socketAuth);

  io.on('connection', async (socket) => {
    const userId = socket.userId;
    await pubClient.set(`online:${userId}`, socket.id);

    socket.on('signal', async ({ to, signalData }) => {
      const targetSocketId = await pubClient.get(`online:${to}`);
      if (targetSocketId) {
        io.to(targetSocketId).emit('signal', {
          from: userId,
          signalData
        });
      }
    });

    socket.on('disconnect', async () => {
      await pubClient.del(`online:${userId}`);
    });
  });

  console.log(`Server is running on port ${process.env.PORT}`);
};

startServer().catch(console.error);