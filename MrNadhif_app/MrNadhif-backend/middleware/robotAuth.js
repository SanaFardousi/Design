// middleware/robotAuth.js
// Require x-api-key header for Pi-only routes
const robotAuth = (req, res, next) => {
  const key = req.headers['x-api-key'];
  if (key && key === process.env.ROBOT_API_KEY) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized: Invalid or missing API key' });
};

module.exports = robotAuth;