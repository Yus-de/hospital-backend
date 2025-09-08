const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  let token = req.header('x-auth-token');

  if (!token) {
    const authHeader = req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7, authHeader.length);
    }
  }
  
  console.log('Token:', token);

  if (!token) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded.user;
    console.log('Decoded user:', req.user);
    next();
  } catch (err) {
    console.error('Token verification error:', err.message);
    res.status(401).json({ msg: 'Token is not valid' });
  }
};

const admin = (req, res, next) => {
  console.log('Admin middleware, user role:', req.user.role);
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ msg: 'Access denied' });
  }
  next();
};

module.exports = { auth, admin };
