const app = require("./app");

const port = process.env.PORT || 8080;

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
app.get("/", (req, res) => {
  res.send("✅ Backend is running!");
});
