import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import Stripe from "stripe";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database("taskpay.db");

let stripeClient: Stripe | null = null;
function getStripe() {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      // In development, we might not have the key yet
      console.warn("STRIPE_SECRET_KEY is not set. Stripe features will fail.");
      return null;
    }
    stripeClient = new Stripe(key);
  }
  return stripeClient;
}

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    display_name TEXT,
    bio TEXT,
    avatar_url TEXT,
    balance REAL DEFAULT 0,
    is_live INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    title TEXT,
    description TEXT,
    price REAL,
    status TEXT DEFAULT 'pending', -- pending, paid, completed
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
    status TEXT DEFAULT 'pending', -- pending, accepted, refused, completed, paid
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(creator_id) REFERENCES users(id),
    FOREIGN KEY(follower_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_type TEXT, -- 'task' or 'challenge'
    target_id INTEGER,
    payer_id INTEGER,
    amount REAL,
    stripe_payment_intent_id TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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
        u.balance as total_earned,
        (SELECT COUNT(*) FROM followers f WHERE f.following_id = u.id) as follower_count
      FROM users u
      ORDER BY ${orderBy} DESC
      LIMIT 10
    `).all();
    res.json(ranking);
  });

  // Stripe Payments
  app.post("/api/create-payment-intent", async (req, res) => {
    const { amount, targetType, targetId, username } = req.body;
    const stripe = getStripe();
    if (!stripe) return res.status(500).json({ error: "Stripe not configured" });

    const user = db.prepare("SELECT id FROM users WHERE username = ?").get(username) as { id: number };
    if (!user) return res.status(404).json({ error: "User not found" });

    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Stripe expects cents
        currency: "brl",
        metadata: {
          targetType,
          targetId,
          userId: user.id.toString(),
        },
      });

      // Record pending payment
      db.prepare("INSERT INTO payments (target_type, target_id, payer_id, amount, stripe_payment_intent_id, status) VALUES (?, ?, ?, ?, ?, ?)")
        .run(targetType, targetId, user.id, amount, paymentIntent.id, 'pending');

      res.json({ clientSecret: paymentIntent.client_secret });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/confirm-payment", async (req, res) => {
    const { paymentIntentId } = req.body;
    const stripe = getStripe();
    if (!stripe) return res.status(500).json({ error: "Stripe not configured" });

    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (paymentIntent.status === "succeeded") {
        const { targetType, targetId } = paymentIntent.metadata;
        
        // Update payment status
        db.prepare("UPDATE payments SET status = 'completed' WHERE stripe_payment_intent_id = ?")
          .run(paymentIntentId);

        if (targetType === 'task') {
          db.prepare("UPDATE tasks SET status = 'paid' WHERE id = ?").run(targetId);
        } else if (targetType === 'challenge') {
          db.prepare("UPDATE challenges SET total_raised = total_raised + ? WHERE id = ?")
            .run(paymentIntent.amount / 100, targetId);
        }

        res.json({ success: true });
      } else {
        res.status(400).json({ error: "Payment not succeeded" });
      }
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Payout / Commission Logic
  const processPayout = (targetType: 'task' | 'challenge', targetId: string, userId: number, amount: number) => {
    const commission = amount * 0.05;
    const netAmount = amount - commission;

    if (targetType === 'task') {
      db.prepare("UPDATE tasks SET status = 'completed' WHERE id = ?").run(targetId);
    } else {
      db.prepare("UPDATE challenges SET status = 'completed' WHERE id = ?").run(targetId);
    }

    db.prepare("UPDATE users SET balance = balance + ? WHERE id = ?").run(netAmount, userId);
    return { netAmount, commission };
  };

  app.post("/api/tasks/:id/complete", (req, res) => {
    const taskId = req.params.id;
    const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as any;
    if (!task || task.status !== 'paid') return res.status(400).json({ error: "Invalid task state" });

    const result = processPayout('task', taskId, task.user_id, task.price);
    res.json({ success: true, ...result });
  });

  app.post("/api/challenges/:id/complete", (req, res) => {
    const challengeId = req.params.id;
    const challenge = db.prepare("SELECT * FROM challenges WHERE id = ?").get(challengeId) as any;
    if (!challenge || challenge.status !== 'accepted') return res.status(400).json({ error: "Invalid challenge state" });
    if (challenge.total_raised <= 0) return res.status(400).json({ error: "No funds to payout" });

    const recipientId = challenge.creator_id; 
    const result = processPayout('challenge', challengeId, recipientId, challenge.total_raised);
    res.json({ success: true, ...result });
  });

  app.post("/api/withdraw", (req, res) => {
    const { username, amount, fee } = req.body;
    const totalDeduction = amount + fee;
    
    const user = db.prepare("SELECT balance FROM users WHERE username = ?").get(username) as { balance: number };
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.balance < totalDeduction) return res.status(400).json({ error: "Insufficient balance" });

    db.prepare("UPDATE users SET balance = balance - ? WHERE username = ?").run(totalDeduction, username);
    res.json({ success: true });
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
