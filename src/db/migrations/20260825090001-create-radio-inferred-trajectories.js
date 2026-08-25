// PDR (pedestrian dead-reckoning) trajectory points - see mobile dev's
// "PakMaps indoor PDR backend integration" doc (2026-08-25). Deliberately
// separate from radio_places/wifi_signatures/cell_signatures: this is weak,
// inferred evidence (step-counter + compass), never proof, and must never be
// able to move an AP's canonical location or affect route_eligible. Nothing
// in this module writes to those tables - that isolation is structural, not
// just a rule.
//
// Only *accepted* reports are stored - the endpoint contract requires hard
// 4xx rejection (not a soft accepted:false row) for anything that fails
// validation, so there's no rejection data to persist here. Dashboards for
// accepted/rejected rates are future ops work, not required for this phase.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('radio_inferred_trajectories', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      request_id: { type: Sequelize.STRING(60), allowNull: false, unique: true },
      installation_id: { type: Sequelize.STRING(100), allowNull: false },
      captured_at: { type: Sequelize.DATE, allowNull: false },
      received_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },

      // The one real GNSS-backed observation this trajectory point is allowed
      // to reference - resolved server-side, never trusted from the client's
      // own claimed anchor coordinates (the client doesn't even send anchor
      // lat/lng on this endpoint, only metadata used to find the real record).
      anchor_observation_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'radio_observations', key: 'id' }, onDelete: 'CASCADE' },
      anchor_captured_at: { type: Sequelize.DATE, allowNull: false },
      anchor_accuracy_m: { type: Sequelize.DOUBLE, allowNull: false },
      anchor_age_ms: { type: Sequelize.INTEGER, allowNull: false },
      anchor_source: { type: Sequelize.STRING(30), allowNull: false },

      latitude: { type: Sequelize.DOUBLE, allowNull: false },
      longitude: { type: Sequelize.DOUBLE, allowNull: false },
      horizontal_uncertainty_m: { type: Sequelize.DOUBLE, allowNull: false },

      distance_since_anchor_m: { type: Sequelize.DOUBLE, allowNull: false },
      steps_since_anchor: { type: Sequelize.INTEGER, allowNull: false },
      heading_deg: { type: Sequelize.DOUBLE, allowNull: false },
      heading_accuracy_deg: { type: Sequelize.DOUBLE, allowNull: false },

      // Tokenized the same way as everything else in the positioning module -
      // never raw BSSIDs. Kept inline as JSONB rather than child tables since
      // this data is read in bulk for offline analysis, never joined per-row.
      wifi_evidence: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      cell_evidence: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      wifi_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      cell_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },

      // Reserved for a future probabilistic resolver that scores trajectories
      // against subsequent GNSS anchors - unused/NULL until that's built.
      resolver_place_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'radio_places', key: 'id' }, onDelete: 'SET NULL' },
      resolver_confidence: { type: Sequelize.DOUBLE, allowNull: true },

      // See radioObservation/anchorEvidence models for why this must be
      // declared explicitly on the model too - Sequelize.NOW as a
      // createTable defaultValue doesn't produce a real DB-level default.
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.addIndex('radio_inferred_trajectories', ['installation_id', 'captured_at']);
    await queryInterface.addIndex('radio_inferred_trajectories', ['anchor_observation_id']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('radio_inferred_trajectories');
  },
};
