const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const DATABASE_URL = process.env.DATABASE_URL;
const SALT_ROUNDS = 10;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS friendships (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        friend_id TEXT NOT NULL,
        UNIQUE(user_id, friend_id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        sender_id TEXT NOT NULL,
        receiver_id TEXT NOT NULL,
        content TEXT NOT NULL,
        time TEXT NOT NULL,
        timestamp BIGINT NOT NULL,
        read BOOLEAN DEFAULT FALSE
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_sender_receiver ON messages(sender_id, receiver_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_friendships_user_id ON friendships(user_id)
    `);

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

initDB();

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: '用户名和密码不能为空' });
  }

  if (username.length < 3) {
    return res.status(400).json({ success: false, message: '用户名至少需要3个字符' });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ success: false, message: '用户名已被使用' });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const userId = uuidv4();
    
    await pool.query(
      'INSERT INTO users (id, username, password) VALUES ($1, $2, $3)',
      [userId, username, hashedPassword]
    );

    res.json({ success: true, user: { id: userId, username } });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: '注册失败' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: '用户名和密码不能为空' });
  }

  try {
    const user = await pool.query(
      'SELECT id, username, password FROM users WHERE username = $1',
      [username]
    );

    if (user.rows.length === 0) {
      return res.status(400).json({ success: false, message: '用户名或密码错误' });
    }

    const storedPassword = user.rows[0].password;
    const passwordMatch = await bcrypt.compare(password, storedPassword);

    if (!passwordMatch) {
      return res.status(400).json({ success: false, message: '用户名或密码错误' });
    }

    res.json({ success: true, user: { id: user.rows[0].id, username: user.rows[0].username } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: '登录失败' });
  }
});

app.post('/api/add-friend', async (req, res) => {
  const { userId, friendUsername } = req.body;

  if (!userId || !friendUsername) {
    return res.status(400).json({ success: false, message: '参数错误' });
  }

  try {
    const friend = await pool.query(
      'SELECT id, username FROM users WHERE username = $1',
      [friendUsername]
    );

    if (friend.rows.length === 0) {
      return res.status(400).json({ success: false, message: '用户不存在' });
    }

    const friendData = friend.rows[0];

    if (userId === friendData.id) {
      return res.status(400).json({ success: false, message: '不能添加自己为好友' });
    }

    const existing = await pool.query(
      'SELECT id FROM friendships WHERE user_id = $1 AND friend_id = $2',
      [userId, friendData.id]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ success: false, message: '已经是好友' });
    }

    await pool.query(
      'INSERT INTO friendships (user_id, friend_id) VALUES ($1, $2), ($3, $4)',
      [userId, friendData.id, friendData.id, userId]
    );

    res.json({ success: true, friend: friendData });
  } catch (error) {
    console.error('Add friend error:', error);
    res.status(500).json({ success: false, message: '添加失败' });
  }
});

app.get('/api/friends/:userId', async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({ success: false, message: '参数错误' });
  }

  try {
    const friendDocs = await pool.query(
      'SELECT friend_id FROM friendships WHERE user_id = $1',
      [userId]
    );

    const friendIds = friendDocs.rows.map(f => f.friend_id);

    if (friendIds.length === 0) {
      return res.json({ success: true, friends: [] });
    }

    const friendsData = await pool.query(
      'SELECT id, username FROM users WHERE id = ANY($1)',
      [friendIds]
    );

    res.json({ success: true, friends: friendsData.rows });
  } catch (error) {
    console.error('Get friends error:', error);
    res.status(500).json({ success: false, message: '查询失败' });
  }
});

app.get('/api/messages/:userId/:friendId', async (req, res) => {
  const { userId, friendId } = req.params;

  if (!userId || !friendId) {
    return res.status(400).json({ success: false, message: '参数错误' });
  }

  try {
    const msgs = await pool.query(`
      SELECT id, sender_id as "senderId", content, time, timestamp, read
      FROM messages 
      WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $3 AND receiver_id = $4)
      ORDER BY timestamp ASC
    `, [userId, friendId, friendId, userId]);

    res.json({ success: true, messages: msgs.rows });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ success: false, message: '查询失败' });
  }
});

app.post('/api/send-message', async (req, res) => {
  const { senderId, receiverId, content } = req.body;

  if (!senderId || !receiverId || !content) {
    return res.status(400).json({ success: false, message: '参数错误' });
  }

  try {
    const message = {
      id: uuidv4(),
      senderId,
      receiverId,
      content,
      time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      timestamp: Date.now(),
      read: false
    };

    await pool.query(`
      INSERT INTO messages (id, sender_id, receiver_id, content, time, timestamp, read)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [message.id, message.senderId, message.receiverId, message.content, 
        message.time, message.timestamp, message.read]);

    res.json({ success: true, message });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ success: false, message: '发送失败' });
  }
});

app.post('/api/mark-read', async (req, res) => {
  const { userId, friendId } = req.body;

  if (!userId || !friendId) {
    return res.status(400).json({ success: false, message: '参数错误' });
  }

  try {
    await pool.query(`
      UPDATE messages 
      SET read = TRUE 
      WHERE receiver_id = $1 AND sender_id = $2 AND read = FALSE
    `, [userId, friendId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ success: false, message: '更新失败' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Talk server running on port ${PORT}`);
});

module.exports = app;
