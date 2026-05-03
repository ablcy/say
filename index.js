require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const DATABASE_URL = process.env.DATABASE_URL;
const SALT_ROUNDS = 10;

let usersDB, friendshipsDB, messagesDB;

if (DATABASE_URL) {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL ? { rejectUnauthorized: false } : false
  });
  
  const db = {
    query: async (sql, params = []) => {
      const result = await pool.query(sql, params);
      return { rows: result.rows, rowCount: result.rowCount };
    },
    run: async (sql, params = []) => {
      const result = await pool.query(sql, params);
      return { lastID: result.rows[0]?.id || null, changes: result.rowCount };
    }
  };

  usersDB = db;
  friendshipsDB = db;
  messagesDB = db;
} else {
  const Datastore = require('nedb');
  usersDB = new Datastore({ filename: './data/users.db', autoload: true });
  friendshipsDB = new Datastore({ filename: './data/friendships.db', autoload: true });
  messagesDB = new Datastore({ filename: './data/messages.db', autoload: true });
  
  usersDB.ensureIndex({ fieldName: 'username', unique: true });
  friendshipsDB.ensureIndex({ fieldName: 'user_id' });
  friendshipsDB.ensureIndex({ fieldName: ['user_id', 'friend_id'], unique: true });
  messagesDB.ensureIndex({ fieldName: 'sender_id' });
  messagesDB.ensureIndex({ fieldName: 'receiver_id' });
}

async function initDB() {
  if (DATABASE_URL) {
    try {
      await usersDB.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await friendshipsDB.query(`
        CREATE TABLE IF NOT EXISTS friendships (
          id SERIAL PRIMARY KEY,
          user_id TEXT NOT NULL,
          friend_id TEXT NOT NULL,
          UNIQUE(user_id, friend_id)
        )
      `);

      await messagesDB.query(`
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

      await messagesDB.query(`
        CREATE INDEX IF NOT EXISTS idx_messages_sender_receiver ON messages(sender_id, receiver_id)
      `);

      await friendshipsDB.query(`
        CREATE INDEX IF NOT EXISTS idx_friendships_user_id ON friendships(user_id)
      `);

      console.log('PostgreSQL database initialized successfully');
    } catch (error) {
      console.error('Database initialization error:', error);
    }
  } else {
    require('fs').mkdirSync('./data', { recursive: true });
    console.log('NeDB database initialized successfully');
  }
}

initDB();

function promisifyDB(method) {
  return function(query, options = {}) {
    return new Promise((resolve, reject) => {
      method.call(this, query, options, (err, docs) => {
        if (err) reject(err);
        else resolve(docs);
      });
    });
  };
}

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: '用户名和密码不能为空' });
  }

  if (username.length < 3) {
    return res.status(400).json({ success: false, message: '用户名至少需要3个字符' });
  }

  try {
    let existing;
    if (DATABASE_URL) {
      existing = await usersDB.query('SELECT id FROM users WHERE username = $1', [username]);
    } else {
      existing = await promisifyDB(usersDB.find).call(usersDB, { username });
    }

    if ((DATABASE_URL && existing.rows.length > 0) || (!DATABASE_URL && existing.length > 0)) {
      return res.status(400).json({ success: false, message: '用户名已被使用' });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const userId = uuidv4();
    
    if (DATABASE_URL) {
      await usersDB.query(
        'INSERT INTO users (id, username, password) VALUES ($1, $2, $3)',
        [userId, username, hashedPassword]
      );
    } else {
      await promisifyDB(usersDB.insert).call(usersDB, { 
        _id: userId, 
        id: userId, 
        username, 
        password: hashedPassword,
        created_at: new Date().toISOString()
      });
    }

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
    let user;
    if (DATABASE_URL) {
      user = await usersDB.query(
        'SELECT id, username, password FROM users WHERE username = $1',
        [username]
      );
    } else {
      user = await promisifyDB(usersDB.find).call(usersDB, { username });
    }

    const userData = DATABASE_URL ? user.rows[0] : user[0];
    
    if (!userData) {
      return res.status(400).json({ success: false, message: '用户名或密码错误' });
    }

    const passwordMatch = await bcrypt.compare(password, userData.password);

    if (!passwordMatch) {
      return res.status(400).json({ success: false, message: '用户名或密码错误' });
    }

    res.json({ success: true, user: { id: userData.id, username: userData.username } });
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
    let friend;
    if (DATABASE_URL) {
      friend = await usersDB.query(
        'SELECT id, username FROM users WHERE username = $1',
        [friendUsername]
      );
    } else {
      friend = await promisifyDB(usersDB.find).call(usersDB, { username: friendUsername });
    }

    const friendData = DATABASE_URL ? friend.rows[0] : friend[0];
    
    if (!friendData) {
      return res.status(400).json({ success: false, message: '用户不存在' });
    }

    if (userId === friendData.id) {
      return res.status(400).json({ success: false, message: '不能添加自己为好友' });
    }

    let existing;
    if (DATABASE_URL) {
      existing = await friendshipsDB.query(
        'SELECT id FROM friendships WHERE user_id = $1 AND friend_id = $2',
        [userId, friendData.id]
      );
    } else {
      existing = await promisifyDB(friendshipsDB.find).call(friendshipsDB, { 
        user_id: userId, 
        friend_id: friendData.id 
      });
    }

    if ((DATABASE_URL && existing.rows.length > 0) || (!DATABASE_URL && existing.length > 0)) {
      return res.status(400).json({ success: false, message: '已经是好友' });
    }

    if (DATABASE_URL) {
      await friendshipsDB.query(
        'INSERT INTO friendships (user_id, friend_id) VALUES ($1, $2), ($3, $4)',
        [userId, friendData.id, friendData.id, userId]
      );
    } else {
      await promisifyDB(friendshipsDB.insert).call(friendshipsDB, { 
        user_id: userId, 
        friend_id: friendData.id 
      });
      await promisifyDB(friendshipsDB.insert).call(friendshipsDB, { 
        user_id: friendData.id, 
        friend_id: userId 
      });
    }

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
    let friendDocs;
    if (DATABASE_URL) {
      friendDocs = await friendshipsDB.query(
        'SELECT friend_id FROM friendships WHERE user_id = $1',
        [userId]
      );
    } else {
      friendDocs = await promisifyDB(friendshipsDB.find).call(friendshipsDB, { user_id: userId });
    }

    const friendIds = (DATABASE_URL ? friendDocs.rows : friendDocs).map(f => f.friend_id);

    if (friendIds.length === 0) {
      return res.json({ success: true, friends: [] });
    }

    let friendsData;
    if (DATABASE_URL) {
      const placeholders = friendIds.map((_, i) => `$${i + 1}`).join(',');
      friendsData = await usersDB.query(
        `SELECT id, username FROM users WHERE id IN (${placeholders})`,
        friendIds
      );
    } else {
      friendsData = await promisifyDB(usersDB.find).call(usersDB, { 
        id: { $in: friendIds } 
      });
    }

    res.json({ success: true, friends: DATABASE_URL ? friendsData.rows : friendsData });
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
    let msgs;
    if (DATABASE_URL) {
      msgs = await messagesDB.query(`
        SELECT id, sender_id as senderId, content, time, timestamp, read
        FROM messages 
        WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $3 AND receiver_id = $4)
        ORDER BY timestamp ASC
      `, [userId, friendId, friendId, userId]);
    } else {
      msgs = await promisifyDB(messagesDB.find).call(messagesDB, {
        $or: [
          { sender_id: userId, receiver_id: friendId },
          { sender_id: friendId, receiver_id: userId }
        ]
      }).sort({ timestamp: 1 });
    }

    const messages = (DATABASE_URL ? msgs.rows : msgs).map(msg => ({
      ...msg,
      senderId: msg.senderId || msg.sender_id,
      read: DATABASE_URL ? msg.read : (msg.read === true || msg.read === 1)
    }));

    res.json({ success: true, messages });
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

    if (DATABASE_URL) {
      await messagesDB.query(`
        INSERT INTO messages (id, sender_id, receiver_id, content, time, timestamp, read)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [message.id, message.senderId, message.receiverId, message.content, 
          message.time, message.timestamp, message.read]);
    } else {
      await promisifyDB(messagesDB.insert).call(messagesDB, {
        _id: message.id,
        id: message.id,
        sender_id: message.senderId,
        receiver_id: message.receiverId,
        content: message.content,
        time: message.time,
        timestamp: message.timestamp,
        read: false
      });
    }

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
    if (DATABASE_URL) {
      await messagesDB.query(`
        UPDATE messages 
        SET read = TRUE 
        WHERE receiver_id = $1 AND sender_id = $2 AND read = FALSE
      `, [userId, friendId]);
    } else {
      await promisifyDB(messagesDB.update).call(messagesDB,
        { receiver_id: userId, sender_id: friendId, read: false },
        { $set: { read: true } },
        { multi: true }
      );
    }
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
  console.log(DATABASE_URL ? 'Using PostgreSQL' : 'Using NeDB for development');
});

module.exports = app;
