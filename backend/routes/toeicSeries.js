const express = require('express');
const router = express.Router();
const {
    getSeries,
    getAllSeries,
    createSeries,
    updateSeries,
    deleteSeries,
    suggestKeys,
} = require('../controllers/toeicSeriesController');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { toeicSeries } = require('../validators/schemas');

const admin = [protect, authorize('admin')];

// Public: frontend dựng thanh lọc bên Full Test.
router.get('/', getSeries);

// Admin: quản danh mục. `/all` và `/suggest` đứng TRƯỚC '/:id' — để sau thì
// Express bắt chúng làm id và trả 404/CastError.
router.get('/all', ...admin, getAllSeries);
router.get('/suggest', ...admin, suggestKeys);
router.post('/', ...admin, validate(toeicSeries), createSeries);
router.put('/:id', ...admin, updateSeries);
router.delete('/:id', ...admin, deleteSeries);

module.exports = router;
