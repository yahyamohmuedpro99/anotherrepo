import { apiReporter, buildRooms } from './server.js';

const secret = process.env.ROOM_TOKEN_SECRET;
const internal = process.env.INTERNAL_SECRET;
if (!secret || !internal) {
  console.error('ROOM_TOKEN_SECRET and INTERNAL_SECRET must be set (the same values as the API).');
  process.exit(1);
}
const deps = { ...apiReporter(process.env.API_URL ?? 'http://localhost:4000', internal), secret };
const { game } = buildRooms(deps);
const port = Number(process.env.PORT ?? 2567);
await game.listen(port);
console.log(JSON.stringify({ msg: 'rooms listening', port }));
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => void game.gracefullyShutdown());
