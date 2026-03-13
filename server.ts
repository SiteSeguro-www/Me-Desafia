import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database("taskpay.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    display_name TEXT,
    bio TEXT,
    avatar_url TEXT,
    is_live INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    title TEXT,
    description TEXT,
    price REAL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS followers (
    follower_id INTEGER,
    following_id INTEGER,
    PRIMARY KEY(follower_id, following_id),
    FOREIGN KEY(follower_id) REFERENCES users(id),
    FOREIGN KEY(following_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS challenges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creator_id INTEGER,
    follower_id INTEGER,
    title TEXT,
    description TEXT,
    price REAL,
    total_raised REAL DEFAULT 0,
    status TEXT DEFAULT 'pending', -- pending, accepted, refused, paid
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(creator_id) REFERENCES users(id),
    FOREIGN KEY(follower_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER,
    payer_id INTEGER,
    amount REAL,
    status TEXT DEFAULT 'completed',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(task_id) REFERENCES tasks(id),
    FOREIGN KEY(payer_id) REFERENCES users(id)
  );
`);

// Seed some data if empty
const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
if (userCount.count === 0) {
  db.prepare("INSERT INTO users (username, display_name, bio, avatar_url) VALUES (?, ?, ?, ?)")
    .run("admin", "Task Master", "I do things for money.", "https://picsum.photos/seed/admin/200");
  db.prepare("INSERT INTO users (username, display_name, bio, avatar_url) VALUES (?, ?, ?, ?)")
    .run("user1", "John Doe", "Just watching.", "https://picsum.photos/seed/user1/200");
  db.prepare("INSERT INTO users (username, display_name, bio, avatar_url) VALUES (?, ?, ?, ?)")
    .run("creator2", "Aventureira", "Desafios extremos são comigo.", "https://picsum.photos/seed/creator2/200");
  db.prepare("INSERT INTO users (username, display_name, bio, avatar_url) VALUES (?, ?, ?, ?)")
    .run("creator3", "Gamer Pro", "Duvido você me vencer.", "https://picsum.photos/seed/creator3/200");

  // Add some initial tasks for ranking
  db.prepare("INSERT INTO tasks (user_id, title, description, price, status) VALUES (1, 'Raspar o cabelo', 'Vou raspar se bater a meta', 120, 'pending')").run();
  db.prepare("INSERT INTO tasks (user_id, title, description, price, status) VALUES (3, 'Pular de paraquedas', 'Meta para o próximo mês', 500, 'completed')").run();
  db.prepare("INSERT INTO tasks (user_id, title, description, price, status) VALUES (4, 'Maratona 24h', 'Jogando sem parar', 300, 'completed')").run();
  
  // Add some followers
  db.prepare("INSERT INTO followers (follower_id, following_id) VALUES (2, 1)").run();
  db.prepare("INSERT INTO followers (follower_id, following_id) VALUES (2, 3)").run();
  db.prepare("INSERT INTO followers (follower_id, following_id) VALUES (2, 4)").run();
  db.prepare("INSERT INTO followers (follower_id, following_id) VALUES (1, 3)").run();
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/users/:username", (req, res) => {
    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(req.params.username);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  });

  app.get("/api/users/:username/tasks", (req, res) => {
    const user = db.prepare("SELECT id FROM users WHERE username = ?").get(req.params.username) as { id: number };
    if (!user) return res.status(404).json({ error: "User not found" });
    const tasks = db.prepare("SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC").all(user.id);
    res.json(tasks);
  });

  app.post("/api/tasks", (req, res) => {
    const { username, title, description, price } = req.body;
    const user = db.prepare("SELECT id FROM users WHERE username = ?").get(username) as { id: number };
    if (!user) return res.status(404).json({ error: "User not found" });
    
    const info = db.prepare("INSERT INTO tasks (user_id, title, description, price) VALUES (?, ?, ?, ?)")
      .run(user.id, title, description, price);
    res.json({ id: info.lastInsertRowid });
  });

  app.post("/api/users/:username/follow", (req, res) => {
    const { followerUsername } = req.body;
    const following = db.prepare("SELECT id FROM users WHERE username = ?").get(req.params.username) as { id: number };
    const follower = db.prepare("SELECT id FROM users WHERE username = ?").get(followerUsername) as { id: number };
    
    try {
      db.prepare("INSERT INTO followers (follower_id, following_id) VALUES (?, ?)").run(follower.id, following.id);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: "Already following or error" });
    }
  });

  app.get("/api/users/:username/followers/count", (req, res) => {
    const user = db.prepare("SELECT id FROM users WHERE username = ?").get(req.params.username) as { id: number };
    const result = db.prepare("SELECT COUNT(*) as count FROM followers WHERE following_id = ?").get(user.id) as { count: number };
    res.json(result);
  });

  // Challenges API
  app.get("/api/users/:username/challenges", (req, res) => {
    const user = db.prepare("SELECT id FROM users WHERE username = ?").get(req.params.username) as { id: number };
    if (!user) return res.status(404).json({ error: "User not found" });
    const challenges = db.prepare(`
      SELECT c.*, u.username as follower_username, u.display_name as follower_display_name 
      FROM challenges c 
      JOIN users u ON c.follower_id = u.id 
      WHERE c.creator_id = ? 
      ORDER BY c.created_at DESC
    `).all(user.id);
    res.json(challenges);
  });

  app.post("/api/challenges", (req, res) => {
    const { creatorUsername, followerUsername, title, description, price } = req.body;
    const creator = db.prepare("SELECT id FROM users WHERE username = ?").get(creatorUsername) as { id: number };
    const follower = db.prepare("SELECT id FROM users WHERE username = ?").get(followerUsername) as { id: number };
    
    const info = db.prepare("INSERT INTO challenges (creator_id, follower_id, title, description, price) VALUES (?, ?, ?, ?, ?)")
      .run(creator.id, follower.id, title, description, price);
    res.json({ id: info.lastInsertRowid });
  });

  app.patch("/api/challenges/:id", (req, res) => {
    const { status } = req.body;
    db.prepare("UPDATE challenges SET status = ? WHERE id = ?").run(status, req.params.id);
    res.json({ success: true });
  });

  app.post("/api/payments", (req, res) => {
    const { taskId, payerUsername, amount } = req.body;
    const payer = db.prepare("SELECT id FROM users WHERE username = ?").get(payerUsername) as { id: number };
    
    db.prepare("INSERT INTO payments (task_id, payer_id, amount) VALUES (?, ?, ?)")
      .run(taskId, payer.id, amount);
    
    db.prepare("UPDATE tasks SET status = 'paid' WHERE id = ?").run(taskId);
    res.json({ success: true });
  });

  app.post("/api/challenges/:id/contribute", (req, res) => {
    const { amount } = req.body;
    db.prepare("UPDATE challenges SET total_raised = total_raised + ? WHERE id = ?").run(amount, req.params.id);
    res.json({ success: true });
  });

  app.get("/api/ranking", (req, res) => {
    const { sortBy } = req.query; // challenges_completed, total_earned, follower_count
    
    let orderBy = "challenges_completed";
    if (sortBy === "total_earned") orderBy = "total_earned";
    if (sortBy === "follower_count") orderBy = "follower_count";

    const ranking = db.prepare(`
      SELECT 
        u.id, 
        u.username, 
        u.display_name, 
        u.avatar_url,
        (SELECT COUNT(*) FROM tasks t WHERE t.user_id = u.id AND t.status = 'completed') as challenges_completed,
        (SELECT COALESCE(SUM(amount), 0) FROM payments p JOIN tasks t ON p.task_id = t.id WHERE t.user_id = u.id) as total_earned,
        (SELECT COUNT(*) FROM followers f WHERE f.following_id = u.id) as follower_count
      FROM users u
      ORDER BY ${orderBy} DESC
      LIMIT 10
    `).all();
    res.json(ranking);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
