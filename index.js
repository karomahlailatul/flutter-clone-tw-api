// index.js
const express = require("express");
const { PrismaClient } = require("@prisma/client");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const app = express();
const prisma = new PrismaClient();

app.use(express.json());

// Middleware
const auth = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");
    if (!token) throw new Error("No token provided");

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user) throw new Error("User not found");

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: "Please authenticate" });
  }
};




// Auth Routes
app.post("/api/register", async (req, res) => {
  try {
    const { email, username, password } = req.body;

    // Check if user exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
    });

    if (existingUser) {
      return res.status(400).json({ error: "Email or username already taken" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        username,
        password: hashedPassword,
      },
    });

    // Generate token
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: "24h",
    });

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
      token,
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(400).json({ error: "Registration failed" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: "24h",
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
      token,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(400).json({ error: "Login failed" });
  }
});

// Posts Routes
app.post("/api/posts", auth, async (req, res) => {
  try {
    const { content, replyToId } = req.body;

    const post = await prisma.post.create({
      data: {
        content,
        authorId: req.user.id,
        replyToId,
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    res.status(201).json(post);
  } catch (error) {
    console.error("Create post error:", error);
    res.status(400).json({ error: "Failed to create post" });
  }
});

app.get("/api/posts", async (req, res) => {
  try {
    const page = parseInt(req.query.page || "1");
    const limit = parseInt(req.query.limit || "20");
    const skip = (page - 1) * limit;

    const posts = await prisma.post.findMany({
      where: {
        replyToId: null, // Only get main posts, not replies
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
          },
        },
        _count: {
          select: {
            replies: true,
            likes: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    });

    res.json(posts);
  } catch (error) {
    console.error("Fetch posts error:", error);
    res.status(400).json({ error: "Failed to fetch posts" });
  }
});

// Get Post Replies
app.get("/api/posts/:postId/replies", async (req, res) => {
  try {
    const { postId } = req.params;
    const page = parseInt(req.query.page || "1");
    const limit = parseInt(req.query.limit || "20");
    const skip = (page - 1) * limit;

    const replies = await prisma.post.findMany({
      where: {
        replyToId: postId,
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
          },
        },
        _count: {
          select: {
            likes: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    });

    res.json(replies);
  } catch (error) {
    console.error("Fetch replies error:", error);
    res.status(400).json({ error: "Failed to fetch replies" });
  }
});

// Like/Unlike Post
app.post("/api/posts/:postId/like", auth, async (req, res) => {
  try {
    const { postId } = req.params;

    const existingLike = await prisma.like.findUnique({
      where: {
        postId_userId: {
          postId,
          userId: req.user.id,
        },
      },
    });

    if (existingLike) {
      // Unlike
      await prisma.like.delete({
        where: {
          postId_userId: {
            postId,
            userId: req.user.id,
          },
        },
      });
    } else {
      // Like
      await prisma.like.create({
        data: {
          postId,
          userId: req.user.id,
        },
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Like/Unlike error:", error);
    res.status(400).json({ error: "Failed to like/unlike post" });
  }
});

// Follow/Unfollow User
app.post("/api/users/:userId/follow", auth, async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId === req.user.id) {
      return res.status(400).json({ error: "Cannot follow yourself" });
    }

    const existingFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: req.user.id,
          followingId: userId,
        },
      },
    });

    if (existingFollow) {
      // Unfollow
      await prisma.follow.delete({
        where: {
          followerId_followingId: {
            followerId: req.user.id,
            followingId: userId,
          },
        },
      });
    } else {
      // Follow
      await prisma.follow.create({
        data: {
          followerId: req.user.id,
          followingId: userId,
        },
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Follow/Unfollow error:", error);
    res.status(400).json({ error: "Failed to follow/unfollow user" });
  }
});

// Get User Profile
app.get("/api/users/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        createdAt: true,
        _count: {
          select: {
            posts: true,
            followers: true,
            following: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("Fetch profile error:", error);
    res.status(400).json({ error: "Failed to fetch user profile" });
  }
});

// Get User Feed (posts from followed users)
app.get("/api/feed", auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page || "1");
    const limit = parseInt(req.query.limit || "20");
    const skip = (page - 1) * limit;

    const following = await prisma.follow.findMany({
      where: {
        followerId: req.user.id,
      },
      select: {
        followingId: true,
      },
    });

    const followingIds = following.map((f) => f.followingId);

    const posts = await prisma.post.findMany({
      where: {
        authorId: {
          in: followingIds,
        },
        replyToId: null,
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
          },
        },
        _count: {
          select: {
            replies: true,
            likes: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    });

    res.json(posts);
  } catch (error) {
    console.error("Fetch feed error:", error);
    res.status(400).json({ error: "Failed to fetch feed" });
  }
});

// Handle Error
app.all(
  "*",
  (
    req,
    res
    // next: NextFunction
  ) => {
    if (req)
      return res.send(
        "This is not the page you are looking for. Please check the URL and try again."
      );
  }
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
