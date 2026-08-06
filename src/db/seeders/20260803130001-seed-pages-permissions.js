const { v4: uuidv4 } = require('uuid');

const PAGES = [
  { key: 'dashboard', label: 'Dashboard', sortOrder: 1, actions: ['view'] },
  { key: 'roles', label: 'Roles', sortOrder: 2, actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'users', label: 'Users', sortOrder: 3, actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'api_services', label: 'API Services', sortOrder: 4, actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'statistics', label: 'Statistics', sortOrder: 5, actions: ['view'] },
  { key: 'audit_logs', label: 'Audit Logs', sortOrder: 6, actions: ['view'] },
  { key: 'integrations', label: 'Integrations', sortOrder: 7, actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'settings', label: 'Settings', sortOrder: 8, actions: ['view', 'edit'] },
];

module.exports = {
  up: async (queryInterface) => {
    const now = new Date();
    const pageRows = PAGES.map((p) => ({
      id: uuidv4(),
      key: p.key,
      label: p.label,
      sort_order: p.sortOrder,
      created_at: now,
      updated_at: now,
    }));
    await queryInterface.bulkInsert('pages', pageRows);

    const permissionRows = [];
    PAGES.forEach((p, idx) => {
      p.actions.forEach((action) => {
        permissionRows.push({
          id: uuidv4(),
          page_id: pageRows[idx].id,
          action,
          created_at: now,
          updated_at: now,
        });
      });
    });
    await queryInterface.bulkInsert('permissions', permissionRows);

    const superAdminRoleId = uuidv4();
    await queryInterface.bulkInsert('roles', [
      {
        id: superAdminRoleId,
        name: 'Super Admin',
        description: 'Full access to every page and action, plus mobile app access. Cannot be deleted.',
        can_access_mobile_app: true,
        is_system: true,
        created_at: now,
        updated_at: now,
      },
    ]);

    const rolePermissionRows = permissionRows.map((perm) => ({
      id: uuidv4(),
      role_id: superAdminRoleId,
      permission_id: perm.id,
      created_at: now,
      updated_at: now,
    }));
    await queryInterface.bulkInsert('role_permissions', rolePermissionRows);
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('role_permissions', null, {});
    await queryInterface.bulkDelete('roles', { name: 'Super Admin' }, {});
    await queryInterface.bulkDelete('permissions', null, {});
    await queryInterface.bulkDelete('pages', null, {});
  },
};
