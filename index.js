const express = require('express');
const cors = require('cors');
const axios = require('axios');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || '';
if (MONGO_URI) {
  mongoose.connect(MONGO_URI).then(() => console.log('MongoDB Connected'));
}

// Schemas
const UserSchema = new mongoose.Schema({
  email: String,
  name: String,
  balance: { type: Number, default: 0 }
});
const User = mongoose.models.User || mongoose.model('User', UserSchema);

const DepositSchema = new mongoose.Schema({
  email: String,
  trxId: String,
  amount: Number,
  method: String,
  status: { type: String, default: 'Pending' },
  createdAt: { type: Date, default: Date.now }
});
const Deposit = mongoose.models.Deposit || mongoose.model('Deposit', DepositSchema);

const OrderSchema = new mongoose.Schema({
  email: String,
  serviceId: String,
  link: String,
  quantity: Number,
  charge: Number,
  status: { type: String, default: 'Pending' },
  createdAt: { type: Date, default: Date.now }
});
const Order = mongoose.models.Order || mongoose.model('Order', OrderSchema);

// 1. Get or Create User Data
app.get('/api/user/:email', async (req, res) => {
  const { email } = req.params;
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({ email, name: email.split('@')[0], balance: 0 });
  }
  const orders = await Order.find({ email }).sort({ createdAt: -1 });
  res.json({ success: true, user, orders });
});

// 2. Submit Deposit Request (JazzCash/EasyPaisa)
app.post('/api/deposit', async (req, res) => {
  try {
    const { email, trxId, amount, method } = req.body;
    if (!trxId || !amount) return res.status(400).json({ success: false, error: 'Saari details enter karein' });

    await Deposit.create({ email, trxId, amount: parseFloat(amount), method });
    res.json({ success: true, message: 'Deposit request submit ho gayi hai! Admin verify karke balance add karega.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Place Order
app.post('/api/order', async (req, res) => {
  try {
    const { email, serviceId, link, quantity, pricePerThousand } = req.body;
    const charge = (quantity / 1000) * pricePerThousand;

    const user = await User.findOne({ email });
    if (!user || user.balance < charge) {
      return res.status(400).json({ success: false, error: 'Balance kam hai! Pehle JazzCash/EasyPaisa se deposit karein.' });
    }

    user.balance -= charge;
    await user.save();

    const newOrder = await Order.create({ email, serviceId, link, quantity, charge });
    res.json({ success: true, message: 'Order place ho gaya!', remainingBalance: user.balance });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Admin API - Get Pending Deposits
app.get('/api/admin/deposits', async (req, res) => {
  const deposits = await Deposit.find({ status: 'Pending' }).sort({ createdAt: -1 });
  res.json({ success: true, deposits });
});

// 5. Admin API - Approve Deposit
app.post('/api/admin/approve-deposit', async (req, res) => {
  const { depositId } = req.body;
  const deposit = await Deposit.findById(depositId);
  if (!deposit || deposit.status !== 'Pending') return res.status(400).json({ success: false, error: 'Invalid deposit' });

  deposit.status = 'Approved';
  await deposit.save();

  let user = await User.findOne({ email: deposit.email });
  if (user) {
    user.balance += deposit.amount;
    await user.save();
  }

  res.json({ success: true, message: 'Balance approve aur add ho gaya!' });
});

module.exports = app;