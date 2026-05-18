import app from "./app";
import https from "https";
import fs from "fs";

const PORT = process.env.PORT || 5000;
  const privateKey = fs.readFileSync('localhost-key.pem', 'utf8');
  const certificate = fs.readFileSync('localhost.pem', 'utf8');

const passphrase = 'abc123';
const credentials = { key: privateKey, passphrase, cert: certificate };
const httpsServer = https.createServer(credentials, app);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});