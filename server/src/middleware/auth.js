import jwt from 'jsonwebtoken';

// ---------------------------------------------------------------------------
// JWT Secret — Production Startup Guard
// ---------------------------------------------------------------------------
// In production, the server MUST be started with a real, randomly-generated
// JWT_SECRET. If the secret is missing or matches the known development
// fallback, the server refuses to start to prevent deploying with an insecure
// credential.
// ---------------------------------------------------------------------------
const KNOWN_INSECURE_DEFAULT = 'prathna-billing-jwt-secret-key-2026';

if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === KNOWN_INSECURE_DEFAULT) {
    console.error('FATAL: JWT_SECRET is not set or is using the known insecure default value.');
    console.error('       Generate a secure secret with:');
    console.error("       node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
    console.error('       Then set JWT_SECRET in your .env file before starting the server.');
    process.exit(1);
  }
}

export const JWT_SECRET = process.env.JWT_SECRET || KNOWN_INSECURE_DEFAULT;

/**
 * Authentication middleware for protecting billing API routes.
 * Rejects unauthenticated requests with a clear 401 status.
 */
export function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({
        error: 'Authentication required. Please log in to continue.',
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256', 'HS512'] });
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Your session has expired. Please log in again.',
      });
    }
    return res.status(401).json({
      error: 'Invalid session token. Please log in again.',
    });
  }
}

/**
 * mustChangePassword enforcement middleware.
 *
 * When a user has mustChangePassword=true on their account, this middleware
 * blocks all API calls with a 403 "password-change-required" response EXCEPT
 * for the /auth/change-password endpoint itself.
 *
 * CRITICAL: The /auth/change-password route MUST be explicitly exempted here.
 * Without this exemption, a user with mustChangePassword=true has no route
 * left to satisfy the requirement and is permanently locked out.
 *
 * Usage: mount this middleware AFTER requireAuth on any route that needs it,
 * or apply it globally in index.js before all protected route groups.
 */
export function enforcePasswordChange(req, res, next) {
  // Explicit exemption: the change-password endpoint must always be reachable
  const isChangePasswordRoute =
    req.path === '/auth/change-password' ||
    req.path === '/api/auth/change-password' ||
    req.originalUrl?.endsWith('/auth/change-password');

  if (isChangePasswordRoute) {
    return next();
  }

  if (req.user && req.user.mustChangePassword) {
    return res.status(403).json({
      error: 'password-change-required',
      message: 'You must change your password before continuing. Please update your password to proceed.',
    });
  }

  next();
}

export default requireAuth;

