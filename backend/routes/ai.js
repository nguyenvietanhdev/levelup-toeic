// ===================================
// AI ROUTES
// ===================================

const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');

// ===================================
// PUBLIC AI ROUTES
// ===================================

// Explain word
router.post('/explain', aiController.explainWord);

// Generate questions
router.post('/generate-questions', aiController.generateQuestions);

// Check grammar
router.post('/check-grammar', aiController.checkGrammar);

// Translate sentence
router.post('/translate', aiController.translateSentence);

// Lookup word information (auto-fill vocabulary form)
router.post('/lookup-word', aiController.lookupWord);

// ===================================
// PRIVATE AI ROUTES (Optional - require login)
// ===================================

// Chat with AI tutor (public - no login required)
router.post('/chat', aiController.chatWithTutor);

module.exports = router;