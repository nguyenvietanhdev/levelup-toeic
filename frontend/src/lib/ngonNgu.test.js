/**
 * Sổ đăng ký ngôn ngữ (frontend) — phải cho CÙNG kết quả với backend/config/ngonNgu.js trên cùng
 * một file dữ liệu. Hai lớp hàm lệch nhau là giọng đọc / nhận diện ở client khác server.
 */
import { describe, test, expect } from 'vitest';
import { createRequire } from 'node:module';
import * as FE from './ngonNgu.js';

const require = createRequire(import.meta.url);
const BE = require('../../../backend/config/ngonNgu.js');

const MAU = ['日本語を勉強します', 'カラオケ', '你好，朋友', '안녕하세요', 'Hello world', '', '我爱你 OK'];
const MA = ['en', 'zh', 'ja', 'ko', 'bi', 'xx', undefined];

describe('sổ ngôn ngữ frontend = backend', () => {
    test('cùng danh sách mã, cùng ngôn ngữ đang mở, cùng mặc định', () => {
        expect(FE.MA_NGON_NGU).toEqual(BE.MA_NGON_NGU);
        expect(FE.NGON_NGU_HOAT_DONG).toEqual(BE.NGON_NGU_HOAT_DONG);
        expect(FE.MAC_DINH).toBe(BE.MAC_DINH);
    });

    test.each(MAU)('nhận diện chữ viết giống hệt: %s', (t) => {
        expect(FE.nhanDienChuViet(t)).toBe(BE.nhanDienChuViet(t));
    });

    test.each(MA)('chuanMa / ngonNguHoc / tenChoPrompt / bcp47 / donViDem giống hệt: %s', (m) => {
        expect(FE.chuanMa(m)).toBe(BE.chuanMa(m));
        expect(FE.ngonNguHoc(m)).toBe(BE.ngonNguHoc(m));
        expect(FE.tenChoPrompt(m)).toBe(BE.tenChoPrompt(m));
        expect(FE.bcp47(m)).toBe(BE.bcp47(m));
        expect(FE.donViDem(m)).toBe(BE.donViDem(m));
        expect(FE.tenViet(m)).toBe(BE.tenViet(m));
        expect(FE.tenVietGiuaCau(m)).toBe(BE.tenVietGiuaCau(m));
        expect(FE.tenDonVi(m)).toBe(BE.tenDonVi(m));
        expect(FE.coKhoangTrang(m)).toBe(BE.coKhoangTrang(m));
        expect(FE.vocabLangHopLe(m)).toBe(BE.vocabLangHopLe(m));
        for (const t of ['我的好朋友，在银行。', 'hello  big world', '私は学生です', '']) expect(FE.demDonVi(t, m)).toBe(BE.demDonVi(t, m));
    });

    test('Nhật có Kanji không bị nhận là Trung', () => {
        expect(FE.nhanDienChuViet('日本語を勉強します')).toBe('ja');
    });
});
