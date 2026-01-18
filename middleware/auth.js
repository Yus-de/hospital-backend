const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  let token;

    // Priority: Authorization Bearer token
      const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
              }

                // Fallback: HttpOnly cookie (recommended)
                  if (!token && req.cookies?.accessToken) {
                      token = req.cookies.accessToken;
                        }

                          if (!token) {
                              return res.status(401).json({ message: 'Authentication required' });
                                }

                                  try {
                                      const decoded = jwt.verify(token, process.env.JWT_SECRET);

                                          // Attach minimal user info only
                                              req.user = {
                                                    id: decoded.user.id,
                                                          role: decoded.user.role,
                                                              };

                                                                  // Safe audit log
                                                                      console.log(
                                                                            `AUTH | user=${req.user.id} | role=${req.user.role} | ip=${req.ip}`
                                                                                );

                                                                                    next();
                                                                                      } catch (error) {
                                                                                          console.error('JWT validation failed:', error.message);
                                                                                              return res.status(401).json({ message: 'Invalid or expired token' });
                                                                                                }
                                                                                                };

                                                                                                const admin = (req, res, next) => {
                                                                                                  if (!req.user || req.user.role !== 'ADMIN') {
                                                                                                      return res.status(403).json({ message: 'Admin access only' });
                                                                                                        }
                                                                                                          next();
                                                                                                          };

                                                                                                          const requireRole = (roles) => (req, res, next) => {
                                                                                                            const allowed = Array.isArray(roles) ? roles : [roles];

                                                                                                              if (!req.user || !allowed.includes(req.user.role)) {
                                                                                                                  return res.status(403).json({ message: 'Access denied' });
                                                                                                                    }
                                                                                                                      next();
                                                                                                                      };

                                                                                                                      module.exports = { auth, admin, requireRole };