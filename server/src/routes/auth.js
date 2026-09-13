import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../db.js';
import { requireAuth, JWT_SECRET } from '../middleware/auth.js';

const router = Router();

// GET /auth/status - check if initial user exists and return public branding
router.get('/status', async (req, res) => {
  try {
    const [userCount, company] = await Promise.all([
      prisma.user.count(),
      prisma.companySettings.findFirst({
        select: { name: true, logoUrl: true },
      }),
    ]);
    res.json({
      hasUsers: userCount > 0,
      company: company || { name: 'Prathna Enterprises', logoUrl: null },
    });
  } catch (error) {
    console.error('Error checking auth status:', error);
    res.status(500).json({ error: 'Failed to check system status' });
  }
});

// POST /auth/register - create new user or initial owner account
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email is required' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Check if user already exists
    const existing = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (existing) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    // Hash password with bcrypt
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: cleanEmail,
        password: hashedPassword,
      },
    });

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to create account', details: error.message });
  }
});

// POST /auth/login - authenticate user and issue JWT
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !email.trim() || !password) {
      return res.status(400).json({ error: 'Please enter both email and password' });
    }

    const cleanEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (!user) {
      return res.status(401).json({ error: 'Incorrect email or password. Please try again.' });
    }

    // Compare bcrypt password (with automatic migration fallback if user was seeded plaintext)
    let isMatch = false;
    if (user.password.startsWith('$2')) {
      isMatch = await bcrypt.compare(password, user.password);
    } else {
      // Legacy plaintext check -> upgrade to bcrypt immediately
      if (user.password === password) {
        isMatch = true;
        const newHashed = await bcrypt.hash(password, 10);
        await prisma.user.update({
          where: { id: user.id },
          data: { password: newHashed },
        });
      }
    }

    if (!isMatch) {
      return res.status(401).json({ error: 'Incorrect email or password. Please try again.' });
    }

    // Issue JWT token (7 days expiry for internal shop counter convenience)
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        mustChangePassword: user.mustChangePassword,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Logged in successfully',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        mustChangePassword: user.mustChangePassword,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to log in', details: error.message });
  }
});

// POST /auth/logout - simple logout confirmation
router.post('/logout', (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

// GET /auth/me - restore session or get current user info
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        mustChangePassword: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// POST /auth/change-password
// IMPORTANT: This endpoint MUST remain accessible even when mustChangePassword=true.
// If the enforcing middleware (in index.js or app.js) blocks requests when the flag is set,
// this route must be explicitly exempted — otherwise the user has no way to fulfil the
// requirement and becomes permanently locked out.
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Both current and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'New password must be different from your current password' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    let isMatch = false;
    if (user.password.startsWith('$2')) {
      isMatch = await bcrypt.compare(currentPassword, user.password);
    } else {
      isMatch = user.password === currentPassword;
    }

    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedNewPassword,
        mustChangePassword: false,  // Clear the flag once they've changed it
      },
    });

    // Issue a fresh token with mustChangePassword=false
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, mustChangePassword: false },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Password changed successfully',
      token,
      user: { id: user.id, name: user.name, email: user.email, mustChangePassword: false },
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password', details: error.message });
  }
});

export default router;
