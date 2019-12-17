const router = module.exports = require('express').Router();

router.use('/prescriptions', require('./prescriptions'));
router.use('/pharmacies', require('./pharmacies'));
router.use('/login', require('./login'));
router.use('/users', require('./users'));