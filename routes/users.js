const express = require('express');
const router = express.Router();
const { auth, admin } = require('../middleware/auth');
const { check } = require('express-validator');
const { createUser, loginUser } = require('../controllers/users.controller');

// Create user
router.post(
  '/users',
  [
    auth,
    admin,
    [
      check('email', 'Please include a valid email').isEmail(),
      check(
        'password',
        'Please enter a password with 6 or more characters'
      ).isLength({ min: 6 }),
      check('role', 'Role is required').not().isEmpty(),
    ],
  ],
  createUser
);

// Login user
router.post(
  '/auth',
  [
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Password is required').exists(),
  ],
  loginUser
);

module.exports = router;
