import dns from "dns";
dns.setDefaultResultOrder("ipv4first");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

import express, { Request, Response, NextFunction } from "express";
import mongoose, { Schema, Document, Model } from "mongoose";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "";
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_this";

/* ------------------------------------------------------------------ */
/* 1. DATABASE CONNECTION (cached for serverless cold starts)         */
/* ------------------------------------------------------------------ */

let isConnected = false;

async function connectDB(): Promise<void> {
  if (isConnected) return;
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is not set in environment variables");
  }
  await mongoose.connect(MONGODB_URI);
  isConnected = true;
  console.log("MongoDB connected");
}

/* ------------------------------------------------------------------ */
/* 2. MODELS                                                          */
/* ------------------------------------------------------------------ */

interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  createdAt: Date;
}

const userSchema = new Schema<IUser>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", userSchema);

interface IComment {
  author: string;
  text: string;
  createdAt: Date;
}

interface IPost extends Document {
  type: "Lost" | "Found";
  title: string;
  description: string;
  location: string;
  image: string | null; // New field for image URL
  author: string;
  authorId: mongoose.Types.ObjectId;
  reactions: number;
  likedBy: string[];
  comments: IComment[];
  createdAt: Date;
}

const commentSchema = new Schema<IComment>(
  {
    author: { type: String, required: true },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const postSchema = new Schema<IPost>({
  type: { type: String, enum: ["Lost", "Found"], required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  location: { type: String, default: "Not specified" },
  image: { type: String, default: null }, // Image URL field
  author: { type: String, required: true },
  authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  reactions: { type: Number, default: 0 },
  likedBy: { type: [String], default: [] },
  comments: { type: [commentSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
});

const Post: Model<IPost> =
  mongoose.models.Post || mongoose.model<IPost>("Post", postSchema);

/* ------------------------------------------------------------------ */
/* 3. SERVICES (business logic)                                       */
/* ------------------------------------------------------------------ */

const AuthService = {
  async signup(name: string, email: string, password: string) {
    const existing = await User.findOne({ email });
    if (existing) throw new Error("Email is already registered");

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashed });

    const token = jwt.sign({ id: user._id, name: user.name }, JWT_SECRET, {
      expiresIn: "7d",
    });

    return {
      token,
      user: { id: user._id, name: user.name, email: user.email },
    };
  },

  async login(email: string, password: string) {
    const user = await User.findOne({ email });
    if (!user) throw new Error("Invalid email or password");

    const match = await bcrypt.compare(password, user.password);
    if (!match) throw new Error("Invalid email or password");

    const token = jwt.sign({ id: user._id, name: user.name }, JWT_SECRET, {
      expiresIn: "7d",
    });

    return {
      token,
      user: { id: user._id, name: user.name, email: user.email },
    };
  },
};

const PostService = {
  async getAllPosts() {
    return Post.find().sort({ createdAt: -1 });
  },

  async createPost(data: {
    type: "Lost" | "Found";
    title: string;
    description: string;
    location: string;
    image: string | null;
    authorId: string;
    author: string;
  }) {
    return Post.create(data);
  },

  async toggleLike(postId: string, userId: string) {
    const post = await Post.findById(postId);
    if (!post) throw new Error("Post not found");

    const alreadyLiked = post.likedBy.includes(userId);
    if (alreadyLiked) {
      post.likedBy = post.likedBy.filter((id) => id !== userId);
      post.reactions = Math.max(0, post.reactions - 1);
    } else {
      post.likedBy.push(userId);
      post.reactions += 1;
    }
    await post.save();
    return post;
  },

  async addComment(postId: string, author: string, text: string) {
    const post = await Post.findById(postId);
    if (!post) throw new Error("Post not found");

    post.comments.push({ author, text, createdAt: new Date() });
    await post.save();
    return post;
  },
};

/* ------------------------------------------------------------------ */
/* 4. CONTROLLERS (request / response handling)                       */
/* ------------------------------------------------------------------ */

const AuthController = {
  async signup(req: Request, res: Response) {
    try {
      const { name, email, password } = req.body;
      if (!name || !email || !password) {
        return res.status(400).json({ message: "All fields are required" });
      }
      const result = await AuthService.signup(name, email, password);
      return res.status(201).json(result);
    } catch (err: any) {
      return res.status(400).json({ message: err.message });
    }
  },

  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "All fields are required" });
      }
      const result = await AuthService.login(email, password);
      return res.status(200).json(result);
    } catch (err: any) {
      return res.status(401).json({ message: err.message });
    }
  },
};

const PostController = {
  async getAllPosts(req: Request, res: Response) {
    try {
      const posts = await PostService.getAllPosts();
      return res.status(200).json(posts);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  },

  async createPost(req: AuthRequest, res: Response) {
    try {
      const { type, title, description, location, image } = req.body;
      if (!type || !title || !description) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      const post = await PostService.createPost({
        type,
        title,
        description,
        location: location || "Not specified",
        image: image || null,
        authorId: req.userId!,
        author: req.userName!,
      });
      return res.status(201).json(post);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  },

  async toggleLike(req: AuthRequest, res: Response) {
    try {
      const post = await PostService.toggleLike(req.params.id, req.userId!);
      return res.status(200).json(post);
    } catch (err: any) {
      return res.status(400).json({ message: err.message });
    }
  },

  async addComment(req: AuthRequest, res: Response) {
    try {
      const { text } = req.body;
      if (!text)
        return res.status(400).json({ message: "Comment text is required" });

      const post = await PostService.addComment(
        req.params.id,
        req.userName!,
        text,
      );
      return res.status(201).json(post);
    } catch (err: any) {
      return res.status(400).json({ message: err.message });
    }
  },
};

/* ------------------------------------------------------------------ */
/* 5. MIDDLEWARE                                                      */
/* ------------------------------------------------------------------ */

interface AuthRequest extends Request {
  userId?: string;
  userName?: string;
}

function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }
  const token = header.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: string;
      name: string;
    };
    req.userId = decoded.id;
    req.userName = decoded.name;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

/* ------------------------------------------------------------------ */
/* 6. EXPRESS APP + ROUTES                                             */
/* ------------------------------------------------------------------ */

const app = express();

app.use(cors());
app.use(express.json());

// Ensure DB connection before handling any request (important for serverless)
app.use(async (req: Request, res: Response, next: NextFunction) => {
  try {
    await connectDB();
    next();
  } catch (err: any) {
    res
      .status(500)
      .json({ message: "Database connection failed", error: err.message });
  }
});

app.get("/api/health", (req: Request, res: Response) => {
  res
    .status(200)
    .json({ status: "ok", message: "Lost & Found API is running" });
});

// Auth routes
app.post("/api/auth/signup", AuthController.signup);
app.post("/api/auth/login", AuthController.login);

// Post routes
app.get("/api/posts", PostController.getAllPosts);
app.post("/api/posts", authMiddleware, PostController.createPost as any);
app.post(
  "/api/posts/:id/like",
  authMiddleware,
  PostController.toggleLike as any,
);
app.post(
  "/api/posts/:id/comments",
  authMiddleware,
  PostController.addComment as any,
);

// Fallback 404
app.use((req: Request, res: Response) => {
  res.status(404).json({ message: "Route not found" });
});

/* ------------------------------------------------------------------ */
/* 7. LOCAL DEV SERVER + VERCEL EXPORT                                 */
/* ------------------------------------------------------------------ */

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running locally on http://localhost:${PORT}`);
  });
}

export default app;
