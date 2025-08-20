// backend/specialOrders.js
const express = require('express');
const router = express.Router();
const { pool } = require('./db'); // Assurez-vous que le chemin vers db est correct

// Route pour récupérer toutes les commandes spéciales avec les noms du client et du fournisseur
router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT
          so.id AS order_id,
          so.marque,
          so.modele,
          so.stockage,
          so.type,
          so.type_carton,
          so.imei,
          so.prix_achat_fournisseur,
          so.prix_vente_client,
          so.montant_paye,
          so.montant_restant,
          so.date_commande,
          so.statut,
          so.raison_annulation,
          so.date_statut_change,
          so.date_statut_change AS date_vente, -- ➡️ MODIFICATION: Permet au front-end de calculer le bénéfice par date de vente
          c.nom AS client_nom,
          c.telephone AS client_telephone,
          f.nom AS fournisseur_nom
      FROM
          special_orders so
      JOIN
          clients c ON so.client_id = c.id
      JOIN
          fournisseurs f ON so.fournisseur_id = f.id
      ORDER BY
          so.date_commande DESC;
    `;
    const result = await pool.query(query);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Erreur lors de la récupération des commandes spéciales:', error);
    res.status(500).json({ error: 'Erreur serveur lors de la récupération des commandes spéciales.' });
  }
});

// Route pour créer une nouvelle commande spéciale
router.post('/', async (req, res) => {
  const {
    client_nom,
    fournisseur_nom,
    marque,
    modele,
    stockage,
    type,
    type_carton,
    imei,
    prix_achat_fournisseur,
    prix_vente_client,
    montant_paye = 0
  } = req.body;

  let clientDb;

  if (!client_nom || !fournisseur_nom || !marque || !modele || !type || !prix_achat_fournisseur || !prix_vente_client) {
    return res.status(400).json({ error: 'Des informations obligatoires sont manquantes pour la commande spéciale.' });
  }

  try {
    clientDb = await pool.connect();
    await clientDb.query('BEGIN');

    // Récupérer l'ID du client
    const clientResult = await clientDb.query('SELECT id FROM clients WHERE nom = $1', [client_nom]);
    if (clientResult.rows.length === 0) {
      await clientDb.query('ROLLBACK');
      return res.status(404).json({ error: `Client "${client_nom}" non trouvé.` });
    }
    const clientId = clientResult.rows[0].id;

    // Récupérer l'ID du fournisseur
    const fournisseurResult = await clientDb.query('SELECT id FROM fournisseurs WHERE nom = $1', [fournisseur_nom]);
    if (fournisseurResult.rows.length === 0) {
      await clientDb.query('ROLLBACK');
      return res.status(404).json({ error: `Fournisseur "${fournisseur_nom}" non trouvé.` });
    }
    const fournisseurId = fournisseurResult.rows[0].id;

    const parsedPrixVenteClient = parseFloat(prix_vente_client);
    const parsedMontantPaye = parseFloat(montant_paye);

    // Calculer le montant restant dû
    const montantRestant = parsedPrixVenteClient - parsedMontantPaye;

    // Déterminer le statut initial de la commande
    let initialStatut = 'en_attente';
    if (parsedMontantPaye >= parsedPrixVenteClient) {
        initialStatut = 'vendu';
    } else if (parsedMontantPaye > 0) {
        initialStatut = 'paiement_partiel';
    }


    // Insérer la nouvelle commande spéciale
    const newOrderResult = await clientDb.query(
      `INSERT INTO special_orders (
        client_id, fournisseur_id, marque, modele, stockage, type, type_carton, imei,
        prix_achat_fournisseur, prix_vente_client, montant_paye, montant_restant, date_commande, statut, date_statut_change
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), $13, NOW()) RETURNING id`,
      [
        clientId, fournisseurId, marque, modele, stockage, type, type_carton, imei,
        prix_achat_fournisseur, parsedPrixVenteClient, parsedMontantPaye, montantRestant, initialStatut
      ]
    );
    const newOrderId = newOrderResult.rows[0].id;

    await clientDb.query('COMMIT');
    res.status(201).json({ message: 'Commande spéciale enregistrée avec succès!', order_id: newOrderId });

  } catch (error) {
    if (clientDb) await clientDb.query('ROLLBACK');
    console.error('Erreur lors de l\'enregistrement de la commande spéciale:', error);
    res.status(500).json({ error: 'Erreur serveur lors de l\'enregistrement de la commande spéciale.' });
  } finally {
    if (clientDb) clientDb.release();
  }
});

// Route pour mettre à jour le statut d'une commande spéciale
router.put('/:id/update-status', async (req, res) => {
  const orderId = req.params.id;
  const { statut, raison_annulation } = req.body;

  if (!statut) {
    return res.status(400).json({ error: 'Le statut est requis pour la mise à jour.' });
  }

  let clientDb;
  try {
    clientDb = await pool.connect();
    await clientDb.query('BEGIN');

    const updateQuery = `
      UPDATE special_orders
      SET statut = $1, raison_annulation = $2, date_statut_change = NOW()
      WHERE id = $3 RETURNING *;
    `;
    const result = await clientDb.query(updateQuery, [statut, raison_annulation || null, orderId]);

    if (result.rows.length === 0) {
      await clientDb.query('ROLLBACK');
      return res.status(404).json({ error: 'Commande spéciale non trouvée.' });
    }

    await clientDb.query('COMMIT');
    res.status(200).json({ message: 'Statut de la commande spéciale mis à jour avec succès.', updatedOrder: result.rows[0] });

  } catch (error) {
    if (clientDb) await clientDb.query('ROLLBACK');
    console.error('Erreur lors de la mise à jour du statut de la commande spéciale:', error);
    res.status(500).json({ error: 'Erreur serveur lors de la mise à jour du statut de la commande spéciale.' });
  } finally {
    if (clientDb) clientDb.release();
  }
});

// NOUVELLE ROUTE : PUT /api/special-orders/:id/update-payment
router.put('/:id/update-payment', async (req, res) => {
  const orderId = req.params.id;
  const { new_montant_paye } = req.body;

  let clientDb;

  try {
    clientDb = await pool.connect();
    await clientDb.query('BEGIN');

    const currentOrderResult = await clientDb.query(
      'SELECT prix_vente_client, montant_paye FROM special_orders WHERE id = $1 FOR UPDATE',
      [orderId]
    );

    if (currentOrderResult.rows.length === 0) {
      await clientDb.query('ROLLBACK');
      return res.status(404).json({ error: 'Commande spéciale non trouvée.' });
    }

    const { prix_vente_client, montant_paye: currentMontantPaye } = currentOrderResult.rows[0];
    const parsedPrixVenteClient = parseFloat(prix_vente_client);
    const parsedNewMontantPaye = parseFloat(new_montant_paye);

    if (isNaN(parsedNewMontantPaye) || parsedNewMontantPaye < 0) {
      await clientDb.query('ROLLBACK');
      return res.status(400).json({ error: 'Le montant payé doit être un nombre positif ou zéro.' });
    }

    if (parsedNewMontantPaye > parsedPrixVenteClient) {
      await clientDb.query('ROLLBACK');
      return res.status(400).json({ error: `Le montant payé (${parsedNewMontantPaye}) ne peut pas être supérieur au prix de vente de la commande (${parsedPrixVenteClient}).` });
    }

    const newMontantRestant = parsedPrixVenteClient - parsedNewMontantPaye;

    let newStatut = 'paiement_partiel';
    if (parsedNewMontantPaye >= parsedPrixVenteClient) {
      newStatut = 'vendu';
    } else if (parsedNewMontantPaye === 0) {
      newStatut = 'en_attente';
    }

    const updateResult = await clientDb.query(
      `UPDATE special_orders
       SET montant_paye = $1, montant_restant = $2, statut = $3, date_statut_change = NOW()
       WHERE id = $4 RETURNING *`,
      [parsedNewMontantPaye, newMontantRestant, newStatut, orderId]
    );

    await clientDb.query('COMMIT');
    res.status(200).json({ message: 'Paiement de la commande spéciale mis à jour avec succès.', updatedOrder: updateResult.rows[0] });

  } catch (error) {
    if (clientDb) await clientDb.query('ROLLBACK');
    console.error('Erreur lors de la mise à jour du paiement de la commande spéciale:', error);
    res.status(500).json({ error: 'Erreur serveur lors de la mise à jour du paiement de la commande spéciale contacter Derkv 😄.' });
  } finally {
    if (clientDb) clientDb.release();
  }
});


module.exports = router;