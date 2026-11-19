const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');
const catchAsync = require('../utils/catchAsync');
const controller = require('../controllers/communicationController');

const router = express.Router();
router.use(protect, authorize('admin', 'h4_admin', 'h4_branch_admin', 'superadmin', 'receptionist'));
router.get('/settings', catchAsync(controller.getSettings));
router.put('/rules/:trigger', catchAsync(controller.updateRule));
router.get('/contacts', catchAsync(controller.getContacts));
router.put('/contacts/:type/:id/preferences', catchAsync(controller.updateContactPreference));
router.get('/messages', catchAsync(controller.getMessages));
router.post('/test-email', authorize('admin', 'h4_admin', 'h4_branch_admin', 'superadmin', 'receptionist'), catchAsync(controller.sendTestEmail));

module.exports = router;
