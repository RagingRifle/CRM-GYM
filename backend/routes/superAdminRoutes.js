const express = require('express');
const router = express.Router();
const {
    getOrCreateH4Gym,
    getDedicatedAdmins,
    getAdminAccountScopes,
    createDedicatedAdmin,
    updateDedicatedAdmin,
    deleteDedicatedAdmin,
} = require('../controllers/superAdminController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.get('/h4-gym', protect, authorize('superadmin', 'h4_admin'), getOrCreateH4Gym);

router.route('/admins')
    .get(protect, authorize('superadmin', 'h4_admin'), getDedicatedAdmins)
    .post(protect, authorize('superadmin', 'h4_admin'), createDedicatedAdmin);

router.get('/admin-scopes', protect, authorize('superadmin', 'h4_admin'), getAdminAccountScopes);

router.route('/admins/:id')
    .put(protect, authorize('superadmin', 'h4_admin'), updateDedicatedAdmin)
    .delete(protect, authorize('superadmin', 'h4_admin'), deleteDedicatedAdmin);

module.exports = router;
