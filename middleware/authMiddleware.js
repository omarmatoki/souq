const jwt = require('jsonwebtoken');

const SECRET_KEY = process.env.SECRET_KEY;

// Middleware للتحقق من التوكن
const authMiddleware = (req, res, next) => {
  const token = req.headers['authorization'];
  
  if (!token) {
    return res.status(403).json({ error: "غير مصرح - لم يتم توفير رمز المصادقة" });
  }

  const tokenWithoutBearer = token.split(' ')[1];
  
  jwt.verify(tokenWithoutBearer, SECRET_KEY, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: "غير مصرح - رمز المصادقة غير صالح" });
    }
    req.user = decoded;
    next();
  });
};

module.exports = authMiddleware;