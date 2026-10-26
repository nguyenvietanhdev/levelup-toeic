import { useEffect, useState } from 'react';
import { useGame } from '@game/GameContext.jsx';
import { useAuth } from '@components/auth/AuthContext.jsx';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { loadUnlocks, lockInfo } from '@game/featureUnlocks.js';
import { TopicSelector } from '@components/vocab/topic/topicSelector.js';
import { PartSelector } from '@components/vocab/part/partSelector.js';
import { LoTrinhAPI } from '@api/loTrinh.js';
import { danhDauDaXem } from '@lib/chamDo.js';

/**
 * Lộ trình hôm nay — dẫn người học qua các kỹ năng với CÙNG bộ từ của Part đang học.
 *
 * Nhiều chế độ mà không có thứ tự thì người tự học chọn cái mình thích chứ không phải
 * cái mình cần. Thứ tự ở đây đi từ tiếp nhận tới tạo ra: gặp từ vài lần (ôn, học,
 * nghe, đọc) trước khi phải tự dùng nó (nói, viết). Bước nào xong là do SERVER đếm
 * từ những gì đã làm hôm nay — không có nút "đánh dấu xong".
 */
const BUOC = {
    'on-sai': {
        ten: 'Ôn từ sai',
        icon: 'fa-repeat',
        moTa: 'Dọn từ đến hạn ôn trước khi học từ mới.',
    },
    'hoc-tu': {
        ten: 'Học từ của Part',
        icon: 'fa-layer-group',
        moTa: 'Thẻ từ rồi 2–3 chế độ luyện: nhận mặt từ, nghĩa, cách đọc.',
    },
    nghe: {
        ten: 'Nghe và chép lại',
        icon: 'fa-headphones',
        moTa: 'Nghe được từ trong câu, không chỉ đứng một mình.',
        screen: 'listening-screen',
        feature: null,
    },
    doc: {
        ten: 'Đọc hiểu',
        icon: 'fa-book-open-reader',
        moTa: 'Gặp từ trong văn bản, đoán nghĩa từ ngữ cảnh.',
        screen: 'reading-screen',
        feature: 'feature:reading',
    },
    noi: {
        ten: 'Hội thoại',
        icon: 'fa-microphone-lines',
        moTa: 'Nghe tin nhắn thoại và trả lời bằng giọng nói — tự DÙNG từ, phần quan trọng nhất.',
        screen: 'voice-conversation-screen',
        feature: 'feature:conversation',
        phu: { nhan: 'hoặc Chat', screen: 'conversation-screen' },
    },
    'viet-dich': {
        ten: 'Viết hoặc Dịch',
        icon: 'fa-pen-nib',
        moTa: 'Dùng từ chính xác trong câu; đọc kỹ lỗi được chỉ ra.',
    },
};

/** Viết và Dịch đổi xen kẽ theo ngày (server gợi ý), cái còn lại là lựa chọn phụ. */
const VIET = { screen: 'essay-screen', feature: 'feature:essay', nhan: 'Luyện viết' };
const DICH = { screen: 'translation-screen', feature: 'feature:translation', nhan: 'Dịch đoạn văn' };

export default function LoTrinhScreen({ active }) {
    const { showScreen } = useGame();
    const { isLoggedIn } = useAuth();
    const [data, setData] = useState(null);
    const [loi, setLoi] = useState('');
    const [, setMoKhoa] = useState(0); // vẽ lại khi đã nạp xong bảng khoá Level

    // Tải lại mỗi lần mở màn: làm xong một bước rồi quay lại là thấy dấu xong ngay.
    useEffect(() => {
        if (!active || !isLoggedIn) return undefined;
        let huy = false;
        setLoi('');
        LoTrinhAPI.get()
            // Đã mở lộ trình hôm nay → tắt chấm đỏ của nó tới hết ngày (giờ VN).
            .then((d) => { if (!huy) { setData(d); danhDauDaXem('lo-trinh', d?.ngay); } })
            .catch((e) => { if (!huy) setLoi(e?.message || 'Không tải được lộ trình hôm nay'); });
        loadUnlocks(true).then(() => { if (!huy) setMoKhoa((t) => t + 1); });
        return () => { huy = true; };
    }, [active, isLoggedIn]);

    const chayCheDo = (mode) => {
        // Đi qua cùng sự kiện với mục "Ôn lại từ sai" ở menu: PracticeManager tự mở
        // popup chọn đề nếu cần.
        EventBus.emit(GameEvents.PRACTICE_REQUESTED, { mode });
    };

    const deTen = TopicSelector.currentTopic?.name || TopicSelector.currentTopic?.source || '';
    const part = PartSelector.selectedPart || '';
    const buoc = data?.buoc || [];
    const tiepTheo = buoc.find((b) => !b.xong)?.key;
    const xong = data ? data.soXong === data.tong : false;

    /** Nút đi tới một màn, có kiểm khoá Level như menu. */
    const NutMan = ({ dich, nhan, phu }) => {
        const khoa = dich.feature ? lockInfo(dich.feature) : { locked: false };
        if (khoa.locked) {
            return <span className="lt-khoa"><i className="fas fa-lock"></i> {nhan} · mở ở Level {khoa.requiredLevel}</span>;
        }
        return (
            <button
                type="button"
                className={`btn ${phu ? 'btn-secondary' : 'btn-primary'} lt-nut`}
                onClick={() => showScreen(dich.screen)}
            >
                {nhan}
            </button>
        );
    };

    const hanhDong = (b) => {
        const lam = b.xong ? 'Làm thêm' : 'Bắt đầu';
        if (b.key === 'on-sai') {
            if (b.boQua) return null;
            return (
                <button type="button" className="btn btn-primary lt-nut" onClick={() => chayCheDo('review-mistakes')}>
                    {lam}
                </button>
            );
        }
        if (b.key === 'hoc-tu') {
            return (
                <button type="button" className="btn btn-primary lt-nut" onClick={() => showScreen('home-screen')}>
                    Chọn chế độ
                </button>
            );
        }
        if (b.key === 'viet-dich') {
            const chinh = b.goiY === 'dich' ? DICH : VIET;
            const khac = b.goiY === 'dich' ? VIET : DICH;
            return (
                <>
                    <NutMan dich={chinh} nhan={`${lam}: ${chinh.nhan}`} />
                    <NutMan dich={khac} nhan={`hoặc ${khac.nhan}`} phu />
                </>
            );
        }
        const cfg = BUOC[b.key];
        return (
            <>
                <NutMan dich={cfg} nhan={lam} />
                {cfg.phu && <NutMan dich={{ ...cfg, screen: cfg.phu.screen }} nhan={cfg.phu.nhan} phu />}
            </>
        );
    };

    const trangThai = (b) => {
        if (b.boQua) return <span className="lt-trang-thai is-bo-qua">Không có từ đến hạn</span>;
        if (b.xong) return <span className="lt-trang-thai is-xong"><i className="fas fa-check"></i> Xong · {b.soLan} lượt</span>;
        if (b.key === 'on-sai' && b.tuDenHan) return <span className="lt-trang-thai">{b.tuDenHan} từ đến hạn</span>;
        return <span className="lt-trang-thai">Chưa làm</span>;
    };

    return (
        <div id="lo-trinh-screen" className={`screen ${active ? 'active' : ''}`}>
            <div className="screen-header">
                <button className="back-btn-screen icon-btn" onClick={() => showScreen('home-screen')}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h2><i className="fas fa-route"></i> Lộ trình hôm nay</h2>
            </div>

            <div className="lt-wrap">
                {!isLoggedIn ? (
                    <p className="tr-intro-note">Đăng nhập để theo dõi lộ trình học mỗi ngày.</p>
                ) : (
                    <>
                        <p className="lt-gioi-thieu">
                            Đi lần lượt các bước với <strong>cùng bộ từ</strong>
                            {deTen || part ? <> — đang học <strong>{[deTen, part].filter(Boolean).join(' · ')}</strong></> : null}.
                            Gặp từ vài lần (ôn, học, nghe, đọc) rồi mới tự dùng nó (nói, viết).
                        </p>
                        {loi && <p className="tr-intro-note">{loi}</p>}
                        {!data && !loi && <p className="tr-intro-note"><i className="fas fa-spinner fa-spin"></i> Đang tải…</p>}
                        {data && (
                            <>
                                <div className="lt-tien-do">
                                    <div className="lt-tien-do-chu">
                                        {xong
                                            ? <><i className="fas fa-trophy"></i> Hoàn thành lộ trình hôm nay!</>
                                            : <>Đã xong <strong>{data.soXong}/{data.tong}</strong> bước hôm nay</>}
                                    </div>
                                    <div className="lt-thanh"><span style={{ width: `${(data.soXong / data.tong) * 100}%` }} /></div>
                                </div>
                                {/* Kế hoạch tuần do "Tổng kết tuần" (AI) đề ra — có thì nhắc ở đây. */}
                                {data.keHoachTuan?.length > 0 && (
                                    <div className="lt-ke-hoach">
                                        <div className="lt-ke-hoach-dau">
                                            <i className="fas fa-chalkboard-user"></i> Trọng tâm tuần này
                                            <button type="button" className="lt-ke-hoach-link" onClick={() => showScreen('tien-bo-screen')}>
                                                Xem tổng kết
                                            </button>
                                        </div>
                                        <ul>{data.keHoachTuan.map((k) => <li key={k.viec}>{k.viec}</li>)}</ul>
                                    </div>
                                )}
                                <ol className="lt-ds">
                                    {buoc.map((b, i) => {
                                        const cfg = BUOC[b.key] || { ten: b.key, icon: 'fa-circle', moTa: '' };
                                        return (
                                            <li
                                                key={b.key}
                                                className={`lt-buoc${b.xong ? ' is-xong' : ''}${b.key === tiepTheo ? ' is-tiep' : ''}`}
                                            >
                                                <div className="lt-so">{b.xong ? <i className="fas fa-check"></i> : i + 1}</div>
                                                <div className="lt-noi-dung">
                                                    <div className="lt-ten">
                                                        <i className={`fas ${cfg.icon}`}></i> {cfg.ten}
                                                        {b.key === tiepTheo && <span className="lt-nhan-tiep">Tiếp theo</span>}
                                                    </div>
                                                    <div className="lt-mo-ta">{cfg.moTa}</div>
                                                    {trangThai(b)}
                                                </div>
                                                <div className="lt-hanh-dong">{hanhDong(b)}</div>
                                            </li>
                                        );
                                    })}
                                </ol>
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
