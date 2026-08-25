const jwt = require("jsonwebtoken");

const SECRET =
  process.env.JWT_SECRET ||
  "_ek7lFVuiIXLetxso83bLunmJp2xJA83XRUGUcsODUsJDAQ3Tqy8w2gIPEeQNQX1";
const ACCESS_EXP_SECONDS = 60 * 60; // 1 hora
const REFRESH_EXP_SECONDS = 60 * 60 * 24 * 30; // 30 dias

function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: "authenticated",
      aud: "authenticated",
      user_metadata: user.raw_user_meta_data || {},
    },
    SECRET,
    { expiresIn: ACCESS_EXP_SECONDS }
  );
}

function signRefreshToken(user) {
  return jwt.sign({ sub: user.id, type: "refresh" }, SECRET, { expiresIn: REFRESH_EXP_SECONDS });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

module.exports = { signAccessToken, signRefreshToken, verifyToken, ACCESS_EXP_SECONDS };
