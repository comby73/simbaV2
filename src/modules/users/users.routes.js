const express = require('express');
const router = express.Router();
const usersController = require('./users.controller');
const { authenticate, authorize, isAdmin } = require('../../shared/middleware');

router.use(authenticate);

// Roles
router.get('/roles', usersController.getRoles);

// Usuarios
router.get('/', authorize('admin'), usersController.getAll);
router.get('/:id', authorize('admin'), usersController.getById);
router.post('/', isAdmin, usersController.create);
router.put('/:id', isAdmin, usersController.update);
router.post('/:id/reset-password', isAdmin, usersController.resetPassword);

module.exports = router;
