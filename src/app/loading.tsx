import "../components/deal-board.css";

export default function Loading() {
  return (
    <div className="perk-board">
      <div className="board-loading" role="status" data-testid="loading">正在读取服务器上的真实结果…</div>
    </div>
  );
}
