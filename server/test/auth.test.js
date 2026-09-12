import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const { default: app } = await import('../src/index.js');
const { default: prisma } = await import('../src/db.js');
const { default: bcrypt } = await import('bcryptjs');

let server;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  // Ensure test user exists with bcrypt password
  const hashedPassword = await bcrypt.hash('password123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@prathna.com' },
    update: { password: hashedPassword },
    create: {
      name: 'Prathna Admin',
      email: 'admin@prathna.com',
      password: hashedPassword,
    },
  });
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await prisma.$disconnect();
});

test('Unauthenticated request to protected route is rejected with 401', async () => {
  const res = await fetch(`${baseUrl}/products`);
  assert.equal(res.status, 401, 'Unauthenticated request should return 401');
  const data = await res.json();
  assert.ok(data.error, 'Response should have an error message');
});

test('Unauthenticated request to dashboard is rejected with 401', async () => {
  const res = await fetch(`${baseUrl}/dashboard/summary`);
  assert.equal(res.status, 401, 'Unauthenticated request should return 401');
});

test('Login with incorrect password returns 401', async () => {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@prathna.com',
      password: 'wrongpassword',
    }),
  });
  assert.equal(res.status, 401, 'Wrong password should return 401');
  const data = await res.json();
  assert.ok(data.error.includes('Incorrect email or password'));
});

test('Login with valid credentials succeeds and returns JWT token', async () => {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@prathna.com',
      password: 'password123',
    }),
  });
  assert.equal(res.status, 200, 'Valid login should return 200');
  const data = await res.json();
  assert.ok(data.token, 'Should return JWT token');
  assert.equal(data.user.email, 'admin@prathna.com');
});

test('Authenticated request with valid token succeeds on protected route', async () => {
  // 1. Log in to get token
  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@prathna.com',
      password: 'password123',
    }),
  });
  const { token } = await loginRes.json();

  // 2. Make authenticated request to protected route
  const res = await fetch(`${baseUrl}/products`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  assert.equal(res.status, 200, 'Authenticated request should return 200');
  const products = await res.json();
  assert.ok(Array.isArray(products), 'Should return products array');
});

test('POST /auth/logout returns success message', async () => {
  const res = await fetch(`${baseUrl}/auth/logout`, {
    method: 'POST',
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.message.includes('Logged out'));
});
