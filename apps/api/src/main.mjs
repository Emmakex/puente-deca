import { createServer } from "./server.mjs";

const port = Number.parseInt(process.env.PORT ?? "8080", 10);
const server = createServer();

server.listen(port, () => {
  console.log(`Puente DeCA API listening on :${port}`);
});
