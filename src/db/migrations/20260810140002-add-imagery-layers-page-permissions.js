const { v4: uuidv4 } = require('uuid');

// The original pages/permissions seeder (20260803130001) already ran in
// every environment, so a new manageable admin page from here on is added
// as its own migration rather than editing that seeder - mirrors how new
// pages get introduced after initial rollout.
module.exports = {
  up: async (queryInterface) => {
    const now = new Date();
    const pageId = uuidv4();

    await queryInterface.bulkInsert('pages', [
      { id: pageId, key: 'imagery_layers', label: 'Imagery Layers', sort_order: 9, created_at: now, updated_at: now },
    ]);

    const actions = ['view', 'add', 'edit', 'delete'];
    const permissionRows = actions.map((action) => ({ id: uuidv4(), page_id: pageId, action, created_at: now, updated_at: now }));
    await queryInterface.bulkInsert('permissions', permissionRows);

    const [superAdminRows] = await queryInterface.sequelize.query(
      `SELECT id FROM roles WHERE name = 'Super Admin' LIMIT 1;`
    );
    if (superAdminRows.length > 0) {
      const superAdminRoleId = superAdminRows[0].id;
      const rolePermissionRows = permissionRows.map((perm) => ({
        id: uuidv4(),
        role_id: superAdminRoleId,
        permission_id: perm.id,
        created_at: now,
        updated_at: now,
      }));
      await queryInterface.bulkInsert('role_permissions', rolePermissionRows);
    }
  },

  down: async (queryInterface) => {
    const [pageRows] = await queryInterface.sequelize.query(`SELECT id FROM pages WHERE key = 'imagery_layers' LIMIT 1;`);
    if (pageRows.length === 0) return;
    const pageId = pageRows[0].id;

    const [permissionRows] = await queryInterface.sequelize.query(
      `SELECT id FROM permissions WHERE page_id = '${pageId}';`
    );
    const permissionIds = permissionRows.map((p) => p.id);
    if (permissionIds.length > 0) {
      await queryInterface.bulkDelete('role_permissions', { permission_id: permissionIds }, {});
      await queryInterface.bulkDelete('permissions', { page_id: pageId }, {});
    }
    await queryInterface.bulkDelete('pages', { id: pageId }, {});
  },
};
