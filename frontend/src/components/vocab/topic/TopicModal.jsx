import { useState, useEffect, useMemo, useRef } from "react";
import { dichTenDe, thuocTinhIconDich } from '../dichTenDe.js';
import { useEscapeToClose } from '@lib/useEscapeToClose.js';
import { Notification } from "@ui/Toaster.jsx";
import { useTopics } from "./useTopics.js";
import { TopicSelector } from "./topicSelector.js";
import LevelBar from "./LevelBar.jsx";
import { theoDoiCuon } from "@lib/scrollMemory.js";

/**
 * Tab chứa đề ĐANG CHỌN — để popup mở đúng chỗ thay vì luôn về "Từ vựng chung".
 *
 * Suy từ tiền tố của `id` (xem topicSelector.js):
 *   `personal:` · `shared:` → tab "Từ vựng riêng" (bộ được chia sẻ nằm CHUNG
 *                             tab này với bộ của mình, xem `isShared` ở dưới)
 *   `wrong:`               → tab "Từ vựng sai"
 *   không tiền tố          → đề chung
 *
 * Đọc thẳng `TopicSelector` chứ không qua `current` của `useTopics`: hàm này
 * còn được gọi trong `useState` (chạy trước khi hook kia kịp trả giá trị).
 */
/**
 * Vì sao một tab bị khoá. `disabled` mà không nói lý do thì người dùng tưởng
 * hỏng — đây là chỗ duy nhất họ đọc được câu trả lời (qua `title`).
 */
const LY_DO_KHOA = {
  wrongOnly: 'Chế độ "Ôn lại từ sai" chỉ luyện trên nhóm từ bạn đã làm sai',
  normalOnly: 'Nhóm từ sai chỉ dùng được ở chế độ "Ôn lại từ sai"',
};

function tabOfCurrentTopic() {
  const id = TopicSelector.getCurrentTopic()?.id || "";
  if (id.startsWith("personal:") || id.startsWith("shared:")) return "personal";
  if (id.startsWith("wrong:")) return "wrong";
  return "shared";
}

export default function TopicModal({ open, mode = null, onClose, onSelected }) {
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
    loadTuSai,
    tuSai,
    selectShared,
    selectSharedWithMe,
    copyShared,
    selectPersonal,
    selectWrong,
  } = useTopics({ enabled: open });
  // Chế độ "Ôn lại từ sai" chỉ chạy trên nhóm từ đã sai, nên hai tab kia vô
  // nghĩa với nó. Ngược lại, mọi chế độ khác không dùng được nhóm từ sai (pool
  // của chúng là bộ từ vựng, không phải danh sách lỗi). Khoá thay vì ẩn: ẩn thì
  // người dùng tưởng tab biến mất do lỗi, còn khoá kèm `title` nói rõ vì sao.
  const chiTuSai = mode === 'review-mistakes';

  /**
   * Số từ đã sai của MỘT đề.
   *
   * Cộng theo `sourceKeys`, không phải một khoá: một đề gom được nhiều nguồn
   * (`vocabularies_topics.sourceKeys` là mảng), nên chỉ tra khoá đầu là bỏ sót
   * từ sai của những nguồn còn lại — con số nhỏ hơn thực tế mà không có gì báo.
   */
  const soTuSaiCuaDe = (topic) => {
    const keys = Array.isArray(topic?.sourceKeys)
      ? topic.sourceKeys
      : [topic?.source].filter(Boolean);
    return keys.reduce(
      (t, k) => ({
        sai: t.sai + (tuSai?.[k]?.sai || 0),
        canOn: t.canOn + (tuSai?.[k]?.canOn || 0),
      }),
      { sai: 0, canOn: 0 },
    );
  };
  const tabBiKhoa = (t) => (chiTuSai ? t !== 'wrong' : t === 'wrong');

  const [tab, setTab] = useState(tabOfCurrentTopic);

  // Đồng bộ tab ĐÚNG LÚC POPUP MỞ RA, không phải mỗi lần effect chạy lại.
  //
  // Hai điều kiện phải cùng đúng:
  //  · `useState` chỉ chạy hàm khởi tạo MỘT lần lúc mount, mà component này
  //    không unmount khi đóng (`if (!open) return null` chỉ ẩn) — nên lần mở
  //    thứ hai trở đi sẽ giữ tab của lần trước nếu không đặt lại.
  //  · Nhưng KHÔNG được đặt lại ở effect có `loadShared`/`onClose` trong deps:
  //    hai hàm đó đổi danh tính là effect chạy lại và ĐÁ NGƯỢC người dùng về
  //    tab cũ giữa chừng, ngay khi họ vừa bấm sang tab khác.
  //
  // `wasOpenRef` chốt đúng khoảnh khắc đóng → mở.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      // Mở cho "Ôn lại từ sai" thì vào thẳng tab đó, kể cả khi đề đang chọn là
      // bộ từ vựng thường — nếu không, popup mở ra ở một tab đã bị khoá.
      // Ngược lại cũng phải chặn: đề đang chọn có thể LÀ nhóm từ sai (người dùng
      // vừa ôn xong), mà chế độ thường thì tab đó bị khoá — mở vào đó là popup
      // đứng ở tab không bấm được gì.
      const mongMuon = chiTuSai ? "wrong" : tabOfCurrentTopic();
      setTab(tabBiKhoa(mongMuon) ? (chiTuSai ? "wrong" : "shared") : mongMuon);
    }
    wasOpenRef.current = open;
  }, [open, chiTuSai]);
  const [query, setQuery] = useState("");
  const [searchReadOnly, setSearchReadOnly] = useState(true); // prevent autofill until user interacts
  const [busyId, setBusyId] = useState(null);

  /**
   * Nhớ vị trí cuộn RIÊNG cho từng tab.
   *
   * Ba tab là ba danh sách khác hẳn nhau; dùng chung một khoá thì chuyển tab
   * xong bị ném xuống vị trí của tab trước — tệ hơn là không nhớ gì.
   *
   * Callback ref chứ không `useRef` + `useEffect`: React gọi nó với phần tử
   * lúc gắn và với `null` lúc gỡ, nên vòng đời khớp chính xác với việc thêm và
   * bỏ listener. Dùng `useEffect` thì phải tự đoán khi nào DOM đã sẵn sàng.
   */
  const goCuonRef = useRef(null);
  const gapDanhSach = (el) => {
    goCuonRef.current?.();
    goCuonRef.current = el ? theoDoiCuon(`topic-modal:${tab}`, el) : null;
  };

  useEffect(() => {
    if (!open) return;

    loadShared();
    // Số từ sai nạp NGAY khi mở, không đợi người dùng vào tab "Từ vựng sai":
    // thẻ đề ở hai tab kia cũng hiện con số này.
    loadTuSai();
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, loadShared, loadTuSai, onClose]);

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
                className={`tab-btn ${tab === "shared" ? "active" : ""}${tabBiKhoa("shared") ? " is-locked" : ""}`}
                onClick={() => setTab("shared")}
                disabled={tabBiKhoa("shared")}
                title={tabBiKhoa("shared") ? LY_DO_KHOA.wrongOnly : undefined}
              >
                <i className="fas fa-globe"></i> Từ vựng chung
              </button>
              <button
                className={`tab-btn ${tab === "personal" ? "active" : ""}${tabBiKhoa("personal") ? " is-locked" : ""}`}
                onClick={() => setTab("personal")}
                disabled={tabBiKhoa("personal")}
                title={tabBiKhoa("personal") ? LY_DO_KHOA.wrongOnly : undefined}
              >
                <i className="fas fa-user"></i> Từ vựng riêng
              </button>
              <button
                className={`tab-btn ${tab === "wrong" ? "active" : ""}${tabBiKhoa("wrong") ? " is-locked" : ""}`}
                onClick={() => setTab("wrong")}
                disabled={tabBiKhoa("wrong")}
                title={tabBiKhoa("wrong") ? LY_DO_KHOA.normalOnly : undefined}
              >
                <i className="fas fa-times-circle"></i> Từ vựng sai
              </button>
            </div>

            {tab === "shared" ? (
              <div className="tab-content active">
                <p className="topic-hint">
                  Chọn bộ từ vựng bạn muốn luyện tập:
                </p>
                <div className="topics-list" ref={gapDanhSach}>
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
                          {/* Icon = nút DỊCH tên đề. Tên nhiều khi là chữ Hán
                              hoặc tiếng Anh chuyên ngành, nhìn không đoán được
                              nội dung. Bấm chỗ khác trên thẻ vẫn CHỌN như cũ. */}
                          <div
                            className="topic-icon"
                            onClick={(e) => dichTenDe(e, topic.name)}
                            {...thuocTinhIconDich(topic.name)}
                          >{topic.icon}</div>
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
                              {/* CÙNG con số, cùng cách nói với tab "Từ vựng sai" và
                                  với thẻ Part. Một huy hiệu đỏ phải có ĐÚNG MỘT nghĩa ở
                                  mọi màn — không thì màn này báo "đã ôn xong" còn màn kia
                                  vẫn đỏ chói, và người dùng không biết tin bên nào. */}
                              {soTuSaiCuaDe(topic).sai > 0 && (
                                soTuSaiCuaDe(topic).canOn > 0 ? (
                                  <span
                                    className="wrong-count"
                                    title="Số từ đã tới hạn ôn theo lịch"
                                  >
                                    <i className="fas fa-circle-xmark"></i>{" "}
                                    còn {soTuSaiCuaDe(topic).canOn} cần ôn
                                  </span>
                                ) : (
                                  <span
                                    className="wrong-count is-done"
                                    title={`${soTuSaiCuaDe(topic).sai} từ từng sai ở đề này đều chưa tới hạn ôn lại`}
                                  >
                                    <i className="fas fa-circle-check"></i> đã ôn xong
                                  </span>
                                )
                              )}
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
                <div className="topics-list" ref={gapDanhSach}>
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
                          <div
                            className="topic-icon"
                            onClick={(e) => dichTenDe(e, t.source)}
                            {...thuocTinhIconDich(t.source)}
                          >{t.isShared ? "🤝" : "📤"}</div>
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
                  {chiTuSai
                    ? 'Chọn nhóm từ sai bạn muốn ôn lại — miễn phí năng lượng:'
                    : 'Luyện lại những từ bạn đã làm sai:'}
                </p>
                <div className="topics-list" ref={gapDanhSach}>
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
                          <div
                            className="topic-icon"
                            onClick={(e) => dichTenDe(e, label)}
                            {...thuocTinhIconDich(label)}
                          >❌</div>
                          <div className="topic-details">
                            <h4 title={label}>{label}</h4>
                            <div className="topic-meta">
                              <span className="word-count">
                                <i className="fas fa-book"></i> {g.wordCount} từ
                              </span>
                              {/* Số CÒN PHẢI ÔN, không phải tổng đã từng sai.
                                  Đây là con số quyết định nên học đề nào: tổng
                                  đã sai chỉ nói quá khứ, còn cái này nói việc
                                  đang chờ. Hết hạn ôn thì ghi rõ "đã ôn xong"
                                  thay vì để trống — trống trông như lỗi tải. */}
                              <span
                                className={`wrong-count${g.canOn > 0 ? "" : " is-done"}`}
                                title="Số từ đã tới hạn ôn theo lịch"
                              >
                                <i className={`fas fa-${g.canOn > 0 ? "circle-xmark" : "circle-check"}`}></i>{" "}
                                {g.canOn > 0 ? `còn ${g.canOn} cần ôn` : "đã ôn xong"}
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
