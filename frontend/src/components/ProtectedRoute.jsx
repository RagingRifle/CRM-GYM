import { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

const BRANCH_ADMIN_PATHS = ['/dashboard', '/members', '/leads', '/automations', '/plans', '/classes', '/body-assessments', '/payments', '/sales', '/expenses', '/dues', '/attendance', '/trainer-attendance', '/payroll', '/reports', '/freeze', '/analytics', '/workout-plans', '/diet-plans'];

const ProtectedRoute = ({ children, roles }) => {
    const { user, loading } = useContext(AuthContext);

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            <div className="spinner"></div>
        </div>
    );

    if (!user) return <Navigate to="/login" replace />;

    if (user.role === 'h4_admin' && user.branchId && !BRANCH_ADMIN_PATHS.includes(window.location.pathname)) {
        return <Navigate to="/dashboard" replace />;
    }

    if (roles && user.role !== 'superadmin' && !roles.includes(user.role)) {
        const defaultPath = user.role === 'h4_admin' || user.role === 'admin' ? '/dashboard'
            : user.role === 'trainer' ? '/attendance'
                : user.role === 'member' ? '/member-dashboard' : '/members';
        return <Navigate to={defaultPath} replace />;
    }

    return children;
};

export default ProtectedRoute;
