/**
 * Tab Vai AI: gọi đúng API vai, và màn Hội thoại gắn tab đúng vị trí, đúng Part.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tab = readFileSync(join(__dirname, 'VaiAITab.jsx'), 'utf8');
const conv = readFileSync(join(__dirname, '..', 'conversation', 'ConversationScreen.jsx'), 'utf8');
const api = readFileSync(join(__dirname, '..', '..', 'api', 'roles.js'), 'utf8');

describe('VaiAITab', () => {
    test('đủ bốn thao tác: xem, AI đề xuất, lưu vai riêng, xoá vai riêng', () => {
        expect(tab).toMatch(/RolesAPI\.get\(/);
        expect(tab).toMatch(/RolesAPI\.suggest\(/);
        expect(tab).toMatch(/RolesAPI\.save\(/);
        expect(tab).toMatch(/RolesAPI\.remove\(/);
    });

    test('khi chưa chọn đề/Part thì không gọi API', () => {
        expect(tab).toMatch(/const coPart = !!\(source && part\)/);
        expect(tab).toMatch(/if \(!coPart\) return;/);
    });

    test('vai người học tự viết có giới hạn 10–400 ký tự', () => {
        expect(tab).toMatch(/DO_DAI_TOI_THIEU = 10/);
        expect(tab).toMatch(/DO_DAI_TOI_DA = 400/);
    });

    test('nhãn nguồn phân biệt vai của bạn và vai AI', () => {
        expect(tab).toMatch(/user: 'Vai của bạn'/);
        expect(tab).toMatch(/ai: 'Vai AI đề xuất'/);
    });
});

describe('API vai', () => {
    test('gọi đúng đường dẫn /roles', () => {
        expect(api).toMatch(/\/roles\?/);
        expect(api).toMatch(/\/roles\/suggest/);
        expect(api).toMatch(/\/roles\/mine/);
    });
});

describe('màn Hội thoại có tab Vai AI sau Lịch sử', () => {
    test('tab Vai AI đứng sau Lịch sử và có nội dung riêng', () => {
        expect(conv.indexOf("setTab('vai')")).toBeGreaterThan(conv.indexOf("setTab('lichsu')"));
        expect(conv).toMatch(/tab === 'vai' \?/);
    });

    test('truyền đề và Part đang chọn vào tab', () => {
        expect(conv).toMatch(/source=\{TopicSelector\.currentTopic\?\.source/);
        expect(conv).toMatch(/part=\{PartSelector\.selectedPart/);
    });
});
