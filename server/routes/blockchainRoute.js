const express = require('express');

const { getNetwork, getBalance, readContract } = require('../controllers/blockchainController');

const router = express.Router();

router.get('/network', getNetwork);

router.get('/balance/:address', getBalance);

router.post('/contract/read', readContract);

module.exports = router;
