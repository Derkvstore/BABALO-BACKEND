// backend/specialOrdersStats.js
const express = require('express');
const router = express.Router();
const { pool } = require('./db');

router.get('/', async (req, res) => {
  try {
    const statsQuery = `
      SELECT
        COUNT(*) FILTER (WHERE statut = 'en_attente') AS total_en_attente,
        COUNT(*) FILTER (WHERE statut = 'commandé') AS total_commandé,
        COUNT(*) FILTER (WHERE statut = 'reçu') AS total_reçu,
        COUNT(*) FILTER (WHERE statut = 'vendu') AS total_vendu,
        COUNT(*) FILTER (WHERE statut = 'annulé') AS total_annulé,
        COUNT(*) FILTER (WHERE statut = 'remplacé') AS total_remplacé,
        COUNT(*) FILTER (WHERE statut = 'paiement_partiel') AS total_paiement_partiel
      FROM special_orders;
    `;
    const statsResult = await pool.query(statsQuery);
    const stats = statsResult.rows[0];
    res.status(200).json(stats);
  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques des commandes spéciales:', error);
    res.status(500).json({ error: 'Erreur serveur lors de la récupération des statistiques.' });
  }
});

module.exports = router;