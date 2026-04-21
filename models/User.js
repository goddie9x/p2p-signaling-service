const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  tag: { type: String, required: true }, 
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'user'], default: 'user' },
  fullName: String,
  createdAt: { type: Date, default: Date.now }
});

userSchema.index({ username: 1, tag: 1 }, { unique: true });

module.exports = mongoose.model('User', userSchema);