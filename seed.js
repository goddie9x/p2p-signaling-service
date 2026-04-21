require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const hashedPassword = await bcrypt.hash('admin123', 10);
  await User.create({
    username: 'admin',
    tag: '0000',
    password: hashedPassword,
    role: 'admin',
    fullName: 'Hoang Minh Tam Admin'
  });
  console.log("Đã tạo Admin: admin#0000 / pass: admin123");
  process.exit();
});