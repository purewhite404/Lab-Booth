import jwt from "jsonwebtoken";

export function login(req, res) {
  const { password } = req.body || {};
  if (password === process.env.ADMIN_PASSWORD) {
    const token = jwt.sign({ role: "admin" }, process.env.ADMIN_PASSWORD, {
      expiresIn: "7d",
    });
    return res.json({ token });
  }
  res.status(401).json({ error: "Invalid password" });
}
