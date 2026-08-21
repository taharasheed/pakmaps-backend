// Phase 1 of the shared radio-positioning backend (see docs shared 2026-08-21):
// schema only, shadow-mode ingestion + resolve endpoints. No tenant_id - this
// backend has no multi-institution concept yet, so everything here is
// implicitly scoped to PakMaps as a whole. Add tenant_id later if/when that
// concept exists rather than inventing one now.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('radio_places', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      latitude: { type: Sequelize.DOUBLE, allowNull: false },
      longitude: { type: Sequelize.DOUBLE, allowNull: false },
      altitude_m: { type: Sequelize.DOUBLE, allowNull: true },
      floor_id: { type: Sequelize.STRING(60), allowNull: true },
      horizontal_uncertainty_m: { type: Sequelize.DOUBLE, allowNull: false, defaultValue: 150 },
      confirmation_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      distinct_device_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      trust_score: { type: Sequelize.DOUBLE, allowNull: false, defaultValue: 0 },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'candidate' },
      version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      first_seen_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      last_seen_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('radio_places', ['status']);
    await queryInterface.addIndex('radio_places', ['latitude', 'longitude']);

    await queryInterface.createTable('wifi_signatures', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      place_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'radio_places', key: 'id' }, onDelete: 'CASCADE' },
      bssid_token: { type: Sequelize.STRING(64), allowNull: false },
      token_key_version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      mean_rssi: { type: Sequelize.DOUBLE, allowNull: false, defaultValue: 0 },
      rssi_m2: { type: Sequelize.DOUBLE, allowNull: false, defaultValue: 0 },
      rssi_sample_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      connected_observation_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      frequency_mhz: { type: Sequelize.INTEGER, allowNull: true },
      channel_width: { type: Sequelize.INTEGER, allowNull: true },
      stability_score: { type: Sequelize.DOUBLE, allowNull: false, defaultValue: 1 },
      mobility_score: { type: Sequelize.DOUBLE, allowNull: false, defaultValue: 0 },
      unstable: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      quarantine_reason: { type: Sequelize.STRING(200), allowNull: true },
      first_seen_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      last_seen_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    // Primary lookup path: "which places is this BSSID seen at" - hit on every resolve/observe call.
    await queryInterface.addIndex('wifi_signatures', ['bssid_token', 'unstable'], { name: 'wifi_signatures_token_lookup' });
    await queryInterface.addIndex('wifi_signatures', ['place_id', 'bssid_token'], { unique: true, name: 'wifi_signatures_place_bssid_unique' });

    await queryInterface.createTable('cell_signatures', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      place_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'radio_places', key: 'id' }, onDelete: 'CASCADE' },
      radio: { type: Sequelize.STRING(10), allowNull: false },
      mcc: { type: Sequelize.STRING(6), allowNull: false },
      mnc: { type: Sequelize.STRING(6), allowNull: false },
      area: { type: Sequelize.INTEGER, allowNull: false },
      cell_id: { type: Sequelize.BIGINT, allowNull: false },
      pci: { type: Sequelize.INTEGER, allowNull: true },
      channel: { type: Sequelize.INTEGER, allowNull: true },
      registered_observation_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      mean_signal_dbm: { type: Sequelize.DOUBLE, allowNull: false, defaultValue: 0 },
      signal_m2: { type: Sequelize.DOUBLE, allowNull: false, defaultValue: 0 },
      sample_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      first_seen_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      last_seen_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('cell_signatures', ['radio', 'mcc', 'mnc', 'area', 'cell_id'], { name: 'cell_signatures_exact_lookup' });
    await queryInterface.addIndex('cell_signatures', ['mcc', 'mnc', 'area'], { name: 'cell_signatures_area_lookup' });
    await queryInterface.addIndex('cell_signatures', ['mcc', 'mnc'], { name: 'cell_signatures_carrier_lookup' });
    await queryInterface.addIndex('cell_signatures', ['place_id', 'radio', 'mcc', 'mnc', 'area', 'cell_id'], { unique: true, name: 'cell_signatures_place_cell_unique' });

    await queryInterface.createTable('radio_observations', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      installation_id: { type: Sequelize.STRING(100), allowNull: false },
      user_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
      captured_at: { type: Sequelize.DATE, allowNull: false },
      received_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      request_kind: { type: Sequelize.STRING(20), allowNull: false },
      matched_place_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'radio_places', key: 'id' }, onDelete: 'SET NULL' },
      decision: { type: Sequelize.STRING(30), allowNull: false },
      confidence: { type: Sequelize.DOUBLE, allowNull: true },
      collector_status: { type: Sequelize.STRING(30), allowNull: true },
      wifi_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      cell_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      matcher_version: { type: Sequelize.STRING(30), allowNull: false },
      request_id: { type: Sequelize.STRING(60), allowNull: false, unique: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('radio_observations', ['installation_id', 'captured_at']);

    await queryInterface.createTable('wifi_observations', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      observation_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'radio_observations', key: 'id' }, onDelete: 'CASCADE' },
      bssid_token: { type: Sequelize.STRING(64), allowNull: false },
      rssi_dbm: { type: Sequelize.INTEGER, allowNull: false },
      frequency_mhz: { type: Sequelize.INTEGER, allowNull: true },
      channel_width: { type: Sequelize.INTEGER, allowNull: true },
      connected: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      age_ms: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    });
    await queryInterface.addIndex('wifi_observations', ['observation_id']);
    await queryInterface.addIndex('wifi_observations', ['bssid_token']);

    await queryInterface.createTable('cell_observations', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      observation_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'radio_observations', key: 'id' }, onDelete: 'CASCADE' },
      radio: { type: Sequelize.STRING(10), allowNull: false },
      mcc: { type: Sequelize.STRING(6), allowNull: false },
      mnc: { type: Sequelize.STRING(6), allowNull: false },
      area: { type: Sequelize.INTEGER, allowNull: true },
      cell_id: { type: Sequelize.BIGINT, allowNull: true },
      pci: { type: Sequelize.INTEGER, allowNull: true },
      channel: { type: Sequelize.INTEGER, allowNull: true },
      registered: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      signal_dbm: { type: Sequelize.INTEGER, allowNull: true },
      age_ms: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    });
    await queryInterface.addIndex('cell_observations', ['observation_id']);

    await queryInterface.createTable('anchor_evidence', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      observation_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'radio_observations', key: 'id' }, onDelete: 'CASCADE' },
      latitude: { type: Sequelize.DOUBLE, allowNull: false },
      longitude: { type: Sequelize.DOUBLE, allowNull: false },
      altitude_m: { type: Sequelize.DOUBLE, allowNull: true },
      accuracy_m: { type: Sequelize.DOUBLE, allowNull: false },
      source: { type: Sequelize.STRING(30), allowNull: false },
      is_mocked: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      accepted: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      rejection_reason: { type: Sequelize.STRING(60), allowNull: true },
      distance_from_place_m: { type: Sequelize.DOUBLE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex('anchor_evidence', ['observation_id']);

    await queryInterface.createTable('device_trust', {
      installation_id: { type: Sequelize.STRING(100), allowNull: false, primaryKey: true },
      accepted_anchor_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      rejected_anchor_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      impossible_jump_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      conflict_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      trust_score: { type: Sequelize.DOUBLE, allowNull: false, defaultValue: 0.5 },
      last_seen_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('device_trust');
    await queryInterface.dropTable('anchor_evidence');
    await queryInterface.dropTable('cell_observations');
    await queryInterface.dropTable('wifi_observations');
    await queryInterface.dropTable('radio_observations');
    await queryInterface.dropTable('cell_signatures');
    await queryInterface.dropTable('wifi_signatures');
    await queryInterface.dropTable('radio_places');
  },
};
