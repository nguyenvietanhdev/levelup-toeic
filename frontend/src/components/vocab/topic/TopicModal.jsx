import { useState, useEffect, useMemo } from "react";
import { useEscapeToClose } from '@lib/useEscapeToClose.js';
import { Notification } from "@ui/Toaster.jsx";
import { useTopics } from "./useTopics.js";
import LevelBar from "./LevelBar.jsx";

export default function TopicModal({ open, onClose, onSelected }) {
    useEscapeToClose(onClose, open);
  const {
    shared,
    personal,
    wrong,
    current,
    loadingShared,
    loadingPersonal,
    loadingWrong,
    loadShared,
    loadPersonal,
    loadWrong,
    selectShared,
    selectSharedWithMe,
    copyShared,
    selectPersonal,
    selectWrong,
  } = useTopics({ enabled: open });
  const [tab, setTab] = useState("shared");
  const [query, setQuery] = useState("");
  const [searchReadOnly, setSearchReadOnly] = useState(true); // prevent autofill until user interacts
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!open) return;
    loadShared();
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, loadShared, onClose]);

  useEffect(() => {
    if (open && tab === "personal") loadPersonal();
    if (open && tab === "wrong") loadWrong();
  }, [open, tab, loadPersonal, loadWrong]);

  const filteredShared = useMemo(() => {
    const kw = query.trim().toLowerCase();
    if (!kw) return shared;
    return shared.filter(
      (t) =>
        (t.source || "").toLowerCase().includes(kw) ||
        (t.name || "").toLowerCase().includes(kw),
    );
  }, [shared, query]);

  // Đang tải tab nào thì nút quay tab đó. Lấy từ chính cờ của `useTopics` chứ
  // không nuôi state riêng — hai nguồn sự thật thì có lúc nút quay mãi không
  // dừng (hoặc dừng trước khi dữ liệu về).
  const refreshing =
    tab === "shared" ? loadingShared
    : tab === "personal" ? loadingPersonal
    : loadingWrong;

  async function handleRefresh() {
    if (refreshing) return;
    try {
      // `true` = bỏ qua đệm. Thiếu nó thì tab "Từ vựng chung" chỉ set lại đúng
      // mảng đang có và danh sách không đổi gì cả.
      if (tab === "shared") await loadShared(true);
      else if (tab === "personal") await loadPersonal();
      else await loadWrong();
    } catch (err) {
      Notification.error(err.message || "Không tải lại được danh sách");
    }
  }

  if (!open) return null;

  function afterSelect() {
    onSelected?.();
    onClose();
  }

  async function handleSelectShared(topicId) {
    if (busyId) return;
    if (current?.id === topicId) { afterSelect(); return; }
    setBusyId(topicId);
    try {
      await selectShared(topicId);
      afterSelect();
    } catch {
      Notification.error("Không thể chọn đề này");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSelectPersonal(source) {
    if (busyId) return;
    setBusyId(`personal:${source}`);
    try {
      await selectPersonal(source);
      afterSelect();
    } catch (err) {
      Notification.error(err.message || "Không thể tải từ vựng này");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSelectSharedWithMe(ownerEmail, source) {
    if (busyId) return;
    setBusyId(`shared:${ownerEmail}:${source}`);
    try {
      await selectSharedWithMe(ownerEmail, source);
      afterSelect();
    } catch (err) {
      Notification.error(err.message || "Không thể tải bộ từ này");
    } finally {
      setBusyId(null);
    }
  }

  async function handleCopyShared(ownerEmail, source) {
    if (busyId) return;
    setBusyId(`copy:${ownerEmail}:${source}`);
    try {
      const res = await copyShared(ownerEmail, source);
      if (res?.success) {
        Notification.success(res.message || "Đã sao chép về kho của bạn");
      } else {
        // Server nói rõ lý do (vượt hạn mức, bộ đã hết hạn…) — hiện nguyên văn
        // thay vì nuốt đi rồi báo chung chung.
        Notification.error(res?.message || "Sao chép thất bại");
      }
    } catch (err) {
      Notification.error(err.message || "Không kết nối được máy chủ");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSelectWrong(source) {
    if (busyId) return;
    setBusyId(`wrong:${source}`);
    try {
      await selectWrong(source);
      afterSelect();
    } catch (err) {
      Notification.error(err.message || "Không thể tải từ sai");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div id="modal-container" className="active">
      <div className="modal-backdrop" onClick={onClose}></div>
      <div className="modal">
        <div className="modal-header">
          <h3>📚 Chọn đề luyện tập</h3>
          <input
            type="search"
            name="topic-search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            placeholder="Tìm theo source..."
            id="modal-header-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="modal-header-search"
            readOnly={searchReadOnly}
            onFocus={() => setSearchReadOnly(false)}
            onMouseDown={() => setSearchReadOnly(false)}
            style={{
              flex: 1,
              marginLeft: 16,
              marginRight: 8,
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--border-color)",
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              fontSize: 13,
            }}
          />
          {/* Tải lại ĐÚNG tab đang mở — mỗi tab một nguồn dữ liệu riêng, làm
              mới cả ba là ba request thừa cho thứ người dùng không nhìn thấy. */}
          <button
            className="icon-btn modal-header-refresh"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Tải lại danh sách"
            aria-label="Tải lại danh sách"
          >
            <i className={`fas fa-rotate-right${refreshing ? ' fa-spin' : ''}`}></i>
          </button>
          <button className="icon-btn modal-close-btn" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="modal-body">
          <div className="topic-selection-container">
            <div className="topic-tabs">
              <button
                className={`tab-btn ${tab === "shared" ? "active" : ""}`}
                onClick={() => setTab("shared")}
              >
                <i className="fas fa-globe"></i> Từ vựng chung
              </button>
              <button
                className={`tab-btn ${tab === "personal" ? "active" : ""}`}
                onClick={() => setTab("personal")}
              >
                <i className="fas fa-user"></i> Từ vựng riêng
              </button>
              <button
                className={`tab-btn ${tab === "wrong" ? "active" : ""}`}
                onClick={() => setTab("wrong")}
              >
                <i className="fas fa-times-circle"></i> Từ vựng sai
              </button>
            </div>

            {tab === "shared" ? (
              <div className="tab-content active">
                <p className="topic-hint">
                  Chọn bộ từ vựng bạn muốn luyện tập:
                </p>
                <div className="topics-list">
                  {loadingShared ? (
                    <p
                      style={{
                        gridColumn: "1 / -1",
                        textAlign: "center",
                        padding: 20,
                        color: "var(--text-secondary)",
                      }}
                    >
                      <i className="fas fa-spinner fa-spin"></i> Đang tải...
                    </p>
                  ) : filteredShared.length === 0 ? (
                    <p
                      style={{
                        gridColumn: "1 / -1",
                        textAlign: "center",
                        padding: 20,
                        color: "var(--text-secondary)",
                      }}
                    >
                      {query ? "Không tìm thấy đề phù hợp" : "Không có đề nào"}
                    </p>
                  ) : (
                    filteredShared.map((topic) => {
                      const isSelected = current?.id === topic.id;
                      const isBusy = busyId === topic.id;
                      return (
                        <div
                          key={topic.id}
                          className={`topic-card ${isSelected ? "selected" : ""} ${isBusy ? "loading" : ""}`}
                          onClick={() => handleSelectShared(topic.id)}
                        >
                          <div className="topic-icon">{topic.icon}</div>
                          <div className="topic-details">
                            <h4 title={topic.name}>{topic.name}</h4>
                            {topic.description && (
                              <p className="topic-description">
                                {topic.description}
                              </p>
                            )}
                            <div className="topic-meta">
                              <span className="word-count">
                                <i className="fas fa-book"></i>{" "}
                                {topic.wordCount} từ
                              </span>
                            </div>
                            <LevelBar stats={topic.levelStats} />
                          </div>
                          {isSelected && (
                            <div className="current-badge">
                              <i className="fas fa-check-circle"></i> Đang chọn
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : tab === "personal" ? (
              <div className="tab-content active">
                <p className="topic-hint">Từ vựng bạn đã tải lên:</p>
                <div className="topics-list">
                  {loadingPersonal ? (
                    <p
                      style={{
                        gridColumn: "1 / -1",
                        textAlign: "center",
                        padding: 20,
                        color: "var(--text-secondary)",
                      }}
                    >
                      <i className="fas fa-spinner fa-spin"></i> Đang tải...
                    </p>
                  ) : personal.length === 0 ? (
                    <div
                      style={{
                        gridColumn: "1 / -1", // span hết lưới, nếu không sẽ lệch về cột đầu
                        textAlign: "center",
                        padding: "18px 20px",
                        color: "var(--text-secondary)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        minHeight: 180,
                        width: "100%",
                      }}
                    >
                      <i
                        className="fas fa-cloud-upload-alt"
                        style={{
                          fontSize: 32,
                          opacity: 0.4,
                          display: "block",
                          width: "fit-content",
                          margin: "0 auto 8px",
                        }}
                      ></i>
                      <p
                        style={{
                          margin: "0 0 8px",
                          fontWeight: 600,
                          color: "var(--text-primary)",
                        }}
                      >
                        Chưa có từ vựng riêng
                      </p>
                      <p style={{ margin: 0, fontSize: 13, textAlign: 'center' }}>
                        Bấm nút tải lên ☁️ ở thanh điều hướng để thêm từ vựng
                        của bạn.
                      </p>
                    </div>
                  ) : (
                    personal.map((t) => {
                      // Khoá PHỨC HỢP (chủ + tên bộ), không chỉ `t.source`.
                      //
                      // Bộ được chia sẻ có thể TRÙNG TÊN với bộ của chính mình.
                      // Dùng mỗi `source` thì key React đụng nhau và `isSelected`
                      // sáng nhầm thẻ: chọn bộ được chia sẻ mà thẻ của mình sáng
                      // lên. Đây là bẫy dễ dính nhất của cả tính năng.
                      const uid = t.isShared ? `shared:${t.ownerEmail}:${t.source}` : `personal:${t.source}`;
                      const curId = current?.isShared
                        ? `shared:${current.ownerEmail}:${current.source}`
                        : current?.source ? `personal:${current.source}` : null;
                      const isSelected = curId === uid;
                      const isBusy = busyId === uid;
                      // Grant còn nhưng từ đã bị TTL xoá sạch → bia mộ. Vẫn hiện,
                      // không im lặng biến mất.
                      const dead = t.isShared && t.expired;
                      return (
                        <div
                          key={uid}
                          className={`topic-card ${isSelected ? "selected" : ""} ${isBusy ? "loading" : ""} ${dead ? "expired" : ""}`}
                          style={dead ? { opacity: 0.55 } : undefined}
                          onClick={() => {
                            if (dead) return;   // không có từ nào để luyện
                            if (t.isShared) handleSelectSharedWithMe(t.ownerEmail, t.source);
                            else handleSelectPersonal(t.source);
                          }}
                        >
                          <div className="topic-icon">{t.isShared ? "🤝" : "📤"}</div>
                          <div className="topic-details">
                            {/* Ghi rõ "(shared)" ngay trên tên: bộ được chia sẻ có
                                thể TRÙNG TÊN với bộ của mình, hai thẻ cạnh nhau
                                cùng chữ `dich-nhanh-zh` thì không biết cái nào là
                                của ai. Badge 🤝 ở icon dễ bỏ qua khi lướt nhanh. */}
                            <h4 title={t.isShared ? `${t.source} — chia sẻ bởi ${t.ownerName || "người chơi khác"}` : t.source}>
                              {t.source}
                              {t.isShared && <span className="shared-tag"> (shared)</span>}
                            </h4>
                            <div className="topic-meta">
                              <span className="word-count">
                                <i className="fas fa-book"></i>{" "}
                                {dead ? "Đã hết hạn" : `${t.wordCount} từ`}
                              </span>
                              {/* Hiện TÊN chủ, không phải email — đối xứng với việc
                                  chủ cũng không thấy email người nhận. */}
                              {t.isShared && (
                                <span className="shared-owner" title={`Chia sẻ bởi ${t.ownerName || "người chơi khác"}`}>
                                  <i className="fas fa-user"></i> {t.ownerName || "Người chơi"}
                                </span>
                              )}
                            </div>
                            {/* Bộ đã hết hạn thì không còn từ nào để phân loại —
                                vẽ dải ở đó là vẽ một vạch rỗng khó hiểu. */}
                            {!dead && <LevelBar stats={t.levelStats} />}
                          </div>
                          {/* Sao chép về kho riêng — lối thoát khỏi TTL: bộ gốc
                              hết hạn thì bản sao vẫn còn. Bộ đã chết thì không
                              còn gì để chép. */}
                          {t.isShared && !dead && (
                            <button
                              className="topic-copy-btn"
                              title="Sao chép về kho của tôi"
                              onClick={(e) => { e.stopPropagation(); handleCopyShared(t.ownerEmail, t.source); }}
                            >
                              <i className="fas fa-copy"></i>
                            </button>
                          )}
                          {isSelected && (
                            <div className="current-badge">
                              <i className="fas fa-check-circle"></i> Đang chọn
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              <div className="tab-content active">
                <p className="topic-hint">
                  Luyện lại những từ bạn đã làm sai:
                </p>
                <div className="topics-list">
                  {loadingWrong ? (
                    <p
                      style={{
                        gridColumn: "1 / -1",
                        textAlign: "center",
                        padding: 20,
                        color: "var(--text-secondary)",
                      }}
                    >
                      <i className="fas fa-spinner fa-spin"></i> Đang tải...
                    </p>
                  ) : wrong.length === 0 ? (
                    <div
                      style={{
                        gridColumn: "1 / -1", // span hết lưới, nếu không sẽ lệch về cột đầu
                        textAlign: "center",
                        padding: "18px 20px",
                        color: "var(--text-secondary)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        minHeight: 180,
                        width: "100%",
                      }}
                    >
                      <i
                        className="fas fa-check-circle"
                        style={{
                          fontSize: 32,
                          opacity: 0.4,
                          display: "block",
                          width: "fit-content",
                          margin: "0 auto 8px",
                        }}
                      ></i>
                      <p
                        style={{
                          margin: "0 0 8px",
                          fontWeight: 600,
                          color: "var(--text-primary)",
                        }}
                      >
                        Chưa có từ sai
                      </p>
                      <p style={{ margin: 0, fontSize: 13, textAlign: 'center' }}>
                        Làm sai từ nào trong lúc luyện tập, từ đó sẽ xuất hiện
                        ở đây để ôn lại.
                      </p>
                    </div>
                  ) : (
                    wrong.map((g) => {
                      const label = g.source || "Chưa rõ nguồn";
                      const id = `wrong:${g.source}`;
                      const isSelected = current?.id === id;
                      const isBusy = busyId === id;
                      return (
                        <div
                          key={id}
                          className={`topic-card ${isSelected ? "selected" : ""} ${isBusy ? "loading" : ""}`}
                          onClick={() => handleSelectWrong(g.source)}
                        >
                          <div className="topic-icon">❌</div>
                          <div className="topic-details">
                            <h4 title={label}>{label}</h4>
                            <div className="topic-meta">
                              <span className="word-count">
                                <i className="fas fa-book"></i> {g.wordCount} từ
                              </span>
                            </div>
                            <LevelBar stats={g.levelStats} />
                          </div>
                          {isSelected && (
                            <div className="current-badge">
                              <i className="fas fa-check-circle"></i> Đang chọn
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
