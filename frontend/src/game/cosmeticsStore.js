// Tín hiệu "catalog cosmetic đã nạp xong" cho React.
//
// FRAMES/BACKGROUNDS là object cấp module, được nạp thêm ảnh/CSS từ catalog
// bằng một lượt fetch BẤT ĐỒNG BỘ lúc App mở. Component đọc thẳng object đó
// trong lúc render, mà việc gán vào object thì React không hề biết — nên màn
// nào đã vẽ trước khi fetch xong sẽ đứng nguyên ở gradient dự phòng, ảnh admin
// upload không bao giờ hiện (chỉ khác đi nếu tình cờ có thứ khác bắt vẽ lại).
//
// Ở đây giữ một số phiên bản: register* gọi bump(), component gọi useCosmetics()
// để vẽ lại đúng một lần khi catalog về.
import { useSyncExternalStore } from 'react';

let version = 0;
const listeners = new Set();

export function bumpCosmetics() {
    version += 1;
    listeners.forEach(fn => fn());
}

export function subscribeCosmetics(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
}

export const cosmeticsVersion = () => version;

const subscribe = subscribeCosmetics;
const getVersion = cosmeticsVersion;

/** Đăng ký vẽ lại khi catalog cosmetic được nạp. Gọi ở component có dùng FRAMES/BACKGROUNDS. */
export function useCosmetics() {
    return useSyncExternalStore(subscribe, getVersion, getVersion);
}
