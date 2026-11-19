const jwt = require('jsonwebtoken');
const logger = require('../lib/logger');
const User = require('../models/User');
const Branch = require('../models/Branch');
const Gym = require('../models/Gym');
const { H4_GYM_IDS } = require('../config/constants');

const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id).select('-password');
            
            if (!user) {
                res.status(401);
                throw new Error('Not authorized, user not found');
            }

            if (user.isActive === false || user.status !== 'Active') {
                res.status(403);
                throw new Error('Not authorized, account is inactive or suspended');
            }

            req.user = user;
            req.user.userBranchId = user.branchId || null;
            if (req.log) {
                req.log = req.log.child({ userId: user._id || user.id });
            }

            // Enforce hierarchical authentication scoping
            if (req.user.role === 'superadmin') {
                // Super Admin can switch to any gym & branch
                if (req.headers['x-gym-id']) {
                    req.user.gymId = req.headers['x-gym-id'];
                }
                if (req.headers['x-branch-id']) {
                    req.user.branchId = req.headers['x-branch-id'];
                }
            } else if (req.user.role === 'h4_admin') {
                // Gym CRM admin is locked to the Gym CRM workspace.
                const h4Gym = await Gym.findOne({ name: 'Gym CRM' }) || await Gym.findOne({ name: 'H4' });
                req.user.gymId = h4Gym ? h4Gym._id.toString() : H4_GYM_IDS[0];
                
                if (req.user.userBranchId) {
                    // Branch-level admin created for a specific location
                    req.user.branchId = req.user.userBranchId;
                } else if (req.headers['x-branch-id']) {
                    const targetBranch = await Branch.findOne({ 
                        _id: req.headers['x-branch-id'], 
                        gymId: req.user.gymId 
                    });
                    if (targetBranch) {
                        req.user.branchId = req.headers['x-branch-id'];
                    } else {
                        req.user.branchId = null;
                    }
                } else {
                    req.user.branchId = null;
                }
            } else if (req.user.role === 'partner') {
                // Organization Admin is locked to their gymId
                req.user.gymId = user.gymId;
                if (req.user.userBranchId) {
                    req.user.branchId = req.user.userBranchId;
                } else if (req.headers['x-branch-id']) {
                    // Only allow switching to branches that belong to their gymId
                    const targetBranch = await Branch.findOne({ 
                        _id: req.headers['x-branch-id'], 
                        gymId: user.gymId 
                    });
                    if (targetBranch) {
                        req.user.branchId = req.headers['x-branch-id'];
                    } else {
                        req.user.branchId = null; // default to consolidated reports/view
                    }
                } else {
                    req.user.branchId = null;
                }
            } else {
                // All other roles (admin, receptionist, trainer, member) are strictly isolated
                req.user.gymId = user.gymId;
                req.user.branchId = user.userBranchId || user.branchId || null;
            }

            next();
        } catch (error) {
            logger.error({ err: error }, 'Auth middleware failed to authorize request');
            if (res.statusCode === 200) {
                res.status(401);
            }
            throw new Error(error.message || 'Not authorized, token failed');
        }
    }

    if (!token) {
        res.status(401);
        throw new Error('Not authorized, no token');
    }
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401);
            return next(new Error('Not authorized, missing user data'));
        }
        if (req.user.role === 'superadmin' || roles.includes(req.user.role)) {
            return next();
        }
        res.status(403);
        return next(new Error(`User role ${req.user.role} is not authorized to access this route`));
    };
};

module.exports = { protect, authorize };
