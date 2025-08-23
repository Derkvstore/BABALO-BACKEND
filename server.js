const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();

const { pool } = require('./db');
const { registerUser, loginUser } = require('./auth');

const clientsRoutes = require('./clients');
const productRoutes = require('./products');
const ventesRoutes = require('./ventes');
const reportsRouter = require('./reports');
const returnsRouter = require('./returns');
const remplacerRouter = require('./remplacements');
const fournisseursRoutes = require('./fournisseurs');
const facturesRoutes = require('./factures');
const specialOrdersRoutes = require('./specialOrders');

const app = express();
const PORT = process.env.PORT || 3001;

// ✅ CORS autorisé pour Railway Front + localhost et ton site Vercel
const allowedOrigins = [
     'https://babalo-backend-production.up.railway.app',
    'https://applebko.vercel.app',
    'http://localhost:5173'
];

// ✅ Middleware CORS propre
app.use(cors({
  origin: function (origin, callback) {
    console.log('CORS origin:', origin);
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));


// ✅ Parser JSON
app.use(express.json());

/* --- ROUTES --- */

// Auth
app.post('/api/login', loginUser);
app.post('/api/register', registerUser);

// Routes principales
app.use('/api/clients', clientsRoutes);
app.use('/api/products', productRoutes);
app.use('/api/ventes', ventesRoutes);
app.use('/api/reports', reportsRouter);
app.use('/api/returns', returnsRouter);
app.use('/api/remplacements', remplacerRouter);
app.use('/api/fournisseurs', fournisseursRoutes);
app.use('/api/factures', facturesRoutes);
app.use('/api/special-orders', specialOrdersRoutes);

// Route pour les statistiques des commandes spéciales (nouvelle route)
app.get('/api/special-orders-stats', async (req, res) => {
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


// Route bénéfices
app.get('/api/benefices', async (req, res) => {
  try {
    let query = `
      SELECT
          vi.id AS vente_item_id,
          vi.marque,
          vi.modele,
          vi.stockage,
          vi.type,
          vi.type_carton,
          vi.imei,
          vi.prix_unitaire_achat,
          vi.prix_unitaire_vente,
          vi.quantite_vendue,
          (vi.prix_unitaire_vente - vi.prix_unitaire_achat) AS benefice_unitaire_produit,
          (vi.quantite_vendue * (vi.prix_unitaire_vente - vi.prix_unitaire_achat)) AS benefice_total_par_ligne,
          v.date_vente
      FROM
          vente_items vi
      JOIN
          ventes v ON vi.vente_id = v.id
      WHERE
          vi.statut_vente = 'actif'
          AND v.statut_paiement = 'payee_integralement'
    `;

    const queryParams = [];
    let paramIndex = 1;

    const { date } = req.query;

    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'Format de date invalide. Utilisez YYYY-MM-DD.' });
      }

      query += ` AND DATE(v.date_vente) = $${paramIndex}`;
      queryParams.push(date);
      paramIndex++;
    }

    query += ` ORDER BY v.date_vente DESC;`;

    const itemsResult = await pool.query(query, queryParams);
    const soldItems = itemsResult.rows;

    let totalBeneficeGlobal = 0;
    soldItems.forEach(item => {
      totalBeneficeGlobal += parseFloat(item.benefice_total_par_ligne);
    });

    res.json({
      sold_items: soldItems,
      total_benefice_global: parseFloat(totalBeneficeGlobal)
    });

  } catch (err) {
    console.error('Erreur lors du calcul des bénéfices:', err);
    res.status(500).json({ error: 'Erreur interne du serveur lors du calcul des bénéfices.' });
  }
});

/* --- DÉMARRAGE DU SERVEUR --- */
app.listen(PORT, () => {
  console.log('✅ Connexion à la base de données réussie');
  console.log(`🚀 Serveur backend lancé sur le port ${PORT}`);
});