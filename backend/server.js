/**
 * Pixel & Code — backend/server.js
 * -----------------------------------------------------------------------
 * Serveur Express qui :
 *  1. Sert les fichiers statiques du front-end (index.html, css/, js/)
 *  2. Expose une API POST /api/contact qui valide, envoie un email (si SMTP
 *     est configuré) et sauvegarde chaque demande dans backend/data/submissions.json
 *  3. Applique des protections de base : Helmet, CORS, rate limiting.
 *
 * Démarrage :
 *   cd backend
 *   npm install
 *   cp .env.example .env   # puis renseigner les identifiants SMTP
 *   npm start
 *
 * Sans configuration SMTP, le serveur fonctionne quand même : les messages
 * sont simplement enregistrés dans data/submissions.json et affichés dans
 * la console (mode "développement").
 * -----------------------------------------------------------------------
 */

require('dotenv').config();

const path = require('path');
const fs = require('fs/promises');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_DIR = path.join(__dirname, '..');
const DATA_FILE = path.join(__dirname, 'data', 'submissions.json');

/* -------------------------------------------------------------------- */
/*  Middlewares de sécurité / base                                      */
/* -------------------------------------------------------------------- */

app.use(helmet({
  // Autorise le CSS/JS externe (Google Fonts) chargé par index.html
  contentSecurityPolicy: false,
}));
app.use(cors());
app.use(express.json({ limit: '20kb' }));

// Sert le front-end (index.html, /css, /js) directement depuis la racine du projet
app.use(express.static(FRONTEND_DIR));

/* -------------------------------------------------------------------- */
/*  Rate limiting sur l'API de contact (anti-spam basique)               */
/* -------------------------------------------------------------------- */

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,                   // 5 tentatives / IP / fenêtre
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "Trop de tentatives. Merci de réessayer dans quelques minutes.",
  },
});

/* -------------------------------------------------------------------- */
/*  Transport email (optionnel, dépend des variables d'environnement)    */
/* -------------------------------------------------------------------- */

function buildTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return null; // pas de config SMTP -> mode "log uniquement"
  }
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true', // true pour le port 465
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

const transporter = buildTransporter();

/* -------------------------------------------------------------------- */
/*  Validation                                                          */
/* -------------------------------------------------------------------- */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PROJECT_TYPES = new Set(['web', 'jeu', 'debug', 'audit', 'autre']);

function validateContactPayload(body) {
  const errors = [];
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const projectType = String(body['project-type'] || '').trim();
  const message = String(body.message || '').trim();
  const detailLevel = Number(body['detail-level']);

  if (name.length < 2 || name.length > 100) {
    errors.push("Le nom doit contenir entre 2 et 100 caractères.");
  }
  if (!EMAIL_REGEX.test(email)) {
    errors.push("L'adresse email n'est pas valide.");
  }
  if (!PROJECT_TYPES.has(projectType)) {
    errors.push("Le type de projet sélectionné n'est pas valide.");
  }
  if (message.length < 10 || message.length > 4000) {
    errors.push("Le message doit contenir entre 10 et 4000 caractères.");
  }

  return {
    errors,
    data: {
      name,
      email,
      projectType,
      message,
      detailLevel: Number.isFinite(detailLevel) ? detailLevel : null,
    },
  };
}

/* -------------------------------------------------------------------- */
/*  Sauvegarde de secours (fichier JSON)                                */
/* -------------------------------------------------------------------- */

async function appendSubmission(entry) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });

  let existing = [];
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    existing = JSON.parse(raw);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  existing.push(entry);
  await fs.writeFile(DATA_FILE, JSON.stringify(existing, null, 2), 'utf-8');
}

/* -------------------------------------------------------------------- */
/*  Route API : POST /api/contact                                       */
/* -------------------------------------------------------------------- */

app.post('/api/contact', contactLimiter, async (req, res) => {
  const { errors, data } = validateContactPayload(req.body);

  if (errors.length > 0) {
    return res.status(400).json({ ok: false, error: errors.join(' ') });
  }

  const submission = {
    ...data,
    receivedAt: new Date().toISOString(),
    ip: req.ip,
  };

  // 1. Sauvegarde locale (toujours effectuée, même si l'email échoue)
  try {
    await appendSubmission(submission);
  } catch (err) {
    console.error('[contact] Échec de la sauvegarde locale :', err);
  }

  // 2. Envoi d'email si un transport SMTP est configuré
  if (transporter) {
    try {
      await transporter.sendMail({
        from: `"Pixel & Code — Formulaire" <${process.env.SMTP_USER}>`,
        to: process.env.CONTACT_TO_EMAIL || process.env.SMTP_USER,
        replyTo: data.email,
        subject: `Nouvelle demande — ${data.projectType} — ${data.name}`,
        text: [
          `Nom : ${data.name}`,
          `Email : ${data.email}`,
          `Type de projet : ${data.projectType}`,
          `Niveau de détail souhaité : ${data.detailLevel ?? 'n/a'}`,
          '',
          'Message :',
          data.message,
        ].join('\n'),
      });
    } catch (err) {
      console.error('[contact] Échec de l\'envoi email :', err);
      // La demande est déjà sauvegardée localement : on informe l'utilisateur
      // que le message est bien reçu, tout en loggant l'erreur d'envoi.
      return res.status(200).json({
        ok: true,
        warning: "Demande enregistrée, mais l'envoi de l'email de notification a échoué.",
      });
    }
  } else {
    console.log('[contact] SMTP non configuré — demande enregistrée localement uniquement :', submission);
  }

  return res.status(200).json({ ok: true });
});

/* -------------------------------------------------------------------- */
/*  Route de santé (utile pour un déploiement / monitoring)              */
/* -------------------------------------------------------------------- */

app.get('/api/health', (req, res) => {
  res.json({ ok: true, smtpConfigured: Boolean(transporter) });
});

/* -------------------------------------------------------------------- */
/*  Démarrage                                                            */
/* -------------------------------------------------------------------- */

app.listen(PORT, () => {
  console.log(`serveur lancé sur http://localhost:${PORT}`);
  console.log(`SMTP configuré : ${transporter ? 'oui' : 'non (mode log uniquement)'}`);
});
