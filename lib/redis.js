const { createClient } = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');

const setupRedis = async (io) => {
  const pubClient = createClient({ url: process.env.REDIS_URL });
  const subClient = pubClient.duplicate();

  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));
  
  return { pubClient, subClient };
};

module.exports = { setupRedis };