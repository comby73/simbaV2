const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { authenticate } = require('../../shared/middleware');

// Rutas públicas
router.post('/login', authController.login);

// Rutas protegidas
router.get('/profile', authenticate, authController.getProfile);
router.post('/change-password', authenticate, authController.changePassword);
router.get('/verify', authenticate, authController.verifyToken);

module.exports = router;
