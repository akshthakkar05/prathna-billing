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
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await prisma.$disconnect();
});

test('Password change enforcement flow: 403 on protected routes, /auth/change-password reachable, flag clears', async () => {
  const testEmail = `mustchange_${Date.now()}@example.com`;
  const initialPass = 'initial_temp_pass';
  const hashed = await bcrypt.hash(initialPass, 10);

  const testUser = await prisma.user.create({
    data: {
      name: 'Temp User',
      email: testEmail,
      password: hashed,
      mustChangePassword: true,
    },
  });

  try {
    // 1. Log in
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: initialPass }),
    });
    const loginData = await loginRes.json();
    assert.equal(loginRes.status, 200);
    assert.equal(loginData.user.mustChangePassword, true, 'User must have mustChangePassword=true');

    const token = loginData.token;

    // 2. Access protected route -> 403 password-change-required
    const prodRes = await fetch(`${baseUrl}/products`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const prodData = await prodRes.json();
    assert.equal(prodRes.status, 403, 'Protected route must reject with 403');
    assert.equal(prodData.error, 'password-change-required');

    // 3. /auth/change-password endpoint must be EXEMPT and allow changing password
    const newPass = 'secure_new_password_2026';
    const changeRes = await fetch(`${baseUrl}/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        currentPassword: initialPass,
        newPassword: newPass,
      }),
    });
    const changeData = await changeRes.json();
    assert.equal(changeRes.status, 200, 'Password change must succeed');
    assert.equal(changeData.user.mustChangePassword, false, 'mustChangePassword must be set to false');

    // 4. Access protected route with new token -> 200 OK
    const newToken = changeData.token;
    const prodRes2 = await fetch(`${baseUrl}/products`, {
      headers: { Authorization: `Bearer ${newToken}` },
    });
    assert.equal(prodRes2.status, 200, 'Protected route must succeed after password change');
  } finally {
    await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
  }
});
