import { createEffect, createSignal, Component } from "solid-js";
import { useAppFramework } from "../core/AppFramework";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  for (const u of units) {
    if (v < 1024) return `${v.toFixed(2)} ${u}`;
    v /= 1024;
  }
  return `${v.toFixed(2)} PB`;
}

const DatabaseSize: Component = () => {
  const framework = useAppFramework();
  const [size, setSize] = createSignal<number | null>(null);

  async function fetchSize() {
    const result = await framework.errorManager.withErrorHandling(
      async () => await framework.repository.getDatabaseSize(),
      {
        errorTitle: '获取数据库大小失败',
        showLoading: false
      }
    );
    
    if (result !== null && result !== undefined) {
      setSize(result);
    } else {
      setSize(null);
    }
  }

  createEffect(() => {
    fetchSize();
  });

  return (
    <div
      style={{
        padding: "6px 8px",
        background: "#ffffff",
        color: "#000",
        border: "1px solid #4a565f",
        "border-radius": "6px",
        "font-size": "12px",
        display: "inline-flex",
        gap: "8px",
        "align-items": "center",
      }}
    >
      <span>数据库大小:</span>
      {size() !== null ? (
        <strong>{formatBytes(size() as number)}</strong>
      ) : (
        <span style={{ opacity: 0.7 }}>读取中...</span>
      )}
    </div>
  );
};

export default DatabaseSize;
