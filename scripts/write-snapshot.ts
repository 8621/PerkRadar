import { getBoardState } from "../src/lib/board";
import { writeDealSnapshot } from "../src/lib/snapshot";

const board = getBoardState();
const target = writeDealSnapshot(board);
if (!target) {
  console.error("snapshot directory is off or missing");
  process.exit(1);
}
console.log(target);
