import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import prisma from '../src/db.js';

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
    const loginRes = await fetch('http://localhost:5000/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: initialPass }),
    });
    const loginData = await loginRes.json();
    assert.equal(loginRes.status, 200);
    assert.equal(loginData.user.mustChangePassword, true, 'User must have mustChangePassword=true');

    const token = loginData.token;

    // 2. Access protected route -> 403 password-change-required
    const prodRes = await fetch('http://localhost:5000/products', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const prodData = await prodRes.json();
    assert.equal(prodRes.status, 403, 'Protected route must reject with 403');
    assert.equal(prodData.error, 'password-change-required');

    // 3. /auth/change-password endpoint must be EXEMPT and allow changing password
    const newPass = 'secure_new_password_2026';
    const changeRes = await fetch('http://localhost:5000/auth/change-password', {
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
    const prodRes2 = await fetch('http://localhost:5000/products', {
      headers: { Authorization: `Bearer ${newToken}` },
    });
    assert.equal(prodRes2.status, 200, 'Protected route must succeed after password change');
  } finally {
    await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
  }
});
